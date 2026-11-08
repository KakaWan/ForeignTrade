"""Pydantic schemas for SenderProfile CRUD."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class SenderProfileCreate(BaseModel):
    name: str = Field(..., max_length=200)
    company_name: Optional[str] = None
    products: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    introduction: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_default: bool = False


class SenderProfileUpdate(BaseModel):
    name: Optional[str] = None
    company_name: Optional[str] = None
    products: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    introduction: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_default: Optional[bool] = None


class SenderProfileRead(BaseModel):
    id: int
    name: str
    company_name: Optional[str] = None
    products: Optional[str] = None
    website: Optional[str] = None
    country: Optional[str] = None
    industry: Optional[str] = None
    introduction: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    is_default: bool = False
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
