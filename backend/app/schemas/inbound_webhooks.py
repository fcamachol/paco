"""
Inbound Webhook Pydantic Schemas
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class InboundWebhookCreate(BaseModel):
    name: str = Field(..., max_length=255)
    description: Optional[str] = None
    source: Optional[str] = Field(None, max_length=100)  # chatwoot, slack, github, generic
    processing_mode: str = Field("async", pattern="^(async|sync)$")
    secret: Optional[str] = None
    signature_header: Optional[str] = Field(None, max_length=100)
    prompt_template: Optional[str] = None


class InboundWebhookUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    description: Optional[str] = None
    source: Optional[str] = Field(None, max_length=100)
    processing_mode: Optional[str] = Field(None, pattern="^(async|sync)$")
    is_active: Optional[bool] = None
    secret: Optional[str] = None
    signature_header: Optional[str] = Field(None, max_length=100)
    prompt_template: Optional[str] = None


class InboundWebhookResponse(BaseModel):
    id: str
    agent_id: str
    name: str
    description: Optional[str] = None
    token: str
    url: str  # computed: /api/webhooks/in/{token}
    source: Optional[str] = None
    is_active: bool = True
    processing_mode: str = "async"
    has_secret: bool = False
    signature_header: Optional[str] = None
    prompt_template: Optional[str] = None
    total_events: int = 0
    last_event_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class InboundWebhookCreatedResponse(InboundWebhookResponse):
    """Returned on creation — includes the secret (shown once)."""
    secret: Optional[str] = None


class InboundWebhookEventResponse(BaseModel):
    id: str
    webhook_id: str
    source_ip: Optional[str] = None
    headers: Dict[str, Any] = {}
    payload: Dict[str, Any] = {}
    prompt_sent: Optional[str] = None
    status: str = "received"
    agent_response: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    processing_ms: Optional[int] = None
    signature_valid: Optional[bool] = None
    received_at: datetime
    completed_at: Optional[datetime] = None


class InboundWebhookEventList(BaseModel):
    events: List[InboundWebhookEventResponse]
    total: int
    page: int
    per_page: int
