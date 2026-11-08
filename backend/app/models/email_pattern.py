"""Email deduction pattern configuration model."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class EmailPattern(Base):
    """Configurable email deduction patterns."""
    __tablename__ = "email_patterns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "first.last"
    pattern: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "{first}.{last}"
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    template_group: Mapped[str] = mapped_column(String(20), default="standard")  # conservative/standard/comprehensive
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
