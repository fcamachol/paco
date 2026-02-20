"""
PACO Infrastructure Health Monitor

Background service that periodically polls health endpoints
for all running infrastructure services and records results.
"""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import Infrastructure, InfraHealthCheck
from app.services.docker_manager import DockerManager

logger = logging.getLogger(__name__)

docker = DockerManager()


class InfraHealthMonitor:
    """Background health monitor for infrastructure services."""

    def __init__(self, poll_interval: float = 30.0):
        self.poll_interval = poll_interval
        self._task: Optional[asyncio.Task] = None
        self._running = False

    async def start(self, session_factory):
        """Start the background health monitoring loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._poll_loop(session_factory))
        logger.info("Infrastructure health monitor started (interval=%ss)", self.poll_interval)

    async def stop(self):
        """Stop the health monitoring loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("Infrastructure health monitor stopped")

    async def _poll_loop(self, session_factory):
        """Main polling loop."""
        while self._running:
            try:
                async with session_factory() as db:
                    await self._poll_all(db)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Health monitor poll error: %s", e)

            try:
                await asyncio.sleep(self.poll_interval)
            except asyncio.CancelledError:
                break

    async def _poll_all(self, db: AsyncSession):
        """Poll all running infrastructures."""
        result = await db.execute(
            select(Infrastructure)
            .where(Infrastructure.status == "running")
            .options(
                selectinload(Infrastructure.agents),
                selectinload(Infrastructure.orchestrator),
            )
        )
        infrastructures = result.scalars().all()

        for infra in infrastructures:
            try:
                await self._poll_infrastructure(db, infra)
            except Exception as e:
                logger.error(
                    "Error polling infrastructure %s: %s", infra.name, e
                )

    async def _poll_infrastructure(self, db: AsyncSession, infra: Infrastructure):
        """Poll all services in a single infrastructure."""
        if not infra.project_path:
            return

        port = infra.port_range_start
        base_url = "http://localhost"

        # Check orchestrator
        orchestrator_url = f"{base_url}:{port}"
        orch_result = await docker.health_check(orchestrator_url)

        orch_check = InfraHealthCheck(
            infrastructure_id=infra.id,
            service_name="orchestrator",
            service_type="orchestrator",
            status="healthy" if orch_result.healthy else "unhealthy",
            response_time_ms=orch_result.response_time_ms if orch_result.healthy else None,
            circuit_state=None,
            details={
                "status_code": orch_result.status_code,
                "error": orch_result.error,
            },
        )
        db.add(orch_check)

        # Check each agent
        for i, agent in enumerate(infra.agents):
            agent_port = port + 1 + i
            agent_url = f"{base_url}:{agent_port}"
            agent_result = await docker.health_check(agent_url)

            agent_check = InfraHealthCheck(
                infrastructure_id=infra.id,
                service_name=f"agent-{agent.agent_id_slug}",
                service_type="agent",
                status="healthy" if agent_result.healthy else "unhealthy",
                response_time_ms=agent_result.response_time_ms if agent_result.healthy else None,
                circuit_state=None,
                details={
                    "status_code": agent_result.status_code,
                    "error": agent_result.error,
                },
            )
            db.add(agent_check)

            # Update agent status based on health
            agent.status = "running" if agent_result.healthy else "error"

        await db.commit()
        logger.debug("Polled infrastructure %s: orchestrator + %d agents", infra.name, len(infra.agents))


# Global singleton
health_monitor = InfraHealthMonitor()
