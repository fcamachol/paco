"""
PACO PM2 Client

Manages agent processes via PM2.
"""

import asyncio
import json
from typing import Any, Dict, List, Optional


class PM2Client:
    """Client for interacting with PM2 process manager."""

    async def _run_pm2_command(
        self, *args: str, env_override: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Run a PM2 command and return JSON output."""
        cmd = ["pm2", "jlist", *args] if "jlist" in args else ["pm2", *args]

        # Build subprocess environment: inherit host env, merge overrides
        import os
        subprocess_env = None
        if env_override:
            subprocess_env = {**os.environ, **env_override}

        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=subprocess_env,
            )
            stdout, stderr = await proc.communicate()

            if proc.returncode != 0:
                error_msg = stderr.decode() if stderr else "Unknown error"
                return {"error": error_msg, "returncode": proc.returncode}

            output = stdout.decode().strip()

            # Try to parse JSON output
            if output and output.startswith("["):
                return {"processes": json.loads(output)}
            elif output and output.startswith("{"):
                return json.loads(output)

            return {"output": output}

        except FileNotFoundError:
            return {"error": "PM2 not found. Please install PM2: npm install -g pm2"}
        except json.JSONDecodeError:
            return {"output": stdout.decode() if stdout else ""}
        except Exception as e:
            return {"error": str(e)}

    async def list(self) -> List[Dict[str, Any]]:
        """List all PM2 processes."""
        result = await self._run_pm2_command("jlist")
        return result.get("processes", [])

    async def status(self, name: str) -> Optional[Dict[str, Any]]:
        """Get status of a specific process by name."""
        processes = await self.list()

        for proc in processes:
            if proc.get("name") == name:
                return proc

        return None

    async def start(
        self, name: str, env: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Start a process by name, optionally injecting environment variables."""
        # First check if it exists
        status = await self.status(name)

        if status:
            # Process exists, restart it
            result = await self._run_pm2_command("restart", name, env_override=env)
        else:
            # Try to start from ecosystem config
            result = await self._run_pm2_command("start", name, env_override=env)

        if "error" in result:
            raise RuntimeError(result["error"])

        # Get updated status
        return await self.status(name) or {"name": name, "status": "started"}

    async def stop(self, name: str) -> Dict[str, Any]:
        """Stop a process by name."""
        result = await self._run_pm2_command("stop", name)

        if "error" in result and "not found" not in result["error"].lower():
            raise RuntimeError(result["error"])

        return await self.status(name) or {"name": name, "status": "stopped"}

    async def restart(self, name: str) -> Dict[str, Any]:
        """Restart a process by name."""
        result = await self._run_pm2_command("restart", name)

        if "error" in result:
            raise RuntimeError(result["error"])

        return await self.status(name) or {"name": name, "status": "restarted"}

    async def delete(self, name: str) -> Dict[str, Any]:
        """Delete a process from PM2."""
        result = await self._run_pm2_command("delete", name)

        if "error" in result and "not found" not in result["error"].lower():
            raise RuntimeError(result["error"])

        return {"name": name, "status": "deleted"}

    async def logs(self, name: str, lines: int = 100) -> str:
        """Get recent logs for a process."""
        proc = await asyncio.create_subprocess_exec(
            "pm2", "logs", name, "--lines", str(lines), "--nostream",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()
        return stdout.decode()

    async def stream_logs(self, name: str):
        """Async generator that yields log lines from PM2 in real time."""
        proc = await asyncio.create_subprocess_exec(
            "pm2", "logs", name, "--raw",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        try:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                yield line.decode().rstrip("\n")
        finally:
            proc.kill()
            await proc.wait()

    async def describe(self, name: str) -> Optional[Dict[str, Any]]:
        """Get detailed description of a process."""
        proc = await asyncio.create_subprocess_exec(
            "pm2", "describe", name, "--json",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, _ = await proc.communicate()

        try:
            output = stdout.decode().strip()
            if output:
                data = json.loads(output)
                return data[0] if isinstance(data, list) and data else data
        except json.JSONDecodeError:
            pass

        return None

    async def save(self) -> Dict[str, Any]:
        """Save the current PM2 process list."""
        return await self._run_pm2_command("save")

    async def startup(self) -> Dict[str, Any]:
        """Generate startup script."""
        return await self._run_pm2_command("startup")
