"""Pydantic schemas for LetterTemplate CRUD."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class LetterTemplateCreate(BaseModel):
    name: str = Field(..., max_length=200)
    content: str
    step: Optional[int] = None
    is_default: bool = False
    sort_order: int = 0


class LetterTemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None
    step: Optional[int] = None
    is_default: Optional[bool] = None
    sort_order: Optional[int] = None


class LetterTemplateRead(BaseModel):
    id: int
    name: str
    content: str
    step: Optional[int] = None
    is_default: bool = False
    sort_order: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
