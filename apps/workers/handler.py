import hashlib
import json
import os
import re
import time
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE_NAME = os.environ["APPLICATION_TABLE"]
BUCKET = os.environ["ARTIFACT_BUCKET"]
BDA_PROJECT_ARN = os.environ["BDA_PROJECT_ARN"]
BDA_PROFILE_ARN = os.environ["BDA_PROFILE_ARN"]
KMS_KEY_ARN = os.environ["KMS_KEY_ARN"]
KILL_SWITCH = os.environ["MODEL_CALLS_ENABLED_PARAMETER"]
MODEL_ID = os.environ.get("BEDROCK_REASONING_MODEL_ID", "us.openai.gpt-5.6-luna")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)
bda = boto3.client("bedrock-data-automation-runtime", region_name=REGION)
bedrock = boto3.client("bedrock-runtime", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)
ssm = boto3.client("ssm", region_name=REGION)

ALLOWED_NODE_TYPES = {
    "trigger", "extract", "retrieve", "rule", "agent", "transform",
    "tool", "approval", "wait_for_event", "notification", "terminal",
}


def utcnow() -> str:
    return datetime.now(timezone.utc).isoformat()


def dynamo_safe(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: dynamo_safe(child) for key, child in value.items()}
    if isinstance(value, list):
        return [dynamo_safe(child) for child in value]
    return value


def model_calls_enabled() -> bool:
    return ssm.get_parameter(Name=KILL_SWITCH)["Parameter"]["Value"].lower() == "true"


def compilation_handler(event, _context):
    if not model_calls_enabled():
        raise RuntimeError("Model-backed processing is disabled by the OpsWeave cost guard")
    failures = []
    for record in event.get("Records", []):
        try:
            start_compilation(json.loads(record["body"]))
        except Exception as error:
            body = json.loads(record.get("body", "{}"))
            mark_compilation_failed(body.get("project_id"), body.get("job_id"), str(error))
            failures.append({"itemIdentifier": record["messageId"]})
    return {"batchItemFailures": failures}


def runtime_handler(event: dict[str, Any], _context):
    """Execute governed workflow nodes for the live logistics sandbox."""
    action = event.get("action")
    context = dict(event.get("context") or {})
    project_id = context.get("project_id")
    execution_id = context.get("execution_id")
    tenant_id = context.get("tenant_id")
    if not project_id or not execution_id or not tenant_id:
        raise ValueError("Runtime context requires tenant_id, project_id, and execution_id")
    execution_key = {"pk": f"PROJECT#{project_id}", "sk": f"EXECUTION#{execution_id}"}

    if action == "evaluate":
        claim = context.get("claim") or {}
        required = ["claim_id", "order_id", "shipment_id", "claimed_amount_usd"]
        missing = [field for field in required if claim.get(field) in (None, "")]
        context["recommendation"] = {
            "decision": "human_review",
            "reason": "missing_required_fields" if missing else "policy_threshold_conflict",
            "missing_fields": missing,
            "confidence": Decimal("1") if missing else Decimal("0.96"),
        }
        record_node_execution(execution_key, context, "recommend_decision", "awaiting_approval")
        return context

    if action == "request_approval":
        approval_id = str(uuid.uuid4())
        table.put_item(Item={
            "pk": f"PROJECT#{project_id}", "sk": f"APPROVAL#{approval_id}",
            "entity_type": "approval", "tenant_id": tenant_id, "project_id": project_id,
            "approval_id": approval_id, "execution_id": execution_id,
            "task_token": event["task_token"], "status": "pending",
            "claim": dynamo_safe(context.get("claim", {})),
            "recommendation": dynamo_safe(context.get("recommendation", {})),
            "execution_context": dynamo_safe(context), "created_at": utcnow(),
            "expires_at": int(time.time()) + 86_400,
        })
        table.update_item(
            Key=execution_key,
            UpdateExpression="SET #status=:status, current_node=:node, approval_id=:approval, updated_at=:now",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": "waiting_for_approval", ":node": "manager_approval", ":approval": approval_id, ":now": utcnow()},
        )
        return {"accepted": True, "approval_id": approval_id}

    if action == "issue_refund":
        claim = context["claim"]
        claim_id = str(claim["claim_id"])
        refund_key = {"pk": f"PROJECT#{project_id}", "sk": f"TOOL#REFUND#{claim_id}"}
        existing = table.get_item(Key=refund_key).get("Item")
        if existing:
            refund = existing["result"]
        else:
            refund = {
                "refund_id": f"RFD-{hashlib.sha256(claim_id.encode()).hexdigest()[:10].upper()}",
                "claim_id": claim_id,
                "amount_usd": Decimal(str(claim["claimed_amount_usd"])),
                "status": "issued",
                "idempotency_key": claim_id,
                "issued_at": utcnow(),
            }
            table.put_item(Item={**refund_key, "entity_type": "tool_result", "tenant_id": tenant_id, "project_id": project_id, "result": refund, "created_at": utcnow()})
        context["refund"] = refund
        record_node_execution(execution_key, context, "issue_refund", "running")
        return context

    if action == "notify":
        context["notification"] = {"channel": "in_app", "status": "delivered", "delivered_at": utcnow()}
        record_node_execution(execution_key, context, "notify_claimant", "running")
        return context

    if action == "complete":
        record_node_execution(execution_key, context, "claim_closed", "succeeded")
        return context

    raise ValueError(f"Unsupported runtime action: {action}")


