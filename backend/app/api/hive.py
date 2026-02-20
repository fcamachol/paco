"""
PACO Hive API

Endpoints for hive infrastructure management: coordinator config,
task decomposition, messaging, and execution lifecycle.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select, update
from sqlalchemy.orm import selectinload

from app.core.deps import AdminUser, DbSession, OperatorUser
from app.db.models import Infrastructure, HiveCoordinator, HiveTask, HiveMessage

router = APIRouter(prefix="/infrastructures", tags=["Hive"])


# =============================================================================
# Pydantic Schemas
# =============================================================================


class CoordinatorCreateRequest(BaseModel):
    coordinator_model: str = "claude-sonnet-4-5-20250929"
    coordinator_temperature: float = 0.1
    decomposition_prompt: Optional[str] = None
    max_concurrent_tasks: int = 5
    task_timeout: int = 300
    max_retries: int = 2
    aggregation_strategy: str = "merge"
    aggregation_prompt: Optional[str] = None
    plan_mode_enabled: bool = True


class CoordinatorUpdateRequest(BaseModel):
    coordinator_model: Optional[str] = None
    coordinator_temperature: Optional[float] = None
    decomposition_prompt: Optional[str] = None
    max_concurrent_tasks: Optional[int] = None
    task_timeout: Optional[int] = None
    max_retries: Optional[int] = None
    aggregation_strategy: Optional[str] = None
    aggregation_prompt: Optional[str] = None
    plan_mode_enabled: Optional[bool] = None


class CoordinatorResponse(BaseModel):
    id: str
    infrastructure_id: str
    coordinator_model: str
    coordinator_temperature: float
    decomposition_prompt: Optional[str]
    max_concurrent_tasks: int
    task_timeout: int
    max_retries: int
    aggregation_strategy: str
    aggregation_prompt: Optional[str]
    plan_mode_enabled: bool
    status: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class TaskCreateRequest(BaseModel):
    subject: str
    description: Optional[str] = None
    active_form: Optional[str] = None
    execution_id: Optional[str] = None
    assigned_agent_slug: Optional[str] = None
    priority: int = 0
    blocked_by: List[str] = []
    blocks: List[str] = []
    metadata: Dict[str, Any] = {}


class TaskUpdateRequest(BaseModel):
    subject: Optional[str] = None
    description: Optional[str] = None
    active_form: Optional[str] = None
    status: Optional[str] = None
    assigned_agent_slug: Optional[str] = None
    priority: Optional[int] = None
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    blocked_by: Optional[List[str]] = None
    blocks: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None


class TaskClaimRequest(BaseModel):
    assigned_agent_slug: str


class TaskCompleteRequest(BaseModel):
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None


class TaskResponse(BaseModel):
    id: str
    infrastructure_id: str
    execution_id: Optional[str]
    subject: str
    description: Optional[str]
    active_form: Optional[str]
    status: str
    assigned_agent_slug: Optional[str]
    priority: int
    result: Optional[Dict[str, Any]]
    error_message: Optional[str]
    blocked_by: List[str]
    blocks: List[str]
    metadata: Dict[str, Any]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class MessageCreateRequest(BaseModel):
    message_type: str = "message"
    sender_slug: Optional[str] = None
    recipient_slug: Optional[str] = None
    content: str
    summary: Optional[str] = None
    execution_id: Optional[str] = None
    metadata: Dict[str, Any] = {}


class MessageResponse(BaseModel):
    id: str
    infrastructure_id: str
    execution_id: Optional[str]
    message_type: str
    sender_slug: Optional[str]
    recipient_slug: Optional[str]
    content: str
    summary: Optional[str]
    metadata: Dict[str, Any]
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class DecomposeRequest(BaseModel):
    prompt: str
    execution_id: Optional[str] = None


class HiveRunRequest(BaseModel):
    prompt: str


class HiveRunResponse(BaseModel):
    execution_id: str
    status: str
    tasks: List[TaskResponse]


class ExecutionStatusResponse(BaseModel):
    execution_id: str
    status: str
    total_tasks: int
    completed_tasks: int
    failed_tasks: int
    pending_tasks: int
    in_progress_tasks: int
    tasks: List[TaskResponse]


# =============================================================================
# Helper Functions
# =============================================================================


async def _get_infra(db, infra_id: UUID) -> Infrastructure:
    result = await db.execute(
        select(Infrastructure)
        .where(Infrastructure.id == infra_id)
        .options(selectinload(Infrastructure.hive_coordinator))
    )
    infra = result.scalar_one_or_none()
    if not infra:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Infrastructure {infra_id} not found",
        )
    return infra


def _coordinator_to_response(coord: HiveCoordinator) -> CoordinatorResponse:
    return CoordinatorResponse(
        id=str(coord.id),
        infrastructure_id=str(coord.infrastructure_id),
        coordinator_model=coord.coordinator_model,
        coordinator_temperature=float(coord.coordinator_temperature),
        decomposition_prompt=coord.decomposition_prompt,
        max_concurrent_tasks=coord.max_concurrent_tasks,
        task_timeout=coord.task_timeout,
        max_retries=coord.max_retries,
        aggregation_strategy=coord.aggregation_strategy,
        aggregation_prompt=coord.aggregation_prompt,
        plan_mode_enabled=coord.plan_mode_enabled,
        status=coord.status,
        created_at=coord.created_at,
        updated_at=coord.updated_at,
    )


def _task_to_response(task: HiveTask) -> TaskResponse:
    return TaskResponse(
        id=str(task.id),
        infrastructure_id=str(task.infrastructure_id),
        execution_id=task.execution_id,
        subject=task.subject,
        description=task.description,
        active_form=task.active_form,
        status=task.status,
        assigned_agent_slug=task.assigned_agent_slug,
        priority=task.priority,
        result=task.result,
        error_message=task.error_message,
        blocked_by=task.blocked_by or [],
        blocks=task.blocks or [],
        metadata=task.extra_metadata or {},
        started_at=task.started_at,
        completed_at=task.completed_at,
        created_at=task.created_at,
    )


def _message_to_response(msg: HiveMessage) -> MessageResponse:
    return MessageResponse(
        id=str(msg.id),
        infrastructure_id=str(msg.infrastructure_id),
        execution_id=msg.execution_id,
        message_type=msg.message_type,
        sender_slug=msg.sender_slug,
        recipient_slug=msg.recipient_slug,
        content=msg.content,
        summary=msg.summary,
        metadata=msg.extra_metadata or {},
        status=msg.status,
        created_at=msg.created_at,
    )


# =============================================================================
# Coordinator CRUD
# =============================================================================


@router.post(
    "/{infra_id}/coordinator",
    response_model=CoordinatorResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Hive"],
)
async def create_coordinator(
    infra_id: UUID,
    request: CoordinatorCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> CoordinatorResponse:
    """Create hive coordinator configuration for an infrastructure."""
    infra = await _get_infra(db, infra_id)

    if infra.hive_coordinator:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Hive coordinator already exists for this infrastructure",
        )

    coord = HiveCoordinator(
        infrastructure_id=infra.id,
        coordinator_model=request.coordinator_model,
        coordinator_temperature=request.coordinator_temperature,
        decomposition_prompt=request.decomposition_prompt,
        max_concurrent_tasks=request.max_concurrent_tasks,
        task_timeout=request.task_timeout,
        max_retries=request.max_retries,
        aggregation_strategy=request.aggregation_strategy,
        aggregation_prompt=request.aggregation_prompt,
        plan_mode_enabled=request.plan_mode_enabled,
    )
    db.add(coord)
    await db.commit()
    await db.refresh(coord)
    return _coordinator_to_response(coord)


@router.get(
    "/{infra_id}/hive/coordinator",
    response_model=CoordinatorResponse,
    tags=["Hive"],
)
async def get_coordinator(infra_id: UUID, db: DbSession) -> CoordinatorResponse:
    """Get hive coordinator configuration."""
    infra = await _get_infra(db, infra_id)
    if not infra.hive_coordinator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hive coordinator configured for this infrastructure",
        )
    return _coordinator_to_response(infra.hive_coordinator)


@router.put(
    "/{infra_id}/hive/coordinator",
    response_model=CoordinatorResponse,
    tags=["Hive"],
)
async def update_coordinator(
    infra_id: UUID,
    request: CoordinatorUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> CoordinatorResponse:
    """Update hive coordinator configuration."""
    infra = await _get_infra(db, infra_id)
    if not infra.hive_coordinator:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No hive coordinator configured for this infrastructure",
        )

    coord = infra.hive_coordinator
    for field in [
        "coordinator_model", "coordinator_temperature", "decomposition_prompt",
        "max_concurrent_tasks", "task_timeout", "max_retries",
        "aggregation_strategy", "aggregation_prompt", "plan_mode_enabled",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(coord, field, value)

    await db.commit()
    await db.refresh(coord)
    return _coordinator_to_response(coord)


# =============================================================================
# Task Management
# =============================================================================


@router.post(
    "/{infra_id}/hive/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Hive"],
)
async def create_task(
    infra_id: UUID,
    request: TaskCreateRequest,
    db: DbSession,
    _: OperatorUser,
) -> TaskResponse:
    """Create a new hive task."""
    await _get_infra(db, infra_id)

    task = HiveTask(
        infrastructure_id=infra_id,
        subject=request.subject,
        description=request.description,
        active_form=request.active_form,
        execution_id=request.execution_id,
        assigned_agent_slug=request.assigned_agent_slug,
        priority=request.priority,
        blocked_by=request.blocked_by,
        blocks=request.blocks,
        extra_metadata=request.metadata,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.get(
    "/{infra_id}/hive/tasks",
    response_model=List[TaskResponse],
    tags=["Hive"],
)
async def list_tasks(
    infra_id: UUID,
    db: DbSession,
    execution_id: Optional[str] = Query(None),
    task_status: Optional[str] = Query(None, alias="status"),
) -> List[TaskResponse]:
    """List hive tasks, optionally filtered by execution_id or status."""
    await _get_infra(db, infra_id)

    query = select(HiveTask).where(HiveTask.infrastructure_id == infra_id)
    if execution_id:
        query = query.where(HiveTask.execution_id == execution_id)
    if task_status:
        query = query.where(HiveTask.status == task_status)
    query = query.order_by(HiveTask.priority.desc(), HiveTask.created_at)

    result = await db.execute(query)
    tasks = result.scalars().all()
    return [_task_to_response(t) for t in tasks]


@router.get(
    "/{infra_id}/hive/tasks/{task_id}",
    response_model=TaskResponse,
    tags=["Hive"],
)
async def get_task(infra_id: UUID, task_id: UUID, db: DbSession) -> TaskResponse:
    """Get a single hive task."""
    result = await db.execute(
        select(HiveTask).where(
            HiveTask.id == task_id,
            HiveTask.infrastructure_id == infra_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return _task_to_response(task)


@router.put(
    "/{infra_id}/hive/tasks/{task_id}",
    response_model=TaskResponse,
    tags=["Hive"],
)
async def update_task(
    infra_id: UUID,
    task_id: UUID,
    request: TaskUpdateRequest,
    db: DbSession,
    _: OperatorUser,
) -> TaskResponse:
    """Update a hive task."""
    result = await db.execute(
        select(HiveTask).where(
            HiveTask.id == task_id,
            HiveTask.infrastructure_id == infra_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    for field in [
        "subject", "description", "active_form", "status",
        "assigned_agent_slug", "priority", "result", "error_message",
        "blocked_by", "blocks",
    ]:
        value = getattr(request, field)
        if value is not None:
            setattr(task, field, value)

    if request.metadata is not None:
        task.extra_metadata = request.metadata

    # Track status transitions
    if request.status == "in_progress" and not task.started_at:
        task.started_at = datetime.utcnow()
    elif request.status in ("completed", "failed"):
        task.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.post(
    "/{infra_id}/hive/tasks/{task_id}/claim",
    response_model=TaskResponse,
    tags=["Hive"],
)
async def claim_task(
    infra_id: UUID,
    task_id: UUID,
    request: TaskClaimRequest,
    db: DbSession,
    _: OperatorUser,
) -> TaskResponse:
    """Claim a task by setting assigned_agent_slug and status to in_progress."""
    result = await db.execute(
        select(HiveTask).where(
            HiveTask.id == task_id,
            HiveTask.infrastructure_id == infra_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    if task.status not in ("pending",):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Task cannot be claimed in status '{task.status}'",
        )

    task.assigned_agent_slug = request.assigned_agent_slug
    task.status = "in_progress"
    task.started_at = datetime.utcnow()

    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.post(
    "/{infra_id}/hive/tasks/{task_id}/complete",
    response_model=TaskResponse,
    tags=["Hive"],
)
async def complete_task(
    infra_id: UUID,
    task_id: UUID,
    request: TaskCompleteRequest,
    db: DbSession,
    _: OperatorUser,
) -> TaskResponse:
    """Complete a task with an optional result or error."""
    result = await db.execute(
        select(HiveTask).where(
            HiveTask.id == task_id,
            HiveTask.infrastructure_id == infra_id,
        )
    )
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )

    if request.error_message:
        task.status = "failed"
        task.error_message = request.error_message
    else:
        task.status = "completed"

    task.result = request.result
    task.completed_at = datetime.utcnow()

    await db.commit()
    await db.refresh(task)
    return _task_to_response(task)


@router.post(
    "/{infra_id}/hive/decompose",
    response_model=List[TaskResponse],
    tags=["Hive"],
)
async def decompose_request(
    infra_id: UUID,
    request: DecomposeRequest,
    db: DbSession,
    _: OperatorUser,
) -> List[TaskResponse]:
    """Decompose a user prompt into hive tasks.

    This is a placeholder that creates a single task from the prompt.
    The actual AI-powered decomposition will be implemented in the runtime.
    """
    await _get_infra(db, infra_id)

    execution_id = request.execution_id or str(uuid4())

    task = HiveTask(
        infrastructure_id=infra_id,
        execution_id=execution_id,
        subject=request.prompt[:500],
        description=request.prompt,
        status="pending",
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)

    return [_task_to_response(task)]


# =============================================================================
# Messaging
# =============================================================================


@router.post(
    "/{infra_id}/hive/messages",
    response_model=MessageResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Hive"],
)
async def send_message(
    infra_id: UUID,
    request: MessageCreateRequest,
    db: DbSession,
    _: OperatorUser,
) -> MessageResponse:
    """Send a message within the hive (DM or broadcast)."""
    await _get_infra(db, infra_id)

    msg = HiveMessage(
        infrastructure_id=infra_id,
        execution_id=request.execution_id,
        message_type=request.message_type,
        sender_slug=request.sender_slug,
        recipient_slug=request.recipient_slug,
        content=request.content,
        summary=request.summary,
        extra_metadata=request.metadata,
    )
    db.add(msg)
    await db.commit()
    await db.refresh(msg)
    return _message_to_response(msg)


@router.get(
    "/{infra_id}/hive/messages",
    response_model=List[MessageResponse],
    tags=["Hive"],
)
async def list_messages(
    infra_id: UUID,
    db: DbSession,
    execution_id: Optional[str] = Query(None),
    recipient: Optional[str] = Query(None),
) -> List[MessageResponse]:
    """List hive messages, optionally filtered by execution_id or recipient."""
    await _get_infra(db, infra_id)

    query = select(HiveMessage).where(HiveMessage.infrastructure_id == infra_id)
    if execution_id:
        query = query.where(HiveMessage.execution_id == execution_id)
    if recipient:
        query = query.where(HiveMessage.recipient_slug == recipient)
    query = query.order_by(HiveMessage.created_at)

    result = await db.execute(query)
    messages = result.scalars().all()
    return [_message_to_response(m) for m in messages]


# =============================================================================
# Execution Lifecycle
# =============================================================================


@router.post(
    "/{infra_id}/hive/run",
    response_model=HiveRunResponse,
    tags=["Hive"],
)
async def start_hive_execution(
    infra_id: UUID,
    request: HiveRunRequest,
    db: DbSession,
    _: OperatorUser,
) -> HiveRunResponse:
    """Start a hive execution: create execution_id, decompose prompt into tasks."""
    infra = await _get_infra(db, infra_id)

    if not infra.hive_coordinator:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No hive coordinator configured. Create one first.",
        )

    execution_id = str(uuid4())

    # Create initial task from prompt (placeholder for AI decomposition)
    task = HiveTask(
        infrastructure_id=infra_id,
        execution_id=execution_id,
        subject=request.prompt[:500],
        description=request.prompt,
        status="pending",
    )
    db.add(task)

    # Update coordinator status
    infra.hive_coordinator.status = "running"

    await db.commit()
    await db.refresh(task)

    return HiveRunResponse(
        execution_id=execution_id,
        status="running",
        tasks=[_task_to_response(task)],
    )


@router.get(
    "/{infra_id}/hive/status/{execution_id}",
    response_model=ExecutionStatusResponse,
    tags=["Hive"],
)
async def get_execution_status(
    infra_id: UUID,
    execution_id: str,
    db: DbSession,
) -> ExecutionStatusResponse:
    """Get execution status with task summary."""
    await _get_infra(db, infra_id)

    result = await db.execute(
        select(HiveTask).where(
            HiveTask.infrastructure_id == infra_id,
            HiveTask.execution_id == execution_id,
        )
    )
    tasks = result.scalars().all()

    if not tasks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No tasks found for execution {execution_id}",
        )

    completed = sum(1 for t in tasks if t.status == "completed")
    failed = sum(1 for t in tasks if t.status == "failed")
    pending = sum(1 for t in tasks if t.status == "pending")
    in_progress = sum(1 for t in tasks if t.status == "in_progress")

    if all(t.status in ("completed", "failed", "cancelled") for t in tasks):
        overall_status = "completed"
    elif any(t.status in ("in_progress",) for t in tasks):
        overall_status = "running"
    else:
        overall_status = "pending"

    return ExecutionStatusResponse(
        execution_id=execution_id,
        status=overall_status,
        total_tasks=len(tasks),
        completed_tasks=completed,
        failed_tasks=failed,
        pending_tasks=pending,
        in_progress_tasks=in_progress,
        tasks=[_task_to_response(t) for t in tasks],
    )


@router.post(
    "/{infra_id}/hive/shutdown/{execution_id}",
    response_model=ExecutionStatusResponse,
    tags=["Hive"],
)
async def shutdown_execution(
    infra_id: UUID,
    execution_id: str,
    db: DbSession,
    _: OperatorUser,
) -> ExecutionStatusResponse:
    """Shutdown a hive execution: cancel all pending tasks."""
    infra = await _get_infra(db, infra_id)

    result = await db.execute(
        select(HiveTask).where(
            HiveTask.infrastructure_id == infra_id,
            HiveTask.execution_id == execution_id,
        )
    )
    tasks = result.scalars().all()

    if not tasks:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No tasks found for execution {execution_id}",
        )

    now = datetime.utcnow()
    for task in tasks:
        if task.status in ("pending", "in_progress"):
            task.status = "cancelled"
            task.completed_at = now

    # Update coordinator status if present
    if infra.hive_coordinator:
        infra.hive_coordinator.status = "stopped"

    await db.commit()

    # Re-fetch tasks for response
    result = await db.execute(
        select(HiveTask).where(
            HiveTask.infrastructure_id == infra_id,
            HiveTask.execution_id == execution_id,
        )
    )
    tasks = result.scalars().all()

    completed = sum(1 for t in tasks if t.status == "completed")
    failed = sum(1 for t in tasks if t.status == "failed")
    pending = sum(1 for t in tasks if t.status == "pending")
    in_progress = sum(1 for t in tasks if t.status == "in_progress")

    return ExecutionStatusResponse(
        execution_id=execution_id,
        status="shutdown",
        total_tasks=len(tasks),
        completed_tasks=completed,
        failed_tasks=failed,
        pending_tasks=pending,
        in_progress_tasks=in_progress,
        tasks=[_task_to_response(t) for t in tasks],
    )
