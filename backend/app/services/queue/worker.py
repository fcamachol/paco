"""
PACO Queue Worker — standalone process entry point.

Runs as: python -m app.services.queue.worker

Loop:
  1. Promote scheduled tasks whose execute_at has passed
  2. BRPOP a task from the ready queue
  3. Dispatch to registered handler
  4. Repeat
"""

import asyncio
import logging
import signal
import sys

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("paco.worker")


class Worker:
    def __init__(self) -> None:
        self._running = False

    async def run(self) -> None:
        from app.services.queue.core import dequeue_task, promote_scheduled_tasks
        from app.services.queue.dispatcher import dispatcher
        from app.services.queue.redis_pool import close_queue_redis, get_queue_redis

        # Register all task handlers
        from app.services.queue.tasks import register_all
        register_all(dispatcher)

        logger.info("Worker starting — registered handlers: %s", dispatcher.registered_types)

        redis = await get_queue_redis()
        self._running = True

        # Install signal handlers
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, self._shutdown)

        try:
            while self._running:
                try:
                    # 1. Promote scheduled tasks
                    await promote_scheduled_tasks(redis)

                    # 2. Dequeue next task (blocks up to 1s)
                    task = await dequeue_task(redis, timeout=1)
                    if task is None:
                        continue

                    # 3. Dispatch
                    await dispatcher.dispatch(task, redis)
                except Exception as e:
                    if self._running:
                        logger.error("Worker loop error: %s", e, exc_info=True)
                        await asyncio.sleep(1)
        finally:
            await close_queue_redis()
            logger.info("Worker stopped")

    def _shutdown(self) -> None:
        logger.info("Shutdown signal received")
        self._running = False


def main() -> None:
    worker = Worker()
    try:
        asyncio.run(worker.run())
    except KeyboardInterrupt:
        pass
    sys.exit(0)


if __name__ == "__main__":
    main()