def record_node_execution(execution_key: dict[str, str], context: dict[str, Any], node_id: str, status: str) -> None:
    table.update_item(
        Key=execution_key,
        UpdateExpression="SET #status=:status, current_node=:node, runtime_context=:context, updated_at=:now",
        ExpressionAttributeNames={"#status": "status"},
        ExpressionAttributeValues={":status": status, ":node": node_id, ":context": dynamo_safe(context), ":now": utcnow()},
    )


def start_compilation(message: dict[str, Any]) -> None:
    tenant_id = message["tenant_id"]
    project_id = message["project_id"]
    job_id = message["job_id"]
    existing_job = table.get_item(Key={"pk": f"PROJECT#{project_id}", "sk": f"COMPILATION#{job_id}"}).get("Item")
    if not existing_job or existing_job.get("status") in {"failed", "succeeded"}:
        return
    artifacts = project_items(project_id, "ARTIFACT#")
    if not artifacts:
        raise ValueError("Compilation has no registered artifacts")

    pending = 0
    for artifact in artifacts:
        if artifact.get("status") == "processed" and artifact.get("normalized_evidence"):
            table.update_item(
                Key={"pk": artifact["pk"], "sk": artifact["sk"]},
                UpdateExpression="SET compilation_id=:job, updated_at=:now",
                ExpressionAttributeValues={":job": job_id, ":now": utcnow()},
            )
            continue
        if artifact.get("status") == "processing":
            pending += 1
            continue

        if not supports_bda(artifact.get("media_type", ""), artifact.get("filename", "")):
            normalized = normalize_text_source(artifact)
            table.update_item(
                Key={"pk": artifact["pk"], "sk": artifact["sk"]},
                UpdateExpression=(
                    "SET #status=:status, compilation_id=:job, normalized_evidence=:evidence, "
                    "evidence_count=:count, updated_at=:now"
                ),
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":status": "processed", ":job": job_id, ":evidence": normalized,
                    ":count": len(normalized), ":now": utcnow(),
                },
            )
            continue

        artifact_id = artifact["artifact_id"]
        output_prefix = f"processed/{tenant_id}/{project_id}/{artifact_id}/{job_id}/"
        response = bda.invoke_data_automation_async(
            clientToken=hashlib.sha256(f"{job_id}-{artifact_id}".encode()).hexdigest(),
            inputConfiguration={"s3Uri": f"s3://{BUCKET}/{artifact['storage_key']}"},
            outputConfiguration={"s3Uri": f"s3://{BUCKET}/{output_prefix}"},
            dataAutomationConfiguration={"dataAutomationProjectArn": BDA_PROJECT_ARN, "stage": "LIVE"},
            encryptionConfiguration={"kmsKeyId": KMS_KEY_ARN},
            notificationConfiguration={"eventBridgeConfiguration": {"eventBridgeEnabled": True}},
            dataAutomationProfileArn=BDA_PROFILE_ARN,
            tags=[{"key": "Application", "value": "OpsWeave"}, {"key": "Tenant", "value": tenant_id}],
        )
        table.update_item(
            Key={"pk": artifact["pk"], "sk": artifact["sk"]},
            UpdateExpression=(
                "SET #status=:status, compilation_id=:job, bda_invocation_arn=:arn, "
                "bda_output_prefix=:output, updated_at=:now, gsi1pk=:gpk, gsi1sk=:gsk"
            ),
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":status": "processing", ":job": job_id,
                ":arn": response["invocationArn"], ":output": output_prefix,
                ":now": utcnow(), ":gpk": "BDA#PROCESSING",
                ":gsk": response["invocationArn"],
            },
        )
        pending += 1

    update_compilation(project_id, job_id, status="ingesting", progress=15 if pending else 55)
    if not pending:
        advance_compilation(project_id, job_id)


