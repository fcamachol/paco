"""
PACO Session Runs API

Full conversation replay endpoints for enterprise debugging and audit compliance.
Supports ingestion from agents, querying, full-text search, integrity verification, and export.
"""

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select, text
from sqlalchemy.orm import selectinload

from app.core.deps import DbSession, CurrentUser
from app.db.models import Agent, Execution, SessionMessage, SessionRun
from app.schemas.session_runs import (
    AppendMessageRequest,
    BatchAppendMessagesRequest,
    CompleteSessionRunRequest,
    CreateSessionRunRequest,
    SearchRequest,
    SessionMessageDetailResponse,
    SessionMessageResponse,
    SessionRunDetailResponse,
    SessionRunListResponse,
    SessionRunResponse,
    SessionRunSearchResponse,
    SessionRunSearchResult,
    VerifyIntegrityResponse,
)
from app.services.session_capture import session_capture

router = APIRouter(prefix="/session-runs", tags=["Session Runs"])


# =============================================================================
# Helpers
# =============================================================================


def _run_to_response(run: SessionRun) -> SessionRunResponse:
    return SessionRunResponse(
        id=str(run.id),
        agent_id=str(run.agent_id) if run.agent_id else None,
        user_id=run.user_id,
        source=run.source,
        title=run.title,
        status=run.status,
        model=run.model,
        message_count=run.message_count or 0,
        total_input_tokens=run.total_input_tokens or 0,
        total_output_tokens=run.total_output_tokens or 0,
        total_cost=float(run.total_cost or 0),
        total_duration_ms=run.total_duration_ms or 0,
        started_at=run.started_at,
        ended_at=run.ended_at,
        created_at=run.created_at,
    )


def _msg_to_response(msg: SessionMessage) -> SessionMessageResponse:
    return SessionMessageResponse(
        id=str(msg.id),
        session_run_id=str(msg.session_run_id),
        execution_id=str(msg.execution_id) if msg.execution_id else None,
        sequence_number=msg.sequence_number,
        role=msg.role,
        content_text=msg.content_text,
        content_blocks=msg.content_blocks,
        tool_name=msg.tool_name,
        tool_call_id=msg.tool_call_id,
        input_tokens=msg.input_tokens,
        output_tokens=msg.output_tokens,
        cost=float(msg.cost) if msg.cost is not None else None,
        latency_ms=msg.latency_ms,
        model=msg.model,
        stop_reason=msg.stop_reason,
        thinking_content=msg.thinking_content,
        message_hash=msg.message_hash,
        metadata=msg.metadata or {},
        created_at=msg.created_at,
    )


# =============================================================================
# Ingestion Endpoints (used by agents, validated via X-Paco-Agent-Id header)
# =============================================================================


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_session_run(
    request: CreateSessionRunRequest,
    x_paco_agent_id: Optional[str] = Header(None),
):
    """Create a new session run. Returns {id, status}."""
    agent_id = request.agent_id or x_paco_agent_id
    session_id = await session_capture.start_session(
        agent_id=agent_id,
        user_id=request.user_id,
        source=request.source,
        title=request.title,
        system_prompt=request.system_prompt,
        model=request.model,
        metadata=request.metadata,
    )
    if session_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create session run",
        )
    return {"id": str(session_id), "status": "active"}


@router.post("/{session_run_id}/messages", status_code=status.HTTP_201_CREATED)
async def append_message(
    session_run_id: UUID,
    request: AppendMessageRequest,
):
    """Append a single message to a session run."""
    msg_id = await session_capture.append_message(
        session_run_id,
        role=request.role,
        content_text=request.content_text,
        content_blocks=request.content_blocks,
        tool_name=request.tool_name,
        tool_call_id=request.tool_call_id,
        input_tokens=request.input_tokens,
        output_tokens=request.output_tokens,
        cost=request.cost,
        latency_ms=request.latency_ms,
        model=request.model,
        stop_reason=request.stop_reason,
        raw_request=request.raw_request,
        raw_response=request.raw_response,
        thinking_content=request.thinking_content,
        execution_id=request.execution_id,
        metadata=request.metadata,
    )
    if msg_id is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to append message",
        )
    return {"id": str(msg_id), "session_run_id": str(session_run_id)}


