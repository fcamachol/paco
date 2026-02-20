"""
PACO Proxy API

Proxy endpoints to Langfuse and other external services.
"""

from typing import Any, Dict, Optional

import httpx
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel

from app.core.config import settings
from app.core.deps import CurrentUser

router = APIRouter(prefix="/proxy", tags=["Proxy"])


class LangfuseTraceResponse(BaseModel):
    """Langfuse trace response."""

    id: str
    name: Optional[str]
    timestamp: str
    input: Optional[Dict[str, Any]]
    output: Optional[Dict[str, Any]]
    metadata: Optional[Dict[str, Any]]
    observations: list = []


# =============================================================================
# Langfuse Proxy
# =============================================================================


@router.get("/langfuse/traces")
async def proxy_langfuse_traces(
    _: CurrentUser,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
    name: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Proxy to Langfuse traces API.

    Provides unified access to Langfuse data through PACO.
    """
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Langfuse API keys not configured",
        )

    params = {"page": page, "limit": limit}
    if name:
        params["name"] = name

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.langfuse_host}/api/public/traces",
                params=params,
                auth=(settings.langfuse_public_key, settings.langfuse_secret_key),
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Langfuse API error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Langfuse: {e}",
        )


@router.get("/langfuse/traces/{trace_id}")
async def proxy_langfuse_trace(
    trace_id: str,
    _: CurrentUser,
) -> Dict[str, Any]:
    """Get a specific trace from Langfuse."""
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Langfuse API keys not configured",
        )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.langfuse_host}/api/public/traces/{trace_id}",
                auth=(settings.langfuse_public_key, settings.langfuse_secret_key),
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Trace {trace_id} not found in Langfuse",
            )
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Langfuse API error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Langfuse: {e}",
        )


@router.get("/langfuse/observations")
async def proxy_langfuse_observations(
    _: CurrentUser,
    trace_id: Optional[str] = None,
    type: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
) -> Dict[str, Any]:
    """Proxy to Langfuse observations API."""
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Langfuse API keys not configured",
        )

    params = {"page": page, "limit": limit}
    if trace_id:
        params["traceId"] = trace_id
    if type:
        params["type"] = type

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.langfuse_host}/api/public/observations",
                params=params,
                auth=(settings.langfuse_public_key, settings.langfuse_secret_key),
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Langfuse API error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Langfuse: {e}",
        )


@router.get("/langfuse/scores")
async def proxy_langfuse_scores(
    _: CurrentUser,
    trace_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=100),
) -> Dict[str, Any]:
    """Proxy to Langfuse scores API."""
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Langfuse API keys not configured",
        )

    params = {"page": page, "limit": limit}
    if trace_id:
        params["traceId"] = trace_id

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.langfuse_host}/api/public/scores",
                params=params,
                auth=(settings.langfuse_public_key, settings.langfuse_secret_key),
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Langfuse API error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Langfuse: {e}",
        )


@router.get("/langfuse/metrics/daily")
async def proxy_langfuse_daily_metrics(
    _: CurrentUser,
    trace_name: Optional[str] = None,
) -> Dict[str, Any]:
    """Get daily metrics from Langfuse."""
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Langfuse API keys not configured",
        )

    params = {}
    if trace_name:
        params["traceName"] = trace_name

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(
                f"{settings.langfuse_host}/api/public/metrics/daily",
                params=params,
                auth=(settings.langfuse_public_key, settings.langfuse_secret_key),
            )
            response.raise_for_status()
            return response.json()
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"Langfuse API error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to connect to Langfuse: {e}",
        )


# =============================================================================
# Langfuse Embed URL Generator
# =============================================================================


@router.get("/langfuse/embed-url/{trace_id}")
async def get_langfuse_embed_url(
    trace_id: str,
    _: CurrentUser,
) -> Dict[str, str]:
    """
    Get the embed URL for a Langfuse trace.

    Use this URL in an iframe to embed the Langfuse trace viewer.
    """
    embed_url = f"{settings.langfuse_host}/traces/{trace_id}"

    return {
        "embed_url": embed_url,
        "full_url": f"{settings.langfuse_host}/traces/{trace_id}",
    }
