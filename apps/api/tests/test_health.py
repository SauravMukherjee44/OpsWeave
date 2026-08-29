import os

os.environ.setdefault("OPSWEAVE_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("OPSWEAVE_ENVIRONMENT", "test")

from fastapi.testclient import TestClient

from opsweave_api.main import app


def test_health_exposes_configuration_state():
    response = TestClient(app).get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert isinstance(response.json()["aws_configured"], bool)
