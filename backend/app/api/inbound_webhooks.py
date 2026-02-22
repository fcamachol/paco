"""
Inbound Webhooks API

CRUD (JWT-authenticated) + public receiver (token-authenticated).
External services POST to /api/webhooks/in/{token} to reach agents.
"""

import hashlib
import hmac
import json
import logging
import re
import secrets
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, select, update as sa_update
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.deps import AdminUser, DbSession, OperatorUser
from app.core.secrets import encrypt_webhook_secret, decrypt_webhook_secret
from app.db.models import Agent, InboundWebhook, InboundWebhookEvent
from app.schemas.inbound_webhooks import (
    InboundWebhookCreate,
    InboundWebhookCreatedResponse,
    InboundWebhookEventList,
    InboundWebhookEventResponse,
    InboundWebhookResponse,
    InboundWebhookUpdate,
)

logger = logging.getLogger("paco.api.inbound_webhooks")

MAX_PAYLOAD_SIZE = 1_048_576  # 1 MB

# CRUD router (nested under /api/agents/{agent_id}/webhooks/in)
crud_router = APIRouter(tags=["Inbound Webhooks"])

# Public receiver router (at /api/webhooks/in/{token})
receiver_router = APIRouter(tags=["Inbound Webhooks"])


def _webhook_to_response(wh: InboundWebhook) -> InboundWebhookResponse:
    return InboundWebhookResponse(
        id=str(wh.id),
        agent_id=str(wh.agent_id),
        name=wh.name,
        description=wh.description,
        token=wh.token,
        url=f"/api/webhooks/in/{wh.token}",
        source=wh.source,
        is_active=wh.is_active,
        processing_mode=wh.processing_mode,
        has_secret=bool(wh.secret),
        signature_header=wh.signature_header,
        prompt_template=wh.prompt_template,
        total_events=wh.total_events or 0,
        last_event_at=wh.last_event_at,
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )


# =============================================================================
# CRUD Endpoints
# =============================================================================


@crud_router.get("", response_model=List[InboundWebhookResponse])
async def list_inbound_webhooks(
    agent_id: UUID,
    db: DbSession,
    _: OperatorUser,
) -> List[InboundWebhookResponse]:
    """List agent's inbound webhooks."""
    result = await db.execute(
        select(InboundWebhook)
        .where(InboundWebhook.agent_id == agent_id)
        .order_by(InboundWebhook.created_at.desc())
    )
    return [_webhook_to_response(wh) for wh in result.scalars().all()]


@crud_router.post("", response_model=InboundWebhookCreatedResponse, status_code=201)
async def create_inbound_webhook(
    agent_id: UUID,
    request: InboundWebhookCreate,
    db: DbSession,
    _: OperatorUser,
) -> InboundWebhookCreatedResponse:
    """Create inbound webhook for an agent."""
    # Verify agent exists
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")

    token = secrets.token_hex(32)  # 64 char hex string

    wh = InboundWebhook(
        agent_id=agent_id,
        name=request.name,
        description=request.description,
        token=token,
        source=request.source,
        processing_mode=request.processing_mode,
        secret=encrypt_webhook_secret(request.secret) if request.secret else None,
        signature_header=request.signature_header,
        prompt_template=request.prompt_template,
    )
    db.add(wh)
    await db.commit()
    await db.refresh(wh)

    resp = InboundWebhookCreatedResponse(
        id=str(wh.id),
        agent_id=str(wh.agent_id),
        name=wh.name,
        description=wh.description,
        token=wh.token,
        url=f"/api/webhooks/in/{wh.token}",
        source=wh.source,
        is_active=wh.is_active,
        processing_mode=wh.processing_mode,
        has_secret=bool(wh.secret),
        secret=request.secret,  # Shown once on creation (plaintext)
        signature_header=wh.signature_header,
        prompt_template=wh.prompt_template,
        total_events=0,
        last_event_at=None,
        created_at=wh.created_at,
        updated_at=wh.updated_at,
    )
    return resp


