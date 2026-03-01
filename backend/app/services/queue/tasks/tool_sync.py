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


def _build_transport(server: dict) -> httpx.AsyncHTTPTransport | None:
    """Build httpx transport with proxy if configured."""
    proxy_config = server.get("proxy_config")
    if proxy_config and proxy_config.get("enabled") and proxy_config.get("url"):
        return httpx.AsyncHTTPTransport(proxy=proxy_config["url"])
    proxy_url = server.get("proxy_url")
    if proxy_url:
        return httpx.AsyncHTTPTransport(proxy=proxy_url)
    return None


async def handle(payload: Dict[str, Any], redis: Redis) -> None:
    # Fetch full server objects (need proxy_config for transport)
    async with async_session_maker() as db:
        result = await db.execute(
            select(McpServer).where(McpServer.transport == "http")
        )
        servers = result.scalars().all()
        # Detach from session so we can use them outside
        server_list = []
        for s in servers:
            server_list.append({
                "id": s.id,
                "name": s.name,
                "url": s.url,
                "proxy_config": s.proxy_config,
                "proxy_url": s.proxy_url,
            })

    if not server_list:
        logger.debug("No HTTP MCP servers registered — skipping tool sync")
    else:
        for server in server_list:
            try:
                transport = _build_transport(server)
                async with httpx.AsyncClient(timeout=10.0, transport=transport) as client:
                    resp = await client.post(f"{server['url']}/tools/list", json={})
                    if resp.status_code != 200:
                        logger.warning("Tool sync: %s returned %d", server["name"], resp.status_code)
                        continue
                    data = resp.json()

                tools_data = data.get("tools", [])

                async with async_session_maker() as db:
                    synced = 0
                    for tool_data in tools_data:
                        tool_name = tool_data.get("name")
                        if not tool_name:
                            continue
                        existing = await db.execute(
                            select(Tool).where(
                                Tool.name == tool_name,
                                Tool.mcp_server_id == server["id"],
                            )
                        )
                        if existing.scalar_one_or_none():
                            continue
                        db.add(Tool(
                            name=tool_name,
                            description=tool_data.get("description"),
                            mcp_server_id=server["id"],
                            input_schema=tool_data.get("inputSchema", tool_data.get("input_schema", {})),
                        ))
                        synced += 1
                    if synced:
                        await db.commit()
                        logger.info("Synced %d tools from %s", synced, server["name"])
            except Exception as e:
                logger.warning("Tool sync failed for %s: %s", server["name"], e)

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
