import pytest
from pydantic import ValidationError

from opsweave_api.workflow import WorkflowDefinition


def valid_workflow() -> dict:
    return {
        "id": "damaged_claims",
        "version": 1,
        "name": "Damaged claims",
        "nodes": [
            {"id": "claim_received", "type": "trigger", "name": "Claim received"},
            {"id": "review_claim", "type": "approval", "name": "Review claim"},
            {"id": "completed", "type": "terminal", "name": "Completed"},
        ],
        "edges": [
            {"source": "claim_received", "target": "review_claim"},
            {"source": "review_claim", "target": "completed"},
        ],
    }


def test_valid_workflow_is_accepted():
    workflow = WorkflowDefinition.model_validate(valid_workflow())
    assert workflow.schema_version == "1.0"


def test_unreachable_node_is_rejected():
    payload = valid_workflow()
    payload["nodes"].append({"id": "orphan_rule", "type": "rule", "name": "Orphan rule"})
    with pytest.raises(ValidationError, match="Unreachable nodes"):
        WorkflowDefinition.model_validate(payload)


def test_terminal_outgoing_edge_is_rejected():
    payload = valid_workflow()
    payload["edges"].append({"source": "completed", "target": "review_claim"})
    with pytest.raises(ValidationError, match="cannot have outgoing edges"):
        WorkflowDefinition.model_validate(payload)
