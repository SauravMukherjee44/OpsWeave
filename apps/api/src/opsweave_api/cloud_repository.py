import asyncio
from datetime import datetime, timezone
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

from .config import Settings


def iso(value: datetime) -> str:
    return value.isoformat()


class CloudRepository:
    """Small DynamoDB adapter used by the live AWS worker and the portal API."""

    def __init__(self, settings: Settings):
        self.table_name = settings.application_table
        self.region = settings.aws_region

    @property
    def enabled(self) -> bool:
        return bool(self.table_name)

    def _table(self):
        if not self.table_name:
            raise RuntimeError("OpsWeave application table is not configured")
        return boto3.resource("dynamodb", region_name=self.region).Table(self.table_name)

    async def put_project(self, project: Any) -> None:
        if not self.enabled:
            return
        item = {
            "pk": f"TENANT#{project.tenant_id}",
            "sk": f"PROJECT#{project.id}",
            "entity_type": "project",
            "tenant_id": project.tenant_id,
            "project_id": project.id,
            "name": project.name,
            "description": project.description,
            "status": project.status.value,
            "created_at": iso(project.created_at),
            "updated_at": iso(project.updated_at),
            "gsi1pk": f"PROJECT#{project.id}",
            "gsi1sk": "META",
        }
        await asyncio.to_thread(self._table().put_item, Item=item)

    async def tenant_projects(self, tenant_id: str) -> list[dict[str, Any]]:
        if not self.enabled:
            return []
        def query_all() -> list[dict[str, Any]]:
            items: list[dict[str, Any]] = []
            kwargs: dict[str, Any] = {
                "KeyConditionExpression": Key("pk").eq(f"TENANT#{tenant_id}") & Key("sk").begins_with("PROJECT#"),
            }
            while True:
                response = self._table().query(**kwargs)
                items.extend(response.get("Items", []))
                cursor = response.get("LastEvaluatedKey")
                if not cursor:
                    return items
                kwargs["ExclusiveStartKey"] = cursor
        return await asyncio.to_thread(query_all)

    async def put_artifact(self, artifact: Any) -> None:
        if not self.enabled:
            return
        item = {
            "pk": f"PROJECT#{artifact.project_id}",
            "sk": f"ARTIFACT#{artifact.id}",
            "entity_type": "artifact",
            "tenant_id": artifact.tenant_id,
            "project_id": artifact.project_id,
            "artifact_id": artifact.id,
            "filename": artifact.filename,
            "media_type": artifact.media_type,
            "size_bytes": artifact.size_bytes,
            "storage_key": artifact.storage_key,
            "checksum_sha256": artifact.checksum_sha256,
            "status": artifact.status.value,
            "created_at": iso(artifact.created_at),
            "updated_at": iso(artifact.created_at),
        }
        await asyncio.to_thread(self._table().put_item, Item=item)

    async def put_compilation(self, job: Any) -> None:
        if not self.enabled:
            return
        item = {
            "pk": f"PROJECT#{job.project_id}",
            "sk": f"COMPILATION#{job.id}",
            "entity_type": "compilation",
            "tenant_id": job.tenant_id,
            "project_id": job.project_id,
            "compilation_id": job.id,
            "status": job.status.value,
            "model_id": job.model_id,
            "created_at": iso(job.created_at),
            "updated_at": iso(job.updated_at),
        }
        await asyncio.to_thread(self._table().put_item, Item=item)

    async def get_compilation(self, project_id: str, compilation_id: str) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        response = await asyncio.to_thread(
            self._table().get_item,
            Key={"pk": f"PROJECT#{project_id}", "sk": f"COMPILATION#{compilation_id}"},
        )
        return response.get("Item")

    async def project_workspace(self, project_id: str, tenant_id: str) -> dict[str, Any]:
        if not self.enabled:
            return {"cloud_connected": False, "artifacts": [], "evidence": [], "conflicts": [], "compilations": [], "workflow": None}

        items = [item for item in await asyncio.to_thread(self._query_project_items, project_id) if item.get("tenant_id") == tenant_id]
        artifacts = [item for item in items if item.get("entity_type") == "artifact"]
        evidence = [item for item in items if item.get("entity_type") == "evidence"]
        if not evidence:
            evidence = self._extracted_evidence(artifacts)
        conflicts = [item for item in items if item.get("entity_type") == "conflict"]
        compilations = sorted(
            [item for item in items if item.get("entity_type") == "compilation"],
            key=lambda item: item.get("created_at", ""),
            reverse=True,
        )
        workflows = sorted(
            [item for item in items if item.get("entity_type") == "workflow"],
            key=lambda item: int(item.get("version", 0)),
            reverse=True,
        )
        return {
            "cloud_connected": True,
            "artifacts": artifacts,
            "evidence": evidence,
            "conflicts": conflicts,
            "compilations": compilations,
            "workflow": workflows[0] if workflows else None,
        }

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

    @staticmethod
    def _extracted_evidence(artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """Expose normalized AWS extraction before the reasoning compiler succeeds.

        These are source findings, not inferred process facts. Keeping them visible
        makes extraction independently inspectable and preserves truthful partial
        progress when a model call or downstream validator is unavailable.
        """
        findings: list[dict[str, Any]] = []
        for artifact in artifacts:
            for finding in artifact.get("normalized_evidence", []):
                evidence_id = str(finding.get("id", ""))
                content = str(finding.get("content", "")).strip()
                if not evidence_id or not content:
                    continue
                findings.append({
                    "evidence_id": evidence_id,
                    "statement": content,
                    "kind": "entity",
                    "confidence": finding.get("confidence", 0.8),
                    "source_evidence_ids": [evidence_id],
                    "artifact_id": artifact.get("artifact_id"),
                    "filename": artifact.get("filename"),
                    "page": finding.get("page"),
                    "timestamp": finding.get("timestamp"),
                    "created_at": artifact.get("updated_at", artifact.get("created_at", "")),
                    "stage": "extracted",
                })
                if len(findings) >= 250:
                    return findings
        return findings

    async def update_conflict(self, project_id: str, conflict_id: str, tenant_id: str, resolution: str) -> dict[str, Any]:
        if not self.enabled:
            raise RuntimeError("Cloud workspace is not configured")
        response = await asyncio.to_thread(
            self._table().update_item,
            Key={"pk": f"PROJECT#{project_id}", "sk": f"CONFLICT#{conflict_id}"},
            UpdateExpression="SET resolution=:resolution, #status=:status, resolved_at=:now",
            ExpressionAttributeNames={"#status": "status"},
            ExpressionAttributeValues={
                ":resolution": resolution,
                ":status": "resolved",
                ":now": datetime.now(timezone.utc).isoformat(),
                ":tenant": tenant_id,
            },
            ConditionExpression="tenant_id=:tenant",
            ReturnValues="ALL_NEW",
        )
        return response["Attributes"]
