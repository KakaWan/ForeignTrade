"""Email deduction and verification API endpoints."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.employee import Employee
from app.models.email import Email
from app.models.company import Company
from app.schemas.email import (
    EmailDeduceRequest, EmailDeduceResult,
    EmailVerifyRequest, EmailVerifyResult,
    EmailCreate, EmailUpdate, EmailRead,
)
from app.services.email_deduction import deduce_emails
from app.services.email_verification import verify_emails_batch
from app.core.config import settings

router = APIRouter(prefix="/emails", tags=["emails"])


@router.post("/deduce", response_model=list[EmailDeduceResult])
async def deduce_email_addresses(
    body: EmailDeduceRequest,
    db: AsyncSession = Depends(get_db),
):
    """Deduce possible email addresses for an employee.

    If employee_id is provided, results are persisted to the database.
    Otherwise, returns computed results without saving.
    """

    # Resolve full_name and domain
    full_name = body.full_name
    domain = body.domain

    if body.employee_id and not full_name:
        employee = await db.get(Employee, body.employee_id)
        if not employee:
            raise HTTPException(status_code=404, detail="Employee not found")
        full_name = employee.full_name
        # Get domain from company if not provided
        if not domain:
            company = await db.get(Company, employee.company_id)
            if company and company.domain:
                domain = company.domain

    if not full_name:
        raise HTTPException(status_code=400, detail="Employee name is required")
    if not domain:
        raise HTTPException(status_code=400, detail="Email domain is required")

    results = await deduce_emails(
        db=db,
        full_name=full_name,
        domain=domain,
        template_group=body.template_group or settings.email_deduce_template_group,
        custom_patterns=body.custom_patterns,
        employee_id=body.employee_id,
    )

    # Auto-verify if both deduction and verification are in auto mode
    if settings.email_verify_mode == "auto" and results:
        email_addrs = [r["email"] for r in results]
        verify_body = EmailVerifyRequest(emails=email_addrs)
        await verify_email_addresses(verify_body, db)

    return [EmailDeduceResult(**r) for r in results]


@router.post("/verify", response_model=list[EmailVerifyResult])
async def verify_email_addresses(
    body: EmailVerifyRequest,
    db: AsyncSession = Depends(get_db),
):
    """Verify a single email address via multi-signal approach.

    Rate limited: only one email per request, max N per minute (configurable).
    This does NOT send any emails.
    """

    if not body.email_ids and not body.emails:
        raise HTTPException(status_code=400, detail="Provide email_ids or emails to verify")

    # Enforce single-email verification (no batch)
    total_count = (len(body.email_ids) if body.email_ids else 0) + (len(body.emails) if body.emails else 0)
    if total_count > 1:
        raise HTTPException(
            status_code=400,
            detail=f"Only one email can be verified per request (got {total_count}). Use sequential calls with rate limiting.",
        )

    results = await verify_emails_batch(
        db=db,
        email_ids=body.email_ids,
        email_addrs=body.emails,
    )

    # Commit immediately so subsequent requests see the updated verification status
    await db.commit()

    return [EmailVerifyResult(**r) for r in results]


@router.post("/deduce-and-verify", response_model=list[EmailVerifyResult])
async def deduce_and_verify(
    body: EmailDeduceRequest,
    db: AsyncSession = Depends(get_db),
):
    """One-step: deduce emails. Verification is handled separately via /verify.

    Note: This endpoint now only deduces. If auto-verify is enabled,
    the /deduce endpoint handles it. For manual mode, call /verify separately.
    """
    # Deduce first
    deduced = await deduce_email_addresses(body, db)

    # If verification is enabled, verify the first deduced email only
    if settings.email_verify_mode != "disabled" and deduced:
        verify_body = EmailVerifyRequest(emails=[deduced[0].email])
        return await verify_email_addresses(verify_body, db)

    # Otherwise return deduced results as unverified
    return [
        EmailVerifyResult(
            email=r.email,
            verification_status="unknown",
            mx_record=None,
            smtp_response=None,
            details="Deduced but not verified — verification is disabled",
        )
        for r in deduced
    ]


@router.get("/list", response_model=list[EmailRead])
async def list_emails(
    employee_id: int = Query(..., description="Filter by employee ID"),
    db: AsyncSession = Depends(get_db),
):
    """List all emails for an employee."""
    result = await db.execute(
        select(Email).where(Email.employee_id == employee_id).order_by(Email.is_primary.desc(), Email.created_at)
    )
    return result.scalars().all()


@router.post("/add", response_model=EmailRead, status_code=201)
async def add_email(body: EmailCreate, db: AsyncSession = Depends(get_db)):
    """Manually add an email address for an employee."""
    # Verify employee exists
    employee = await db.get(Employee, body.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Check for duplicate email
    existing = await db.execute(
        select(Email).where(Email.email == body.email)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Email already exists")

    email_obj = Email(
        employee_id=body.employee_id,
        email=body.email,
        pattern_type=body.pattern_type,
        is_primary=body.is_primary,
        source=body.source,
    )
    db.add(email_obj)
    await db.flush()
    await db.refresh(email_obj)
    return EmailRead.model_validate(email_obj)


@router.put("/{email_id}", response_model=EmailRead)
async def update_email(email_id: int, body: EmailUpdate, db: AsyncSession = Depends(get_db)):
    """Update an email record."""
    email_obj = await db.get(Email, email_id)
    if not email_obj:
        raise HTTPException(status_code=404, detail="Email not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(email_obj, field, value)

    # If setting as primary, unset other primaries for same employee
    if body.is_primary:
        await db.execute(
            update(Email)
            .where(
                Email.employee_id == email_obj.employee_id,
                Email.id != email_id,
                Email.is_primary == True,
            )
            .values(is_primary=False)
        )

    await db.flush()
    await db.refresh(email_obj)
    return EmailRead.model_validate(email_obj)


@router.delete("/{email_id}", status_code=204)
async def delete_email(email_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an email record."""
    email_obj = await db.get(Email, email_id)
    if not email_obj:
        raise HTTPException(status_code=404, detail="Email not found")
    await db.delete(email_obj)
