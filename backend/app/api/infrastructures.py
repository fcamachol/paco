"""
PACO Infrastructure API

CRUD operations for multi-agent infrastructures, orchestrators, and agents.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession, OperatorUser
from app.db.models import Infrastructure, InfraOrchestrator, InfraAgent, HiveCoordinator, CompanyConfig

router = APIRouter(prefix="/infrastructures", tags=["Infrastructures"])


# =============================================================================
# Pydantic Schemas
# =============================================================================


class InfraCreateRequest(BaseModel):
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    type: str = "orchestrator"
    port_range_start: int = 8000
    env_config: Dict[str, Any] = {}
    security_config: Dict[str, Any] = {}
    db_name: Optional[str] = None
    redis_config: Dict[str, Any] = {}
    lightning_config: Optional[Dict[str, Any]] = None


class InfraUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    port_range_start: Optional[int] = None
    env_config: Optional[Dict[str, Any]] = None
    security_config: Optional[Dict[str, Any]] = None
    db_name: Optional[str] = None
    redis_config: Optional[Dict[str, Any]] = None
    lightning_config: Optional[Dict[str, Any]] = None


class InfraResponse(BaseModel):
    id: str
    name: str
    display_name: Optional[str]
    description: Optional[str]
    type: str = "orchestrator"
    status: str
    project_path: Optional[str]
    port_range_start: int
    env_config: Dict[str, Any]
    security_config: Dict[str, Any]
    db_name: Optional[str]
    redis_config: Dict[str, Any]
    lightning_config: Dict[str, Any] = {}
    version: str
    agent_count: int = 0
    has_orchestrator: bool = False
    has_coordinator: bool = False
    has_company_config: bool = False
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OrchestratorCreateRequest(BaseModel):
    classification_model: str = "claude-sonnet-4-5-20250929"
    classification_temperature: float = 0.1
    keyword_map: Dict[str, List[str]] = {}
    classification_prompt: Optional[str] = None
    fallback_agent: Optional[str] = None
    agent_timeout: float = 30.0
    circuit_breaker_config: Dict[str, Any] = {
        "failure_threshold": 5,
        "recovery_timeout": 30,
        "half_open_max_calls": 3,
    }


class OrchestratorResponse(BaseModel):
    id: str
    infrastructure_id: str
    classification_model: str
    classification_temperature: float
    keyword_map: Dict[str, Any]
    classification_prompt: Optional[str]
    fallback_agent: Optional[str]
    agent_timeout: float
    circuit_breaker_config: Dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AgentCreateRequest(BaseModel):
    agent_id_slug: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    category_code: str
    system_prompts: Dict[str, str] = {}
    tools_config: List[Dict[str, Any]] = []
    task_types: List[str] = ["general_inquiry"]
    keywords: List[str] = []
    confidentiality_level: str = "INTERNAL"
    capabilities: Dict[str, Any] = {}


class AgentUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    category_code: Optional[str] = None
    system_prompts: Optional[Dict[str, str]] = None
    tools_config: Optional[List[Dict[str, Any]]] = None
    task_types: Optional[List[str]] = None
    keywords: Optional[List[str]] = None
    confidentiality_level: Optional[str] = None
    capabilities: Optional[Dict[str, Any]] = None


class AgentResponse(BaseModel):
    id: str
    infrastructure_id: str
    agent_id_slug: str
    display_name: Optional[str]
    description: Optional[str]
    category_code: str
    system_prompts: Dict[str, Any]
    tools_config: List[Any]
    task_types: List[str]
    keywords: List[str]
    confidentiality_level: str
    capabilities: Dict[str, Any]
    port: Optional[int]
    version: str
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class InfraDetailResponse(InfraResponse):
    orchestrator: Optional[OrchestratorResponse] = None
    coordinator: Optional[Any] = None
    agents: List[AgentResponse] = []


# =============================================================================
# Helper Functions
# =============================================================================


def _infra_to_response(infra: Infrastructure) -> InfraResponse:
    return InfraResponse(
        id=str(infra.id),
        name=infra.name,
        display_name=infra.display_name,
        description=infra.description,
        type=getattr(infra, 'type', 'orchestrator'),
        status=infra.status,
        project_path=infra.project_path,
        port_range_start=infra.port_range_start,
        env_config=infra.env_config or {},
        security_config=infra.security_config or {},
        db_name=infra.db_name,
        redis_config=infra.redis_config or {},
        lightning_config=infra.lightning_config or {},
        version=infra.version,
        agent_count=len(infra.agents) if infra.agents else 0,
        has_orchestrator=infra.orchestrator is not None,
        has_coordinator=getattr(infra, 'hive_coordinator', None) is not None,
        has_company_config=getattr(infra, 'company_config', None) is not None,
        created_at=infra.created_at,
        updated_at=infra.updated_at,
    )


def _orchestrator_to_response(orch: InfraOrchestrator) -> OrchestratorResponse:
    return OrchestratorResponse(
        id=str(orch.id),
        infrastructure_id=str(orch.infrastructure_id),
        classification_model=orch.classification_model,
        classification_temperature=float(orch.classification_temperature),
        keyword_map=orch.keyword_map or {},
        classification_prompt=orch.classification_prompt,
        fallback_agent=orch.fallback_agent,
        agent_timeout=float(orch.agent_timeout),
        circuit_breaker_config=orch.circuit_breaker_config or {},
        status=orch.status,
        created_at=orch.created_at,
        updated_at=orch.updated_at,
    )


def _agent_to_response(agent: InfraAgent) -> AgentResponse:
    return AgentResponse(
        id=str(agent.id),
        infrastructure_id=str(agent.infrastructure_id),
        agent_id_slug=agent.agent_id_slug,
        display_name=agent.display_name,
        description=agent.description,
        category_code=agent.category_code,
        system_prompts=agent.system_prompts or {},
        tools_config=agent.tools_config or [],
        task_types=agent.task_types or [],
        keywords=agent.keywords or [],
        confidentiality_level=agent.confidentiality_level,
        capabilities=agent.capabilities or {},
        port=agent.port,
        version=agent.version,
        status=agent.status,
        created_at=agent.created_at,
        updated_at=agent.updated_at,
    )


async def _get_infra(db, infra_id: UUID) -> Infrastructure:
    result = await db.execute(
        select(Infrastructure)
        .where(Infrastructure.id == infra_id)
        .options(
            selectinload(Infrastructure.orchestrator),
            selectinload(Infrastructure.agents),
            selectinload(Infrastructure.hive_coordinator),
            selectinload(Infrastructure.company_config),
        )
    )
    infra = result.scalar_one_or_none()
    if not infra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Infrastructure {infra_id} not found",
        )
    return infra


# =============================================================================
# Infrastructure CRUD
# =============================================================================


@router.post("", response_model=InfraResponse, status_code=status.HTTP_201_CREATED)
async def create_infrastructure(
    request: InfraCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> InfraResponse:
    """Create a new multi-agent infrastructure."""
    # Check for duplicate name
    result = await db.execute(
        select(Infrastructure).where(Infrastructure.name == request.name)
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Infrastructure '{request.name}' already exists",
        )

    infra = Infrastructure(
        name=request.name,
        display_name=request.display_name or request.name,
        description=request.description,
        type=request.type,
        port_range_start=request.port_range_start,
        env_config=request.env_config,
        security_config=request.security_config,
        db_name=request.db_name or request.name.lower().replace("-", "_"),
        redis_config=request.redis_config,
        lightning_config=request.lightning_config or {},
    )
    db.add(infra)
    await db.commit()

    # Re-fetch with eager loading to avoid greenlet errors
    infra = await _get_infra(db, infra.id)

    return _infra_to_response(infra)


@router.get("", response_model=List[InfraResponse])
async def list_infrastructures(db: DbSession) -> List[InfraResponse]:
    """List all infrastructures."""
    result = await db.execute(
        select(Infrastructure)
        .options(
            selectinload(Infrastructure.orchestrator),
            selectinload(Infrastructure.agents),
            selectinload(Infrastructure.hive_coordinator),
            selectinload(Infrastructure.company_config),
        )
        .order_by(Infrastructure.created_at.desc())
    )
    infras = result.scalars().all()
    return [_infra_to_response(infra) for infra in infras]


@router.get("/{infra_id}", response_model=InfraDetailResponse)
async def get_infrastructure(infra_id: UUID, db: DbSession) -> InfraDetailResponse:
    """Get infrastructure detail with orchestrator and agents."""
    infra = await _get_infra(db, infra_id)

    coordinator_data = None
    hive_coord = getattr(infra, 'hive_coordinator', None)
    if hive_coord:
        coordinator_data = {
            "id": str(hive_coord.id),
            "infrastructure_id": str(hive_coord.infrastructure_id),
            "coordinator_model": hive_coord.coordinator_model,
            "coordinator_temperature": float(hive_coord.coordinator_temperature),
            "decomposition_prompt": hive_coord.decomposition_prompt,
            "max_concurrent_tasks": hive_coord.max_concurrent_tasks,
            "task_timeout": hive_coord.task_timeout,
            "max_retries": hive_coord.max_retries,
            "aggregation_strategy": hive_coord.aggregation_strategy,
            "aggregation_prompt": hive_coord.aggregation_prompt,
            "plan_mode_enabled": hive_coord.plan_mode_enabled,
            "status": hive_coord.status,
            "created_at": hive_coord.created_at.isoformat(),
            "updated_at": hive_coord.updated_at.isoformat(),
        }

    resp = InfraDetailResponse(
        id=str(infra.id),
        name=infra.name,
        display_name=infra.display_name,
        description=infra.description,
        type=getattr(infra, 'type', 'orchestrator'),
        status=infra.status,
        project_path=infra.project_path,
        port_range_start=infra.port_range_start,
        env_config=infra.env_config or {},
        security_config=infra.security_config or {},
        db_name=infra.db_name,
        redis_config=infra.redis_config or {},
        lightning_config=infra.lightning_config or {},
        version=infra.version,
        agent_count=len(infra.agents),
        has_orchestrator=infra.orchestrator is not None,
        has_coordinator=hive_coord is not None,
        has_company_config=getattr(infra, 'company_config', None) is not None,
        created_at=infra.created_at,
        updated_at=infra.updated_at,
        orchestrator=(
            _orchestrator_to_response(infra.orchestrator)
            if infra.orchestrator
            else None
        ),
        coordinator=coordinator_data,
        agents=[_agent_to_response(a) for a in infra.agents],
    )
    return resp


@router.put("/{infra_id}", response_model=InfraResponse)
async def update_infrastructure(
    infra_id: UUID,
    request: InfraUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> InfraResponse:
    """Update infrastructure configuration."""
    infra = await _get_infra(db, infra_id)

    for field in [
        "display_name", "description", "port_range_start",
        "env_config", "security_config", "db_name", "redis_config", "lightning_config",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(infra, field, value)

    await db.commit()
    await db.refresh(infra)
    return _infra_to_response(infra)


@router.delete("/{infra_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_infrastructure(
    infra_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete an infrastructure."""
    infra = await _get_infra(db, infra_id)
    await db.delete(infra)
    await db.commit()


