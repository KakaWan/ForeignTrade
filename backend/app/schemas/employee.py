"""Pydantic schemas for Employee CRUD."""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, Field


class EmployeeCreate(BaseModel):
    company_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: str = Field(..., max_length=255)
    position: Optional[str] = None
    department: Optional[str] = None
    seniority: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    whatsapp: Optional[str] = None
    linkedin: Optional[str] = None
    notes: Optional[str] = None
    birthday: Optional[date] = None
    tags: Optional[list[str]] = None


class EmployeeUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    company_id: Optional[int] = None
    position: Optional[str] = None
    department: Optional[str] = None
    seniority: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    whatsapp: Optional[str] = None
    linkedin: Optional[str] = None
    notes: Optional[str] = None
    birthday: Optional[date] = None
    is_favorite: Optional[bool] = None
    is_blacklisted: Optional[bool] = None
    status: Optional[str] = None
    contact_status: Optional[str] = None
    letter_step: Optional[int] = None
    tags: Optional[list[str]] = None


class EmailBrief(BaseModel):
    id: int
    email: str
    pattern_type: Optional[str] = None
    verification_status: str = "unknown"
    is_primary: bool = False
    source: str = "deduced"

    model_config = {"from_attributes": True}


class EmployeeRead(BaseModel):
    id: int
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    former_company_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: str
    position: Optional[str] = None
    department: Optional[str] = None
    seniority: Optional[str] = None
    phone: Optional[str] = None
    personal_email: Optional[str] = None
    whatsapp: Optional[str] = None
    linkedin: Optional[str] = None
    notes: Optional[str] = None
    birthday: Optional[date] = None
    is_favorite: bool = False
    is_blacklisted: bool = False
    status: str = "active"
    contact_status: str = "new"
    letter_step: int = 0
    emails: list[EmailBrief] = []
    tags: list[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class EmployeeList(BaseModel):
    items: list[EmployeeRead]
    total: int
    page: int
    page_size: int
