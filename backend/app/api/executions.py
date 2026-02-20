"""
PACO Executions API

Execution logs, token tracking, and metrics.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import DbSession
from app.db.models import Agent, Execution, ToolCall

router = APIRouter(prefix="/executions", tags=["Executions"])


# =============================================================================
# Schemas
# =============================================================================


class ExecutionResponse(BaseModel):
    """Execution response model."""

    id: str
    agent_id: Optional[str]
    agent_name: Optional[str]
    conversation_id: Optional[str]
    trace_id: Optional[str]
    langfuse_trace_id: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_ms: Optional[int]
    input_tokens: int
    output_tokens: int
    total_tokens: int
    total_cost: float
    model: Optional[str]
    status: str
    error_message: Optional[str]

    class Config:
        from_attributes = True


class ExecutionDetailResponse(ExecutionResponse):
    """Detailed execution response with tool calls."""

    tool_calls: List["ToolCallResponse"]
    metadata: Dict[str, Any]


class ToolCallResponse(BaseModel):
    """Tool call response model."""

    id: str
    tool_name: str
    input: Dict[str, Any]
    output: Optional[Dict[str, Any]]
    latency_ms: Optional[int]
    success: bool
    error_message: Optional[str]
    called_at: datetime

    class Config:
        from_attributes = True


class TokenMetrics(BaseModel):
    """Token usage metrics."""

    total_input_tokens: int
    total_output_tokens: int
    total_tokens: int
    total_cost: float
    execution_count: int


class DailyTokenMetrics(TokenMetrics):
    """Daily token usage metrics."""

    date: str


class AgentTokenMetrics(TokenMetrics):
    """Token metrics by agent."""

    agent_name: str


class MetricsSummary(BaseModel):
    """Overall metrics summary."""

    period: str
    total: TokenMetrics
    by_day: List[DailyTokenMetrics]
    by_agent: List[AgentTokenMetrics]


# =============================================================================
# Execution Endpoints
# =============================================================================


@router.get("", response_model=List[ExecutionResponse])
async def list_executions(
    db: DbSession,
    agent_id: Optional[UUID] = None,
    conversation_id: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> List[ExecutionResponse]:
    """
    List executions with optional filters.

    - **agent_id**: Filter by specific agent
    - **conversation_id**: Filter by conversation
    - **status**: Filter by status (running, success, error, timeout)
    - **limit**: Max results (1-500, default 50)
    - **offset**: Skip first N results
    """
    query = select(Execution).order_by(Execution.started_at.desc())

    if agent_id:
        query = query.where(Execution.agent_id == agent_id)

    if conversation_id:
        query = query.where(Execution.conversation_id == conversation_id)

    if status_filter:
        query = query.where(Execution.status == status_filter)

    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    executions = result.scalars().all()

    # Get agent names
    agent_ids = {e.agent_id for e in executions if e.agent_id}
    agent_names = {}
    if agent_ids:
        result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        for agent in result.scalars().all():
            agent_names[agent.id] = agent.name

    return [
        ExecutionResponse(
            id=str(ex.id),
            agent_id=str(ex.agent_id) if ex.agent_id else None,
            agent_name=agent_names.get(ex.agent_id)
                or (ex.extra_metadata or {}).get("agent_name"),
            conversation_id=ex.conversation_id,
            trace_id=ex.trace_id,
            langfuse_trace_id=ex.langfuse_trace_id,
            started_at=ex.started_at,
            ended_at=ex.ended_at,
            duration_ms=ex.duration_ms,
            input_tokens=ex.input_tokens,
            output_tokens=ex.output_tokens,
            total_tokens=ex.input_tokens + ex.output_tokens,
            total_cost=float(ex.total_cost),
            model=ex.model,
            status=ex.status,
            error_message=ex.error_message,
        )
        for ex in executions
    ]


@router.get("/{execution_id}", response_model=ExecutionDetailResponse)
async def get_execution(execution_id: UUID, db: DbSession) -> ExecutionDetailResponse:
    """Get execution details with tool calls."""
    result = await db.execute(select(Execution).where(Execution.id == execution_id))
    execution = result.scalar_one_or_none()

    if not execution:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Execution {execution_id} not found",
        )

    # Get agent name
    agent_name = None
    if execution.agent_id:
        result = await db.execute(select(Agent).where(Agent.id == execution.agent_id))
        agent = result.scalar_one_or_none()
        if agent:
            agent_name = agent.name

    # Get tool calls
    result = await db.execute(
        select(ToolCall)
        .where(ToolCall.execution_id == execution_id)
        .order_by(ToolCall.called_at)
    )
    tool_calls = result.scalars().all()

    return ExecutionDetailResponse(
        id=str(execution.id),
        agent_id=str(execution.agent_id) if execution.agent_id else None,
        agent_name=agent_name,
        conversation_id=execution.conversation_id,
        trace_id=execution.trace_id,
        langfuse_trace_id=execution.langfuse_trace_id,
        started_at=execution.started_at,
        ended_at=execution.ended_at,
        duration_ms=execution.duration_ms,
        input_tokens=execution.input_tokens,
        output_tokens=execution.output_tokens,
        total_tokens=execution.input_tokens + execution.output_tokens,
        total_cost=float(execution.total_cost),
        model=execution.model,
        status=execution.status,
        error_message=execution.error_message,
        metadata=execution.metadata,
        tool_calls=[
            ToolCallResponse(
                id=str(tc.id),
                tool_name=tc.tool_name,
                input=tc.input,
                output=tc.output,
                latency_ms=tc.latency_ms,
                success=tc.success,
                error_message=tc.error_message,
                called_at=tc.called_at,
            )
            for tc in tool_calls
        ],
    )


# =============================================================================
# Metrics Endpoints
# =============================================================================


@router.get("/metrics/summary", response_model=MetricsSummary)
async def get_metrics_summary(
    db: DbSession,
    days: int = Query(30, ge=1, le=365),
    agent_id: Optional[UUID] = None,
) -> MetricsSummary:
    """
    Get token usage metrics summary.

    - **days**: Number of days to include (1-365, default 30)
    - **agent_id**: Filter by specific agent
    """
    start_date = datetime.now(timezone.utc) - timedelta(days=days)

    # Base query filter
    base_filter = Execution.started_at >= start_date
    if agent_id:
        base_filter = base_filter & (Execution.agent_id == agent_id)

    # Total metrics
    total_result = await db.execute(
        select(
            func.sum(Execution.input_tokens).label("input"),
            func.sum(Execution.output_tokens).label("output"),
            func.sum(Execution.total_cost).label("cost"),
            func.count(Execution.id).label("count"),
        ).where(base_filter)
    )
    total_row = total_result.one()

    total_metrics = TokenMetrics(
        total_input_tokens=total_row.input or 0,
        total_output_tokens=total_row.output or 0,
        total_tokens=(total_row.input or 0) + (total_row.output or 0),
        total_cost=float(total_row.cost or 0),
        execution_count=total_row.count or 0,
    )

    # Daily breakdown
    daily_result = await db.execute(
        select(
            func.date(Execution.started_at).label("date"),
            func.sum(Execution.input_tokens).label("input"),
            func.sum(Execution.output_tokens).label("output"),
            func.sum(Execution.total_cost).label("cost"),
            func.count(Execution.id).label("count"),
        )
        .where(base_filter)
        .group_by(func.date(Execution.started_at))
        .order_by(func.date(Execution.started_at).desc())
    )

    daily_metrics = [
        DailyTokenMetrics(
            date=str(row.date),
            total_input_tokens=row.input or 0,
            total_output_tokens=row.output or 0,
            total_tokens=(row.input or 0) + (row.output or 0),
            total_cost=float(row.cost or 0),
            execution_count=row.count or 0,
        )
        for row in daily_result
    ]

    # By agent breakdown (only if not filtered by agent)
    by_agent = []
    if not agent_id:
        agent_result = await db.execute(
            select(
                Agent.name.label("agent_name"),
                func.sum(Execution.input_tokens).label("input"),
                func.sum(Execution.output_tokens).label("output"),
                func.sum(Execution.total_cost).label("cost"),
                func.count(Execution.id).label("count"),
            )
            .join(Agent, Execution.agent_id == Agent.id)
            .where(Execution.started_at >= start_date)
            .group_by(Agent.name)
            .order_by(func.sum(Execution.total_cost).desc())
        )

        by_agent = [
            AgentTokenMetrics(
                agent_name=row.agent_name,
                total_input_tokens=row.input or 0,
                total_output_tokens=row.output or 0,
                total_tokens=(row.input or 0) + (row.output or 0),
                total_cost=float(row.cost or 0),
                execution_count=row.count or 0,
            )
            for row in agent_result
        ]

    return MetricsSummary(
        period=f"last_{days}_days",
        total=total_metrics,
        by_day=daily_metrics,
        by_agent=by_agent,
    )


@router.get("/metrics/realtime")
async def get_realtime_metrics(
    db: DbSession,
    hours: int = Query(1, ge=1, le=24),
) -> Dict[str, Any]:
    """
    Get real-time metrics for the last N hours.

    Useful for dashboard widgets.
    """
    start_time = datetime.now(timezone.utc) - timedelta(hours=hours)

    # Current executions
    running_result = await db.execute(
        select(func.count(Execution.id)).where(Execution.status == "running")
    )
    running_count = running_result.scalar() or 0

    # Recent stats
    recent_result = await db.execute(
        select(
            func.count(Execution.id).label("count"),
            func.sum(Execution.input_tokens).label("input"),
            func.sum(Execution.output_tokens).label("output"),
            func.sum(Execution.total_cost).label("cost"),
            func.avg(Execution.duration_ms).label("avg_duration"),
            func.sum(
                func.case((Execution.status == "error", 1), else_=0)
            ).label("errors"),
        ).where(Execution.started_at >= start_time)
    )
    recent = recent_result.one()

    # Recent tool calls
    tool_result = await db.execute(
        select(
            func.count(ToolCall.id).label("count"),
            func.avg(ToolCall.latency_ms).label("avg_latency"),
            func.sum(
                func.case((ToolCall.success == False, 1), else_=0)
            ).label("failures"),
        ).where(ToolCall.called_at >= start_time)
    )
    tool_stats = tool_result.one()

    return {
        "period_hours": hours,
        "running_executions": running_count,
        "recent_executions": {
            "count": recent.count or 0,
            "input_tokens": recent.input or 0,
            "output_tokens": recent.output or 0,
            "total_cost": float(recent.cost or 0),
            "avg_duration_ms": float(recent.avg_duration or 0),
            "error_count": recent.errors or 0,
            "error_rate": (
                (recent.errors or 0) / recent.count * 100 if recent.count else 0
            ),
        },
        "tool_calls": {
            "count": tool_stats.count or 0,
            "avg_latency_ms": float(tool_stats.avg_latency or 0),
            "failure_count": tool_stats.failures or 0,
        },
    }
