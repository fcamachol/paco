"""
PACO Playground API

SSE endpoints for testing agents and infrastructures in a sandbox environment.
Streams step-by-step execution events back to the frontend for visual animation.
"""

import asyncio
import json
import os
import re
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any, AsyncGenerator, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter(prefix="/playground", tags=["Playground"])


# =============================================================================
# Pydantic Schemas
# =============================================================================


class AgentRunRequest(BaseModel):
    message: str
    agent_config: Dict[str, Any]  # Agent node config from canvas
    conversation_history: List[Dict[str, str]] = []  # For multi-turn
    tools_config: List[Dict[str, Any]] = []  # Tool/MCP configs from connected nodes


class InfraRunRequest(BaseModel):
    message: str
    infrastructure_id: str
    conversation_history: List[Dict[str, str]] = []


class StepEvent(BaseModel):
    step: str  # classification, routing, agent_start, tool_call, tool_result, response, error
    agent_id: Optional[str] = None
    tool_name: Optional[str] = None
    data: Dict[str, Any] = {}
    timestamp: str = ""
    duration_ms: Optional[float] = None

    def model_post_init(self, __context: Any) -> None:
        if not self.timestamp:
            self.timestamp = datetime.now(timezone.utc).isoformat()


# =============================================================================
# Helpers
# =============================================================================


def format_sse(event: StepEvent) -> str:
    """Format a StepEvent as an SSE data line."""
    return f"data: {event.model_dump_json()}\n\n"


def make_step(step: str, **kwargs) -> StepEvent:
    return StepEvent(step=step, **kwargs)


def _get_api_key() -> str:
    """Get Anthropic API key from settings (loaded from .env by pydantic-settings)."""
    from app.core.config import settings
    return settings.anthropic_api_key


# =============================================================================
# Execution Persistence
# =============================================================================

# Approximate pricing per 1M tokens (input, output) by model family
_MODEL_PRICING = {
    "claude-sonnet-4": (3.0, 15.0),
    "claude-haiku-3": (0.80, 4.0),
    "claude-haiku-4": (0.80, 4.0),
    "claude-opus-4": (15.0, 75.0),
}


