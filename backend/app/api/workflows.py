"""
PACO Workflows API

Workflow CRUD endpoints for saving/loading builder workflows to database.
"""

import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession, OperatorUser
from app.db.models import Flow

router = APIRouter(prefix="/workflows", tags=["Workflows"])


# =============================================================================
# Pydantic Models
# =============================================================================


class WorkflowResponse(BaseModel):
    """Workflow response model."""

    id: str
    name: str
    description: Optional[str]
    config: Dict[str, Any]
    is_enabled: bool
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str]

    class Config:
        from_attributes = True


class WorkflowListResponse(BaseModel):
    """List of workflows response."""

    workflows: List[WorkflowResponse]


class WorkflowCreateRequest(BaseModel):
    """Workflow creation request."""

    name: str
    description: Optional[str] = None
    config: Dict[str, Any]


class WorkflowUpdateRequest(BaseModel):
    """Workflow update request."""

    name: Optional[str] = None
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None


# =============================================================================
# Helper Functions
# =============================================================================


def flow_to_response(flow: Flow) -> WorkflowResponse:
    """Convert Flow model to WorkflowResponse."""
    # Parse JSON from config_yaml column
    try:
        config = json.loads(flow.config_yaml) if flow.config_yaml else {}
    except json.JSONDecodeError:
        config = {}

    return WorkflowResponse(
        id=str(flow.id),
        name=flow.name,
        description=flow.description,
        config=config,
        is_enabled=flow.is_enabled,
        created_at=flow.created_at,
        updated_at=flow.updated_at,
        created_by=str(flow.created_by) if flow.created_by else None,
    )


# =============================================================================
# Endpoints
# =============================================================================


@router.get("", response_model=List[WorkflowResponse])
async def list_workflows(
    db: DbSession,
    user: CurrentUser,
) -> List[WorkflowResponse]:
    """
    List workflows for the current user.

    Returns all workflows created by the authenticated user.
    """
    result = await db.execute(
        select(Flow)
        .where(Flow.created_by == user.user_id)
        .order_by(Flow.updated_at.desc())
    )
    flows = result.scalars().all()

    return [flow_to_response(flow) for flow in flows]


@router.get("/{workflow_id}", response_model=WorkflowResponse)
async def get_workflow(
    workflow_id: UUID,
    db: DbSession,
    user: CurrentUser,
) -> WorkflowResponse:
    """
    Get a single workflow by ID.

    Returns 404 if not found.
    """
    result = await db.execute(select(Flow).where(Flow.id == workflow_id))
    flow = result.scalar_one_or_none()

    if not flow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow {workflow_id} not found",
        )

    return flow_to_response(flow)


@router.post("", response_model=WorkflowResponse, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    request: WorkflowCreateRequest,
    db: DbSession,
    user: OperatorUser,
) -> WorkflowResponse:
    """
    Create a new workflow.

    Requires operator or admin role.
    """
    # Validate JSON config
    try:
        config_json = json.dumps(request.config)
    except (TypeError, ValueError) as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid JSON configuration: {e}",
        )

    # Check for duplicate name for this user
    result = await db.execute(
        select(Flow).where(
            Flow.name == request.name,
            Flow.created_by == user.user_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Workflow '{request.name}' already exists",
        )

    flow = Flow(
        name=request.name,
        description=request.description,
        config_yaml=config_json,  # Store JSON in config_yaml column
        is_enabled=True,
        created_by=user.user_id,
    )
    db.add(flow)
    await db.commit()
    await db.refresh(flow)

    return flow_to_response(flow)


@router.put("/{workflow_id}", response_model=WorkflowResponse)
async def update_workflow(
    workflow_id: UUID,
    request: WorkflowUpdateRequest,
    db: DbSession,
    user: OperatorUser,
) -> WorkflowResponse:
    """
    Update an existing workflow.

    Requires operator or admin role. User must be the workflow owner.
    """
    result = await db.execute(select(Flow).where(Flow.id == workflow_id))
    flow = result.scalar_one_or_none()

    if not flow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow {workflow_id} not found",
        )

    # Check ownership
    if flow.created_by != user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own workflows",
        )

    # Update fields if provided
    if request.name is not None:
        # Check for duplicate name (excluding current workflow)
        existing = await db.execute(
            select(Flow).where(
                Flow.name == request.name,
                Flow.created_by == user.user_id,
                Flow.id != workflow_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Workflow '{request.name}' already exists",
            )
        flow.name = request.name

    if request.description is not None:
        flow.description = request.description

    if request.config is not None:
        try:
            flow.config_yaml = json.dumps(request.config)
        except (TypeError, ValueError) as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON configuration: {e}",
            )

    await db.commit()
    await db.refresh(flow)

    return flow_to_response(flow)


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: UUID,
    db: DbSession,
    user: OperatorUser,
) -> None:
    """
    Delete a workflow.

    Requires operator or admin role. User must be the workflow owner.
    """
    result = await db.execute(select(Flow).where(Flow.id == workflow_id))
    flow = result.scalar_one_or_none()

    if not flow:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Workflow {workflow_id} not found",
        )

    # Check ownership
    if flow.created_by != user.user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only delete your own workflows",
        )

    await db.delete(flow)
    await db.commit()