@crud_router.put("/{webhook_id}", response_model=InboundWebhookResponse)
async def update_inbound_webhook(
    agent_id: UUID,
    webhook_id: UUID,
    request: InboundWebhookUpdate,
    db: DbSession,
    _: OperatorUser,
) -> InboundWebhookResponse:
    """Update webhook config."""
    result = await db.execute(
        select(InboundWebhook).where(
            InboundWebhook.id == webhook_id,
            InboundWebhook.agent_id == agent_id,
        )
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Inbound webhook not found")

    for field in ["name", "description", "source", "processing_mode", "is_active",
                   "signature_header", "prompt_template"]:
        value = getattr(request, field)
        if value is not None:
            setattr(wh, field, value)

    # Encrypt secret separately
    if request.secret is not None:
        wh.secret = encrypt_webhook_secret(request.secret) if request.secret else None

    await db.commit()
    await db.refresh(wh)
    return _webhook_to_response(wh)


@crud_router.delete("/{webhook_id}", status_code=204)
async def delete_inbound_webhook(
    agent_id: UUID,
    webhook_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete webhook + cascade events."""
    result = await db.execute(
        select(InboundWebhook).where(
            InboundWebhook.id == webhook_id,
            InboundWebhook.agent_id == agent_id,
        )
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Inbound webhook not found")
    await db.delete(wh)
    await db.commit()


@crud_router.post("/{webhook_id}/regenerate-token", response_model=InboundWebhookResponse)
async def regenerate_webhook_token(
    agent_id: UUID,
    webhook_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> InboundWebhookResponse:
    """Regenerate URL token (old URL stops working)."""
    result = await db.execute(
        select(InboundWebhook).where(
            InboundWebhook.id == webhook_id,
            InboundWebhook.agent_id == agent_id,
        )
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Inbound webhook not found")

    wh.token = secrets.token_hex(32)
    await db.commit()
    await db.refresh(wh)
    return _webhook_to_response(wh)


@crud_router.get("/{webhook_id}/events", response_model=InboundWebhookEventList)
async def list_webhook_events(
    agent_id: UUID,
    webhook_id: UUID,
    db: DbSession,
    _: OperatorUser,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
) -> InboundWebhookEventList:
    """Event log with pagination."""
    # Verify webhook belongs to agent
    result = await db.execute(
        select(InboundWebhook).where(
            InboundWebhook.id == webhook_id,
            InboundWebhook.agent_id == agent_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Inbound webhook not found")

    # Count
    count_result = await db.execute(
        select(func.count(InboundWebhookEvent.id)).where(
            InboundWebhookEvent.webhook_id == webhook_id
        )
    )
    total = count_result.scalar() or 0

    # Fetch page
    offset = (page - 1) * per_page
    result = await db.execute(
        select(InboundWebhookEvent)
        .where(InboundWebhookEvent.webhook_id == webhook_id)
        .order_by(InboundWebhookEvent.received_at.desc())
        .offset(offset)
        .limit(per_page)
    )
    events = [
        InboundWebhookEventResponse(
            id=str(e.id),
            webhook_id=str(e.webhook_id),
            source_ip=e.source_ip,
            headers=e.headers or {},
            payload=e.payload or {},
            prompt_sent=e.prompt_sent,
            status=e.status,
            agent_response=e.agent_response,
            error_message=e.error_message,
            processing_ms=e.processing_ms,
            signature_valid=e.signature_valid,
            received_at=e.received_at,
            completed_at=e.completed_at,
        )
        for e in result.scalars().all()
    ]

    return InboundWebhookEventList(
        events=events,
        total=total,
        page=page,
        per_page=per_page,
    )


# =============================================================================
# Public Receiver
# =============================================================================


def _extract_prompt(payload: Dict[str, Any], template: Optional[str]) -> str:
    """Extract prompt from payload using template or forward raw JSON."""
    if not template:
        return json.dumps(payload, default=str)

    # Simple {{key}} replacement
    def replacer(match):
        key = match.group(1).strip()
        # Support nested keys with dot notation
        value = payload
        for part in key.split("."):
            if isinstance(value, dict):
                value = value.get(part, "")
            else:
                value = ""
                break
        return str(value)

    return re.sub(r"\{\{(.+?)\}\}", replacer, template)


def _verify_signature(
    body: bytes,
    secret: str,
    signature_header: str,
    headers: Dict[str, str],
) -> bool:
    """Verify HMAC-SHA256 signature from source."""
    received_sig = headers.get(signature_header, "")
    if not received_sig:
        return False

    # Strip common prefixes
    for prefix in ("sha256=", "sha1="):
        if received_sig.startswith(prefix):
            received_sig = received_sig[len(prefix):]
            break

    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, received_sig)


@receiver_router.post("/webhooks/in/{token}")
async def receive_inbound_webhook(
    token: str,
    request: Request,
    db: DbSession,
) -> Dict[str, Any]:
    """Public receiver — external services POST here. Token IS the auth."""
    # Look up webhook by token
    result = await db.execute(
        select(InboundWebhook)
        .where(InboundWebhook.token == token)
        .options(selectinload(InboundWebhook.agent))
    )
    wh = result.scalar_one_or_none()
    if not wh:
        raise HTTPException(status_code=404, detail="Webhook not found")
    if not wh.is_active:
        raise HTTPException(status_code=403, detail="Webhook is inactive")

    agent = wh.agent
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Reject oversized payloads
    content_length = int(request.headers.get("content-length", 0))
    if content_length > MAX_PAYLOAD_SIZE:
        raise HTTPException(
            status_code=413,
            detail=f"Payload too large. Maximum size is {MAX_PAYLOAD_SIZE} bytes.",
        )

    # Parse body
    body = await request.body()
    try:
        payload = json.loads(body) if body else {}
    except json.JSONDecodeError:
        payload = {"raw": body.decode("utf-8", errors="replace")}

    # Collect headers, stripping sensitive values
    SENSITIVE_HEADERS = {"authorization", "cookie", "x-api-key", "x-auth-token"}
    headers_dict = {
        k: v for k, v in request.headers.items()
        if k.lower() not in SENSITIVE_HEADERS
    }

    # Source IP
    source_ip = request.client.host if request.client else None

    # Signature verification
    signature_valid = None
    if wh.secret and wh.signature_header:
        try:
            plain_secret = decrypt_webhook_secret(wh.secret)
        except Exception:
            logger.warning("Failed to decrypt inbound webhook secret for webhook %s", wh.id)
            plain_secret = wh.secret  # Fallback for pre-encryption secrets
        signature_valid = _verify_signature(body, plain_secret, wh.signature_header, headers_dict)
        if not signature_valid:
            # Log the rejected event
            event = InboundWebhookEvent(
                webhook_id=wh.id,
                source_ip=source_ip,
                headers=headers_dict,
                payload=payload,
                status="rejected",
                signature_valid=False,
                received_at=datetime.now(timezone.utc),
            )
            db.add(event)
            await db.commit()
            raise HTTPException(status_code=401, detail="Invalid signature")

    # Extract prompt
    prompt = _extract_prompt(payload, wh.prompt_template)

    # Create event record
    event = InboundWebhookEvent(
        webhook_id=wh.id,
        source_ip=source_ip,
        headers=headers_dict,
        payload=payload,
        prompt_sent=prompt,
        status="received",
        signature_valid=signature_valid,
        received_at=datetime.now(timezone.utc),
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # Async mode: enqueue task, return immediately
    if wh.processing_mode == "async":
        try:
            from app.services.queue.redis_pool import get_queue_redis
            from app.services.queue.core import enqueue_task

            redis = await get_queue_redis()
            await enqueue_task(redis, "inbound_webhook_process", {
                "event_id": str(event.id),
                "agent_port": agent.port,
                "prompt": prompt,
            })
        except Exception as e:
            logger.warning("Failed to enqueue inbound webhook: %s", e)
            event.status = "failed"
            event.error_message = f"Queue error: {e}"
            await db.commit()
            raise HTTPException(status_code=500, detail="Failed to process webhook")

        return {"status": "accepted", "event_id": str(event.id)}

    # Sync mode: route to agent inline
    if not agent.port:
        event.status = "failed"
        event.error_message = "Agent has no port configured"
        await db.commit()
        raise HTTPException(status_code=503, detail="Agent has no port configured")

    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"http://localhost:{agent.port}/api/execute",
                json={"prompt": prompt},
            )
            resp_data = resp.json()
    except Exception as e:
        processing_ms = int((time.time() - start_time) * 1000)
        event.status = "failed"
        event.error_message = str(e)[:2000]
        event.processing_ms = processing_ms
        event.completed_at = datetime.now(timezone.utc)
        await db.commit()
        raise HTTPException(status_code=502, detail="Agent processing failed")

    processing_ms = int((time.time() - start_time) * 1000)
    event.status = "completed"
    event.agent_response = resp_data
    event.processing_ms = processing_ms
    event.completed_at = datetime.now(timezone.utc)

    # Increment counter atomically
    await db.execute(
        sa_update(InboundWebhook)
        .where(InboundWebhook.id == wh.id)
        .values(
            total_events=InboundWebhook.total_events + 1,
            last_event_at=datetime.now(timezone.utc),
        )
    )

    await db.commit()

    return resp_data
