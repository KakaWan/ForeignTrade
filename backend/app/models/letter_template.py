"""Letter template model — stores email templates with wildcards."""

from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LetterTemplate(Base):
    __tablename__ = "letter_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="模板名称")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="模板正文，含 {FieldName} 数据通配符和 {AI:指令} AI 通配符")
    step: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="步骤 1-6，null 表示通用模板")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否默认模板")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
