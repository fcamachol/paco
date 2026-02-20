"""
A2A Protocol Pydantic Models

Types defined per the A2A (Agent-to-Agent) protocol specification v0.3.
Covers Agent Cards, JSON-RPC messaging, tasks, messages, artifacts, and parts.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Literal, Optional, Union
from uuid import UUID

from pydantic import BaseModel, Field


# =============================================================================
# Enums
# =============================================================================


class TaskStatus(str, Enum):
    submitted = "submitted"
    working = "working"
    input_required = "input-required"
    completed = "completed"
    failed = "failed"
    canceled = "canceled"


# =============================================================================
# Parts (content types within Messages and Artifacts)
# =============================================================================


class TextPart(BaseModel):
    type: Literal["text"] = "text"
    text: str


class FilePart(BaseModel):
    type: Literal["file"] = "file"
    file: Dict[str, Any]  # { name, mimeType, bytes | uri }


class DataPart(BaseModel):
    type: Literal["data"] = "data"
    data: Dict[str, Any]


Part = Union[TextPart, FilePart, DataPart]


# =============================================================================
# Messages and Artifacts
# =============================================================================


class Message(BaseModel):
    role: Literal["user", "agent"]
    parts: List[Part]
    metadata: Optional[Dict[str, Any]] = None


class Artifact(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parts: List[Part]
    index: int = 0
    append: Optional[bool] = None
    last_chunk: Optional[bool] = None
    metadata: Optional[Dict[str, Any]] = None


# =============================================================================
# Task
# =============================================================================


class TaskState(BaseModel):
    status: TaskStatus
    message: Optional[Message] = None
    timestamp: Optional[str] = None


class A2ATask(BaseModel):
    id: str
    status: TaskStatus
    artifacts: Optional[List[Artifact]] = None
    history: Optional[List[Message]] = None
    metadata: Optional[Dict[str, Any]] = None


# =============================================================================
# Agent Card (Discovery Document)
# =============================================================================


class AgentAuthentication(BaseModel):
    schemes: List[str] = ["bearer"]
    credentials: Optional[str] = None


class AgentCapabilities(BaseModel):
    streaming: bool = False
    push_notifications: bool = False
    state_transition_history: bool = False


class AgentSkillCard(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    tags: Optional[List[str]] = None
    examples: Optional[List[str]] = None
    input_modes: Optional[List[str]] = None
    output_modes: Optional[List[str]] = None


class AgentProvider(BaseModel):
    organization: str
    url: Optional[str] = None


class AgentCard(BaseModel):
    name: str
    description: Optional[str] = None
    url: str
    version: str = "0.3"
    protocol_version: str = Field(default="0.3", alias="protocolVersion")
    capabilities: AgentCapabilities = AgentCapabilities()
    authentication: Optional[AgentAuthentication] = None
    default_input_modes: List[str] = Field(
        default=["text"], alias="defaultInputModes"
    )
    default_output_modes: List[str] = Field(
        default=["text"], alias="defaultOutputModes"
    )
    skills: List[AgentSkillCard] = []
    provider: Optional[AgentProvider] = None

    class Config:
        populate_by_name = True


# =============================================================================
# JSON-RPC 2.0
# =============================================================================


class JSONRPCRequest(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: Optional[Union[str, int]] = None
    method: str
    params: Optional[Dict[str, Any]] = None


class JSONRPCError(BaseModel):
    code: int
    message: str
    data: Optional[Any] = None


class JSONRPCResponse(BaseModel):
    jsonrpc: Literal["2.0"] = "2.0"
    id: Optional[Union[str, int]] = None
    result: Optional[Any] = None
    error: Optional[JSONRPCError] = None


# =============================================================================
# Task RPC Params
# =============================================================================


class TaskSendParams(BaseModel):
    id: Optional[str] = None
    message: Message
    metadata: Optional[Dict[str, Any]] = None


class TaskQueryParams(BaseModel):
    id: str
    history_length: Optional[int] = Field(None, alias="historyLength")

    class Config:
        populate_by_name = True


class TaskCancelParams(BaseModel):
    id: str
    metadata: Optional[Dict[str, Any]] = None


# =============================================================================
# SSE Events
# =============================================================================


class TaskStatusUpdateEvent(BaseModel):
    type: Literal["status"] = "status"
    task_id: str = Field(alias="taskId")
    status: TaskStatus
    message: Optional[Message] = None
    final: bool = False
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


class TaskArtifactUpdateEvent(BaseModel):
    type: Literal["artifact"] = "artifact"
    task_id: str = Field(alias="taskId")
    artifact: Artifact
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        populate_by_name = True


A2AEvent = Union[TaskStatusUpdateEvent, TaskArtifactUpdateEvent]


# =============================================================================
# External Agent Registration (for outbound calls)
# =============================================================================


class ExternalAgentCreate(BaseModel):
    url: str
    name: Optional[str] = None
    description: Optional[str] = None


class ExternalAgentResponse(BaseModel):
    id: str
    url: str
    name: Optional[str] = None
    description: Optional[str] = None
    agent_card: Optional[AgentCard] = None
    last_discovered_at: Optional[datetime] = None
    created_at: datetime
