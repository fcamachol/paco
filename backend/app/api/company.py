"""
PACO Company API

Endpoints for company infrastructure management: config, departments,
roles, schedules, tasks, work logs, and organizational overview.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession, OperatorUser
from app.db.models import (
    Infrastructure, CompanyConfig, CompanyDepartment, CompanyRole,
    CompanySchedule, CompanyTask, CompanyWorkLog, CompanyMessage,
)

router = APIRouter(prefix="/infrastructures", tags=["Company"])


# =============================================================================
# Schedule Templates (static data)
# =============================================================================

SCHEDULE_TEMPLATES = {
    "morning-standup": {
        "schedule_type": "cron",
        "cron_expression": "0 9 * * 1-5",
        "checklist_md": "## Daily Standup\n- Check inbox\n- Review overnight messages\n- Update task board",
    },
    "weekly-report": {
        "schedule_type": "cron",
        "cron_expression": "0 17 * * 5",
        "prompt_template": "Generate weekly summary report of all work completed, issues encountered, and plans for next week.",
    },
    "monthly-review": {
        "schedule_type": "cron",
        "cron_expression": "0 10 1 * *",
        "prompt_template": "Deep analysis of past month: performance metrics, cost analysis, recommendations for improvement.",
    },
    "heartbeat-30min": {
        "schedule_type": "heartbeat",
        "interval_seconds": 1800,
        "checklist_md": "## Heartbeat Check\n- Scan for urgent items\n- Check system health\n- Report HEARTBEAT_OK if nothing needs attention",
    },
}


# =============================================================================
# Pydantic Schemas
# =============================================================================


# -- Config schemas -----------------------------------------------------------

class CompanyConfigCreateRequest(BaseModel):
    heartbeat_interval_seconds: int = 1800
    default_model: str = "claude-haiku-4-5-20251001"
    timezone: str = "America/Mexico_City"
    active_hours_start: str = "08:00"
    active_hours_end: str = "20:00"
    working_days: List[int] = [1, 2, 3, 4, 5]
    heartbeat_prompt: Optional[str] = None
    config: Dict[str, Any] = {}


class CompanyConfigUpdateRequest(BaseModel):
    heartbeat_interval_seconds: Optional[int] = None
    default_model: Optional[str] = None
    timezone: Optional[str] = None
    active_hours_start: Optional[str] = None
    active_hours_end: Optional[str] = None
    working_days: Optional[List[int]] = None
    heartbeat_prompt: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class CompanyConfigResponse(BaseModel):
    id: str
    infrastructure_id: str
    heartbeat_interval_seconds: int
    default_model: str
    timezone: str
    active_hours_start: str
    active_hours_end: str
    working_days: List[int]
    heartbeat_prompt: Optional[str]
    config: Dict[str, Any]
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# -- Department schemas -------------------------------------------------------

class DepartmentCreateRequest(BaseModel):
    name: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[str] = None
    manager_agent_slug: Optional[str] = None
    config: Dict[str, Any] = {}


class DepartmentUpdateRequest(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    description: Optional[str] = None
    parent_id: Optional[str] = None
    manager_agent_slug: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


class DepartmentResponse(BaseModel):
    id: str
    infrastructure_id: str
    name: str
    display_name: Optional[str]
    description: Optional[str]
    parent_id: Optional[str]
    manager_agent_slug: Optional[str]
    config: Dict[str, Any]
    is_active: bool
    created_at: datetime
    updated_at: datetime


# -- Role schemas -------------------------------------------------------------

class RoleCreateRequest(BaseModel):
    agent_slug: str
    department_id: Optional[str] = None
    title: str
    role_type: str = "employee"
    reports_to_slug: Optional[str] = None
    goals: Dict[str, Any] = {}
    working_hours: Dict[str, Any] = {}
    checklist_md: Optional[str] = None


class RoleUpdateRequest(BaseModel):
    agent_slug: Optional[str] = None
    department_id: Optional[str] = None
    title: Optional[str] = None
    role_type: Optional[str] = None
    reports_to_slug: Optional[str] = None
    goals: Optional[Dict[str, Any]] = None
    working_hours: Optional[Dict[str, Any]] = None
    checklist_md: Optional[str] = None


class RoleResponse(BaseModel):
    id: str
    infrastructure_id: str
    agent_slug: str
    department_id: Optional[str]
    title: str
    role_type: str
    reports_to_slug: Optional[str]
    goals: Dict[str, Any]
    working_hours: Dict[str, Any]
    checklist_md: Optional[str]
    is_active: bool
    hired_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# -- Schedule schemas ---------------------------------------------------------

class ScheduleCreateRequest(BaseModel):
    agent_slug: str
    name: str
    schedule_type: str
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    checklist_md: Optional[str] = None
    prompt_template: Optional[str] = None
    active_hours_start: Optional[str] = None
    active_hours_end: Optional[str] = None
    timezone: Optional[str] = None
    config: Dict[str, Any] = {}


class ScheduleUpdateRequest(BaseModel):
    agent_slug: Optional[str] = None
    name: Optional[str] = None
    schedule_type: Optional[str] = None
    cron_expression: Optional[str] = None
    interval_seconds: Optional[int] = None
    checklist_md: Optional[str] = None
    prompt_template: Optional[str] = None
    active_hours_start: Optional[str] = None
    active_hours_end: Optional[str] = None
    timezone: Optional[str] = None
    is_enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class ScheduleResponse(BaseModel):
    id: str
    infrastructure_id: str
    agent_slug: str
    name: str
    schedule_type: str
    cron_expression: Optional[str]
    interval_seconds: Optional[int]
    checklist_md: Optional[str]
    prompt_template: Optional[str]
    active_hours_start: Optional[str]
    active_hours_end: Optional[str]
    timezone: Optional[str]
    config: Dict[str, Any]
    is_enabled: bool
    last_triggered_at: Optional[datetime]
    next_trigger_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime


# -- Task schemas -------------------------------------------------------------

class TaskResponse(BaseModel):
    id: str
    infrastructure_id: str
    schedule_id: Optional[str]
    agent_slug: str
    title: str
    description: Optional[str]
    task_type: str
    status: str
    priority: int
    input_data: Dict[str, Any]
    result: Optional[Dict[str, Any]]
    error_message: Optional[str]
    cost_usd: Optional[float]
    input_tokens: Optional[int]
    output_tokens: Optional[int]
    langfuse_trace_id: Optional[str]
    scheduled_at: Optional[datetime]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    duration_ms: Optional[int]
    created_at: datetime


# -- WorkLog schemas ----------------------------------------------------------

class WorkLogResponse(BaseModel):
    id: str
    infrastructure_id: str
    agent_slug: str
    log_date: str
    summary: Optional[str]
    entries: List[Dict[str, Any]]
    memory_notes: Optional[str]
    tasks_completed: int
    tasks_failed: int
    total_cost_usd: Optional[float]
    total_tokens: Optional[int]
    created_at: datetime
    updated_at: datetime


# -- Message schemas ----------------------------------------------------------

class MessageCreateRequest(BaseModel):
    sender_slug: str
    recipient_slug: Optional[str] = None  # null = broadcast
    department_id: Optional[str] = None
    message_type: str = "direct"  # direct | broadcast | task_request | task_result | escalation
    subject: Optional[str] = None
    content: str
    metadata: Dict[str, Any] = {}
    parent_message_id: Optional[str] = None


class MessageResponse(BaseModel):
    id: str
    infrastructure_id: str
    sender_slug: str
    recipient_slug: Optional[str]
    department_id: Optional[str]
    message_type: str
    subject: Optional[str]
    content: str
    metadata: Dict[str, Any]
    status: str
    parent_message_id: Optional[str]
    created_at: datetime
    read_at: Optional[datetime]


# -- Agent self-reporting schemas ---------------------------------------------

class TaskReportRequest(BaseModel):
    schedule_id: Optional[str] = None
    agent_slug: str
    title: str
    task_type: str = "heartbeat_check"
    status: str = "completed"
    result: Optional[Dict[str, Any]] = None
    duration_ms: Optional[int] = None
    error_message: Optional[str] = None


class WorkLogEntryRequest(BaseModel):
    agent_slug: str
    content: str
    entry_type: str = "heartbeat"
    task_id: Optional[str] = None
    schedule_name: Optional[str] = None


# -- Task delegation schemas --------------------------------------------------

class TaskDelegateRequest(BaseModel):
    agent_slug: str
    requested_by: str
    title: str
    description: Optional[str] = None
    task_type: str = "delegated"  # delegated | collaboration | escalation
    priority: int = 5


# -- Overview schemas ---------------------------------------------------------

class CompanyOverviewResponse(BaseModel):
    status: str
    active_agents: int
    total_agents: int
    tasks_today: int
    heartbeat_ok_today: int
    tasks_failed_today: int
    total_cost_today: Optional[float]
    schedules_active: int
    schedules_total: int


# =============================================================================
# Helper Functions
# =============================================================================


async def _get_infra(db, infra_id: UUID) -> Infrastructure:
    result = await db.execute(
        select(Infrastructure)
        .where(Infrastructure.id == infra_id)
        .options(selectinload(Infrastructure.company_config))
    )
    infra = result.scalar_one_or_none()
    if not infra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Infrastructure {infra_id} not found",
        )
    return infra


def _config_to_response(config: CompanyConfig) -> CompanyConfigResponse:
    return CompanyConfigResponse(
        id=str(config.id),
        infrastructure_id=str(config.infrastructure_id),
        heartbeat_interval_seconds=config.heartbeat_interval_seconds,
        default_model=config.default_model,
        timezone=config.timezone,
        active_hours_start=config.active_hours_start,
        active_hours_end=config.active_hours_end,
        working_days=config.working_days,
        heartbeat_prompt=config.heartbeat_prompt,
        config=config.config or {},
        status=config.status,
        created_at=config.created_at,
        updated_at=config.updated_at,
    )


def _dept_to_response(dept: CompanyDepartment) -> DepartmentResponse:
    return DepartmentResponse(
        id=str(dept.id),
        infrastructure_id=str(dept.infrastructure_id),
        name=dept.name,
        display_name=dept.display_name,
        description=dept.description,
        parent_id=str(dept.parent_id) if dept.parent_id else None,
        manager_agent_slug=dept.manager_agent_slug,
        config=dept.config or {},
        is_active=dept.is_active,
        created_at=dept.created_at,
        updated_at=dept.updated_at,
    )


def _role_to_response(role: CompanyRole) -> RoleResponse:
    return RoleResponse(
        id=str(role.id),
        infrastructure_id=str(role.infrastructure_id),
        agent_slug=role.agent_slug,
        department_id=str(role.department_id) if role.department_id else None,
        title=role.title,
        role_type=role.role_type,
        reports_to_slug=role.reports_to_slug,
        goals=role.goals or {},
        working_hours=role.working_hours or {},
        checklist_md=role.checklist_md,
        is_active=role.is_active,
        hired_at=role.hired_at,
        created_at=role.created_at,
        updated_at=role.updated_at,
    )


def _schedule_to_response(schedule: CompanySchedule) -> ScheduleResponse:
    return ScheduleResponse(
        id=str(schedule.id),
        infrastructure_id=str(schedule.infrastructure_id),
        agent_slug=schedule.agent_slug,
        name=schedule.name,
        schedule_type=schedule.schedule_type,
        cron_expression=schedule.cron_expression,
        interval_seconds=schedule.interval_seconds,
        checklist_md=schedule.checklist_md,
        prompt_template=schedule.prompt_template,
        active_hours_start=schedule.active_hours_start,
        active_hours_end=schedule.active_hours_end,
        timezone=schedule.timezone,
        config=schedule.config or {},
        is_enabled=schedule.is_enabled,
        last_triggered_at=schedule.last_triggered_at,
        next_trigger_at=schedule.next_trigger_at,
        created_at=schedule.created_at,
        updated_at=schedule.updated_at,
    )


def _task_to_response(task: CompanyTask) -> TaskResponse:
    return TaskResponse(
        id=str(task.id),
        infrastructure_id=str(task.infrastructure_id),
        schedule_id=str(task.schedule_id) if task.schedule_id else None,
        agent_slug=task.agent_slug,
        title=task.title,
        description=task.description,
        task_type=task.task_type,
        status=task.status,
        priority=task.priority,
        input_data=task.input_data or {},
        result=task.result,
        error_message=task.error_message,
        cost_usd=float(task.cost_usd) if task.cost_usd is not None else None,
        input_tokens=task.input_tokens,
        output_tokens=task.output_tokens,
        langfuse_trace_id=task.langfuse_trace_id,
        scheduled_at=task.scheduled_at,
        started_at=task.started_at,
        completed_at=task.completed_at,
        duration_ms=task.duration_ms,
        created_at=task.created_at,
    )


def _worklog_to_response(wl: CompanyWorkLog) -> WorkLogResponse:
    return WorkLogResponse(
        id=str(wl.id),
        infrastructure_id=str(wl.infrastructure_id),
        agent_slug=wl.agent_slug,
        log_date=wl.log_date.isoformat(),
        summary=wl.summary,
        entries=wl.entries or [],
        memory_notes=wl.memory_notes,
        tasks_completed=wl.tasks_completed,
        tasks_failed=wl.tasks_failed,
        total_cost_usd=float(wl.total_cost_usd) if wl.total_cost_usd is not None else None,
        total_tokens=wl.total_tokens,
        created_at=wl.created_at,
        updated_at=wl.updated_at,
    )


def _compute_next_trigger(schedule_type: str, cron_expression: Optional[str],
                          interval_seconds: Optional[int]) -> Optional[datetime]:
    """Compute initial next_trigger_at for a new schedule."""
    now = datetime.utcnow()

    if schedule_type == "cron" and cron_expression:
        try:
            from croniter import croniter
            cron = croniter(cron_expression, now)
            return cron.get_next(datetime)
        except Exception:
            # croniter may not be installed; fall back to None
            return None

    if schedule_type in ("interval", "heartbeat") and interval_seconds:
        return now + timedelta(seconds=interval_seconds)

    return None


# =============================================================================
# Config CRUD
# =============================================================================


@router.post(
    "/{infra_id}/company/config",
    response_model=CompanyConfigResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Company"],
)
async def create_company_config(
    infra_id: UUID,
    request: CompanyConfigCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> CompanyConfigResponse:
    """Create company configuration for an infrastructure."""
    infra = await _get_infra(db, infra_id)

    if infra.company_config:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Company config already exists for this infrastructure",
        )

    config = CompanyConfig(
        infrastructure_id=infra.id,
        heartbeat_interval_seconds=request.heartbeat_interval_seconds,
        default_model=request.default_model,
        timezone=request.timezone,
        active_hours_start=request.active_hours_start,
        active_hours_end=request.active_hours_end,
        working_days=request.working_days,
        heartbeat_prompt=request.heartbeat_prompt,
        config=request.config,
    )
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return _config_to_response(config)


@router.get(
    "/{infra_id}/company/config",
    response_model=CompanyConfigResponse,
    tags=["Company"],
)
async def get_company_config(infra_id: UUID, db: DbSession) -> CompanyConfigResponse:
    """Get company configuration."""
    infra = await _get_infra(db, infra_id)
    if not infra.company_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No company config configured for this infrastructure",
        )
    return _config_to_response(infra.company_config)


@router.put(
    "/{infra_id}/company/config",
    response_model=CompanyConfigResponse,
    tags=["Company"],
)
async def update_company_config(
    infra_id: UUID,
    request: CompanyConfigUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> CompanyConfigResponse:
    """Update company configuration."""
    infra = await _get_infra(db, infra_id)
    if not infra.company_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No company config configured for this infrastructure",
        )

    config = infra.company_config
    for field in [
        "heartbeat_interval_seconds", "default_model", "timezone",
        "active_hours_start", "active_hours_end", "working_days",
        "heartbeat_prompt", "config",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(config, field, value)

    await db.commit()
    await db.refresh(config)
    return _config_to_response(config)


@router.post(
    "/{infra_id}/company/config/start",
    response_model=CompanyConfigResponse,
    tags=["Company"],
)
async def start_company(
    infra_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> CompanyConfigResponse:
    """Set company status to running."""
    infra = await _get_infra(db, infra_id)
    if not infra.company_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No company config configured for this infrastructure",
        )

    infra.company_config.status = "running"
    await db.commit()
    await db.refresh(infra.company_config)
    return _config_to_response(infra.company_config)


@router.post(
    "/{infra_id}/company/config/stop",
    response_model=CompanyConfigResponse,
    tags=["Company"],
)
async def stop_company(
    infra_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> CompanyConfigResponse:
    """Set company status to stopped."""
    infra = await _get_infra(db, infra_id)
    if not infra.company_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No company config configured for this infrastructure",
        )

    infra.company_config.status = "stopped"
    await db.commit()
    await db.refresh(infra.company_config)
    return _config_to_response(infra.company_config)


# =============================================================================
# Department CRUD
# =============================================================================


@router.post(
    "/{infra_id}/company/departments",
    response_model=DepartmentResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Company"],
)
async def create_department(
    infra_id: UUID,
    request: DepartmentCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> DepartmentResponse:
    """Create a new department."""
    await _get_infra(db, infra_id)

    dept = CompanyDepartment(
        infrastructure_id=infra_id,
        name=request.name,
        display_name=request.display_name,
        description=request.description,
        parent_id=UUID(request.parent_id) if request.parent_id else None,
        manager_agent_slug=request.manager_agent_slug,
        config=request.config,
    )
    db.add(dept)
    await db.commit()
    await db.refresh(dept)
    return _dept_to_response(dept)


@router.get(
    "/{infra_id}/company/departments",
    response_model=List[DepartmentResponse],
    tags=["Company"],
)
async def list_departments(infra_id: UUID, db: DbSession) -> List[DepartmentResponse]:
    """List all departments for an infrastructure."""
    await _get_infra(db, infra_id)

    result = await db.execute(
        select(CompanyDepartment)
        .where(CompanyDepartment.infrastructure_id == infra_id)
        .order_by(CompanyDepartment.name)
    )
    depts = result.scalars().all()
    return [_dept_to_response(d) for d in depts]


@router.get(
    "/{infra_id}/company/departments/{dept_id}",
    response_model=DepartmentResponse,
    tags=["Company"],
)
async def get_department(
    infra_id: UUID, dept_id: UUID, db: DbSession
) -> DepartmentResponse:
    """Get a single department."""
    result = await db.execute(
        select(CompanyDepartment).where(
            CompanyDepartment.id == dept_id,
            CompanyDepartment.infrastructure_id == infra_id,
        )
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department {dept_id} not found",
        )
    return _dept_to_response(dept)


@router.put(
    "/{infra_id}/company/departments/{dept_id}",
    response_model=DepartmentResponse,
    tags=["Company"],
)
async def update_department(
    infra_id: UUID,
    dept_id: UUID,
    request: DepartmentUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> DepartmentResponse:
    """Update a department."""
    result = await db.execute(
        select(CompanyDepartment).where(
            CompanyDepartment.id == dept_id,
            CompanyDepartment.infrastructure_id == infra_id,
        )
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department {dept_id} not found",
        )

    for field in [
        "name", "display_name", "description",
        "manager_agent_slug", "config",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(dept, field, value)

    # Handle parent_id separately (allow setting to None explicitly is tricky,
    # but if a string was provided convert it to UUID)
    if request.parent_id is not None:
        dept.parent_id = UUID(request.parent_id) if request.parent_id else None

    await db.commit()
    await db.refresh(dept)
    return _dept_to_response(dept)


@router.delete(
    "/{infra_id}/company/departments/{dept_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Company"],
)
async def delete_department(
    infra_id: UUID,
    dept_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete a department."""
    result = await db.execute(
        select(CompanyDepartment).where(
            CompanyDepartment.id == dept_id,
            CompanyDepartment.infrastructure_id == infra_id,
        )
    )
    dept = result.scalar_one_or_none()
    if not dept:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Department {dept_id} not found",
        )

    await db.delete(dept)
    await db.commit()


