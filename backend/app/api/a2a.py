"""
PACO A2A Protocol Router

Implements the A2A (Agent-to-Agent) protocol server side:
- Agent Card discovery (GET /.well-known/agent.json)
- JSON-RPC 2.0 task dispatcher (tasks/send, tasks/get, tasks/cancel)
- SSE streaming for real-time task updates
- External agent management endpoints
"""

import json
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import DbSession, get_db, security
from app.db.models import A2ATask as A2ATaskModel, Agent, ApiKey, ExternalA2AAgent
from app.schemas.a2a import (
    A2ATask,
    AgentAuthentication,
    AgentCapabilities,
    AgentCard,
    AgentSkillCard,
    Artifact,
    ExternalAgentCreate,
    ExternalAgentResponse,
    JSONRPCError,
    JSONRPCRequest,
    JSONRPCResponse,
    Message,
    TaskArtifactUpdateEvent,
    TaskCancelParams,
    TaskQueryParams,
    TaskSendParams,
    TaskStatus,
    TaskStatusUpdateEvent,
    TextPart,
)

# Root-level router for /.well-known (no prefix)
router = APIRouter(tags=["A2A Protocol"])

# API-level router for /api/a2a/* endpoints
api_router = APIRouter(prefix="/a2a", tags=["A2A Protocol"])


# =============================================================================
# Auth Helpers
# =============================================================================


async def _validate_a2a_auth(request: Request, db: AsyncSession) -> None:
    """Validate inbound A2A request authentication via API key."""
    if not settings.a2a_require_auth:
        return

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header",
        )

    token = auth_header[7:]  # Strip "Bearer "

    # Check against API keys
    from app.core.security import verify_password

    result = await db.execute(
        select(ApiKey).where(ApiKey.is_active == True)
    )
    api_keys = result.scalars().all()

    for api_key in api_keys:
        if verify_password(token, api_key.key_hash):
            # Update last used
            api_key.last_used_at = datetime.now(timezone.utc)
            await db.commit()
            return

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid API key",
    )


# =============================================================================
# Agent Card Builder
# =============================================================================


def _build_agent_card(agent: Agent) -> AgentCard:
    """Build an A2A Agent Card from a PACO Agent model."""
    skills = []
    for i, skill_data in enumerate(agent.a2a_skills or []):
        skills.append(AgentSkillCard(
            id=skill_data.get("id", f"{agent.name}-skill-{i}"),
            name=skill_data.get("name", agent.name),
            description=skill_data.get("description"),
            tags=skill_data.get("tags"),
            examples=skill_data.get("examples"),
            input_modes=skill_data.get("input_modes", ["text"]),
            output_modes=skill_data.get("output_modes", ["text"]),
        ))

    # If no explicit skills, auto-generate one from agent description
    if not skills:
        skills.append(AgentSkillCard(
            id=f"{agent.name}-default",
            name=agent.display_name or agent.name,
            description=agent.description or f"Agent: {agent.name}",
            input_modes=["text"],
            output_modes=["text"],
        ))

    auth = None
    if settings.a2a_require_auth:
        auth = AgentAuthentication(schemes=["bearer"])

    return AgentCard(
        name=agent.display_name or agent.name,
        description=agent.description,
        url=f"{settings.a2a_base_url}/api/a2a/agents/{agent.name}",
        version=settings.a2a_default_version,
        protocolVersion=settings.a2a_default_version,
        capabilities=AgentCapabilities(
            streaming=True,
            push_notifications=False,
            state_transition_history=True,
        ),
        authentication=auth,
        defaultInputModes=["text"],
        defaultOutputModes=["text"],
        skills=skills,
    )


# =============================================================================
# Agent Card Discovery
# =============================================================================


