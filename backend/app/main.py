"""FastAPI application entry point."""

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.core.paths import get_resource_dir

from app.core.config import settings
from app.core.database import init_db, close_db
from app.api.companies import router as companies_router
from app.api.employees import router as employees_router
from app.api.emails import router as emails_router
from app.api.dev_letters import router as dev_letters_router
from app.api.tags import router as tags_router
from app.api.data import router as data_router
from app.api.settings import router as settings_router
from app.api.ws import router as ws_router
from app.api.letter_templates import router as letter_templates_router
from app.api.sender_profiles import router as sender_profiles_router
from app.api.backup import router as backup_router
from app.api.products import router as products_router
from app.api.dashboard import router as dashboard_router

# Configure logging
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    await init_db()
    logger.info("Database initialized")

    # Seed default email patterns
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.core.database import async_session_factory
    from app.services.email_deduction import seed_default_patterns
    async with async_session_factory() as session:
        await seed_default_patterns(session)
        await session.commit()
    logger.info("Default email patterns seeded")

    # Seed default letter templates
    from app.models.letter_template import LetterTemplate
    from app.services.ai_service import DEFAULT_TEMPLATES
    async with async_session_factory() as session:
        # Delete old templates without step (legacy)
        result = await session.execute(select(LetterTemplate).where(LetterTemplate.step.is_(None)))
        old_templates = result.scalars().all()
        if old_templates:
            for t in old_templates:
                await session.delete(t)
            await session.flush()
            logger.info(f"Deleted {len(old_templates)} legacy templates without step")

        # Seed step templates if they don't exist
        result = await session.execute(select(LetterTemplate).where(LetterTemplate.step.isnot(None)))
        existing_step_templates = {t.step for t in result.scalars().all()}
        for tpl_data in DEFAULT_TEMPLATES:
            if tpl_data.get("step") not in existing_step_templates:
                session.add(LetterTemplate(**tpl_data))
        await session.commit()
        logger.info("Letter templates seeded")

    # Seed the default product catalog (only when empty, so user edits stick)
    from app.services.product_catalog import seed_default_products
    async with async_session_factory() as session:
        added = await seed_default_products(session)
        await session.commit()
    if added:
        logger.info(f"Default product catalog seeded ({added} items)")

    # Start backup scheduler if enabled
    from app.services.backup import start_backup_scheduler
    start_backup_scheduler()
    logger.info("Backup scheduler initialized")

    yield

    logger.info("Shutting down...")
    from app.services.backup import stop_backup_scheduler
    stop_backup_scheduler()
    await close_db()
    logger.info("Database connection closed")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(companies_router, prefix="/api")
app.include_router(employees_router, prefix="/api")
app.include_router(emails_router, prefix="/api")
app.include_router(dev_letters_router, prefix="/api")
app.include_router(tags_router, prefix="/api")
app.include_router(data_router, prefix="/api")
app.include_router(settings_router, prefix="/api")
app.include_router(ws_router, prefix="/api")
app.include_router(letter_templates_router, prefix="/api")
app.include_router(sender_profiles_router, prefix="/api")
app.include_router(backup_router, prefix="/api")
app.include_router(products_router, prefix="/api")
app.include_router(dashboard_router, prefix="/api")


# Global exception handler for debugging
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
    )


@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "version": settings.app_version,
        "db_engine": settings.db_engine,
    }


# ── Serve frontend static files (production only) ────────────────
# Must be mounted AFTER all API routes so /api/* takes precedence.
def _get_static_dir() -> str | None:
    """Find the frontend static files directory."""
    if getattr(sys, 'frozen', False):
        # PyInstaller bundle — static files are in _MEIPASS
        static = os.path.join(sys._MEIPASS, 'static')
    else:
        # Development — frontend/dist is at project root level
        static = os.path.join(get_resource_dir(), '..', 'frontend', 'dist')
    if os.path.isdir(static):
        return static
    return None


_static_dir = _get_static_dir()
if _static_dir:
    from fastapi.staticfiles import StaticFiles
    app.mount("/", StaticFiles(directory=_static_dir, html=True), name="static")
    logger.info(f"Serving frontend static files from: {_static_dir}")
