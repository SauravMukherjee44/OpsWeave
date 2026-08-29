from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    environment: str = "local"
    database_url: str = "sqlite+aiosqlite:///./opsweave.db"
    cors_origins: str = "http://localhost:3000"
    local_upload_dir: Path = Path("./.data/uploads")
    aws_region: str = "us-east-1"
    artifact_bucket: str | None = None
    compilation_queue_url: str | None = None
    application_table: str | None = None
    bedrock_reasoning_model_id: str | None = None
    quota_table: str | None = None
    rate_limit_enabled: bool = False
    session_secret: str = "local-development-secret-change-before-deploy"
    model_calls_enabled_parameter: str | None = None
    claims_state_machine_arn: str | None = None
    max_upload_bytes: int = 25 * 1024 * 1024
    demo_tenant_id: str = "00000000-0000-0000-0000-000000000001"

    model_config = SettingsConfigDict(env_prefix="OPSWEAVE_", env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