@router.post("/{session_run_id}/messages/batch", status_code=status.HTTP_201_CREATED)
async def append_messages_batch(
    session_run_id: UUID,
    request: BatchAppendMessagesRequest,
):
    """Append multiple messages to a session run (max 50)."""
    count = await session_capture.append_messages_batch(
        session_run_id,
        [msg.model_dump() for msg in request.messages],
    )
    return {"appended": count, "session_run_id": str(session_run_id)}


@router.post("/{session_run_id}/complete")
async def complete_session_run(
    session_run_id: UUID,
    request: CompleteSessionRunRequest,
):
    """Finalize a session run."""
    success = await session_capture.end_session(
        session_run_id,
        status=request.status,
        error_message=request.error_message,
        metadata=request.metadata,
    )
    if not success:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to complete session run",
        )
    return {"id": str(session_run_id), "status": request.status}


# =============================================================================
# Query Endpoints
# =============================================================================


@router.get("", response_model=SessionRunListResponse)
async def list_session_runs(
    db: DbSession,
    agent_id: Optional[UUID] = None,
    user_id: Optional[str] = None,
    source: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    from_date: Optional[datetime] = None,
    to_date: Optional[datetime] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
):
    """List session runs with filters and pagination."""
    query = select(SessionRun).order_by(SessionRun.started_at.desc())

    if agent_id:
        query = query.where(SessionRun.agent_id == agent_id)
    if user_id:
        query = query.where(SessionRun.user_id == user_id)
    if source:
        query = query.where(SessionRun.source == source)
    if status_filter:
        query = query.where(SessionRun.status == status_filter)
    if from_date:
        query = query.where(SessionRun.started_at >= from_date)
    if to_date:
        query = query.where(SessionRun.started_at <= to_date)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    # Paginate
    offset = (page - 1) * per_page
    query = query.limit(per_page).offset(offset)

    result = await db.execute(query)
    runs = result.scalars().all()

    return SessionRunListResponse(
        items=[_run_to_response(r) for r in runs],
        total=total,
        page=page,
        per_page=per_page,
    )


@router.get("/{session_run_id}", response_model=SessionRunDetailResponse)
async def get_session_run(session_run_id: UUID, db: DbSession):
    """Get session run detail with all messages (conversation replay)."""
    result = await db.execute(
        select(SessionRun)
        .where(SessionRun.id == session_run_id)
        .options(selectinload(SessionRun.messages))
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session run {session_run_id} not found",
        )

    # Collect execution IDs from messages
    execution_ids = list({
        str(msg.execution_id)
        for msg in run.messages
        if msg.execution_id
    })

    return SessionRunDetailResponse(
        id=str(run.id),
        agent_id=str(run.agent_id) if run.agent_id else None,
        user_id=run.user_id,
        source=run.source,
        title=run.title,
        status=run.status,
        model=run.model,
        message_count=run.message_count or 0,
        total_input_tokens=run.total_input_tokens or 0,
        total_output_tokens=run.total_output_tokens or 0,
        total_cost=float(run.total_cost or 0),
        total_duration_ms=run.total_duration_ms or 0,
        started_at=run.started_at,
        ended_at=run.ended_at,
        created_at=run.created_at,
        system_prompt=run.system_prompt,
        system_prompt_hash=run.system_prompt_hash,
        integrity_hash=run.integrity_hash,
        messages=[_msg_to_response(m) for m in run.messages],
        execution_ids=execution_ids,
        metadata=run.metadata or {},
    )