@router.get("/.well-known/agent.json")
async def get_agent_cards(
    db: DbSession,
    agent: Optional[str] = Query(None, description="Filter by agent name"),
):
    """A2A Agent Card discovery endpoint.

    Returns all A2A-enabled agents, or a specific agent's card if ?agent=name.
    """
    if agent:
        result = await db.execute(
            select(Agent).where(Agent.name == agent, Agent.a2a_enabled == True)
        )
        ag = result.scalar_one_or_none()
        if not ag:
            raise HTTPException(status_code=404, detail=f"A2A agent '{agent}' not found")
        return _build_agent_card(ag).model_dump(by_alias=True)

    # Return all A2A-enabled agents
    result = await db.execute(
        select(Agent).where(Agent.a2a_enabled == True).order_by(Agent.name)
    )
    agents = result.scalars().all()

    if not agents:
        return {"agents": []}

    if len(agents) == 1:
        return _build_agent_card(agents[0]).model_dump(by_alias=True)

    return {
        "agents": [
            _build_agent_card(ag).model_dump(by_alias=True) for ag in agents
        ]
    }


@api_router.get("/agents/{agent_name}/agent.json")
async def get_agent_card_by_name(agent_name: str, db: DbSession):
    """Per-agent Agent Card endpoint."""
    result = await db.execute(
        select(Agent).where(Agent.name == agent_name, Agent.a2a_enabled == True)
    )
    ag = result.scalar_one_or_none()
    if not ag:
        raise HTTPException(status_code=404, detail=f"A2A agent '{agent_name}' not found")
    return _build_agent_card(ag).model_dump(by_alias=True)


# =============================================================================
# JSON-RPC Task Dispatcher
# =============================================================================


async def _handle_tasks_send(
    params: Dict[str, Any],
    agent: Agent,
    db: AsyncSession,
) -> A2ATask:
    """Handle tasks/send — create task, route to agent, return result."""
    send_params = TaskSendParams(**params)

    # Generate task ID if not provided
    task_id = send_params.id or str(uuid.uuid4())

    # Extract text content from message parts
    text_parts = []
    for part in send_params.message.parts:
        if hasattr(part, "text"):
            text_parts.append(part.text)
    prompt = "\n".join(text_parts) or "Hello"

    # Create A2ATask record
    db_task = A2ATaskModel(
        a2a_task_id=task_id,
        direction="inbound",
        agent_id=agent.id,
        status="submitted",
        input_message=send_params.message.model_dump(),
        history=[send_params.message.model_dump()],
        extra_metadata=send_params.metadata or {},
    )
    db.add(db_task)
    await db.commit()
    await db.refresh(db_task)

    # Route to agent process
    db_task.status = "working"
    await db.commit()

    result_text = ""
    try:
        if agent.port:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(
                    f"http://localhost:{agent.port}/api/execute",
                    json={"prompt": prompt},
                )
                if resp.status_code == 200:
                    resp_data = resp.json()
                    result_text = resp_data.get("result", resp_data.get("response", str(resp_data)))
                else:
                    raise Exception(f"Agent returned {resp.status_code}: {resp.text}")
        else:
            result_text = f"Agent '{agent.name}' has no port configured. Cannot route task."
            db_task.status = "failed"
            db_task.error_message = result_text
            await db.commit()
            return A2ATask(
                id=task_id,
                status=TaskStatus.failed,
                history=[send_params.message],
                metadata={"error": result_text},
            )
    except Exception as e:
        db_task.status = "failed"
        db_task.error_message = str(e)
        db_task.completed_at = datetime.now(timezone.utc)
        await db.commit()
        return A2ATask(
            id=task_id,
            status=TaskStatus.failed,
            history=[send_params.message],
            metadata={"error": str(e)},
        )

    # Store result as artifact
    artifact = Artifact(
        name="response",
        parts=[TextPart(text=result_text)],
        index=0,
    )
    agent_message = Message(
        role="agent",
        parts=[TextPart(text=result_text)],
    )

    db_task.status = "completed"
    db_task.artifacts = [artifact.model_dump()]
    db_task.history = [
        send_params.message.model_dump(),
        agent_message.model_dump(),
    ]
    db_task.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return A2ATask(
        id=task_id,
        status=TaskStatus.completed,
        artifacts=[artifact],
        history=[send_params.message, agent_message],
    )


