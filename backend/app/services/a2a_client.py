"""
PACO A2A Client — Outbound

Service class for discovering and calling external A2A agents from PACO.
Uses httpx.AsyncClient for HTTP communication.
"""

import uuid
from typing import Any, AsyncIterator, Dict, Optional

import httpx

from app.schemas.a2a import (
    A2ATask,
    AgentCard,
    Artifact,
    JSONRPCRequest,
    JSONRPCResponse,
    Message,
    TaskStatus,
    TextPart,
)


class A2AClient:
    """Client for interacting with external A2A protocol agents."""

    def __init__(self, timeout: float = 120.0):
        self.timeout = timeout

    async def discover(self, base_url: str) -> AgentCard:
        """Discover an external agent by fetching its Agent Card.

        Args:
            base_url: The base URL of the external agent (e.g. https://agent.example.com)

        Returns:
            Parsed AgentCard from the remote agent.
        """
        url = base_url.rstrip("/")

        # Try /.well-known/agent.json first
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.get(f"{url}/.well-known/agent.json")
            if resp.status_code == 200:
                data = resp.json()
                # Handle both single card and multi-agent listing
                if "agents" in data and isinstance(data["agents"], list):
                    if data["agents"]:
                        return AgentCard(**data["agents"][0])
                    raise ValueError("No agents found in agent card listing")
                return AgentCard(**data)

            raise ValueError(f"Agent Card discovery failed: {resp.status_code} {resp.text}")

    async def send_task(
        self,
        agent_url: str,
        message: str,
        task_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        auth_token: Optional[str] = None,
    ) -> A2ATask:
        """Send a task to an external A2A agent.

        Args:
            agent_url: The JSON-RPC endpoint URL of the agent.
            message: Text message to send.
            task_id: Optional task ID. Generated if not provided.
            metadata: Optional metadata dict.
            auth_token: Optional Bearer token for authentication.

        Returns:
            A2ATask with the result.
        """
        task_id = task_id or str(uuid.uuid4())

        rpc_request = JSONRPCRequest(
            id=task_id,
            method="tasks/send",
            params={
                "id": task_id,
                "message": {
                    "role": "user",
                    "parts": [{"type": "text", "text": message}],
                },
                "metadata": metadata or {},
            },
        )

        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                agent_url,
                json=rpc_request.model_dump(),
                headers=headers,
            )
            resp.raise_for_status()
            rpc_response = JSONRPCResponse(**resp.json())

            if rpc_response.error:
                raise ValueError(
                    f"A2A RPC error {rpc_response.error.code}: {rpc_response.error.message}"
                )

            if rpc_response.result:
                return A2ATask(**rpc_response.result)

            return A2ATask(id=task_id, status=TaskStatus.failed)

    async def get_task(
        self,
        agent_url: str,
        task_id: str,
        auth_token: Optional[str] = None,
    ) -> A2ATask:
        """Query an existing task on an external A2A agent.

        Args:
            agent_url: The JSON-RPC endpoint URL.
            task_id: The task ID to query.
            auth_token: Optional Bearer token.

        Returns:
            A2ATask with current status and artifacts.
        """
        rpc_request = JSONRPCRequest(
            id=task_id,
            method="tasks/get",
            params={"id": task_id},
        )

        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                agent_url,
                json=rpc_request.model_dump(),
                headers=headers,
            )
            resp.raise_for_status()
            rpc_response = JSONRPCResponse(**resp.json())

            if rpc_response.error:
                raise ValueError(
                    f"A2A RPC error {rpc_response.error.code}: {rpc_response.error.message}"
                )

            if rpc_response.result:
                return A2ATask(**rpc_response.result)

            return A2ATask(id=task_id, status=TaskStatus.failed)

    async def cancel_task(
        self,
        agent_url: str,
        task_id: str,
        auth_token: Optional[str] = None,
    ) -> A2ATask:
        """Cancel a task on an external A2A agent.

        Args:
            agent_url: The JSON-RPC endpoint URL.
            task_id: The task ID to cancel.
            auth_token: Optional Bearer token.

        Returns:
            A2ATask with updated status.
        """
        rpc_request = JSONRPCRequest(
            id=task_id,
            method="tasks/cancel",
            params={"id": task_id},
        )

        headers = {"Content-Type": "application/json"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            resp = await client.post(
                agent_url,
                json=rpc_request.model_dump(),
                headers=headers,
            )
            resp.raise_for_status()
            rpc_response = JSONRPCResponse(**resp.json())

            if rpc_response.error:
                raise ValueError(
                    f"A2A RPC error {rpc_response.error.code}: {rpc_response.error.message}"
                )

            if rpc_response.result:
                return A2ATask(**rpc_response.result)

            return A2ATask(id=task_id, status=TaskStatus.failed)

    async def send_task_streaming(
        self,
        agent_url: str,
        message: str,
        task_id: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        auth_token: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """Send a task with SSE streaming response.

        Args:
            agent_url: The agent's stream endpoint URL.
            message: Text message to send.
            task_id: Optional task ID.
            metadata: Optional metadata dict.
            auth_token: Optional Bearer token.

        Yields:
            Raw SSE event strings from the remote agent.
        """
        task_id = task_id or str(uuid.uuid4())

        # Build the streaming URL (append /stream to agent URL)
        stream_url = agent_url.rstrip("/") + "/stream"

        rpc_request = JSONRPCRequest(
            id=task_id,
            method="tasks/sendSubscribe",
            params={
                "id": task_id,
                "message": {
                    "role": "user",
                    "parts": [{"type": "text", "text": message}],
                },
                "metadata": metadata or {},
            },
        )

        headers = {"Content-Type": "application/json", "Accept": "text/event-stream"}
        if auth_token:
            headers["Authorization"] = f"Bearer {auth_token}"

        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                stream_url,
                json=rpc_request.model_dump(),
                headers=headers,
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if line.startswith("data: "):
                        yield line[6:]  # Strip "data: " prefix
