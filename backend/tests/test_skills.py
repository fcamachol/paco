"""
Tests for the /api/skills endpoints.

The SkillFilesystemService is mocked so tests do not touch the real filesystem.
"""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests.conftest import create_test_skill, make_auth_header


def _mock_fs():
    """Return a mock SkillFilesystemService with sensible defaults."""
    mock = MagicMock()
    mock.read_skill_md.return_value = {
        "name": "Test Skill",
        "description": "Mocked",
        "allowed_tools": [],
        "body": "# Hello",
    }
    mock.list_resource_files.return_value = []
    mock.scan_skills.return_value = []
    mock.skill_exists.return_value = False
    mock._skill_md_path.return_value = "/tmp/skills/test-skill/SKILL.md"
    return mock


# ---------------------------------------------------------------------------
# GET /api/skills  — list
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_skills_empty(client: AsyncClient):
    resp = await client.get("/api/skills", headers=make_auth_header("viewer"))
    assert resp.status_code == 200
    assert resp.json() == []


@pytest.mark.asyncio
async def test_list_skills(client: AsyncClient, db_session: AsyncSession):
    await create_test_skill(db_session, code="skill-a", name="Skill A")
    await create_test_skill(db_session, code="skill-b", name="Skill B")

    with patch("app.api.skills.fs", _mock_fs()):
        resp = await client.get("/api/skills", headers=make_auth_header("viewer"))

    assert resp.status_code == 200
    codes = [s["code"] for s in resp.json()]
    assert "skill-a" in codes
    assert "skill-b" in codes


# ---------------------------------------------------------------------------
# GET /api/skills/{code}
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_skill(client: AsyncClient, db_session: AsyncSession):
    await create_test_skill(db_session, code="my-skill", name="My Skill")

    with patch("app.api.skills.fs", _mock_fs()):
        resp = await client.get("/api/skills/my-skill", headers=make_auth_header("viewer"))

    assert resp.status_code == 200
    assert resp.json()["code"] == "my-skill"


@pytest.mark.asyncio
async def test_get_skill_not_found(client: AsyncClient):
    resp = await client.get("/api/skills/nonexistent", headers=make_auth_header("viewer"))
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# POST /api/skills  — create (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_skill(client: AsyncClient, admin_headers: dict):
    mock_fs = _mock_fs()
    with patch("app.api.skills.fs", mock_fs):
        resp = await client.post("/api/skills", json={
            "code": "new-skill",
            "name": "New Skill",
            "description": "A new skill",
            "body": "# Content",
        }, headers=admin_headers)

    assert resp.status_code == 201
    assert resp.json()["code"] == "new-skill"
    mock_fs.write_skill_md.assert_called_once()


@pytest.mark.asyncio
async def test_create_skill_duplicate(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    await create_test_skill(db_session, code="dup-skill")
    resp = await client.post("/api/skills", json={
        "code": "dup-skill",
        "name": "Dup",
    }, headers=admin_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_create_skill_viewer_rejected(client: AsyncClient, viewer_headers: dict):
    resp = await client.post("/api/skills", json={
        "code": "x",
        "name": "X",
    }, headers=viewer_headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# PUT /api/skills/{code}  — update (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_skill(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    await create_test_skill(db_session, code="upd-skill")

    mock_fs = _mock_fs()
    with patch("app.api.skills.fs", mock_fs):
        resp = await client.put("/api/skills/upd-skill", json={
            "name": "Updated Skill",
            "body": "# Updated content",
        }, headers=admin_headers)

    assert resp.status_code == 200
    mock_fs.write_skill_md.assert_called_once()


# ---------------------------------------------------------------------------
# DELETE /api/skills/{code}  — delete (admin only)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_delete_skill(
    client: AsyncClient, db_session: AsyncSession, admin_headers: dict,
):
    await create_test_skill(db_session, code="del-skill")

    mock_fs = _mock_fs()
    with patch("app.api.skills.fs", mock_fs):
        resp = await client.delete("/api/skills/del-skill", headers=admin_headers)

    assert resp.status_code == 204
    mock_fs.delete_skill.assert_called_once_with("del-skill")


@pytest.mark.asyncio
async def test_delete_skill_not_found(client: AsyncClient, admin_headers: dict):
    resp = await client.delete("/api/skills/ghost", headers=admin_headers)
    assert resp.status_code == 404
