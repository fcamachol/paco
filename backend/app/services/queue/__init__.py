"""
PACO Queue System

Redis-backed persistent task queue with retry, backoff, and dead-letter support.
Uses raw Redis primitives (LPUSH/BRPOP/ZADD) — no external queue dependencies.
"""

from app.services.queue.core import (
    QueuedTask,
    dequeue_task,
    enqueue_scheduled_task,
    enqueue_task,
    promote_scheduled_tasks,
    requeue_with_backoff,
)
from app.services.queue.dispatcher import TaskDispatcher
from app.services.queue.redis_pool import get_queue_redis

__all__ = [
    "QueuedTask",
    "TaskDispatcher",
    "dequeue_task",
    "enqueue_scheduled_task",
    "enqueue_task",
    "get_queue_redis",
    "promote_scheduled_tasks",
    "requeue_with_backoff",
]
