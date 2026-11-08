"""Development letter model."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class DevLetter(Base):
    __tablename__ = "dev_letters"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True
    )
    company_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    email_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("emails.id", ondelete="SET NULL"), nullable=True, index=True
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    step: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="步骤 1-6")
    language: Mapped[str] = mapped_column(String(10), default="en")  # en/de/fr/es/zh etc.
    template_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ai_model: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    ai_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_sent: Mapped[bool] = mapped_column(default=False, index=True)
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    send_method: Mapped[str] = mapped_column(String(20), default="manual")  # manual / smtp
    progress: Mapped[str] = mapped_column(String(20), default="draft", index=True)  # draft/sent/replied/interested/negotiating/closed
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    employee: Mapped[Optional["Employee"]] = relationship("Employee", back_populates="dev_letters")
    company: Mapped[Optional["Company"]] = relationship("Company", back_populates="dev_letters")
    email: Mapped[Optional["Email"]] = relationship("Email", back_populates="dev_letters")
