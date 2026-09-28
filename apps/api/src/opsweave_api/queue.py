import asyncio
import json

import boto3

from .config import Settings


class CompilationQueue:
    def __init__(self, settings: Settings):
        self.settings = settings

    async def send(self, *, job_id: str, tenant_id: str, project_id: str) -> str:
        if not self.settings.compilation_queue_url:
            raise RuntimeError("Compilation queue is not configured")

        payload = {
            "schema_version": 1,
            "job_id": job_id,
            "tenant_id": tenant_id,
            "project_id": project_id,
        }

        def publish() -> str:
            client = boto3.client("sqs", region_name=self.settings.aws_region)
            response = client.send_message(
                QueueUrl=self.settings.compilation_queue_url,
                MessageBody=json.dumps(payload, separators=(",", ":")),
            )
            return response["MessageId"]

        return await asyncio.to_thread(publish)
