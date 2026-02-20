"""
PACO Infrastructure Upgrade API

Endpoints for hot-upgrading running infrastructure:
- Add agent to running infrastructure
- Hot-update agent prompts
- Update orchestrator classification
- Version management
"""

from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession, OperatorUser
from app.db.models import Infrastructure, InfraAgent, InfraDeployment
from app.services.docker_manager import DockerManager
from app.services.infra_generator import InfraGenerator

router = APIRouter(prefix="/infrastructures", tags=["Infrastructure Upgrades"])

docker = DockerManager()
generator = InfraGenerator()


class UpgradeResponse(BaseModel):
    success: bool
    message: str
    version: str
    details: Dict[str, Any] = {}


class VersionBumpRequest(BaseModel):
    bump_type: str = "patch"  # "major", "minor", "patch"


def _bump_version(version: str, bump_type: str = "patch") -> str:
    """Bump a semver string."""
    parts = version.split(".")
    if len(parts) != 3:
        parts = ["1", "0", "0"]

    major, minor, patch = int(parts[0]), int(parts[1]), int(parts[2])

    if bump_type == "major":
        major += 1
        minor = 0
        patch = 0
    elif bump_type == "minor":
        minor += 1
        patch = 0
    else:
        patch += 1

    return f"{major}.{minor}.{patch}"


async def _get_infra(db, infra_id: UUID) -> Infrastructure:
    result = await db.execute(
        select(Infrastructure)
        .where(Infrastructure.id == infra_id)
        .options(
            selectinload(Infrastructure.orchestrator),
            selectinload(Infrastructure.agents),
        )
    )
    infra = result.scalar_one_or_none()
    if not infra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Infrastructure {infra_id} not found",
        )
    return infra


@router.post("/{infra_id}/upgrade/add-agent/{slug}", response_model=UpgradeResponse)
async def add_agent_to_running(
    infra_id: UUID,
    slug: str,
    db: DbSession,
    _: AdminUser,
) -> UpgradeResponse:
    """
    Add a new agent to a running infrastructure.

    Steps:
    1. Verify agent exists in DB
    2. Regenerate docker-compose.yml and new agent directory
    3. Build and start only the new agent container
    4. Restart orchestrator to pick up new classification rules
    5. Record deployment and bump version
    """
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    # Find the agent
    agent = None
    for a in infra.agents:
        if a.agent_id_slug == slug:
            agent = a
            break

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{slug}' not found in infrastructure",
        )

    # Step 1: Regenerate the full project (updates docker-compose + adds agent dir)
    gen_result = await generator.generate(infra_id)
    if not gen_result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Code generation failed: {gen_result.error}",
        )

    # Step 2: Build and start just the new agent
    service_name = f"agent-{slug}"
    up_result = await docker.up(infra.project_path, service=service_name)

    if not up_result["success"]:
        return UpgradeResponse(
            success=False,
            message=f"Failed to start agent {slug}",
            version=infra.version,
            details=up_result,
        )

    # Step 3: Restart orchestrator to pick up new agent
    orch_result = await docker.restart(infra.project_path, service="orchestrator")

    # Step 4: Bump version and record deployment
    infra.version = _bump_version(infra.version, "minor")
    agent.status = "running"

    deployment = InfraDeployment(
        infrastructure_id=infra.id,
        version=infra.version,
        status="running",
        changes_summary=f"Added agent: {slug}",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(deployment)
    await db.commit()

    return UpgradeResponse(
        success=True,
        message=f"Agent '{slug}' added and running. Orchestrator restarted.",
        version=infra.version,
        details={
            "agent_result": up_result,
            "orchestrator_restarted": orch_result.get("success", False),
            "files_generated": gen_result.files_generated,
        },
    )


@router.post("/{infra_id}/upgrade/prompts/{slug}", response_model=UpgradeResponse)
async def hot_update_prompts(
    infra_id: UUID,
    slug: str,
    db: DbSession,
    _: OperatorUser,
) -> UpgradeResponse:
    """
    Hot-update an agent's system prompts without full redeployment.

    Steps:
    1. Regenerate only the agent's prompts.py from DB config
    2. Rebuild and restart only that agent's container
    """
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    # Find the agent
    agent = None
    for a in infra.agents:
        if a.agent_id_slug == slug:
            agent = a
            break

    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{slug}' not found",
        )

    # Regenerate just this agent's files
    gen_result = await generator.regenerate_agent(infra_id, slug)
    if not gen_result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Regeneration failed: {gen_result.error}",
        )

    # Rebuild and restart agent container
    service_name = f"agent-{slug}"
    result = await docker.up(infra.project_path, service=service_name)

    if not result["success"]:
        return UpgradeResponse(
            success=False,
            message=f"Failed to restart agent {slug}",
            version=infra.version,
            details=result,
        )

    # Bump patch version
    agent.version = _bump_version(agent.version, "patch")
    await db.commit()

    return UpgradeResponse(
        success=True,
        message=f"Prompts updated for agent '{slug}'. Container rebuilt.",
        version=agent.version,
        details={
            "files_regenerated": gen_result.files_generated,
        },
    )