@router.get("/{session_run_id}/messages/{message_id}", response_model=SessionMessageDetailResponse)
async def get_session_message(session_run_id: UUID, message_id: UUID, db: DbSession):
    """Get a single message with raw API payloads."""
    result = await db.execute(
        select(SessionMessage).where(
            SessionMessage.id == message_id,
            SessionMessage.session_run_id == session_run_id,
        )
    )
    msg = result.scalar_one_or_none()

    if not msg:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Message {message_id} not found in session {session_run_id}",
        )

    return SessionMessageDetailResponse(
        id=str(msg.id),
        session_run_id=str(msg.session_run_id),
        execution_id=str(msg.execution_id) if msg.execution_id else None,
        sequence_number=msg.sequence_number,
        role=msg.role,
        content_text=msg.content_text,
        content_blocks=msg.content_blocks,
        tool_name=msg.tool_name,
        tool_call_id=msg.tool_call_id,
        input_tokens=msg.input_tokens,
        output_tokens=msg.output_tokens,
        cost=float(msg.cost) if msg.cost is not None else None,
        latency_ms=msg.latency_ms,
        model=msg.model,
        stop_reason=msg.stop_reason,
        thinking_content=msg.thinking_content,
        message_hash=msg.message_hash,
        metadata=msg.metadata or {},
        created_at=msg.created_at,
        raw_request=msg.raw_request,
        raw_response=msg.raw_response,
    )


# =============================================================================
# Search Endpoint
# =============================================================================


@router.post("/search", response_model=SessionRunSearchResponse)
async def search_session_runs(request: SearchRequest, db: DbSession):
    """Full-text search across session message content."""
    query_text = request.query.strip()
    if not query_text:
        return SessionRunSearchResponse(results=[], total=0, query=query_text)

    # Build the full-text search query
    ts_query = func.plainto_tsquery("english", query_text)
    ts_vector = func.to_tsvector("english", func.coalesce(SessionMessage.content_text, ""))

    search_query = (
        select(
            SessionMessage.id,
            SessionMessage.session_run_id,
            SessionMessage.role,
            SessionMessage.content_text,
            SessionMessage.created_at,
            SessionRun.title,
            SessionRun.source,
            SessionRun.status,
            func.ts_headline("english", func.coalesce(SessionMessage.content_text, ""), ts_query).label("headline"),
        )
        .join(SessionRun, SessionMessage.session_run_id == SessionRun.id)
        .where(ts_vector.op("@@")(ts_query))
    )

    if request.agent_id:
        search_query = search_query.where(SessionRun.agent_id == request.agent_id)
    if request.source:
        search_query = search_query.where(SessionRun.source == request.source)

    search_query = search_query.order_by(
        func.ts_rank(ts_vector, ts_query).desc()
    ).limit(request.limit)

    result = await db.execute(search_query)
    rows = result.all()

    # Count total matches
    count_query = (
        select(func.count())
        .select_from(SessionMessage)
        .join(SessionRun, SessionMessage.session_run_id == SessionRun.id)
        .where(ts_vector.op("@@")(ts_query))
    )
    if request.agent_id:
        count_query = count_query.where(SessionRun.agent_id == request.agent_id)
    if request.source:
        count_query = count_query.where(SessionRun.source == request.source)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    return SessionRunSearchResponse(
        results=[
            SessionRunSearchResult(
                session_run_id=str(row.session_run_id),
                title=row.title,
                source=row.source,
                status=row.status,
                message_id=str(row.id),
                role=row.role,
                content_text=row.content_text,
                headline=row.headline,
                created_at=row.created_at,
            )
            for row in rows
        ],
        total=total,
        query=query_text,
    )


# =============================================================================
# Audit Endpoint — Verify Hash Chain Integrity
# =============================================================================


def _compute_hash(previous_hash: Optional[str], role: str, content_text: Optional[str], tool_name: Optional[str]) -> str:
    payload = f"{previous_hash or ''}|{role}|{content_text or ''}|{tool_name or ''}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


