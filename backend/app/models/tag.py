"""Tag, Category, and EntityTag models for classification."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Tag(Base):
    """Tags for flexible labeling of companies and employees."""
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True)  # hex color
    tag_type: Mapped[str] = mapped_column(String(20), default="custom")  # industry/status/priority/custom
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Category(Base):
    """Hierarchical categories for organizing companies/employees."""
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True
    )
    category_type: Mapped[str] = mapped_column(String(20), default="custom")  # region/industry/status/custom
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EntityTag(Base):
    """Many-to-many relationship between tags and entities (company/employee)."""
    __tablename__ = "entity_tags"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "tag_id", name="uq_entity_tag"),
        Index("ix_entity_tag_lookup", "entity_type", "entity_id", "tag_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # company / employee
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    tag_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class EntityCategory(Base):
    """Many-to-many relationship between categories and entities."""
    __tablename__ = "entity_categories"
    __table_args__ = (
        UniqueConstraint("entity_type", "entity_id", "category_id", name="uq_entity_category"),
        Index("ix_entity_category_lookup", "entity_type", "entity_id", "category_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    category_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
