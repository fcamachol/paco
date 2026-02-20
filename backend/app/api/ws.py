"""
PACO WebSocket API

Real-time streaming for agent status, logs, and execution events.
"""

import asyncio
import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.pm2_client import PM2Client
from app.services.ws_manager import ws_manager

router = APIRouter(tags=["WebSocket"])


# ============================================================================
# Agent Status
# ============================================================================


@router.websocket("/ws/agents/status")
async def ws_agent_status(websocket: WebSocket):
    """Stream agent status updates every 5 seconds."""
    channel = "agents:status"
    if not await ws_manager.connect(websocket, channel):
        return

    pm2 = PM2Client()
    try:
        while True:
            processes = await pm2.list()
            statuses = []
            for proc in processes:
                pm2_env = proc.get("pm2_env", {})
                statuses.append({
                    "name": proc.get("name"),
                    "status": pm2_env.get("status", "unknown"),
                    "cpu": proc.get("monit", {}).get("cpu", 0),
                    "memory": proc.get("monit", {}).get("memory", 0),
                    "uptime": pm2_env.get("pm_uptime"),
                    "restarts": pm2_env.get("restart_time", 0),
                })
            await websocket.send_json({"type": "status", "agents": statuses})
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(websocket, channel)


# ============================================================================
# Agent Logs
# ============================================================================


@router.websocket("/ws/agents/{agent_name}/logs")
async def ws_agent_logs(websocket: WebSocket, agent_name: str):
    """Stream live PM2 logs for a specific agent."""
    channel = f"agents:{agent_name}:logs"
    if not await ws_manager.connect(websocket, channel):
        return

    pm2 = PM2Client()
    try:
        async for line in pm2.stream_logs(agent_name):
            await websocket.send_json({"type": "log", "agent": agent_name, "line": line})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(websocket, channel)


# ============================================================================
# Execution Events
# ============================================================================


@router.websocket("/ws/executions/live")
async def ws_executions_live(websocket: WebSocket):
    """Stream new execution events. Other services call ws_manager.broadcast()
    to push events into this channel."""
    channel = "executions:live"
    if not await ws_manager.connect(websocket, channel):
        return

    try:
        # Keep the connection alive; events are pushed via ws_manager.broadcast
        while True:
            # Also listen for client pings to keep connection alive
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                # Send a heartbeat
                await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(websocket, channel)


# ============================================================================
# Company Activity
# ============================================================================


@router.websocket("/ws/company/{infra_id}/activity")
async def ws_company_activity(websocket: WebSocket, infra_id: str):
    """Stream company heartbeat and task activity for an infrastructure.

    Events are pushed via ws_manager.broadcast from the HeartbeatScheduler.
    Event format:
        {"type": "heartbeat_result", "agent_slug": "...", "schedule_name": "...",
         "status": "heartbeat_ok|completed|failed", "timestamp": "..."}
    """
    channel = f"company:{infra_id}:activity"
    if not await ws_manager.connect(websocket, channel):
        return

    try:
        while True:
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if data == "ping":
                    await websocket.send_json({"type": "pong"})
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "heartbeat"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        await ws_manager.disconnect(websocket, channel)