async def _handle_tasks_get(
    params: Dict[str, Any],
    db: AsyncSession,
) -> A2ATask:
    """Handle tasks/get — look up task by ID."""
    query_params = TaskQueryParams(**params)

    result = await db.execute(
        select(A2ATaskModel).where(A2ATaskModel.a2a_task_id == query_params.id)
    )
    db_task = result.scalar_one_or_none()
    if not db_task:
        raise HTTPException(status_code=404, detail=f"Task '{query_params.id}' not found")

    # Reconstruct artifacts and history from JSONB
    artifacts = None
    if db_task.artifacts:
        artifacts = [Artifact(**a) for a in db_task.artifacts]

    history = None
    if db_task.history:
        history_list = db_task.history
        if query_params.history_length and query_params.history_length > 0:
            history_list = history_list[-query_params.history_length:]
        history = [Message(**m) for m in history_list]

    return A2ATask(
        id=db_task.a2a_task_id,
        status=TaskStatus(db_task.status),
        artifacts=artifacts,
        history=history,
    )


async def _handle_tasks_cancel(
    params: Dict[str, Any],
    db: AsyncSession,
) -> A2ATask:
    """Handle tasks/cancel — mark task as canceled."""
    cancel_params = TaskCancelParams(**params)

    result = await db.execute(
        select(A2ATaskModel).where(A2ATaskModel.a2a_task_id == cancel_params.id)
    )
    db_task = result.scalar_one_or_none()
    if not db_task:
        raise HTTPException(status_code=404, detail=f"Task '{cancel_params.id}' not found")

    if db_task.status in ("completed", "failed", "canceled"):
        return A2ATask(
            id=db_task.a2a_task_id,
            status=TaskStatus(db_task.status),
        )

    db_task.status = "canceled"
    db_task.completed_at = datetime.now(timezone.utc)
    await db.commit()

    return A2ATask(
        id=db_task.a2a_task_id,
        status=TaskStatus.canceled,
    )


def _make_jsonrpc_error(id: Any, code: int, message: str) -> JSONResponse:
    """Build a JSON-RPC error response."""
    return JSONResponse(
        content=JSONRPCResponse(
            id=id,
            error=JSONRPCError(code=code, message=message),
        ).model_dump(),
    )


