from pydantic import BaseModel

from opsweave_api.config import Settings
from opsweave_api.model_gateway import ModelGateway


class Decision(BaseModel):
    outcome: str


async def test_structured_gateway_repairs_once(monkeypatch):
    gateway = ModelGateway(Settings(bedrock_reasoning_model_id="model"))
    outputs = iter(["not-json", '{"outcome":"review"}'])

    async def fake_converse(**_kwargs):
        return next(outputs)

    monkeypatch.setattr(gateway, "_converse", fake_converse)
    result = await gateway.structured(system="system", prompt="prompt", schema=Decision, request_id="r1")
    assert result.outcome == "review"