# =============================================================================
# Orchestrator CRUD
# =============================================================================


@router.post("/{infra_id}/orchestrator", response_model=OrchestratorResponse, status_code=status.HTTP_201_CREATED)
async def create_orchestrator(
    infra_id: UUID,
    request: OrchestratorCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> OrchestratorResponse:
    """Configure orchestrator for an infrastructure."""
    infra = await _get_infra(db, infra_id)

    if infra.orchestrator:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Orchestrator already exists for this infrastructure",
        )

    orch = InfraOrchestrator(
        infrastructure_id=infra.id,
        classification_model=request.classification_model,
        classification_temperature=request.classification_temperature,
        keyword_map=request.keyword_map,
        classification_prompt=request.classification_prompt,
        fallback_agent=request.fallback_agent,
        agent_timeout=request.agent_timeout,
        circuit_breaker_config=request.circuit_breaker_config,
    )
    db.add(orch)
    await db.commit()
    await db.refresh(orch)
    return _orchestrator_to_response(orch)


@router.get("/{infra_id}/orchestrator", response_model=OrchestratorResponse)
async def get_orchestrator(infra_id: UUID, db: DbSession) -> OrchestratorResponse:
    """Get orchestrator configuration."""
    infra = await _get_infra(db, infra_id)
    if not infra.orchestrator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No orchestrator configured for this infrastructure",
        )
    return _orchestrator_to_response(infra.orchestrator)


