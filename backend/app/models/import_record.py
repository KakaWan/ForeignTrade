"""Import record model for tracking bulk operations."""

from datetime import datetime
from typing import Optional

from sqlalchemy import DateTime, Integer, String, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ImportRecord(Base):
    __tablename__ = "import_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    operation: Mapped[str] = mapped_column(String(20), default="import")  # import / export / merge
    total_rows: Mapped[int] = mapped_column(Integer, default=0)
    success_rows: Mapped[int] = mapped_column(Integer, default=0)
    fail_rows: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="processing")  # processing/completed/failed
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