def _estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Estimate USD cost from model name and token counts."""
    for prefix, (inp_price, out_price) in _MODEL_PRICING.items():
        if prefix in model:
            return (input_tokens * inp_price + output_tokens * out_price) / 1_000_000
    # Default to sonnet pricing
    return (input_tokens * 3.0 + output_tokens * 15.0) / 1_000_000


async def _persist_execution(
    *,
    agent_name: str,
    model: str,
    input_tokens: int,
    output_tokens: int,
    duration_ms: float,
    status: str,
    start_timestamp: float,
    error_message: Optional[str] = None,
    playground_type: str,
    message: str,
    tool_calls_data: Optional[List[Dict[str, Any]]] = None,
) -> None:
    """Persist a playground execution to the executions table."""
    try:
        from app.db.session import async_session_maker
        from app.db.models import Execution, ToolCall as ToolCallRecord

        cost = _estimate_cost(model, input_tokens, output_tokens)
        started_at = datetime.fromtimestamp(start_timestamp, tz=timezone.utc)
        ended_at = datetime.now(timezone.utc)
        execution_id = uuid.uuid4()

        async with async_session_maker() as db:
            execution = Execution(
                id=execution_id,
                agent_id=None,
                started_at=started_at,
                ended_at=ended_at,
                duration_ms=int(duration_ms),
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_cost=cost,
                model=model,
                status=status,
                error_message=error_message,
                extra_metadata={
                    "source": "playground",
                    "playground_type": playground_type,
                    "agent_name": agent_name,
                    "message_preview": message[:200],
                },
            )
            db.add(execution)

            for tc in (tool_calls_data or []):
                db.add(ToolCallRecord(
                    id=uuid.uuid4(),
                    execution_id=execution_id,
                    tool_name=tc["tool_name"],
                    input=tc.get("input", {}),
                    output=tc.get("output"),
                    latency_ms=tc.get("latency_ms"),
                    success=tc.get("success", True),
                    error_message=tc.get("error_message"),
                    called_at=tc.get("called_at", ended_at),
                ))

            await db.commit()
    except Exception:
        pass  # Never break the SSE stream for persistence failures


# =============================================================================
# Agent Run Endpoint
# =============================================================================


async def agent_event_generator(request: AgentRunRequest) -> AsyncGenerator[str, None]:
    """
    Execute a single agent with the provided config and stream step events.

    This simulates the agent execution pipeline:
    1. agent_start - Agent begins processing
    2. tool_call - If tools are configured, simulate tool invocations
    3. tool_result - Results from tool calls
    4. response - Final agent response
    """
    start_time = time.time()
    agent_name = request.agent_config.get("name", request.agent_config.get("label", "Agent"))
    model = request.agent_config.get("model", request.agent_config.get("config", {}).get("model_client", {}).get("config", {}).get("model", "claude-sonnet-4-5-20250929"))

    # 1. Emit agent_start
    yield format_sse(make_step(
        "agent_start",
        agent_id=agent_name,
        data={"agent_name": agent_name, "model": model, "message": request.message},
    ))

    try:
        # Build messages for Claude API call
        messages = []
        for msg in request.conversation_history:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
        messages.append({"role": "user", "content": request.message})

        # Extract system prompt
        system_prompt = (
            request.agent_config.get("systemPrompt")
            or request.agent_config.get("system_prompt")
            or request.agent_config.get("config", {}).get("system_message", "")
            or "You are a helpful assistant."
        )

        # Extract tools from config
        tools_payload = []
        for tool_config in request.tools_config:
            tool_name = tool_config.get("name") or tool_config.get("config", {}).get("name", "")
            tool_desc = tool_config.get("description") or tool_config.get("config", {}).get("description", "")
            tool_schema = tool_config.get("input_schema") or tool_config.get("config", {}).get("input_schema", {})
            if tool_name:
                tools_payload.append({
                    "name": tool_name,
                    "description": tool_desc or f"Tool: {tool_name}",
                    "input_schema": tool_schema if tool_schema else {"type": "object", "properties": {}},
                })

        # Call Claude API via Anthropic
        api_key = os.environ.get("ANTHROPIC_API_KEY", "") or _get_api_key()
        if not api_key:
            yield format_sse(make_step(
                "error",
                agent_id=agent_name,
                data={"error": "ANTHROPIC_API_KEY not configured. Set it in backend .env to enable playground."},
            ))
            return

        # Build the API request
        api_body: Dict[str, Any] = {
            "model": model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": messages,
        }
        if tools_payload:
            api_body["tools"] = tools_payload

        async with httpx.AsyncClient(timeout=120.0) as client:
            api_response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=api_body,
            )

            if api_response.status_code != 200:
                error_detail = api_response.text
                yield format_sse(make_step(
                    "error",
                    agent_id=agent_name,
                    data={"error": f"Claude API error ({api_response.status_code}): {error_detail}"},
                ))
                return

            result = api_response.json()

        # Process response content blocks
        response_text = ""
        tool_uses = []

        for block in result.get("content", []):
            if block["type"] == "text":
                response_text += block["text"]
            elif block["type"] == "tool_use":
                tool_uses.append(block)

        # 2. Emit tool calls if any
        for tool_use in tool_uses:
            tool_start = time.time()
            yield format_sse(make_step(
                "tool_call",
                agent_id=agent_name,
                tool_name=tool_use["name"],
                data={"input": tool_use.get("input", {}), "tool_use_id": tool_use["id"]},
            ))

            # Small delay for visual effect
            await asyncio.sleep(0.3)

            # 3. Emit tool result (simulated - we don't actually execute tools in sandbox)
            tool_duration = (time.time() - tool_start) * 1000
            yield format_sse(make_step(
                "tool_result",
                agent_id=agent_name,
                tool_name=tool_use["name"],
                data={
                    "output": {"note": "Tool execution simulated in sandbox mode"},
                    "tool_use_id": tool_use["id"],
                },
                duration_ms=tool_duration,
            ))

        # If there were tool calls but no text response, note it
        if tool_uses and not response_text:
            response_text = "(Agent requested tool calls — in production, tools would execute and the agent would continue)"

        # 4. Emit response
        total_duration = (time.time() - start_time) * 1000
        usage = result.get("usage", {})
        yield format_sse(make_step(
            "response",
            agent_id=agent_name,
            data={
                "text": response_text,
                "input_tokens": usage.get("input_tokens", 0),
                "output_tokens": usage.get("output_tokens", 0),
                "model": result.get("model", model),
                "stop_reason": result.get("stop_reason", ""),
            },
            duration_ms=total_duration,
        ))

        # Persist playground execution
        await _persist_execution(
            agent_name=agent_name,
            model=result.get("model", model),
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            duration_ms=total_duration,
            status="success",
            playground_type="agent",
            message=request.message,
            start_timestamp=start_time,
        )

    except Exception as e:
        yield format_sse(make_step(
            "error",
            agent_id=agent_name,
            data={"error": str(e), "traceback": traceback.format_exc()},
        ))
        await _persist_execution(
            agent_name=agent_name,
            model=model,
            input_tokens=0,
            output_tokens=0,
            duration_ms=(time.time() - start_time) * 1000,
            status="error",
            error_message=str(e),
            playground_type="agent",
            message=request.message,
            start_timestamp=start_time,
        )


@router.post("/agent/run")
async def run_agent(request: AgentRunRequest):
    """
    Run a single agent with a test message, streaming step events via SSE.

    Takes the agent config from the builder canvas and executes it against
    the Claude API, streaming events as they happen.
    """
    return StreamingResponse(
        agent_event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# =============================================================================
# Infrastructure Sandbox Helpers
# =============================================================================


async def sandbox_classify(
    message: str,
    orchestrator: Any,
    agents: List[Any],
    api_key: str,
) -> Dict[str, Any]:
    """
    In-process intent classification using the orchestrator's DB config.

    1. Keyword matching via orchestrator.keyword_map
    2. LLM fallback via Claude API with classification_prompt
    3. Final fallback to orchestrator.fallback_agent
    """
    message_lower = message.lower()
    valid_codes = {a.category_code for a in agents}

    # --- Step 1: Keyword matching ---
    keyword_map: Dict[str, List[str]] = orchestrator.keyword_map or {}
    scores: Dict[str, int] = {}
    for code, keywords in keyword_map.items():
        if code not in valid_codes:
            continue
        for kw in keywords:
            if kw.lower() in message_lower:
                scores[code] = scores.get(code, 0) + 1

    if scores:
        best = max(scores, key=scores.get)
        total = sum(scores.values())
        # Clear winner if best has >50% of total keyword hits
        if scores[best] / total > 0.5:
            return {
                "category": best,
                "confidence": round(scores[best] / total, 2),
                "method": "keyword",
            }

    # --- Step 2: LLM classification ---
    classification_prompt = orchestrator.classification_prompt
    if classification_prompt and api_key:
        agent_descriptions = "\n".join(
            f"- {a.category_code}: {a.display_name or a.agent_id_slug} — {a.description or 'No description'}"
            for a in agents
        )
        system = (
            f"{classification_prompt}\n\n"
            f"Available agents:\n{agent_descriptions}\n\n"
            f"Respond with ONLY the category code that best matches the user's message. "
            f"Valid codes: {', '.join(sorted(valid_codes))}"
        )
        model = getattr(orchestrator, "classification_model", None) or "claude-sonnet-4-5-20250929"
        temperature = float(getattr(orchestrator, "classification_temperature", None) or 0.1)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": 50,
                        "temperature": temperature,
                        "system": system,
                        "messages": [{"role": "user", "content": message}],
                    },
                )
                if resp.status_code == 200:
                    llm_result = resp.json()
                    raw = "".join(
                        b["text"] for b in llm_result.get("content", []) if b.get("type") == "text"
                    ).strip().upper()
                    # Extract first valid code from LLM response
                    for code in valid_codes:
                        if code.upper() in raw:
                            return {"category": code, "confidence": 0.85, "method": "llm"}
        except Exception:
            pass  # Fall through to fallback

    # --- Step 3: Fallback agent ---
    fallback = orchestrator.fallback_agent
    if fallback and fallback in valid_codes:
        return {"category": fallback, "confidence": 0.5, "method": "fallback"}

    # Last resort: first agent
    return {"category": agents[0].category_code if agents else "unknown", "confidence": 0.3, "method": "fallback"}


def build_agent_system_prompt(agent: Any) -> str:
    """Assemble a full system prompt from InfraAgent.system_prompts JSONB."""
    prompts: Dict[str, Any] = agent.system_prompts or {}
    parts = []
    for key in ("main_prompt", "knowledge_base", "base_rules"):
        val = prompts.get(key)
        if val and isinstance(val, str) and val.strip():
            parts.append(val.strip())
    if parts:
        return "\n\n".join(parts)
    # Fallback to display_name + description
    name = agent.display_name or agent.agent_id_slug
    desc = agent.description or ""
    return f"You are {name}. {desc}".strip()


def _parse_params_to_schema(params_raw: Any) -> Dict[str, Any]:
    """Convert a tools_config 'params' value into a valid JSON Schema.

    The DB may store params as:
    - A dict (already a JSON Schema) → use as-is if it has "type"
    - A string like "ctx: RunContext[Deps], placa: str" → parse param names
    - Anything else → return minimal schema
    """
    empty = {"type": "object", "properties": {}}
    if not params_raw:
        return empty
    if isinstance(params_raw, dict) and params_raw.get("type"):
        return params_raw
    if isinstance(params_raw, str):
        # Parse "param1: Type1, param2: Type2" into property names
        props = {}
        for part in params_raw.split(","):
            part = part.strip()
            if not part:
                continue
            param_name = part.split(":")[0].strip()
            # Skip common framework params (ctx, self, etc.)
            if param_name in ("ctx", "self", "cls", ""):
                continue
            props[param_name] = {"type": "string", "description": f"Parameter: {param_name}"}
        return {"type": "object", "properties": props}
    return empty


def _execute_tool(function_code: str, tool_name: str, tool_input: Dict[str, Any]) -> Dict[str, Any]:
    """Execute a tool's function_code from the DB with the given input.

    Compiles the function_code, strips the @tool decorator, executes the function,
    and returns its result. Falls back gracefully on any error.
    """
    try:
        # Build a module namespace with common imports the tools expect
        namespace: Dict[str, Any] = {
            "__builtins__": __builtins__,
            "datetime": datetime,
            "Any": Any,
        }
        # Add a no-op @tool decorator so the code compiles
        namespace["tool"] = lambda f: f

        # Add a dummy logger
        import logging
        namespace["logging"] = logging
        namespace["logger"] = logging.getLogger(f"sandbox.{tool_name}")

        # Add a dummy get_settings
        namespace["get_settings"] = lambda: type("S", (), {})()

        # Strip the @tool decorator line and compile
        code_lines = function_code.strip().split("\n")
        clean_lines = [line for line in code_lines if not line.strip().startswith("@tool")]
        clean_code = "\n".join(clean_lines)

        exec(compile(clean_code, f"<tool:{tool_name}>", "exec"), namespace)

        if tool_name not in namespace:
            return {"error": f"Function '{tool_name}' not found after exec"}

        func = namespace[tool_name]
        result = func(**tool_input)
        return result if isinstance(result, dict) else {"result": str(result)}
    except Exception as e:
        return {"error": f"Tool execution failed: {str(e)}"}


def _find_tool_code(agent: Any, tool_name: str) -> Optional[str]:
    """Find the function_code for a tool by name from the agent's tools_config."""
    for tc in (agent.tools_config or []):
        if tc.get("name") == tool_name:
            return tc.get("function_code")
    return None


