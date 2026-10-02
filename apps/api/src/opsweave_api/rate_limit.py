import asyncio
import base64
import hashlib
import hmac
import json
import threading
import time
from dataclasses import dataclass
from secrets import token_hex

import boto3
from botocore.exceptions import ClientError
from fastapi import Request
from fastapi.responses import JSONResponse, Response
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

COOKIE_NAME = "opsweave_client"
DAY = 86_400


@dataclass(frozen=True)
class Limit:
    requests: int
    window_seconds: int
    bucket: str


@dataclass(frozen=True)
class Policy:
    client: tuple[Limit, ...]
    ip: tuple[Limit, ...]
    tenant: tuple[Limit, ...]
    global_: tuple[Limit, ...]


def policy_for(path: str, method: str) -> Policy | None:
    if method == "GET":
        if path.endswith("/preview") or path.endswith("/preview-url"):
            return Policy(
                client=(Limit(20, DAY, "preview-day-v1"),),
                ip=(Limit(100, DAY, "preview-ip-day-v1"),),
                tenant=(Limit(200, DAY, "preview-tenant-day-v1"),),
                global_=(Limit(500, DAY, "preview-global-day-v1"),),
            )
        # Reads power the live portal. Short windows absorb normal interactive bursts;
        # generous daily ceilings contain sustained abuse without penalizing an open tab.
        # API Gateway provides an additional account-level requests-per-second guard.
        return Policy(
            client=(Limit(300, 60, "read-minute-v4"), Limit(10_000, DAY, "read-day-v4")),
            ip=(Limit(600, 60, "read-ip-minute-v4"), Limit(50_000, DAY, "read-ip-day-v4")),
            tenant=(Limit(100_000, DAY, "read-tenant-day-v4"),),
            global_=(Limit(3_000, 60, "read-global-minute-v4"), Limit(30_000, DAY, "read-global-day-v4")),
        )
    if not path.startswith("/v1/") or method not in {"POST", "PATCH", "DELETE"}:
        return None
    if path.endswith("/compilations"):
        return Policy(
            client=(Limit(2, 3600, "compile-hour-v2"), Limit(2, DAY, "compile-day-v2")),
            ip=(Limit(4, 3600, "compile-ip-hour-v2"), Limit(4, DAY, "compile-ip-day-v2")),
            tenant=(Limit(5, DAY, "compile-tenant-day-v2"),),
            global_=(Limit(8, DAY, "compile-global-day-v2"),),
        )
    if path.endswith("/artifacts") or path == "/v1/uploads/presign":
        return Policy(
            client=(Limit(5, 600, "upload-short-v2"), Limit(5, DAY, "upload-day-v2")),
            ip=(Limit(15, DAY, "upload-ip-day-v2"),),
            tenant=(Limit(20, DAY, "upload-tenant-day-v2"),),
            global_=(Limit(30, DAY, "upload-global-day-v2"),),
        )
    if path == "/v1/executions":
        return Policy(
            client=(Limit(5, DAY, "execution-day-v1"),),
            ip=(Limit(20, DAY, "execution-ip-day-v1"),),
            tenant=(Limit(30, DAY, "execution-tenant-day-v1"),),
            global_=(Limit(50, DAY, "execution-global-day-v1"),),
        )
    if path.endswith("/evaluations"):
        return Policy(
            client=(Limit(3, DAY, "evaluation-day-v1"),),
            ip=(Limit(10, DAY, "evaluation-ip-day-v1"),),
            tenant=(Limit(12, DAY, "evaluation-tenant-day-v1"),),
            global_=(Limit(20, DAY, "evaluation-global-day-v1"),),
        )
    if "/approvals/" in path:
        return Policy(
            client=(Limit(20, 300, "approval-short"),),
            ip=(Limit(60, 300, "approval-ip-short"),),
            tenant=(Limit(300, DAY, "approval-tenant-day"),),
            global_=(Limit(600, DAY, "approval-global-day"),),
        )
    return Policy(
        client=(Limit(60, 60, "write-short"), Limit(500, DAY, "write-day")),
        ip=(Limit(120, 60, "write-ip-short"), Limit(1200, DAY, "write-ip-day")),
        tenant=(Limit(3000, DAY, "write-tenant-day"),),
        global_=(Limit(6000, DAY, "write-global-day"),),
    )