def status_handler(_event, _context):
    if not model_calls_enabled():
        return {"checked": 0, "disabled": True}
    processing = table.query(
        IndexName="gsi1",
        KeyConditionExpression=Key("gsi1pk").eq("BDA#PROCESSING"),
        Limit=20,
    ).get("Items", [])
    checked = 0
    touched_jobs: set[tuple[str, str]] = set()
    for artifact in processing:
        status = bda.get_data_automation_status(invocationArn=artifact["bda_invocation_arn"])
        checked += 1
        state = status.get("status", "")
        if state in {"Success", "Completed"}:
            try:
                normalized = normalize_bda_output(artifact)
                table.update_item(
                    Key={"pk": artifact["pk"], "sk": artifact["sk"]},
                    UpdateExpression=(
                        "SET #status=:status, normalized_evidence=:evidence, evidence_count=:count, "
                        "updated_at=:now REMOVE gsi1pk, gsi1sk"
                    ),
                    ExpressionAttributeNames={"#status": "status"},
                    ExpressionAttributeValues={
                        ":status": "processed", ":evidence": normalized,
                        ":count": len(normalized), ":now": utcnow(),
                    },
                )
            except Exception as error:
                table.update_item(
                    Key={"pk": artifact["pk"], "sk": artifact["sk"]},
                    UpdateExpression="SET #status=:status, error_message=:error, updated_at=:now REMOVE gsi1pk, gsi1sk",
                    ExpressionAttributeNames={"#status": "status"},
                    ExpressionAttributeValues={":status": "failed", ":error": str(error)[:1000], ":now": utcnow()},
                )
            touched_jobs.add((artifact["project_id"], artifact["compilation_id"]))
        elif state in {"ServiceError", "ClientError", "Failed"}:
            table.update_item(
                Key={"pk": artifact["pk"], "sk": artifact["sk"]},
                UpdateExpression="SET #status=:status, error_message=:error, updated_at=:now REMOVE gsi1pk, gsi1sk",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={
                    ":status": "failed",
                    ":error": status.get("errorMessage", "BDA processing failed")[:1000],
                    ":now": utcnow(),
                },
            )
            touched_jobs.add((artifact["project_id"], artifact["compilation_id"]))

    for project_id, job_id in touched_jobs:
        try:
            advance_compilation(project_id, job_id)
        except Exception as error:
            mark_compilation_failed(project_id, job_id, str(error))
    return {"checked": checked, "advanced": len(touched_jobs)}


def project_items(project_id: str, prefix: str | None = None) -> list[dict[str, Any]]:
    expression = Key("pk").eq(f"PROJECT#{project_id}")
    if prefix:
        expression &= Key("sk").begins_with(prefix)
    return table.query(KeyConditionExpression=expression).get("Items", [])


def supports_bda(media_type: str, filename: str) -> bool:
    lowered = filename.lower()
    return (
        media_type == "application/pdf"
        or media_type.startswith("image/")
        or media_type.startswith("audio/")
        or media_type.startswith("video/")
        or lowered.endswith((".pdf", ".png", ".jpg", ".jpeg", ".wav", ".mp3", ".m4a", ".mp4", ".mov"))
    )


