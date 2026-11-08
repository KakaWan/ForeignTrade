"""Pydantic schemas for Development Letter."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class DevLetterGenerate(BaseModel):
    """Request to generate a development letter using AI."""
    employee_id: Optional[int] = None
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    company_industry: Optional[str] = None
    employee_name: Optional[str] = None
    employee_position: Optional[str] = None
    sender_profile_id: Optional[int] = None
    step: Optional[int] = None
    language: str = "en"
    custom_prompt: Optional[str] = None
    template_name: Optional[str] = None
    template_content: Optional[str] = None


class DevLetterCreate(BaseModel):
    employee_id: Optional[int] = None
    company_id: Optional[int] = None
    email_id: Optional[int] = None
    content: str
    step: Optional[int] = None
    language: str = "en"
    template_name: Optional[str] = None
    ai_model: Optional[str] = None
    ai_prompt: Optional[str] = None


class DevLetterUpdate(BaseModel):
    content: Optional[str] = None
    language: Optional[str] = None
    is_sent: Optional[bool] = None
    progress: Optional[str] = None
    notes: Optional[str] = None


class DevLetterRead(BaseModel):
    id: int
    employee_id: Optional[int] = None
    company_id: Optional[int] = None
    email_id: Optional[int] = None
    employee_name: Optional[str] = None
    company_name: Optional[str] = None
    content: str
    step: Optional[int] = None
    language: str = "en"
    template_name: Optional[str] = None
    ai_model: Optional[str] = None
    is_sent: bool = False
    sent_at: Optional[datetime] = None
    send_method: str = "manual"
    progress: str = "draft"
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
