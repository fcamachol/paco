"""
Event Bus — emits outbound webhook events.

Usage:
    from app.services.event_bus import emit_event
    await emit_event("agent.started", agent_id=str(agent.id), agent_name=agent.name, data={...})
"""

import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional
from uuid import uuid4

from sqlalchemy import select

from app.db.models import Webhook
from app.db.session import async_session_maker

logger = logging.getLogger("paco.event_bus")


async def emit_event(
    event_type: str,
    agent_id: Optional[str] = None,
    agent_name: Optional[str] = None,
    data: Optional[Dict[str, Any]] = None,
) -> int:
    """Emit an event to all matching active outbound webhooks.

    Queries active webhooks that subscribe to the given event_type and
    optionally match the agent_id scope. Enqueues webhook_delivery tasks
    for each match.

    Returns the number of delivery tasks enqueued.
    """
    try:
        async with async_session_maker() as db:
            # Find all active webhooks subscribed to this event type
            result = await db.execute(
                select(Webhook).where(
                    Webhook.is_active == True,  # noqa: E712
                )
            )
            webhooks = result.scalars().all()

        # Filter: webhook must subscribe to event_type, and scope must match
        matching = []
        for wh in webhooks:
            events = wh.events or []
            if event_type not in events:
                continue
            # Scope: if webhook has agent_id, only match that agent
            if wh.agent_id is not None and agent_id is not None:
                if str(wh.agent_id) != str(agent_id):
                    continue
            matching.append(wh)

        if not matching:
            return 0

        # Build the event payload
        payload = {
            "event_id": str(uuid4()),
            "event_type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "agent_id": agent_id,
            "agent_name": agent_name,
            "data": data or {},
        }

        # Enqueue delivery tasks
        from app.services.queue.redis_pool import get_queue_redis
        from app.services.queue.core import enqueue_task

        redis = await get_queue_redis()
        count = 0
        for wh in matching:
            await enqueue_task(redis, "webhook_delivery", {
                "webhook_id": str(wh.id),
                "event_type": event_type,
                "payload": payload,
            })
            count += 1

        logger.info("Emitted %s: %d deliveries enqueued", event_type, count)
        return count

    except Exception as e:
        # Never break main flow
        logger.warning("Event emission failed for %s: %s", event_type, e)
        return 0
