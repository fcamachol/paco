"""
Tests for the /api/auth endpoints.

Covers login, registration, /me, token refresh, and role-based access.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import create_test_user, make_auth_header


# ---------------------------------------------------------------------------
# POST /api/auth/login
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_valid_credentials(client: AsyncClient, db_session: AsyncSession):
    user = await create_test_user(db_session, email="alice@example.com", password="secret")
    resp = await client.post("/api/auth/login", json={
        "email": "alice@example.com",
        "password": "secret",
    })
    assert resp.status_code == 200
    body = resp.json()
    assert body["token"]["token_type"] == "bearer"
    assert body["user"]["email"] == "alice@example.com"
    assert body["user"]["role"] == "viewer"


@pytest.mark.asyncio
async def test_login_wrong_password(client: AsyncClient, db_session: AsyncSession):
    await create_test_user(db_session, email="alice@example.com", password="secret")
    resp = await client.post("/api/auth/login", json={
        "email": "alice@example.com",
        "password": "wrong",
    })
    assert resp.status_code == 401
    assert "Incorrect email or password" in resp.json()["detail"]


@pytest.mark.asyncio
async def test_login_nonexistent_user(client: AsyncClient):
    resp = await client.post("/api/auth/login", json={
        "email": "nobody@example.com",
        "password": "whatever",
    })
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_login_inactive_user(client: AsyncClient, db_session: AsyncSession):
    await create_test_user(
        db_session, email="disabled@example.com", password="secret", is_active=False,
    )
    resp = await client.post("/api/auth/login", json={
        "email": "disabled@example.com",
        "password": "secret",
    })
    assert resp.status_code == 403
    assert "disabled" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# POST /api/auth/register
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_new_user(client: AsyncClient):
    resp = await client.post("/api/auth/register", json={
        "email": "newuser@example.com",
        "password": "strongpass",
        "name": "New User",
    })
    assert resp.status_code == 201
    body = resp.json()
    assert body["user"]["email"] == "newuser@example.com"
    assert body["user"]["role"] == "viewer"
    assert body["token"]["access_token"]


@pytest.mark.asyncio
async def test_register_duplicate_email(client: AsyncClient, db_session: AsyncSession):
    await create_test_user(db_session, email="dup@example.com")
    resp = await client.post("/api/auth/register", json={
        "email": "dup@example.com",
        "password": "pass",
        "name": "Dup",
    })
    assert resp.status_code == 409
    assert "already registered" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# GET /api/auth/me
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_me_authenticated(client: AsyncClient, db_session: AsyncSession):
    user = await create_test_user(db_session, email="me@example.com", role="admin")
    headers = make_auth_header("admin", user_id=str(user.id))
    resp = await client.get("/api/auth/me", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == "me@example.com"
    assert resp.json()["role"] == "admin"


@pytest.mark.asyncio
async def test_me_unauthenticated(client: AsyncClient):
    resp = await client.get("/api/auth/me")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_me_invalid_token(client: AsyncClient):
    resp = await client.get("/api/auth/me", headers={"Authorization": "Bearer invalid.token.here"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# POST /api/auth/refresh
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_refresh_token(client: AsyncClient, db_session: AsyncSession):
    user = await create_test_user(db_session, role="operator")
    headers = make_auth_header("operator", user_id=str(user.id))
    resp = await client.post("/api/auth/refresh", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_refresh_unauthenticated(client: AsyncClient):
    resp = await client.post("/api/auth/refresh")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Role-based access
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_viewer_cannot_access_admin_endpoint(client: AsyncClient, viewer_headers: dict):
    """Viewer should be rejected from admin-only endpoints (e.g. create agent)."""
    resp = await client.post(
        "/api/agents",
        json={"name": "hack-agent"},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_operator_cannot_create_agent(client: AsyncClient, operator_headers: dict):
    """Operator should be rejected from admin-only endpoints."""
    resp = await client.post(
        "/api/agents",
        json={"name": "hack-agent"},
        headers=operator_headers,
    )
    assert resp.status_code == 403
