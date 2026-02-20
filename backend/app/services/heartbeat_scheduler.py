"""
PACO Heartbeat Supervisor

Supervisor-mode scheduler that monitors agent heartbeat health.
Agents now manage their own heartbeat schedules (per-agent loop).
The supervisor:
- Monitors CompanyTask table for missed heartbeats
- Alerts via WebSocket when an agent misses N consecutive heartbeats
- Supports fallback mode: triggers heartbeats for agents without company_mode
- Keeps Redis lock for multi-worker safety

Architecture:
- Polls every 60 seconds
- For each infrastructure with supervisor_mode=True:
  - Check each agent's last heartbeat task
  - If missed > threshold → push alert to WebSocket
- Fallback: if agent has no recent self-reported task, trigger via HTTP (legacy mode)
"""

import asyncio
import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    CompanyConfig,
    CompanyRole,
    CompanySchedule,
    CompanyTask,
    CompanyWorkLog,
    InfraAgent,
)
from app.db.session import async_session_maker
from app.services.company_cron import compute_next_trigger, is_within_active_hours

logger = logging.getLogger("paco.heartbeat")


class HeartbeatScheduler:
    """Supervisor that monitors agent heartbeat health.

    In supervisor mode, agents run their own heartbeat loops and report
    results to PACO. The supervisor checks for missed heartbeats and
    alerts when agents go silent.

    For agents not yet running company_mode, falls back to legacy
    HTTP-triggered heartbeats.
    """

    def __init__(self, redis_client=None):
        self._task: Optional[asyncio.Task] = None
        self._redis = redis_client
        self._running = False
        self._poll_interval = 60  # seconds

    async def start(self):
        """Start the supervisor background loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._scheduler_loop())
        logger.info("HeartbeatSupervisor started (poll every %ds)", self._poll_interval)

    async def stop(self):
        """Stop the supervisor."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None
        logger.info("HeartbeatSupervisor stopped")

    async def _scheduler_loop(self):
        """Main polling loop."""
        while self._running:
            try:
                await self._tick()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error("Supervisor tick error: %s", e, exc_info=True)

            await asyncio.sleep(self._poll_interval)

    async def _tick(self):
        """Single supervisor tick."""
        # Acquire Redis lock if available (prevents duplicate execution)
        lock_acquired = True
        if self._redis:
            try:
                lock_acquired = await self._redis.set(
                    "paco:heartbeat:lock", "1", nx=True, ex=self._poll_interval
                )
            except Exception:
                lock_acquired = True  # proceed without lock on error

        if not lock_acquired:
            return

        try:
            async with async_session_maker() as db:
                # Find all active company configs
                configs_result = await db.execute(
                    select(CompanyConfig).where(CompanyConfig.status == "running")
                )
                active_configs = configs_result.scalars().all()

                for config in active_configs:
                    if config.supervisor_mode:
                        await self._supervise_infrastructure(db, config)
                    else:
                        # Legacy mode: trigger heartbeats directly
                        await self._process_infrastructure_legacy(db, config)
        finally:
            if self._redis:
                try:
                    await self._redis.delete("paco:heartbeat:lock")
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # Supervisor mode: monitor agent self-reported heartbeats
    # ------------------------------------------------------------------

    async def _supervise_infrastructure(self, db: AsyncSession, config: CompanyConfig):
        """Monitor all agents for missed heartbeats."""
        now = datetime.now(timezone.utc)
        threshold = config.missed_heartbeat_threshold or 3

        # Get all active roles (agents) for this infrastructure
        roles_result = await db.execute(
            select(CompanyRole).where(
                CompanyRole.infrastructure_id == config.infrastructure_id,
                CompanyRole.is_active.is_(True),
            )
        )
        roles = roles_result.scalars().all()

        for role in roles:
            await self._check_agent_health(db, config, role, now, threshold)

    async def _check_agent_health(
        self,
        db: AsyncSession,
        config: CompanyConfig,
        role: CompanyRole,
        now: datetime,
        threshold: int,
    ):
        """Check if an agent has missed heartbeats beyond the threshold."""
        # Find agent's schedules
        schedules_result = await db.execute(
            select(CompanySchedule).where(
                CompanySchedule.infrastructure_id == config.infrastructure_id,
                CompanySchedule.agent_slug == role.agent_slug,
                CompanySchedule.is_enabled.is_(True),
            )
        )
        schedules = schedules_result.scalars().all()

        if not schedules:
            return  # No schedules, nothing to monitor

        for schedule in schedules:
            interval = schedule.interval_seconds or config.heartbeat_interval_seconds
            # How long since a task should have been reported?
            expected_window = timedelta(seconds=interval * threshold)
            cutoff = now - expected_window

            # Check for recent tasks from this agent for this schedule
            task_result = await db.execute(
                select(sa_func.count(CompanyTask.id)).where(
                    CompanyTask.infrastructure_id == config.infrastructure_id,
                    CompanyTask.agent_slug == role.agent_slug,
                    CompanyTask.created_at >= cutoff,
                )
            )
            recent_task_count = task_result.scalar() or 0

            if recent_task_count == 0:
                # Agent has missed heartbeats
                logger.warning(
                    "Agent %s missed heartbeats for schedule %s "
                    "(no tasks in last %d intervals)",
                    role.agent_slug,
                    schedule.name,
                    threshold,
                )

                # Push alert to WebSocket
                try:
                    from app.services.ws_manager import ws_manager
                    await ws_manager.broadcast(
                        f"company:{config.infrastructure_id}:activity",
                        {
                            "type": "agent_alert",
                            "alert_type": "missed_heartbeat",
                            "agent_slug": role.agent_slug,
                            "schedule_name": schedule.name,
                            "missed_intervals": threshold,
                            "timestamp": now.isoformat(),
                        },
                    )
                except Exception:
                    pass

    # ------------------------------------------------------------------
    # Legacy mode: trigger heartbeats via HTTP (for non-company-mode agents)
    # ------------------------------------------------------------------

    async def _process_infrastructure_legacy(self, db: AsyncSession, config: CompanyConfig):
        """Process all due schedules for one infrastructure (legacy trigger mode)."""
        now = datetime.now(timezone.utc)

        # Find due schedules
        result = await db.execute(
            select(CompanySchedule).where(
                CompanySchedule.infrastructure_id == config.infrastructure_id,
                CompanySchedule.is_enabled == True,
                CompanySchedule.next_trigger_at <= now,
            )
        )
        due_schedules = result.scalars().all()

        for schedule in due_schedules:
            try:
                await self._execute_schedule_legacy(db, config, schedule)
            except Exception as e:
                logger.error(
                    "Schedule %s execution error: %s", schedule.name, e, exc_info=True
                )

    async def _execute_schedule_legacy(
        self, db: AsyncSession, config: CompanyConfig, schedule: CompanySchedule
    ):
        """Execute a single schedule trigger via HTTP (legacy mode)."""
        now = datetime.now(timezone.utc)

        # Check active hours
        tz = schedule.timezone or config.timezone
        active_start = schedule.active_hours_start or config.active_hours_start
        active_end = schedule.active_hours_end or config.active_hours_end
        working_days = config.working_days

        if not is_within_active_hours(active_start, active_end, tz, working_days):
            schedule.next_trigger_at = compute_next_trigger(
                schedule.schedule_type,
                schedule.cron_expression,
                schedule.interval_seconds,
                tz,
            )
            await db.commit()
            return

        # Build prompt
        prompt_parts = []
        if schedule.checklist_md:
            prompt_parts.append(schedule.checklist_md)
        if schedule.prompt_template:
            prompt_parts.append(schedule.prompt_template)
        if not prompt_parts:
            prompt_parts.append("Perform your routine check. Reply HEARTBEAT_OK if nothing needs attention.")

        # Get last work log for memory context
        today = date.today()
        wl_result = await db.execute(
            select(CompanyWorkLog).where(
                CompanyWorkLog.infrastructure_id == config.infrastructure_id,
                CompanyWorkLog.agent_slug == schedule.agent_slug,
                CompanyWorkLog.log_date == today,
            )
        )
        work_log = wl_result.scalar_one_or_none()
        if work_log and work_log.memory_notes:
            prompt_parts.append(f"\n## Memory Notes\n{work_log.memory_notes}")

        prompt = "\n\n".join(prompt_parts)

        # Create task record
        task = CompanyTask(
            infrastructure_id=config.infrastructure_id,
            schedule_id=schedule.id,
            agent_slug=schedule.agent_slug,
            title=f"{schedule.name} - {schedule.schedule_type}",
            task_type="heartbeat_check" if schedule.schedule_type == "heartbeat" else "scheduled_job",
            status="in_progress",
            input_data={"prompt": prompt},
            scheduled_at=schedule.next_trigger_at,
            started_at=now,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)

        # Find agent port for HTTP call
        agent_result = await db.execute(
            select(InfraAgent).where(
                InfraAgent.infrastructure_id == config.infrastructure_id,
                InfraAgent.agent_id_slug == schedule.agent_slug,
            )
        )
        agent = agent_result.scalar_one_or_none()

        # Execute
        start_time = datetime.now(timezone.utc)
        response_text = ""
        is_heartbeat_ok = False

        try:
            if agent and agent.port:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    model = (schedule.config or {}).get("model_override") or config.default_model
                    max_tokens = (schedule.config or {}).get("max_tokens", 1000)
                    resp = await client.post(
                        f"http://localhost:{agent.port}/api/heartbeat",
                        json={"prompt": prompt, "model": model, "max_tokens": max_tokens},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        response_text = data.get("response", data.get("content", str(data)))
                    else:
                        response_text = f"HTTP {resp.status_code}: {resp.text[:500]}"
                        task.status = "failed"
                        task.error_message = response_text
            else:
                task.status = "failed"
                task.error_message = f"Agent {schedule.agent_slug} has no port configured"
        except Exception as e:
            task.status = "failed"
            task.error_message = str(e)[:1000]
            logger.error("Agent call failed for %s: %s", schedule.agent_slug, e)

        end_time = datetime.now(timezone.utc)
        duration = int((end_time - start_time).total_seconds() * 1000)

        # Parse response
        if task.status != "failed":
            is_heartbeat_ok = "HEARTBEAT_OK" in response_text.upper()
            task.status = "heartbeat_ok" if is_heartbeat_ok else "completed"
            task.result = {"response": response_text, "heartbeat_ok": is_heartbeat_ok}

        task.completed_at = end_time
        task.duration_ms = duration

        # Update schedule timing
        schedule.last_triggered_at = now
        schedule.next_trigger_at = compute_next_trigger(
            schedule.schedule_type,
            schedule.cron_expression,
            schedule.interval_seconds,
            schedule.timezone or config.timezone,
        )

        # Update work log for non-silent tasks
        if not is_heartbeat_ok and task.status != "failed":
            if not work_log:
                work_log = CompanyWorkLog(
                    infrastructure_id=config.infrastructure_id,
                    agent_slug=schedule.agent_slug,
                    log_date=today,
                    entries=[],
                )
                db.add(work_log)

            entry = {
                "timestamp": now.isoformat(),
                "type": task.task_type,
                "content": response_text[:2000],
                "task_id": str(task.id),
                "schedule_name": schedule.name,
            }
            entries = list(work_log.entries or [])
            entries.append(entry)
            work_log.entries = entries
            work_log.tasks_completed = (work_log.tasks_completed or 0) + 1

        if task.status == "failed":
            if work_log:
                work_log.tasks_failed = (work_log.tasks_failed or 0) + 1

        await db.commit()
        logger.info(
            "Schedule %s/%s: %s (%.1fs)",
            schedule.agent_slug,
            schedule.name,
            task.status,
            duration / 1000,
        )


# Module-level singleton
heartbeat_scheduler = HeartbeatScheduler()
