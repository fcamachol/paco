"""
PACO Langfuse Client

Client for interacting with Langfuse API.
"""

from datetime import datetime
from typing import Any, Dict, List, Optional

import httpx

from app.core.config import settings


class LangfuseClient:
    """Client for Langfuse API."""

    def __init__(self):
        self.host = settings.langfuse_host
        self.public_key = settings.langfuse_public_key
        self.secret_key = settings.langfuse_secret_key

    @property
    def is_configured(self) -> bool:
        """Check if Langfuse is properly configured."""
        return bool(self.public_key and self.secret_key)

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict] = None,
        json: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """Make an authenticated request to Langfuse API."""
        if not self.is_configured:
            raise RuntimeError("Langfuse API keys not configured")

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method,
                f"{self.host}/api/public{path}",
                params=params,
                json=json,
                auth=(self.public_key, self.secret_key),
            )
            response.raise_for_status()
            return response.json()

    async def get_traces(
        self,
        page: int = 1,
        limit: int = 50,
        name: Optional[str] = None,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        from_timestamp: Optional[datetime] = None,
        to_timestamp: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get traces from Langfuse."""
        params = {"page": page, "limit": limit}

        if name:
            params["name"] = name
        if user_id:
            params["userId"] = user_id
        if session_id:
            params["sessionId"] = session_id
        if from_timestamp:
            params["fromTimestamp"] = from_timestamp.isoformat()
        if to_timestamp:
            params["toTimestamp"] = to_timestamp.isoformat()

        return await self._request("GET", "/traces", params=params)

    async def get_trace(self, trace_id: str) -> Dict[str, Any]:
        """Get a specific trace by ID."""
        return await self._request("GET", f"/traces/{trace_id}")

    async def get_observations(
        self,
        page: int = 1,
        limit: int = 50,
        trace_id: Optional[str] = None,
        type: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get observations from Langfuse."""
        params = {"page": page, "limit": limit}

        if trace_id:
            params["traceId"] = trace_id
        if type:
            params["type"] = type
        if name:
            params["name"] = name

        return await self._request("GET", "/observations", params=params)

    async def get_scores(
        self,
        page: int = 1,
        limit: int = 50,
        trace_id: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Get scores from Langfuse."""
        params = {"page": page, "limit": limit}

        if trace_id:
            params["traceId"] = trace_id
        if name:
            params["name"] = name

        return await self._request("GET", "/scores", params=params)

    async def get_daily_metrics(
        self,
        trace_name: Optional[str] = None,
        from_timestamp: Optional[datetime] = None,
        to_timestamp: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Get daily metrics from Langfuse."""
        params = {}

        if trace_name:
            params["traceName"] = trace_name
        if from_timestamp:
            params["fromTimestamp"] = from_timestamp.isoformat()
        if to_timestamp:
            params["toTimestamp"] = to_timestamp.isoformat()

        return await self._request("GET", "/metrics/daily", params=params)

    async def get_projects(self) -> List[Dict[str, Any]]:
        """Get list of projects."""
        result = await self._request("GET", "/projects")
        return result.get("data", [])

    async def health_check(self) -> bool:
        """Check if Langfuse is healthy and accessible."""
        if not self.is_configured:
            return False

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(
                    f"{self.host}/api/public/health",
                    auth=(self.public_key, self.secret_key),
                )
                return response.status_code == 200
        except Exception:
            return False

    def get_trace_url(self, trace_id: str) -> str:
        """Get the URL to view a trace in Langfuse UI."""
        return f"{self.host}/traces/{trace_id}"

    def get_dashboard_url(self) -> str:
        """Get the URL to the Langfuse dashboard."""
        return self.host


# Singleton instance
langfuse_client = LangfuseClient()
