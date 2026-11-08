"""Database backup service with scheduled backups for SQLite.

Backup format: .zip containing:
  - foreigntrade.db   (SQLite database)
  - config.json       (user settings: AI keys, email modes, SMTP, backup config, etc.)
"""

import asyncio
import logging
import os
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

from app.core.config import settings, CONFIG_FILE

logger = logging.getLogger(__name__)

# ── Paths ────────────────────────────────────────────────────────
def _db_path() -> Path:
    """Resolve the actual SQLite database file path from db_url."""
    url = settings.db_url
    path_part = url.split("///")[-1] if "///" in url else url.split("//")[-1]
    p = Path(path_part)
    if not p.is_absolute():
        p = Path(os.getcwd()) / p
    return p.resolve()


def _backup_dir() -> Path:
    """Directory where backups are stored."""
    d = _db_path().parent / "backups"
    d.mkdir(parents=True, exist_ok=True)
    return d


# ── Backup operations ────────────────────────────────────────────
async def perform_backup() -> str:
    """Create a full backup (database + config.json) as a .zip file.

    Returns the filename of the new backup.
    """
    db_file = _db_path()
    if not db_file.exists():
        raise FileNotFoundError(f"Database file not found: {db_file}")

    # WAL checkpoint to flush pending writes
    try:
        from app.core.database import engine
        async with engine.connect() as conn:
            await conn.execute(
                __import__("sqlalchemy").text("PRAGMA wal_checkpoint(TRUNCATE)")
            )
    except Exception as e:
        logger.warning(f"WAL checkpoint failed (non-fatal): {e}")

    # Generate timestamped filename
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"foreigntrade_{timestamp}.zip"
    dest = _backup_dir() / filename

    # Pack database + config.json into zip
    with zipfile.ZipFile(str(dest), "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(str(db_file), arcname="foreigntrade.db")
        if CONFIG_FILE.exists():
            zf.write(str(CONFIG_FILE), arcname="config.json")
        else:
            logger.warning("config.json not found, skipping in backup")

    logger.info(f"Backup created: {dest}")
    return filename


def cleanup_old_backups(keep_count: Optional[int] = None) -> int:
    """Remove oldest backups beyond keep_count. Returns number of deleted files."""
    keep = keep_count or settings.backup_keep_count
    backup_dir = _backup_dir()
    backups = sorted(
        [f for f in backup_dir.glob("foreigntrade_*.zip")],
        key=lambda f: f.stat().st_mtime,
    )
    to_delete = backups[:-keep] if len(backups) > keep else []
    for f in to_delete:
        f.unlink()
        logger.info(f"Deleted old backup: {f.name}")
    return len(to_delete)


def get_backup_list() -> list[dict]:
    """List all backups sorted by creation time (newest first)."""
    backup_dir = _backup_dir()
    backups = []
    for f in backup_dir.glob("foreigntrade_*.zip"):
        stat = f.stat()
        # Try to read the file list inside the zip for display info
        includes = []
        try:
            with zipfile.ZipFile(str(f), "r") as zf:
                includes = zf.namelist()
        except Exception:
            pass
        backups.append({
            "filename": f.name,
            "size": stat.st_size,
            "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "includes": includes,  # e.g. ["foreigntrade.db", "config.json"]
        })
    backups.sort(key=lambda b: b["created_at"], reverse=True)
    return backups


async def restore_backup(filename: str) -> None:
    """Restore database and config.json from a backup .zip file.

    This replaces the current database and settings with the backup copy.
    """
    backup_dir = _backup_dir()
    src = backup_dir / filename
    if not src.exists():
        raise FileNotFoundError(f"Backup not found: {filename}")

    db_file = _db_path()

    with zipfile.ZipFile(str(src), "r") as zf:
        names = zf.namelist()

        # Restore database
        if "foreigntrade.db" in names:
            # Dispose current engine to release file locks
            try:
                from app.core.database import engine
                await engine.dispose()
            except Exception as e:
                logger.warning(f"Engine dispose failed: {e}")

            # Extract db to a temp location then copy (zipfile can't extract directly over locked file on Windows)
            tmp_db = backup_dir / "_restore_tmp.db"
            with zf.open("foreigntrade.db") as src_f, open(str(tmp_db), "wb") as dst_f:
                shutil.copyfileobj(src_f, dst_f)
            shutil.copy2(str(tmp_db), str(db_file))
            tmp_db.unlink(missing_ok=True)

        # Restore config.json
        if "config.json" in names:
            with zf.open("config.json") as src_f:
                config_data = src_f.read()
            CONFIG_FILE.write_bytes(config_data)
            # Reload settings from restored config
            import json
            try:
                overrides = json.loads(config_data)
                for key, value in overrides.items():
                    if hasattr(settings, key) and value is not None:
                        setattr(settings, key, value)
                logger.info("Restored config.json and reloaded settings")
            except Exception as e:
                logger.warning(f"Failed to reload config.json settings: {e}")

    logger.info(f"Restored from backup: {filename}")

    # Re-initialize engine if database was restored
    if "foreigntrade.db" in names:
        try:
            from app.core.database import init_db
            import app.core.database as db_module
            _engine_kwargs = {"echo": settings.db_echo}
            if settings.db_engine == "postgresql":
                _engine_kwargs.update(pool_pre_ping=True, pool_size=5, max_overflow=10)
            db_module.engine = __import__(
                "sqlalchemy.ext.asyncio", fromlist=["create_async_engine"]
            ).create_async_engine(settings.db_url, **_engine_kwargs)
            db_module.async_session_factory = __import__(
                "sqlalchemy.ext.asyncio", fromlist=["async_sessionmaker"]
            ).async_sessionmaker(
                db_module.engine,
                class_=__import__(
                    "sqlalchemy.ext.asyncio", fromlist=["AsyncSession"]
                ).AsyncSession,
                expire_on_commit=False,
            )
            await init_db()
        except Exception as e:
            logger.error(f"Database re-initialization failed after restore: {e}")
            raise


def delete_backup(filename: str) -> None:
    """Delete a specific backup file."""
    backup_dir = _backup_dir()
    f = backup_dir / filename
    if not f.exists():
        raise FileNotFoundError(f"Backup not found: {filename}")
    f.unlink()
    logger.info(f"Backup deleted: {filename}")


# ── Scheduled backup scheduler ───────────────────────────────────
_backup_task: Optional[asyncio.Task] = None


def _calc_interval_seconds() -> float:
    """Calculate interval in seconds from settings."""
    unit_multipliers = {
        "minute": 60,
        "hour": 3600,
        "day": 86400,
        "week": 604800,
        "month": 2592000,
    }
    multiplier = unit_multipliers.get(settings.backup_unit, 86400)
    return max(settings.backup_interval * multiplier, 60)  # minimum 60s


async def _backup_loop():
    """Background loop that performs scheduled backups."""
    while True:
        interval = _calc_interval_seconds()
        logger.info(f"Next backup in {interval:.0f} seconds")
        await asyncio.sleep(interval)
        if settings.backup_enabled:
            try:
                await perform_backup()
                cleanup_old_backups()
            except Exception as e:
                logger.error(f"Scheduled backup failed: {e}", exc_info=True)


def start_backup_scheduler():
    """Start the backup scheduler if enabled."""
    global _backup_task
    stop_backup_scheduler()
    if settings.backup_enabled:
        _backup_task = asyncio.create_task(_backup_loop())
        logger.info("Backup scheduler started")


def stop_backup_scheduler():
    """Stop the backup scheduler."""
    global _backup_task
    if _backup_task and not _backup_task.done():
        _backup_task.cancel()
        _backup_task = None
        logger.info("Backup scheduler stopped")


def restart_backup_scheduler():
    """Restart the scheduler (call after config change)."""
    start_backup_scheduler()
