"""
PACO Dependency Injection

FastAPI dependencies for authentication, database sessions, etc.
"""

from typing import Annotated, AsyncGenerator, Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import TokenData, decode_token
from app.db.session import async_session_maker

# HTTP Bearer token security
security = HTTPBearer(auto_error=False)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Get database session dependency."""
    async with async_session_maker() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_current_user(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(security)
    ] = None,
) -> TokenData:
    """
    Get current authenticated user from JWT token.

    Raises HTTPException if not authenticated.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    token_data = decode_token(credentials.credentials)
    if token_data is None:
        raise credentials_exception

    return token_data


async def get_current_user_optional(
    credentials: Annotated[
        Optional[HTTPAuthorizationCredentials], Depends(security)
    ] = None,
) -> Optional[TokenData]:
    """
    Get current user if authenticated, None otherwise.

    Useful for endpoints that work differently for authenticated users.
    """
    if credentials is None:
        return None

    return decode_token(credentials.credentials)


class RoleChecker:
    """
    Dependency class to check user roles.

    Usage:
        @router.get("/admin-only", dependencies=[Depends(RoleChecker(["admin"]))])
    """

    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(
        self,
        user: Annotated[TokenData, Depends(get_current_user)],
    ) -> TokenData:
        if user.role not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role}' not authorized. Requires: {self.allowed_roles}",
            )
        return user


# Role-specific dependencies
require_admin = RoleChecker(["admin"])
require_operator = RoleChecker(["admin", "operator"])
require_viewer = RoleChecker(["admin", "operator", "viewer"])

# Type aliases for cleaner function signatures
DbSession = Annotated[AsyncSession, Depends(get_db)]
CurrentUser = Annotated[TokenData, Depends(get_current_user)]
OptionalUser = Annotated[Optional[TokenData], Depends(get_current_user_optional)]
AdminUser = Annotated[TokenData, Depends(require_admin)]
OperatorUser = Annotated[TokenData, Depends(require_operator)]