def build_tools_payload(agent: Any) -> List[Dict[str, Any]]:
    """Convert InfraAgent.tools_config JSONB into Claude API tool format."""
    tools_config: List[Dict[str, Any]] = agent.tools_config or []
    tools = []
    for tc in tools_config:
        name = tc.get("name")
        if not name:
            continue
        # Prefer input_schema if it's a valid dict with "type", otherwise parse params
        raw_schema = tc.get("input_schema")
        if isinstance(raw_schema, dict) and raw_schema.get("type"):
            schema = raw_schema
        else:
            schema = _parse_params_to_schema(tc.get("params"))
        tools.append({
            "name": name,
            "description": tc.get("description") or f"Tool: {name}",
            "input_schema": schema,
        })
    return tools


# =============================================================================
# Hive Infrastructure Run
# =============================================================================


async def hive_infra_event_generator(
    request: InfraRunRequest,
    infra: Any,
) -> AsyncGenerator[str, None]:
    """
    Execute a hive-type infrastructure: decompose → assign → execute agents → aggregate → respond.

    SSE event sequence:
    decomposition → task_assigned (per agent) → agent_start → [tool_call → tool_result]* → aggregation → response
    """
    start_time = time.time()
    tool_calls_data: List[Dict[str, Any]] = []
    total_input_tokens = 0
    total_output_tokens = 0
    coordinator_model = "claude-sonnet-4-5-20250929"

    try:
        coordinator = infra.hive_coordinator
        if not coordinator:
            yield format_sse(make_step(
                "error",
                data={"error": "No coordinator configured for this hive infrastructure"},
            ))
            return

        agents = list(infra.agents) if infra.agents else []
        if not agents:
            yield format_sse(make_step(
                "error",
                data={"error": "No agents configured in this infrastructure"},
            ))
            return

        api_key = os.environ.get("ANTHROPIC_API_KEY", "") or _get_api_key()
        if not api_key:
            yield format_sse(make_step(
                "error",
                data={"error": "ANTHROPIC_API_KEY not configured. Set it in backend .env to enable playground."},
            ))
            return

        coordinator_model = getattr(coordinator, "coordinator_model", None) or "claude-sonnet-4-5-20250929"
        coordinator_temperature = float(getattr(coordinator, "coordinator_temperature", None) or 0.1)

        # --- 1. Decomposition ---
        decomp_start = time.time()
        yield format_sse(make_step(
            "decomposition",
            data={"message": request.message, "agent_count": len(agents)},
        ))

        agent_descriptions = "\n".join(
            f"- {a.agent_id_slug}: {a.description or a.display_name or a.agent_id_slug}"
            for a in agents
        )
        decomp_system = coordinator.decomposition_prompt or (
            "You are a task coordinator. Decompose the user's message into tasks for the available agents.\n"
            "Each task should be assigned to the most appropriate agent.\n\n"
            f"Available agents:\n{agent_descriptions}\n\n"
            "Respond with ONLY a JSON array of tasks, no other text:\n"
            '[{"task": "description of what to do", "agent_slug": "slug-of-agent"}]'
        )
        if coordinator.decomposition_prompt:
            decomp_system = f"{coordinator.decomposition_prompt}\n\nAvailable agents:\n{agent_descriptions}\n\n" \
                "Respond with ONLY a JSON array of tasks, no other text:\n" \
                '[{"task": "description of what to do", "agent_slug": "slug-of-agent"}]'

        valid_slugs = {a.agent_id_slug for a in agents}

        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                decomp_resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": coordinator_model,
                        "max_tokens": 1024,
                        "temperature": coordinator_temperature,
                        "system": decomp_system,
                        "messages": [{"role": "user", "content": request.message}],
                    },
                )

            tasks = []
            if decomp_resp.status_code == 200:
                decomp_result = decomp_resp.json()
                usage = decomp_result.get("usage", {})
                total_input_tokens += usage.get("input_tokens", 0)
                total_output_tokens += usage.get("output_tokens", 0)

                raw_text = "".join(
                    b["text"] for b in decomp_result.get("content", []) if b.get("type") == "text"
                ).strip()
                # Extract JSON array from response
                json_match = re.search(r'\[.*\]', raw_text, re.DOTALL)
                if json_match:
                    tasks = json.loads(json_match.group())
                    # Validate agent slugs
                    tasks = [
                        t for t in tasks
                        if isinstance(t, dict) and t.get("agent_slug") in valid_slugs
                    ]
        except Exception:
            tasks = []

        # Fallback: single task to first agent
        if not tasks:
            tasks = [{"task": request.message, "agent_slug": agents[0].agent_id_slug}]

        decomp_duration = (time.time() - decomp_start) * 1000
        yield format_sse(make_step(
            "decomposition",
            data={
                "tasks": tasks,
                "task_count": len(tasks),
            },
            duration_ms=decomp_duration,
        ))

        # --- 2. Task Assignment ---
        for task_item in tasks:
            yield format_sse(make_step(
                "task_assigned",
                agent_id=task_item["agent_slug"],
                data={
                    "task": task_item["task"],
                    "agent_slug": task_item["agent_slug"],
                },
            ))

        # --- 3. Agent Execution ---
        agent_responses: List[Dict[str, Any]] = []

        for task_item in tasks:
            slug = task_item["agent_slug"]
            task_text = task_item["task"]

            matched_agent = None
            for agent in agents:
                if agent.agent_id_slug == slug:
                    matched_agent = agent
                    break
            if not matched_agent:
                matched_agent = agents[0]

            agent_name = matched_agent.display_name or matched_agent.agent_id_slug
            model = "claude-sonnet-4-5-20250929"

            yield format_sse(make_step(
                "agent_start",
                agent_id=matched_agent.agent_id_slug,
                data={"agent_name": agent_name, "model": model, "task": task_text},
            ))

            # Build messages
            messages = []
            for msg in request.conversation_history:
                messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
            messages.append({"role": "user", "content": task_text})

            system_prompt = build_agent_system_prompt(matched_agent)
            tools_payload = build_tools_payload(matched_agent)

            api_body: Dict[str, Any] = {
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": messages,
            }
            if tools_payload:
                api_body["tools"] = tools_payload

            try:
                async with httpx.AsyncClient(timeout=120.0) as client:
                    api_response = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={
                            "x-api-key": api_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json=api_body,
                    )

                    if api_response.status_code != 200:
                        yield format_sse(make_step(
                            "error",
                            agent_id=matched_agent.agent_id_slug,
                            data={"error": f"Claude API error ({api_response.status_code}): {api_response.text}"},
                        ))
                        agent_responses.append({"agent": agent_name, "slug": slug, "text": "(error)", "input_tokens": 0, "output_tokens": 0})
                        continue

                    api_result = api_response.json()

                # Process response
                response_text = ""
                tool_uses = []
                for block in api_result.get("content", []):
                    if block["type"] == "text":
                        response_text += block["text"]
                    elif block["type"] == "tool_use":
                        tool_uses.append(block)

                # Tool execution loop
                if tool_uses:
                    tool_results_for_api = []
                    for tool_use in tool_uses:
                        tool_start = time.time()
                        yield format_sse(make_step(
                            "tool_call",
                            agent_id=matched_agent.agent_id_slug,
                            tool_name=tool_use["name"],
                            data={"input": tool_use.get("input", {}), "tool_use_id": tool_use["id"]},
                        ))

                        func_code = _find_tool_code(matched_agent, tool_use["name"])
                        if func_code:
                            tool_output = _execute_tool(func_code, tool_use["name"], tool_use.get("input", {}))
                        else:
                            tool_output = {"note": f"No function_code found for tool '{tool_use['name']}'"}

                        tool_duration = (time.time() - tool_start) * 1000
                        yield format_sse(make_step(
                            "tool_result",
                            agent_id=matched_agent.agent_id_slug,
                            tool_name=tool_use["name"],
                            data={"output": tool_output, "tool_use_id": tool_use["id"]},
                            duration_ms=tool_duration,
                        ))

                        tool_calls_data.append({
                            "tool_name": tool_use["name"],
                            "input": tool_use.get("input", {}),
                            "output": tool_output,
                            "latency_ms": int(tool_duration),
                            "success": "error" not in tool_output,
                        })

                        tool_results_for_api.append({
                            "type": "tool_result",
                            "tool_use_id": tool_use["id"],
                            "content": json.dumps(tool_output, ensure_ascii=False, default=str),
                        })

                    # Follow-up call with tool results
                    followup_messages = messages + [
                        {"role": "assistant", "content": api_result["content"]},
                        {"role": "user", "content": tool_results_for_api},
                    ]
                    followup_body: Dict[str, Any] = {
                        "model": model,
                        "max_tokens": 4096,
                        "system": system_prompt,
                        "messages": followup_messages,
                    }
                    if tools_payload:
                        followup_body["tools"] = tools_payload

                    async with httpx.AsyncClient(timeout=120.0) as client:
                        followup_resp = await client.post(
                            "https://api.anthropic.com/v1/messages",
                            headers={
                                "x-api-key": api_key,
                                "anthropic-version": "2023-06-01",
                                "content-type": "application/json",
                            },
                            json=followup_body,
                        )
                        if followup_resp.status_code == 200:
                            followup_result = followup_resp.json()
                            response_text = ""
                            for block in followup_result.get("content", []):
                                if block["type"] == "text":
                                    response_text += block["text"]
                            api_result = followup_result

                if tool_uses and not response_text:
                    response_text = "(Agent requested tool calls — in production, tools would execute and the agent would continue)"

                usage = api_result.get("usage", {})
                agent_input = usage.get("input_tokens", 0)
                agent_output = usage.get("output_tokens", 0)
                total_input_tokens += agent_input
                total_output_tokens += agent_output

                agent_responses.append({
                    "agent": agent_name,
                    "slug": slug,
                    "text": response_text,
                    "input_tokens": agent_input,
                    "output_tokens": agent_output,
                })

            except Exception as agent_err:
                yield format_sse(make_step(
                    "error",
                    agent_id=matched_agent.agent_id_slug,
                    data={"error": f"Agent execution failed: {str(agent_err)}"},
                ))
                agent_responses.append({"agent": agent_name, "slug": slug, "text": "(error)", "input_tokens": 0, "output_tokens": 0})

        # --- 4. Aggregation ---
        agg_start = time.time()
        strategy = getattr(coordinator, "aggregation_strategy", "merge") or "merge"
        yield format_sse(make_step(
            "aggregation",
            data={"strategy": strategy, "agent_count": len(agent_responses)},
        ))

        if strategy == "first":
            aggregated_text = agent_responses[0]["text"] if agent_responses else ""
        elif strategy == "summarize" and coordinator.aggregation_prompt:
            # Call Claude to synthesize responses
            agent_outputs = "\n\n".join(
                f"## Agent: {r['agent']}\n{r['text']}" for r in agent_responses
            )
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    agg_resp = await client.post(
                        "https://api.anthropic.com/v1/messages",
                        headers={
                            "x-api-key": api_key,
                            "anthropic-version": "2023-06-01",
                            "content-type": "application/json",
                        },
                        json={
                            "model": coordinator_model,
                            "max_tokens": 4096,
                            "temperature": float(getattr(coordinator, "coordinator_temperature", 0.3) or 0.3),
                            "system": coordinator.aggregation_prompt,
                            "messages": [{"role": "user", "content": f"Original question: {request.message}\n\nAgent responses:\n{agent_outputs}"}],
                        },
                    )
                if agg_resp.status_code == 200:
                    agg_result = agg_resp.json()
                    aggregated_text = "".join(
                        b["text"] for b in agg_result.get("content", []) if b.get("type") == "text"
                    )
                    agg_usage = agg_result.get("usage", {})
                    total_input_tokens += agg_usage.get("input_tokens", 0)
                    total_output_tokens += agg_usage.get("output_tokens", 0)
                else:
                    # Fallback to merge
                    aggregated_text = "\n\n".join(
                        f"## Agent: {r['agent']}\n{r['text']}" for r in agent_responses
                    )
            except Exception:
                aggregated_text = "\n\n".join(
                    f"## Agent: {r['agent']}\n{r['text']}" for r in agent_responses
                )
        else:
            # Default: merge
            aggregated_text = "\n\n".join(
                f"## Agent: {r['agent']}\n{r['text']}" for r in agent_responses
            )

        agg_duration = (time.time() - agg_start) * 1000
        yield format_sse(make_step(
            "aggregation",
            data={"strategy": strategy, "completed": True},
            duration_ms=agg_duration,
        ))

        # --- 5. Response ---
        total_duration = (time.time() - start_time) * 1000
        yield format_sse(make_step(
            "response",
            data={
                "text": aggregated_text,
                "input_tokens": total_input_tokens,
                "output_tokens": total_output_tokens,
                "model": coordinator_model,
                "agents_used": [r["slug"] for r in agent_responses],
            },
            duration_ms=total_duration,
        ))

        # Persist
        await _persist_execution(
            agent_name="hive-coordinator",
            model=coordinator_model,
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            duration_ms=total_duration,
            status="success",
            playground_type="hive",
            message=request.message,
            start_timestamp=start_time,
            tool_calls_data=tool_calls_data or None,
        )

    except Exception as e:
        yield format_sse(make_step(
            "error",
            data={"error": str(e), "traceback": traceback.format_exc()},
        ))
        await _persist_execution(
            agent_name="hive-coordinator",
            model=coordinator_model,
            input_tokens=total_input_tokens,
            output_tokens=total_output_tokens,
            duration_ms=(time.time() - start_time) * 1000,
            status="error",
            error_message=str(e),
            playground_type="hive",
            message=request.message,
            start_timestamp=start_time,
            tool_calls_data=tool_calls_data or None,
        )


