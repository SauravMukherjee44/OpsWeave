from opsweave_api.cloud_repository import CloudRepository
from opsweave_api.config import Settings


def test_extracted_evidence_remains_visible_before_compiler_success():
    artifacts = [{
        "artifact_id": "artifact-1",
        "filename": "inspection.mp4",
        "updated_at": "2026-08-29T00:00:00Z",
        "normalized_evidence": [{
            "id": "finding-1",
            "content": "The damaged parcel requires human review.",
            "confidence": 0.91,
            "timestamp": "00:00:22:00",
        }],
    }]

    assert CloudRepository._extracted_evidence(artifacts) == [{
        "evidence_id": "finding-1",
        "statement": "The damaged parcel requires human review.",
        "kind": "entity",
        "confidence": 0.91,
        "source_evidence_ids": ["finding-1"],
        "artifact_id": "artifact-1",
        "filename": "inspection.mp4",
        "page": None,
        "timestamp": "00:00:22:00",
        "created_at": "2026-08-29T00:00:00Z",
        "stage": "extracted",
    }]


def test_project_query_follows_dynamodb_pagination(monkeypatch):
    repository = CloudRepository(Settings(application_table="test-table"))

    class FakeTable:
        calls = 0

        def query(self, **kwargs):
            self.calls += 1
            if self.calls == 1:
                return {"Items": [{"sk": "A"}], "LastEvaluatedKey": {"pk": "P", "sk": "A"}}
            assert kwargs["ExclusiveStartKey"] == {"pk": "P", "sk": "A"}
            return {"Items": [{"sk": "B"}]}

    table = FakeTable()
    monkeypatch.setattr(repository, "_table", lambda: table)
    assert repository._query_project_items("project-1") == [{"sk": "A"}, {"sk": "B"}]
