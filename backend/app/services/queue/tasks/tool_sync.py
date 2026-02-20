"""
Task: tool_sync

Periodic MCP tool discovery — fetches tools from registered HTTP MCP servers
and upserts into the tools table. Self-reschedules every N seconds.

Payload:
  - interval: int (seconds until next sync, default 300)
"""

import logging
import time
from typing import Any, Dict

import httpx
from redis.asyncio import Redis
from sqlalchemy import select

from app.core.config import settings
from app.db.models import McpServer, Tool
from app.db.session import async_session_maker
from app.services.queue.core import enqueue_scheduled_task

logger = logging.getLogger("paco.queue.tasks")

TASK_TYPE = "tool_sync"


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    # Fetch server info
    async with async_session_maker() as db:
        result = await db.execute(
            select(McpServer).where(McpServer.transport == "http")
        )
        servers = [(s.id, s.name, s.url) for s in result.scalars().all()]

    if not servers:
        logger.debug("No HTTP MCP servers registered — skipping tool sync")
    else:
        for server_id, server_name, server_url in servers:
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(f"{server_url}/tools")
                    if resp.status_code != 200:
                        logger.warning("Tool sync: %s returned %d", server_name, resp.status_code)
                        continue
                    tools_data = resp.json()

                if isinstance(tools_data, dict):
                    tools_data = tools_data.get("tools", [])

                async with async_session_maker() as db:
                    synced = 0
                    for tool_data in tools_data:
                        tool_name = tool_data.get("name")
                        if not tool_name:
                            continue
                        existing = await db.execute(
                            select(Tool).where(
                                Tool.name == tool_name,
                                Tool.mcp_server_id == server_id,
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue
                        db.add(Tool(
                            name=tool_name,
                            description=tool_data.get("description"),
                            mcp_server_id=server_id,
                            input_schema=tool_data.get("inputSchema", tool_data.get("input_schema", {})),
                        ))
                        synced += 1
                    if synced:
                        await db.commit()
                        logger.info("Synced %d tools from %s", synced, server_name)
            except Exception as e:
                logger.warning("Tool sync failed for %s: %s", server_name, e)

    # Self-reschedule
    interval = payload.get("interval") or getattr(settings, "tool_sync_interval", 300)
    await enqueue_scheduled_task(
        redis,
        TASK_TYPE,
        {"interval": interval},
        execute_at=time.time() + interval,
    )


def register(dispatcher: "TaskDispatcher") -> None:
    from app.services.queue.dispatcher import TaskDispatcher
    dispatcher.register(TASK_TYPE, handle, max_attempts=3, timeout=60.0)
