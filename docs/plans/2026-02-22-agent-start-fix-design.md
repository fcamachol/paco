# Fix: Agent Stuck in "Starting" Status — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix agents getting permanently stuck in "starting" status by wiring up the existing queue task system and adding subprocess timeouts to the PM2 client.

**Architecture:** Replace direct synchronous PM2 calls in lifecycle endpoints with fire-and-forget queue tasks. The existing `agent_lifecycle` queue task already handles start/stop/restart with 30s timeout and 5 retries — it just needs to be enqueued. Add subprocess-level timeouts to PM2 client as defense-in-depth.

**Tech Stack:** Python asyncio, Redis queue (existing), PM2 subprocess, FastAPI, SQLAlchemy async sessions

---

### Task 1: Add subprocess timeout to PM2 client

**Files:**
- Modify: `backend/app/services/pm2_client.py:15-55`
- Test: `backend/tests/test_agents.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_agents.py`:

```python
# ---------------------------------------------------------------------------
# PM2Client subprocess timeout
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pm2_client_timeout():
    """PM2 client should return error dict when subprocess exceeds timeout."""
    from app.services.pm2_client import PM2Client

    pm2 = PM2Client()

    with patch("app.services.pm2_client.asyncio.create_subprocess_exec") as mock_exec:
        mock_proc = AsyncMock()
        mock_proc.communicate = AsyncMock(side_effect=asyncio.TimeoutError)
        mock_proc.kill = AsyncMock()
        mock_proc.wait = AsyncMock()
        mock_exec.return_value = mock_proc

        result = await pm2._run_pm2_command("start", "test-proc", timeout=0.1)

    assert "error" in result
    assert "timed out" in result["error"].lower()
    mock_proc.kill.assert_called_once()
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py::test_pm2_client_timeout -v`
Expected: FAIL — `_run_pm2_command` doesn't accept `timeout` parameter

**Step 3: Implement subprocess timeout**

Modify `backend/app/services/pm2_client.py` — change `_run_pm2_command` signature and wrap `proc.communicate()`:

```python
async def _run_pm2_command(
    self, *args: str,
    env_override: Optional[Dict[str, str]] = None,
    timeout: float = 30.0,
) -> Dict[str, Any]:
    """Run a PM2 command and return JSON output."""
    cmd = ["pm2", "jlist", *args] if "jlist" in args else ["pm2", *args]

    # Build subprocess environment: inherit host env, merge overrides
    import os
    subprocess_env = None
    if env_override:
        subprocess_env = {**os.environ, **env_override}

    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=subprocess_env,
        )
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=timeout
        )

        if proc.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            return {"error": error_msg, "returncode": proc.returncode}

        output = stdout.decode().strip()

        # Try to parse JSON output
        if output and output.startswith("["):
            return {"processes": json.loads(output)}
        elif output and output.startswith("{"):
            return json.loads(output)

        return {"output": output}

    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return {"error": f"PM2 command timed out after {timeout}s"}
    except FileNotFoundError:
        return {"error": "PM2 not found. Please install PM2: npm install -g pm2"}
    except json.JSONDecodeError:
        return {"output": stdout.decode() if stdout else ""}
    except Exception as e:
        return {"error": str(e)}
```

**Step 4: Run test to verify it passes**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py::test_pm2_client_timeout -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/services/pm2_client.py backend/tests/test_agents.py
git commit -m "fix: add subprocess timeout to PM2 client"
```

---

### Task 2: Add error handling to agent_lifecycle queue task

**Files:**
- Modify: `backend/app/services/queue/tasks/agent_lifecycle.py:29-62`
- Test: `backend/tests/test_agents.py`

**Step 1: Write the failing test**

Add to `backend/tests/test_agents.py`:

```python
# ---------------------------------------------------------------------------
# agent_lifecycle queue task
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_lifecycle_task_sets_running(db_session: AsyncSession):
    """Queue task should set agent status to 'running' after successful PM2 start."""
    from app.services.queue.tasks.agent_lifecycle import handle

    agent = await create_test_agent(db_session, name="lifecycle-start", status="starting")

    with patch("app.services.queue.tasks.agent_lifecycle.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.start = AsyncMock(return_value={"status": "online"})

        with patch("app.services.queue.tasks.agent_lifecycle.async_session_maker") as mock_maker:
            mock_maker.return_value.__aenter__ = AsyncMock(return_value=db_session)
            mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)

            await handle({
                "action": "start",
                "pm2_name": "lifecycle-start",
                "agent_id": str(agent.id),
            }, redis=AsyncMock())

    await db_session.refresh(agent)
    assert agent.status == "running"


