"""
Task: agent_lifecycle

Wraps PM2 start/stop/restart with retry. Enqueued as fallback when
lifecycle API endpoints fail on the first attempt.

Payload:
  - action: "start" | "stop" | "restart"
  - pm2_name: str
  - agent_id: str
  - env: dict (optional, for start/restart)
"""

import logging
from typing import Any, Dict

from redis.asyncio import Redis
from sqlalchemy import select

from app.db.models import Agent
from app.db.session import async_session_maker
from app.services.pm2_client import PM2Client

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "agent_lifecycle"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    action = payload.get("action")
    pm2_name = payload.get("pm2_name")
    agent_id = payload.get("agent_id")
    env = payload.get("env")

    # Fall back to agent name if pm2_name was not set
    if not pm2_name and agent_id:
        async with async_session_maker() as db:
            from uuid import UUID
            result = await db.execute(select(Agent).where(Agent.id == UUID(agent_id)))
            agent = result.scalar_one_or_none()
            if agent:
                pm2_name = agent.pm2_name or agent.name

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


def register(dispatcher: "TaskDispatcher") -> None:
    from app.services.queue.dispatcher import TaskDispatcher
    dispatcher.register(TASK_TYPE, handle, max_attempts=5, timeout=30.0)
