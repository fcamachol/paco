# Services & Integrations Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Services & Integrations health dashboard to PACO — DB model, CRUD API, provider-aware health checks, auto-seeding, and a two-column frontend page.

**Architecture:** New `ExternalService` SQLAlchemy model with Alembic migration. FastAPI router for CRUD + health checks. Provider-aware health check service with generic HTTP fallback. Next.js page at `/services` with React Query. Auto-seed on startup from configured API keys.

**Tech Stack:** Python/FastAPI, SQLAlchemy, Alembic, httpx, Next.js, React Query, Tailwind CSS, Lucide icons.

**Design Doc:** `docs/plans/2026-02-25-services-integrations-design.md`

---

### Task 1: Database Model

**Files:**
- Modify: `backend/app/db/models.py` (add ExternalService class after McpServer)

**Step 1: Add ExternalService model**

Add after the `McpServer` class (around line 103), before `Tool`:

```python
class ExternalService(Base):
    """External service integration registry."""

    __tablename__ = "external_services"

    id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        primary_key=True,
        server_default=func.uuid_generate_v4(),
    )
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    service_type: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")
    provider: Mapped[str] = mapped_column(String(50), nullable=False, default="custom")
    base_url: Mapped[Optional[str]] = mapped_column(String(500))
    api_key_env_var: Mapped[Optional[str]] = mapped_column(String(255))
    auth_config: Mapped[Dict[str, Any]] = mapped_column(JSONB, default=dict)
    health_check_endpoint: Mapped[Optional[str]] = mapped_column(String(500))
    health_check_method: Mapped[str] = mapped_column(String(10), default="GET")
    status: Mapped[str] = mapped_column(String(50), default="unknown")
    last_health_check: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    response_time_ms: Mapped[Optional[int]] = mapped_column(Integer)
    last_error: Mapped[Optional[str]] = mapped_column(Text)
    is_auto_seeded: Mapped[bool] = mapped_column(Boolean, default=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
```

**Step 2: Commit**

```bash
git add backend/app/db/models.py
git commit -m "feat(services): add ExternalService database model"
```

---

### Task 2: Alembic Migration

**Files:**
- Create: `backend/alembic/versions/014_add_external_services.py`

**Step 1: Create migration file**

```python
"""add external_services table

Revision ID: 014_add_external_services
Revises: 013_add_skill_body_column
Create Date: 2026-02-25
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "014_add_external_services"
down_revision = "013_add_skill_body_column"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if "external_services" in inspector.get_table_names():
        return

    op.create_table(
        "external_services",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("name", sa.String(255), unique=True, nullable=False),
        sa.Column("service_type", sa.String(50), nullable=False, server_default="custom"),
        sa.Column("provider", sa.String(50), nullable=False, server_default="custom"),
        sa.Column("base_url", sa.String(500), nullable=True),
        sa.Column("api_key_env_var", sa.String(255), nullable=True),
        sa.Column("auth_config", JSONB, nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("health_check_endpoint", sa.String(500), nullable=True),
        sa.Column("health_check_method", sa.String(10), nullable=False, server_default="GET"),
        sa.Column("status", sa.String(50), nullable=False, server_default="unknown"),
        sa.Column("last_health_check", sa.DateTime(timezone=True), nullable=True),
        sa.Column("response_time_ms", sa.Integer, nullable=True),
        sa.Column("last_error", sa.Text, nullable=True),
        sa.Column("is_auto_seeded", sa.Boolean, nullable=False, server_default=sa.text("false")),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_external_services_provider", "external_services", ["provider"])
    op.create_index("ix_external_services_service_type", "external_services", ["service_type"])


def downgrade() -> None:
    op.drop_index("ix_external_services_service_type")
    op.drop_index("ix_external_services_provider")
    op.drop_table("external_services")
```

**Step 2: Commit**

```bash
git add backend/alembic/versions/014_add_external_services.py
git commit -m "feat(services): add external_services migration"
```

---

### Task 3: Provider-Aware Health Check Service

**Files:**
- Create: `backend/app/services/external_service_health.py`

**Step 1: Create the health check service**

This module contains `check_service_health(service: ExternalService) -> HealthCheckResult` which dispatches to provider-specific checks.

```python
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
```

**Step 2: Commit**

```bash
git add backend/app/services/external_service_health.py
git commit -m "feat(services): add provider-aware health check service"
```

---

### Task 4: Backend API Router

