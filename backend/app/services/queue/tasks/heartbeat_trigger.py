"""
Task: heartbeat_trigger

Runs a single heartbeat supervisor tick, then self-reschedules.
Replaces the asyncio.create_task() loop in main.py.

Payload:
  - interval: int (seconds until next trigger, default 60)
"""

import logging
import time
from typing import Any, Dict

from redis.asyncio import Redis

from app.core.config import settings
from app.services.queue.core import enqueue_scheduled_task

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "heartbeat_trigger"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    from app.services.heartbeat_scheduler import heartbeat_scheduler

    # Run one tick of the heartbeat supervisor
    await heartbeat_scheduler._tick()

    # Self-reschedule for next interval
    interval = payload.get("interval") or getattr(settings, "heartbeat_poll_interval", 60)
    await enqueue_scheduled_task(
        redis,
        TASK_TYPE,
        {"interval": interval},
        execute_at=time.time() + interval,
    )
    logger.debug("Heartbeat tick complete, next in %ds", interval)


def register(dispatcher: "TaskDispatcher") -> None:
    from app.services.queue.dispatcher import TaskDispatcher
    dispatcher.register(TASK_TYPE, handle, max_attempts=3, timeout=120.0)
