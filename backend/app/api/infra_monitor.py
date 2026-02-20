"""
PACO Infrastructure Monitoring API

Endpoints for health checks, metrics, circuit breaker states, and logs.
"""

from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func, desc
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession
from app.db.models import (
    Infrastructure,
    InfraAgent,
    InfraHealthCheck,
    InfraMetric,
    InfraOrchestrator,
)
from app.services.docker_manager import DockerManager

router = APIRouter(prefix="/infrastructures", tags=["Infrastructure Monitoring"])

docker = DockerManager()


class HealthResponse(BaseModel):
    infrastructure_id: str
    status: str
    services: List[Dict[str, Any]]
    summary: Dict[str, int]


class ServiceHealthResponse(BaseModel):
    service_name: str
    status: str
    response_time_ms: int | None
    circuit_state: str | None
    details: Dict[str, Any]
    checked_at: str


class MetricsResponse(BaseModel):
    infrastructure_id: str
    period: str
    total_requests: int
    total_tokens: int
    total_errors: int
    avg_latency_ms: float
    error_rate: float


class AgentMetricsResponse(BaseModel):
    agent_slug: str
    display_name: str | None
    total_requests: int
    total_tokens: int
    total_errors: int
    avg_latency_ms: float
    status: str


class CircuitBreakerResponse(BaseModel):
    agent_slug: str
    display_name: str | None
    circuit_state: str
    last_check: str | None
    failure_count: int


class LogResponse(BaseModel):
    logs: str
    service: str | None
    tail: int


async def _get_infra(db, infra_id: UUID) -> Infrastructure:
    result = await db.execute(
        select(Infrastructure)
        .where(Infrastructure.id == infra_id)
        .options(
            selectinload(Infrastructure.agents),
            selectinload(Infrastructure.orchestrator),
        )
    )
    infra = result.scalar_one_or_none()
    if not infra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Infrastructure {infra_id} not found",
        )
    return infra


@router.get("/{infra_id}/health", response_model=HealthResponse)
async def get_infrastructure_health(
    infra_id: UUID,
    db: DbSession,
) -> HealthResponse:
    """Get overall health dashboard for an infrastructure."""
    infra = await _get_infra(db, infra_id)

    services = []
    summary = {"healthy": 0, "unhealthy": 0, "degraded": 0, "unknown": 0}

    if infra.status not in ("running", "building", "deploying"):
        return HealthResponse(
            infrastructure_id=str(infra_id),
            status=infra.status,
            services=[],
            summary=summary,
        )

    # Get latest health check for each service
    subq = (
        select(
            InfraHealthCheck.service_name,
            func.max(InfraHealthCheck.checked_at).label("latest"),
        )
        .where(InfraHealthCheck.infrastructure_id == infra_id)
        .group_by(InfraHealthCheck.service_name)
        .subquery()
    )

    result = await db.execute(
        select(InfraHealthCheck)
        .join(
            subq,
            (InfraHealthCheck.service_name == subq.c.service_name)
            & (InfraHealthCheck.checked_at == subq.c.latest),
        )
        .where(InfraHealthCheck.infrastructure_id == infra_id)
    )
    checks = result.scalars().all()

    for check in checks:
        services.append({
            "service_name": check.service_name,
            "service_type": check.service_type,
            "status": check.status,
            "response_time_ms": check.response_time_ms,
            "circuit_state": check.circuit_state,
            "checked_at": check.checked_at.isoformat(),
        })
        if check.status in summary:
            summary[check.status] += 1
        else:
            summary["unknown"] += 1

    # If no health checks exist yet, try live docker ps
    if not services and infra.project_path:
        try:
            statuses = await docker.ps(infra.project_path)
            for svc in statuses:
                svc_status = "healthy" if svc.status == "running" else "unhealthy"
                services.append({
                    "service_name": svc.name,
                    "service_type": "agent" if "agent" in svc.name else "service",
                    "status": svc_status,
                    "response_time_ms": None,
                    "circuit_state": None,
                    "checked_at": None,
                })
                summary[svc_status] += 1
        except Exception:
            pass

    overall = "healthy"
    if summary["unhealthy"] > 0:
        overall = "unhealthy"
    elif summary["degraded"] > 0:
        overall = "degraded"
    elif summary["healthy"] == 0:
        overall = "unknown"

    return HealthResponse(
        infrastructure_id=str(infra_id),
        status=overall,
        services=services,
        summary=summary,
    )


@router.get("/{infra_id}/health/{service}", response_model=List[ServiceHealthResponse])
async def get_service_health(
    infra_id: UUID,
    service: str,
    db: DbSession,
    limit: int = Query(default=20, le=100),
) -> List[ServiceHealthResponse]:
    """Get health history for a specific service."""
    result = await db.execute(
        select(InfraHealthCheck)
        .where(
            InfraHealthCheck.infrastructure_id == infra_id,
            InfraHealthCheck.service_name == service,
        )
        .order_by(desc(InfraHealthCheck.checked_at))
        .limit(limit)
    )
    checks = result.scalars().all()

    return [
        ServiceHealthResponse(
            service_name=c.service_name,
            status=c.status,
            response_time_ms=c.response_time_ms,
            circuit_state=c.circuit_state,
            details=c.details or {},
            checked_at=c.checked_at.isoformat(),
        )
        for c in checks
    ]


