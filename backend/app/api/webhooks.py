"""
Outbound Webhooks API

CRUD for outbound webhook subscriptions + delivery log + test endpoint.
"""

import hashlib
import hmac
import logging
import secrets
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import httpx
import orjson
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.config import settings
from app.core.deps import AdminUser, DbSession, OperatorUser
from app.core.secrets import decrypt_webhook_secret, encrypt_webhook_secret
from app.db.models import Webhook, WebhookDelivery
from app.schemas.webhooks import (
    WEBHOOK_EVENT_TYPES,
    WebhookCreateRequest,
    WebhookCreatedResponse,
    WebhookDeliveryListResponse,
    WebhookDeliveryResponse,
    WebhookResponse,
    WebhookTestResponse,
    WebhookUpdateRequest,
)

logger = logging.getLogger("paco.api.webhooks")

router = APIRouter(prefix="/webhooks", tags=["Outbound Webhooks"])


def _webhook_to_response(wh: Webhook) -> WebhookResponse:
    return WebhookResponse(
        id=str(wh.id),
        user_id=str(wh.user_id),
        name=wh.name,
        url=wh.url,
        events=wh.events or [],
        agent_id=str(wh.agent_id) if wh.agent_id else None,
        is_active=wh.is_active,
        description=wh.description,
        has_secret=bool(wh.secret),
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )


# =============================================================================
# CRUD
# =============================================================================


@router.post("", response_model=WebhookCreatedResponse, status_code=201)
async def create_webhook(
    request: WebhookCreateRequest,
    db: DbSession,
    user: AdminUser,
) -> WebhookCreatedResponse:
    """Create outbound webhook with auto-generated signing secret."""
    # Generate signing secret
    secret_plain = secrets.token_hex(32)
    secret_encrypted = encrypt_webhook_secret(secret_plain)

    agent_id = UUID(request.agent_id) if request.agent_id else None

    wh = Webhook(
        user_id=UUID(user.user_id),
        name=request.name,
        url=request.url,
        secret=secret_encrypted,
        events=request.events,
        agent_id=agent_id,
        description=request.description,
    )
    db.add(wh)
    await db.commit()
    await db.refresh(wh)

    return WebhookCreatedResponse(
        id=str(wh.id),
        user_id=str(wh.user_id),
        name=wh.name,
        url=wh.url,
        events=wh.events or [],
        agent_id=str(wh.agent_id) if wh.agent_id else None,
        is_active=wh.is_active,
        description=wh.description,
        has_secret=True,
        secret=secret_plain,  # Shown once
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )


@router.get("", response_model=List[WebhookResponse])
async def list_webhooks(
    db: DbSession,
    _: OperatorUser,
    agent_id: Optional[str] = Query(None),
) -> List[WebhookResponse]:
    """List outbound webhooks (optional agent_id filter)."""
    query = select(Webhook).order_by(Webhook.created_at.desc())
    if agent_id:
        query = query.where(Webhook.agent_id == UUID(agent_id))

    result = await db.execute(query)
    return [_webhook_to_response(wh) for wh in result.scalars().all()]


@router.get("/events")
async def list_event_types(_: OperatorUser) -> List[Dict[str, str]]:
    """List supported webhook event types."""
    return [et.model_dump() for et in WEBHOOK_EVENT_TYPES]


@router.get("/{webhook_id}", response_model=WebhookResponse)
async def get_webhook(
    webhook_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> WebhookResponse:
    """Get webhook detail."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return _webhook_to_response(wh)


@router.put("/{webhook_id}", response_model=WebhookResponse)
async def update_webhook(
    webhook_id: UUID,
    request: WebhookUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> WebhookResponse:
    """Update webhook, optionally rotate secret."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")

    for field in ["name", "url", "events", "is_active", "description"]:
        value = getattr(request, field)
        if value is not None:
            setattr(wh, field, value)

    if request.agent_id is not None:
        wh.agent_id = UUID(request.agent_id) if request.agent_id else None

    if request.rotate_secret:
        secret_plain = secrets.token_hex(32)
        wh.secret = encrypt_webhook_secret(secret_plain)

    await db.commit()
    await db.refresh(wh)
    return _webhook_to_response(wh)


