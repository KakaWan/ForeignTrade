"""Settings API endpoints for application configuration."""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.config import settings, save_config, PERSISTED_FIELDS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


class SettingsResponse(BaseModel):
    """Settings exposed to the frontend (keys masked)."""
    ai_provider: str
    ai_configured: bool
    anthropic_api_key: str  # masked
    anthropic_base_url: str
    anthropic_model: str
    openai_api_key: str  # masked
    openai_base_url: str
    openai_model: str
    ai_max_tokens: int
    ai_temperature: float
    db_engine: str
    email_verify_timeout: int
    email_verify_max_concurrent: int
    email_verify_mode: str
    email_verify_rate_limit: int
    email_deduce_template_group: str
    email_deduce_mode: str
    default_page_size: int
    smtp_host: str
    smtp_port: int
    smtp_user: str
    smtp_password: str  # masked
    smtp_use_tls: bool
    email_copy_format: str
    backup_enabled: bool
    backup_interval: int
    backup_unit: str
    backup_keep_count: int


class SettingsUpdate(BaseModel):
    """Updatable settings."""
    ai_provider: Optional[str] = None
    anthropic_api_key: Optional[str] = None
    anthropic_base_url: Optional[str] = None
    anthropic_model: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_base_url: Optional[str] = None
    openai_model: Optional[str] = None
    ai_max_tokens: Optional[int] = None
    ai_temperature: Optional[float] = None
    email_verify_timeout: Optional[int] = None
    email_verify_max_concurrent: Optional[int] = None
    email_verify_mode: Optional[str] = None
    email_verify_rate_limit: Optional[int] = None
    email_deduce_template_group: Optional[str] = None
    email_deduce_mode: Optional[str] = None
    default_page_size: Optional[int] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: Optional[bool] = None
    email_copy_format: Optional[str] = None
    backup_enabled: Optional[bool] = None
    backup_interval: Optional[int] = None
    backup_unit: Optional[str] = None
    backup_keep_count: Optional[int] = None


def _mask(value: Optional[str], visible: int = 4) -> str:
    """Mask a secret, showing only the last N characters."""
    if not value:
        return ""
    if len(value) <= visible:
        return "****"
    return "*" * (len(value) - visible) + value[-visible:]


@router.get("/", response_model=SettingsResponse)
async def get_settings():
    """Get current settings (secrets are masked)."""
    return SettingsResponse(
        ai_provider=settings.ai_provider,
        ai_configured=bool(
            settings.anthropic_api_key if settings.ai_provider == "anthropic"
            else settings.openai_api_key
        ),
        anthropic_api_key=_mask(settings.anthropic_api_key),
        anthropic_base_url=settings.anthropic_base_url,
        anthropic_model=settings.anthropic_model,
        openai_api_key=_mask(settings.openai_api_key),
        openai_base_url=settings.openai_base_url,
        openai_model=settings.openai_model,
        ai_max_tokens=settings.ai_max_tokens,
        ai_temperature=settings.ai_temperature,
        db_engine=settings.db_engine,
        email_verify_timeout=settings.email_verify_timeout,
        email_verify_max_concurrent=settings.email_verify_max_concurrent,
        email_verify_mode=settings.email_verify_mode,
        email_verify_rate_limit=settings.email_verify_rate_limit,
        email_deduce_template_group=settings.email_deduce_template_group,
        email_deduce_mode=settings.email_deduce_mode,
        default_page_size=settings.default_page_size,
        smtp_host=settings.smtp_host or "",
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user or "",
        smtp_password=_mask(settings.smtp_password),
        smtp_use_tls=settings.smtp_use_tls,
        email_copy_format=settings.email_copy_format,
        backup_enabled=settings.backup_enabled,
        backup_interval=settings.backup_interval,
        backup_unit=settings.backup_unit,
        backup_keep_count=settings.backup_keep_count,
    )


@router.put("/", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdate):
    """Update settings: apply to memory + persist to config.json.

    Returns the full settings (same as GET) so the frontend can sync immediately.
    """
    update_data = body.model_dump(exclude_unset=True)
    if update_data:
        # Apply to in-memory settings
        for field, value in update_data.items():
            if hasattr(settings, field):
                setattr(settings, field, value)

        # Persist to config.json (only PERSISTED_FIELDS are written)
        save_config(update_data)

        # Restart backup scheduler if backup settings changed
        backup_keys = {"backup_enabled", "backup_interval", "backup_unit", "backup_keep_count"}
        if backup_keys & set(update_data.keys()):
            from app.services.backup import restart_backup_scheduler
            restart_backup_scheduler()

    # Return current full settings (re-read to reflect actual state)
    return SettingsResponse(
        ai_provider=settings.ai_provider,
        ai_configured=bool(
            settings.anthropic_api_key if settings.ai_provider == "anthropic"
            else settings.openai_api_key
        ),
        anthropic_api_key=_mask(settings.anthropic_api_key),
        anthropic_base_url=settings.anthropic_base_url,
        anthropic_model=settings.anthropic_model,
        openai_api_key=_mask(settings.openai_api_key),
        openai_base_url=settings.openai_base_url,
        openai_model=settings.openai_model,
        ai_max_tokens=settings.ai_max_tokens,
        ai_temperature=settings.ai_temperature,
        db_engine=settings.db_engine,
        email_verify_timeout=settings.email_verify_timeout,
        email_verify_max_concurrent=settings.email_verify_max_concurrent,
        email_verify_mode=settings.email_verify_mode,
        email_verify_rate_limit=settings.email_verify_rate_limit,
        email_deduce_template_group=settings.email_deduce_template_group,
        email_deduce_mode=settings.email_deduce_mode,
        default_page_size=settings.default_page_size,
        smtp_host=settings.smtp_host or "",
        smtp_port=settings.smtp_port,
        smtp_user=settings.smtp_user or "",
        smtp_password=_mask(settings.smtp_password),
        smtp_use_tls=settings.smtp_use_tls,
        email_copy_format=settings.email_copy_format,
        backup_enabled=settings.backup_enabled,
        backup_interval=settings.backup_interval,
        backup_unit=settings.backup_unit,
        backup_keep_count=settings.backup_keep_count,
    )


@router.post("/test-ai")
async def test_ai_connection():
    """Test the AI API connection by generating a simple response."""
    # Pre-flight checks before making the actual AI call
    if settings.ai_provider == "anthropic":
        if not settings.anthropic_api_key:
            return {"success": False, "error": "未配置 Anthropic API Key，请在 AI 配置中填入 Key"}
    elif settings.ai_provider == "openai":
        if not settings.openai_api_key:
            return {"success": False, "error": "未配置 OpenAI API Key，请在 AI 配置中填入 Key"}

    try:
        from app.services.ai_service import generate_dev_letter
        result = await generate_dev_letter(
            company_name="Test Company",
            company_industry="Technology",
            employee_name="John Doe",
            employee_position="CTO",
            language="en",
        )
        return {"success": True, "response": result}
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": f"{type(e).__name__}: {e}"}
