"""Customer business-line catalog and the company ↔ catalog association.

`Product` is a user-maintainable dictionary of the business lines / product
categories a *client* company deals in (胶印、大幅面喷绘、展会搭建 …), Chinese +
English. It is NOT our own product range — that lives in SenderProfile.

`CompanyProduct` links a company to the lines it mainly deals in, so development
letters can recommend the materials that fit that business.
"""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Product(Base):
    """A client business line / product category (e.g. 大幅面喷绘 / Large Format Printing)."""
    __tablename__ = "products"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)  # 中文名
    name_en: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)  # 英文名
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # 分组，如「印刷服务」
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class CompanyProduct(Base):
    """Many-to-many link between a client company and the business lines it deals in."""
    __tablename__ = "company_products"
    __table_args__ = (
        UniqueConstraint("company_id", "product_id", name="uq_company_product"),
        Index("ix_company_product_lookup", "company_id", "product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
