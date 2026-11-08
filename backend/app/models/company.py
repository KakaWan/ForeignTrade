"""Company (enterprise) model."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name_normalized: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, index=True)
    domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    # 主国家（= countries 的第一项），保留它是因为列表筛选、导出、去重都按单值走
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    # 完整国家列表，逗号+空格分隔，如 "德国, 法国"；一家企业可能做多个国家的业务
    countries: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    industry: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    open_email: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    whatsapp: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    employee_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    revenue: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    founded_year: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    linkedin: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    # 其他企业主页：[{"platform": "Facebook", "url": "https://..."}]
    social_links: Mapped[Optional[list]] = mapped_column(JSON, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    extra_data: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    is_blacklisted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    status: Mapped[str] = mapped_column(String(20), default="active", index=True)  # active/inactive/archived
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships — lazy="raise" forces explicit loading via options(), preventing accidental N+1
    employees: Mapped[list["Employee"]] = relationship(
        "Employee", back_populates="company", lazy="raise"
    )
    dev_letters: Mapped[list["DevLetter"]] = relationship(
        "DevLetter", back_populates="company", lazy="raise"
    )
    follow_ups: Mapped[list["FollowUp"]] = relationship(
        "FollowUp", back_populates="company", lazy="raise"
    )
    # 主营产品走 company_products 关联表，和 tags(EntityTag) 一样在 API 层显式查询，
    # 不声明 relationship —— 避免 lazy="raise" 在删除企业时被迫加载集合而报错
