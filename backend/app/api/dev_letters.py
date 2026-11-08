"""Development letter API endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

logger = logging.getLogger(__name__)
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.dev_letter import DevLetter
from app.models.employee import Employee
from app.models.company import Company
from app.models.email import Email
from app.models.sender_profile import SenderProfile
from app.schemas.dev_letter import DevLetterGenerate, DevLetterCreate, DevLetterUpdate, DevLetterRead
from app.services.ai_service import generate_dev_letter, generate_letter_from_template, build_data_map, replace_data_wildcards, render_preview
from app.services.product_catalog import format_products_for_letter, load_company_products

router = APIRouter(prefix="/dev-letters", tags=["dev-letters"])


@router.get("/default-prompt")
async def get_default_prompt():
    """Get the default AI system prompt for letter generation."""
    from app.services.ai_service import DEFAULT_SYSTEM_PROMPT
    return {"prompt": DEFAULT_SYSTEM_PROMPT}


@router.post("/generate", response_model=str)
async def generate_letter(
    body: DevLetterGenerate,
    db: AsyncSession = Depends(get_db),
):
    """Generate a development letter using AI.

    Returns the generated text content.
    """
    # Resolve company/employee info from IDs if not provided directly
    company_name = body.company_name
    company_industry = body.company_industry
    employee_name = body.employee_name
    employee_position = body.employee_position

    employee_dict = None
    company_dict = None
    sender_dict = None

    # Load sender profile
    if body.sender_profile_id:
        sender = await db.get(SenderProfile, body.sender_profile_id)
        if sender:
            sender_dict = {
                "company_name": sender.company_name,
                "products": sender.products,
                "website": sender.website,
                "country": sender.country,
                "industry": sender.industry,
                "introduction": sender.introduction,
                "contact_person": sender.contact_person,
                "phone": sender.phone,
                "email": sender.email,
                "address": sender.address,
            }

    if body.company_id and not company_name:
        company = await db.get(Company, body.company_id)
        if company:
            company_name = company.name
            company_industry = company_industry or company.industry
            products = await load_company_products(db, [company.id])
            company_dict = {
                "name": company.name,
                "website": company.website,
                "industry": company.industry,
                "country": company.country,
                "countries": company.countries,
                "region": company.region,
                "open_email": company.open_email,
                "phone": company.phone,
                "domain": company.domain,
                "products": format_products_for_letter(products.get(company.id, [])),
            }

    if body.employee_id and not employee_name:
        employee = await db.get(Employee, body.employee_id)
        if employee:
            employee_name = employee.full_name
            employee_position = employee_position or employee.position
            employee_dict = {
                "full_name": employee.full_name,
                "first_name": employee.first_name,
                "last_name": employee.last_name,
                "position": employee.position,
                "department": employee.department,
                "phone": employee.phone,
                "personal_email": employee.personal_email,
                "whatsapp": employee.whatsapp,
                "linkedin": employee.linkedin,
            }

    # If template_content provided, use the new wildcard-based generation
    try:
        if body.template_content:
            content = await generate_letter_from_template(
                template_content=body.template_content,
                employee=employee_dict,
                company=company_dict,
                sender=sender_dict,
                custom_prompt=body.custom_prompt,
                language=body.language or "en",
            )
            return content

        # Fallback: legacy generation
        content = await generate_dev_letter(
            company_name=company_name,
            company_industry=company_industry,
            employee_name=employee_name,
            employee_position=employee_position,
            language=body.language,
            custom_prompt=body.custom_prompt,
        )
        return content
    except ValueError as e:
        # AI-specific errors (API key missing, auth failed, timeout, etc.)
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Letter generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成失败: {type(e).__name__}: {e}")


@router.post("/preview")
async def preview_letter(
    body: DevLetterGenerate,
    db: AsyncSession = Depends(get_db),
):
    """Preview a template with data wildcards replaced.
    Returns segmented content for colored display.
    No AI call — just data substitution.
    """
    if not body.template_content:
        return {"segments": []}

    employee_dict = None
    company_dict = None
    sender_dict = None

    if body.sender_profile_id:
        sender = await db.get(SenderProfile, body.sender_profile_id)
        if sender:
            sender_dict = {
                "company_name": sender.company_name,
                "products": sender.products,
                "website": sender.website,
                "country": sender.country,
                "industry": sender.industry,
                "introduction": sender.introduction,
                "contact_person": sender.contact_person,
                "phone": sender.phone,
                "email": sender.email,
                "address": sender.address,
            }

    if body.company_id:
        company = await db.get(Company, body.company_id)
        if company:
            products = await load_company_products(db, [company.id])
            company_dict = {
                "name": company.name,
                "website": company.website,
                "industry": company.industry,
                "country": company.country,
                "countries": company.countries,
                "region": company.region,
                "open_email": company.open_email,
                "phone": company.phone,
                "domain": company.domain,
                "products": format_products_for_letter(products.get(company.id, [])),
            }

    if body.employee_id:
        employee = await db.get(Employee, body.employee_id)
        if employee:
            employee_dict = {
                "full_name": employee.full_name,
                "first_name": employee.first_name,
                "last_name": employee.last_name,
                "position": employee.position,
                "department": employee.department,
                "phone": employee.phone,
                "personal_email": employee.personal_email,
                "whatsapp": employee.whatsapp,
                "linkedin": employee.linkedin,
            }

    data_map = build_data_map(employee_dict, company_dict, sender_dict)
    segments = render_preview(body.template_content, data_map)
    return {"segments": segments}


@router.post("/generate-and-save", response_model=DevLetterRead)
async def generate_and_save_letter(
    body: DevLetterGenerate,
    db: AsyncSession = Depends(get_db),
):
    """Generate a development letter and save it to the database."""
    # Generate content — with error handling
    try:
        content = await generate_letter(body, db)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Letter generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"生成失败: {type(e).__name__}: {e}")

    # Determine step from template or body
    step = getattr(body, 'step', None)

    # Save to DB
    letter = DevLetter(
        employee_id=body.employee_id,
        company_id=body.company_id,
        content=content,
        step=step,
        language=body.language,
        template_name=body.template_name,
        ai_model="anthropic",  # Will be set from config
        ai_prompt=body.custom_prompt,
    )
    db.add(letter)
    await db.flush()
    await db.refresh(letter)

    # Update employee's letter_step and contact_status
    if body.employee_id:
        emp = await db.get(Employee, body.employee_id)
        if emp:
            if step and step > emp.letter_step:
                emp.letter_step = step
            if emp.contact_status == "new":
                emp.contact_status = "contacting"

    data = DevLetterRead.model_validate(letter)
    # Enrich with names
    if body.employee_id:
        emp = await db.get(Employee, body.employee_id)
        if emp:
            data.employee_name = emp.full_name
    if body.company_id:
        comp = await db.get(Company, body.company_id)
        if comp:
            data.company_name = comp.name
    return data


@router.get("/list", response_model=list[DevLetterRead])
async def list_dev_letters(
    employee_id: Optional[int] = None,
    company_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    """List development letters, optionally filtered."""
    query = select(DevLetter)
    if employee_id:
        query = query.where(DevLetter.employee_id == employee_id)
    if company_id:
        query = query.where(DevLetter.company_id == company_id)
    query = query.order_by(DevLetter.created_at.desc())

    result = await db.execute(query)
    letters = result.scalars().all()

    items = []
    for letter in letters:
        data = DevLetterRead.model_validate(letter)
        if letter.employee_id:
            emp = await db.get(Employee, letter.employee_id)
            if emp:
                data.employee_name = emp.full_name
        if letter.company_id:
            comp = await db.get(Company, letter.company_id)
            if comp:
                data.company_name = comp.name
        items.append(data)

    return items


@router.post("/", response_model=DevLetterRead, status_code=201)
async def create_dev_letter(body: DevLetterCreate, db: AsyncSession = Depends(get_db)):
    """Manually create a development letter."""
    letter = DevLetter(**body.model_dump())
    db.add(letter)
    await db.flush()
    await db.refresh(letter)
    return DevLetterRead.model_validate(letter)


@router.put("/{letter_id}", response_model=DevLetterRead)
async def update_dev_letter(
    letter_id: int,
    body: DevLetterUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a development letter."""
    letter = await db.get(DevLetter, letter_id)
    if not letter:
        raise HTTPException(status_code=404, detail="Letter not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(letter, field, value)

    # If marking as sent, record the timestamp
    if body.is_sent and not letter.sent_at:
        from datetime import datetime
        letter.sent_at = datetime.utcnow()
        letter.send_method = "manual"

    await db.flush()
    await db.refresh(letter)
    return DevLetterRead.model_validate(letter)


@router.delete("/{letter_id}", status_code=204)
async def delete_dev_letter(letter_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a development letter."""
    letter = await db.get(DevLetter, letter_id)
    if not letter:
        raise HTTPException(status_code=404, detail="Letter not found")
    await db.delete(letter)
