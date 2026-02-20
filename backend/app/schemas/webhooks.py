"""
Outbound Webhook Pydantic Schemas
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class WebhookEventType(str, Enum):
    agent_started = "agent.started"
    agent_stopped = "agent.stopped"
    agent_crashed = "agent.crashed"
    agent_restarted = "agent.restarted"
    agent_config_changed = "agent.config_changed"
    execution_completed = "execution.completed"
    execution_failed = "execution.failed"
    execution_threshold_exceeded = "execution.threshold_exceeded"
    infra_health_check_failed = "infra.health_check_failed"
    infra_deployment_status = "infra.deployment_status"
    infra_hive_task_completed = "infra.hive_task_completed"


class WebhookEventTypeInfo(BaseModel):
    event_type: str
    description: str
    category: str


WEBHOOK_EVENT_TYPES: List[WebhookEventTypeInfo] = [
    WebhookEventTypeInfo(event_type="agent.started", description="Agent process started", category="Agent Lifecycle"),
    WebhookEventTypeInfo(event_type="agent.stopped", description="Agent process stopped", category="Agent Lifecycle"),
    WebhookEventTypeInfo(event_type="agent.crashed", description="Agent process crashed", category="Agent Lifecycle"),
    WebhookEventTypeInfo(event_type="agent.restarted", description="Agent process restarted", category="Agent Lifecycle"),
    WebhookEventTypeInfo(event_type="agent.config_changed", description="Agent configuration updated", category="Agent Lifecycle"),
    WebhookEventTypeInfo(event_type="execution.completed", description="Agent execution completed", category="Execution"),
    WebhookEventTypeInfo(event_type="execution.failed", description="Agent execution failed", category="Execution"),
    WebhookEventTypeInfo(event_type="execution.threshold_exceeded", description="Cost or token threshold exceeded", category="Execution"),
    WebhookEventTypeInfo(event_type="infra.health_check_failed", description="Infrastructure health check failed", category="Infrastructure"),
    WebhookEventTypeInfo(event_type="infra.deployment_status", description="Deployment status changed", category="Infrastructure"),
    WebhookEventTypeInfo(event_type="infra.hive_task_completed", description="Hive task completed", category="Infrastructure"),
]


class WebhookCreateRequest(BaseModel):
    name: str = Field(..., max_length=255)
    url: str = Field(..., max_length=2048)
    events: List[str] = Field(..., min_length=1)
    agent_id: Optional[str] = None  # null = global (all agents)
    description: Optional[str] = None


class WebhookUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    url: Optional[str] = Field(None, max_length=2048)
    events: Optional[List[str]] = None
    agent_id: Optional[str] = None
    is_active: Optional[bool] = None
    description: Optional[str] = None
    rotate_secret: bool = False


class WebhookResponse(BaseModel):
    id: str
    user_id: str
    name: str
    url: str
    events: List[str] = []
    agent_id: Optional[str] = None
    is_active: bool = True
    description: Optional[str] = None
    has_secret: bool = False
    created_at: datetime
    updated_at: datetime


class WebhookCreatedResponse(WebhookResponse):
    """Returned on creation — includes the secret (shown once)."""
    secret: str


class WebhookDeliveryResponse(BaseModel):
    id: str
    webhook_id: str
    event_type: str
    payload: Dict[str, Any] = {}
    status: str = "pending"
    response_status_code: Optional[int] = None
    response_body: Optional[str] = None
    attempts: int = 0
    max_attempts: int = 5
    next_retry_at: Optional[datetime] = None
    error_message: Optional[str] = None
    created_at: datetime
    delivered_at: Optional[datetime] = None


class WebhookDeliveryListResponse(BaseModel):
    deliveries: List[WebhookDeliveryResponse]
    total: int
    page: int
    per_page: int


class WebhookTestResponse(BaseModel):
    success: bool
    delivery_id: str
    status_code: Optional[int] = None
    error: Optional[str] = None


class WebhookEventPayload(BaseModel):
    event_id: str
    event_type: str
    timestamp: str
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    data: Dict[str, Any] = {}
