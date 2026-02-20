"""
PACO Settings API

Read-only endpoint for global API key status.
"""

import os
from typing import Any, Dict, List

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/settings", tags=["Settings"])


class ApiKeyStatus(BaseModel):
    provider: str
    configured: bool
    env_var: str


class GlobalApiKeysResponse(BaseModel):
    keys: List[ApiKeyStatus]


# Provider → environment variable mapping
_PROVIDER_KEYS = {
    "Anthropic": "ANTHROPIC_API_KEY",
    "OpenAI": "OPENAI_API_KEY",
    "Google": "GOOGLE_API_KEY",
    "Mistral": "MISTRAL_API_KEY",
}


@router.get("/api-keys", response_model=GlobalApiKeysResponse)
async def get_global_api_keys() -> GlobalApiKeysResponse:
    """Return which global API keys are configured (read-only)."""
    keys = []
    for provider, env_var in _PROVIDER_KEYS.items():
        value = os.environ.get(env_var, "")
        keys.append(ApiKeyStatus(
            provider=provider,
            configured=bool(value),
            env_var=env_var,
        ))
    return GlobalApiKeysResponse(keys=keys)
