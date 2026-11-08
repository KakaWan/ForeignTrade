"""Employee (people) model."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Date, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="SET NULL"), nullable=True, index=True
    )
    former_company_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="企业删除后保留的原企业名称")
    first_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    position: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    department: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    seniority: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)  # junior/mid/senior/lead/manager/director/vp/cxo
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    personal_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    linkedin: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    birthday: Mapped[Optional[datetime]] = mapped_column(Date, nullable=True, comment="生日(月-日)")
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_blacklisted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)
    contact_status: Mapped[str] = mapped_column(String(20), default="new", index=True, comment="联系状态: new/contacting/follow_up/rejected/partner")
    letter_step: Mapped[int] = mapped_column(Integer, default=0, comment="开发信当前步骤 0-6")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships — lazy="raise" forces explicit loading via options(), preventing accidental N+1
    company: Mapped["Company"] = relationship("Company", back_populates="employees")
    emails: Mapped[list["Email"]] = relationship(
        "Email", back_populates="employee", cascade="all, delete-orphan", lazy="raise"
    )
    dev_letters: Mapped[list["DevLetter"]] = relationship(
        "DevLetter", back_populates="employee", lazy="raise"
    )
    follow_ups: Mapped[list["FollowUp"]] = relationship(
        "FollowUp", back_populates="employee", lazy="raise"
    )
