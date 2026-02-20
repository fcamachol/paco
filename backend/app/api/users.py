"""
PACO Users API

User management for administrators.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select

from app.core.deps import AdminUser, DbSession
from app.core.security import get_password_hash
from app.db.models import User

router = APIRouter(prefix="/users", tags=["Users"])


class UserResponse(BaseModel):
    """User response model."""

    id: str
    email: str
    name: str
    role: str
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime]

    class Config:
        from_attributes = True


class UserCreateRequest(BaseModel):
    """User creation request."""

    email: EmailStr
    password: str
    name: str
    role: str = "viewer"


class UserUpdateRequest(BaseModel):
    """User update request."""

    name: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class PasswordChangeRequest(BaseModel):
    """Password change request."""

    new_password: str


@router.get("", response_model=List[UserResponse])
async def list_users(
    db: DbSession,
    _: AdminUser,
    role: Optional[str] = None,
    active_only: bool = False,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> List[UserResponse]:
    """
    List all users (admin only).

    - **role**: Filter by role (admin, operator, viewer)
    - **active_only**: Only show active users
    """
    query = select(User).order_by(User.created_at.desc())

    if role:
        query = query.where(User.role == role)

    if active_only:
        query = query.where(User.is_active == True)

    query = query.limit(limit).offset(offset)

    result = await db.execute(query)
    users = result.scalars().all()

    return [
        UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
            last_login=user.last_login,
        )
        for user in users
    ]


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> UserResponse:
    """Get user details by ID (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    request: UserCreateRequest,
    db: DbSession,
    _: AdminUser,
) -> UserResponse:
    """Create a new user (admin only)."""
    # Check if email exists
    result = await db.execute(select(User).where(User.email == request.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Email '{request.email}' already registered",
        )

    # Validate role
    if request.role not in ("admin", "operator", "viewer"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role: {request.role}. Must be admin, operator, or viewer",
        )

    user = User(
        email=request.email,
        password_hash=get_password_hash(request.password),
        name=request.name,
        role=request.role,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    request: UserUpdateRequest,
    db: DbSession,
    _: AdminUser,
) -> UserResponse:
    """Update user details (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    if request.name is not None:
        user.name = request.name

    if request.role is not None:
        if request.role not in ("admin", "operator", "viewer"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid role: {request.role}",
            )
        user.role = request.role

    if request.is_active is not None:
        user.is_active = request.is_active

    await db.commit()
    await db.refresh(user)

    return UserResponse(
        id=str(user.id),
        email=user.email,
        name=user.name,
        role=user.role,
        is_active=user.is_active,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.post("/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def change_user_password(
    user_id: UUID,
    request: PasswordChangeRequest,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Change user password (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    user.password_hash = get_password_hash(request.new_password)
    await db.commit()


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: UUID,
    db: DbSession,
    _: AdminUser,
) -> None:
    """Delete a user (admin only)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {user_id} not found",
        )

    await db.delete(user)
    await db.commit()
