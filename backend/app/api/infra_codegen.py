"""
PACO Infrastructure Code Generation API

Endpoints for generating, previewing, and reading infrastructure code.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.deps import AdminUser
from app.services.infra_generator import InfraGenerator, FilePreview, GenerationResult

router = APIRouter(prefix="/infrastructures", tags=["Infrastructure Code Generation"])

generator = InfraGenerator()


class GenerateResponse(BaseModel):
    success: bool
    project_path: str
    files_generated: List[str] = []
    error: str | None = None


class FilePreviewResponse(BaseModel):
    path: str
    content: str
    language: str


class FileContentResponse(BaseModel):
    path: str
    content: str


@router.post("/{infra_id}/generate", response_model=GenerateResponse)
async def generate_infrastructure(infra_id: UUID, _: AdminUser) -> GenerateResponse:
    """Generate all scaffolding for an infrastructure."""
    try:
        result = await generator.generate(infra_id)
        return GenerateResponse(
            success=result.success,
            project_path=result.project_path,
            files_generated=result.files_generated,
            error=result.error,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Generation failed: {e}",
        )


@router.post("/{infra_id}/generate/preview", response_model=List[FilePreviewResponse])
async def preview_infrastructure(infra_id: UUID) -> List[FilePreviewResponse]:
    """Preview generated files without writing to disk."""
    try:
        previews = await generator.preview(infra_id)
        return [
            FilePreviewResponse(path=p.path, content=p.content, language=p.language)
            for p in previews
        ]
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{infra_id}/files", response_model=List[str])
async def list_generated_files(infra_id: UUID) -> List[str]:
    """List all generated files for an infrastructure."""
    try:
        return await generator.list_files(infra_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/{infra_id}/files/{path:path}", response_model=FileContentResponse)
async def read_generated_file(infra_id: UUID, path: str) -> FileContentResponse:
    """Read a specific generated file."""
    try:
        content = await generator.read_file(infra_id, path)
        return FileContentResponse(path=path, content=content)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except FileNotFoundError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