@pytest.mark.asyncio
async def test_agent_lifecycle_task_sets_error_on_failure(db_session: AsyncSession):
    """Queue task should set agent status to 'error' when PM2 call fails."""
    from app.services.queue.tasks.agent_lifecycle import handle

    agent = await create_test_agent(db_session, name="lifecycle-fail", status="starting")

    with patch("app.services.queue.tasks.agent_lifecycle.PM2Client") as MockPM2:
        mock_pm2 = MockPM2.return_value
        mock_pm2.start = AsyncMock(side_effect=RuntimeError("PM2 command timed out"))

        with patch("app.services.queue.tasks.agent_lifecycle.async_session_maker") as mock_maker:
            mock_maker.return_value.__aenter__ = AsyncMock(return_value=db_session)
            mock_maker.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(RuntimeError):
                await handle({
                    "action": "start",
                    "pm2_name": "lifecycle-fail",
                    "agent_id": str(agent.id),
                }, redis=AsyncMock())

    await db_session.refresh(agent)
    assert agent.status == "error"
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py::test_agent_lifecycle_task_sets_running tests/test_agents.py::test_agent_lifecycle_task_sets_error_on_failure -v`
Expected: FAIL — the error test fails because the current task handler doesn't catch PM2 errors to set status to "error"

**Step 3: Update agent_lifecycle task with error handling**

Replace the `handle` function in `backend/app/services/queue/tasks/agent_lifecycle.py`:

```python
async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    action = payload.get("action")
    pm2_name = payload.get("pm2_name")
    agent_id = payload.get("agent_id")
    env = payload.get("env")

    if not action or not pm2_name:
        logger.warning("agent_lifecycle: missing action or pm2_name")
        return

    pm2 = PM2Client()
    status_map = {"start": "running", "restart": "running", "stop": "stopped"}

    try:
        if action == "start":
            await pm2.start(pm2_name, env=env)
        elif action == "stop":
            await pm2.stop(pm2_name)
        elif action == "restart":
            await pm2.restart(pm2_name)
        else:
            logger.warning("agent_lifecycle: unknown action %s", action)
            return

        # Update agent status on success
        if agent_id:
            async with async_session_maker() as db:
                from uuid import UUID
                result = await db.execute(select(Agent).where(Agent.id == UUID(agent_id)))
                agent = result.scalar_one_or_none()
                if agent:
                    agent.status = status_map.get(action, agent.status)
                    await db.commit()

        logger.info("Agent lifecycle %s completed for %s", action, pm2_name)

    except Exception as e:
        # Set status to error so the agent doesn't stay stuck in "starting"
        if agent_id:
            try:
                async with async_session_maker() as db:
                    from uuid import UUID
                    result = await db.execute(select(Agent).where(Agent.id == UUID(agent_id)))
                    agent = result.scalar_one_or_none()
                    if agent:
                        agent.status = "error"
                        await db.commit()
            except Exception:
                logger.exception("Failed to set agent %s status to error", agent_id)

        logger.error("Agent lifecycle %s failed for %s: %s", action, pm2_name, e)
        raise  # Re-raise so dispatcher can retry with backoff
```

**Step 4: Run tests to verify they pass**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py::test_agent_lifecycle_task_sets_running tests/test_agents.py::test_agent_lifecycle_task_sets_error_on_failure -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/app/services/queue/tasks/agent_lifecycle.py backend/tests/test_agents.py
git commit -m "fix: add error handling to agent_lifecycle queue task"
```

---

### Task 3: Wire lifecycle endpoints to use queue instead of direct PM2

**Files:**
- Modify: `backend/app/api/agents.py:441-514`
- Test: `backend/tests/test_agents.py`

**Step 1: Write the failing tests**

Replace the existing lifecycle tests in `backend/tests/test_agents.py` with queue-aware versions:

```python
# ---------------------------------------------------------------------------
# POST /api/agents/{id}/start  — lifecycle (operator+)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_start_agent(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="start-me")

    with patch("app.api.agents.get_queue_redis") as mock_get_redis, \
         patch("app.api.agents.enqueue_task") as mock_enqueue:
        mock_get_redis.return_value = AsyncMock()
        mock_enqueue.return_value = "task-id-123"

        resp = await client.post(f"/api/agents/{agent.id}/start", headers=operator_headers)

    assert resp.status_code == 202
    assert resp.json()["agent"]["status"] == "starting"
    mock_enqueue.assert_awaited_once()
    payload = mock_enqueue.call_args[0][2]
    assert payload["action"] == "start"
    assert payload["pm2_name"] == "start-me"
    assert payload["agent_id"] == str(agent.id)


@pytest.mark.asyncio
async def test_start_already_running(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="already-running", status="running")
    resp = await client.post(f"/api/agents/{agent.id}/start", headers=operator_headers)
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_start_agent_viewer_rejected(
    client: AsyncClient, db_session: AsyncSession, viewer_headers: dict,
):
    agent = await create_test_agent(db_session, name="no-start")
    resp = await client.post(f"/api/agents/{agent.id}/start", headers=viewer_headers)
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# POST /api/agents/{id}/stop  — lifecycle (operator+)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_stop_agent(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="stop-me", status="running")

    with patch("app.api.agents.get_queue_redis") as mock_get_redis, \
         patch("app.api.agents.enqueue_task") as mock_enqueue:
        mock_get_redis.return_value = AsyncMock()
        mock_enqueue.return_value = "task-id-456"

        resp = await client.post(f"/api/agents/{agent.id}/stop", headers=operator_headers)

    assert resp.status_code == 202
    assert resp.json()["agent"]["status"] == "stopping"
    mock_enqueue.assert_awaited_once()
    payload = mock_enqueue.call_args[0][2]
    assert payload["action"] == "stop"


@pytest.mark.asyncio
async def test_stop_already_stopped(
    client: AsyncClient, db_session: AsyncSession, operator_headers: dict,
):
    agent = await create_test_agent(db_session, name="already-stopped", status="stopped")
    resp = await client.post(f"/api/agents/{agent.id}/stop", headers=operator_headers)
    assert resp.status_code == 409
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py::test_start_agent tests/test_agents.py::test_stop_agent -v`
Expected: FAIL — endpoints still return 200 and call PM2 directly

