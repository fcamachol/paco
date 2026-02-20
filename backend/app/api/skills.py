"""
PACO Skills API

Filesystem is source of truth for skill content (SKILL.md).
DB is an index for querying and agent associations.
"""

import io
import zipfile
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Query, status
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession
from app.db.models import AgentSkill, Skill
from app.services.skill_filesystem import SkillFilesystemService

router = APIRouter(prefix="/skills", tags=["Skills"])
fs = SkillFilesystemService()


# =============================================================================
# Schemas
# =============================================================================


class SkillCreateRequest(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    allowed_tools: List[str] = []
    body: str = ""


class SkillUpdateRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    allowed_tools: Optional[List[str]] = None
    body: Optional[str] = None
    is_active: Optional[bool] = None


class SkillResponse(BaseModel):
    id: str
    code: str
    name: str
    description: Optional[str]
    allowed_tools: List[str]
    body: str
    is_active: bool
    resource_files: List[str]
    agent_count: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class SkillAgentResponse(BaseModel):
    agent_id: str
    agent_name: str
    agent_display_name: Optional[str]
    is_enabled: bool


# =============================================================================
# Helpers
# =============================================================================


def _skill_to_response(skill: Skill, agent_count: int = 0) -> SkillResponse:
    """Build response by merging DB index + filesystem content."""
    try:
        fs_data = fs.read_skill_md(skill.code)
    except FileNotFoundError:
        fs_data = {"name": skill.name, "description": skill.description or "", "allowed_tools": [], "body": ""}

    resource_files = fs.list_resource_files(skill.code)

    return SkillResponse(
        id=str(skill.id),
        code=skill.code,
        name=fs_data.get("name", skill.name),
        description=fs_data.get("description", skill.description),
        allowed_tools=fs_data.get("allowed_tools", []),
        body=fs_data.get("body", ""),
        is_active=skill.is_active,
        resource_files=resource_files,
        agent_count=agent_count,
        created_at=skill.created_at,
        updated_at=skill.updated_at,
    )


async def _get_skill_or_404(code: str, db) -> Skill:
    result = await db.execute(select(Skill).where(Skill.code == code))
    skill = result.scalar_one_or_none()
    if not skill:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Skill '{code}' not found",
        )
    return skill


async def _get_agent_count(skill_id, db) -> int:
    result = await db.execute(
        select(func.count()).where(AgentSkill.skill_id == skill_id)
    )
    return result.scalar() or 0


# =============================================================================
# Endpoints
# =============================================================================


# --- Sync filesystem -> DB ---

@router.post("/sync", status_code=status.HTTP_200_OK)
async def sync_skills_from_filesystem(
    db: DbSession,
    _: AdminUser,
) -> Dict[str, Any]:
    """Scan filesystem for SKILL.md files and sync DB index."""
    scanned = fs.scan_skills()
    created = 0
    updated = 0

    for skill_data in scanned:
        code = skill_data["code"]
        result = await db.execute(select(Skill).where(Skill.code == code))
        existing = result.scalar_one_or_none()

        if existing:
            existing.name = skill_data.get("name", existing.name)
            existing.description = skill_data.get("description", existing.description)
            existing.skill_path = skill_data.get("skill_path")
            updated += 1
        else:
            db.add(Skill(
                code=code,
                name=skill_data.get("name", code),
                description=skill_data.get("description"),
                skill_path=skill_data.get("skill_path"),
                is_active=True,
            ))
            created += 1

    await db.commit()
    return {"scanned": len(scanned), "created": created, "updated": updated}


# --- Import SKILL.md (before /{code} catch-all) ---

