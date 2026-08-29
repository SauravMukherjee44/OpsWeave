from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from .models import ArtifactStatus, CompilationStatus, ProjectStatus


class HealthResponse(BaseModel):
    status: str
    environment: str
    aws_configured: bool


class ProjectCreate(BaseModel):
    name: str = Field(min_length=3, max_length=180)
    description: str = Field(default="", max_length=2000)


class ProjectRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    description: str
    status: ProjectStatus
    artifact_count: int = 0
    created_at: datetime
    updated_at: datetime


class ArtifactRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    filename: str
    media_type: str
    size_bytes: int
    checksum_sha256: str
    status: ArtifactStatus
    created_at: datetime


class PresignRequest(BaseModel):
    project_id: str
    filename: str = Field(min_length=1, max_length=255)
    media_type: str = Field(min_length=1, max_length=120)
    size_bytes: int = Field(gt=0)


class PresignResponse(BaseModel):
    method: str
    url: str
    fields: dict[str, str] = {}
    expires_in: int
    storage: str


class CompilationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    project_id: str
    status: CompilationStatus
    model_id: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class AuditEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    actor_id: str
    action: str
    resource_type: str
    resource_id: str
    created_at: datetime


class WorkspaceInfoRead(BaseModel):
    tenant_id: str
    tenant_name: str
    actor_id: str
    role: str
    region: str
    environment: str
    isolation: str
    rate_limiting: bool
    model_alias: str | None
    model_calls_configured: bool
    max_upload_bytes: int
    preferences: dict[str, str] = Field(default_factory=dict)


class WorkspacePreferences(BaseModel):
    timezone: str = Field(default="UTC", min_length=2, max_length=80)
    notifications: str = Field(default="Failures and approvals", min_length=2, max_length=80)
    retention: str = Field(default="90 days", pattern="^(30 days|90 days|1 year)$")
    review_threshold: str = Field(default="85%", pattern="^(75%|85%|95%)$")


class WorkflowPublishRequest(BaseModel):
    project_id: str


class ClaimInput(BaseModel):
    claim_id: str = Field(min_length=3, max_length=80)
    order_id: str = Field(min_length=3, max_length=80)
    shipment_id: str = Field(min_length=3, max_length=80)
    claimed_amount_usd: float = Field(gt=0, le=10_000)
    evidence_complete: bool = True
    fraud_signal: bool = False
    damage_description: str = Field(default="", max_length=1000)


class ExecutionCreate(BaseModel):
    project_id: str
    workflow_id: str
    claim: ClaimInput


class ApprovalDecision(BaseModel):
    project_id: str
    decision: str = Field(pattern="^(approve|reject)$")
    reason: str = Field(default="", max_length=1000)


class EvaluationCreate(BaseModel):
    project_id: str
