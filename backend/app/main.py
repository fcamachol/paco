"""
PACO Agent Hub - Main Application

FastAPI backend for managing AI agents.
"""

import traceback
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api import agents, auth, codegen, company, executions, hive, infrastructures, infra_codegen, infra_deploy, infra_monitor, infra_upgrade, playground, proxy, services as services_api, settings as settings_api, skills, tools, users, workflows, ws
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.db.models import Base, McpServer, User
from app.db.session import async_session_maker, engine
from app.services.langfuse_client import langfuse_client


# =============================================================================
# Startup Helpers
# =============================================================================


async def _ensure_schema_columns():
    """Run Alembic migrations to ensure DB schema is up to date."""
    import subprocess, os
    alembic_dir = os.path.join(os.path.dirname(__file__), "..")
    env = {**os.environ, "PYTHONPATH": alembic_dir}
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=alembic_dir, env=env,
        capture_output=True, text=True, timeout=30,
    )
    if result.returncode == 0:
        print(f"Alembic migrations OK: {result.stdout.strip()}")
    else:
        print(f"Alembic migration warning: {result.stderr.strip()}")


async def _create_missing_tables():
    """Create any tables that exist in ORM models but not in the DB.

    This handles fully missing tables like skills and agent_skills.
    NOTE: New schema changes should use Alembic migrations (alembic/versions/).
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Missing tables check completed")


async def _ensure_default_admin():
    """Ensure the default admin user exists with the correct password."""
    default_email = "admin@paco.local"
    default_password = "admin123"

    async with async_session_maker() as db:
        result = await db.execute(select(User).where(User.email == default_email))
        user = result.scalar_one_or_none()

        if user:
            if not verify_password(default_password, user.password_hash):
                user.password_hash = get_password_hash(default_password)
                await db.commit()
                print(f"Admin user password reset to default")
            else:
                print(f"Admin user OK")
        else:
            db.add(User(
                email=default_email,
                password_hash=get_password_hash(default_password),
                name="PACO Admin",
                role="admin",
                is_active=True,
            ))
            await db.commit()
            print(f"Default admin user created")


async def _sync_tools_on_startup():
    """Best-effort: try to sync tools from registered HTTP MCP servers."""
    import httpx
    from app.db.models import McpServer, Tool

    try:
        # First, fetch server info from DB
        async with async_session_maker() as db:
            result = await db.execute(
                select(McpServer).where(McpServer.transport == "http")
            )
            servers = [(s.id, s.name, s.url) for s in result.scalars().all()]

        if not servers:
            print("No HTTP MCP servers registered — skipping tool sync")
            return

        # Then, fetch tools from each server (outside DB session to avoid greenlet issues)
        for server_id, server_name, server_url in servers:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{server_url}/tools")
                    if resp.status_code != 200:
                        print(f"  Tool sync: {server_name} returned {resp.status_code}")
                        continue
                    tools_data = resp.json()

                if isinstance(tools_data, dict):
                    tools_data = tools_data.get("tools", [])

                # Insert into DB in a separate session
                async with async_session_maker() as db:
                    synced = 0
                    for tool_data in tools_data:
                        tool_name = tool_data.get("name")
                        if not tool_name:
                            continue

                        existing = await db.execute(
                            select(Tool).where(
                                Tool.name == tool_name,
                                Tool.mcp_server_id == server_id,
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue

                        tool = Tool(
                            name=tool_name,
                            description=tool_data.get("description"),
                            mcp_server_id=server_id,
                            input_schema=tool_data.get("inputSchema", tool_data.get("input_schema", {})),
                        )
                        db.add(tool)
                        synced += 1

                    if synced:
                        await db.commit()
                        print(f"  Synced {synced} tools from {server_name}")
            except Exception as e:
                print(f"  Tool sync failed for {server_name}: {e}")

    except Exception as e:
        print(f"Tool sync error: {e}")

    print("Tool sync attempt completed")


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


async def _reconcile_managed_servers():
    """Re-deploy managed MCP server containers that were lost during a redeploy."""
    try:
        from app.services.mcp_orchestrator import mcp_orchestrator

        async with async_session_maker() as db:
            result = await db.execute(
                select(McpServer).where(
                    McpServer.deployment_mode == "managed",
                    McpServer.deploy_status == "running",
                )
            )
            servers = result.scalars().all()

            if not servers:
                print("No managed MCP servers to reconcile")
                return

            report = await mcp_orchestrator.reconcile_managed_servers(db)
            if report["already_running"]:
                print(f"  MCP containers already running: {', '.join(report['already_running'])}")
            if report["reconciled"]:
                print(f"  MCP containers re-deployed: {', '.join(report['reconciled'])}")
            if report["failed"]:
                for f in report["failed"]:
                    print(f"  MCP reconcile FAILED for {f['name']}: {f['error']}")

    except Exception as e:
        print(f"MCP reconciliation error: {e}")

    print("MCP managed server reconciliation completed")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler."""
    # Startup
    print(f"Starting {settings.app_name} v{settings.app_version}")

    # Schema migration (idempotent)
    try:
        await _ensure_schema_columns()
    except Exception as e:
        print(f"Schema migration warning: {e}")

    # Create any fully missing tables
    try:
        await _create_missing_tables()
    except Exception as e:
        print(f"Create tables warning: {e}")

    # Ensure default admin user
    try:
        await _ensure_default_admin()
    except Exception as e:
        print(f"Admin user warning: {e}")

    # Best-effort tool sync from MCP servers
    try:
        await _sync_tools_on_startup()
    except Exception as e:
        print(f"Tool sync warning: {e}")

    # Seed external services from configured API keys
    try:
        await _seed_external_services()
    except Exception as e:
        print(f"External services seed warning: {e}")

    # Reconcile managed MCP server containers (re-deploy if lost during redeploy)
    try:
        await _reconcile_managed_servers()
    except Exception as e:
        print(f"MCP reconciliation warning: {e}")

    # Start queue-based background tasks (or fall back to asyncio scheduler)
    from app.services.heartbeat_scheduler import heartbeat_scheduler
    queue_seeded = False
    if settings.queue_enabled:
        try:
            from app.services.queue.redis_pool import get_queue_redis
            from app.services.queue.core import enqueue_scheduled_task
            import time

            queue_redis = await get_queue_redis()

            # Seed periodic tasks — the worker picks these up and self-reschedules
            await enqueue_scheduled_task(
                queue_redis, "heartbeat_trigger",
                {"interval": settings.heartbeat_poll_interval},
                execute_at=time.time() + 5,
            )
            await enqueue_scheduled_task(
                queue_redis, "tool_sync",
                {"interval": settings.tool_sync_interval},
                execute_at=time.time() + 10,
            )
            await enqueue_scheduled_task(
                queue_redis, "infra_health_check",
                {"interval": settings.infra_health_interval},
                execute_at=time.time() + 15,
            )
            queue_seeded = True
            print("Queue: seeded heartbeat_trigger, tool_sync, infra_health_check")

            # Also give heartbeat scheduler a Redis client for distributed locking
            heartbeat_scheduler._redis = queue_redis
        except Exception as e:
            print(f"Queue seeding failed ({e}), falling back to asyncio scheduler")

    # Fallback: start the in-process heartbeat scheduler if queue is disabled or failed
    if not queue_seeded:
        try:
            redis_client = None
            try:
                import redis.asyncio as aioredis
                redis_url = settings.redis_url
                redis_client = aioredis.from_url(redis_url)
                await redis_client.ping()
                heartbeat_scheduler._redis = redis_client
                print("Heartbeat scheduler: Redis connected (fallback mode)")
            except Exception as e:
                print(f"Heartbeat scheduler: Redis not available ({e}), running without lock")
            await heartbeat_scheduler.start()
        except Exception as e:
            print(f"Heartbeat scheduler warning: {e}")

    # Check Langfuse connectivity
    if langfuse_client.is_configured:
        healthy = await langfuse_client.health_check()
        if healthy:
            print("Langfuse connection: OK")
        else:
            print("Langfuse connection: FAILED (check configuration)")
    else:
        print("Langfuse: Not configured")

    yield

    # Shutdown
    try:
        from app.services.heartbeat_scheduler import heartbeat_scheduler
        await heartbeat_scheduler.stop()
    except Exception:
        pass
    try:
        from app.services.queue.redis_pool import close_queue_redis
        await close_queue_redis()
    except Exception:
        pass
    print("Shutting down PACO")


