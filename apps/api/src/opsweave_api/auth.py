import asyncio
import uuid
from dataclasses import dataclass

import boto3
from fastapi import Header, HTTPException, Request, status

from .config import get_settings


@dataclass(frozen=True)
class Principal:
    tenant_id: str
    actor_id: str
    email: str | None = None
    authenticated: bool = False


def _cognito_identity(access_token: str) -> dict[str, str]:
    response = boto3.client("cognito-idp", region_name=get_settings().aws_region).get_user(AccessToken=access_token)
    return {item["Name"]: item["Value"] for item in response.get("UserAttributes", [])}


async def get_principal(
    request: Request,
    authorization: str | None = Header(default=None),
    x_tenant_id: str | None = Header(default=None),
    x_actor_id: str | None = Header(default=None),
) -> Principal:
    settings = get_settings()
    token = authorization.removeprefix("Bearer ").strip() if authorization and authorization.startswith("Bearer ") else request.cookies.get("opsweave_access")
    if token:
        try:
            attributes = await asyncio.to_thread(_cognito_identity, token)
            subject = attributes["sub"]
            return Principal(
                tenant_id=str(uuid.uuid5(uuid.NAMESPACE_URL, f"opsweave:user:{subject}")),
                actor_id=subject,
                email=attributes.get("email"),
                authenticated=True,
            )
        except Exception as error:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session is invalid or expired") from error
    if settings.environment == "local" and x_tenant_id:
        return Principal(tenant_id=x_tenant_id, actor_id=x_actor_id or "local-user", authenticated=True)
    return Principal(tenant_id=settings.demo_tenant_id, actor_id="demo-visitor", authenticated=False)


async def require_member(principal: Principal = None) -> Principal:
    if principal is None or not principal.authenticated:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in to create or modify a private workspace")
    return principal
