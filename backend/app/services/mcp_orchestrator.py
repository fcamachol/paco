"""
MCP Container Orchestrator

Manages lifecycle of Paco-managed MCP server containers via Docker API.
Each managed MCP server runs as an isolated Docker container using the
paco-mcp-base image, which fetches tool definitions from the backend.
"""

import logging
import os
import socket
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from uuid import UUID

import docker
import httpx
from docker.errors import APIError, ImageNotFound, NotFound
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import McpServer

logger = logging.getLogger(__name__)

# Port pool for managed containers
PORT_RANGE_START = 3100
PORT_RANGE_END = 3199
BASE_IMAGE_NAME = "paco-mcp-base"


class McpOrchestrator:
    """Manages Docker containers for Paco-managed MCP servers."""

    def __init__(self):
        self._client: Optional[docker.DockerClient] = None
        self._network_name: Optional[str] = None

    @property
    def client(self) -> docker.DockerClient:
        if self._client is None:
            self._client = docker.from_env()
        return self._client

    def _detect_network(self) -> str:
        """Auto-detect the Docker network by finding what network this container is on."""
        hostname = socket.gethostname()
        try:
            container = self.client.containers.get(hostname)
            networks = container.attrs['NetworkSettings']['Networks']
            for name in networks:
                if name != 'bridge':
                    logger.info(f"Auto-detected Docker network: {name}")
                    return name
        except Exception as e:
            logger.debug(f"Could not detect network from container hostname: {e}")

        # Fallback: find network with 'paco' in the name
        for net in self.client.networks.list():
            if 'paco' in net.name.lower():
                logger.info(f"Found Docker network by name: {net.name}")
                return net.name

        logger.warning("Could not auto-detect Docker network, using fallback 'paco_default'")
        return "paco_default"

    @property
    def network_name(self) -> str:
        if self._network_name is None:
            self._network_name = self._detect_network()
        return self._network_name

    async def build_base_image(self, tag: str = "latest") -> dict:
        """Build the paco-mcp-base Docker image from source."""
        build_context = Path(os.environ.get("MCP_BASE_PATH", "/mcp-base"))
        if not build_context.exists():
            # Fallback for local development
            build_context = Path(__file__).resolve().parent.parent.parent.parent / "mcp-base"
        if not build_context.exists():
            raise FileNotFoundError(f"paco-mcp-base source not found at {build_context}")

        image_tag = f"{BASE_IMAGE_NAME}:{tag}"
        logger.info(f"Building {image_tag} from {build_context}")

        image, build_logs = self.client.images.build(
            path=str(build_context),
            tag=image_tag,
            rm=True,
            forcerm=True,
        )

        log_lines = []
        for chunk in build_logs:
            if "stream" in chunk:
                line = chunk["stream"].strip()
                if line:
                    log_lines.append(line)

        return {"image_id": image.id, "tag": image_tag, "logs": log_lines}

    async def deploy_server(self, db: AsyncSession, server_id: UUID) -> McpServer:
        """Create and start a container for a managed MCP server."""
        result = await db.execute(select(McpServer).where(McpServer.id == server_id))
        server = result.scalar_one_or_none()
        if not server:
            raise ValueError(f"MCP server {server_id} not found")
        if server.deployment_mode != "managed":
            raise ValueError(f"Server '{server.name}' is not managed (mode={server.deployment_mode})")

        # Verify base image exists
        image_tag = f"{BASE_IMAGE_NAME}:{server.image_tag}"
        try:
            self.client.images.get(image_tag)
        except ImageNotFound:
            raise ValueError(
                f"Base image {image_tag} not found. Build it first with POST /tools/build-base-image"
            )

        # Stop existing container if any
        if server.container_id:
            try:
                old = self.client.containers.get(server.container_id)
                old.stop(timeout=10)
                old.remove(force=True)
            except NotFound:
                pass

        # Also clean up by name to avoid conflicts
        container_name = f"paco-mcp-{server.name}"
        try:
            old = self.client.containers.get(container_name)
            old.stop(timeout=10)
            old.remove(force=True)
        except NotFound:
            pass

        # Assign port
        port = server.host_port or await self._allocate_port(db)

        server.deploy_status = "deploying"
        server.deploy_error = None
        await db.commit()

        try:
            # Build environment variables
            env = {
                "MCP_SERVER_NAME": server.name,
                "PACO_BACKEND_URL": "http://paco-backend:8000",
                "PORT": "3000",
            }
            # Add server-level env vars
            if server.env:
                env.update(server.env)

            # Ensure the Docker network exists
            network = self.network_name
            self._ensure_network(network)

            container = self.client.containers.run(
                image=image_tag,
                name=container_name,
                detach=True,
                environment=env,
                ports={"3000/tcp": port},
                network=network,
                labels={
                    "paco.managed": "true",
                    "paco.server_id": str(server.id),
                    "paco.server_name": server.name,
                },
                restart_policy={"Name": "unless-stopped"},
                healthcheck={
                    "Test": ["CMD", "wget", "--spider", "-q", "http://127.0.0.1:3000/health"],
                    "Interval": 10_000_000_000,  # 10s in nanoseconds
                    "Timeout": 5_000_000_000,
                    "Retries": 3,
                },
            )

            server.container_id = container.id
            server.container_name = container_name
            server.host_port = port
            server.deploy_status = "running"
            server.deploy_error = None
            server.last_deployed_at = datetime.now(timezone.utc)
            # Auto-set URL so backend can communicate with container
            server.url = f"http://{container_name}:3000"
            server.transport = "http"
            server.status = "online"

            await db.commit()
            await db.refresh(server)

            logger.info(f"Deployed {container_name} on port {port}")
            return server

        except (APIError, Exception) as e:
            server.deploy_status = "error"
            server.deploy_error = str(e)
            await db.commit()
            await db.refresh(server)
            raise

    async def stop_server(self, db: AsyncSession, server_id: UUID) -> McpServer:
        """Stop and remove a managed container."""
        result = await db.execute(select(McpServer).where(McpServer.id == server_id))
        server = result.scalar_one_or_none()
        if not server:
            raise ValueError(f"MCP server {server_id} not found")

        if server.container_id:
            try:
                container = self.client.containers.get(server.container_id)
                container.stop(timeout=10)
                container.remove(force=True)
            except NotFound:
                pass  # Already gone

        server.container_id = None
        server.deploy_status = "stopped"
        server.deploy_error = None
        server.status = "offline"
        await db.commit()
        await db.refresh(server)

        logger.info(f"Stopped managed server {server.name}")
        return server

    async def reconcile_managed_servers(self, db: AsyncSession) -> dict:
        """Check all managed servers marked as running and re-deploy if their container is missing."""
        result = await db.execute(
            select(McpServer).where(
                McpServer.deployment_mode == "managed",
                McpServer.deploy_status == "running",
            )
        )
        servers = result.scalars().all()

        reconciled = []
        failed = []
        already_running = []

        for server in servers:
            if not server.container_id:
                # No container ID recorded but marked running — needs re-deploy
                try:
                    await self.deploy_server(db, server.id)
                    reconciled.append(server.name)
                except Exception as e:
                    logger.error(f"Reconcile failed for {server.name}: {e}")
                    failed.append({"name": server.name, "error": str(e)})
                continue

            # Check if container actually exists
            try:
                container = self.client.containers.get(server.container_id)
                if container.status == "running":
                    already_running.append(server.name)
                    continue
                # Container exists but not running — remove and re-deploy
                try:
                    container.remove(force=True)
                except Exception:
                    pass
            except NotFound:
                pass  # Container gone

            # Re-deploy
            try:
                # Reset status so deploy_server doesn't skip
                server.deploy_status = "deploying"
                await db.commit()
                await self.deploy_server(db, server.id)
                reconciled.append(server.name)
            except Exception as e:
                logger.error(f"Reconcile re-deploy failed for {server.name}: {e}")
                server.deploy_status = "error"
                server.deploy_error = f"Reconcile failed: {e}"
                await db.commit()
                failed.append({"name": server.name, "error": str(e)})

        return {
            "already_running": already_running,
            "reconciled": reconciled,
            "failed": failed,
        }

    async def reload_tools(self, db: AsyncSession, server_id: UUID) -> dict:
        """Tell a running managed container to re-fetch its tool manifest."""
        result = await db.execute(select(McpServer).where(McpServer.id == server_id))
        server = result.scalar_one_or_none()
        if not server:
            raise ValueError(f"MCP server {server_id} not found")

        if server.deploy_status != "running" or not server.url:
            raise ValueError(f"Server '{server.name}' is not running")

        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{server.url}/reload-tools")
            resp.raise_for_status()
            return resp.json()

    async def get_container_logs(
        self, db: AsyncSession, server_id: UUID, tail: int = 100
    ) -> str:
        """Fetch container logs for a managed server."""
        result = await db.execute(select(McpServer).where(McpServer.id == server_id))
        server = result.scalar_one_or_none()
        if not server:
            raise ValueError(f"MCP server {server_id} not found")

        if not server.container_id:
            return ""

        try:
            container = self.client.containers.get(server.container_id)
            logs = container.logs(tail=tail, timestamps=True)
            return logs.decode("utf-8", errors="replace")
        except NotFound:
            return "(container not found)"

    async def _allocate_port(self, db: AsyncSession) -> int:
        """Find next available port from the managed pool (3100-3199)."""
        result = await db.execute(
            select(McpServer.host_port)
            .where(McpServer.host_port.isnot(None))
            .order_by(McpServer.host_port)
        )
        used_ports = {row[0] for row in result.all()}

        for port in range(PORT_RANGE_START, PORT_RANGE_END + 1):
            if port not in used_ports:
                return port

        raise RuntimeError("No available ports in managed pool (3100-3199)")

    def _ensure_network(self, network_name: str) -> None:
        """Ensure the Docker network exists."""
        try:
            self.client.networks.get(network_name)
        except NotFound:
            self.client.networks.create(network_name, driver="bridge")


# Singleton instance
mcp_orchestrator = McpOrchestrator()