**Files:**
- Create: `backend/app/api/services.py`

**Step 1: Create the services router**

```python
"""
PACO External Services API

CRUD and health checks for external service integrations.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession, OperatorUser
from app.db.models import ExternalService
from app.services.external_service_health import check_service_health

router = APIRouter(prefix="/services", tags=["Services"])
logger = logging.getLogger(__name__)


# =============================================================================
# Schemas
# =============================================================================


class ExternalServiceResponse(BaseModel):
    """External service response model."""

    id: str
    name: str
    service_type: str
    provider: str
    base_url: Optional[str]
    api_key_env_var: Optional[str]
    auth_config: Dict[str, Any] = {}
    health_check_endpoint: Optional[str]
    health_check_method: str
    status: str
    last_health_check: Optional[datetime]
    response_time_ms: Optional[int]
    last_error: Optional[str]
    is_auto_seeded: bool
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreateServiceRequest(BaseModel):
    """Create external service request."""

    name: str
    service_type: str = "custom"
    provider: str = "custom"
    base_url: Optional[str] = None
    api_key_env_var: Optional[str] = None
    auth_config: Dict[str, Any] = {}
    health_check_endpoint: Optional[str] = None
    health_check_method: str = "GET"
    description: Optional[str] = None


class UpdateServiceRequest(BaseModel):
    """Update external service request."""

    name: Optional[str] = None
    service_type: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key_env_var: Optional[str] = None
    auth_config: Optional[Dict[str, Any]] = None
    health_check_endpoint: Optional[str] = None
    health_check_method: Optional[str] = None
    description: Optional[str] = None


def _service_response(service: ExternalService) -> ExternalServiceResponse:
    return ExternalServiceResponse(
        id=str(service.id),
        name=service.name,
        service_type=service.service_type,
        provider=service.provider,
        base_url=service.base_url,
        api_key_env_var=service.api_key_env_var,
        auth_config=service.auth_config or {},
        health_check_endpoint=service.health_check_endpoint,
        health_check_method=service.health_check_method,
        status=service.status,
        last_health_check=service.last_health_check,
        response_time_ms=service.response_time_ms,
        last_error=service.last_error,
        is_auto_seeded=service.is_auto_seeded,
        description=service.description,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


# =============================================================================
# CRUD Endpoints
# =============================================================================


@router.get("", response_model=List[ExternalServiceResponse])
async def list_services(
    db: DbSession,
    _: OperatorUser,
) -> List[ExternalServiceResponse]:
    """List all external services."""
    result = await db.execute(
        select(ExternalService).order_by(ExternalService.service_type, ExternalService.name)
    )
    return [_service_response(s) for s in result.scalars().all()]


@router.post("", response_model=ExternalServiceResponse, status_code=201)
async def create_service(
    body: CreateServiceRequest,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Create a new external service."""
    existing = await db.execute(
        select(ExternalService).where(ExternalService.name == body.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Service '{body.name}' already exists")

    service = ExternalService(
        name=body.name,
        service_type=body.service_type,
        provider=body.provider,
        base_url=body.base_url,
        api_key_env_var=body.api_key_env_var,
        auth_config=body.auth_config,
        health_check_endpoint=body.health_check_endpoint,
        health_check_method=body.health_check_method,
        description=body.description,
    )
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return _service_response(service)


@router.get("/{service_id}", response_model=ExternalServiceResponse)
async def get_service(
    service_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Get a single external service."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")
    return _service_response(service)


@router.put("/{service_id}", response_model=ExternalServiceResponse)
async def update_service(
    service_id: UUID,
    body: UpdateServiceRequest,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Update an external service."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(service, field, value)

    await db.commit()
    await db.refresh(service)
    return _service_response(service)


@router.delete("/{service_id}", status_code=204)
async def delete_service(
    service_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete an external service (admin only)."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")

    await db.delete(service)
    await db.commit()


# =============================================================================
# Health Check Endpoints
# =============================================================================


@router.post("/{service_id}/health", response_model=ExternalServiceResponse)
async def check_single_health(
    service_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Run health check for a single service."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")

    health = await check_service_health(service)
    service.status = health.status
    service.response_time_ms = health.response_time_ms
    service.last_error = health.error
    service.last_health_check = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(service)
    return _service_response(service)


@router.post("/health/all", response_model=List[ExternalServiceResponse])
async def check_all_health(
    db: DbSession,
    _: OperatorUser,
) -> List[ExternalServiceResponse]:
    """Run health checks for all services."""
    result = await db.execute(
        select(ExternalService).order_by(ExternalService.service_type, ExternalService.name)
    )
    services = result.scalars().all()

    responses = []
    for service in services:
        health = await check_service_health(service)
        service.status = health.status
        service.response_time_ms = health.response_time_ms
        service.last_error = health.error
        service.last_health_check = datetime.now(timezone.utc)
        responses.append(_service_response(service))

    await db.commit()
    return responses
```

