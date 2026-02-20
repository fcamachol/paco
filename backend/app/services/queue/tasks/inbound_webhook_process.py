"""
Task: inbound_webhook_process

Routes inbound webhook payload to the target agent via HTTP POST.
Updates InboundWebhookEvent with the agent's response.

Payload:
  - event_id: str (UUID of InboundWebhookEvent)
  - agent_port: int
  - prompt: str
"""

import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

import httpx
from redis.asyncio import Redis
from sqlalchemy import select

from app.db.models import InboundWebhook, InboundWebhookEvent
from app.db.session import async_session_maker

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "inbound_webhook_process"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    event_id = payload.get("event_id")
    agent_port = payload.get("agent_port")
    prompt = payload.get("prompt", "")

    if not event_id or not agent_port:
        logger.warning("inbound_webhook_process: missing event_id or agent_port")
        return

    start_time = time.time()

    # Update event status to processing
    async with async_session_maker() as db:
        result = await db.execute(
            select(InboundWebhookEvent).where(InboundWebhookEvent.id == UUID(event_id))
        )
        event = result.scalar_one_or_none()
        if event:
            event.status = "processing"
            await db.commit()

    # Route to agent
    try:
        async with httpx.AsyncClient(timeout=130.0) as client:
            resp = await client.post(
                f"http://localhost:{agent_port}/api/execute",
                json={"prompt": prompt},
            )
            resp.raise_for_status()
            resp_data = resp.json()
    except Exception as e:
        # Mark failed
        processing_ms = int((time.time() - start_time) * 1000)
        async with async_session_maker() as db:
            result = await db.execute(
                select(InboundWebhookEvent).where(InboundWebhookEvent.id == UUID(event_id))
            )
            event = result.scalar_one_or_none()
            if event:
                event.status = "failed"
                event.error_message = str(e)[:2000]
                event.processing_ms = processing_ms
                event.completed_at = datetime.now(timezone.utc)
                await db.commit()
        raise  # Let queue retry

    # Update event with agent response
    processing_ms = int((time.time() - start_time) * 1000)
    async with async_session_maker() as db:
        result = await db.execute(
            select(InboundWebhookEvent).where(InboundWebhookEvent.id == UUID(event_id))
        )
        event = result.scalar_one_or_none()
        if event:
            event.status = "completed"
            event.agent_response = resp_data
            event.processing_ms = processing_ms
            event.completed_at = datetime.now(timezone.utc)
            await db.commit()

        # Increment webhook event counter
        webhook_id = event.webhook_id if event else None
        if webhook_id:
            result = await db.execute(
                select(InboundWebhook).where(InboundWebhook.id == webhook_id)
            )
            webhook = result.scalar_one_or_none()
            if webhook:
                webhook.total_events = (webhook.total_events or 0) + 1
                webhook.last_event_at = datetime.now(timezone.utc)
                await db.commit()

    logger.info("Inbound webhook event %s processed in %dms", event_id, processing_ms)


def register(dispatcher: "TaskDispatcher") -> None:
    from app.services.queue.dispatcher import TaskDispatcher
    dispatcher.register(TASK_TYPE, handle, max_attempts=3, timeout=130.0)