@router.delete("/{webhook_id}", status_code=204)
async def delete_webhook(
    webhook_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete webhook + cascade deliveries."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
    await db.delete(wh)
    await db.commit()


# =============================================================================
# Test & Delivery Log
# =============================================================================


@router.post("/{webhook_id}/test", response_model=WebhookTestResponse)
async def test_webhook(
    webhook_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> WebhookTestResponse:
    """Send test ping event (sync delivery)."""
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")

    from uuid import uuid4

    event_payload = {
        "event_id": str(uuid4()),
        "event_type": "webhook.test",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "agent_id": str(wh.agent_id) if wh.agent_id else None,
        "agent_name": None,
        "data": {"message": "This is a test webhook delivery from PACO"},
    }

    body_bytes = orjson.dumps(event_payload)

    # Build headers
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "PACO-Webhook/1.0",
        "X-Paco-Event": "webhook.test",
    }

    # Sign if secret exists
    if wh.secret:
        try:
            secret_plain = decrypt_webhook_secret(wh.secret)
            signature = hmac.new(
                secret_plain.encode(),
                body_bytes,
                hashlib.sha256,
            ).hexdigest()
            headers["X-Paco-Signature-256"] = f"sha256={signature}"
        except Exception as e:
            logger.warning("Failed to sign test webhook %s: %s", webhook_id, e)

    # Create delivery record
    delivery = WebhookDelivery(
        webhook_id=wh.id,
        event_type="webhook.test",
        payload=event_payload,
        status="pending",
    )
    db.add(delivery)
    await db.commit()
    await db.refresh(delivery)

    # Deliver synchronously
    try:
        async with httpx.AsyncClient(timeout=settings.webhook_delivery_timeout) as client:
            resp = await client.post(wh.url, content=body_bytes, headers=headers)
            delivery.response_status_code = resp.status_code
            delivery.response_body = resp.text[:2048]
            delivery.attempts = 1
            if resp.is_success:
                delivery.status = "delivered"
                delivery.delivered_at = datetime.now(timezone.utc)
            else:
                delivery.status = "failed"
                delivery.error_message = f"HTTP {resp.status_code}"
    except Exception as e:
        delivery.status = "failed"
        delivery.error_message = str(e)[:2000]
        delivery.attempts = 1

    await db.commit()

    return WebhookTestResponse(
        success=delivery.status == "delivered",
        delivery_id=str(delivery.id),
        status_code=delivery.response_status_code,
        error=delivery.error_message,
    )


@router.get("/{webhook_id}/deliveries", response_model=WebhookDeliveryListResponse)
async def list_deliveries(
    webhook_id: UUID,
    db: DbSession,
    _: OperatorUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> WebhookDeliveryListResponse:
    """Delivery log with pagination."""
    # Verify webhook exists
    result = await db.execute(select(Webhook).where(Webhook.id == webhook_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Webhook not found")

    # Count
    count_result = await db.execute(
        select(func.count(WebhookDelivery.id)).where(
            WebhookDelivery.webhook_id == webhook_id
        )
    )
    total = count_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * per_page
    result = await db.execute(
        select(WebhookDelivery)
        .where(WebhookDelivery.webhook_id == webhook_id)
        .order_by(WebhookDelivery.created_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    deliveries = [
        WebhookDeliveryResponse(
            id=str(d.id),
            webhook_id=str(d.webhook_id),
            event_type=d.event_type,
            payload=d.payload or {},
            status=d.status,
            response_status_code=d.response_status_code,
            response_body=d.response_body,
            attempts=d.attempts,
            max_attempts=d.max_attempts,
            next_retry_at=d.next_retry_at,
            error_message=d.error_message,
            created_at=d.created_at,
            delivered_at=d.delivered_at,
        )
        for d in result.scalars().all()
    ]

    return WebhookDeliveryListResponse(
        deliveries=deliveries,
        total=total,
        page=page,
        per_page=per_page,
    )


@router.post("/{webhook_id}/deliveries/{delivery_id}/retry", response_model=WebhookDeliveryResponse)
async def retry_delivery(
    webhook_id: UUID,
    delivery_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> WebhookDeliveryResponse:
    """Retry a failed delivery."""
    result = await db.execute(
        select(WebhookDelivery).where(
            WebhookDelivery.id == delivery_id,
            WebhookDelivery.webhook_id == webhook_id,
        )
    )
    delivery = result.scalar_one_or_none()
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    if delivery.status == "delivered":
        raise HTTPException(status_code=409, detail="Delivery already succeeded")

    # Re-enqueue the delivery task
    try:
        from app.services.queue.redis_pool import get_queue_redis
        from app.services.queue.core import enqueue_task

        redis = await get_queue_redis()
        await enqueue_task(redis, "webhook_delivery", {
            "webhook_id": str(webhook_id),
            "event_type": delivery.event_type,
            "payload": delivery.payload,
        })
    except Exception as e:
        logger.error("Failed to enqueue webhook retry: %s", e)
        raise HTTPException(status_code=500, detail="Failed to enqueue retry")

    return WebhookDeliveryResponse(
        id=str(delivery.id),
        webhook_id=str(delivery.webhook_id),
        event_type=delivery.event_type,
        payload=delivery.payload or {},
        status=delivery.status,
        response_status_code=delivery.response_status_code,
        response_body=delivery.response_body,
        attempts=delivery.attempts,
        max_attempts=delivery.max_attempts,
        next_retry_at=delivery.next_retry_at,
        error_message=delivery.error_message,
        created_at=delivery.created_at,
        delivered_at=delivery.delivered_at,
    )
