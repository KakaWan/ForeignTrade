"""Pydantic schemas for the product catalog."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    name: str = Field(..., max_length=100)  # 中文名
    name_en: Optional[str] = Field(None, max_length=150)
    category: str = Field(..., max_length=50)  # 分组，如「旗帜」
    description: Optional[str] = None
    sort_order: int = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    name_en: Optional[str] = None
    category: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = None


class ProductRead(BaseModel):
    id: int
    name: str
    name_en: Optional[str] = None
    category: str
    description: Optional[str] = None
    sort_order: int = 0
    # 有多少家企业把它列为主营产品（管理界面删除前提示用）
    company_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProductBrief(BaseModel):
    """Embedded in CompanyRead — only what's needed to render tags and labels."""
    id: int
    name: str
    name_en: Optional[str] = None
    category: str

    model_config = {"from_attributes": True}