@router.get("/{session_run_id}/verify", response_model=VerifyIntegrityResponse)
async def verify_session_integrity(session_run_id: UUID, db: DbSession):
    """Verify the hash chain integrity of a session run."""
    result = await db.execute(
        select(SessionRun)
        .where(SessionRun.id == session_run_id)
        .options(selectinload(SessionRun.messages))
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session run {session_run_id} not found",
        )

    errors: List[str] = []
    previous_hash: Optional[str] = None

    for msg in sorted(run.messages, key=lambda m: m.sequence_number):
        expected = _compute_hash(previous_hash, msg.role, msg.content_text, msg.tool_name)
        if msg.message_hash != expected:
            errors.append(
                f"Message #{msg.sequence_number} (id={msg.id}): "
                f"expected hash {expected[:16]}..., got {(msg.message_hash or 'null')[:16]}..."
            )
        previous_hash = msg.message_hash

    # Check final hash matches session integrity_hash
    if run.messages and run.integrity_hash != previous_hash:
        errors.append(
            f"Session integrity_hash mismatch: "
            f"expected {(previous_hash or 'null')[:16]}..., got {(run.integrity_hash or 'null')[:16]}..."
        )

    return VerifyIntegrityResponse(
        session_run_id=str(session_run_id),
        integrity_valid=len(errors) == 0,
        message_count=len(run.messages),
        errors=errors,
    )


# =============================================================================
# Export Endpoint — JSON Download for Compliance
# =============================================================================


@router.get("/{session_run_id}/export")
async def export_session_run(session_run_id: UUID, db: DbSession):
    """Export a session run as a JSON download for compliance."""
    result = await db.execute(
        select(SessionRun)
        .where(SessionRun.id == session_run_id)
        .options(selectinload(SessionRun.messages))
    )
    run = result.scalar_one_or_none()

    if not run:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session run {session_run_id} not found",
        )

    export_data = {
        "session_run": {
            "id": str(run.id),
            "agent_id": str(run.agent_id) if run.agent_id else None,
            "user_id": run.user_id,
            "source": run.source,
            "title": run.title,
            "status": run.status,
            "model": run.model,
            "system_prompt": run.system_prompt,
            "system_prompt_hash": run.system_prompt_hash,
            "message_count": run.message_count,
            "total_input_tokens": run.total_input_tokens,
            "total_output_tokens": run.total_output_tokens,
            "total_cost": float(run.total_cost or 0),
            "total_duration_ms": run.total_duration_ms,
            "integrity_hash": run.integrity_hash,
            "metadata": run.metadata,
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "ended_at": run.ended_at.isoformat() if run.ended_at else None,
            "created_at": run.created_at.isoformat() if run.created_at else None,
        },
        "messages": [
            {
                "id": str(msg.id),
                "sequence_number": msg.sequence_number,
                "role": msg.role,
                "content_text": msg.content_text,
                "content_blocks": msg.content_blocks,
                "tool_name": msg.tool_name,
                "tool_call_id": msg.tool_call_id,
                "input_tokens": msg.input_tokens,
                "output_tokens": msg.output_tokens,
                "cost": float(msg.cost) if msg.cost is not None else None,
                "latency_ms": msg.latency_ms,
                "model": msg.model,
                "stop_reason": msg.stop_reason,
                "raw_request": msg.raw_request,
                "raw_response": msg.raw_response,
                "thinking_content": msg.thinking_content,
                "message_hash": msg.message_hash,
                "metadata": msg.metadata,
                "created_at": msg.created_at.isoformat() if msg.created_at else None,
            }
            for msg in sorted(run.messages, key=lambda m: m.sequence_number)
        ],
        "exported_at": datetime.now(timezone.utc).isoformat(),
    }

    content = json.dumps(export_data, indent=2, ensure_ascii=False, default=str)
    filename = f"session-run-{session_run_id}.json"

    return Response(
        content=content,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
