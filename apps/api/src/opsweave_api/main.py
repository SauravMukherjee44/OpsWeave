from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import uuid

from fastapi import Body, Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from mangum import Mangum
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .auth import Principal, get_principal
from .cloud_repository import CloudRepository
from .config import get_settings
from .database import Base, SessionFactory, engine, get_session
from .models import Artifact, AuditEvent, CompilationJob, CompilationStatus, Project, ProjectStatus, Tenant
from .queue import CompilationQueue
from .rate_limit import RateLimitMiddleware
from .runtime import RuntimeService, json_safe
from .schemas import (
    ApprovalDecision, ArtifactRead, AuditEventRead, CompilationRead, EvaluationCreate, ExecutionCreate,
    HealthResponse, PresignRequest, PresignResponse, ProjectCreate, ProjectRead,
    WorkflowPublishRequest, WorkspaceInfoRead,
)
from .storage import ArtifactStorage

settings = get_settings()
storage = ArtifactStorage(settings)
compilation_queue = CompilationQueue(settings)
cloud = CloudRepository(settings)
runtime = RuntimeService(settings)


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionFactory() as session:
        tenant = await session.get(Tenant, settings.demo_tenant_id)
        if tenant is None:
            session.add(Tenant(id=settings.demo_tenant_id, name="OpsWeave guided workspace", slug="guided-demo"))
            await session.flush()
        if settings.environment != "local" and cloud.enabled:
            for remote_project in await cloud.tenant_projects(settings.demo_tenant_id):
                project_id = remote_project["project_id"]
                if await session.get(Project, project_id) is None:
                    session.add(Project(
                        id=project_id, tenant_id=settings.demo_tenant_id,
                        name=remote_project["name"], description=remote_project.get("description", ""),
                        status=ProjectStatus(remote_project.get("status", "draft")),
                        created_at=datetime.fromisoformat(remote_project["created_at"]),
                        updated_at=datetime.fromisoformat(remote_project["updated_at"]),
                    ))
                    await session.flush()
                remote_workspace = await cloud.project_workspace(project_id, settings.demo_tenant_id)
                for item in remote_workspace["artifacts"]:
                    if await session.get(Artifact, item["artifact_id"]) is None:
                        session.add(Artifact(
                            id=item["artifact_id"], tenant_id=settings.demo_tenant_id, project_id=project_id,
                            filename=item["filename"], media_type=item["media_type"], size_bytes=int(item["size_bytes"]),
                            storage_key=item["storage_key"], checksum_sha256=item["checksum_sha256"],
                            status=item.get("status", "stored"), created_at=datetime.fromisoformat(item["created_at"]),
                        ))
        await session.commit()
    yield


app = FastAPI(title="OpsWeave API", version="0.1.0", lifespan=lifespan)
app.add_middleware(RateLimitMiddleware, secret=settings.session_secret, table_name=settings.quota_table, enabled=settings.rate_limit_enabled, secure_cookie=settings.environment != "local", aws_region=settings.aws_region)
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type", "Authorization", "X-Tenant-Id", "X-Actor-Id"], expose_headers=["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"])
lambda_handler = Mangum(app, lifespan="auto")


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", environment=settings.environment, aws_configured=bool(settings.artifact_bucket and settings.compilation_queue_url and settings.bedrock_reasoning_model_id and settings.application_table))


@app.get("/v1/workspace", response_model=WorkspaceInfoRead)
async def workspace_info(principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, principal.tenant_id)
    if tenant is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return WorkspaceInfoRead(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        actor_id=principal.actor_id,
        role="owner",
        region=settings.aws_region,
        environment=settings.environment,
        isolation="Dedicated OpsWeave resources",
        rate_limiting=settings.rate_limit_enabled,
        model_alias=settings.bedrock_reasoning_model_id,
        model_calls_configured=bool(settings.model_calls_enabled_parameter),
        max_upload_bytes=settings.max_upload_bytes,
    )