**Step 2: Commit**

```bash
git add backend/app/api/services.py
git commit -m "feat(services): add CRUD and health check API endpoints"
```

---

### Task 5: Register Router + Auto-Seed in main.py

**Files:**
- Modify: `backend/app/main.py`

**Step 1: Add import at top (line 16)**

Add `services as services_api` to the existing import line:

```python
from app.api import agents, auth, codegen, company, executions, hive, infrastructures, infra_codegen, infra_deploy, infra_monitor, infra_upgrade, playground, proxy, services as services_api, settings as settings_api, skills, tools, users, workflows, ws
```

**Step 2: Add seed function after `_sync_tools_on_startup` (around line 149)**

```python
async def _seed_external_services():
    """Auto-seed external services from configured API keys."""
    import os
    from app.db.models import ExternalService, GlobalSetting

    SEED_DEFS = [
        {
            "provider": "anthropic",
            "name": "Anthropic Claude API",
            "service_type": "llm_provider",
            "base_url": "https://api.anthropic.com",
            "api_key_env_var": "ANTHROPIC_API_KEY",
        },
        {
            "provider": "openai",
            "name": "OpenAI Whisper",
            "service_type": "media_processor",
            "base_url": "https://api.openai.com",
            "api_key_env_var": "OPENAI_API_KEY",
        },
        {
            "provider": "gemini",
            "name": "Google Gemini",
            "service_type": "media_processor",
            "base_url": "https://generativelanguage.googleapis.com",
            "api_key_env_var": "GEMINI_API_KEY",
        },
        {
            "provider": "google_maps",
            "name": "Google Maps",
            "service_type": "integration",
            "base_url": "https://maps.googleapis.com",
            "api_key_env_var": "GOOGLE_MAPS_API_KEY",
        },
        {
            "provider": "chatwoot",
            "name": "Chatwoot",
            "service_type": "integration",
            "base_url": os.environ.get("CHATWOOT_BASE_URL", ""),
            "api_key_env_var": "CHATWOOT_API_TOKEN",
        },
        {
            "provider": "cea_api",
            "name": "CEA API",
            "service_type": "integration",
            "base_url": "https://aquacis-cf.ceaqueretaro.gob.mx",
            "api_key_env_var": None,
            "auth_config": {"proxy_url": os.environ.get("CEA_PROXY_URL", "")},
        },
        {
            "provider": "langfuse",
            "name": "Langfuse",
            "service_type": "observability",
            "base_url": settings.langfuse_host,
            "api_key_env_var": None,
            "auth_config": {
                "public_key": settings.langfuse_public_key,
                "secret_key": settings.langfuse_secret_key,
            },
        },
        {
            "provider": "postgres_ext",
            "name": "Agora Database",
            "service_type": "database",
            "base_url": None,
            "api_key_env_var": None,
            "auth_config": {
                "host": os.environ.get("PGHOST", ""),
                "port": os.environ.get("PGPORT", "5432"),
                "user": os.environ.get("PGUSER", ""),
                "password": os.environ.get("PGPASSWORD", ""),
                "database": os.environ.get("PGDATABASE", ""),
            },
        },
    ]

    try:
        async with async_session_maker() as db:
            # Load DB-stored API keys for checking
            db_keys: dict[str, str] = {}
            try:
                result = await db.execute(select(GlobalSetting))
                for s in result.scalars():
                    db_keys[s.key] = s.value
            except Exception:
                pass

            seeded = 0
            for defn in SEED_DEFS:
                provider = defn["provider"]
                env_var = defn.get("api_key_env_var")

                # Check if the key/config exists
                has_config = False
                if env_var:
                    has_config = bool(db_keys.get(env_var) or os.environ.get(env_var))
                elif provider == "langfuse":
                    has_config = bool(settings.langfuse_public_key and settings.langfuse_secret_key)
                elif provider == "cea_api":
                    has_config = bool(os.environ.get("CEA_PROXY_URL"))
                elif provider == "postgres_ext":
                    has_config = bool(os.environ.get("PGHOST"))

                if not has_config:
                    continue

                # Upsert: only insert if no auto-seeded entry for this provider exists
                existing = await db.execute(
                    select(ExternalService).where(
                        ExternalService.provider == provider,
                        ExternalService.is_auto_seeded == True,
                    )
                )
                if existing.scalar_one_or_none():
                    continue

                svc = ExternalService(
                    name=defn["name"],
                    service_type=defn["service_type"],
                    provider=provider,
                    base_url=defn.get("base_url"),
                    api_key_env_var=env_var,
                    auth_config=defn.get("auth_config", {}),
                    is_auto_seeded=True,
                )
                db.add(svc)
                seeded += 1

            if seeded:
                await db.commit()
                print(f"External services: seeded {seeded} entries")
            else:
                print("External services: all up to date")
    except Exception as e:
        print(f"External services seed warning: {e}")
```