@router.get(
    "/{infra_id}/company/org-chart",
    response_model=List[Dict[str, Any]],
    tags=["Company"],
)
async def get_org_chart(infra_id: UUID, db: DbSession) -> List[Dict[str, Any]]:
    """Build hierarchical org chart from departments and roles."""
    await _get_infra(db, infra_id)

    # Fetch all departments
    dept_result = await db.execute(
        select(CompanyDepartment)
        .where(CompanyDepartment.infrastructure_id == infra_id)
        .order_by(CompanyDepartment.name)
    )
    departments = dept_result.scalars().all()

    # Fetch all roles
    role_result = await db.execute(
        select(CompanyRole)
        .where(CompanyRole.infrastructure_id == infra_id)
        .order_by(CompanyRole.agent_slug)
    )
    roles = role_result.scalars().all()

    # Index roles by department_id
    roles_by_dept: Dict[str, List[Dict[str, Any]]] = {}
    unassigned_roles: List[Dict[str, Any]] = []
    for role in roles:
        role_data = {
            "agent_slug": role.agent_slug,
            "title": role.title,
            "role_type": role.role_type,
            "reports_to_slug": role.reports_to_slug,
            "is_active": role.is_active,
        }
        if role.department_id:
            key = str(role.department_id)
            roles_by_dept.setdefault(key, []).append(role_data)
        else:
            unassigned_roles.append(role_data)

    # Index departments by id and by parent_id
    dept_map: Dict[str, Dict[str, Any]] = {}
    for dept in departments:
        dept_map[str(dept.id)] = {
            "id": str(dept.id),
            "name": dept.name,
            "display_name": dept.display_name,
            "manager_agent_slug": dept.manager_agent_slug,
            "parent_id": str(dept.parent_id) if dept.parent_id else None,
            "agents": roles_by_dept.get(str(dept.id), []),
            "children": [],
        }

    # Build tree: attach children to parents
    root_nodes: List[Dict[str, Any]] = []
    for dept_id, node in dept_map.items():
        parent_id = node["parent_id"]
        if parent_id and parent_id in dept_map:
            dept_map[parent_id]["children"].append(node)
        else:
            root_nodes.append(node)

    # Add unassigned roles as a virtual node if any exist
    if unassigned_roles:
        root_nodes.append({
            "id": None,
            "name": "_unassigned",
            "display_name": "Unassigned Agents",
            "manager_agent_slug": None,
            "parent_id": None,
            "agents": unassigned_roles,
            "children": [],
        })

    return root_nodes