@api_router.post("/agents/{agent_name}")
async def jsonrpc_dispatcher(
    agent_name: str,
    request: Request,
    db: DbSession,
):
    """JSON-RPC 2.0 endpoint for A2A task operations."""
    await _validate_a2a_auth(request, db)

    # Look up agent
    result = await db.execute(
        select(Agent).where(Agent.name == agent_name, Agent.a2a_enabled == True)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        return _make_jsonrpc_error(None, -32001, f"A2A agent '{agent_name}' not found")

    # Parse JSON-RPC request
    try:
        body = await request.json()
        rpc = JSONRPCRequest(**body)
    except Exception as e:
        return _make_jsonrpc_error(None, -32700, f"Parse error: {e}")

    params = rpc.params or {}

    # Dispatch by method
    try:
        if rpc.method == "tasks/send":
            task = await _handle_tasks_send(params, agent, db)
            return JSONResponse(content=JSONRPCResponse(
                id=rpc.id,
                result=task.model_dump(),
            ).model_dump())

        elif rpc.method == "tasks/get":
            task = await _handle_tasks_get(params, db)
            return JSONResponse(content=JSONRPCResponse(
                id=rpc.id,
                result=task.model_dump(),
            ).model_dump())

        elif rpc.method == "tasks/cancel":
            task = await _handle_tasks_cancel(params, db)
            return JSONResponse(content=JSONRPCResponse(
                id=rpc.id,
                result=task.model_dump(),
            ).model_dump())

        elif rpc.method == "tasks/sendSubscribe":
            # For SSE streaming, redirect to the stream endpoint
            task = await _handle_tasks_send(params, agent, db)
            return JSONResponse(content=JSONRPCResponse(
                id=rpc.id,
                result=task.model_dump(),
            ).model_dump())

        else:
            return _make_jsonrpc_error(rpc.id, -32601, f"Method not found: {rpc.method}")

    except HTTPException as e:
        return _make_jsonrpc_error(rpc.id, -32000, e.detail)
    except Exception as e:
        return _make_jsonrpc_error(rpc.id, -32603, f"Internal error: {e}")


# =============================================================================
# SSE Streaming
# =============================================================================


async def _stream_task_execution(
    agent: Agent,
    prompt: str,
    task_id: str,
    db: AsyncSession,
    send_params: TaskSendParams,
) -> AsyncGenerator[str, None]:
    """Stream task execution events as SSE."""
    # Emit initial status
    yield f"data: {TaskStatusUpdateEvent(taskId=task_id, status=TaskStatus.working).model_dump_json(by_alias=True)}\n\n"

    result_text = ""
    try:
        if not agent.port:
            error_event = TaskStatusUpdateEvent(
                taskId=task_id,
                status=TaskStatus.failed,
                message=Message(role="agent", parts=[TextPart(text="Agent has no port configured")]),
                final=True,
            )
            yield f"data: {error_event.model_dump_json(by_alias=True)}\n\n"
            return

        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"http://localhost:{agent.port}/api/execute",
                json={"prompt": prompt},
            )
            if resp.status_code == 200:
                resp_data = resp.json()
                result_text = resp_data.get("result", resp_data.get("response", str(resp_data)))
            else:
                error_event = TaskStatusUpdateEvent(
                    taskId=task_id,
                    status=TaskStatus.failed,
                    message=Message(
                        role="agent",
                        parts=[TextPart(text=f"Agent returned {resp.status_code}")],
                    ),
                    final=True,
                )
                yield f"data: {error_event.model_dump_json(by_alias=True)}\n\n"
                return

    except Exception as e:
        error_event = TaskStatusUpdateEvent(
            taskId=task_id,
            status=TaskStatus.failed,
            message=Message(role="agent", parts=[TextPart(text=str(e))]),
            final=True,
        )
        yield f"data: {error_event.model_dump_json(by_alias=True)}\n\n"
        return

    # Emit artifact
    artifact = Artifact(
        name="response",
        parts=[TextPart(text=result_text)],
        index=0,
        last_chunk=True,
    )
    artifact_event = TaskArtifactUpdateEvent(
        taskId=task_id,
        artifact=artifact,
    )
    yield f"data: {artifact_event.model_dump_json(by_alias=True)}\n\n"

    # Emit completion
    complete_event = TaskStatusUpdateEvent(
        taskId=task_id,
        status=TaskStatus.completed,
        final=True,
    )
    yield f"data: {complete_event.model_dump_json(by_alias=True)}\n\n"


