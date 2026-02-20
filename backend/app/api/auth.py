"""
PACO Authentication API

Login, logout, and token management endpoints.
"""

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import CurrentUser, DbSession
from app.core.security import Token, create_access_token, get_password_hash, verify_password
from app.db.models import User

router = APIRouter(prefix="/auth", tags=["Authentication"])


class LoginRequest(BaseModel):
    """Login request body."""

    email: str
    password: str


class RegisterRequest(BaseModel):
    """Registration request body."""

    email: str
    password: str
    name: str


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


class AuthResponse(BaseModel):
    """Authentication response with token and user info."""

    token: Token
    user: UserResponse


@router.post("/login", response_model=AuthResponse)
async def login(request: LoginRequest, db: DbSession) -> AuthResponse:
    """
    Authenticate user and return JWT token.

    - **email**: User's email address
    - **password**: User's password
    """
    # Find user by email
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()

    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is disabled",
        )

    # Update last login
    user.last_login = datetime.now(timezone.utc)
    await db.commit()

    # Create access token
    token = create_access_token(subject=str(user.id), role=user.role)

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
            last_login=user.last_login,
        ),
    )


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def register(request: RegisterRequest, db: DbSession) -> AuthResponse:
    """
    Register a new user account.

    New users are created with the 'viewer' role by default.
    """
    # Check if email already exists
    result = await db.execute(select(User).where(User.email == request.email))
    existing_user = result.scalar_one_or_none()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    # Create new user
    user = User(
        email=request.email,
        password_hash=get_password_hash(request.password),
        name=request.name,
        role="viewer",  # Default role
        is_active=True,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    # Create access token
    token = create_access_token(subject=str(user.id), role=user.role)

    return AuthResponse(
        token=token,
        user=UserResponse(
            id=str(user.id),
            email=user.email,
            name=user.name,
            role=user.role,
            is_active=user.is_active,
            created_at=user.created_at,
            last_login=user.last_login,
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(current_user: CurrentUser, db: DbSession) -> UserResponse:
    """Get the currently authenticated user's information."""
    result = await db.execute(select(User).where(User.id == current_user.sub))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
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


@router.post("/refresh", response_model=Token)
async def refresh_token(current_user: CurrentUser) -> Token:
    """Refresh the access token for the current user."""
    return create_access_token(subject=current_user.sub, role=current_user.role)