# =============================================================================
# Role CRUD
# =============================================================================


@router.post(
    "/{infra_id}/company/roles",
    response_model=RoleResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Company"],
)
async def create_role(
    infra_id: UUID,
    request: RoleCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> RoleResponse:
    """Create a new role (hire an agent)."""
    await _get_infra(db, infra_id)

    role = CompanyRole(
        infrastructure_id=infra_id,
        agent_slug=request.agent_slug,
        department_id=UUID(request.department_id) if request.department_id else None,
        title=request.title,
        role_type=request.role_type,
        reports_to_slug=request.reports_to_slug,
        goals=request.goals,
        working_hours=request.working_hours,
        checklist_md=request.checklist_md,
        hired_at=datetime.utcnow(),
    )
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return _role_to_response(role)


@router.get(
    "/{infra_id}/company/roles",
    response_model=List[RoleResponse],
    tags=["Company"],
)
async def list_roles(infra_id: UUID, db: DbSession) -> List[RoleResponse]:
    """List all roles for an infrastructure."""
    await _get_infra(db, infra_id)

    result = await db.execute(
        select(CompanyRole)
        .where(CompanyRole.infrastructure_id == infra_id)
        .order_by(CompanyRole.agent_slug)
    )
    roles = result.scalars().all()
    return [_role_to_response(r) for r in roles]


@router.get(
    "/{infra_id}/company/roles/{slug}",
    response_model=RoleResponse,
    tags=["Company"],
)
async def get_role(infra_id: UUID, slug: str, db: DbSession) -> RoleResponse:
    """Get a role by agent slug."""
    result = await db.execute(
        select(CompanyRole).where(
            CompanyRole.infrastructure_id == infra_id,
            CompanyRole.agent_slug == slug,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role for agent '{slug}' not found",
        )
    return _role_to_response(role)


@router.put(
    "/{infra_id}/company/roles/{slug}",
    response_model=RoleResponse,
    tags=["Company"],
)
async def update_role(
    infra_id: UUID,
    slug: str,
    request: RoleUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> RoleResponse:
    """Update a role by agent slug."""
    result = await db.execute(
        select(CompanyRole).where(
            CompanyRole.infrastructure_id == infra_id,
            CompanyRole.agent_slug == slug,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role for agent '{slug}' not found",
        )

    for field in [
        "agent_slug", "title", "role_type", "reports_to_slug",
        "goals", "working_hours", "checklist_md",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(role, field, value)

    # Handle department_id separately (UUID conversion)
    if request.department_id is not None:
        role.department_id = UUID(request.department_id) if request.department_id else None

    await db.commit()
    await db.refresh(role)
    return _role_to_response(role)


@router.delete(
    "/{infra_id}/company/roles/{slug}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Company"],
)
async def delete_role(
    infra_id: UUID,
    slug: str,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete a role by agent slug."""
    result = await db.execute(
        select(CompanyRole).where(
            CompanyRole.infrastructure_id == infra_id,
            CompanyRole.agent_slug == slug,
        )
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role for agent '{slug}' not found",
        )

    await db.delete(role)
    await db.commit()


# =============================================================================
# Schedule CRUD
# =============================================================================


@router.post(
    "/{infra_id}/company/schedules",
    response_model=ScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Company"],
)
async def create_schedule(
    infra_id: UUID,
    request: ScheduleCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> ScheduleResponse:
    """Create a new schedule."""
    await _get_infra(db, infra_id)

    next_trigger = _compute_next_trigger(
        request.schedule_type, request.cron_expression, request.interval_seconds
    )

    schedule = CompanySchedule(
        infrastructure_id=infra_id,
        agent_slug=request.agent_slug,
        name=request.name,
        schedule_type=request.schedule_type,
        cron_expression=request.cron_expression,
        interval_seconds=request.interval_seconds,
        checklist_md=request.checklist_md,
        prompt_template=request.prompt_template,
        active_hours_start=request.active_hours_start,
        active_hours_end=request.active_hours_end,
        timezone=request.timezone,
        config=request.config,
        next_trigger_at=next_trigger,
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    return _schedule_to_response(schedule)


@router.get(
    "/{infra_id}/company/schedules",
    response_model=List[ScheduleResponse],
    tags=["Company"],
)
async def list_schedules(
    infra_id: UUID,
    db: DbSession,
    agent_slug: Optional[str] = Query(None),
) -> List[ScheduleResponse]:
    """List schedules, optionally filtered by agent_slug."""
    await _get_infra(db, infra_id)

    query = select(CompanySchedule).where(
        CompanySchedule.infrastructure_id == infra_id
    )
    if agent_slug:
        query = query.where(CompanySchedule.agent_slug == agent_slug)
    query = query.order_by(CompanySchedule.name)

    result = await db.execute(query)
    schedules = result.scalars().all()
    return [_schedule_to_response(s) for s in schedules]


@router.get(
    "/{infra_id}/company/schedules/templates",
    response_model=Dict[str, Any],
    tags=["Company"],
)
async def get_schedule_templates(infra_id: UUID) -> Dict[str, Any]:
    """Return pre-built schedule templates."""
    return SCHEDULE_TEMPLATES


@router.get(
    "/{infra_id}/company/schedules/{schedule_id}",
    response_model=ScheduleResponse,
    tags=["Company"],
)
async def get_schedule(
    infra_id: UUID, schedule_id: UUID, db: DbSession
) -> ScheduleResponse:
    """Get a single schedule."""
    result = await db.execute(
        select(CompanySchedule).where(
            CompanySchedule.id == schedule_id,
            CompanySchedule.infrastructure_id == infra_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )
    return _schedule_to_response(schedule)


@router.put(
    "/{infra_id}/company/schedules/{schedule_id}",
    response_model=ScheduleResponse,
    tags=["Company"],
)
async def update_schedule(
    infra_id: UUID,
    schedule_id: UUID,
    request: ScheduleUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> ScheduleResponse:
    """Update a schedule."""
    result = await db.execute(
        select(CompanySchedule).where(
            CompanySchedule.id == schedule_id,
            CompanySchedule.infrastructure_id == infra_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )

    for field in [
        "agent_slug", "name", "schedule_type", "cron_expression",
        "interval_seconds", "checklist_md", "prompt_template",
        "active_hours_start", "active_hours_end", "timezone",
        "is_enabled", "config",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(schedule, field, value)

    await db.commit()
    await db.refresh(schedule)
    return _schedule_to_response(schedule)


@router.delete(
    "/{infra_id}/company/schedules/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["Company"],
)
async def delete_schedule(
    infra_id: UUID,
    schedule_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete a schedule."""
    result = await db.execute(
        select(CompanySchedule).where(
            CompanySchedule.id == schedule_id,
            CompanySchedule.infrastructure_id == infra_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )

    await db.delete(schedule)
    await db.commit()


@router.post(
    "/{infra_id}/company/schedules/{schedule_id}/trigger",
    response_model=TaskResponse,
    tags=["Company"],
)
async def trigger_schedule(
    infra_id: UUID,
    schedule_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> TaskResponse:
    """Force-trigger a schedule, creating a pending task."""
    result = await db.execute(
        select(CompanySchedule).where(
            CompanySchedule.id == schedule_id,
            CompanySchedule.infrastructure_id == infra_id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Schedule {schedule_id} not found",
        )

    # Determine task_type based on schedule type
    task_type_map = {
        "heartbeat": "heartbeat_check",
        "cron": "scheduled_job",
        "interval": "scheduled_job",
    }
    task_type = task_type_map.get(schedule.schedule_type, "ad_hoc")

    now = datetime.utcnow()

    task = CompanyTask(
        infrastructure_id=infra_id,
        schedule_id=schedule.id,
        agent_slug=schedule.agent_slug,
        title=f"[Triggered] {schedule.name}",
        description=schedule.prompt_template or schedule.checklist_md,
        task_type=task_type,
        status="pending",
        priority=5,
        input_data={
            "schedule_id": str(schedule.id),
            "schedule_name": schedule.name,
            "triggered_manually": True,
        },
        scheduled_at=now,
    )
    db.add(task)

    # Update schedule trigger timestamps
    schedule.last_triggered_at = now
    schedule.next_trigger_at = _compute_next_trigger(
        schedule.schedule_type, schedule.cron_expression, schedule.interval_seconds
    )

    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


# =============================================================================
# Tasks (read-only + active)
# =============================================================================


@router.get(
    "/{infra_id}/company/tasks",
    response_model=List[TaskResponse],
    tags=["Company"],
)
async def list_tasks(
    infra_id: UUID,
    db: DbSession,
    agent_slug: Optional[str] = Query(None),
    task_status: Optional[str] = Query(None, alias="status"),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    limit: int = Query(50),
) -> List[TaskResponse]:
    """List company tasks with optional filters."""
    await _get_infra(db, infra_id)

    query = select(CompanyTask).where(CompanyTask.infrastructure_id == infra_id)

    if agent_slug:
        query = query.where(CompanyTask.agent_slug == agent_slug)
    if task_status:
        query = query.where(CompanyTask.status == task_status)
    if date_from:
        query = query.where(CompanyTask.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        query = query.where(CompanyTask.created_at <= datetime.fromisoformat(date_to))

    query = query.order_by(CompanyTask.created_at.desc()).limit(limit)

    result = await db.execute(query)
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.get(
    "/{infra_id}/company/tasks/active",
    response_model=List[TaskResponse],
    tags=["Company"],
)
async def list_active_tasks(infra_id: UUID, db: DbSession) -> List[TaskResponse]:
    """List tasks with status pending or in_progress."""
    await _get_infra(db, infra_id)

    result = await db.execute(
        select(CompanyTask)
        .where(
            CompanyTask.infrastructure_id == infra_id,
            CompanyTask.status.in_(["pending", "in_progress"]),
        )
        .order_by(CompanyTask.created_at.desc())
    )
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.get(
    "/{infra_id}/company/tasks/{task_id}",
    response_model=TaskResponse,
    tags=["Company"],
)
async def get_task(infra_id: UUID, task_id: UUID, db: DbSession) -> TaskResponse:
    """Get a single company task."""
    result = await db.execute(
        select(CompanyTask).where(
            CompanyTask.id == task_id,
            CompanyTask.infrastructure_id == infra_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return _task_to_response(task)


# =============================================================================
# Work Logs (read-only)
# =============================================================================


@router.get(
    "/{infra_id}/company/work-logs",
    response_model=List[WorkLogResponse],
    tags=["Company"],
)
async def list_work_logs(
    infra_id: UUID,
    db: DbSession,
    agent_slug: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
) -> List[WorkLogResponse]:
    """List work logs with optional filters."""
    await _get_infra(db, infra_id)

    query = select(CompanyWorkLog).where(
        CompanyWorkLog.infrastructure_id == infra_id
    )

    if agent_slug:
        query = query.where(CompanyWorkLog.agent_slug == agent_slug)
    if date_from:
        query = query.where(CompanyWorkLog.log_date >= date.fromisoformat(date_from))
    if date_to:
        query = query.where(CompanyWorkLog.log_date <= date.fromisoformat(date_to))

    query = query.order_by(CompanyWorkLog.log_date.desc())

    result = await db.execute(query)
    logs = result.scalars().all()
    return [_worklog_to_response(wl) for wl in logs]


@router.get(
    "/{infra_id}/company/work-logs/today",
    response_model=List[WorkLogResponse],
    tags=["Company"],
)
async def list_work_logs_today(infra_id: UUID, db: DbSession) -> List[WorkLogResponse]:
    """List all agents' work log entries for today."""
    await _get_infra(db, infra_id)

    today = date.today()
    result = await db.execute(
        select(CompanyWorkLog)
        .where(
            CompanyWorkLog.infrastructure_id == infra_id,
            CompanyWorkLog.log_date == today,
        )
        .order_by(CompanyWorkLog.agent_slug)
    )
    logs = result.scalars().all()
    return [_worklog_to_response(wl) for wl in logs]


# =============================================================================
# Overview + Timeline
# =============================================================================


@router.get(
    "/{infra_id}/company/overview",
    response_model=CompanyOverviewResponse,
    tags=["Company"],
)
async def get_company_overview(
    infra_id: UUID, db: DbSession
) -> CompanyOverviewResponse:
    """Compute KPI stats from tasks and schedules for today."""
    infra = await _get_infra(db, infra_id)

    config_status = infra.company_config.status if infra.company_config else "not_configured"

    # Count total roles (agents) and active roles
    total_roles_result = await db.execute(
        select(sa_func.count(CompanyRole.id)).where(
            CompanyRole.infrastructure_id == infra_id
        )
    )
    total_agents = total_roles_result.scalar() or 0

    active_roles_result = await db.execute(
        select(sa_func.count(CompanyRole.id)).where(
            CompanyRole.infrastructure_id == infra_id,
            CompanyRole.is_active.is_(True),
        )
    )
    active_agents = active_roles_result.scalar() or 0

    # Today's date range for task queries
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_end = datetime.combine(date.today(), datetime.max.time())

    # Tasks today
    tasks_today_result = await db.execute(
        select(sa_func.count(CompanyTask.id)).where(
            CompanyTask.infrastructure_id == infra_id,
            CompanyTask.created_at >= today_start,
            CompanyTask.created_at <= today_end,
        )
    )
    tasks_today = tasks_today_result.scalar() or 0

    # Heartbeat OK tasks today (completed heartbeat_check tasks)
    heartbeat_ok_result = await db.execute(
        select(sa_func.count(CompanyTask.id)).where(
            CompanyTask.infrastructure_id == infra_id,
            CompanyTask.task_type == "heartbeat_check",
            CompanyTask.status == "completed",
            CompanyTask.created_at >= today_start,
            CompanyTask.created_at <= today_end,
        )
    )
    heartbeat_ok_today = heartbeat_ok_result.scalar() or 0

    # Failed tasks today
    failed_result = await db.execute(
        select(sa_func.count(CompanyTask.id)).where(
            CompanyTask.infrastructure_id == infra_id,
            CompanyTask.status == "failed",
            CompanyTask.created_at >= today_start,
            CompanyTask.created_at <= today_end,
        )
    )
    tasks_failed_today = failed_result.scalar() or 0

    # Total cost today
    cost_result = await db.execute(
        select(sa_func.sum(CompanyTask.cost_usd)).where(
            CompanyTask.infrastructure_id == infra_id,
            CompanyTask.created_at >= today_start,
            CompanyTask.created_at <= today_end,
        )
    )
    total_cost_raw = cost_result.scalar()
    total_cost_today = float(total_cost_raw) if total_cost_raw is not None else None

    # Schedules
    schedules_total_result = await db.execute(
        select(sa_func.count(CompanySchedule.id)).where(
            CompanySchedule.infrastructure_id == infra_id
        )
    )
    schedules_total = schedules_total_result.scalar() or 0

    schedules_active_result = await db.execute(
        select(sa_func.count(CompanySchedule.id)).where(
            CompanySchedule.infrastructure_id == infra_id,
            CompanySchedule.is_enabled.is_(True),
        )
    )
    schedules_active = schedules_active_result.scalar() or 0

    return CompanyOverviewResponse(
        status=config_status,
        active_agents=active_agents,
        total_agents=total_agents,
        tasks_today=tasks_today,
        heartbeat_ok_today=heartbeat_ok_today,
        tasks_failed_today=tasks_failed_today,
        total_cost_today=total_cost_today,
        schedules_active=schedules_active,
        schedules_total=schedules_total,
    )


@router.get(
    "/{infra_id}/company/timeline",
    response_model=List[TaskResponse],
    tags=["Company"],
)
async def get_company_timeline(infra_id: UUID, db: DbSession) -> List[TaskResponse]:
    """Recent activity feed: last 50 tasks ordered by created_at desc."""
    await _get_infra(db, infra_id)

    result = await db.execute(
        select(CompanyTask)
        .where(CompanyTask.infrastructure_id == infra_id)
        .order_by(CompanyTask.created_at.desc())
        .limit(50)
    )
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


# =============================================================================
# Message helper
# =============================================================================


def _message_to_response(msg: CompanyMessage) -> MessageResponse:
    return MessageResponse(
        id=str(msg.id),
        infrastructure_id=str(msg.infrastructure_id),
        sender_slug=msg.sender_slug,
        recipient_slug=msg.recipient_slug,
        department_id=str(msg.department_id) if msg.department_id else None,
        message_type=msg.message_type,
        subject=msg.subject,
        content=msg.content,
        metadata=msg.extra_metadata or {},
        status=msg.status,
        parent_message_id=str(msg.parent_message_id) if msg.parent_message_id else None,
        created_at=msg.created_at,
        read_at=msg.read_at,
    )


# =============================================================================
# Agent Self-Reporting Endpoints
# =============================================================================


@router.post(
    "/{infra_id}/company/tasks/report",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Company"],
)
async def report_task(
    infra_id: UUID,
    request: TaskReportRequest,
    db: DbSession,
) -> TaskResponse:
    """Agent reports its own task result (self-reporting from heartbeat loop)."""
    await _get_infra(db, infra_id)

    now = datetime.utcnow()
    task = CompanyTask(
        infrastructure_id=infra_id,
        schedule_id=UUID(request.schedule_id) if request.schedule_id else None,
        agent_slug=request.agent_slug,
        title=request.title,
        task_type=request.task_type,
        status=request.status,
        result=request.result,
        duration_ms=request.duration_ms,
        error_message=request.error_message,
        started_at=now - timedelta(milliseconds=request.duration_ms or 0),
        completed_at=now,
    )
    db.add(task)

    # Update work log for non-silent tasks
    if request.status not in ("heartbeat_ok",):
        today = date.today()
        wl_result = await db.execute(
            select(CompanyWorkLog).where(
                CompanyWorkLog.infrastructure_id == infra_id,
                CompanyWorkLog.agent_slug == request.agent_slug,
                CompanyWorkLog.log_date == today,
            )
        )
        work_log = wl_result.scalar_one_or_none()
        if not work_log:
            work_log = CompanyWorkLog(
                infrastructure_id=infra_id,
                agent_slug=request.agent_slug,
                log_date=today,
                entries=[],
            )
            db.add(work_log)

        entry = {
            "timestamp": now.isoformat(),
            "type": request.task_type,
            "content": (request.result or {}).get("response", "")[:2000],
            "title": request.title,
        }
        entries = list(work_log.entries or [])
        entries.append(entry)
        work_log.entries = entries

        if request.status == "failed":
            work_log.tasks_failed = (work_log.tasks_failed or 0) + 1
        else:
            work_log.tasks_completed = (work_log.tasks_completed or 0) + 1

    await db.commit()
    await db.refresh(task)

    # Push to WebSocket for real-time dashboard
    try:
        from app.services.ws_manager import ws_manager
        await ws_manager.broadcast(
            f"company:{infra_id}:activity",
            {
                "type": "heartbeat_result",
                "agent_slug": request.agent_slug,
                "schedule_name": request.title,
                "status": request.status,
                "timestamp": now.isoformat(),
            },
        )
    except Exception:
        pass

    return _task_to_response(task)


@router.post(
    "/{infra_id}/company/work-logs/entry",
    response_model=WorkLogResponse,
    tags=["Company"],
)
async def append_work_log_entry(
    infra_id: UUID,
    request: WorkLogEntryRequest,
    db: DbSession,
) -> WorkLogResponse:
    """Agent appends an entry to its own daily work log."""
    await _get_infra(db, infra_id)

    today = date.today()
    result = await db.execute(
        select(CompanyWorkLog).where(
            CompanyWorkLog.infrastructure_id == infra_id,
            CompanyWorkLog.agent_slug == request.agent_slug,
            CompanyWorkLog.log_date == today,
        )
    )
    work_log = result.scalar_one_or_none()
    if not work_log:
        work_log = CompanyWorkLog(
            infrastructure_id=infra_id,
            agent_slug=request.agent_slug,
            log_date=today,
            entries=[],
        )
        db.add(work_log)

    entry = {
        "timestamp": datetime.utcnow().isoformat(),
        "type": request.entry_type,
        "content": request.content,
        "task_id": request.task_id,
        "schedule_name": request.schedule_name,
    }
    entries = list(work_log.entries or [])
    entries.append(entry)
    work_log.entries = entries

    await db.commit()
    await db.refresh(work_log)
    return _worklog_to_response(work_log)


# =============================================================================
# Messaging CRUD
# =============================================================================


@router.post(
    "/{infra_id}/company/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Company"],
)
async def send_message(
    infra_id: UUID,
    request: MessageCreateRequest,
    db: DbSession,
) -> MessageResponse:
    """Send a message (agent-to-agent or admin-to-agent). Stored for audit trail."""
    await _get_infra(db, infra_id)

    msg = CompanyMessage(
        infrastructure_id=infra_id,
        sender_slug=request.sender_slug,
        recipient_slug=request.recipient_slug,
        department_id=UUID(request.department_id) if request.department_id else None,
        message_type=request.message_type,
        subject=request.subject,
        content=request.content,
        extra_metadata=request.metadata,
        parent_message_id=UUID(request.parent_message_id) if request.parent_message_id else None,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)

    # Push to WebSocket for real-time frontend updates
    try:
        from app.services.ws_manager import ws_manager
        await ws_manager.broadcast(
            f"company:{infra_id}:activity",
            {
                "type": "company_message",
                "message_id": str(msg.id),
                "sender_slug": msg.sender_slug,
                "recipient_slug": msg.recipient_slug,
                "message_type": msg.message_type,
                "subject": msg.subject,
                "timestamp": msg.created_at.isoformat() if msg.created_at else None,
            },
        )
    except Exception:
        pass  # best-effort WebSocket push

    return _message_to_response(msg)


@router.get(
    "/{infra_id}/company/messages",
    response_model=List[MessageResponse],
    tags=["Company"],
)
async def list_messages(
    infra_id: UUID,
    db: DbSession,
    sender_slug: Optional[str] = Query(None),
    recipient_slug: Optional[str] = Query(None),
    message_type: Optional[str] = Query(None),
    message_status: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50),
) -> List[MessageResponse]:
    """List messages with optional filters."""
    await _get_infra(db, infra_id)

    query = select(CompanyMessage).where(CompanyMessage.infrastructure_id == infra_id)
    if sender_slug:
        query = query.where(CompanyMessage.sender_slug == sender_slug)
    if recipient_slug:
        query = query.where(CompanyMessage.recipient_slug == recipient_slug)
    if message_type:
        query = query.where(CompanyMessage.message_type == message_type)
    if message_status:
        query = query.where(CompanyMessage.status == message_status)

    query = query.order_by(CompanyMessage.created_at.desc()).limit(limit)
    result = await db.execute(query)
    messages = result.scalars().all()
    return [_message_to_response(m) for m in messages]


@router.get(
    "/{infra_id}/company/messages/inbox/{slug}",
    response_model=List[MessageResponse],
    tags=["Company"],
)
async def get_agent_inbox(
    infra_id: UUID,
    slug: str,
    db: DbSession,
) -> List[MessageResponse]:
    """Get unread messages for an agent (inbox)."""
    await _get_infra(db, infra_id)

    result = await db.execute(
        select(CompanyMessage).where(
            CompanyMessage.infrastructure_id == infra_id,
            CompanyMessage.recipient_slug == slug,
            CompanyMessage.status.in_(["sent", "delivered"]),
        ).order_by(CompanyMessage.created_at.asc())
    )
    messages = result.scalars().all()
    return [_message_to_response(m) for m in messages]


@router.put(
    "/{infra_id}/company/messages/{message_id}/read",
    response_model=MessageResponse,
    tags=["Company"],
)
async def mark_message_read(
    infra_id: UUID,
    message_id: UUID,
    db: DbSession,
) -> MessageResponse:
    """Mark a message as read."""
    result = await db.execute(
        select(CompanyMessage).where(
            CompanyMessage.id == message_id,
            CompanyMessage.infrastructure_id == infra_id,
        )
    )
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Message {message_id} not found",
        )
    msg.status = "read"
    msg.read_at = datetime.utcnow()
    await db.commit()
    await db.refresh(msg)
    return _message_to_response(msg)


@router.post(
    "/{infra_id}/company/messages/broadcast",
    response_model=List[MessageResponse],
    tags=["Company"],
)
async def broadcast_message(
    infra_id: UUID,
    request: MessageCreateRequest,
    db: DbSession,
    _: OperatorUser,
) -> List[MessageResponse]:
    """Broadcast a message to all agents in a department or all agents."""
    await _get_infra(db, infra_id)

    # Find target agents
    query = select(CompanyRole).where(
        CompanyRole.infrastructure_id == infra_id,
        CompanyRole.is_active.is_(True),
    )
    if request.department_id:
        query = query.where(CompanyRole.department_id == UUID(request.department_id))

    result = await db.execute(query)
    roles = result.scalars().all()

    created_messages = []
    for role in roles:
        if role.agent_slug == request.sender_slug:
            continue  # don't send to self

        msg = CompanyMessage(
            infrastructure_id=infra_id,
            sender_slug=request.sender_slug,
            recipient_slug=role.agent_slug,
            department_id=UUID(request.department_id) if request.department_id else None,
            message_type="broadcast",
            subject=request.subject,
            content=request.content,
            extra_metadata=request.metadata,
        )
        db.add(msg)
        created_messages.append(msg)

    await db.commit()
    for msg in created_messages:
        await db.refresh(msg)

    return [_message_to_response(m) for m in created_messages]


# =============================================================================
# Task Delegation
# =============================================================================


@router.post(
    "/{infra_id}/company/tasks/delegate",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Company"],
)
async def delegate_task(
    infra_id: UUID,
    request: TaskDelegateRequest,
    db: DbSession,
) -> TaskResponse:
    """Delegate a task from one agent to another.

    Creates a CompanyTask and sends a CompanyMessage notification.
    """
    await _get_infra(db, infra_id)

    now = datetime.utcnow()

    # Create the delegated task
    task = CompanyTask(
        infrastructure_id=infra_id,
        agent_slug=request.agent_slug,
        title=request.title,
        description=request.description,
        task_type=request.task_type,
        status="pending",
        priority=request.priority,
        requested_by_slug=request.requested_by,
        input_data={
            "requested_by": request.requested_by,
            "delegated": True,
        },
        scheduled_at=now,
    )
    db.add(task)
    await db.flush()  # get task.id

    # Send notification message to target agent
    msg = CompanyMessage(
        infrastructure_id=infra_id,
        sender_slug=request.requested_by,
        recipient_slug=request.agent_slug,
        message_type="task_request",
        subject=f"Task: {request.title}",
        content=request.description or request.title,
        extra_metadata={"task_id": str(task.id), "task_type": request.task_type},
    )
    db.add(msg)

    await db.commit()
    await db.refresh(task)

    # Push to WebSocket
    try:
        from app.services.ws_manager import ws_manager
        await ws_manager.broadcast(
            f"company:{infra_id}:activity",
            {
                "type": "task_delegated",
                "task_id": str(task.id),
                "from": request.requested_by,
                "to": request.agent_slug,
                "title": request.title,
                "timestamp": now.isoformat(),
            },
        )
    except Exception:
        pass

    return _task_to_response(task)
