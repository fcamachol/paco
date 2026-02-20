"""
Queue Core — Redis-backed task primitives.

Keys used (all prefixed with settings.queue_prefix, default "paco:queue"):
  - {prefix}:tasks        LIST   — ready-to-execute tasks (LPUSH / BRPOP)
  - {prefix}:scheduled    ZSET   — delayed tasks scored by execute_at epoch
  - {prefix}:dead_letter  LIST   — tasks that exceeded max_attempts
"""

import logging
import random
import time
from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Optional
from uuid import uuid4

import orjson
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger("paco.queue")

PREFIX = settings.queue_prefix if hasattr(settings, "queue_prefix") else "paco:queue"


@dataclass
class QueuedTask:
    """Serializable unit of work."""

    task_id: str = field(default_factory=lambda: str(uuid4()))
    task_type: str = ""
    payload: Dict[str, Any] = field(default_factory=dict)
    attempts: int = 0
    max_attempts: int = 5
    created_at: float = field(default_factory=time.time)
    last_error: Optional[str] = None

    def serialize(self) -> bytes:
        return orjson.dumps(asdict(self))

    @classmethod
    def deserialize(cls, raw: bytes) -> "QueuedTask":
        data = orjson.loads(raw)
        return cls(**data)


async def enqueue_task(
    redis: Redis,
    task_type: str,
    payload: Optional[Dict[str, Any]] = None,
    max_attempts: Optional[int] = None,
) -> str:
    """Push a task to the ready queue. Returns task_id."""
    max_att = max_attempts or getattr(settings, "queue_default_max_attempts", 5)
    task = QueuedTask(task_type=task_type, payload=payload or {}, max_attempts=max_att)
    await redis.lpush(f"{PREFIX}:tasks", task.serialize())
    logger.debug("Enqueued %s (id=%s)", task_type, task.task_id)
    return task.task_id


async def dequeue_task(redis: Redis, timeout: int = 1) -> Optional[QueuedTask]:
    """Blocking pop from the ready queue. Returns None on timeout."""
    result = await redis.brpop(f"{PREFIX}:tasks", timeout=timeout)
    if result is None:
        return None
    _, raw = result
    return QueuedTask.deserialize(raw)


async def enqueue_scheduled_task(
    redis: Redis,
    task_type: str,
    payload: Optional[Dict[str, Any]] = None,
    execute_at: Optional[float] = None,
    max_attempts: Optional[int] = None,
) -> str:
    """Add a task to the scheduled set, scored by execute_at epoch."""
    max_att = max_attempts or getattr(settings, "queue_default_max_attempts", 5)
    task = QueuedTask(task_type=task_type, payload=payload or {}, max_attempts=max_att)
    score = execute_at or time.time()
    await redis.zadd(f"{PREFIX}:scheduled", {task.serialize(): score})
    logger.debug("Scheduled %s at %.0f (id=%s)", task_type, score, task.task_id)
    return task.task_id


async def promote_scheduled_tasks(redis: Redis) -> int:
    """Move scheduled tasks whose execute_at has passed into the ready queue."""
    now = time.time()
    key = f"{PREFIX}:scheduled"

    # Fetch all due tasks
    due = await redis.zrangebyscore(key, "-inf", now)
    if not due:
        return 0

    pipe = redis.pipeline()
    for raw in due:
        pipe.lpush(f"{PREFIX}:tasks", raw)
    pipe.zremrangebyscore(key, "-inf", now)
    await pipe.execute()

    logger.debug("Promoted %d scheduled tasks", len(due))
    return len(due)


async def requeue_with_backoff(redis: Redis, task: QueuedTask, error: str) -> bool:
    """Re-enqueue with exponential backoff, or dead-letter if max_attempts exceeded.

    Backoff formula: min(base * 2^attempts + jitter, max_delay)
    Returns True if requeued, False if dead-lettered.
    """
    task.attempts += 1
    task.last_error = error[:1000]

    if task.attempts >= task.max_attempts:
        await redis.lpush(f"{PREFIX}:dead_letter", task.serialize())
        logger.warning(
            "Dead-lettered %s (id=%s) after %d attempts: %s",
            task.task_type,
            task.task_id,
            task.attempts,
            error[:200],
        )
        return False

    base = getattr(settings, "queue_backoff_base", 5.0)
    max_delay = getattr(settings, "queue_backoff_max", 300.0)
    delay = min(base * (2 ** task.attempts) + random.uniform(0, 1), max_delay)
    execute_at = time.time() + delay

    await redis.zadd(f"{PREFIX}:scheduled", {task.serialize(): execute_at})
    logger.info(
        "Requeued %s (id=%s) attempt %d/%d, next in %.1fs",
        task.task_type,
        task.task_id,
        task.attempts,
        task.max_attempts,
        delay,
    )
    return True
