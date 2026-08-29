import importlib.util
import os
from pathlib import Path

os.environ.setdefault("AWS_ACCESS_KEY_ID", "testing")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "testing")
os.environ.setdefault("AWS_EC2_METADATA_DISABLED", "true")
os.environ.setdefault("APPLICATION_TABLE", "opsweave-test")
os.environ.setdefault("ARTIFACT_BUCKET", "opsweave-test")
os.environ.setdefault("BDA_PROJECT_ARN", "arn:aws:bedrock:us-east-1:111111111111:data-automation-project/test")
os.environ.setdefault("BDA_PROFILE_ARN", "arn:aws:bedrock:us-east-1:111111111111:data-automation-profile/test")
os.environ.setdefault("KMS_KEY_ARN", "arn:aws:kms:us-east-1:111111111111:key/test")
os.environ.setdefault("MODEL_CALLS_ENABLED_PARAMETER", "/opsweave/test/model-calls-enabled")

WORKER_PATH = Path(__file__).parents[2] / "workers" / "handler.py"
SPEC = importlib.util.spec_from_file_location("opsweave_worker", WORKER_PATH)
assert SPEC and SPEC.loader
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)


def test_bda_routing_covers_multimodal_files_only():
    assert worker.supports_bda("application/pdf", "policy.pdf")
    assert worker.supports_bda("image/png", "damage.png")
    assert worker.supports_bda("audio/mp4", "interview.m4a")
    assert worker.supports_bda("video/mp4", "inspection.mp4")
    assert not worker.supports_bda("text/csv", "claims.csv")
    assert not worker.supports_bda("application/json", "claim.json")


def test_extract_findings_preserves_provenance():
    payload = {
        "document": {
            "page_number": 4,
            "confidence": 0.97,
            "blocks": [{"text": "Refunds above $250 require manager approval."}],
        }
    }
    findings = worker.extract_findings(payload)
    assert findings == [{"content": "Refunds above $250 require manager approval.", "page": 4, "confidence": 0.97}]


def test_extract_findings_understands_multimodal_summaries_and_skips_audio_tokens():
    payload = {
        "audio_items": [{"content": "warehouse"}],
        "chapters": [{"start_timecode_smpte": "00:00:12:13", "summary": "A damaged parcel is routed to manager review."}],
    }
    assert worker.extract_findings(payload) == [{
        "content": "A damaged parcel is routed to manager review.",
        "timestamp": "00:00:12:13",
    }]


def test_deterministic_reconciliation_detects_threshold_conflict():
    evidence = [
        {"id": "warehouse", "filename": "warehouse-sop.pdf", "content": "Specialist approval is allowed up to USD 250."},
        {"id": "finance", "filename": "finance-policy.pdf", "content": "Manager approval is required at or above USD 200."},
    ]
    conflict = worker.detect_approval_threshold_conflict(evidence)
    assert conflict is not None
    assert conflict["severity"] == "high"
    assert conflict["source_evidence_ids"] == ["warehouse", "finance"]
    assert "USD 200" in conflict["recommended_resolution"]


def test_deterministic_compiler_produces_grounded_valid_workflow():
    evidence = [
        {"id": "identity", "filename": "sop.pdf", "content": "Match order and shipment before approval.", "confidence": .98},
        {"id": "photos", "filename": "sop.pdf", "content": "Require a photo of the label and damage.", "confidence": .96},
        {"id": "warehouse", "filename": "sop.pdf", "content": "Specialist approval is allowed up to USD 250.", "confidence": .95},
        {"id": "finance", "filename": "policy.pdf", "content": "Manager approval is required at or above USD 200.", "confidence": .99},
        {"id": "retry", "filename": "policy.pdf", "content": "Retry once using the same idempotency key.", "confidence": .99},
    ]
    result = worker.deterministic_compilation(evidence)
    assert result["compilation_method"] == "deterministic_evidence_fallback"
    assert worker.validate_compilation(result, {item["id"] for item in evidence}) == []


def test_validator_rejects_consequential_tool_without_approval():
    result = {
        "summary": "Damaged claim flow",
        "facts": [{"id": "f1", "source_evidence_ids": ["e1"]}],
        "conflicts": [],
        "clarification_questions": [],
        "workflow": {
            "nodes": [
                {"id": "start", "type": "trigger", "config": {}},
                {"id": "refund", "type": "tool", "config": {"consequential": True}},
                {"id": "done", "type": "terminal", "config": {}},
            ],
            "edges": [
                {"source": "start", "target": "refund"},
                {"source": "refund", "target": "done"},
            ],
        },
    }
    errors = worker.validate_compilation(result, {"e1"})
    assert "Consequential tool refund requires a direct approval predecessor" in errors


def test_validator_accepts_grounded_approval_flow():
    result = {
        "summary": "Damaged claim flow",
        "facts": [{"id": "f1", "source_evidence_ids": ["e1"]}],
        "conflicts": [],
        "clarification_questions": [],
        "workflow": {
            "nodes": [
                {"id": "start", "type": "trigger", "config": {}},
                {"id": "review", "type": "approval", "config": {}},
                {"id": "refund", "type": "tool", "config": {"consequential": True}},
                {"id": "done", "type": "terminal", "config": {}},
            ],
            "edges": [
                {"source": "start", "target": "review"},
                {"source": "review", "target": "refund"},
                {"source": "refund", "target": "done"},
            ],
        },
    }
    assert worker.validate_compilation(result, {"e1"}) == []
