from dataclasses import dataclass

from fastapi import Header, HTTPException, status


@dataclass(frozen=True)
class Principal:
    tenant_id: str
    actor_id: str


async def get_principal(
    x_tenant_id: str | None = Header(default=None),
    x_actor_id: str | None = Header(default=None),
) -> Principal:
    # Local development uses explicit headers. Production API Gateway replaces
    # these values from verified Cognito JWT claims and strips client headers.
    if not x_tenant_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing tenant identity")
    return Principal(tenant_id=x_tenant_id, actor_id=x_actor_id or "local-user")