@router.put("/{infra_id}/orchestrator", response_model=OrchestratorResponse)
async def update_orchestrator(
    infra_id: UUID,
    request: OrchestratorCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> OrchestratorResponse:
    """Update orchestrator configuration."""
    infra = await _get_infra(db, infra_id)
    if not infra.orchestrator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No orchestrator configured for this infrastructure",
        )

    orch = infra.orchestrator
    orch.classification_model = request.classification_model
    orch.classification_temperature = request.classification_temperature
    orch.keyword_map = request.keyword_map
    orch.classification_prompt = request.classification_prompt
    orch.fallback_agent = request.fallback_agent
    orch.agent_timeout = request.agent_timeout
    orch.circuit_breaker_config = request.circuit_breaker_config

    await db.commit()
    await db.refresh(orch)
    return _orchestrator_to_response(orch)


# =============================================================================
# Agent CRUD
# =============================================================================


@router.post("/{infra_id}/agents", response_model=AgentResponse, status_code=status.HTTP_201_CREATED)
async def create_agent(
    infra_id: UUID,
    request: AgentCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> AgentResponse:
    """Add an agent to the infrastructure."""
    infra = await _get_infra(db, infra_id)

    # Check for duplicate slug
    for existing in infra.agents:
        if existing.agent_id_slug == request.agent_id_slug:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Agent '{request.agent_id_slug}' already exists",
            )
        if existing.category_code == request.category_code:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Category code '{request.category_code}' already in use",
            )

    # Assign port based on position
    port = infra.port_range_start + 1 + len(infra.agents)

    agent = InfraAgent(
        infrastructure_id=infra.id,
        agent_id_slug=request.agent_id_slug,
        display_name=request.display_name or request.agent_id_slug,
        description=request.description,
        category_code=request.category_code,
        system_prompts=request.system_prompts,
        tools_config=request.tools_config,
        task_types=request.task_types,
        keywords=request.keywords,
        confidentiality_level=request.confidentiality_level,
        capabilities=request.capabilities,
        port=port,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return _agent_to_response(agent)


@router.get("/{infra_id}/agents", response_model=List[AgentResponse])
async def list_agents(infra_id: UUID, db: DbSession) -> List[AgentResponse]:
    """List all agents in the infrastructure."""
    infra = await _get_infra(db, infra_id)
    return [_agent_to_response(a) for a in infra.agents]


@router.get("/{infra_id}/agents/{slug}", response_model=AgentResponse)
async def get_agent(
    infra_id: UUID, slug: str, db: DbSession
) -> AgentResponse:
    """Get agent detail by slug."""
    result = await db.execute(
        select(InfraAgent).where(
            InfraAgent.infrastructure_id == infra_id,
            InfraAgent.agent_id_slug == slug,
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{slug}' not found",
        )
    return _agent_to_response(agent)


@router.put("/{infra_id}/agents/{slug}", response_model=AgentResponse)
async def update_agent(
    infra_id: UUID,
    slug: str,
    request: AgentUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> AgentResponse:
    """Update agent configuration."""
    result = await db.execute(
        select(InfraAgent).where(
            InfraAgent.infrastructure_id == infra_id,
            InfraAgent.agent_id_slug == slug,
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{slug}' not found",
        )

    for field in [
        "display_name", "description", "category_code", "system_prompts",
        "tools_config", "task_types", "keywords", "confidentiality_level",
        "capabilities",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(agent, field, value)

    await db.commit()
    await db.refresh(agent)
    return _agent_to_response(agent)


@router.delete("/{infra_id}/agents/{slug}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(
    infra_id: UUID,
    slug: str,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Remove an agent from the infrastructure."""
    result = await db.execute(
        select(InfraAgent).where(
            InfraAgent.infrastructure_id == infra_id,
            InfraAgent.agent_id_slug == slug,
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Agent '{slug}' not found",
        )

    await db.delete(agent)
    await db.commit()
