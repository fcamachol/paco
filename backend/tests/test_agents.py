"""
Tests for the /api/agents endpoints.

Covers CRUD, lifecycle start/stop (with mocked PM2), and authorization.
"""

import asyncio
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

    with patch("app.api.agents.get_queue_redis") as mock_get_redis, \
         patch("app.api.agents.enqueue_task") as mock_enqueue:
        mock_get_redis.return_value = AsyncMock()
        mock_enqueue.return_value = "task-id-123"

        resp = await client.post(f"/api/agents/{agent.id}/start", headers=operator_headers)

    assert resp.status_code == 202
    assert resp.json()["agent"]["status"] == "starting"
    mock_enqueue.assert_awaited_once()
    payload = mock_enqueue.call_args[0][2]
    assert payload["action"] == "start"
    assert payload["pm2_name"] == "start-me"
    assert payload["agent_id"] == str(agent.id)


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

    with patch("app.api.agents.get_queue_redis") as mock_get_redis, \
         patch("app.api.agents.enqueue_task") as mock_enqueue:
        mock_get_redis.return_value = AsyncMock()
        mock_enqueue.return_value = "task-id-456"

        resp = await client.post(f"/api/agents/{agent.id}/stop", headers=operator_headers)

    assert resp.status_code == 202
    assert resp.json()["agent"]["status"] == "stopping"
    mock_enqueue.assert_awaited_once()
    payload = mock_enqueue.call_args[0][2]
    assert payload["action"] == "stop"


@pytest.mark.asyncio
async def test_stop_already_stopped(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="already-stopped", status="stopped")
    resp = await client.post(f"/api/agents/{agent.id}/stop", headers=operator_headers)
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# PM2Client subprocess timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pm2_client_timeout():
    """PM2 client should return error dict when subprocess exceeds timeout."""
    from app.services.pm2_client import PM2Client

    pm2 = PM2Client()

    with patch("app.services.pm2_client.asyncio.create_subprocess_exec") as mock_exec:
        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError)
        mock_proc.kill = AsyncMock()
        mock_proc.wait = AsyncMock()
        mock_exec.return_value = mock_proc

        result = await pm2._run_pm2_command("start", "test-proc", timeout=0.1)

    assert "error" in result
    assert "timed out" in result["error"].lower()
    mock_proc.kill.assert_called_once()


# ---------------------------------------------------------------------------
# agent_lifecycle queue task
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_lifecycle_task_sets_running(db_session: AsyncSession):
    """Queue task should set agent status to 'running' after successful PM2 start."""
    from app.services.queue.tasks.agent_lifecycle import handle

    agent = await create_test_agent(db_session, name="lifecycle-start", status="starting")

    with patch("app.services.queue.tasks.agent_lifecycle.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.start = AsyncMock(return_value={"status": "online"})

        with patch("app.services.queue.tasks.agent_lifecycle.async_session_maker") as mock_maker:
            mock_maker.return_value.__aenter__ = AsyncMock(return_value=db_session)
            mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)

            await handle({
                "action": "start",
                "pm2_name": "lifecycle-start",
                "agent_id": str(agent.id),
            }, redis=AsyncMock())

    await db_session.refresh(agent)
    assert agent.status == "running"


@pytest.mark.asyncio
async def test_agent_lifecycle_task_sets_error_on_failure(db_session: AsyncSession):
    """Queue task should set agent status to 'error' when PM2 call fails."""
    from app.services.queue.tasks.agent_lifecycle import handle

    agent = await create_test_agent(db_session, name="lifecycle-fail", status="starting")

    with patch("app.services.queue.tasks.agent_lifecycle.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.start = AsyncMock(side_effect=RuntimeError("PM2 command timed out"))

        with patch("app.services.queue.tasks.agent_lifecycle.async_session_maker") as mock_maker:
            mock_maker.return_value.__aenter__ = AsyncMock(return_value=db_session)
            mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(RuntimeError):
                await handle({
                    "action": "start",
                    "pm2_name": "lifecycle-fail",
                    "agent_id": str(agent.id),
                }, redis=AsyncMock())

    await db_session.refresh(agent)
    assert agent.status == "error"


# ---------------------------------------------------------------------------
# Fix 1: Guard transitional states — start rejects "starting" agents
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_already_starting(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    """Starting an agent that is already 'starting' should return 409."""
    agent = await create_test_agent(db_session, name="already-starting", status="starting")
    resp = await client.post(f"/api/agents/{agent.id}/start", headers=operator_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_stop_already_stopping(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    """Stopping an agent that is already 'stopping' should return 409."""
    agent = await create_test_agent(db_session, name="already-stopping", status="stopping")
    resp = await client.post(f"/api/agents/{agent.id}/stop", headers=operator_headers)
    assert resp.status_code == 409


# ---------------------------------------------------------------------------
# Fix 2: Status reconciliation — PM2 null resets stale transitional states
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_reconciles_starting_when_pm2_unknown(
    client: AsyncClient, db_session: AsyncSession,
):
    """Agent stuck in 'starting' should become 'stopped' when PM2 has no record."""
    agent = await create_test_agent(db_session, name="ghost-start", status="starting")
    headers = make_auth_header("viewer")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.status = AsyncMock(return_value=None)  # PM2 doesn't know this process

        resp = await client.get(f"/api/agents/{agent.id}/status", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["agent"]["status"] == "stopped"


@pytest.mark.asyncio
async def test_status_reconciles_running_when_pm2_unknown(
    client: AsyncClient, db_session: AsyncSession,
):
    """Agent claiming 'running' should become 'stopped' when PM2 has no record."""
    agent = await create_test_agent(db_session, name="ghost-run", status="running")
    headers = make_auth_header("viewer")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.status = AsyncMock(return_value=None)

        resp = await client.get(f"/api/agents/{agent.id}/status", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["agent"]["status"] == "stopped"


@pytest.mark.asyncio
async def test_status_keeps_stopped_when_pm2_unknown(
    client: AsyncClient, db_session: AsyncSession,
):
    """Agent already 'stopped' should stay 'stopped' when PM2 has no record."""
    agent = await create_test_agent(db_session, name="already-stop", status="stopped")
    headers = make_auth_header("viewer")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.status = AsyncMock(return_value=None)

        resp = await client.get(f"/api/agents/{agent.id}/status", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["agent"]["status"] == "stopped"


# ---------------------------------------------------------------------------
# Fix 3: Handle all PM2 states in reconciliation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_status_maps_launching_to_starting(
    client: AsyncClient, db_session: AsyncSession,
):
    """PM2 'launching' state should map to 'starting'."""
    agent = await create_test_agent(db_session, name="launching-agent", status="starting")
    headers = make_auth_header("viewer")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.status = AsyncMock(return_value={
            "pm2_env": {"status": "launching"},
        })

        resp = await client.get(f"/api/agents/{agent.id}/status", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["agent"]["status"] == "starting"


@pytest.mark.asyncio
async def test_status_maps_stopping_to_stopping(
    client: AsyncClient, db_session: AsyncSession,
):
    """PM2 'stopping' state should map to 'stopping'."""
    agent = await create_test_agent(db_session, name="stopping-agent", status="stopping")
    headers = make_auth_header("viewer")

    with patch("app.api.agents.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.status = AsyncMock(return_value={
            "pm2_env": {"status": "stopping"},
        })

        resp = await client.get(f"/api/agents/{agent.id}/status", headers=headers)

    assert resp.status_code == 200
    assert resp.json()["agent"]["status"] == "stopping"
