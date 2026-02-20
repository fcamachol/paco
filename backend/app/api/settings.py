"""
PACO Settings API

Endpoints for managing global API keys (DB-stored as primary, env var as fallback).
"""

import os
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete

router = APIRouter(prefix="/settings", tags=["Settings"])


class ApiKeyStatus(BaseModel):
    provider: str
    configured: bool
    env_var: str
    source: str  # "database" | "environment" | "none"


class GlobalApiKeysResponse(BaseModel):
    keys: List[ApiKeyStatus]


class SaveApiKeyRequest(BaseModel):
    value: str


# Provider → environment variable mapping
_PROVIDER_KEYS = {
    "Anthropic": "ANTHROPIC_API_KEY",
    "OpenAI": "OPENAI_API_KEY",
    "Google": "GOOGLE_API_KEY",
    "Mistral": "MISTRAL_API_KEY",
}

# Reverse lookup: env_var → provider
_ENV_TO_PROVIDER = {v: k for k, v in _PROVIDER_KEYS.items()}


async def _get_db_setting(key: str) -> Optional[str]:
    """Fetch a value from global_settings by key. Returns None if not found."""
    try:
        from app.db.session import async_session_maker
        from app.db.models import GlobalSetting

        async with async_session_maker() as db:
            result = await db.execute(
                select(GlobalSetting).where(GlobalSetting.key == key)
            )
            setting = result.scalar_one_or_none()
            return setting.value if setting else None
    except Exception:
        return None


@router.get("/api-keys", response_model=GlobalApiKeysResponse)
async def get_global_api_keys() -> GlobalApiKeysResponse:
    """Return status for each provider: DB first (primary), env var as fallback."""
    from app.db.session import async_session_maker
    from app.db.models import GlobalSetting

    # Fetch all global settings in one query
    db_values: dict[str, str] = {}
    try:
        async with async_session_maker() as db:
            result = await db.execute(
                select(GlobalSetting).where(
                    GlobalSetting.key.in_(list(_PROVIDER_KEYS.values()))
                )
            )
            for setting in result.scalars():
                db_values[setting.key] = setting.value
    except Exception:
        pass

    keys = []
    for provider, env_var in _PROVIDER_KEYS.items():
        db_val = db_values.get(env_var)
        env_val = os.environ.get(env_var, "")

        if db_val:
            source = "database"
            configured = True
        elif env_val:
            source = "environment"
            configured = True
        else:
            source = "none"
            configured = False

        keys.append(ApiKeyStatus(
            provider=provider,
            configured=configured,
            env_var=env_var,
            source=source,
        ))
    return GlobalApiKeysResponse(keys=keys)


@router.put("/api-keys/{provider}")
async def save_api_key(provider: str, body: SaveApiKeyRequest):
    """Save or update an API key in the database."""
    env_var = _PROVIDER_KEYS.get(provider)
    if not env_var:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")

    if not body.value.strip():
        raise HTTPException(status_code=422, detail="API key value cannot be empty")

    from app.db.session import async_session_maker
    from app.db.models import GlobalSetting

    async with async_session_maker() as db:
        result = await db.execute(
            select(GlobalSetting).where(GlobalSetting.key == env_var)
        )
        existing = result.scalar_one_or_none()

        if existing:
            existing.value = body.value.strip()
        else:
            db.add(GlobalSetting(
                key=env_var,
                value=body.value.strip(),
                is_secret=True,
            ))
        await db.commit()

    return {"status": "saved", "provider": provider, "source": "database"}


@router.delete("/api-keys/{provider}")
async def delete_api_key(provider: str):
    """Remove an API key from the database."""
    env_var = _PROVIDER_KEYS.get(provider)
    if not env_var:
        raise HTTPException(status_code=404, detail=f"Unknown provider: {provider}")

    from app.db.session import async_session_maker
    from app.db.models import GlobalSetting

    async with async_session_maker() as db:
        result = await db.execute(
            delete(GlobalSetting).where(GlobalSetting.key == env_var)
        )
        await db.commit()

        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="No database key found for this provider")

    return {"status": "deleted", "provider": provider}
