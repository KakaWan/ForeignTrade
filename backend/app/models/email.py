"""Email deduction and verification model."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Email(Base):
    __tablename__ = "emails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    employee_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True, unique=True)
    pattern_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    verification_status: Mapped[str] = mapped_column(
        String(20), default="unknown", index=True
    )  # valid / invalid / unknown
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    mx_record: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    smtp_response: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_primary: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    source: Mapped[str] = mapped_column(String(20), default="deduced", index=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    employee: Mapped["Employee"] = relationship("Employee", back_populates="emails")
    dev_letters: Mapped[list["DevLetter"]] = relationship(
        "DevLetter", back_populates="email", lazy="raise"
    )
