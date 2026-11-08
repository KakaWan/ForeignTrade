"""Letter template API endpoints."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.letter_template import LetterTemplate
from app.schemas.letter_template import (
    LetterTemplateCreate, LetterTemplateUpdate, LetterTemplateRead,
)

router = APIRouter(prefix="/letter-templates", tags=["letter-templates"])


@router.get("/", response_model=list[LetterTemplateRead])
async def list_templates(
    db: AsyncSession = Depends(get_db),
):
    """List all letter templates, sorted by sort_order."""
    result = await db.execute(
        select(LetterTemplate).order_by(LetterTemplate.sort_order, LetterTemplate.id)
    )
    return result.scalars().all()


@router.get("/{template_id}", response_model=LetterTemplateRead)
async def get_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single template by ID."""
    template = await db.get(LetterTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return template


@router.post("/", response_model=LetterTemplateRead, status_code=201)
async def create_template(
    body: LetterTemplateCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a new letter template."""
    # If this is set as default, unset other defaults
    if body.is_default:
        result = await db.execute(
            select(LetterTemplate).where(LetterTemplate.is_default == True)
        )
        for t in result.scalars().all():
            t.is_default = False

    template = LetterTemplate(**body.model_dump())
    db.add(template)
    await db.flush()
    await db.refresh(template)
    return template


@router.put("/{template_id}", response_model=LetterTemplateRead)
async def update_template(
    template_id: int,
    body: LetterTemplateUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a letter template."""
    template = await db.get(LetterTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(template, field, value)

    # If setting as default, unset others
    if body.is_default:
        result = await db.execute(
            select(LetterTemplate).where(
                LetterTemplate.is_default == True,
                LetterTemplate.id != template_id,
            )
        )
        for t in result.scalars().all():
            t.is_default = False

    await db.flush()
    await db.refresh(template)
    return template


@router.delete("/{template_id}", status_code=204)
async def delete_template(template_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a letter template."""
    template = await db.get(LetterTemplate, template_id)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    await db.delete(template)
