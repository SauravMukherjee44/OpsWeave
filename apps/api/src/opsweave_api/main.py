from contextlib import asynccontextmanager
from datetime import datetime, timezone
import asyncio
import base64
import hashlib
import json
import logging
from pathlib import Path
import secrets
import time
from urllib.parse import urlencode
from urllib.request import Request as UrlRequest, urlopen
import uuid

from fastapi import Body, Depends, FastAPI, File, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse
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
    WorkflowPublishRequest, WorkspaceInfoRead, WorkspacePreferences,
)
from .storage import ArtifactStorage

settings = get_settings()
storage = ArtifactStorage(settings)
compilation_queue = CompilationQueue(settings)
cloud = CloudRepository(settings)
runtime = RuntimeService(settings)
logger = logging.getLogger("opsweave.api")
logger.setLevel(logging.INFO)
workspace_hydration_lock = asyncio.Lock()
hydrated_tenants: set[str] = set()


@asynccontextmanager
async def lifespan(_: FastAPI):
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionFactory() as session:
        tenant = await session.get(Tenant, settings.demo_tenant_id)
        if tenant is None:
            session.add(Tenant(id=settings.demo_tenant_id, name="OpsWeave guided workspace", slug="guided-demo"))
            await session.flush()
        await session.commit()
    yield


async def hydrate_workspace(tenant_id: str | None = None) -> None:
    """Hydrate cloud state only for API requests, never for static asset requests."""
    tenant_id = tenant_id or settings.demo_tenant_id
    cacheable = tenant_id == settings.demo_tenant_id
    if (cacheable and tenant_id in hydrated_tenants) or settings.environment == "local" or not cloud.enabled:
        return
    async with workspace_hydration_lock:
        if cacheable and tenant_id in hydrated_tenants:
            return
        async with SessionFactory() as session:
            for remote_project in await cloud.tenant_projects(tenant_id):
                project_id = remote_project["project_id"]
                project = await session.get(Project, project_id)
                if project is None:
                    session.add(Project(
                        id=project_id, tenant_id=tenant_id,
                        name=remote_project["name"], description=remote_project.get("description", ""),
                        status=ProjectStatus(remote_project.get("status", "draft")),
                        created_at=datetime.fromisoformat(remote_project["created_at"]),
                        updated_at=datetime.fromisoformat(remote_project["updated_at"]),
                    ))
                    await session.flush()
                else:
                    project.name = remote_project["name"]
                    project.description = remote_project.get("description", "")
                    project.status = ProjectStatus(remote_project.get("status", "draft"))
                    project.updated_at = datetime.fromisoformat(remote_project["updated_at"])
                remote_workspace = await cloud.project_workspace(project_id, tenant_id)
                for item in remote_workspace["artifacts"]:
                    artifact = await session.get(Artifact, item["artifact_id"])
                    if artifact is None:
                        session.add(Artifact(
                            id=item["artifact_id"], tenant_id=tenant_id, project_id=project_id,
                            filename=item["filename"], media_type=item["media_type"], size_bytes=int(item["size_bytes"]),
                            storage_key=item["storage_key"], checksum_sha256=item["checksum_sha256"],
                            status=item.get("status", "stored"), created_at=datetime.fromisoformat(item["created_at"]),
                        ))
                    else:
                        artifact.status = item.get("status", artifact.status)
            await session.commit()
        if cacheable:
            hydrated_tenants.add(tenant_id)


app = FastAPI(title="OpsWeave API", version="0.1.0", lifespan=lifespan)
app.add_middleware(RateLimitMiddleware, secret=settings.session_secret, table_name=settings.quota_table, enabled=settings.rate_limit_enabled, secure_cookie=settings.environment != "local", aws_region=settings.aws_region)
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins, allow_credentials=True, allow_methods=["GET", "POST", "PATCH"], allow_headers=["Content-Type", "Authorization", "X-Tenant-Id", "X-Actor-Id"], expose_headers=["Retry-After", "X-RateLimit-Limit", "X-RateLimit-Remaining"])
lambda_handler = Mangum(app, lifespan="auto")


