"""
PACO Database Session Configuration

Async SQLAlchemy session factory and engine setup.
"""

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool

from app.core.config import settings

# Convert postgresql:// to postgresql+asyncpg:// for async driver
database_url = settings.database_url.replace(
    "postgresql://", "postgresql+asyncpg://"
)

# Create async engine
engine = create_async_engine(
    database_url,
    echo=settings.debug,
    poolclass=NullPool,  # Use NullPool for async
    future=True,
)

# Create async session factory
async_session_maker = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)
