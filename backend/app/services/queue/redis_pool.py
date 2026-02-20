"""
Shared async Redis connection factory for the queue system.

Uses Redis DB 1 (isolated from Langfuse on DB 0) by default.
"""

import logging
from typing import Optional

import redis.asyncio as aioredis
from redis.asyncio import Redis

from app.core.config import settings

logger = logging.getLogger("paco.queue")

_pool: Optional[Redis] = None


async def get_queue_redis() -> Redis:
    """Get or create the shared async Redis connection for the queue."""
    global _pool
    if _pool is not None:
        return _pool

    db = getattr(settings, "queue_redis_db", 1)
    base_url = settings.redis_url.rstrip("/")
    # Replace any trailing /N with our queue DB number
    if base_url.count("/") > 2:
        base_url = "/".join(base_url.rsplit("/", 1)[:-1])
    url = f"{base_url}/{db}"

    _pool = aioredis.from_url(url, decode_responses=False)
    await _pool.ping()
    logger.info("Queue Redis connected: %s", url)
    return _pool


async def close_queue_redis() -> None:
    """Close the shared Redis connection."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
        logger.info("Queue Redis connection closed")
