import asyncio
import json
from typing import Any

import boto3
from pydantic import BaseModel, ValidationError

from .config import Settings


class ModelGatewayError(RuntimeError):
    pass


class ModelGateway:
    """Provider-neutral, structured Bedrock gateway with one bounded repair."""

    def __init__(self, settings: Settings):
        self.settings = settings

    async def structured(self, *, system: str, prompt: str, schema: type[BaseModel], request_id: str) -> BaseModel:
        if not self.settings.bedrock_reasoning_model_id:
            raise ModelGatewayError("Bedrock reasoning model is not configured")
        first = await self._converse(system=system, prompt=prompt, request_id=request_id)
        try:
            return schema.model_validate_json(first)
        except (ValidationError, json.JSONDecodeError) as error:
            repair = await self._converse(
                system="Return only JSON matching the supplied schema. Do not add facts or commentary.",
                prompt=f"Schema: {json.dumps(schema.model_json_schema())}\nInvalid output: {first}",
                request_id=f"{request_id}-repair",
            )
            try:
                return schema.model_validate_json(repair)
            except (ValidationError, json.JSONDecodeError) as repair_error:
                raise ModelGatewayError("Model output failed schema validation after one repair") from repair_error

    async def _converse(self, *, system: str, prompt: str, request_id: str) -> str:
        def invoke() -> dict[str, Any]:
            client = boto3.client("bedrock-runtime", region_name=self.settings.aws_region)
            return client.converse(
                modelId=self.settings.bedrock_reasoning_model_id,
                system=[{"text": system}],
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                inferenceConfig={"maxTokens": 1800, "temperature": 0.1},
                requestMetadata={"application": "OpsWeave", "request_id": request_id},
            )

        response = await asyncio.to_thread(invoke)
        blocks = response.get("output", {}).get("message", {}).get("content", [])
        text = "".join(block.get("text", "") for block in blocks if "text" in block).strip()
        if not text:
            raise ModelGatewayError("Bedrock returned no text output")
        return text
