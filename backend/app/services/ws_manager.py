"""
PACO WebSocket Connection Manager

Manages WebSocket connections by channel with JWT authentication.
"""

import asyncio
import json
from collections import defaultdict
from typing import Any, Dict, Optional, Set

from fastapi import WebSocket, WebSocketDisconnect

from app.core.security import decode_token


class ConnectionManager:
    """Manages WebSocket connections grouped by channel."""

    def __init__(self):
        self._connections: Dict[str, Set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def authenticate(self, websocket: WebSocket) -> Optional[str]:
        """Validate JWT from query parameter. Returns user sub or None."""
        token = websocket.query_params.get("token")
        if not token:
            return None
        token_data = decode_token(token)
        if not token_data:
            return None
        return token_data.sub

    async def connect(self, websocket: WebSocket, channel: str) -> bool:
        """Accept and register a WebSocket connection to a channel.

        Returns True if authenticated and connected, False otherwise.
        """
        user = await self.authenticate(websocket)
        if not user:
            await websocket.close(code=4001, reason="Unauthorized")
            return False

        await websocket.accept()
        async with self._lock:
            self._connections[channel].add(websocket)
        return True

    async def disconnect(self, websocket: WebSocket, channel: str):
        """Remove a WebSocket connection from a channel."""
        async with self._lock:
            self._connections[channel].discard(websocket)
            if not self._connections[channel]:
                del self._connections[channel]

    async def broadcast(self, channel: str, data: Any):
        """Send JSON data to all connections on a channel."""
        async with self._lock:
            connections = list(self._connections.get(channel, set()))

        dead: list[WebSocket] = []
        message = json.dumps(data) if not isinstance(data, str) else data

        for ws in connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections[channel].discard(ws)

    def channel_count(self, channel: str) -> int:
        return len(self._connections.get(channel, set()))


# Singleton instance
ws_manager = ConnectionManager()
