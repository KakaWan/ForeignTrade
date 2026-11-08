"""Sender profile model — stores user's own company info for letter generation."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SenderProfile(Base):
    __tablename__ = "sender_profiles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="档案名称")
    company_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    products: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="主营产品/服务")
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    industry: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    introduction: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="企业简介")
    contact_person: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, comment="联系人")
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
