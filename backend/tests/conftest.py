"""
Shared test fixtures for PACO backend tests.

Uses SQLite async in-memory database and httpx.AsyncClient
so tests run without a real PostgreSQL instance.
"""

import uuid
from datetime import datetime, timezone
from typing import AsyncGenerator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, String, Text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.types import JSON

from app.core.deps import get_db
from app.core.security import create_access_token, get_password_hash
from app.db.models import Agent, Base, McpServer, Skill, Tool, User

# ---------------------------------------------------------------------------
# Register PostgreSQL type → SQLite fallbacks BEFORE creating engine
# ---------------------------------------------------------------------------

from sqlalchemy.dialects.postgresql import JSONB, UUID as PG_UUID
from sqlalchemy.ext.compiler import compiles

# JSONB → JSON on SQLite
@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(type_, compiler, **kw):
    return "JSON"

# PG_UUID → CHAR(36) on SQLite
@compiles(PG_UUID, "sqlite")
def _compile_uuid_sqlite(type_, compiler, **kw):
    return "CHAR(36)"


# ---------------------------------------------------------------------------
# In-memory SQLite engine (async via aiosqlite)
# ---------------------------------------------------------------------------

TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


# SQLite does not generate UUIDs; emit them from Python.
@event.listens_for(engine.sync_engine, "connect")
def _set_sqlite_pragma(dbapi_conn, _):
    cursor = dbapi_conn.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture(autouse=True)
async def _setup_db():
    """Create all tables before each test and drop them after."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Yield a fresh DB session for direct model manipulation in tests."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """HTTP test client with DB dependency overridden."""
    # Patch the lifespan so startup tasks (schema migration, YAML sync, etc.)
    # do not run — they require a real PostgreSQL database.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _noop_lifespan(app):
        yield

    # Import app *after* patching to avoid triggering module-level side effects
    from app.main import app

    original_lifespan = app.router.lifespan_context
    app.router.lifespan_context = _noop_lifespan

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    app.router.lifespan_context = original_lifespan


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------


def make_auth_header(role: str = "admin", user_id: str | None = None) -> dict:
    """Return an Authorization header dict with a valid JWT for the given role."""
    uid = user_id or str(uuid.uuid4())
    token = create_access_token(subject=uid, role=role)
    return {"Authorization": f"Bearer {token.access_token}"}


@pytest.fixture
def admin_headers() -> dict:
    return make_auth_header("admin")


@pytest.fixture
def operator_headers() -> dict:
    return make_auth_header("operator")


@pytest.fixture
def viewer_headers() -> dict:
    return make_auth_header("viewer")


# ---------------------------------------------------------------------------
# Data factories
# ---------------------------------------------------------------------------


async def create_test_user(
    db: AsyncSession,
    *,
    email: str = "test@example.com",
    password: str = "password123",
    name: str = "Test User",
    role: str = "viewer",
    is_active: bool = True,
) -> User:
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=get_password_hash(password),
        name=name,
        role=role,
        is_active=is_active,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def create_test_agent(
    db: AsyncSession,
    *,
    name: str = "test-agent",
    display_name: str = "Test Agent",
    status: str = "stopped",
) -> Agent:
    agent = Agent(
        id=uuid.uuid4(),
        name=name,
        display_name=display_name,
        model="claude-sonnet-4-5-20250929",
        status=status,
        pm2_name=name,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def create_test_skill(
    db: AsyncSession,
    *,
    code: str = "test-skill",
    name: str = "Test Skill",
) -> Skill:
    skill = Skill(
        id=uuid.uuid4(),
        code=code,
        name=name,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return skill


async def create_test_mcp_server(
    db: AsyncSession,
    *,
    name: str = "test-server",
    transport: str = "http",
    url: str = "http://localhost:9000",
) -> McpServer:
    server = McpServer(
        id=uuid.uuid4(),
        name=name,
        transport=transport,
        url=url,
        status="unknown",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(server)
    await db.commit()
    await db.refresh(server)
    return server


async def create_test_tool(
    db: AsyncSession,
    *,
    name: str = "test-tool",
    mcp_server_id: uuid.UUID | None = None,
) -> Tool:
    tool = Tool(
        id=uuid.uuid4(),
        name=name,
        description="A test tool",
        mcp_server_id=mcp_server_id,
        input_schema={"type": "object"},
        is_enabled=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(tool)
    await db.commit()
    await db.refresh(tool)
    return tool
