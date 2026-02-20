"""
PACO Security Utilities

JWT token handling and password hashing.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from app.core.config import settings

# Password hashing context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class TokenData(BaseModel):
    """Token payload data."""

    sub: str
    role: str
    exp: datetime


class Token(BaseModel):
    """Token response model."""

    access_token: str
    token_type: str = "bearer"
    expires_at: datetime


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password."""
    return pwd_context.hash(password)


def create_access_token(
    subject: str,
    role: str,
    expires_delta: Optional[timedelta] = None,
) -> Token:
    """
    Create a JWT access token.

    Args:
        subject: User identifier (usually email or user ID)
        role: User role (admin, operator, viewer)
        expires_delta: Optional custom expiration time

    Returns:
        Token object with access_token, type, and expiration
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=settings.access_token_expire_minutes
        )

    to_encode = {
        "sub": subject,
        "role": role,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }

    encoded_jwt = jwt.encode(
        to_encode,
        settings.secret_key,
        algorithm=settings.algorithm,
    )

    return Token(access_token=encoded_jwt, expires_at=expire)


def decode_token(token: str) -> Optional[TokenData]:
    """
    Decode and validate a JWT token.

    Args:
        token: JWT token string

    Returns:
        TokenData if valid, None otherwise
    """
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
        )
        sub: str = payload.get("sub")
        role: str = payload.get("role", "viewer")
        exp: datetime = datetime.fromtimestamp(payload.get("exp"), tz=timezone.utc)

        if sub is None:
            return None

        return TokenData(sub=sub, role=role, exp=exp)
    except JWTError:
        return None