@router.post("/import/skill-md", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def import_skill_md(
    db: DbSession,
    _: AdminUser,
    file: UploadFile = File(...),
) -> SkillResponse:
    """Import a skill from a SKILL.md file upload."""
    raw = await file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File must be UTF-8 text")

    # Parse frontmatter from the uploaded content
    import re
    import yaml
    _FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
    match = _FM_RE.match(content)
    if not match:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No valid YAML frontmatter found")

    fm = yaml.safe_load(match.group(1)) or {}
    body = content[match.end():].strip()

    code = fm.get("name", "").strip()
    if not code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Frontmatter 'name' field is required")

    # Auto-suffix on collision
    base_code = code
    suffix = 1
    while True:
        result = await db.execute(select(Skill).where(Skill.code == code))
        if not result.scalar_one_or_none():
            break
        suffix += 1
        code = f"{base_code}-{suffix}"

    description = fm.get("description", "")
    allowed_raw = fm.get("allowed-tools", "")
    if isinstance(allowed_raw, str):
        allowed_tools = allowed_raw.split() if allowed_raw else []
    else:
        allowed_tools = list(allowed_raw)

    # Write to filesystem
    fs.write_skill_md(code, fm.get("name", code), description, allowed_tools, body)

    # Create DB index
    skill = Skill(
        code=code,
        name=fm.get("name", code),
        description=description,
        skill_path=str(fs._skill_md_path(code)),
        is_active=True,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return _skill_to_response(skill)


# --- Standard CRUD ---

@router.post("", response_model=SkillResponse, status_code=status.HTTP_201_CREATED)
async def create_skill(
    request: SkillCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> SkillResponse:
    """Create a new skill. Writes SKILL.md to filesystem, creates DB index."""
    result = await db.execute(select(Skill).where(Skill.code == request.code))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Skill '{request.code}' already exists",
        )

    # Write filesystem first
    fs.write_skill_md(
        request.code,
        request.name,
        request.description or "",
        request.allowed_tools,
        request.body,
    )

    # Create DB index
    skill = Skill(
        code=request.code,
        name=request.name,
        description=request.description,
        skill_path=str(fs._skill_md_path(request.code)),
        is_active=True,
    )
    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return _skill_to_response(skill)


@router.get("", response_model=List[SkillResponse])
async def list_skills(db: DbSession) -> List[SkillResponse]:
    """List all skills (DB index + filesystem content)."""
    result = await db.execute(select(Skill).order_by(Skill.code))
    skills = result.scalars().all()

    responses = []
    for skill in skills:
        count = await _get_agent_count(skill.id, db)
        responses.append(_skill_to_response(skill, agent_count=count))

    return responses


@router.get("/{code}", response_model=SkillResponse)
async def get_skill(code: str, db: DbSession) -> SkillResponse:
    """Get skill by code."""
    skill = await _get_skill_or_404(code, db)
    count = await _get_agent_count(skill.id, db)
    return _skill_to_response(skill, agent_count=count)


@router.put("/{code}", response_model=SkillResponse)
async def update_skill(
    code: str,
    request: SkillUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> SkillResponse:
    """Update a skill. Writes to filesystem, updates DB index."""
    skill = await _get_skill_or_404(code, db)

    # Read current filesystem state
    try:
        current = fs.read_skill_md(code)
    except FileNotFoundError:
        current = {"name": skill.name, "description": skill.description or "", "allowed_tools": [], "body": ""}

    # Merge updates
    name = request.name if request.name is not None else current["name"]
    description = request.description if request.description is not None else current["description"]
    allowed_tools = request.allowed_tools if request.allowed_tools is not None else current["allowed_tools"]
    body = request.body if request.body is not None else current["body"]

    # Write filesystem
    fs.write_skill_md(code, name, description, allowed_tools, body)

    # Update DB index
    skill.name = name
    skill.description = description

    if request.is_active is not None:
        skill.is_active = request.is_active

    await db.commit()
    await db.refresh(skill)

    count = await _get_agent_count(skill.id, db)
    return _skill_to_response(skill, agent_count=count)


@router.delete("/{code}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_skill(
    code: str,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete a skill from filesystem and DB."""
    skill = await _get_skill_or_404(code, db)
    fs.delete_skill(code)
    await db.delete(skill)
    await db.commit()


# --- Agents using skill ---

@router.get("/{code}/agents", response_model=List[SkillAgentResponse])
async def list_agents_using_skill(code: str, db: DbSession) -> List[SkillAgentResponse]:
    """List agents that use this skill."""
    skill = await _get_skill_or_404(code, db)

    result = await db.execute(
        select(AgentSkill)
        .where(AgentSkill.skill_id == skill.id)
        .options(selectinload(AgentSkill.agent))
    )
    agent_skills = result.scalars().all()

    return [
        SkillAgentResponse(
            agent_id=str(ask.agent.id),
            agent_name=ask.agent.name,
            agent_display_name=ask.agent.display_name,
            is_enabled=ask.is_enabled,
        )
        for ask in agent_skills
        if ask.agent
    ]


# --- Export SKILL.md ---

@router.get("/{code}/export/skill-md")
async def export_skill_md(
    code: str,
    db: DbSession,
    include_resources: bool = Query(False),
) -> Response:
    """Export a skill as SKILL.md file."""
    await _get_skill_or_404(code, db)

    try:
        skill_data = fs.read_skill_md(code)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"SKILL.md not found for '{code}'")

    # Rebuild SKILL.md content
    fm: Dict[str, Any] = {"name": skill_data["name"], "description": skill_data["description"]}
    if skill_data["allowed_tools"]:
        fm["allowed-tools"] = " ".join(skill_data["allowed_tools"])
    import yaml
    yaml_block = yaml.dump(fm, default_flow_style=False, sort_keys=False).strip()
    md_content = f"---\n{yaml_block}\n---\n\n{skill_data['body']}\n"

    resource_files = fs.list_resource_files(code)
    if include_resources and resource_files:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("SKILL.md", md_content)
            for rpath in resource_files:
                try:
                    rcontent = fs.read_resource_file(code, rpath)
                    zf.writestr(rpath, rcontent)
                except Exception:
                    continue
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{code}.zip"'},
        )

    return Response(
        content=md_content,
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="SKILL.md"'},
    )


# --- Resource file CRUD ---

@router.get("/{code}/resources", response_model=List[str])
async def list_resource_files(code: str, db: DbSession) -> List[str]:
    """List resource file paths for a skill."""
    await _get_skill_or_404(code, db)
    return fs.list_resource_files(code)


@router.get("/{code}/resources/{path:path}")
async def get_resource_file(code: str, path: str, db: DbSession) -> Response:
    """Get a resource file's content."""
    await _get_skill_or_404(code, db)
    try:
        content = fs.read_resource_file(code, path)
    except (FileNotFoundError, ValueError) as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    return Response(content=content, media_type="text/plain")


@router.put("/{code}/resources/{path:path}", response_model=SkillResponse)
async def upload_resource_file(
    code: str,
    path: str,
    db: DbSession,
    _: AdminUser,
    file: UploadFile = File(...),
) -> SkillResponse:
    """Upload or update a resource file for a skill."""
    skill = await _get_skill_or_404(code, db)

    raw = await file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Resource files must be UTF-8 text")

    if len(raw) > 1_000_000:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds 1MB limit")

    try:
        fs.write_resource_file(code, path, content)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    count = await _get_agent_count(skill.id, db)
    return _skill_to_response(skill, agent_count=count)


@router.delete("/{code}/resources/{path:path}", response_model=SkillResponse)
async def delete_resource_file(
    code: str,
    path: str,
    db: DbSession,
    _: AdminUser,
) -> SkillResponse:
    """Delete a resource file from a skill."""
    skill = await _get_skill_or_404(code, db)
    try:
        fs.delete_resource_file(code, path)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    count = await _get_agent_count(skill.id, db)
    return _skill_to_response(skill, agent_count=count)
