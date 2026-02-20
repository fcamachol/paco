"""
Task: webhook_delivery

Delivers outbound webhook events via HTTP POST with HMAC-SHA256 signing.
Updates WebhookDelivery record with response status.

Payload:
  - webhook_id: str (UUID)
  - event_type: str
  - payload: dict (the event payload to deliver)
"""

import hashlib
import hmac
import logging
from datetime import datetime, timezone
from typing import Any, Dict
from uuid import UUID

import httpx
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.config import settings
from app.core.secrets import decrypt_webhook_secret
from app.db.models import Webhook, WebhookDelivery
from app.db.session import async_session_maker

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "webhook_delivery"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    webhook_id = payload.get("webhook_id")
    event_type = payload.get("event_type", "")
    event_payload = payload.get("payload", {})

    if not webhook_id:
        logger.warning("webhook_delivery: missing webhook_id")
        return

    # Fetch webhook config
    async with async_session_maker() as db:
        result = await db.execute(
            select(Webhook).where(Webhook.id == UUID(webhook_id))
        )
        webhook = result.scalar_one_or_none()

    if not webhook or not webhook.is_active:
        logger.info("Webhook %s inactive or not found, skipping delivery", webhook_id)
        return

    # Create delivery record
    import orjson
    body_bytes = orjson.dumps(event_payload)

    async with async_session_maker() as db:
        delivery = WebhookDelivery(
            webhook_id=webhook.id,
            event_type=event_type,
            payload=event_payload,
            status="pending",
            max_attempts=settings.webhook_max_attempts,
        )
        db.add(delivery)
        await db.commit()
        await db.refresh(delivery)
        delivery_id = delivery.id

    # Build headers
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "PACO-Webhook/1.0",
        "X-Paco-Event": event_type,
        "X-Paco-Delivery": str(delivery_id),
    }

    # HMAC-SHA256 signing
    if webhook.secret:
        try:
            secret_plain = decrypt_webhook_secret(webhook.secret)
            signature = hmac.new(
                secret_plain.encode(),
                body_bytes,
                hashlib.sha256,
            ).hexdigest()
            headers["X-Paco-Signature-256"] = f"sha256={signature}"
        except Exception as e:
            logger.warning("Failed to sign webhook %s: %s", webhook_id, e)

    # Deliver
    response_status = None
    response_body = None
    error_msg = None

    try:
        async with httpx.AsyncClient(timeout=settings.webhook_delivery_timeout) as client:
            resp = await client.post(
                webhook.url,
                content=body_bytes,
                headers=headers,
            )
            response_status = resp.status_code
            response_body = resp.text[:2048]  # Truncate to 2KB
            resp.raise_for_status()
    except httpx.HTTPStatusError:
        error_msg = f"HTTP {response_status}: {response_body[:500] if response_body else 'no body'}"
    except Exception as e:
        error_msg = str(e)[:2000]

    # Update delivery record
    async with async_session_maker() as db:
        result = await db.execute(
            select(WebhookDelivery).where(WebhookDelivery.id == delivery_id)
        )
        dlv = result.scalar_one_or_none()
        if dlv:
            dlv.attempts += 1
            dlv.response_status_code = response_status
            dlv.response_body = response_body
            if error_msg:
                dlv.status = "failed"
                dlv.error_message = error_msg
            else:
                dlv.status = "delivered"
                dlv.delivered_at = datetime.now(timezone.utc)
            await db.commit()

    if error_msg:
        logger.warning("Webhook delivery %s failed: %s", delivery_id, error_msg[:200])
        raise Exception(error_msg)  # Let queue handle retry

    logger.info("Webhook delivery %s to %s succeeded (HTTP %d)", delivery_id, webhook.url, response_status)


def register(dispatcher: "TaskDispatcher") -> None:
    from app.services.queue.dispatcher import TaskDispatcher
    dispatcher.register(TASK_TYPE, handle, max_attempts=5, timeout=20.0)