**Step 3: Rewrite lifecycle endpoints to enqueue tasks**

In `backend/app/api/agents.py`, add imports at the top (after existing imports):

```python
from app.services.queue.redis_pool import get_queue_redis
from app.services.queue.core import enqueue_task
```

Then replace the three lifecycle endpoints (lines 441-514):

```python
@router.post("/{agent_id}/start", response_model=AgentStatusResponse, status_code=202)
async def start_agent(agent_id: UUID, db: DbSession, _: OperatorUser) -> AgentStatusResponse:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    if agent.status == "running":
        raise HTTPException(status_code=409, detail=f"Agent '{agent.name}' is already running")

    agent.status = "starting"
    await db.commit()

    env = dict(agent.env_vars or {})
    env["PACO_API_URL"] = settings.internal_api_url
    env["PACO_AGENT_ID"] = str(agent.id)

    try:
        redis = await get_queue_redis()
        await enqueue_task(redis, "agent_lifecycle", {
            "action": "start",
            "pm2_name": agent.pm2_name,
            "agent_id": str(agent.id),
            "env": env,
        })
    except Exception as e:
        agent.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to enqueue agent start: {e}")

    await db.refresh(agent)
    return AgentStatusResponse(agent=_agent_to_response(agent), pm2_status=None)


@router.post("/{agent_id}/stop", response_model=AgentStatusResponse, status_code=202)
async def stop_agent(agent_id: UUID, db: DbSession, _: OperatorUser) -> AgentStatusResponse:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    if agent.status == "stopped":
        raise HTTPException(status_code=409, detail=f"Agent '{agent.name}' is already stopped")

    agent.status = "stopping"
    await db.commit()

    try:
        redis = await get_queue_redis()
        await enqueue_task(redis, "agent_lifecycle", {
            "action": "stop",
            "pm2_name": agent.pm2_name,
            "agent_id": str(agent.id),
        })
    except Exception as e:
        agent.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to enqueue agent stop: {e}")

    await db.refresh(agent)
    return AgentStatusResponse(agent=_agent_to_response(agent), pm2_status=None)


@router.post("/{agent_id}/restart", response_model=AgentStatusResponse, status_code=202)
async def restart_agent(agent_id: UUID, db: DbSession, _: OperatorUser) -> AgentStatusResponse:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    agent.status = "starting"
    await db.commit()

    env = dict(agent.env_vars or {})
    env["PACO_API_URL"] = settings.internal_api_url
    env["PACO_AGENT_ID"] = str(agent.id)

    try:
        redis = await get_queue_redis()
        await enqueue_task(redis, "agent_lifecycle", {
            "action": "restart",
            "pm2_name": agent.pm2_name,
            "agent_id": str(agent.id),
            "env": env,
        })
    except Exception as e:
        agent.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to enqueue agent restart: {e}")

    await db.refresh(agent)
    return AgentStatusResponse(agent=_agent_to_response(agent), pm2_status=None)
```

**Step 4: Run all lifecycle tests to verify they pass**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py -v -k "start or stop or lifecycle"`
Expected: All PASS

**Step 5: Run full test suite to check for regressions**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py -v`
Expected: All PASS

**Step 6: Commit**

```bash
git add backend/app/api/agents.py backend/tests/test_agents.py
git commit -m "fix: wire agent lifecycle endpoints to queue for async PM2 execution"
```

---

### Task 4: Remove unused PM2Client import from agents.py

**Files:**
- Modify: `backend/app/api/agents.py:22`

**Step 1: Check if PM2Client is still used anywhere in agents.py**

After Task 3, `PM2Client` is only used in the delete endpoint (line 429-430) for stopping a running agent before deletion. That usage stays. If it's still needed, keep the import. If the delete endpoint was changed, remove it.

Check: The delete endpoint at lines 420-433 still calls `pm2.stop()` directly. This is fine — deletion is a synchronous destructive action that should block. No change needed here.

**Step 2: Run full test suite one more time**

Run: `cd /Users/fernandocamacholombardo/paco-3/backend && python -m pytest tests/test_agents.py -v`
Expected: All PASS

**Step 3: Final commit if any cleanup was needed**

No commit needed if no changes were made.