# =============================================================================
# Infrastructure Run Endpoint
# =============================================================================


async def infra_event_generator(request: InfraRunRequest) -> AsyncGenerator[str, None]:
    """
    Execute classification + routing + agent in-process via Claude API.
    No Docker containers required — uses agent configs from the DB directly.

    SSE event sequence:
    classification → classification (result) → routing → agent_start → [tool_call → tool_result]* → response
    """
    start_time = time.time()
    tool_calls_data: List[Dict[str, Any]] = []

    try:
        # Fetch infrastructure details from DB
        from app.db.session import async_session_maker
        from app.db.models import Infrastructure, InfraOrchestrator, InfraAgent
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        async with async_session_maker() as db:
            stmt = (
                select(Infrastructure)
                .where(Infrastructure.id == request.infrastructure_id)
                .options(
                    selectinload(Infrastructure.orchestrator),
                    selectinload(Infrastructure.hive_coordinator),
                    selectinload(Infrastructure.agents),
                )
            )
            result = await db.execute(stmt)
            infra = result.scalar_one_or_none()

        if not infra:
            yield format_sse(make_step(
                "error",
                data={"error": f"Infrastructure '{request.infrastructure_id}' not found"},
            ))
            return

        # Delegate to hive generator for hive-type infrastructures
        if infra.type == "hive":
            async for event in hive_infra_event_generator(request, infra):
                yield event
            return

        orchestrator = infra.orchestrator
        if not orchestrator:
            yield format_sse(make_step(
                "error",
                data={"error": "No orchestrator configured for this infrastructure"},
            ))
            return

        # Load ALL agents regardless of status — sandbox ignores deployment state
        agents = list(infra.agents) if infra.agents else []
        if not agents:
            yield format_sse(make_step(
                "error",
                data={"error": "No agents configured in this infrastructure"},
            ))
            return

        # Check API key
        api_key = os.environ.get("ANTHROPIC_API_KEY", "") or _get_api_key()
        if not api_key:
            yield format_sse(make_step(
                "error",
                data={"error": "ANTHROPIC_API_KEY not configured. Set it in backend .env to enable playground."},
            ))
            return

        # --- 1. Classification ---
        classify_start = time.time()
        yield format_sse(make_step(
            "classification",
            data={"message": request.message, "method": "sandbox"},
        ))

        classification = await sandbox_classify(request.message, orchestrator, agents, api_key)
        classify_duration = (time.time() - classify_start) * 1000

        category = classification["category"]
        yield format_sse(make_step(
            "classification",
            data={
                "category": category,
                "confidence": classification["confidence"],
                "method": classification["method"],
            },
            duration_ms=classify_duration,
        ))

        # --- 2. Routing — find matching agent by category_code ---
        matched_agent = None
        for agent in agents:
            if agent.category_code == category:
                matched_agent = agent
                break
        if not matched_agent:
            matched_agent = agents[0]

        agent_name = matched_agent.display_name or matched_agent.agent_id_slug
        yield format_sse(make_step(
            "routing",
            agent_id=matched_agent.agent_id_slug,
            data={
                "reason": f"Category {category} → {agent_name}",
                "agent_id": matched_agent.agent_id_slug,
                "agent_name": agent_name,
            },
        ))

        # --- 3. Agent execution ---
        model = "claude-sonnet-4-5-20250929"
        yield format_sse(make_step(
            "agent_start",
            agent_id=matched_agent.agent_id_slug,
            data={"agent_name": agent_name, "model": model},
        ))

        # Build messages
        messages = []
        for msg in request.conversation_history:
            messages.append({"role": msg.get("role", "user"), "content": msg.get("content", "")})
        messages.append({"role": "user", "content": request.message})

        system_prompt = build_agent_system_prompt(matched_agent)
        tools_payload = build_tools_payload(matched_agent)

        api_body: Dict[str, Any] = {
            "model": model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": messages,
        }
        if tools_payload:
            api_body["tools"] = tools_payload

        async with httpx.AsyncClient(timeout=120.0) as client:
            api_response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json=api_body,
            )

            if api_response.status_code != 200:
                yield format_sse(make_step(
                    "error",
                    agent_id=matched_agent.agent_id_slug,
                    data={"error": f"Claude API error ({api_response.status_code}): {api_response.text}"},
                ))
                return

            api_result = api_response.json()

        # Process response content blocks
        response_text = ""
        tool_uses = []

        for block in api_result.get("content", []):
            if block["type"] == "text":
                response_text += block["text"]
            elif block["type"] == "tool_use":
                tool_uses.append(block)

        # --- 4. Tool execution + follow-up API call ---
        if tool_uses:
            tool_results_for_api = []
            for tool_use in tool_uses:
                tool_start = time.time()
                yield format_sse(make_step(
                    "tool_call",
                    agent_id=matched_agent.agent_id_slug,
                    tool_name=tool_use["name"],
                    data={"input": tool_use.get("input", {}), "tool_use_id": tool_use["id"]},
                ))

                # Execute the real tool function from the DB
                func_code = _find_tool_code(matched_agent, tool_use["name"])
                if func_code:
                    tool_output = _execute_tool(func_code, tool_use["name"], tool_use.get("input", {}))
                else:
                    tool_output = {"note": f"No function_code found for tool '{tool_use['name']}'"}

                tool_duration = (time.time() - tool_start) * 1000
                yield format_sse(make_step(
                    "tool_result",
                    agent_id=matched_agent.agent_id_slug,
                    tool_name=tool_use["name"],
                    data={
                        "output": tool_output,
                        "tool_use_id": tool_use["id"],
                    },
                    duration_ms=tool_duration,
                ))

                tool_calls_data.append({
                    "tool_name": tool_use["name"],
                    "input": tool_use.get("input", {}),
                    "output": tool_output,
                    "latency_ms": int(tool_duration),
                    "success": "error" not in tool_output,
                })

                tool_results_for_api.append({
                    "type": "tool_result",
                    "tool_use_id": tool_use["id"],
                    "content": json.dumps(tool_output, ensure_ascii=False, default=str),
                })

            # Follow-up call: send tool results back to Claude so it generates a real text response
            followup_messages = messages + [
                {"role": "assistant", "content": api_result["content"]},
                {"role": "user", "content": tool_results_for_api},
            ]
            followup_body: Dict[str, Any] = {
                "model": model,
                "max_tokens": 4096,
                "system": system_prompt,
                "messages": followup_messages,
            }
            if tools_payload:
                followup_body["tools"] = tools_payload

            async with httpx.AsyncClient(timeout=120.0) as client:
                followup_resp = await client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": api_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json=followup_body,
                )
                if followup_resp.status_code == 200:
                    followup_result = followup_resp.json()
                    response_text = ""
                    for block in followup_result.get("content", []):
                        if block["type"] == "text":
                            response_text += block["text"]
                    # Use followup usage stats
                    api_result = followup_result

        # --- 5. Response ---
        total_duration = (time.time() - start_time) * 1000
        usage = api_result.get("usage", {})
        yield format_sse(make_step(
            "response",
            agent_id=matched_agent.agent_id_slug,
            data={
                "text": response_text,
                "input_tokens": usage.get("input_tokens", 0),
                "output_tokens": usage.get("output_tokens", 0),
                "model": api_result.get("model", model),
                "stop_reason": api_result.get("stop_reason", ""),
            },
            duration_ms=total_duration,
        ))

        # Persist playground execution
        await _persist_execution(
            agent_name=matched_agent.display_name or matched_agent.agent_id_slug,
            model=api_result.get("model", model),
            input_tokens=usage.get("input_tokens", 0),
            output_tokens=usage.get("output_tokens", 0),
            duration_ms=total_duration,
            status="success",
            playground_type="infra",
            message=request.message,
            start_timestamp=start_time,
            tool_calls_data=tool_calls_data or None,
        )

    except Exception as e:
        yield format_sse(make_step(
            "error",
            data={"error": str(e), "traceback": traceback.format_exc()},
        ))
        await _persist_execution(
            agent_name="infrastructure",
            model="unknown",
            input_tokens=0,
            output_tokens=0,
            duration_ms=(time.time() - start_time) * 1000,
            status="error",
            error_message=str(e),
            playground_type="infra",
            message=request.message,
            start_timestamp=start_time,
            tool_calls_data=tool_calls_data or None,
        )


@router.post("/infra/run")
async def run_infrastructure(request: InfraRunRequest):
    """
    Route a message through a deployed infrastructure's orchestrator,
    streaming step events as the message flows through
    classification -> routing -> agent -> tools -> response.
    """
    return StreamingResponse(
        infra_event_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
