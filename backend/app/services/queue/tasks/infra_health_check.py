"""
Task: infra_health_check

Polls health endpoints for all running infrastructure services.
Activates the dormant InfraHealthMonitor logic. Self-reschedules.

Payload:
  - interval: int (seconds until next check, default 30)
"""

import logging
import time
from typing import Any, Dict

from redis.asyncio import Redis

from app.core.config import settings
from app.db.session import async_session_maker
from app.services.queue.core import enqueue_scheduled_task

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "infra_health_check"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    from app.services.infra_health_monitor import InfraHealthMonitor

    monitor = InfraHealthMonitor()
    async with async_session_maker() as db:
        await monitor._poll_all(db)

    # Self-reschedule
    interval = payload.get("interval") or getattr(settings, "infra_health_interval", 30)
    await enqueue_scheduled_task(
        redis,
        TASK_TYPE,
        {"interval": interval},
        execute_at=time.time() + interval,
    )


def register(dispatcher: "TaskDispatcher") -> None:
    from app.services.queue.dispatcher import TaskDispatcher
    dispatcher.register(TASK_TYPE, handle, max_attempts=3, timeout=60.0)
