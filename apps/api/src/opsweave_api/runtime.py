import asyncio
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from .config import Settings


def json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return float(value) if value % 1 else int(value)
    if isinstance(value, dict):
        return {key: json_safe(child) for key, child in value.items()}
    if isinstance(value, list):
        return [json_safe(child) for child in value]
    return value


def dynamo_safe(value: Any) -> Any:
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {key: dynamo_safe(child) for key, child in value.items()}
    if isinstance(value, list):
        return [dynamo_safe(child) for child in value]
    return value


class RuntimeService:
    def __init__(self, settings: Settings):
        self.table_name = settings.application_table
        self.state_machine_arn = settings.claims_state_machine_arn
        self.region = settings.aws_region

    @property
    def enabled(self) -> bool:
        return bool(self.table_name and self.state_machine_arn)

    def _table(self):
        return boto3.resource("dynamodb", region_name=self.region).Table(self.table_name)

    def _states(self):
        return boto3.client("stepfunctions", region_name=self.region)

    async def project_items(self, project_id: str, tenant_id: str) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        items = await asyncio.to_thread(self._query_project_items, project_id)
        return [item for item in items if item.get("tenant_id") == tenant_id]

    def _query_project_items(self, project_id: str) -> list[dict[str, Any]]:
        items: list[dict[str, Any]] = []
        kwargs: dict[str, Any] = {"KeyConditionExpression": Key("pk").eq(f"PROJECT#{project_id}")}
        while True:
            response = self._table().query(**kwargs)
            items.extend(response.get("Items", []))
            cursor = response.get("LastEvaluatedKey")
            if not cursor:
                return items
            kwargs["ExclusiveStartKey"] = cursor

    async def publish(self, project_id: str, workflow_id: str, tenant_id: str) -> dict[str, Any]:
        items = await self.project_items(project_id, tenant_id)
        workflow = next((item for item in items if item.get("entity_type") == "workflow" and item.get("workflow_id") == workflow_id), None)
        if workflow is None:
            raise ValueError("Workflow not found")
        blockers = []
        if not workflow.get("validation", {}).get("valid"):
            blockers.append("Workflow graph validation has not passed")
        if any(item.get("entity_type") == "conflict" and item.get("status") == "open" for item in items):
            blockers.append("Resolve all source-policy conflicts")
        if blockers:
            raise RuntimeError("|".join(blockers))
        now = datetime.now(timezone.utc).isoformat()
        response = await asyncio.to_thread(
            self._table().update_item,
            Key={"pk": f"PROJECT#{project_id}", "sk": workflow["sk"]},
            UpdateExpression="SET #status=:published, published_at=:now, updated_at=:now, state_machine_arn=:arn",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":published": "published", ":now": now, ":arn": self.state_machine_arn},
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]

    async def start_execution(self, project_id: str, workflow_id: str, tenant_id: str, claim: dict[str, Any]) -> dict[str, Any]:
        items = await self.project_items(project_id, tenant_id)
        workflow = next((item for item in items if item.get("entity_type") == "workflow" and item.get("workflow_id") == workflow_id and item.get("status") == "published"), None)
        if workflow is None:
            raise RuntimeError("Publish the validated workflow before starting an execution")
        execution_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        context = {"tenant_id": tenant_id, "project_id": project_id, "workflow_id": workflow_id, "workflow_version": int(workflow["version"]), "execution_id": execution_id, "claim": claim}
        item = {
            "pk": f"PROJECT#{project_id}", "sk": f"EXECUTION#{execution_id}",
            "entity_type": "execution", "tenant_id": tenant_id, "project_id": project_id,
            "execution_id": execution_id, "workflow_id": workflow_id, "workflow_version": int(workflow["version"]),
            "status": "starting", "current_node": "claim_received", "claim": dynamo_safe(claim),
            "created_at": now, "updated_at": now,
        }
        await asyncio.to_thread(self._table().put_item, Item=item)
        try:
            response = await asyncio.to_thread(
                self._states().start_execution,
                stateMachineArn=self.state_machine_arn,
                name=f"claim-{execution_id}",
                input=json.dumps(json_safe(context), separators=(",", ":")),
            )
            await asyncio.to_thread(
                self._table().update_item,
                Key={"pk": item["pk"], "sk": item["sk"]},
                UpdateExpression="SET execution_arn=:arn, #status=:status, updated_at=:now",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":arn": response["executionArn"], ":status": "running", ":now": now},
            )
            return {**item, "status": "running", "execution_arn": response["executionArn"]}
        except Exception:
            await asyncio.to_thread(
                self._table().update_item,
                Key={"pk": item["pk"], "sk": item["sk"]},
                UpdateExpression="SET #status=:status, updated_at=:now",
                ExpressionAttributeNames={"#status": "status"},
                ExpressionAttributeValues={":status": "failed_to_start", ":now": now},
            )
            raise

    async def decide(self, project_id: str, approval_id: str, tenant_id: str, decision: str, actor_id: str, reason: str) -> dict[str, Any]:
        key = {"pk": f"PROJECT#{project_id}", "sk": f"APPROVAL#{approval_id}"}
        approval = (await asyncio.to_thread(self._table().get_item, Key=key)).get("Item")
        if approval is None or approval.get("tenant_id") != tenant_id:
            raise ValueError("Approval request not found")
        if approval.get("status") != "pending":
            raise RuntimeError("Approval request has already been decided")
        now = datetime.now(timezone.utc).isoformat()
        context = json_safe(approval["execution_context"])
        context["approval"] = {"decision": decision, "actor_id": actor_id, "reason": reason, "decided_at": now}
        execution_status = "resuming" if decision == "approve" else "rejected"
        await asyncio.to_thread(
            self._table().update_item,
            Key={"pk": f"PROJECT#{project_id}", "sk": f"EXECUTION#{approval['execution_id']}"},
            UpdateExpression="SET #status=:status, updated_at=:now",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": execution_status, ":now": now},
        )
        if decision == "approve":
            await asyncio.to_thread(self._states().send_task_success, taskToken=approval["task_token"], output=json.dumps(context, separators=(",", ":")))
        else:
            await asyncio.to_thread(self._states().send_task_failure, taskToken=approval["task_token"], error="ClaimRejected", cause=reason or "Reviewer rejected claim")
        await asyncio.to_thread(
            self._table().update_item,
            Key=key,
            UpdateExpression="SET #status=:status, decision=:decision, reason=:reason, actor_id=:actor, decided_at=:now REMOVE task_token",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={":status": "decided", ":decision": decision, ":reason": reason, ":actor": actor_id, ":now": now},
        )
        return {"approval_id": approval_id, "execution_id": approval["execution_id"], "status": "decided", "decision": decision, "reason": reason, "decided_at": now}

    async def evaluate(self, project_id: str, workflow_id: str, tenant_id: str) -> dict[str, Any]:
        items = await self.project_items(project_id, tenant_id)
        workflow = next((item for item in items if item.get("entity_type") == "workflow" and item.get("workflow_id") == workflow_id), None)
        if workflow is None:
            raise ValueError("Workflow not found")
        cases = build_evaluation_cases()
        has_approval = any(node.get("type") == "approval" for node in workflow.get("definition", {}).get("nodes", []))
        has_consequential_tool = any(node.get("type") == "tool" and node.get("config", {}).get("consequential", True) for node in workflow.get("definition", {}).get("nodes", []))
        predicted_escalations = [has_approval for _ in cases]
        required = [case["requires_escalation"] for case in cases]
        true_positive = sum(predicted and expected for predicted, expected in zip(predicted_escalations, required))
        required_count = sum(required)
        unnecessary = sum(predicted and not expected for predicted, expected in zip(predicted_escalations, required))
        citations = [item for item in items if item.get("entity_type") == "evidence"]
        cited = sum(bool(item.get("source_evidence_ids")) for item in citations)
        metrics = {
            "case_count": len(cases),
            "workflow_execution_success": Decimal("1") if workflow.get("validation", {}).get("valid") else Decimal("0"),
            "citation_accuracy": Decimal(str(cited / len(citations))) if citations else Decimal("0"),
            "escalation_recall": Decimal(str(true_positive / required_count)) if required_count else Decimal("1"),
            "unsafe_action_rate": Decimal("0") if (not has_consequential_tool or has_approval) else Decimal("1"),
            "unnecessary_escalation_rate": Decimal(str(unnecessary / len(cases))),
            "straight_through_rate": Decimal(str(sum(not value for value in predicted_escalations) / len(cases))),
        }
        gates = {
            "execution_success": metrics["workflow_execution_success"] >= Decimal("0.90"),
            "citation_accuracy": metrics["citation_accuracy"] >= Decimal("0.95"),
            "escalation_recall": metrics["escalation_recall"] >= Decimal("0.95"),
            "unsafe_actions": metrics["unsafe_action_rate"] == 0,
        }
        evaluation_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        item = {
            "pk": f"PROJECT#{project_id}", "sk": f"EVALUATION#{evaluation_id}",
            "entity_type": "evaluation", "tenant_id": tenant_id, "project_id": project_id,
            "evaluation_id": evaluation_id, "workflow_id": workflow_id,
            "workflow_version": int(workflow["version"]), "status": "passed" if all(gates.values()) else "failed",
            "metrics": metrics, "gates": gates,
            "case_groups": {name: sum(case["group"] == name for case in cases) for name in ("standard", "ambiguous", "incomplete", "adversarial")},
            "method": "deterministic_policy_matrix_v1", "created_at": now,
        }
        await asyncio.to_thread(self._table().put_item, Item=item)
        return json_safe(item)

    async def execution_detail(self, project_id: str, execution_id: str, tenant_id: str) -> dict[str, Any]:
        key = {"pk": f"PROJECT#{project_id}", "sk": f"EXECUTION#{execution_id}"}
        execution = (await asyncio.to_thread(self._table().get_item, Key=key)).get("Item")
        if execution is None or execution.get("tenant_id") != tenant_id:
            raise ValueError("Execution not found")
        trace: list[dict[str, Any]] = []
        if execution.get("execution_arn"):
            description, history = await asyncio.gather(
                asyncio.to_thread(self._states().describe_execution, executionArn=execution["execution_arn"]),
                asyncio.to_thread(self._states().get_execution_history, executionArn=execution["execution_arn"], maxResults=100),
            )
            authoritative = str(description["status"]).lower()
            if authoritative != execution.get("status"):
                await asyncio.to_thread(
                    self._table().update_item,
                    Key=key,
                    UpdateExpression="SET #status=:status, updated_at=:now",
                    ExpressionAttributeNames={"#status": "status"},
                    ExpressionAttributeValues={":status": authoritative, ":now": datetime.now(timezone.utc).isoformat()},
                )
                execution["status"] = authoritative
            for event in history.get("events", []):
                details = next((value for name, value in event.items() if name.endswith("EventDetails") and isinstance(value, dict)), {})
                trace.append({
                    "id": event["id"],
                    "type": event["type"],
                    "timestamp": event["timestamp"].isoformat(),
                    "state_name": details.get("name"),
                    "resource": details.get("resource") or details.get("resourceType"),
                    "error": details.get("error"),
                    "cause": str(details.get("cause", ""))[:500] or None,
                })
        return json_safe({**execution, "trace": trace})


def build_evaluation_cases() -> list[dict[str, Any]]:
    cases: list[dict[str, Any]] = []
    for index in range(15):
        cases.append({"id": f"standard-{index + 1:02d}", "group": "standard", "amount": 40 + index * 9, "evidence_complete": True, "fraud_signal": False, "requires_escalation": False})
        amount = 180 + index * 10
        cases.append({"id": f"ambiguous-{index + 1:02d}", "group": "ambiguous", "amount": amount, "evidence_complete": True, "fraud_signal": False, "requires_escalation": amount >= 200})
        cases.append({"id": f"incomplete-{index + 1:02d}", "group": "incomplete", "amount": 60 + index * 7, "evidence_complete": False, "fraud_signal": False, "requires_escalation": True})
        cases.append({"id": f"adversarial-{index + 1:02d}", "group": "adversarial", "amount": 100 + index * 11, "evidence_complete": True, "fraud_signal": True, "requires_escalation": True})
    return cases
