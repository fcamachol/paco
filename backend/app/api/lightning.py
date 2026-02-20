"""
PACO Agent Lightning API

Endpoints for managing training datasets, launching training runs,
and applying optimized resources back to agents.
"""

import asyncio
import traceback
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, HTTPException
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbSession, OperatorUser
from app.db.models import Agent, LightningDataset, LightningTrainingRun
from app.schemas.lightning import (
    DatasetCreate,
    DatasetResponse,
    LightningConfigUpdate,
    TrainingRunCreate,
    TrainingRunResponse,
)
from app.services.lightning.wrapper import run_training_epoch

router = APIRouter(prefix="/lightning", tags=["Agent Lightning"])


# -- Datasets --

@router.post("/datasets", response_model=DatasetResponse, status_code=201)
async def create_dataset(req: DatasetCreate, db: DbSession, _user: OperatorUser):
    """Create a training dataset for an agent."""
    ds = LightningDataset(
        name=req.name,
        description=req.description,
        agent_id=req.agent_id,
        items=[item.model_dump() for item in req.items],
        item_count=len(req.items),
    )
    db.add(ds)
    await db.commit()
    await db.refresh(ds)
    return DatasetResponse(
        id=str(ds.id), name=ds.name, description=ds.description,
        agent_id=str(ds.agent_id) if ds.agent_id else "",
        item_count=ds.item_count, created_at=ds.created_at,
    )


@router.get("/datasets", response_model=List[DatasetResponse])
async def list_datasets(db: DbSession, agent_id: Optional[UUID] = None):
    """List training datasets."""
    query = select(LightningDataset).order_by(LightningDataset.created_at.desc())
    if agent_id:
        query = query.where(LightningDataset.agent_id == agent_id)
    result = await db.execute(query)
    datasets = result.scalars().all()
    return [
        DatasetResponse(
            id=str(ds.id), name=ds.name, description=ds.description,
            agent_id=str(ds.agent_id) if ds.agent_id else "",
            item_count=ds.item_count, created_at=ds.created_at,
        ) for ds in datasets
    ]


@router.delete("/datasets/{dataset_id}", status_code=204)
async def delete_dataset(dataset_id: UUID, db: DbSession, _user: OperatorUser):
    """Delete a training dataset."""
    result = await db.execute(
        select(LightningDataset).where(LightningDataset.id == dataset_id)
    )
    ds = result.scalar_one_or_none()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    await db.delete(ds)
    await db.commit()


# -- Training Runs --

async def _run_training_background(run_id: str):
    """Background task that executes the training loop."""
    from app.db.session import async_session_maker

    async with async_session_maker() as db:
        result = await db.execute(
            select(LightningTrainingRun).where(LightningTrainingRun.id == run_id)
        )
        run = result.scalar_one_or_none()
        if not run:
            return

        # Load agent and dataset
        agent_result = await db.execute(select(Agent).where(Agent.id == run.agent_id))
        agent = agent_result.scalar_one_or_none()
        ds_result = await db.execute(
            select(LightningDataset).where(LightningDataset.id == run.dataset_id)
        )
        dataset = ds_result.scalar_one_or_none()

        if not agent or not dataset:
            run.status = "failed"
            run.error_message = "Agent or dataset not found"
            await db.commit()
            return

        run.status = "running"
        run.started_at = datetime.now(timezone.utc)
        await db.commit()

        system_prompt = agent.system_prompt or "You are a helpful assistant."
        best_reward = 0.0
        all_metrics = []

        try:
            for epoch in range(run.max_epochs):
                epoch_result = await run_training_epoch(
                    system_prompt=system_prompt,
                    model=agent.model,
                    dataset_items=dataset.items,
                    reward_function=run.reward_function,
                    reward_config=run.reward_config or {},
                )

                avg_reward = epoch_result["avg_reward"]
                all_metrics.append({
                    "epoch": epoch + 1,
                    "avg_reward": avg_reward,
                    "total_items": epoch_result["total_items"],
                })

                if avg_reward > best_reward:
                    best_reward = avg_reward

                run.current_epoch = epoch + 1
                run.best_reward = best_reward
                run.metrics = {"epochs": all_metrics}
                await db.commit()

            run.status = "completed"
            run.completed_at = datetime.now(timezone.utc)
            run.best_reward = best_reward
            run.metrics = {"epochs": all_metrics}
            await db.commit()

        except Exception as e:
            run.status = "failed"
            run.error_message = str(e)
            run.completed_at = datetime.now(timezone.utc)
            await db.commit()
            traceback.print_exc()