@app.middleware("http")
async def security_headers(request, call_next):
    started_at = time.monotonic()
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("request_failed path=%s method=%s", request.url.path, request.method)
        raise
    duration_ms = round((time.monotonic() - started_at) * 1000)
    if request.url.path.startswith(("/v1", "/auth")):
        logger.info(
            "request_complete path=%s method=%s status=%s duration_ms=%s",
            request.url.path,
            request.method,
            response.status_code,
            duration_ms,
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), geolocation=(), microphone=()"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.middleware("http")
async def hydrate_api_workspace(request, call_next):
    if request.url.path.startswith("/v1"):
        principal = await get_principal(
            request,
            authorization=request.headers.get("authorization"),
            x_tenant_id=request.headers.get("x-tenant-id"),
            x_actor_id=request.headers.get("x-actor-id"),
        )
        await hydrate_workspace(principal.tenant_id)
    return await call_next(request)


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok", environment=settings.environment, aws_configured=bool(settings.artifact_bucket and settings.compilation_queue_url and settings.bedrock_reasoning_model_id and settings.application_table))


def _oauth_redirect(screen_hint: str | None = None) -> RedirectResponse:
    if not settings.cognito_domain or not settings.cognito_client_id:
        raise HTTPException(status_code=503, detail="Hosted sign-in is not configured")
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    state = secrets.token_urlsafe(24)
    query = {
        "client_id": settings.cognito_client_id,
        "response_type": "code",
        "scope": "openid email profile aws.cognito.signin.user.admin",
        "redirect_uri": f"{settings.public_app_url}/auth/callback",
        "state": state,
        "code_challenge_method": "S256",
        "code_challenge": challenge,
    }
    if screen_hint:
        query["screen_hint"] = screen_hint
    response = RedirectResponse(f"https://{settings.cognito_domain}/oauth2/authorize?{urlencode(query)}")
    secure = settings.environment != "local"
    response.set_cookie("opsweave_oauth_state", state, max_age=600, httponly=True, secure=secure, samesite="lax")
    response.set_cookie("opsweave_pkce", verifier, max_age=600, httponly=True, secure=secure, samesite="lax")
    return response


@app.get("/auth/login")
async def auth_login():
    return _oauth_redirect()


@app.get("/auth/signup")
async def auth_signup():
    return _oauth_redirect("signup")


@app.get("/auth/callback")
async def auth_callback(request: Request, code: str, state: str):
    if state != request.cookies.get("opsweave_oauth_state") or not request.cookies.get("opsweave_pkce"):
        raise HTTPException(status_code=400, detail="Sign-in state could not be verified")
    payload = urlencode({
        "grant_type": "authorization_code",
        "client_id": settings.cognito_client_id,
        "code": code,
        "redirect_uri": f"{settings.public_app_url}/auth/callback",
        "code_verifier": request.cookies["opsweave_pkce"],
    }).encode()
    def exchange() -> dict:
        token_request = UrlRequest(f"https://{settings.cognito_domain}/oauth2/token", data=payload, headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urlopen(token_request, timeout=10) as result:
            return json.loads(result.read())
    try:
        tokens = await asyncio.to_thread(exchange)
    except Exception as error:
        raise HTTPException(status_code=401, detail="The authorization code could not be exchanged") from error
    response = RedirectResponse(f"{settings.public_app_url}/?signed_in=1")
    response.set_cookie("opsweave_access", tokens["access_token"], max_age=int(tokens.get("expires_in", 3600)), httponly=True, secure=settings.environment != "local", samesite="lax")
    response.delete_cookie("opsweave_oauth_state")
    response.delete_cookie("opsweave_pkce")
    return response


@app.get("/auth/logout")
async def auth_logout():
    response = RedirectResponse(settings.public_app_url)
    response.delete_cookie("opsweave_access")
    return response


@app.get("/v1/workspace", response_model=WorkspaceInfoRead)
async def workspace_info(principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    tenant = await session.get(Tenant, principal.tenant_id)
    if tenant is None:
        if not principal.authenticated:
            raise HTTPException(status_code=404, detail="Workspace not found")
        tenant = Tenant(id=principal.tenant_id, name=(principal.email or "My").split("@")[0].replace(".", " ").title() + " workspace", slug=f"workspace-{principal.tenant_id[:8]}")
        session.add(tenant)
        await session.commit()
    preferences = await cloud.workspace_preferences(principal.tenant_id)
    return WorkspaceInfoRead(
        tenant_id=tenant.id,
        tenant_name=tenant.name,
        actor_id=principal.actor_id,
        role="owner" if principal.authenticated else "demo guest",
        region=settings.aws_region,
        environment=settings.environment,
        isolation="Dedicated OpsWeave resources",
        rate_limiting=settings.rate_limit_enabled,
        model_alias=settings.bedrock_reasoning_model_id,
        model_calls_configured=bool(settings.model_calls_enabled_parameter),
        max_upload_bytes=settings.max_upload_bytes,
        preferences=preferences,
    )


@app.patch("/v1/workspace/preferences", response_model=WorkspacePreferences)
async def update_workspace_preferences(payload: WorkspacePreferences, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    if not principal.authenticated:
        raise HTTPException(status_code=401, detail="Sign in to configure a private workspace")
    preferences = payload.model_dump()
    await cloud.put_workspace_preferences(principal.tenant_id, preferences)
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="workspace.preferences_updated", resource_type="workspace", resource_id=principal.tenant_id))
    await session.commit()
    return payload


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
    if not principal.authenticated:
        raise HTTPException(status_code=401, detail="Sign in to create a private workspace project")
    if await session.get(Tenant, principal.tenant_id) is None:
        session.add(Tenant(id=principal.tenant_id, name=(principal.email or "My").split("@")[0].replace(".", " ").title() + " workspace", slug=f"workspace-{principal.tenant_id[:8]}"))
        await session.flush()
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
    if not principal.authenticated:
        raise HTTPException(status_code=401, detail="Sign in to upload sources to a private workspace")
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
        finally:
            path.unlink(missing_ok=True)
    artifact = Artifact(id=artifact_id, tenant_id=principal.tenant_id, project_id=project_id, filename=safe_name, media_type=media_type, size_bytes=size, storage_key=storage_key, checksum_sha256=checksum)
    session.add(artifact)
    await session.flush()
    session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="artifact.uploaded", resource_type="artifact", resource_id=artifact.id))
    await session.commit()
    await session.refresh(artifact)
    await cloud.put_artifact(artifact)
    return artifact