# Create FastAPI application
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="PACO (Pretty Advanced Cognitive Orchestrator) - Agent Hub for managing AI agents",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =============================================================================
# Health Check
# =============================================================================


@app.get("/health", tags=["Health"])
async def health_check() -> Dict[str, Any]:
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
    }


@app.get("/health/detailed", tags=["Health"])
async def detailed_health_check() -> Dict[str, Any]:
    """
    Detailed health check including dependencies.

    Checks connectivity to:
    - Database (PostgreSQL)
    - Redis
    - Langfuse
    """
    from app.db.session import engine

    health = {
        "status": "healthy",
        "app": settings.app_name,
        "version": settings.app_version,
        "dependencies": {},
    }

    # Check database
    try:
        async with engine.connect() as conn:
            await conn.execute("SELECT 1")
        health["dependencies"]["database"] = {"status": "healthy"}
    except Exception as e:
        health["dependencies"]["database"] = {"status": "unhealthy", "error": str(e)}
        health["status"] = "degraded"

    # Check Langfuse
    if langfuse_client.is_configured:
        langfuse_healthy = await langfuse_client.health_check()
        health["dependencies"]["langfuse"] = {
            "status": "healthy" if langfuse_healthy else "unhealthy",
            "configured": True,
        }
        if not langfuse_healthy:
            health["status"] = "degraded"
    else:
        health["dependencies"]["langfuse"] = {
            "status": "unconfigured",
            "configured": False,
        }

    return health


