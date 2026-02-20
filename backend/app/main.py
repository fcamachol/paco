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

from app.api import agents, auth, codegen, company, executions, hive, infrastructures, infra_codegen, infra_deploy, infra_monitor, infra_upgrade, playground, proxy, settings as settings_api, skills, tools, users, workflows, ws
from app.core.config import settings
from app.core.security import get_password_hash, verify_password
from app.db.models import Base, User
from app.db.session import async_session_maker, engine
from app.services.langfuse_client import langfuse_client


# =============================================================================
# Startup Helpers
# =============================================================================


async def _ensure_schema_columns():
    """Schema migrations are now handled by Alembic.

    See alembic/versions/ for versioned migration files:
      - 002_add_schema_columns.py
      - 003_create_hive_tables.py
      - 004_agent_tools_uuid_migration.py

    Run migrations with:  alembic upgrade head
    """
    print("Schema migrations managed by Alembic (run: alembic upgrade head)")


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
app.include_router(settings_api.router, prefix="/api")
app.include_router(ws.router)


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
        content={
            "detail": f"Internal server error: {type(exc).__name__}",
            "type": type(exc).__name__,
            "message": str(exc),
        },
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
