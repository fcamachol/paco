"""
PACO Infrastructure Deployment API

Endpoints for deploying, stopping, restarting infrastructure projects.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession, OperatorUser
from app.db.models import Infrastructure, InfraDeployment
from app.services.docker_manager import DockerManager

router = APIRouter(prefix="/infrastructures", tags=["Infrastructure Deployment"])

docker = DockerManager()


class DeployResponse(BaseModel):
    success: bool
    deployment_id: str | None = None
    status: str
    message: str
    details: Dict[str, Any] = {}


class DeploymentResponse(BaseModel):
    id: str
    infrastructure_id: str
    version: str
    status: str
    changes_summary: str | None
    started_at: str
    completed_at: str | None
    error_message: str | None


class ServiceStatusResponse(BaseModel):
    name: str
    status: str
    health: str
    ports: str


async def _get_infra(db, infra_id: UUID) -> Infrastructure:
    result = await db.execute(
        select(Infrastructure)
        .where(Infrastructure.id == infra_id)
        .options(selectinload(Infrastructure.agents))
    )
    infra = result.scalar_one_or_none()
    if not infra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Infrastructure {infra_id} not found",
        )
    return infra


@router.post("/{infra_id}/deploy", response_model=DeployResponse)
async def deploy_infrastructure(
    infra_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> DeployResponse:
    """Full deploy: build + up + health check."""
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated. Call generate first.",
        )

    # Create deployment record
    deployment = InfraDeployment(
        infrastructure_id=infra.id,
        version=infra.version,
        status="building",
        changes_summary="Full deployment",
    )
    db.add(deployment)
    infra.status = "building"
    await db.commit()
    await db.refresh(deployment)

    # Snapshot docker-compose
    try:
        from pathlib import Path
        compose_path = Path(infra.project_path) / "docker-compose.yml"
        if compose_path.exists():
            deployment.docker_compose_snapshot = compose_path.read_text()
            await db.commit()
    except Exception:
        pass

    # Build and deploy
    try:
        result = await docker.up(infra.project_path)

        if result["success"]:
            deployment.status = "running"
            deployment.completed_at = datetime.now(timezone.utc)
            infra.status = "running"
            await db.commit()

            return DeployResponse(
                success=True,
                deployment_id=str(deployment.id),
                status="running",
                message="Infrastructure deployed successfully",
                details=result,
            )
        else:
            deployment.status = "failed"
            deployment.error_message = result.get("stderr", "Build/deploy failed")
            deployment.completed_at = datetime.now(timezone.utc)
            infra.status = "error"
            await db.commit()

            return DeployResponse(
                success=False,
                deployment_id=str(deployment.id),
                status="failed",
                message="Deployment failed",
                details=result,
            )

    except Exception as e:
        deployment.status = "failed"
        deployment.error_message = str(e)
        deployment.completed_at = datetime.now(timezone.utc)
        infra.status = "error"
        await db.commit()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Deployment error: {e}",
        )


@router.post("/{infra_id}/deploy/agent/{slug}", response_model=DeployResponse)
async def deploy_single_agent(
    infra_id: UUID,
    slug: str,
    db: DbSession,
    _: OperatorUser,
) -> DeployResponse:
    """Deploy or rebuild a single agent container."""
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    service_name = f"agent-{slug}"
    result = await docker.up(infra.project_path, service=service_name)

    return DeployResponse(
        success=result["success"],
        status="running" if result["success"] else "failed",
        message=f"Agent {slug} {'deployed' if result['success'] else 'failed'}",
        details=result,
    )


@router.post("/{infra_id}/stop", response_model=DeployResponse)
async def stop_infrastructure(
    infra_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> DeployResponse:
    """Stop all infrastructure containers."""
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    result = await docker.down(infra.project_path)

    infra.status = "stopped"
    await db.commit()

    return DeployResponse(
        success=result["success"],
        status="stopped",
        message="Infrastructure stopped",
        details=result,
    )


@router.post("/{infra_id}/restart", response_model=DeployResponse)
async def restart_infrastructure(
    infra_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> DeployResponse:
    """Restart all infrastructure containers."""
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    result = await docker.restart(infra.project_path)

    infra.status = "running" if result["success"] else "error"
    await db.commit()

    return DeployResponse(
        success=result["success"],
        status=infra.status,
        message="Infrastructure restarted" if result["success"] else "Restart failed",
        details=result,
    )


@router.get("/{infra_id}/deployments", response_model=List[DeploymentResponse])
async def list_deployments(infra_id: UUID, db: DbSession) -> List[DeploymentResponse]:
    """Get deployment history."""
    result = await db.execute(
        select(InfraDeployment)
        .where(InfraDeployment.infrastructure_id == infra_id)
        .order_by(InfraDeployment.created_at.desc())
    )
    deployments = result.scalars().all()

    return [
        DeploymentResponse(
            id=str(d.id),
            infrastructure_id=str(d.infrastructure_id),
            version=d.version,
            status=d.status,
            changes_summary=d.changes_summary,
            started_at=d.started_at.isoformat(),
            completed_at=d.completed_at.isoformat() if d.completed_at else None,
            error_message=d.error_message,
        )
        for d in deployments
    ]


@router.post("/{infra_id}/rollback/{deployment_id}", response_model=DeployResponse)
async def rollback_deployment(
    infra_id: UUID,
    deployment_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> DeployResponse:
    """Rollback to a previous deployment snapshot."""
    result = await db.execute(
        select(InfraDeployment).where(
            InfraDeployment.id == deployment_id,
            InfraDeployment.infrastructure_id == infra_id,
        )
    )
    deployment = result.scalar_one_or_none()
    if not deployment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deployment not found",
        )

    if not deployment.docker_compose_snapshot:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No snapshot available for rollback",
        )

    infra_result = await db.execute(
        select(Infrastructure).where(Infrastructure.id == infra_id)
    )
    infra = infra_result.scalar_one_or_none()
    if not infra or not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure project path not found",
        )

    # Write snapshot to docker-compose.yml
    from pathlib import Path
    compose_path = Path(infra.project_path) / "docker-compose.yml"
    compose_path.write_text(deployment.docker_compose_snapshot)

    # Re-deploy
    deploy_result = await docker.up(infra.project_path)

    # Record rollback
    rollback_dep = InfraDeployment(
        infrastructure_id=infra.id,
        version=deployment.version,
        status="running" if deploy_result["success"] else "failed",
        changes_summary=f"Rollback to deployment {deployment_id}",
        completed_at=datetime.now(timezone.utc),
    )
    db.add(rollback_dep)
    deployment.status = "rolled_back"
    infra.status = "running" if deploy_result["success"] else "error"
    await db.commit()

    return DeployResponse(
        success=deploy_result["success"],
        deployment_id=str(rollback_dep.id),
        status=infra.status,
        message="Rollback completed" if deploy_result["success"] else "Rollback failed",
        details=deploy_result,
    )
