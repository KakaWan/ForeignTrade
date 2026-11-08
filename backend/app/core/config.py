"""Application configuration with environment variable support.

Config loading priority (later overrides earlier):
  1. Built-in defaults in Settings class
  2. .env file (environment variables — for infrastructure only, NOT user preferences)
  3. config.json (user preferences — persisted via Settings page UI, HIGHEST priority)
"""

import json
import logging
import os
from pathlib import Path
from typing import Literal, Optional

from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.paths import get_app_dir

logger = logging.getLogger(__name__)

# ── Persistent config file path ──────────────────────────────────
CONFIG_FILE = Path(get_app_dir()) / "config.json"

# Fields that are persisted to config.json via the Settings page
PERSISTED_FIELDS = {
    "ai_provider", "anthropic_api_key", "anthropic_base_url", "anthropic_model",
    "openai_api_key", "openai_base_url", "openai_model",
    "ai_max_tokens", "ai_temperature",
    "email_verify_timeout", "email_verify_max_concurrent",
    "email_verify_mode", "email_deduce_mode", "email_verify_rate_limit",
    "email_deduce_template_group",
    "default_page_size",
    "smtp_host", "smtp_port", "smtp_user", "smtp_password", "smtp_use_tls",
    "email_copy_format",
    "backup_enabled", "backup_interval", "backup_unit", "backup_keep_count",
}


def _load_config_overrides() -> dict:
    """Load user preferences from config.json if it exists."""
    if not CONFIG_FILE.exists():
        logger.info(f"No config.json found at {CONFIG_FILE}, using defaults/.env")
        return {}
    try:
        data = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            logger.info(f"Loaded {len(data)} config overrides from {CONFIG_FILE}")
            return data
    except Exception as e:
        logger.warning(f"Failed to load config.json: {e}")
    return {}


def save_config(updates: dict) -> None:
    """Persist selected fields to config.json.

    Only fields in PERSISTED_FIELDS are written.
    Existing values are merged; non-persisted keys are preserved as-is.
    """
    current: dict = {}
    if CONFIG_FILE.exists():
        try:
            current = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        except Exception:
            current = {}

    for key, value in updates.items():
        if key in PERSISTED_FIELDS:
            current[key] = value

    CONFIG_FILE.write_text(json.dumps(current, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info(f"Saved {len(updates)} fields to {CONFIG_FILE}")


class Settings(BaseSettings):
    """Global application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Application
    app_name: str = "ForeignTrade Assistant"
    app_version: str = "0.1.0"
    debug: bool = False

    # Database
    db_engine: Literal["sqlite", "postgresql"] = "sqlite"
    db_url: str = "sqlite+aiosqlite:///./data/foreigntrade.db"
    db_echo: bool = False  # Set True only for SQL debugging

    # Cache
    cache_ttl: int = 300  # seconds
    cache_max_size: int = 1000

    # Email Verification
    email_verify_timeout: int = 10  # seconds
    email_verify_max_concurrent: int = 5
    email_verify_mx_required: bool = True
    email_verify_mode: str = "manual"  # disabled / manual / auto
    email_verify_rate_limit: int = 5   # max emails verified per minute

    # Email Deduction
    email_deduce_template_group: str = "standard"  # conservative / standard / comprehensive
    email_deduce_mode: str = "disabled"  # disabled / manual / auto

    # Email Copy Format
    email_copy_format: str = '"{company_name} {full_name}-{position}" <{email}>'

    # AI API - Anthropic
    anthropic_api_key: Optional[str] = None
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_model: str = "claude-sonnet-5"

    # AI API - OpenAI Compatible
    openai_api_key: Optional[str] = None
    openai_base_url: str = "https://api.openai.com/v1"
    openai_model: str = "gpt-4o"

    # AI General
    ai_provider: Literal["anthropic", "openai"] = "anthropic"
    ai_max_tokens: int = 8192
    ai_temperature: float = 0.7

    # SMTP (for future auto-send feature)
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True

    # CORS
    cors_origins: list[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Pagination
    default_page_size: int = 20
    max_page_size: int = 100

    # Backup
    backup_enabled: bool = False
    backup_interval: int = 1            # interval value (used with backup_unit)
    backup_unit: str = "day"            # minute / hour / day / week / month
    backup_keep_count: int = 10         # max backups to keep


# ── Instantiate with layered loading ─────────────────────────────
# Step 1: Load from .env and defaults
settings = Settings()

# Step 2: Override with config.json (highest priority)
_config_overrides = _load_config_overrides()
for key, value in _config_overrides.items():
    if hasattr(settings, key) and value is not None:
        setattr(settings, key, value)

if _config_overrides:
    logger.info(f"Applied config.json overrides for: {list(_config_overrides.keys())}")