# =============================================================================
# API Routes
# =============================================================================

# Include API routers
app.include_router(auth.router, prefix="/api")
app.include_router(agents.router, prefix="/api")
app.include_router(skills.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(executions.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(proxy.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
app.include_router(codegen.router, prefix="/api")
app.include_router(infrastructures.router, prefix="/api")
app.include_router(infra_codegen.router, prefix="/api")
app.include_router(infra_deploy.router, prefix="/api")
app.include_router(infra_monitor.router, prefix="/api")
app.include_router(infra_upgrade.router, prefix="/api")
app.include_router(playground.router, prefix="/api")
app.include_router(hive.router, prefix="/api")
app.include_router(company.router, prefix="/api")
app.include_router(services_api.router, prefix="/api")
app.include_router(settings_api.router, prefix="/api")
app.include_router(ws.router)

# Agent Lightning (conditionally registered)
if settings.lightning_enabled:
    from app.api import lightning
    app.include_router(lightning.router, prefix="/api")

# A2A Protocol (conditionally registered)
if settings.a2a_enabled:
    from app.api import a2a
    app.include_router(a2a.router)
    app.include_router(a2a.api_router, prefix="/api")

# Webhooks (outbound + inbound)
from app.api import webhooks, inbound_webhooks
app.include_router(webhooks.router, prefix="/api")
app.include_router(inbound_webhooks.crud_router, prefix="/api/agents/{agent_id}/webhooks/inbound")
app.include_router(inbound_webhooks.receiver_router, prefix="/api")

# Session Runs (full conversation replay)
from app.api import session_runs
app.include_router(session_runs.router, prefix="/api")


# =============================================================================
# Error Handlers
# =============================================================================


@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    """Global exception handler for unhandled errors."""
    print(f"Unhandled {type(exc).__name__} on {request.method} {request.url.path}: {exc}")
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


# =============================================================================
# Root Endpoint
# =============================================================================


@app.get("/", tags=["Root"])
async def root() -> Dict[str, str]:
    """Root endpoint with API information."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "description": "PACO Agent Hub API",
        "docs": "/docs",
        "health": "/health",
    }
