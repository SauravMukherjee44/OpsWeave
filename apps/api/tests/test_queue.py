import json

import pytest

from opsweave_api.config import Settings
from opsweave_api.queue import CompilationQueue


@pytest.mark.asyncio
async def test_compilation_queue_sends_tenant_scoped_job(monkeypatch):
    sent: dict = {}

    class FakeSqs:
        def send_message(self, **kwargs):
            sent.update(kwargs)
            return {"MessageId": "message-123"}

    monkeypatch.setattr("opsweave_api.queue.boto3.client", lambda *_args, **_kwargs: FakeSqs())
    queue = CompilationQueue(Settings(compilation_queue_url="https://sqs.us-east-1.amazonaws.com/123/opsweave"))

    message_id = await queue.send(job_id="job-1", tenant_id="tenant-1", project_id="project-1")

    assert message_id == "message-123"
    assert sent["QueueUrl"].endswith("/opsweave")
    assert json.loads(sent["MessageBody"]) == {
        "schema_version": 1,
        "job_id": "job-1",
        "tenant_id": "tenant-1",
        "project_id": "project-1",
    }


@pytest.mark.asyncio
async def test_compilation_queue_refuses_unconfigured_delivery():
    with pytest.raises(RuntimeError, match="not configured"):
        await CompilationQueue(Settings(_env_file=None)).send(job_id="job-1", tenant_id="tenant-1", project_id="project-1")