@app.get("/v1/audit-events", response_model=list[AuditEventRead])
async def list_audit_events(
    limit: int = 100,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    safe_limit = min(max(limit, 1), 250)
    events = await session.scalars(
        select(AuditEvent)
        .where(AuditEvent.tenant_id == principal.tenant_id)
        .order_by(AuditEvent.created_at.desc())
        .limit(safe_limit)
    )
    return list(events)


@app.get("/v1/projects", response_model=list[ProjectRead])
async def list_projects(principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    rows = await session.execute(
        select(Project, func.count(Artifact.id))
        .outerjoin(Artifact)
        .where(Project.tenant_id == principal.tenant_id)
        .group_by(Project.id)
        .order_by(Project.updated_at.desc())
    )
    return [ProjectRead.model_validate(project).model_copy(update={"artifact_count": count}) for project, count in rows.all()]


@app.post("/v1/projects", response_model=ProjectRead, status_code=status.HTTP_201_CREATED)
async def create_project(payload: ProjectCreate, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    if await session.get(Tenant, principal.tenant_id) is None:
        raise HTTPException(status_code=403, detail="Unknown tenant")
    project = Project(tenant_id=principal.tenant_id, name=payload.name.strip(), description=payload.description.strip())
    session.add(project)
    await session.flush()
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="project.created", resource_type="project", resource_id=project.id))
    await session.commit()
    await session.refresh(project)
    await cloud.put_project(project)
    return ProjectRead.model_validate(project)


@app.get("/v1/projects/{project_id}/artifacts", response_model=list[ArtifactRead])
async def list_artifacts(project_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    artifacts = (await session.scalars(select(Artifact).where(Artifact.project_id == project_id, Artifact.tenant_id == principal.tenant_id).order_by(Artifact.created_at.desc()))).all()
    return list(artifacts)


@app.post("/v1/projects/{project_id}/artifacts", response_model=ArtifactRead, status_code=status.HTTP_201_CREATED)
async def upload_artifact(project_id: str, upload: UploadFile = File(...), principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    safe_name = Path(upload.filename or "artifact").name
    artifact_id = str(uuid.uuid4())
    local_key = f"{principal.tenant_id}/{project_id}/{artifact_id}/{safe_name}"
    try:
        path, size, checksum = await storage.save_local(local_key, upload.file)
    except ValueError as error:
        raise HTTPException(status_code=413, detail=str(error)) from error
    media_type = upload.content_type or "application/octet-stream"
    storage_key = str(path)
    if settings.artifact_bucket:
        storage_key = f"quarantine/{principal.tenant_id}/{project_id}/{artifact_id}/{safe_name}"
        try:
            await storage.upload_file(path, storage_key, media_type)
        except Exception as error:
            raise HTTPException(status_code=502, detail="Unable to store the artifact in the OpsWeave S3 bucket") from error
    artifact = Artifact(id=artifact_id, tenant_id=principal.tenant_id, project_id=project_id, filename=safe_name, media_type=media_type, size_bytes=size, storage_key=storage_key, checksum_sha256=checksum)
    session.add(artifact)
    await session.flush()
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="artifact.uploaded", resource_type="artifact", resource_id=artifact.id))
    await session.commit()
    await session.refresh(artifact)
    await cloud.put_artifact(artifact)
    return artifact


@app.post("/v1/uploads/presign", response_model=PresignResponse)
async def presign_upload(payload: PresignRequest, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    project = await session.scalar(select(Project).where(Project.id == payload.project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if payload.size_bytes > settings.max_upload_bytes:
        raise HTTPException(status_code=413, detail="File exceeds upload limit")
    if not settings.artifact_bucket:
        return PresignResponse(method="POST", url=f"/v1/projects/{payload.project_id}/artifacts", expires_in=900, storage="local")
    key = f"quarantine/{principal.tenant_id}/{payload.project_id}/{Path(payload.filename).name}"
    signed = storage.presign_post(key, payload.media_type, settings.max_upload_bytes)
    return PresignResponse(method="POST", url=signed["url"], fields=signed["fields"], expires_in=900, storage="s3")


@app.post("/v1/projects/{project_id}/compilations", response_model=CompilationRead, status_code=status.HTTP_202_ACCEPTED)
async def start_compilation(project_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    project = await session.scalar(select(Project).options(selectinload(Project.artifacts)).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    blockers: list[str] = []
    if not project.artifacts:
        blockers.append("Upload at least one source artifact")
    if not settings.artifact_bucket:
        blockers.append("Configure OPSWEAVE_ARTIFACT_BUCKET for Bedrock Data Automation")
    if not settings.bedrock_reasoning_model_id:
        blockers.append("Configure OPSWEAVE_BEDROCK_REASONING_MODEL_ID")
    if not settings.compilation_queue_url:
        blockers.append("Configure OPSWEAVE_COMPILATION_QUEUE_URL")
    if blockers:
        raise HTTPException(status_code=409, detail={"message": "Compilation is not ready", "blockers": blockers})

    job = CompilationJob(
        tenant_id=principal.tenant_id,
        project_id=project.id,
        model_id=settings.bedrock_reasoning_model_id,
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    await cloud.put_compilation(job)

    try:
        job.queue_message_id = await compilation_queue.send(
            job_id=job.id,
            tenant_id=principal.tenant_id,
            project_id=project.id,
        )
    except Exception as error:
        job.status = CompilationStatus.FAILED
        job.error_message = "Unable to hand the compilation to the AWS worker"
        session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="compilation.enqueue_failed", resource_type="compilation", resource_id=job.id))
        await session.commit()
        raise HTTPException(status_code=502, detail=job.error_message) from error

    job.status = CompilationStatus.QUEUED
    project.status = ProjectStatus.COMPILING
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="compilation.queued", resource_type="compilation", resource_id=job.id))
    await session.commit()
    await session.refresh(job)
    await cloud.put_compilation(job)
    return job


@app.get("/v1/compilations/{compilation_id}", response_model=CompilationRead)
async def get_compilation(compilation_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    job = await session.scalar(select(CompilationJob).where(CompilationJob.id == compilation_id, CompilationJob.tenant_id == principal.tenant_id))
    if job is None:
        raise HTTPException(status_code=404, detail="Compilation not found")
    remote = await cloud.get_compilation(job.project_id, job.id)
    if remote:
        job.status = CompilationStatus(remote.get("status", job.status.value))
        job.error_message = remote.get("error_message")
        await session.commit()
        await session.refresh(job)
    return job


@app.get("/v1/projects/{project_id}/workspace")
async def get_project_workspace(project_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    return await cloud.project_workspace(project_id, principal.tenant_id)


@app.post("/v1/projects/{project_id}/conflicts/{conflict_id}/resolve")
async def resolve_conflict(
    project_id: str,
    conflict_id: str,
    resolution: str = Body(embed=True, min_length=2, max_length=2000),
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        result = await cloud.update_conflict(project_id, conflict_id, principal.tenant_id, resolution)
    except Exception as error:
        raise HTTPException(status_code=404, detail="Conflict not found") from error
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="conflict.resolved", resource_type="conflict", resource_id=conflict_id))
    await session.commit()
    return result


@app.post("/v1/workflows/{workflow_id}/publish")
async def publish_workflow(
    workflow_id: str,
    payload: WorkflowPublishRequest,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    project = await session.scalar(select(Project).where(Project.id == payload.project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    if not runtime.enabled:
        raise HTTPException(status_code=409, detail="The Step Functions runtime is not configured")
    try:
        workflow = await runtime.publish(project.id, workflow_id, principal.tenant_id)
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail={"message": "Publication gates did not pass", "blockers": str(error).split("|")}) from error
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="workflow.published", resource_type="workflow", resource_id=workflow_id))
    await session.commit()
    return json_safe(workflow)


@app.post("/v1/executions", status_code=status.HTTP_202_ACCEPTED)
async def create_execution(
    payload: ExecutionCreate,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    project = await session.scalar(select(Project).where(Project.id == payload.project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        execution = await runtime.start_execution(project.id, payload.workflow_id, principal.tenant_id, payload.claim.model_dump())
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="execution.started", resource_type="execution", resource_id=execution["execution_id"]))
    await session.commit()
    return json_safe(execution)


@app.get("/v1/projects/{project_id}/executions")
async def list_executions(project_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    items = await runtime.project_items(project_id, principal.tenant_id)
    executions = sorted((item for item in items if item.get("entity_type") == "execution"), key=lambda item: item.get("created_at", ""), reverse=True)
    return json_safe(executions)


@app.get("/v1/executions/{execution_id}")
async def get_execution(
    execution_id: str,
    project_id: str,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        return await runtime.execution_detail(project_id, execution_id, principal.tenant_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@app.get("/v1/projects/{project_id}/approvals")
async def list_approvals(project_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    items = await runtime.project_items(project_id, principal.tenant_id)
    approvals = sorted((item for item in items if item.get("entity_type") == "approval"), key=lambda item: item.get("created_at", ""), reverse=True)
    for approval in approvals:
        approval.pop("task_token", None)
        approval.pop("execution_context", None)
    return json_safe(approvals)


@app.post("/v1/approvals/{approval_id}/decision")
async def decide_approval(
    approval_id: str,
    payload: ApprovalDecision,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    try:
        result = await runtime.decide(payload.project_id, approval_id, principal.tenant_id, payload.decision, principal.actor_id, payload.reason)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    audit_action = "approval.approved" if payload.decision == "approve" else "approval.rejected"
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action=audit_action, resource_type="approval", resource_id=approval_id))
    await session.commit()
    return result


@app.post("/v1/workflows/{workflow_id}/evaluations", status_code=status.HTTP_201_CREATED)
async def run_evaluation(
    workflow_id: str,
    payload: EvaluationCreate,
    principal: Principal = Depends(get_principal),
    session: AsyncSession = Depends(get_session),
):
    project = await session.scalar(select(Project).where(Project.id == payload.project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    try:
        evaluation = await runtime.evaluate(project.id, workflow_id, principal.tenant_id)
    except ValueError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="evaluation.completed", resource_type="evaluation", resource_id=evaluation["evaluation_id"]))
    await session.commit()
    return evaluation


@app.get("/v1/projects/{project_id}/evaluations")
async def list_evaluations(project_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    project = await session.scalar(select(Project).where(Project.id == project_id, Project.tenant_id == principal.tenant_id))
    if project is None:
        raise HTTPException(status_code=404, detail="Project not found")
    items = await runtime.project_items(project_id, principal.tenant_id)
    evaluations = sorted((item for item in items if item.get("entity_type") == "evaluation"), key=lambda item: item.get("created_at", ""), reverse=True)
    return json_safe(evaluations)


static_portal = Path("/var/task/static")
if static_portal.exists():
    app.mount("/", StaticFiles(directory=static_portal, html=True), name="portal")
