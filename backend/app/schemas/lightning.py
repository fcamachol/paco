"""
Agent Lightning Pydantic Schemas

Types for training runs, datasets, rewards, and rollout configuration.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class TrainingStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"
    canceled = "canceled"


class RewardFunctionType(str, Enum):
    llm_judge = "llm_judge"
    keyword_match = "keyword_match"
    regex_match = "regex_match"
    custom = "custom"


class DatasetItemCreate(BaseModel):
    """A single task item for training."""
    prompt: str
    expected_output: Optional[str] = None
    metadata: Dict[str, Any] = {}


class DatasetCreate(BaseModel):
    """Create a training dataset."""
    name: str
    description: Optional[str] = None
    agent_id: str
    items: List[DatasetItemCreate] = []


class DatasetResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    agent_id: str
    item_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class TrainingRunCreate(BaseModel):
    """Launch a training run."""
    agent_id: str
    dataset_id: str
    algorithm: str = "apo"
    reward_function: RewardFunctionType = RewardFunctionType.llm_judge
    reward_config: Dict[str, Any] = {}
    max_epochs: int = 10
    config: Dict[str, Any] = {}


class TrainingRunResponse(BaseModel):
    id: str
    agent_id: str
    dataset_id: str
    algorithm: str
    status: TrainingStatus
    reward_function: str
    current_epoch: int = 0
    max_epochs: int
    best_reward: Optional[float] = None
    metrics: Dict[str, Any] = {}
    optimized_prompt: Optional[str] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LightningConfigUpdate(BaseModel):
    """Update an agent's lightning_config."""
    enabled: bool = False
    reward_function: RewardFunctionType = RewardFunctionType.llm_judge
    reward_config: Dict[str, Any] = {}
    training_schedule: Optional[str] = None
