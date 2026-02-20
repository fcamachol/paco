"""
PACO Docker Manager

Manages Docker Compose operations for generated infrastructure projects.
"""

import asyncio
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


@dataclass
class ServiceStatus:
    name: str
    status: str
    health: str
    ports: str


@dataclass
class HealthResult:
    healthy: bool
    status_code: int = 0
    response_time_ms: int = 0
    error: Optional[str] = None


class DockerManager:
    """Manages Docker Compose operations for infrastructure projects."""

    async def _run_compose(
        self,
        project_path: str,
        args: List[str],
        timeout: float = 300.0,
    ) -> tuple[str, str, int]:
        """Run a docker compose command."""
        cmd = ["docker", "compose"] + args
        logger.info(f"Running: {' '.join(cmd)} in {project_path}")

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            cwd=project_path,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        try:
            stdout, stderr = await asyncio.wait_for(
                proc.communicate(), timeout=timeout
            )
            return (
                stdout.decode("utf-8", errors="replace"),
                stderr.decode("utf-8", errors="replace"),
                proc.returncode or 0,
            )
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return "", "Command timed out", 1

    async def build(
        self, project_path: str, service: Optional[str] = None
    ) -> Dict[str, Any]:
        """Build containers."""
        args = ["build"]
        if service:
            args.append(service)
        args.append("--no-cache")

        stdout, stderr, code = await self._run_compose(project_path, args, timeout=600.0)

        return {
            "success": code == 0,
            "stdout": stdout,
            "stderr": stderr,
        }

    async def up(
        self, project_path: str, service: Optional[str] = None
    ) -> Dict[str, Any]:
        """Start containers."""
        args = ["up", "-d", "--build"]
        if service:
            args.append(service)

        stdout, stderr, code = await self._run_compose(project_path, args, timeout=600.0)

        return {
            "success": code == 0,
            "stdout": stdout,
            "stderr": stderr,
        }

    async def down(self, project_path: str) -> Dict[str, Any]:
        """Stop and remove containers."""
        stdout, stderr, code = await self._run_compose(
            project_path, ["down", "--remove-orphans"]
        )

        return {
            "success": code == 0,
            "stdout": stdout,
            "stderr": stderr,
        }

    async def restart(
        self, project_path: str, service: Optional[str] = None
    ) -> Dict[str, Any]:
        """Restart containers."""
        args = ["restart"]
        if service:
            args.append(service)

        stdout, stderr, code = await self._run_compose(project_path, args)

        return {
            "success": code == 0,
            "stdout": stdout,
            "stderr": stderr,
        }

    async def ps(self, project_path: str) -> List[ServiceStatus]:
        """Get status of all services."""
        stdout, stderr, code = await self._run_compose(
            project_path, ["ps", "--format", "json"]
        )

        if code != 0:
            return []

        services = []
        for line in stdout.strip().split("\n"):
            if not line.strip():
                continue
            try:
                data = json.loads(line)
                services.append(ServiceStatus(
                    name=data.get("Service", data.get("Name", "unknown")),
                    status=data.get("State", data.get("Status", "unknown")),
                    health=data.get("Health", ""),
                    ports=data.get("Ports", data.get("Publishers", "")),
                ))
            except json.JSONDecodeError:
                continue

        return services

    async def logs(
        self,
        project_path: str,
        service: Optional[str] = None,
        tail: int = 100,
    ) -> str:
        """Get logs from services."""
        args = ["logs", "--tail", str(tail), "--no-color"]
        if service:
            args.append(service)

        stdout, stderr, code = await self._run_compose(project_path, args)
        return stdout or stderr

    async def health_check(self, url: str) -> HealthResult:
        """Check health of a service endpoint."""
        import httpx
        import time

        try:
            start = time.monotonic()
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{url}/health")
                elapsed = int((time.monotonic() - start) * 1000)

                return HealthResult(
                    healthy=response.status_code == 200,
                    status_code=response.status_code,
                    response_time_ms=elapsed,
                )
        except Exception as e:
            return HealthResult(
                healthy=False,
                error=str(e),
            )