@router.post("/{infra_id}/upgrade/orchestrator", response_model=UpgradeResponse)
async def update_orchestrator_classification(
    infra_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> UpgradeResponse:
    """
    Update orchestrator classification rules after config changes.

    Steps:
    1. Regenerate classifier.py and config.py from current DB config
    2. Rebuild and restart only the orchestrator container
    """
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    if not infra.orchestrator:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No orchestrator configured",
        )

    # Regenerate orchestrator files
    gen_result = await generator.regenerate_orchestrator(infra_id)
    if not gen_result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Regeneration failed: {gen_result.error}",
        )

    # Rebuild and restart orchestrator
    result = await docker.up(infra.project_path, service="orchestrator")

    if not result["success"]:
        return UpgradeResponse(
            success=False,
            message="Failed to restart orchestrator",
            version=infra.version,
            details=result,
        )

    # Bump patch version
    infra.version = _bump_version(infra.version, "patch")
    await db.commit()

    return UpgradeResponse(
        success=True,
        message="Orchestrator classification updated. Container rebuilt.",
        version=infra.version,
        details={
            "files_regenerated": gen_result.files_generated,
        },
    )


@router.post("/{infra_id}/upgrade/version", response_model=UpgradeResponse)
async def bump_version(
    infra_id: UUID,
    request: VersionBumpRequest,
    db: DbSession,
    _: AdminUser,
) -> UpgradeResponse:
    """Manually bump the infrastructure version."""
    infra = await _get_infra(db, infra_id)

    old_version = infra.version
    infra.version = _bump_version(infra.version, request.bump_type)
    await db.commit()

    return UpgradeResponse(
        success=True,
        message=f"Version bumped from {old_version} to {infra.version}",
        version=infra.version,
    )


@router.post("/{infra_id}/upgrade/regenerate-all", response_model=UpgradeResponse)
async def regenerate_and_redeploy(
    infra_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> UpgradeResponse:
    """
    Full regeneration and redeployment.

    Regenerates all code from current DB config and redeploys everything.
    """
    infra = await _get_infra(db, infra_id)

    # Regenerate all code
    gen_result = await generator.generate(infra_id)
    if not gen_result.success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {gen_result.error}",
        )

    # Full redeploy if infrastructure was running
    if infra.status in ("running", "error"):
        deploy_result = await docker.up(infra.project_path)

        deployment = InfraDeployment(
            infrastructure_id=infra.id,
            version=infra.version,
            status="running" if deploy_result["success"] else "failed",
            changes_summary="Full regeneration and redeployment",
            completed_at=datetime.now(timezone.utc),
            error_message=deploy_result.get("stderr") if not deploy_result["success"] else None,
        )
        db.add(deployment)

        infra.status = "running" if deploy_result["success"] else "error"
        infra.version = _bump_version(infra.version, "minor")
        await db.commit()

        return UpgradeResponse(
            success=deploy_result["success"],
            message="Full regeneration and redeployment " + ("succeeded" if deploy_result["success"] else "failed"),
            version=infra.version,
            details={
                "files_generated": gen_result.files_generated,
                "deploy_result": deploy_result,
            },
        )

    return UpgradeResponse(
        success=True,
        message="Code regenerated. Infrastructure not running, skipping deployment.",
        version=infra.version,
        details={
            "files_generated": gen_result.files_generated,
        },
    )
