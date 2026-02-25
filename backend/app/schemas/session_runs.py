from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


# ---------------------------------------------------------------------------
# Ingestion schemas (agent -> PACO)
# ---------------------------------------------------------------------------


class CreateSessionRunRequest(BaseModel):
    agent_id: Optional[str] = None
    source: str = "playground"  # playground/api/webhook/a2a/company
    title: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    user_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class AppendMessageRequest(BaseModel):
    role: str  # user/assistant/system/tool_use/tool_result
    content_text: Optional[str] = None
    content_blocks: Optional[Any] = None  # JSONB -- full Anthropic API content blocks
    tool_name: Optional[str] = None
    tool_call_id: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cost: Optional[float] = None
    latency_ms: Optional[int] = None
    model: Optional[str] = None
    stop_reason: Optional[str] = None
    raw_request: Optional[Dict[str, Any]] = None
    raw_response: Optional[Dict[str, Any]] = None
    thinking_content: Optional[str] = None
    execution_id: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class BatchAppendMessagesRequest(BaseModel):
    messages: List[AppendMessageRequest]  # max 50

    @field_validator("messages")
    @classmethod
    def validate_batch_size(cls, v: List[AppendMessageRequest]) -> List[AppendMessageRequest]:
        if len(v) > 50:
            raise ValueError("Batch size cannot exceed 50 messages")
        return v


class CompleteSessionRunRequest(BaseModel):
    status: str = "completed"  # completed/error/cancelled
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Response schemas (PACO -> frontend)
# ---------------------------------------------------------------------------


class SessionMessageResponse(BaseModel):
    id: str
    session_run_id: str
    execution_id: Optional[str] = None
    sequence_number: int
    role: str
    content_text: Optional[str] = None
    content_blocks: Optional[Any] = None
    tool_name: Optional[str] = None
    tool_call_id: Optional[str] = None
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None
    cost: Optional[float] = None
    latency_ms: Optional[int] = None
    model: Optional[str] = None
    stop_reason: Optional[str] = None
    thinking_content: Optional[str] = None
    message_hash: Optional[str] = None
    metadata: Dict[str, Any] = {}
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionMessageDetailResponse(SessionMessageResponse):
    """Includes raw API payloads."""

    raw_request: Optional[Dict[str, Any]] = None
    raw_response: Optional[Dict[str, Any]] = None


class SessionRunResponse(BaseModel):
    id: str
    agent_id: Optional[str] = None
    user_id: Optional[str] = None
    source: str
    title: Optional[str] = None
    status: str
    model: Optional[str] = None
    message_count: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_cost: float = 0
    total_duration_ms: int = 0
    started_at: datetime
    ended_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionRunDetailResponse(SessionRunResponse):
    """Includes messages list + system_prompt + execution_ids."""

    system_prompt: Optional[str] = None
    system_prompt_hash: Optional[str] = None
    integrity_hash: Optional[str] = None
    messages: List[SessionMessageResponse] = []
    execution_ids: List[str] = []
    metadata: Dict[str, Any] = {}


class SessionRunListResponse(BaseModel):
    items: List[SessionRunResponse]
    total: int
    page: int
    per_page: int


class SearchRequest(BaseModel):
    query: str
    agent_id: Optional[str] = None
    source: Optional[str] = None
    limit: int = 20


class SessionRunSearchResult(BaseModel):
    session_run_id: str
    title: Optional[str] = None
    source: str
    status: str
    message_id: str
    role: str
    content_text: Optional[str] = None
    headline: Optional[str] = None  # PostgreSQL ts_headline result
    created_at: datetime


class SessionRunSearchResponse(BaseModel):
    results: List[SessionRunSearchResult]
    total: int
    query: str


class VerifyIntegrityResponse(BaseModel):
    session_run_id: str
    integrity_valid: bool
    message_count: int
    errors: List[str] = []
