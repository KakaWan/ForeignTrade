"""Pydantic schemas for Tags, Categories, and common types."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


# ── Tag ──────────────────────────────────────────────
class TagCreate(BaseModel):
    name: str = Field(..., max_length=100)
    color: Optional[str] = None
    tag_type: str = "custom"


class TagRead(BaseModel):
    id: int
    name: str
    color: Optional[str] = None
    tag_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Category ─────────────────────────────────────────
class CategoryCreate(BaseModel):
    name: str = Field(..., max_length=100)
    parent_id: Optional[int] = None
    category_type: str = "custom"
    icon: Optional[str] = None
    sort_order: int = 0


class CategoryRead(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None
    category_type: str
    icon: Optional[str] = None
    sort_order: int = 0
    children: list["CategoryRead"] = []
    created_at: datetime

    model_config = {"from_attributes": True}


# ── FollowUp ─────────────────────────────────────────
class FollowUpCreate(BaseModel):
    employee_id: Optional[int] = None
    company_id: Optional[int] = None
    reminder_date: datetime
    title: Optional[str] = None
    notes: Optional[str] = None


class FollowUpUpdate(BaseModel):
    reminder_date: Optional[datetime] = None
    status: Optional[str] = None
    title: Optional[str] = None
    notes: Optional[str] = None


class FollowUpRead(BaseModel):
    id: int
    employee_id: Optional[int] = None
    company_id: Optional[int] = None
    employee_name: Optional[str] = None
    company_name: Optional[str] = None
    reminder_date: datetime
    status: str = "pending"
    title: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── EmailPattern ─────────────────────────────────────
class EmailPatternCreate(BaseModel):
    name: str
    pattern: str
    description: Optional[str] = None
    template_group: str = "standard"
    is_enabled: bool = True
    sort_order: int = 0


class EmailPatternUpdate(BaseModel):
    name: Optional[str] = None
    pattern: Optional[str] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None
    sort_order: Optional[int] = None


class EmailPatternRead(BaseModel):
    id: int
    name: str
    pattern: str
    description: Optional[str] = None
    template_group: str
    is_enabled: bool
    sort_order: int
    created_at: datetime

    model_config = {"from_attributes": True}


class AiPatternGenerateRequest(BaseModel):
    country: Optional[str] = None
    industry: Optional[str] = None
    template_group: str = "standard"
    prompt: Optional[str] = None


class AiPatternItem(BaseModel):
    name: str
    pattern: str
    description: Optional[str] = None


# ── Common ───────────────────────────────────────────
class PaginatedResponse(BaseModel):
    total: int
    page: int
    page_size: int


class MessageResponse(BaseModel):
    message: str
    success: bool = True


class DedupResult(BaseModel):
    is_duplicate: bool
    similarity: float
    match_type: str  # website / name / domain
    existing_id: Optional[int] = None
