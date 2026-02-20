"""
Task Dispatcher — registry of task handlers + dispatch with timeout/retry.
"""

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine, Dict, Optional

from redis.asyncio import Redis

from app.services.queue.core import QueuedTask, requeue_with_backoff

logger = logging.getLogger("paco.queue")

# Handler signature: async (payload: dict, redis: Redis) -> None
HandlerFunc = Callable[[Dict[str, Any], Redis], Coroutine[Any, Any, None]]


@dataclass
class TaskHandler:
    """Configuration for a registered task handler."""

    handler: HandlerFunc
    max_attempts: int = 5
    timeout: float = 30.0


class TaskDispatcher:
    """Registry of task types → handlers, with dispatch + retry logic."""

    def __init__(self) -> None:
        self._handlers: Dict[str, TaskHandler] = {}

    def register(
        self,
        task_type: str,
        handler: HandlerFunc,
        max_attempts: int = 5,
        timeout: float = 30.0,
    ) -> None:
        self._handlers[task_type] = TaskHandler(
            handler=handler,
            max_attempts=max_attempts,
            timeout=timeout,
        )
        logger.debug("Registered handler: %s (max_attempts=%d, timeout=%.0fs)", task_type, max_attempts, timeout)

    async def dispatch(self, task: QueuedTask, redis: Redis) -> bool:
        """Execute a task via its registered handler.

        Returns True on success, False if the task was requeued or dead-lettered.
        """
        handler_config = self._handlers.get(task.task_type)
        if handler_config is None:
            logger.error("No handler for task_type=%s (id=%s)", task.task_type, task.task_id)
            await requeue_with_backoff(redis, task, f"Unknown task_type: {task.task_type}")
            return False

        # Override max_attempts from handler config
        task.max_attempts = handler_config.max_attempts

        try:
            await asyncio.wait_for(
                handler_config.handler(task.payload, redis),
                timeout=handler_config.timeout,
            )
            logger.info("Completed %s (id=%s, attempt=%d)", task.task_type, task.task_id, task.attempts + 1)
            return True
        except asyncio.TimeoutError:
            error = f"Timeout after {handler_config.timeout}s"
            logger.warning("Timeout %s (id=%s): %s", task.task_type, task.task_id, error)
            await requeue_with_backoff(redis, task, error)
            return False
        except Exception as e:
            error = f"{type(e).__name__}: {e}"
            logger.warning("Failed %s (id=%s): %s", task.task_type, task.task_id, error)
            await requeue_with_backoff(redis, task, error)
            return False

    @property
    def registered_types(self) -> list:
        return list(self._handlers.keys())


# Global dispatcher singleton
dispatcher = TaskDispatcher()