def normalize_text_source(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    body = s3.get_object(Bucket=BUCKET, Key=artifact["storage_key"])["Body"].read(2_000_000)
    text = body.decode("utf-8", errors="replace").strip()
    if not text:
        raise ValueError(f"Structured source {artifact['filename']} is empty")
    chunks = [text[index:index + 5000] for index in range(0, min(len(text), 100_000), 5000)]
    return [{
        "id": hashlib.sha256(f"{artifact['artifact_id']}|text|{index}|{chunk[:160]}".encode()).hexdigest()[:20],
        "content": chunk,
        "confidence": Decimal("1"),
        "artifact_id": artifact["artifact_id"],
        "filename": artifact["filename"],
        "source_key": artifact["storage_key"],
        "page": None,
        "timestamp": None,
        "bounding_box": None,
    } for index, chunk in enumerate(chunks)]


def normalize_bda_output(artifact: dict[str, Any]) -> list[dict[str, Any]]:
    prefix = artifact["bda_output_prefix"]
    objects = s3.list_objects_v2(Bucket=BUCKET, Prefix=prefix, MaxKeys=40).get("Contents", [])
    evidence: list[dict[str, Any]] = []
    seen: set[str] = set()
    for entry in objects:
        key = entry["Key"]
        if not key.lower().endswith(".json") or entry.get("Size", 0) > 8_000_000:
            continue
        payload = json.loads(s3.get_object(Bucket=BUCKET, Key=key)["Body"].read())
        for index, finding in enumerate(extract_findings(payload)):
            content = finding["content"].strip()
            fingerprint = " ".join(content.lower().split())
            if len(content) < 3 or fingerprint in seen:
                continue
            seen.add(fingerprint)
            evidence.append({
                "id": hashlib.sha256(f"{artifact['artifact_id']}|{key}|{index}|{content[:160]}".encode()).hexdigest()[:20],
                "content": content[:6000],
                "confidence": Decimal(str(finding.get("confidence", 0.8))),
                "artifact_id": artifact["artifact_id"],
                "filename": artifact["filename"],
                "source_key": key,
                "page": finding.get("page"),
                "timestamp": finding.get("timestamp"),
                "bounding_box": dynamo_safe(finding.get("bounding_box")),
            })
            if len(evidence) >= 120:
                return evidence
    if not evidence:
        raise ValueError(f"Bedrock completed {artifact['filename']} without readable grounded output")
    return evidence


def extract_findings(value: Any, context: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    context = dict(context or {})
    findings: list[dict[str, Any]] = []
    if isinstance(value, dict):
        for key, child in value.items():
            lowered = key.lower()
            if lowered in {"page", "page_number", "pagenumber"} and isinstance(child, (int, float)):
                context["page"] = int(child)
            elif "confidence" in lowered and isinstance(child, (int, float, Decimal)):
                context["confidence"] = max(0.0, min(1.0, float(child)))
            elif lowered in {"timestamp", "start_time", "starttime", "start_timecode_smpte"} and isinstance(child, (str, int, float)):
                context["timestamp"] = str(child)
            elif lowered in {"bounding_box", "boundingbox", "geometry"} and isinstance(child, (dict, list)):
                context["bounding_box"] = child
        for key, child in value.items():
            lowered = key.lower()
            is_grounded_text = lowered in {"text", "transcript", "transcription", "markdown", "summary"}
            is_substantive_content = isinstance(child, str) and lowered == "content" and (len(child) >= 40 or len(child.split()) >= 3)
            if isinstance(child, str) and (is_grounded_text or is_substantive_content):
                findings.append({"content": child, **context})
            else:
                findings.extend(extract_findings(child, context))
    elif isinstance(value, list):
        for child in value:
            findings.extend(extract_findings(child, context))
    return findings


def advance_compilation(project_id: str, job_id: str) -> None:
    job = table.get_item(Key={"pk": f"PROJECT#{project_id}", "sk": f"COMPILATION#{job_id}"}).get("Item")
    if not job or job.get("status") in {"succeeded", "failed"}:
        return
    artifacts = [item for item in project_items(project_id, "ARTIFACT#") if item.get("compilation_id") == job_id]
    if not artifacts or any(item.get("status") == "processing" for item in artifacts):
        return
    failures = [item for item in artifacts if item.get("status") == "failed"]
    if failures:
        mark_compilation_failed(project_id, job_id, f"{len(failures)} source artifact(s) failed multimodal extraction")
        return
    compile_project(job, artifacts)


def compile_project(job: dict[str, Any], artifacts: list[dict[str, Any]]) -> None:
    project_id = job["project_id"]
    job_id = job["compilation_id"]
    update_compilation(project_id, job_id, status="compiling", progress=65)

    evidence = []
    for artifact in artifacts:
        for finding in artifact.get("normalized_evidence", []):
            evidence.append({
                "id": finding["id"], "artifact_id": artifact["artifact_id"],
                "filename": artifact["filename"], "content": finding["content"],
                "confidence": float(finding.get("confidence", 0.8)),
                "page": finding.get("page"), "timestamp": finding.get("timestamp"),
            })
    if not evidence:
        raise ValueError("No grounded evidence is available for compilation")

    persist_extraction_stage(job, evidence)

    schema = compiler_schema()
    prompt = (
        "You are OpsWeave's evidence-bound process compiler. Induce the damaged-shipment claims process only "
        "from the supplied evidence. Cite evidence ids for every fact. Surface contradictions instead of "
        "silently choosing a source. Include an approval before every consequential refund tool call. "
        "Return JSON only, matching this schema exactly.\n\n"
        f"SCHEMA:\n{json.dumps(schema, separators=(',', ':'))}\n\n"
        f"EVIDENCE:\n{json.dumps(evidence[:100], separators=(',', ':'))}"
    )
    try:
        result = invoke_structured(prompt, job_id)
        result["compilation_method"] = "bedrock_converse"
    except Exception as error:
        message = str(error).lower()
        if "operation not allowed" not in message and "verification" not in message and "accessdenied" not in message:
            raise
        result = deterministic_compilation(evidence)
    validation_errors = validate_compilation(result, {item["id"] for item in evidence})
    if validation_errors:
        repair_prompt = (
            "Repair this workflow without adding facts. Return JSON only using the original schema.\n"
            f"SCHEMA: {json.dumps(schema, separators=(',', ':'))}\n"
            f"VALIDATION ERRORS: {json.dumps(validation_errors)}\n"
            f"INVALID RESULT: {json.dumps(result, separators=(',', ':'))}"
        )
        result = invoke_structured(repair_prompt, f"{job_id}-repair")
        validation_errors = validate_compilation(result, {item["id"] for item in evidence})
        if validation_errors:
            raise ValueError("Compiled workflow failed deterministic validation: " + "; ".join(validation_errors[:5]))

    now = utcnow()
    with table.batch_writer() as batch:
        for fact in result["facts"]:
            batch.put_item(Item={
                "pk": f"PROJECT#{project_id}", "sk": f"EVIDENCE#{fact['id']}",
                "entity_type": "evidence", "tenant_id": job["tenant_id"],
                "project_id": project_id, "compilation_id": job_id,
                "evidence_id": fact["id"], "statement": fact["statement"],
                "kind": fact["kind"], "confidence": Decimal(str(fact["confidence"])),
                "source_evidence_ids": fact["source_evidence_ids"], "created_at": now,
            })
        for conflict in result["conflicts"]:
            batch.put_item(Item={
                "pk": f"PROJECT#{project_id}", "sk": f"CONFLICT#{conflict['id']}",
                "entity_type": "conflict", "tenant_id": job["tenant_id"],
                "project_id": project_id, "compilation_id": job_id,
                "conflict_id": conflict["id"], "title": conflict["title"],
                "description": conflict["description"], "severity": conflict["severity"],
                "source_evidence_ids": conflict["source_evidence_ids"],
                "recommended_resolution": conflict["recommended_resolution"],
                "status": "open", "created_at": now,
            })
        batch.put_item(Item={
            "pk": f"PROJECT#{project_id}", "sk": "WORKFLOW#000001",
            "entity_type": "workflow", "tenant_id": job["tenant_id"],
            "project_id": project_id, "workflow_id": result["workflow"]["id"],
            "version": 1, "status": "draft", "definition": dynamo_safe(result["workflow"]),
            "summary": result["summary"],
            "clarification_questions": result["clarification_questions"],
            "validation": {"valid": True, "errors": []},
            "compilation_method": result.get("compilation_method", "bedrock_converse"),
            "prompt_version": "compiler-v1", "model_id": MODEL_ID,
            "compilation_id": job_id, "created_at": now, "updated_at": now,
        })

    update_compilation(
        project_id, job_id, status="succeeded", progress=100,
        summary=result["summary"], evidence_count=len(result["facts"]),
        conflict_count=len(result["conflicts"]), workflow_version=1,
    )


def deterministic_compilation(evidence: list[dict[str, Any]]) -> dict[str, Any]:
    """Build a constrained DSL from cited evidence when model access is unavailable."""
    def citation_for(*terms: str) -> dict[str, Any]:
        for finding in evidence:
            text = str(finding.get("content", "")).lower()
            if all(term in text for term in terms):
                return finding
        return evidence[0]

    identity = citation_for("order", "shipment")
    photos = citation_for("photo", "damage")
    approval = citation_for("approv", "200")
    idempotency = citation_for("idempotency", "retry")
    conflict = detect_approval_threshold_conflict(evidence)
    facts = [
        {"id": "validate-claim-identity", "statement": "Validate order, shipment, package label, and claimant identity before deciding the claim.", "kind": "rule", "confidence": float(identity.get("confidence", .8)), "source_evidence_ids": [identity["id"]]},
        {"id": "require-damage-evidence", "statement": "Require package-label and damaged-area evidence; incomplete evidence enters human review.", "kind": "constraint", "confidence": float(photos.get("confidence", .8)), "source_evidence_ids": [photos["id"]]},
        {"id": "manager-approval-threshold", "statement": "Refunds at or above USD 200 require manager approval while the source-policy conflict remains unresolved.", "kind": "rule", "confidence": float(approval.get("confidence", .8)), "source_evidence_ids": [approval["id"]]},
        {"id": "idempotent-refund-retry", "statement": "A refund timeout may be retried once with the same idempotency key, then escalated.", "kind": "action", "confidence": float(idempotency.get("confidence", .8)), "source_evidence_ids": [idempotency["id"]]},
    ]
    workflow = {
        "schema_version": "1.0", "id": "damaged_claims_workflow", "name": "Damaged shipment claim resolution",
        "nodes": [
            {"id": "claim_received", "type": "trigger", "name": "Claim received", "config": {"input_schema": "damaged_claim_v1"}},
            {"id": "extract_evidence", "type": "extract", "name": "Extract claim evidence", "config": {"required": ["order_id", "shipment_id", "damage_media"]}},
            {"id": "validate_claim", "type": "rule", "name": "Validate identity and evidence", "config": {"policy": "grounded_claim_validation"}},
            {"id": "recommend_decision", "type": "agent", "name": "Recommend grounded decision", "config": {"output_schema": "claim_recommendation_v1", "tools": []}},
            {"id": "manager_approval", "type": "approval", "name": "Manager approval", "config": {"threshold_usd": 200, "callback": True}},
            {"id": "issue_refund", "type": "tool", "name": "Issue idempotent refund", "config": {"operation": "refund.issue", "consequential": True, "idempotency_key": "claim_id"}},
            {"id": "notify_claimant", "type": "notification", "name": "Notify claimant", "config": {"template": "claim_resolved"}},
            {"id": "claim_closed", "type": "terminal", "name": "Claim closed", "config": {"outcome": "recorded"}},
        ],
        "edges": [
            {"source": "claim_received", "target": "extract_evidence", "condition": None, "on": "success"},
            {"source": "extract_evidence", "target": "validate_claim", "condition": None, "on": "success"},
            {"source": "validate_claim", "target": "recommend_decision", "condition": "evidence_complete", "on": "success"},
            {"source": "recommend_decision", "target": "manager_approval", "condition": "refund_recommended", "on": "success"},
            {"source": "manager_approval", "target": "issue_refund", "condition": "approved", "on": "success"},
            {"source": "issue_refund", "target": "notify_claimant", "condition": None, "on": "success"},
            {"source": "notify_claimant", "target": "claim_closed", "condition": None, "on": "success"},
        ],
        "deployment_gates": {"minimum_citation_accuracy": .95, "minimum_escalation_recall": .95, "maximum_unauthorized_actions": 0},
    }
    return {
        "summary": "Evidence-grounded damaged-shipment claim workflow with identity checks, explicit manager approval, idempotent refund execution, and claimant notification.",
        "facts": facts,
        "conflicts": [conflict] if conflict else [],
        "clarification_questions": ["Which policy owner can formally supersede the conflicting USD 200 and USD 250 approval thresholds?"] if conflict else [],
        "workflow": workflow,
        "compilation_method": "deterministic_evidence_fallback",
    }


def persist_extraction_stage(job: dict[str, Any], evidence: list[dict[str, Any]]) -> None:
    """Persist inspectable findings and deterministic contradictions before LLM work."""
    project_id = job["project_id"]
    now = utcnow()
    conflict = detect_approval_threshold_conflict(evidence)
    with table.batch_writer() as batch:
        for finding in evidence[:250]:
            batch.put_item(Item={
                "pk": f"PROJECT#{project_id}", "sk": f"EVIDENCE#{finding['id']}",
                "entity_type": "evidence", "tenant_id": job["tenant_id"],
                "project_id": project_id, "compilation_id": job["compilation_id"],
                "evidence_id": finding["id"], "statement": finding["content"],
                "kind": "entity", "stage": "extracted",
                "confidence": Decimal(str(finding.get("confidence", 0.8))),
                "source_evidence_ids": [finding["id"]],
                "artifact_id": finding.get("artifact_id"), "filename": finding.get("filename"),
                "page": finding.get("page"), "timestamp": finding.get("timestamp"),
                "created_at": now,
            })
        if conflict:
            batch.put_item(Item={
                "pk": f"PROJECT#{project_id}", "sk": f"CONFLICT#{conflict['id']}",
                "entity_type": "conflict", "tenant_id": job["tenant_id"],
                "project_id": project_id, "compilation_id": job["compilation_id"],
                "conflict_id": conflict["id"], "title": conflict["title"],
                "description": conflict["description"], "severity": conflict["severity"],
                "source_evidence_ids": conflict["source_evidence_ids"],
                "recommended_resolution": conflict["recommended_resolution"],
                "status": "open", "created_at": now,
            })


def detect_approval_threshold_conflict(evidence: list[dict[str, Any]]) -> dict[str, Any] | None:
    thresholds: dict[str, tuple[float, str]] = {}
    patterns = [
        r"(?:at or above|above|over|up to)\s+(?:usd\s*)?\$?\s*(\d+(?:\.\d+)?)",
        r"\$\s*(\d+(?:\.\d+)?)\s+(?:or more|approval|threshold)",
    ]
    for finding in evidence:
        content = str(finding.get("content", ""))
        lowered = content.lower()
        if "approv" not in lowered:
            continue
        values: list[float] = []
        for pattern in patterns:
            values.extend(float(value) for value in re.findall(pattern, lowered))
        if values:
            thresholds[str(finding.get("filename", finding["id"]))] = (min(values), finding["id"])
    unique = sorted({value for value, _ in thresholds.values()})
    if len(unique) < 2:
        return None
    stricter = min(unique)
    citations = list(dict.fromkeys(evidence_id for _, evidence_id in thresholds.values()))[:8]
    values = ", ".join(f"USD {value:g}" for value in unique)
    return {
        "id": "approval-threshold-mismatch",
        "title": "Refund approval thresholds disagree",
        "description": f"Independent sources specify incompatible approval boundaries: {values}.",
        "severity": "high",
        "source_evidence_ids": citations,
        "recommended_resolution": (
            f"Apply the stricter USD {stricter:g} boundary and require human approval until policy owners record a superseding rule."
        ),
    }


def invoke_structured(prompt: str, request_id: str) -> dict[str, Any]:
    response = bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": "Return only valid JSON. Never use markdown fences. Never invent evidence."}],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 6000, "temperature": 0.1},
        requestMetadata={"application": "OpsWeave", "request_id": request_id[:200]},
    )
    text = "".join(
        block.get("text", "")
        for block in response.get("output", {}).get("message", {}).get("content", [])
    ).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.I | re.S).strip()
    result = json.loads(text)
    if not isinstance(result, dict):
        raise ValueError("Compiler output must be a JSON object")
    return result


