"""Pydantic schemas for Email deduction and verification."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class EmailDeduceRequest(BaseModel):
    """Request to deduce email addresses for an employee."""
    employee_id: Optional[int] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    full_name: Optional[str] = None
    domain: str = Field(..., description="Company email domain, e.g. 'example.com'")
    template_group: Optional[str] = None  # override default template group
    custom_patterns: Optional[list[str]] = None  # additional custom patterns


class EmailDeduceResult(BaseModel):
    email: str
    pattern_type: str
    domain: Optional[str] = None


class EmailVerifyRequest(BaseModel):
    """Request to verify one or more email addresses."""
    email_ids: Optional[list[int]] = None  # verify existing emails by ID
    emails: Optional[list[str]] = None  # verify raw email strings


class EmailVerifyResult(BaseModel):
    email: str
    verification_status: str  # valid / likely_valid / unknown
    mx_record: Optional[str] = None
    smtp_response: Optional[str] = None
    details: Optional[str] = None


class EmailCreate(BaseModel):
    employee_id: int
    email: str
    pattern_type: Optional[str] = None
    is_primary: bool = False
    source: str = "manual"


class EmailUpdate(BaseModel):
    email: Optional[str] = None
    is_primary: Optional[bool] = None
    verification_status: Optional[str] = None
    notes: Optional[str] = None


class EmailRead(BaseModel):
    id: int
    employee_id: int
    email: str
    pattern_type: Optional[str] = None
    verification_status: str = "unknown"
    verified_at: Optional[datetime] = None
    mx_record: Optional[str] = None
    is_primary: bool = False
    source: str = "deduced"
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
