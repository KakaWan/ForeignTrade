"""Database engine and session management."""

import os
from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings
from app.core.paths import get_resource_dir

_engine_kwargs = {"echo": settings.db_echo}
if settings.db_engine == "postgresql":
    _engine_kwargs.update(pool_pre_ping=True, pool_size=5, max_overflow=10)

engine = create_async_engine(settings.db_url, **_engine_kwargs)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all ORM models."""

    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency that provides a database session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db() -> None:
    """Run Alembic migrations to bring database to the latest schema.

    This preserves existing data, unlike create_all which would only
    add missing tables (and never alter existing columns).
    Falls back to create_all only if migrations directory is absent.
    """
    migrations_dir = os.path.join(get_resource_dir(), 'migrations')
    if os.path.isdir(migrations_dir):
        from alembic.config import Config as AlembicConfig
        from alembic import command as alembic_command

        alembic_cfg = AlembicConfig()
        alembic_cfg.set_main_option("script_location", migrations_dir)
        alembic_cfg.set_main_option("sqlalchemy.url", settings.db_url)

        # Use offline mode to avoid async event loop conflict.
        # Offline mode generates SQL and executes it directly.
        alembic_command.upgrade(alembic_cfg, "head")
    else:
        # No migrations dir — first-time setup
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)


async def close_db() -> None:
    """Dispose of the database engine."""
    await engine.dispose()