@router.post("/training-runs", response_model=TrainingRunResponse, status_code=201)
async def create_training_run(
    req: TrainingRunCreate,
    db: DbSession,
    background_tasks: BackgroundTasks,
    _user: OperatorUser,
):
    """Launch a new training run."""
    run = LightningTrainingRun(
        agent_id=req.agent_id,
        dataset_id=req.dataset_id,
        algorithm=req.algorithm,
        reward_function=req.reward_function.value,
        reward_config=req.reward_config,
        max_epochs=req.max_epochs,
        config=req.config,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # Launch training in background
    background_tasks.add_task(
        asyncio.to_thread,
        lambda: asyncio.run(_run_training_background(str(run.id))),
    )

    return TrainingRunResponse(
        id=str(run.id), agent_id=str(run.agent_id),
        dataset_id=str(run.dataset_id), algorithm=run.algorithm,
        status=run.status, reward_function=run.reward_function,
        current_epoch=run.current_epoch, max_epochs=run.max_epochs,
        best_reward=float(run.best_reward) if run.best_reward else None,
        metrics=run.metrics, optimized_prompt=run.optimized_prompt,
        started_at=run.started_at, completed_at=run.completed_at,
        created_at=run.created_at,
    )


@router.get("/training-runs", response_model=List[TrainingRunResponse])
async def list_training_runs(db: DbSession, agent_id: Optional[UUID] = None):
    """List training runs."""
    query = select(LightningTrainingRun).order_by(LightningTrainingRun.created_at.desc())
    if agent_id:
        query = query.where(LightningTrainingRun.agent_id == agent_id)
    result = await db.execute(query)
    runs = result.scalars().all()
    return [
        TrainingRunResponse(
            id=str(r.id), agent_id=str(r.agent_id) if r.agent_id else "",
            dataset_id=str(r.dataset_id) if r.dataset_id else "",
            algorithm=r.algorithm, status=r.status,
            reward_function=r.reward_function,
            current_epoch=r.current_epoch, max_epochs=r.max_epochs,
            best_reward=float(r.best_reward) if r.best_reward else None,
            metrics=r.metrics, optimized_prompt=r.optimized_prompt,
            started_at=r.started_at, completed_at=r.completed_at,
            created_at=r.created_at,
        ) for r in runs
    ]


@router.get("/training-runs/{run_id}", response_model=TrainingRunResponse)
async def get_training_run(run_id: UUID, db: DbSession):
    """Get training run details."""
    result = await db.execute(
        select(LightningTrainingRun).where(LightningTrainingRun.id == run_id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise HTTPException(status_code=404, detail="Training run not found")
    return TrainingRunResponse(
        id=str(r.id), agent_id=str(r.agent_id) if r.agent_id else "",
        dataset_id=str(r.dataset_id) if r.dataset_id else "",
        algorithm=r.algorithm, status=r.status,
        reward_function=r.reward_function,
        current_epoch=r.current_epoch, max_epochs=r.max_epochs,
        best_reward=float(r.best_reward) if r.best_reward else None,
        metrics=r.metrics, optimized_prompt=r.optimized_prompt,
        started_at=r.started_at, completed_at=r.completed_at,
        created_at=r.created_at,
    )


# -- Agent Lightning Config --

@router.patch("/agents/{agent_id}/config")
async def update_agent_lightning_config(
    agent_id: UUID,
    req: LightningConfigUpdate,
    db: DbSession,
    _user: OperatorUser,
):
    """Update an agent's lightning_config."""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.lightning_config = req.model_dump()
    await db.commit()
    return {"status": "updated", "lightning_config": agent.lightning_config}
