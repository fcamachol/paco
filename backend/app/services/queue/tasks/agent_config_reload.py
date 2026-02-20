"""
Task: agent_config_reload

Pushes config reload to a running agent via HTTP POST.
Replaces the best-effort _notify_agent_reload() in agents.py with retryable delivery.

Payload:
  - agent_port: int
  - agent_name: str (for logging)
"""

import logging
from typing import Any, Dict

import httpx
from redis.asyncio import Redis

from app.services.queue.dispatcher import TaskDispatcher

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "agent_config_reload"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    port = payload.get("agent_port")
    name = payload.get("agent_name", "unknown")

    if not port:
        logger.warning("agent_config_reload: no port for agent %s, skipping", name)
        return

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(f"http://localhost:{port}/admin/reload")
        resp.raise_for_status()

    logger.info("Config reload delivered to %s (port %d)", name, port)


def register(dispatcher: TaskDispatcher) -> None:
    dispatcher.register(TASK_TYPE, handle, max_attempts=5, timeout=15.0)