@api_router.post("/agents/{agent_name}/stream")
async def stream_task(
    agent_name: str,
    request: Request,
    db: DbSession,
):
    """SSE endpoint for streaming A2A task responses."""
    await _validate_a2a_auth(request, db)

    result = await db.execute(
        select(Agent).where(Agent.name == agent_name, Agent.a2a_enabled == True)
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail=f"A2A agent '{agent_name}' not found")

    body = await request.json()
    rpc = JSONRPCRequest(**body)
    params = rpc.params or {}
    send_params = TaskSendParams(**params)

    task_id = send_params.id or str(uuid.uuid4())

    # Extract text
    text_parts = []
    for part in send_params.message.parts:
        if hasattr(part, "text"):
            text_parts.append(part.text)
    prompt = "\n".join(text_parts) or "Hello"

    # Create task record
    db_task = A2ATaskModel(
        a2a_task_id=task_id,
        direction="inbound",
        agent_id=agent.id,
        status="working",
        input_message=send_params.message.model_dump(),
        history=[send_params.message.model_dump()],
    )
    db.add(db_task)
    await db.commit()

    return StreamingResponse(
        _stream_task_execution(agent, prompt, task_id, db, send_params),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# External Agent Management (Outbound)
# =============================================================================


@api_router.post("/external-agents", response_model=ExternalAgentResponse, status_code=201)
async def register_external_agent(
    req: ExternalAgentCreate,
    db: DbSession,
):
    """Register an external A2A agent URL."""
    ext_agent = ExternalA2AAgent(
        url=req.url,
        name=req.name,
        description=req.description,
    )
    db.add(ext_agent)
    await db.commit()
    await db.refresh(ext_agent)

    return ExternalAgentResponse(
        id=str(ext_agent.id),
        url=ext_agent.url,
        name=ext_agent.name,
        description=ext_agent.description,
        created_at=ext_agent.created_at,
    )


@api_router.get("/external-agents", response_model=List[ExternalAgentResponse])
async def list_external_agents(db: DbSession):
    """List registered external A2A agents."""
    result = await db.execute(
        select(ExternalA2AAgent).order_by(ExternalA2AAgent.created_at.desc())
    )
    agents = result.scalars().all()
    return [
        ExternalAgentResponse(
            id=str(ag.id),
            url=ag.url,
            name=ag.name,
            description=ag.description,
            agent_card=AgentCard(**ag.agent_card) if ag.agent_card else None,
            last_discovered_at=ag.last_discovered_at,
            created_at=ag.created_at,
        )
        for ag in agents
    ]


@api_router.delete("/external-agents/{agent_id}", status_code=204)
async def remove_external_agent(agent_id: str, db: DbSession):
    """Remove an external A2A agent registration."""
    from uuid import UUID as PyUUID
    result = await db.execute(
        select(ExternalA2AAgent).where(ExternalA2AAgent.id == PyUUID(agent_id))
    )
    ext_agent = result.scalar_one_or_none()
    if not ext_agent:
        raise HTTPException(status_code=404, detail="External agent not found")
    await db.delete(ext_agent)
    await db.commit()


@api_router.post("/external-agents/{agent_id}/discover", response_model=ExternalAgentResponse)
async def discover_external_agent(agent_id: str, db: DbSession):
    """Refresh Agent Card from a remote A2A agent."""
    from uuid import UUID as PyUUID
    from app.services.a2a_client import A2AClient

    result = await db.execute(
        select(ExternalA2AAgent).where(ExternalA2AAgent.id == PyUUID(agent_id))
    )
    ext_agent = result.scalar_one_or_none()
    if not ext_agent:
        raise HTTPException(status_code=404, detail="External agent not found")

    client = A2AClient()
    try:
        card = await client.discover(ext_agent.url)
        ext_agent.agent_card = card.model_dump(by_alias=True)
        ext_agent.name = card.name
        ext_agent.description = card.description
        ext_agent.last_discovered_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(ext_agent)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Discovery failed: {e}")

    return ExternalAgentResponse(
        id=str(ext_agent.id),
        url=ext_agent.url,
        name=ext_agent.name,
        description=ext_agent.description,
        agent_card=AgentCard(**ext_agent.agent_card) if ext_agent.agent_card else None,
        last_discovered_at=ext_agent.last_discovered_at,
        created_at=ext_agent.created_at,
    )


class SendToExternalRequest(BaseModel):
    message: str
    metadata: Optional[Dict[str, Any]] = None


@api_router.post("/external-agents/{agent_id}/send")
async def send_to_external_agent(
    agent_id: str,
    req: SendToExternalRequest,
    db: DbSession,
):
    """Send a task to an external A2A agent."""
    from uuid import UUID as PyUUID
    from app.services.a2a_client import A2AClient

    result = await db.execute(
        select(ExternalA2AAgent).where(ExternalA2AAgent.id == PyUUID(agent_id))
    )
    ext_agent = result.scalar_one_or_none()
    if not ext_agent:
        raise HTTPException(status_code=404, detail="External agent not found")

    # Determine the agent URL (from agent_card or base URL)
    agent_url = ext_agent.url
    if ext_agent.agent_card and ext_agent.agent_card.get("url"):
        agent_url = ext_agent.agent_card["url"]

    client = A2AClient()
    try:
        task = await client.send_task(agent_url, req.message, metadata=req.metadata)

        # Track as outbound A2A task
        db_task = A2ATaskModel(
            a2a_task_id=task.id,
            direction="outbound",
            status=task.status.value if hasattr(task.status, "value") else task.status,
            input_message={"role": "user", "parts": [{"type": "text", "text": req.message}]},
            artifacts=[a.model_dump() for a in task.artifacts] if task.artifacts else [],
            remote_agent_url=agent_url,
            remote_agent_name=ext_agent.name,
        )
        db.add(db_task)
        await db.commit()

        return task.model_dump()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to send task: {e}")
