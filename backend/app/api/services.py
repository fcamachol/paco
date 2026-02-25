"""
PACO External Services API

CRUD and health checks for external service integrations.
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession, OperatorUser
from app.db.models import ExternalService
from app.services.external_service_health import check_service_health

router = APIRouter(prefix="/services", tags=["Services"])
logger = logging.getLogger(__name__)


# =============================================================================
# Schemas
# =============================================================================


class ExternalServiceResponse(BaseModel):
    """External service response model."""

    id: str
    name: str
    service_type: str
    provider: str
    base_url: Optional[str]
    api_key_env_var: Optional[str]
    auth_config: Dict[str, Any] = {}
    health_check_endpoint: Optional[str]
    health_check_method: str
    status: str
    last_health_check: Optional[datetime]
    response_time_ms: Optional[int]
    last_error: Optional[str]
    is_auto_seeded: bool
    description: Optional[str]
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CreateServiceRequest(BaseModel):
    """Create external service request."""

    name: str
    service_type: str = "custom"
    provider: str = "custom"
    base_url: Optional[str] = None
    api_key_env_var: Optional[str] = None
    auth_config: Dict[str, Any] = {}
    health_check_endpoint: Optional[str] = None
    health_check_method: str = "GET"
    description: Optional[str] = None


class UpdateServiceRequest(BaseModel):
    """Update external service request."""

    name: Optional[str] = None
    service_type: Optional[str] = None
    provider: Optional[str] = None
    base_url: Optional[str] = None
    api_key_env_var: Optional[str] = None
    auth_config: Optional[Dict[str, Any]] = None
    health_check_endpoint: Optional[str] = None
    health_check_method: Optional[str] = None
    description: Optional[str] = None


def _service_response(service: ExternalService) -> ExternalServiceResponse:
    return ExternalServiceResponse(
        id=str(service.id),
        name=service.name,
        service_type=service.service_type,
        provider=service.provider,
        base_url=service.base_url,
        api_key_env_var=service.api_key_env_var,
        auth_config=service.auth_config or {},
        health_check_endpoint=service.health_check_endpoint,
        health_check_method=service.health_check_method,
        status=service.status,
        last_health_check=service.last_health_check,
        response_time_ms=service.response_time_ms,
        last_error=service.last_error,
        is_auto_seeded=service.is_auto_seeded,
        description=service.description,
        created_at=service.created_at,
        updated_at=service.updated_at,
    )


# =============================================================================
# CRUD Endpoints
# =============================================================================


@router.get("", response_model=List[ExternalServiceResponse])
async def list_services(
    db: DbSession,
    _: OperatorUser,
) -> List[ExternalServiceResponse]:
    """List all external services."""
    result = await db.execute(
        select(ExternalService).order_by(ExternalService.service_type, ExternalService.name)
    )
    return [_service_response(s) for s in result.scalars().all()]


@router.post("", response_model=ExternalServiceResponse, status_code=201)
async def create_service(
    body: CreateServiceRequest,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Create a new external service."""
    existing = await db.execute(
        select(ExternalService).where(ExternalService.name == body.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Service '{body.name}' already exists")

    service = ExternalService(
        name=body.name,
        service_type=body.service_type,
        provider=body.provider,
        base_url=body.base_url,
        api_key_env_var=body.api_key_env_var,
        auth_config=body.auth_config,
        health_check_endpoint=body.health_check_endpoint,
        health_check_method=body.health_check_method,
        description=body.description,
    )
    db.add(service)
    await db.commit()
    await db.refresh(service)
    return _service_response(service)


@router.get("/{service_id}", response_model=ExternalServiceResponse)
async def get_service(
    service_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Get a single external service."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")
    return _service_response(service)


@router.put("/{service_id}", response_model=ExternalServiceResponse)
async def update_service(
    service_id: UUID,
    body: UpdateServiceRequest,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Update an external service."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(service, field, value)

    await db.commit()
    await db.refresh(service)
    return _service_response(service)


@router.delete("/{service_id}", status_code=204)
async def delete_service(
    service_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete an external service (admin only)."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")

    await db.delete(service)
    await db.commit()


# =============================================================================
# Health Check Endpoints
# =============================================================================


@router.post("/{service_id}/health", response_model=ExternalServiceResponse)
async def check_single_health(
    service_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> ExternalServiceResponse:
    """Run health check for a single service."""
    result = await db.execute(
        select(ExternalService).where(ExternalService.id == service_id)
    )
    service = result.scalar_one_or_none()
    if not service:
        raise HTTPException(status_code=404, detail=f"Service {service_id} not found")

    health = await check_service_health(service)
    service.status = health.status
    service.response_time_ms = health.response_time_ms
    service.last_error = health.error
    service.last_health_check = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(service)
    return _service_response(service)


@router.post("/health/all", response_model=List[ExternalServiceResponse])
async def check_all_health(
    db: DbSession,
    _: OperatorUser,
) -> List[ExternalServiceResponse]:
    """Run health checks for all services."""
    result = await db.execute(
        select(ExternalService).order_by(ExternalService.service_type, ExternalService.name)
    )
    services = result.scalars().all()

    responses = []
    for service in services:
        health = await check_service_health(service)
        service.status = health.status
        service.response_time_ms = health.response_time_ms
        service.last_error = health.error
        service.last_health_check = datetime.now(timezone.utc)
        responses.append(_service_response(service))

    await db.commit()
    return responses
