"""
Session Capture Service — fire-and-forget conversation recording.

Captures full conversation replay data (messages, tool calls, responses)
without ever breaking the main application flow. All methods return None/False
on failure and log the error.

Usage:
    from app.services.session_capture import session_capture

    session_id = await session_capture.start_session(agent_id=..., source="playground", ...)
    await session_capture.append_message(session_id, role="user", content_text="Hello")
    await session_capture.end_session(session_id, status="completed")
"""

import hashlib
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from sqlalchemy import func, select

from app.db.models import Execution, SessionMessage, SessionRun
from app.db.session import async_session_maker

logger = logging.getLogger("paco.session_capture")


def _hash_chain(previous_hash: Optional[str], role: str, content_text: Optional[str], tool_name: Optional[str]) -> str:
    """Compute SHA-256 hash chain link for tamper detection."""
    payload = f"{previous_hash or ''}|{role}|{content_text or ''}|{tool_name or ''}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _hash_system_prompt(prompt: Optional[str]) -> Optional[str]:
    """SHA-256 hash of system prompt for integrity verification."""
    if not prompt:
        return None
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()


class SessionCaptureService:
    """Fire-and-forget session capture — errors never propagate to callers."""

    async def start_session(
        self,
        *,
        agent_id: Optional[str] = None,
        user_id: Optional[str] = None,
        source: str = "playground",
        title: Optional[str] = None,
        system_prompt: Optional[str] = None,
        model: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[UUID]:
        """Start a new session run. Returns the session ID or None on failure."""
        try:
            session_id = uuid4()
            async with async_session_maker() as db:
                run = SessionRun(
                    id=session_id,
                    agent_id=UUID(agent_id) if agent_id else None,
                    user_id=user_id,
                    source=source,
                    title=title,
                    system_prompt=system_prompt,
                    system_prompt_hash=_hash_system_prompt(system_prompt),
                    model=model,
                    status="active",
                    extra_metadata=metadata or {},
                    started_at=datetime.now(timezone.utc),
                )
                db.add(run)
                await db.commit()
            logger.debug("Session started: %s", session_id)
            return session_id
        except Exception as e:
            logger.warning("Failed to start session: %s", e)
            return None

    async def resume_session(self, session_run_id: UUID) -> Optional[UUID]:
        """Resume an existing active session. Returns session ID if valid, None otherwise."""
        try:
            async with async_session_maker() as db:
                run = await db.get(SessionRun, session_run_id)
                if run is None:
                    return None
                if run.status in ("error", "cancelled"):
                    return None
                if run.status == "completed":
                    run.status = "active"
                    run.ended_at = None
                    await db.commit()
                return session_run_id
        except Exception as e:
            logger.warning("Failed to resume session %s: %s", session_run_id, e)
            return None

    async def append_message(
        self,
        session_run_id: Optional[UUID],
        *,
        role: str,
        content_text: Optional[str] = None,
        content_blocks: Optional[Any] = None,
        tool_name: Optional[str] = None,
        tool_call_id: Optional[str] = None,
        input_tokens: Optional[int] = None,
        output_tokens: Optional[int] = None,
        cost: Optional[float] = None,
        latency_ms: Optional[int] = None,
        model: Optional[str] = None,
        stop_reason: Optional[str] = None,
        raw_request: Optional[Dict[str, Any]] = None,
        raw_response: Optional[Dict[str, Any]] = None,
        thinking_content: Optional[str] = None,
        execution_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[UUID]:
        """Append a message to a session. Returns message ID or None on failure."""
        if session_run_id is None:
            return None
        try:
            message_id = uuid4()
            async with async_session_maker() as db:
                # Get current max sequence_number and latest hash
                result = await db.execute(
                    select(
                        func.coalesce(func.max(SessionMessage.sequence_number), 0),
                    ).where(SessionMessage.session_run_id == session_run_id)
                )
                max_seq = result.scalar() or 0

                # Get previous hash for chain
                if max_seq > 0:
                    hash_result = await db.execute(
                        select(SessionMessage.message_hash)
                        .where(
                            SessionMessage.session_run_id == session_run_id,
                            SessionMessage.sequence_number == max_seq,
                        )
                    )
                    previous_hash = hash_result.scalar()
                else:
                    previous_hash = None

                seq = max_seq + 1
                message_hash = _hash_chain(previous_hash, role, content_text, tool_name)

                msg = SessionMessage(
                    id=message_id,
                    session_run_id=session_run_id,
                    execution_id=UUID(execution_id) if execution_id else None,
                    sequence_number=seq,
                    role=role,
                    content_text=content_text,
                    content_blocks=content_blocks,
                    tool_name=tool_name,
                    tool_call_id=tool_call_id,
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                    cost=cost,
                    latency_ms=latency_ms,
                    model=model,
                    stop_reason=stop_reason,
                    raw_request=raw_request,
                    raw_response=raw_response,
                    thinking_content=thinking_content,
                    message_hash=message_hash,
                    extra_metadata=metadata or {},
                )
                db.add(msg)

                # Update session aggregates
                run = await db.get(SessionRun, session_run_id)
                if run:
                    run.message_count = seq
                    run.integrity_hash = message_hash
                    if input_tokens:
                        run.total_input_tokens = (run.total_input_tokens or 0) + input_tokens
                    if output_tokens:
                        run.total_output_tokens = (run.total_output_tokens or 0) + output_tokens
                    if cost:
                        run.total_cost = float(run.total_cost or 0) + cost
                    if latency_ms:
                        run.total_duration_ms = (run.total_duration_ms or 0) + latency_ms

                await db.commit()
            return message_id
        except Exception as e:
            logger.warning("Failed to append message to session %s: %s", session_run_id, e)
            return None

    async def append_messages_batch(
        self,
        session_run_id: Optional[UUID],
        messages: List[Dict[str, Any]],
    ) -> int:
        """Append multiple messages to a session. Returns count of messages appended."""
        if session_run_id is None or not messages:
            return 0
        count = 0
        for msg_data in messages:
            result = await self.append_message(
                session_run_id,
                role=msg_data.get("role", "user"),
                content_text=msg_data.get("content_text"),
                content_blocks=msg_data.get("content_blocks"),
                tool_name=msg_data.get("tool_name"),
                tool_call_id=msg_data.get("tool_call_id"),
                input_tokens=msg_data.get("input_tokens"),
                output_tokens=msg_data.get("output_tokens"),
                cost=msg_data.get("cost"),
                latency_ms=msg_data.get("latency_ms"),
                model=msg_data.get("model"),
                stop_reason=msg_data.get("stop_reason"),
                raw_request=msg_data.get("raw_request"),
                raw_response=msg_data.get("raw_response"),
                thinking_content=msg_data.get("thinking_content"),
                execution_id=msg_data.get("execution_id"),
                extra_metadata=msg_data.get("metadata"),
            )
            if result:
                count += 1
        return count

    async def end_session(
        self,
        session_run_id: Optional[UUID],
        *,
        status: str = "completed",
        error_message: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> bool:
        """Finalize a session run. Returns True on success."""
        if session_run_id is None:
            return False
        try:
            async with async_session_maker() as db:
                run = await db.get(SessionRun, session_run_id)
                if run:
                    run.status = status
                    run.ended_at = datetime.now(timezone.utc)
                    if error_message:
                        run.extra_metadata = {**(run.extra_metadata or {}), "error_message": error_message}
                    if metadata:
                        run.extra_metadata = {**(run.extra_metadata or {}), **metadata}
                    await db.commit()
            logger.debug("Session ended: %s (status=%s)", session_run_id, status)
            return True
        except Exception as e:
            logger.warning("Failed to end session %s: %s", session_run_id, e)
            return False

    async def link_execution(
        self,
        session_run_id: Optional[UUID],
        execution_id: str,
    ) -> bool:
        """Link an execution to a session run. Returns True on success."""
        if session_run_id is None:
            return False
        try:
            async with async_session_maker() as db:
                execution = await db.get(Execution, UUID(execution_id))
                if execution:
                    execution.session_run_id = session_run_id
                    await db.commit()
            return True
        except Exception as e:
            logger.warning("Failed to link execution %s to session %s: %s", execution_id, session_run_id, e)
            return False


# Singleton instance
session_capture = SessionCaptureService()
