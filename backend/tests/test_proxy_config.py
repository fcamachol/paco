"""
Integration tests for proxy config API endpoints.

Covers server-level proxy config and per-tool proxy overrides.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import (
    create_test_mcp_server,
    create_test_tool,
    make_auth_header,
)


# ---------------------------------------------------------------------------
# PUT /api/tools/servers/{id}/proxy  — set / clear proxy config
# GET /api/tools/servers/{id}/proxy  — get proxy config with tool overrides
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_and_get_proxy_config(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    """Test setting and retrieving proxy config on an MCP server."""
    server = await create_test_mcp_server(db_session, name="proxy-srv")

    # Set proxy config
    proxy_data = {
        "proxy_config": {
            "enabled": True,
            "protocol": "http",
            "url": "http://squid:3128",
            "bypass_patterns": ["*.internal.local"],
        }
    }
    resp = await client.put(
        f"/api/tools/servers/{server.id}/proxy",
        json=proxy_data,
        headers=admin_headers,
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["proxy_config"]["enabled"] is True
    assert data["proxy_config"]["url"] == "http://squid:3128"

    # Get full proxy config
    resp = await client.get(
        f"/api/tools/servers/{server.id}/proxy",
        headers=make_auth_header("viewer"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["server"]["enabled"] is True
    assert data["server"]["url"] == "http://squid:3128"
    assert data["tools"] == {}

    # Clear proxy config
    resp = await client.put(
        f"/api/tools/servers/{server.id}/proxy",
        json={"proxy_config": None},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["proxy_config"] is None


@pytest.mark.asyncio
async def test_update_proxy_config_not_found(client: AsyncClient, admin_headers: dict):
    """Setting proxy on a non-existent server returns 404."""
    import uuid

    resp = await client.put(
        f"/api/tools/servers/{uuid.uuid4()}/proxy",
        json={"proxy_config": None},
        headers=admin_headers,
    )
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_update_proxy_config_viewer_rejected(
    client: AsyncClient, db_session: AsyncSession, viewer_headers: dict,
):
    """Only admins can update proxy config."""
    server = await create_test_mcp_server(db_session, name="proxy-noauth")
    resp = await client.put(
        f"/api/tools/servers/{server.id}/proxy",
        json={"proxy_config": None},
        headers=viewer_headers,
    )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PUT /api/tools/{id}/proxy  — per-tool proxy override
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_tool_proxy_override(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    """Test per-tool proxy override set and clear."""
    server = await create_test_mcp_server(db_session, name="tool-proxy-srv")
    tool = await create_test_tool(
        db_session, name="proxied-tool", mcp_server_id=server.id,
    )

    # Set tool proxy override
    resp = await client.put(
        f"/api/tools/{tool.id}/proxy",
        json={"proxy_config": {"enabled": False}},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["proxy_config"] == {"enabled": False}

    # Verify it shows in the server proxy response
    resp = await client.get(
        f"/api/tools/servers/{server.id}/proxy",
        headers=make_auth_header("viewer"),
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "proxied-tool" in data["tools"]
    assert data["tools"]["proxied-tool"]["enabled"] is False

    # Clear override
    resp = await client.put(
        f"/api/tools/{tool.id}/proxy",
        json={"proxy_config": None},
        headers=admin_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["proxy_config"] is None


@pytest.mark.asyncio
async def test_tool_proxy_override_not_found(client: AsyncClient, admin_headers: dict):
    """Setting proxy override on a non-existent tool returns 404."""
    import uuid

    resp = await client.put(
        f"/api/tools/{uuid.uuid4()}/proxy",
        json={"proxy_config": None},
        headers=admin_headers,
    )
    assert resp.status_code == 404