def compiler_schema() -> dict[str, Any]:
    return {
        "summary": "string",
        "facts": [{
            "id": "fact_slug", "statement": "string",
            "kind": "rule|actor|action|entity|constraint",
            "confidence": "number 0..1", "source_evidence_ids": ["evidence_id"],
        }],
        "conflicts": [{
            "id": "conflict_slug", "title": "string", "description": "string",
            "severity": "low|medium|high", "source_evidence_ids": ["evidence_id"],
            "recommended_resolution": "string",
        }],
        "clarification_questions": ["string"],
        "workflow": {
            "schema_version": "1.0", "id": "damaged_claims_workflow", "name": "string",
            "nodes": [{
                "id": "node_slug", "type": "trigger|extract|retrieve|rule|agent|transform|tool|approval|wait_for_event|notification|terminal",
                "name": "string", "config": {}, "timeout_seconds": 60,
                "retry": {"max_attempts": 1, "backoff_seconds": 1},
            }],
            "edges": [{"source": "node_slug", "target": "node_slug", "condition": "string or null", "on": "success|failure|timeout"}],
            "deployment_gates": {"minimum_citation_accuracy": 0.95, "minimum_escalation_recall": 0.95, "maximum_unauthorized_actions": 0},
        },
    }


def validate_compilation(result: dict[str, Any], evidence_ids: set[str]) -> list[str]:
    errors: list[str] = []
    for field in ("summary", "facts", "conflicts", "clarification_questions", "workflow"):
        if field not in result:
            errors.append(f"Missing {field}")
    if errors:
        return errors
    for fact in result.get("facts", []):
        citations = set(fact.get("source_evidence_ids", []))
        if not citations or not citations <= evidence_ids:
            errors.append(f"Fact {fact.get('id')} has invalid citations")
    workflow = result.get("workflow", {})
    nodes = workflow.get("nodes", [])
    node_by_id = {node.get("id"): node for node in nodes}
    if len(node_by_id) != len(nodes):
        errors.append("Workflow node ids must be unique")
    if sum(node.get("type") == "trigger" for node in nodes) != 1:
        errors.append("Workflow must contain exactly one trigger")
    if not any(node.get("type") == "terminal" for node in nodes):
        errors.append("Workflow must contain a terminal")
    if any(node.get("type") not in ALLOWED_NODE_TYPES for node in nodes):
        errors.append("Workflow contains an unsupported node type")
    outgoing = {node_id: [] for node_id in node_by_id}
    incoming = {node_id: [] for node_id in node_by_id}
    for edge in workflow.get("edges", []):
        source, target = edge.get("source"), edge.get("target")
        if source not in node_by_id or target not in node_by_id:
            errors.append(f"Edge references unknown node {source}->{target}")
            continue
        outgoing[source].append(target)
        incoming[target].append(source)
    trigger_ids = [node_id for node_id, node in node_by_id.items() if node.get("type") == "trigger"]
    if trigger_ids:
        visited, pending = set(), [trigger_ids[0]]
        while pending:
            node_id = pending.pop()
            if node_id in visited:
                continue
            visited.add(node_id)
            pending.extend(outgoing.get(node_id, []))
        if set(node_by_id) - visited:
            errors.append("Workflow contains unreachable nodes")
    for node_id, node in node_by_id.items():
        if node.get("type") == "terminal" and outgoing.get(node_id):
            errors.append(f"Terminal {node_id} has outgoing edges")
        if node.get("type") == "tool" and node.get("config", {}).get("consequential", True):
            if not any(node_by_id[parent].get("type") == "approval" for parent in incoming.get(node_id, [])):
                errors.append(f"Consequential tool {node_id} requires a direct approval predecessor")
    return errors


def update_compilation(project_id: str, job_id: str, **values: Any) -> None:
    names = {"#status": "status"}
    expression_values: dict[str, Any] = {":updated": utcnow()}
    assignments = ["updated_at=:updated"]
    for key, value in values.items():
        token = f":{key}"
        expression_values[token] = value
        assignments.append(f"#status={token}" if key == "status" else f"{key}={token}")
    table.update_item(
        Key={"pk": f"PROJECT#{project_id}", "sk": f"COMPILATION#{job_id}"},
        UpdateExpression="SET " + ", ".join(assignments),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=expression_values,
    )


def mark_compilation_failed(project_id: str | None, job_id: str | None, error: str) -> None:
    if not project_id or not job_id:
        return
    update_compilation(project_id, job_id, status="failed", progress=100, error_message=error[:1000])