**Step 3: Call seed function in lifespan (after tool sync, around line 180)**

Add this block:

```python
    # Seed external services from configured API keys
    try:
        await _seed_external_services()
    except Exception as e:
        print(f"External services seed warning: {e}")
```

**Step 4: Register the router (around line 363, near other router registrations)**

```python
app.include_router(services_api.router, prefix="/api")
```

**Step 5: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(services): register router and add auto-seed on startup"
```

---

### Task 6: Frontend — API Client

**Files:**
- Modify: `frontend/lib/api.ts`

**Step 1: Add ExternalService interface (near the McpServer interface)**

```typescript
export interface ExternalService {
  id: string;
  name: string;
  service_type: string;
  provider: string;
  base_url: string | null;
  api_key_env_var: string | null;
  auth_config: Record<string, any>;
  health_check_endpoint: string | null;
  health_check_method: string;
  status: string;
  last_health_check: string | null;
  response_time_ms: number | null;
  last_error: string | null;
  is_auto_seeded: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateExternalServiceRequest {
  name: string;
  service_type?: string;
  provider?: string;
  base_url?: string | null;
  api_key_env_var?: string | null;
  auth_config?: Record<string, any>;
  health_check_endpoint?: string | null;
  health_check_method?: string;
  description?: string | null;
}

export interface UpdateExternalServiceRequest {
  name?: string;
  service_type?: string;
  provider?: string;
  base_url?: string | null;
  api_key_env_var?: string | null;
  auth_config?: Record<string, any>;
  health_check_endpoint?: string | null;
  health_check_method?: string;
  description?: string | null;
}
```

**Step 2: Add API methods to the ApiClient class**

```typescript
  // ---- External Services ----

  async getExternalServices() {
    return this.request<ExternalService[]>("/api/services");
  }

