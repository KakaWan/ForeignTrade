"""Pydantic schemas for Company CRUD."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from app.schemas.product import ProductBrief


class SocialLink(BaseModel):
    """A company profile page elsewhere (Facebook / X / Instagram …).

    Fields carry defaults so a malformed row already sitting in the JSON column
    degrades to an empty entry instead of failing every company response.
    """
    platform: str = Field("", max_length=50)
    url: str = Field("", max_length=500)


def _clean_social_links(links: Optional[list]) -> Optional[list]:
    """Drop half-filled rows and trim values, so the form can leave blank rows."""
    if links is None:
        return None
    cleaned = []
    for link in links:
        if isinstance(link, dict):
            platform = (link.get("platform") or "").strip()
            url = (link.get("url") or "").strip()
        else:
            platform = (getattr(link, "platform", "") or "").strip()
            url = (getattr(link, "url", "") or "").strip()
        if platform and url:
            cleaned.append({"platform": platform, "url": url})
    return cleaned


class CompanyCreate(BaseModel):
    name: str = Field(..., max_length=255)
    website: Optional[str] = None
    domain: Optional[str] = None
    # 主国家，由 countries 的第一项自动同步；表单只填 countries
    country: Optional[str] = None
    countries: Optional[str] = None  # 多个国家，逗号+空格分隔，如 "德国, 法国"
    region: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    open_email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    employee_count: Optional[int] = None
    revenue: Optional[str] = None
    founded_year: Optional[int] = None
    linkedin: Optional[str] = None
    social_links: Optional[list[SocialLink]] = None
    notes: Optional[str] = None
    extra_data: Optional[dict] = None
    tags: Optional[list[str]] = None
    product_ids: Optional[list[int]] = None

    @field_validator("social_links", mode="before")
    @classmethod
    def _normalize_social_links(cls, v):
        return _clean_social_links(v)


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    website: Optional[str] = None
    domain: Optional[str] = None
    country: Optional[str] = None
    countries: Optional[str] = None
    region: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    open_email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    employee_count: Optional[int] = None
    revenue: Optional[str] = None
    founded_year: Optional[int] = None
    linkedin: Optional[str] = None
    social_links: Optional[list[SocialLink]] = None
    notes: Optional[str] = None
    extra_data: Optional[dict] = None
    is_favorite: Optional[bool] = None
    is_blacklisted: Optional[bool] = None
    status: Optional[str] = None
    tags: Optional[list[str]] = None
    product_ids: Optional[list[int]] = None

    @field_validator("social_links", mode="before")
    @classmethod
    def _normalize_social_links(cls, v):
        return _clean_social_links(v)


class CompanyRead(BaseModel):
    id: int
    name: str
    name_normalized: Optional[str] = None
    website: Optional[str] = None
    domain: Optional[str] = None
    country: Optional[str] = None
    countries: Optional[str] = None
    region: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None
    open_email: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    address: Optional[str] = None
    employee_count: Optional[int] = None
    revenue: Optional[str] = None
    founded_year: Optional[int] = None
    linkedin: Optional[str] = None
    social_links: list[SocialLink] = []
    notes: Optional[str] = None
    extra_data: Optional[dict] = None
    is_favorite: bool = False
    is_blacklisted: bool = False
    status: str = "active"
    employee_count_actual: int = 0
    tags: list[str] = []
    products: list[ProductBrief] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("social_links", mode="before")
    @classmethod
    def _default_social_links(cls, v):
        # JSON 列可能是 NULL，统一成空数组，前端不用处理 null
        return v or []


class CompanyList(BaseModel):
    items: list[CompanyRead]
    total: int
    page: int
    page_size: int
