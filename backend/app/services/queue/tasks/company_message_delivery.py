"""
Task: company_message_delivery

Delivers inter-agent messages via HTTP POST with retry.
Updates CompanyMessage.status to "delivered" on success.

Payload:
  - message_id: str (UUID)
  - recipient_port: int
  - content: str
  - sender_slug: str
  - message_type: str
"""

import logging
from typing import Any, Dict
from uuid import UUID

import httpx
from redis.asyncio import Redis
from sqlalchemy import select

from app.db.models import CompanyMessage
from app.db.session import async_session_maker

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "company_message_delivery"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    message_id = payload.get("message_id")
    recipient_port = payload.get("recipient_port")
    content = payload.get("content")
    sender_slug = payload.get("sender_slug")
    message_type = payload.get("message_type", "direct")

    if not recipient_port or not message_id:
        logger.warning("company_message_delivery: missing recipient_port or message_id")
        return

    # Deliver via HTTP
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"http://localhost:{recipient_port}/api/message",
            json={
                "sender": sender_slug,
                "content": content,
                "type": message_type,
            },
        )
        resp.raise_for_status()

    # Update message status in DB
    async with async_session_maker() as db:
        result = await db.execute(
            select(CompanyMessage).where(CompanyMessage.id == UUID(message_id))
        )
        message = result.scalar_one_or_none()
        if message:
            message.status = "delivered"
            await db.commit()

    logger.info("Message %s delivered to port %d", message_id, recipient_port)


def register(dispatcher: "TaskDispatcher") -> None:
    from app.services.queue.dispatcher import TaskDispatcher
    dispatcher.register(TASK_TYPE, handle, max_attempts=5, timeout=20.0)