@router.get("/{infra_id}/metrics", response_model=MetricsResponse)
async def get_infrastructure_metrics(
    infra_id: UUID,
    db: DbSession,
) -> MetricsResponse:
    """Get aggregated metrics for an infrastructure."""
    result = await db.execute(
        select(
            func.coalesce(func.sum(InfraMetric.total_requests), 0).label("total_requests"),
            func.coalesce(func.sum(InfraMetric.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(InfraMetric.total_errors), 0).label("total_errors"),
            func.coalesce(func.avg(InfraMetric.avg_latency_ms), 0).label("avg_latency_ms"),
        ).where(InfraMetric.infrastructure_id == infra_id)
    )
    row = result.one()

    total_requests = int(row.total_requests)
    total_errors = int(row.total_errors)
    error_rate = (total_errors / total_requests * 100) if total_requests > 0 else 0

    return MetricsResponse(
        infrastructure_id=str(infra_id),
        period="all_time",
        total_requests=total_requests,
        total_tokens=int(row.total_tokens),
        total_errors=total_errors,
        avg_latency_ms=float(row.avg_latency_ms),
        error_rate=round(error_rate, 2),
    )


@router.get("/{infra_id}/metrics/agents", response_model=List[AgentMetricsResponse])
async def get_agent_metrics(
    infra_id: UUID,
    db: DbSession,
) -> List[AgentMetricsResponse]:
    """Get per-agent metrics."""
    infra = await _get_infra(db, infra_id)
    agent_map = {a.agent_id_slug: a for a in infra.agents}

    result = await db.execute(
        select(
            InfraMetric.agent_slug,
            func.coalesce(func.sum(InfraMetric.total_requests), 0).label("total_requests"),
            func.coalesce(func.sum(InfraMetric.total_tokens), 0).label("total_tokens"),
            func.coalesce(func.sum(InfraMetric.total_errors), 0).label("total_errors"),
            func.coalesce(func.avg(InfraMetric.avg_latency_ms), 0).label("avg_latency_ms"),
        )
        .where(
            InfraMetric.infrastructure_id == infra_id,
            InfraMetric.agent_slug.isnot(None),
        )
        .group_by(InfraMetric.agent_slug)
    )
    rows = result.all()

    metrics = []
    for row in rows:
        agent = agent_map.get(row.agent_slug)
        metrics.append(
            AgentMetricsResponse(
                agent_slug=row.agent_slug,
                display_name=agent.display_name if agent else None,
                total_requests=int(row.total_requests),
                total_tokens=int(row.total_tokens),
                total_errors=int(row.total_errors),
                avg_latency_ms=float(row.avg_latency_ms),
                status=agent.status if agent else "unknown",
            )
        )

    # Include agents with no metrics yet
    seen = {m.agent_slug for m in metrics}
    for agent in infra.agents:
        if agent.agent_id_slug not in seen:
            metrics.append(
                AgentMetricsResponse(
                    agent_slug=agent.agent_id_slug,
                    display_name=agent.display_name,
                    total_requests=0,
                    total_tokens=0,
                    total_errors=0,
                    avg_latency_ms=0,
                    status=agent.status,
                )
            )

    return metrics


@router.get("/{infra_id}/circuits", response_model=List[CircuitBreakerResponse])
async def get_circuit_breaker_states(
    infra_id: UUID,
    db: DbSession,
) -> List[CircuitBreakerResponse]:
    """Get circuit breaker states for all agents."""
    infra = await _get_infra(db, infra_id)

    circuits = []
    for agent in infra.agents:
        # Get latest health check with circuit state for this agent
        result = await db.execute(
            select(InfraHealthCheck)
            .where(
                InfraHealthCheck.infrastructure_id == infra_id,
                InfraHealthCheck.service_name == f"agent-{agent.agent_id_slug}",
            )
            .order_by(desc(InfraHealthCheck.checked_at))
            .limit(1)
        )
        check = result.scalar_one_or_none()

        # Count recent failures
        failure_result = await db.execute(
            select(func.count())
            .select_from(InfraHealthCheck)
            .where(
                InfraHealthCheck.infrastructure_id == infra_id,
                InfraHealthCheck.service_name == f"agent-{agent.agent_id_slug}",
                InfraHealthCheck.status == "unhealthy",
            )
        )
        failure_count = failure_result.scalar() or 0

        circuits.append(
            CircuitBreakerResponse(
                agent_slug=agent.agent_id_slug,
                display_name=agent.display_name,
                circuit_state=check.circuit_state if check and check.circuit_state else "closed",
                last_check=check.checked_at.isoformat() if check else None,
                failure_count=failure_count,
            )
        )

    return circuits


@router.get("/{infra_id}/logs", response_model=LogResponse)
async def get_infrastructure_logs(
    infra_id: UUID,
    db: DbSession,
    service: Optional[str] = Query(default=None),
    tail: int = Query(default=100, le=1000),
) -> LogResponse:
    """Get aggregated or per-service logs."""
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    logs = await docker.logs(infra.project_path, service=service, tail=tail)

    return LogResponse(
        logs=logs,
        service=service,
        tail=tail,
    )


@router.get("/{infra_id}/logs/{service}", response_model=LogResponse)
async def get_service_logs(
    infra_id: UUID,
    service: str,
    db: DbSession,
    tail: int = Query(default=100, le=1000),
) -> LogResponse:
    """Get logs for a specific service."""
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    logs = await docker.logs(infra.project_path, service=service, tail=tail)

    return LogResponse(
        logs=logs,
        service=service,
        tail=tail,
    )


@router.get("/{infra_id}/services", response_model=List[Dict[str, str]])
async def get_service_statuses(
    infra_id: UUID,
    db: DbSession,
) -> List[Dict[str, str]]:
    """Get Docker Compose service statuses."""
    infra = await _get_infra(db, infra_id)

    if not infra.project_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Infrastructure not yet generated",
        )

    statuses = await docker.ps(infra.project_path)
    return [
        {
            "name": s.name,
            "status": s.status,
            "health": s.health,
            "ports": str(s.ports),
        }
        for s in statuses
    ]
