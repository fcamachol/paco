"""
Provider-aware health checks for external services.

Each known provider has a lightweight validation check (API key validity,
endpoint reachability). Unknown providers fall back to a generic HTTP check.
"""

import os
import time
from dataclasses import dataclass
from typing import Optional

import httpx
from sqlalchemy import select


@dataclass
class HealthCheckResult:
    status: str  # "online" | "offline" | "error" | "unconfigured"
    response_time_ms: int = 0
    error: Optional[str] = None


async def _resolve_api_key(env_var: Optional[str]) -> Optional[str]:
    """Resolve API key from GlobalSetting (DB) first, then env var."""
    if not env_var:
        return None
    try:
        from app.db.session import async_session_maker
        from app.db.models import GlobalSetting
        async with async_session_maker() as db:
            result = await db.execute(
                select(GlobalSetting).where(GlobalSetting.key == env_var)
            )
            setting = result.scalar_one_or_none()
            if setting and setting.value:
                return setting.value
    except Exception:
        pass
    return os.environ.get(env_var, "") or None


async def _check_anthropic(base_url: str, api_key: str) -> HealthCheckResult:
    """Anthropic: POST /v1/messages with max_tokens=1, expect 200."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"{base_url}/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 1,
                    "messages": [{"role": "user", "content": "hi"}],
                },
            )
            ms = int((time.monotonic() - start) * 1000)
            if resp.status_code == 200:
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"HTTP {resp.status_code}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_openai(base_url: str, api_key: str) -> HealthCheckResult:
    """OpenAI: GET /v1/models, confirms key validity."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/v1/models",
                headers={"Authorization": f"Bearer {api_key}"},
            )
            ms = int((time.monotonic() - start) * 1000)
            if resp.status_code == 200:
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"HTTP {resp.status_code}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_gemini(base_url: str, api_key: str) -> HealthCheckResult:
    """Gemini: GET /v1beta/models, confirms key validity."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/v1beta/models",
                params={"key": api_key},
            )
            ms = int((time.monotonic() - start) * 1000)
            if resp.status_code == 200:
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"HTTP {resp.status_code}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_google_maps(base_url: str, api_key: str) -> HealthCheckResult:
    """Google Maps: GET geocode with known coords."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/maps/api/geocode/json",
                params={"latlng": "20.5888,-100.3899", "language": "es", "key": api_key},
            )
            ms = int((time.monotonic() - start) * 1000)
            data = resp.json()
            if resp.status_code == 200 and data.get("status") in ("OK", "ZERO_RESULTS"):
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"status={data.get('status', resp.status_code)}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_chatwoot(base_url: str, api_key: str) -> HealthCheckResult:
    """Chatwoot: GET /api/v1/profile with token."""
    start = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/api/v1/profile",
                headers={"api_access_token": api_key},
            )
            ms = int((time.monotonic() - start) * 1000)
            if resp.status_code == 200:
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"HTTP {resp.status_code}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_cea_api(base_url: str, auth_config: dict) -> HealthCheckResult:
    """CEA API: GET through proxy to confirm reachability."""
    start = time.monotonic()
    proxy_url = auth_config.get("proxy_url", "")
    try:
        transport = httpx.AsyncHTTPTransport(proxy=proxy_url) if proxy_url else None
        async with httpx.AsyncClient(timeout=10.0, transport=transport) as client:
            resp = await client.get(base_url)
            ms = int((time.monotonic() - start) * 1000)
            # CEA returns various codes; any response means reachable
            if resp.status_code < 500:
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"HTTP {resp.status_code}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_langfuse(base_url: str, auth_config: dict) -> HealthCheckResult:
    """Langfuse: GET /api/public/health with basic auth."""
    start = time.monotonic()
    pub_key = auth_config.get("public_key", "")
    secret_key = auth_config.get("secret_key", "")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{base_url}/api/public/health",
                auth=(pub_key, secret_key) if pub_key else None,
            )
            ms = int((time.monotonic() - start) * 1000)
            if resp.status_code == 200:
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"HTTP {resp.status_code}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_postgres(auth_config: dict) -> HealthCheckResult:
    """PostgreSQL: connect and SELECT 1."""
    start = time.monotonic()
    try:
        import asyncpg
        conn = await asyncpg.connect(
            host=auth_config.get("host", "localhost"),
            port=int(auth_config.get("port", 5432)),
            user=auth_config.get("user", "postgres"),
            password=auth_config.get("password", ""),
            database=auth_config.get("database", "postgres"),
            timeout=10,
        )
        await conn.execute("SELECT 1")
        await conn.close()
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("online", ms)
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def _check_generic_http(
    url: str, method: str = "GET", api_key: Optional[str] = None
) -> HealthCheckResult:
    """Generic HTTP health check — GET/POST to URL, expect 2xx."""
    start = time.monotonic()
    try:
        headers = {}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.request(method, url, headers=headers)
            ms = int((time.monotonic() - start) * 1000)
            if 200 <= resp.status_code < 300:
                return HealthCheckResult("online", ms)
            return HealthCheckResult("error", ms, f"HTTP {resp.status_code}")
    except Exception as e:
        ms = int((time.monotonic() - start) * 1000)
        return HealthCheckResult("offline", ms, str(e))


async def check_service_health(service) -> HealthCheckResult:
    """Main dispatcher: route to provider-specific check or generic fallback."""
    api_key = await _resolve_api_key(service.api_key_env_var)
    base_url = (service.base_url or "").rstrip("/")
    provider = service.provider

    # Check if key is required but missing
    if provider not in ("cea_api", "langfuse", "postgres_ext", "custom") and not api_key:
        return HealthCheckResult("unconfigured", 0, f"No API key for {service.api_key_env_var}")

    if provider == "anthropic":
        return await _check_anthropic(base_url, api_key)
    elif provider == "openai":
        return await _check_openai(base_url, api_key)
    elif provider == "gemini":
        return await _check_gemini(base_url, api_key)
    elif provider == "google_maps":
        return await _check_google_maps(base_url, api_key)
    elif provider == "chatwoot":
        if not api_key:
            return HealthCheckResult("unconfigured", 0, "No CHATWOOT_API_TOKEN")
        return await _check_chatwoot(base_url, api_key)
    elif provider == "cea_api":
        return await _check_cea_api(base_url, service.auth_config or {})
    elif provider == "langfuse":
        return await _check_langfuse(base_url, service.auth_config or {})
    elif provider == "postgres_ext":
        return await _check_postgres(service.auth_config or {})
    else:
        # Custom / unknown provider: generic HTTP
        url = service.health_check_endpoint or base_url
        if not url:
            return HealthCheckResult("error", 0, "No URL configured")
        return await _check_generic_http(url, service.health_check_method or "GET", api_key)
