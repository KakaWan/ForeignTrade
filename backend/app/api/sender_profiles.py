"""Sender profile API endpoints."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.sender_profile import SenderProfile
from app.schemas.sender_profile import (
    SenderProfileCreate, SenderProfileUpdate, SenderProfileRead,
)

router = APIRouter(prefix="/sender-profiles", tags=["sender-profiles"])


@router.get("/", response_model=list[SenderProfileRead])
async def list_profiles(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(SenderProfile).order_by(SenderProfile.id))
    return result.scalars().all()


@router.get("/{profile_id}", response_model=SenderProfileRead)
async def get_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(SenderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Sender profile not found")
    return profile


@router.post("/", response_model=SenderProfileRead, status_code=201)
async def create_profile(body: SenderProfileCreate, db: AsyncSession = Depends(get_db)):
    if body.is_default:
        result = await db.execute(select(SenderProfile).where(SenderProfile.is_default == True))
        for p in result.scalars().all():
            p.is_default = False
    profile = SenderProfile(**body.model_dump())
    db.add(profile)
    await db.flush()
    await db.refresh(profile)
    return profile


@router.put("/{profile_id}", response_model=SenderProfileRead)
async def update_profile(profile_id: int, body: SenderProfileUpdate, db: AsyncSession = Depends(get_db)):
    profile = await db.get(SenderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Sender profile not found")
    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(profile, field, value)
    if body.is_default:
        result = await db.execute(
            select(SenderProfile).where(SenderProfile.is_default == True, SenderProfile.id != profile_id)
        )
        for p in result.scalars().all():
            p.is_default = False
    await db.flush()
    await db.refresh(profile)
    return profile


@router.delete("/{profile_id}", status_code=204)
async def delete_profile(profile_id: int, db: AsyncSession = Depends(get_db)):
    profile = await db.get(SenderProfile, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Sender profile not found")
    await db.delete(profile)