class SignedClientId:
    def __init__(self, secret: str):
        self.key = hashlib.sha256(secret.encode()).digest()

    def encode(self, client_id: str) -> str:
        payload = base64.urlsafe_b64encode(json.dumps({"id": client_id}, separators=(",", ":")).encode()).decode().rstrip("=")
        signature = hmac.new(self.key, payload.encode(), hashlib.sha256).hexdigest()
        return f"{payload}.{signature}"

    def decode(self, token: str) -> str | None:
        try:
            payload, signature = token.rsplit(".", 1)
            expected = hmac.new(self.key, payload.encode(), hashlib.sha256).hexdigest()
            if not hmac.compare_digest(signature, expected):
                return None
            raw = base64.urlsafe_b64decode((payload + "=" * (-len(payload) % 4)).encode())
            client_id = str(json.loads(raw)["id"])
            return client_id if len(client_id) == 32 else None
        except (ValueError, KeyError, json.JSONDecodeError):
            return None


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, secret: str, table_name: str | None, enabled: bool, secure_cookie: bool, aws_region: str):
        super().__init__(app)
        self.enabled = enabled
        self.signer = SignedClientId(secret)
        self.hash_key = hashlib.sha256(secret.encode()).digest()
        self.secure_cookie = secure_cookie
        self.table = boto3.resource("dynamodb", region_name=aws_region).Table(table_name) if enabled and table_name else None
        self.local: dict[str, tuple[int, int]] = {}
        self.blocked: dict[str, int] = {}
        self.lock = threading.Lock()

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        policy = policy_for(request.url.path, request.method)
        if not self.enabled or policy is None:
            return await call_next(request)
        client_id, issued = self._client(request)
        ip_id = self._opaque("ip", request.client.host if request.client else "unknown")
        tenant_id = self._opaque("session", request.cookies["opsweave_access"]) if request.cookies.get("opsweave_access") else request.headers.get("x-tenant-id", "anonymous")[:80]
        checks = (
            *(("client", client_id, limit) for limit in policy.client),
            *(("ip", ip_id, limit) for limit in policy.ip),
            *(("tenant", tenant_id, limit) for limit in policy.tenant),
            *(("global", "opsweave", limit) for limit in policy.global_),
        )
        now = int(time.time())
        violations: list[tuple[str, int]] = []
        primary_count = 0
        for index, (scope, identity, limit) in enumerate(checks):
            window = now // limit.window_seconds
            key = "rl#" + self._opaque(scope, f"{identity}:{limit.bucket}:{window}")
            # Safe reads persist only the global daily circuit breaker. API Gateway
            # provides the account-wide short-window throttle; local checks protect
            # individual warm Lambda workers without multiplying DynamoDB writes.
            durable = request.method != "GET" or (scope == "global" and limit.window_seconds == DAY)
            count = await self._increment(
                key,
                now + limit.window_seconds * 2,
                durable=durable,
                ceiling=limit.requests,
            )
            if index == 0:
                primary_count = count
            if count > limit.requests:
                violations.append((scope, limit.window_seconds - now % limit.window_seconds))
        primary = policy.client[0]
        if violations:
            scope, retry_after = max(violations, key=lambda item: item[1])
            detail = "Shared demo capacity has been reached. Try again later." if scope in {"tenant", "global"} else "Too many requests. Try again later."
            response: Response = JSONResponse(status_code=429, content={"detail": detail}, headers={"Retry-After": str(retry_after)})
        else:
            response = await call_next(request)
        response.headers["X-RateLimit-Limit"] = str(primary.requests)
        response.headers["X-RateLimit-Remaining"] = str(max(0, primary.requests - primary_count))
        if issued:
            response.set_cookie(COOKIE_NAME, self.signer.encode(client_id), max_age=180 * DAY, httponly=True, secure=self.secure_cookie, samesite="lax", path="/")
        return response

    def _client(self, request: Request) -> tuple[str, bool]:
        existing = self.signer.decode(request.cookies.get(COOKIE_NAME, ""))
        return (existing, False) if existing else (token_hex(16), True)

    def _opaque(self, namespace: str, value: str) -> str:
        return hmac.new(self.hash_key, f"{namespace}|{value}".encode(), hashlib.sha256).hexdigest()

    async def _increment(self, key: str, expires_at: int, *, durable: bool = True, ceiling: int | None = None) -> int:
        now = int(time.time())
        if self.blocked.get(key, 0) > now:
            return (ceiling or 0) + 1
        if durable and self.table is not None:
            try:
                result = await asyncio.to_thread(
                    self.table.update_item,
                    Key={"pk": key},
                    UpdateExpression="SET expires_at = if_not_exists(expires_at, :expiry) ADD request_count :one",
                    ConditionExpression="attribute_not_exists(request_count) OR request_count < :ceiling",
                    ExpressionAttributeValues={":expiry": expires_at, ":one": 1, ":ceiling": ceiling},
                    ReturnValues="UPDATED_NEW",
                )
                return int(result["Attributes"]["request_count"])
            except ClientError as error:
                if error.response.get("Error", {}).get("Code") == "ConditionalCheckFailedException":
                    self.blocked[key] = expires_at
                    return (ceiling or 0) + 1
                # API Gateway remains the hard outer throttle. Falling back to the
                # warm worker counter keeps DynamoDB from becoming an availability
                # dependency during a transient service or credential failure.
            except Exception:
                pass
        with self.lock:
            count, expiry = self.local.get(key, (0, expires_at))
            if expiry <= now:
                count, expiry = 0, expires_at
            count += 1
            self.local[key] = (count, expiry)
            return count