@app.get("/v1/artifacts/{artifact_id}/preview")
async def preview_artifact(artifact_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    artifact = await session.scalar(select(Artifact).where(Artifact.id == artifact_id, Artifact.tenant_id == principal.tenant_id))
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if settings.artifact_bucket and artifact.storage_key.startswith("quarantine/"):
        return RedirectResponse(storage.presign_get(artifact.storage_key, artifact.filename), status_code=307)
    path = Path(artifact.storage_key)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Artifact content is unavailable")
    return FileResponse(path, media_type=artifact.media_type, filename=artifact.filename, content_disposition_type="inline")


@app.get("/v1/artifacts/{artifact_id}/preview-url")
async def preview_artifact_url(artifact_id: str, principal: Principal = Depends(get_principal), session: AsyncSession = Depends(get_session)):
    artifact = await session.scalar(select(Artifact).where(Artifact.id == artifact_id, Artifact.tenant_id == principal.tenant_id))
    if artifact is None:
        raise HTTPException(status_code=404, detail="Artifact not found")
    if settings.artifact_bucket and artifact.storage_key.startswith("quarantine/"):
        text_types = {"application/json", "application/yaml", "application/x-yaml", "text/yaml", "text/csv"}
        if artifact.media_type.startswith("text/") or artifact.media_type in text_types:
            content, truncated = await storage.read_text(artifact.storage_key)
            return {"url": storage.presign_get(artifact.storage_key, artifact.filename), "expires_in": 300, "content": content, "truncated": truncated}
        return {"url": storage.presign_get(artifact.storage_key, artifact.filename), "expires_in": 300}
    return {"url": f"/v1/artifacts/{artifact_id}/preview", "expires_in": 300}


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
        project.status = ProjectStatus.FAILED
        session.add(AuditEvent(tenant_id=principal.tenant_id, actor_id=principal.actor_id, action="compilation.enqueue_failed", resource_type="compilation", resource_id=job.id))
        await session.commit()
        await cloud.put_compilation(job)
        await cloud.put_project(project)
        logger.exception("Compilation enqueue failed for job %s", job.id)
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
    if not runtime.enabled:
        raise HTTPException(status_code=409, detail="The Step Functions runtime is not configured")
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
    if not runtime.enabled:
        raise HTTPException(status_code=409, detail="The Step Functions runtime is not configured")
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
    if not runtime.enabled:
        raise HTTPException(status_code=409, detail="The Step Functions runtime is not configured")
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
    if not runtime.enabled:
        raise HTTPException(status_code=409, detail="The Step Functions runtime is not configured")
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