  async createExternalService(data: CreateExternalServiceRequest) {
    return this.request<ExternalService>("/api/services", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getExternalService(id: string) {
    return this.request<ExternalService>(`/api/services/${id}`);
  }

  async updateExternalService(id: string, data: UpdateExternalServiceRequest) {
    return this.request<ExternalService>(`/api/services/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteExternalService(id: string) {
    return this.request<void>(`/api/services/${id}`, {
      method: "DELETE",
    });
  }

  async checkExternalServiceHealth(id: string) {
    return this.request<ExternalService>(`/api/services/${id}/health`, {
      method: "POST",
    });
  }

  async checkAllExternalServicesHealth() {
    return this.request<ExternalService[]>("/api/services/health/all", {
      method: "POST",
    });
  }
```

**Step 3: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(services): add ExternalService types and API methods"
```

---

### Task 7: Frontend — Sidebar Entry

**Files:**
- Modify: `frontend/components/ui/Sidebar.tsx`

**Step 1: Add "Services" to navigation array (between Tools and Skills, line 27)**

Import `Plug` icon (add to the import from lucide-react):

```typescript
import {
  LayoutDashboard,
  Workflow,
  Bot,
  Wrench,
  Plug,
  BookOpen,
  Activity,
  Users,
  Settings,
  LogOut,
  ExternalLink,
  Network,
  Zap,
} from "lucide-react";
```

Update the `navigation` array — insert after Tools:

```typescript
const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Builder", href: "/builder", icon: Workflow },
  { name: "Infrastructures", href: "/infrastructures", icon: Network },
  { name: "Agents", href: "/agents", icon: Bot },
  { name: "Tools", href: "/tools", icon: Wrench },
  { name: "Services", href: "/services", icon: Plug },
  { name: "Skills", href: "/skills", icon: BookOpen },
  { name: "Executions", href: "/executions", icon: Activity },
  { name: "Training", href: "/training", icon: Zap },
  { name: "Users", href: "/users", icon: Users, adminOnly: true },
  { name: "Settings", href: "/settings", icon: Settings },
];
```

**Step 2: Commit**

```bash
git add frontend/components/ui/Sidebar.tsx
git commit -m "feat(services): add Services entry to sidebar navigation"
```

---

### Task 8: Frontend — Layout

**Files:**
- Create: `frontend/app/services/layout.tsx`

**Step 1: Create layout file (copy from tools)**

```tsx
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Sidebar } from "@/components/ui/Sidebar";

export default function ServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { token } = useAuth();

  useEffect(() => {
    if (!token) {
      router.push("/auth/login");
    }
  }, [token, router]);

  if (!token) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-64">{children}</main>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/app/services/layout.tsx
git commit -m "feat(services): add services page layout with auth guard"
```

---

### Task 9: Frontend — Services Page

**Files:**
- Create: `frontend/app/services/page.tsx`

**Step 1: Create the full services page**

This is the largest task. The page follows the Tools page pattern: two-column layout with service list (left, grouped by type) and detail panel (right). Uses React Query for data fetching, mutations for health checks.

Key components within the page:
- Summary strip (online/error/unconfigured counts)
- Grouped service list with status dots
- Detail panel with config and health check button
- Add Service modal
- Edit Service modal

Reference the existing patterns:
- Status dots: same colors as McpServer (`bg-success`, `bg-error`, `bg-foreground-muted`, `bg-amber-500`)
- Refresh button with spinner: same as `healthCheckMutation` in tools page
- React Query: `useQuery(["external-services"])` with `refetchInterval: 30000`
- Modal pattern: same `useState` + overlay as tools page

The page should import:
- `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`
- `api` from `@/lib/api`
- `Header` from `@/components/ui/Header`
- `cn`, `formatRelativeTime` from `@/lib/utils`
- Icons from `lucide-react`: `RefreshCw`, `Plus`, `Trash2`, `Edit2`, `X`, `CheckCircle`, `XCircle`, `AlertCircle`, `HelpCircle`, `Plug`

Service type display names and icons:
```typescript
const SERVICE_TYPE_LABELS: Record<string, string> = {
  llm_provider: "LLM Providers",
  media_processor: "Media Processors",
  integration: "Integrations",
  observability: "Observability",
  database: "Databases",
  custom: "Custom",
};

const SERVICE_TYPE_ORDER = ["llm_provider", "media_processor", "integration", "observability", "database", "custom"];
```

Status dot color logic:
```typescript
const statusColor = (s: string) => {
  switch (s) {
    case "online": return "bg-success";
    case "offline": case "error": return "bg-error";
    case "unconfigured": return "bg-amber-500";
    default: return "bg-foreground-muted";
  }
};
```

Group services by `service_type`, render each group as a section header + list.

Detail panel shows:
- Name + status badge
- Provider, type, base URL
- API key env var (show name only, with "Configured" / "Missing" indicator)
- Last health check time + response time
- Last error if any
- Health check button
- Edit / Delete buttons

**Step 2: Commit**

```bash
git add frontend/app/services/page.tsx
git commit -m "feat(services): add Services & Integrations page with health dashboard"
```

---

### Task 10: Verification

**Step 1: Run backend**

```bash
cd backend && alembic upgrade head
```

Verify: migration runs, `external_services` table created.

**Step 2: Start backend and check seed**

Start the backend, check logs for:
```
External services: seeded N entries
```

**Step 3: Test API**

```bash
curl -H "Authorization: Bearer TOKEN" http://localhost:8000/api/services
```

Verify: returns seeded services.

**Step 4: Test health check**

```bash
curl -X POST -H "Authorization: Bearer TOKEN" http://localhost:8000/api/services/health/all
```

Verify: each service gets a status update.

**Step 5: Test frontend**

Navigate to `/services` in the browser:
- Sidebar shows "Services" entry
- Page loads with grouped service list
- Click a service to see detail panel
- Click refresh to trigger health check
- Click "Check All" for bulk check

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat(services): Services & Integrations health dashboard complete"
```
