"""
Tests for the /api/agents endpoints.

Covers CRUD, lifecycle start/stop (with mocked PM2), and authorization.
"""

import uuid
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import (
    create_test_agent,
    create_test_skill,
    create_test_tool,
    create_test_mcp_server,
    make_auth_header,
)


# ---------------------------------------------------------------------------
# GET /api/agents  — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_agents_empty(client: AsyncClient, db_session: AsyncSession):
    resp = await client.get("/api/agents", headers=make_auth_header("viewer"))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_agents(client: AsyncClient, db_session: AsyncSession):
    await create_test_agent(db_session, name="alpha")
    await create_test_agent(db_session, name="beta")
    resp = await client.get("/api/agents", headers=make_auth_header("viewer"))
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()]
    assert "alpha" in names
    assert "beta" in names


# ---------------------------------------------------------------------------
# POST /api/agents  — create (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_agent(client: AsyncClient, admin_headers: dict):
    resp = await client.post("/api/agents", json={
        "name": "new-agent",
        "display_name": "New Agent",
        "description": "A brand-new agent",
    }, headers=admin_headers)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "new-agent"
    assert body["status"] == "stopped"


@pytest.mark.asyncio
async def test_create_agent_duplicate_name(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    await create_test_agent(db_session, name="dup-agent")
    resp = await client.post("/api/agents", json={"name": "dup-agent"}, headers=admin_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_agent_viewer_rejected(client: AsyncClient, viewer_headers: dict):
    resp = await client.post("/api/agents", json={"name": "x"}, headers=viewer_headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/agents/{id}  — detail
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_agent_detail(client: AsyncClient, db_session: AsyncSession):
    agent = await create_test_agent(db_session, name="detail-agent")
    headers = make_auth_header("viewer")

    with patch("app.api.agents.SkillFilesystemService") as MockFS:
        mock_fs = MockFS.return_value
        mock_fs.read_skill_md.return_value = {"allowed_tools": []}
        mock_fs.list_resource_files.return_value = []

        resp = await client.get(f"/api/agents/{agent.id}", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["name"] == "detail-agent"


@pytest.mark.asyncio
async def test_get_agent_not_found(client: AsyncClient):
    fake_id = uuid.uuid4()
    resp = await client.get(f"/api/agents/{fake_id}", headers=make_auth_header("viewer"))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/agents/{id}  — update (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_agent(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    agent = await create_test_agent(db_session, name="upd-agent")
    resp = await client.put(f"/api/agents/{agent.id}", json={
        "display_name": "Updated Name",
        "description": "Updated description",
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["display_name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_agent_not_found(client: AsyncClient, admin_headers: dict):
    resp = await client.put(
        f"/api/agents/{uuid.uuid4()}", json={"display_name": "x"}, headers=admin_headers,
    )
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# DELETE /api/agents/{id}  — delete (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_agent(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    agent = await create_test_agent(db_session, name="del-agent")

    with patch("app.api.agents.PM2Client") as MockPM2:
        resp = await client.delete(f"/api/agents/{agent.id}", headers=admin_headers)

    assert resp.status_code == 204

    # Confirm it's gone
    resp2 = await client.get(f"/api/agents/{agent.id}", headers=make_auth_header("viewer"))
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_delete_running_agent_stops_pm2(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    agent = await create_test_agent(db_session, name="running-del", status="running")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.stop = AsyncMock(return_value=None)

        resp = await client.delete(f"/api/agents/{agent.id}", headers=admin_headers)

    assert resp.status_code == 204
    mock_pm2.stop.assert_awaited_once_with("running-del")


# ---------------------------------------------------------------------------
# POST /api/agents/{id}/start  — lifecycle (operator+)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_agent(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="start-me")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.start = AsyncMock(return_value={"status": "online"})

        resp = await client.post(f"/api/agents/{agent.id}/start", headers=operator_headers)

    assert resp.status_code == 200
    assert resp.json()["agent"]["status"] == "running"


@pytest.mark.asyncio
async def test_start_already_running(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="already-running", status="running")
    resp = await client.post(f"/api/agents/{agent.id}/start", headers=operator_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_start_agent_viewer_rejected(
    client: AsyncClient, db_session: AsyncSession, viewer_headers: dict,
):
    agent = await create_test_agent(db_session, name="no-start")
    resp = await client.post(f"/api/agents/{agent.id}/start", headers=viewer_headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/agents/{id}/stop  — lifecycle (operator+)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stop_agent(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="stop-me", status="running")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.stop = AsyncMock(return_value={"status": "stopped"})

        resp = await client.post(f"/api/agents/{agent.id}/stop", headers=operator_headers)

    assert resp.status_code == 200
    assert resp.json()["agent"]["status"] == "stopped"


@pytest.mark.asyncio
async def test_stop_already_stopped(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="already-stopped", status="stopped")
    resp = await client.post(f"/api/agents/{agent.id}/stop", headers=operator_headers)
    assert resp.status_code == 409
