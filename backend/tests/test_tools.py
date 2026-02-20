"""
Tests for the /api/tools endpoints.

Covers tool CRUD and MCP server CRUD.
"""

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import (
    create_test_mcp_server,
    create_test_tool,
    make_auth_header,
)


# ---------------------------------------------------------------------------
# GET /api/tools  — list tools
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_tools_empty(client: AsyncClient):
    resp = await client.get("/api/tools", headers=make_auth_header("viewer"))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_tools(client: AsyncClient, db_session: AsyncSession):
    server = await create_test_mcp_server(db_session, name="srv-1")
    await create_test_tool(db_session, name="tool-a", mcp_server_id=server.id)
    await create_test_tool(db_session, name="tool-b")

    resp = await client.get("/api/tools", headers=make_auth_header("viewer"))
    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()]
    assert "tool-a" in names
    assert "tool-b" in names


@pytest.mark.asyncio
async def test_list_tools_filter_by_server(client: AsyncClient, db_session: AsyncSession):
    server = await create_test_mcp_server(db_session, name="filter-srv")
    await create_test_tool(db_session, name="tool-in", mcp_server_id=server.id)
    await create_test_tool(db_session, name="tool-out")

    resp = await client.get(
        f"/api/tools?server_id={server.id}", headers=make_auth_header("viewer"),
    )
    assert resp.status_code == 200
    names = [t["name"] for t in resp.json()]
    assert "tool-in" in names
    assert "tool-out" not in names


# ---------------------------------------------------------------------------
# POST /api/tools  — create tool (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_tool(client: AsyncClient, admin_headers: dict):
    resp = await client.post("/api/tools", json={
        "name": "my-tool",
        "description": "Does stuff",
        "input_schema": {"type": "object"},
    }, headers=admin_headers)
    assert resp.status_code == 201
    assert resp.json()["name"] == "my-tool"
    assert resp.json()["is_enabled"] is True


@pytest.mark.asyncio
async def test_create_tool_with_server(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    server = await create_test_mcp_server(db_session, name="create-srv")
    resp = await client.post("/api/tools", json={
        "name": "srv-tool",
        "mcp_server_id": str(server.id),
    }, headers=admin_headers)
    assert resp.status_code == 201
    assert resp.json()["mcp_server_name"] == "create-srv"


@pytest.mark.asyncio
async def test_create_tool_viewer_rejected(client: AsyncClient, viewer_headers: dict):
    resp = await client.post("/api/tools", json={"name": "x"}, headers=viewer_headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# GET /api/tools/{id}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_tool(client: AsyncClient, db_session: AsyncSession):
    tool = await create_test_tool(db_session, name="get-tool")
    resp = await client.get(f"/api/tools/{tool.id}", headers=make_auth_header("viewer"))
    assert resp.status_code == 200
    assert resp.json()["name"] == "get-tool"


@pytest.mark.asyncio
async def test_get_tool_not_found(client: AsyncClient):
    resp = await client.get(f"/api/tools/{uuid.uuid4()}", headers=make_auth_header("viewer"))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# PUT /api/tools/{id}  — update (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_tool(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    tool = await create_test_tool(db_session, name="upd-tool")
    resp = await client.put(f"/api/tools/{tool.id}", json={
        "description": "Updated description",
        "is_enabled": False,
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated description"
    assert resp.json()["is_enabled"] is False


# ---------------------------------------------------------------------------
# DELETE /api/tools/{id}  — delete (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_tool(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    tool = await create_test_tool(db_session, name="del-tool")
    resp = await client.delete(f"/api/tools/{tool.id}", headers=admin_headers)
    assert resp.status_code == 204

    resp2 = await client.get(f"/api/tools/{tool.id}", headers=make_auth_header("viewer"))
    assert resp2.status_code == 404


@pytest.mark.asyncio
async def test_delete_tool_not_found(client: AsyncClient, admin_headers: dict):
    resp = await client.delete(f"/api/tools/{uuid.uuid4()}", headers=admin_headers)
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# MCP Server CRUD
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_mcp_servers_empty(client: AsyncClient):
    resp = await client.get("/api/tools/servers", headers=make_auth_header("viewer"))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_create_mcp_server(client: AsyncClient, admin_headers: dict):
    resp = await client.post("/api/tools/servers", json={
        "name": "my-server",
        "transport": "http",
        "url": "http://localhost:8080",
    }, headers=admin_headers)
    assert resp.status_code == 201
    assert resp.json()["name"] == "my-server"
    assert resp.json()["status"] == "unknown"


@pytest.mark.asyncio
async def test_create_mcp_server_duplicate(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    await create_test_mcp_server(db_session, name="dup-srv")
    resp = await client.post("/api/tools/servers", json={
        "name": "dup-srv",
        "transport": "http",
    }, headers=admin_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_update_mcp_server(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    server = await create_test_mcp_server(db_session, name="upd-srv")
    resp = await client.put(f"/api/tools/servers/{server.id}", json={
        "description": "Updated server",
    }, headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated server"


@pytest.mark.asyncio
async def test_delete_mcp_server(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    server = await create_test_mcp_server(db_session, name="del-srv")
    resp = await client.delete(f"/api/tools/servers/{server.id}", headers=admin_headers)
    assert resp.status_code == 204


@pytest.mark.asyncio
async def test_delete_mcp_server_not_found(client: AsyncClient, admin_headers: dict):
    resp = await client.delete(
        f"/api/tools/servers/{uuid.uuid4()}", headers=admin_headers,
    )
    assert resp.status_code == 404
