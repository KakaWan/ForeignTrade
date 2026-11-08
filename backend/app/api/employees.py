"""Employee (People) API endpoints."""

import re
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select, and_, extract, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.config import settings
from app.models.employee import Employee
from app.models.company import Company
from app.models.email import Email
from app.models.product import CompanyProduct
from app.schemas.employee import EmployeeCreate, EmployeeUpdate, EmployeeRead, EmployeeList, EmailBrief
from app.services.company_filters import country_match
from app.services.dedup_service import check_employee_duplicate, normalize_person_name

router = APIRouter(prefix="/employees", tags=["employees"])


def _build_employee_read(
    emp: Employee,
    company_name: Optional[str] = None,
    emails: Optional[list] = None,
) -> EmployeeRead:
    """Build EmployeeRead from ORM object without triggering lazy='raise'.

    Uses explicit field construction instead of model_validate to avoid
    accessing unloaded relationships (emp.emails with lazy='raise').
    """
    return EmployeeRead(
        id=emp.id,
        company_id=emp.company_id,
        company_name=company_name,
        former_company_name=emp.former_company_name,
        first_name=emp.first_name,
        last_name=emp.last_name,
        full_name=emp.full_name,
        position=emp.position,
        department=emp.department,
        seniority=emp.seniority,
        phone=emp.phone,
        personal_email=emp.personal_email,
        whatsapp=emp.whatsapp,
        linkedin=emp.linkedin,
        notes=emp.notes,
        birthday=emp.birthday,
        is_favorite=emp.is_favorite,
        is_blacklisted=emp.is_blacklisted,
        status=emp.status,
        contact_status=emp.contact_status,
        letter_step=emp.letter_step,
        emails=[EmailBrief.model_validate(e) for e in (emails or [])],
        tags=[],
        created_at=emp.created_at,
        updated_at=emp.updated_at,
    )


def _extract_domain(website: Optional[str]) -> str:
    """Extract domain from a website URL string."""
    if not website:
        return ""
    url = website if website.startswith("http") else f"https://{website}"
    try:
        from urllib.parse import urlparse
        hostname = urlparse(url).hostname or ""
        return re.sub(r"^www\.", "", hostname)
    except Exception:
        return ""


async def _auto_deduce_after_create(
    db: AsyncSession, employee: Employee, company: Optional[Company],
) -> None:
    """Auto-deduce (and optionally auto-verify) emails after employee creation.

    Only runs when email_deduce_mode == "auto".
    """
    if settings.email_deduce_mode != "auto":
        return
    if not company or not employee.full_name:
        return

    domain = company.domain or _extract_domain(company.website)
    if not domain:
        return

    from app.services.email_deduction import deduce_emails
    results = await deduce_emails(
        db=db,
        full_name=employee.full_name,
        domain=domain,
        template_group=settings.email_deduce_template_group,
        employee_id=employee.id,
    )

    # Auto-verify if enabled
    if settings.email_verify_mode == "auto" and results:
        from app.services.email_verification import verify_emails_batch
        email_addrs = [r["email"] for r in results]
        await verify_emails_batch(db=db, email_addrs=email_addrs)


async def _sync_personal_email(
    db: AsyncSession, employee_id: int, personal_email: Optional[str]
) -> None:
    """Ensure personal_email is reflected in the Email records table.

    - If personal_email is provided and no matching Email record exists, create one
      (source='manual', is_primary=True).
    - If personal_email is cleared, remove the manual Email record if it exists.
    """
    if personal_email:
        # Check if this email already exists as a record
        existing = await db.execute(
            select(Email).where(
                Email.employee_id == employee_id,
                Email.email == personal_email,
            )
        )
        if not existing.scalar_one_or_none():
            # Create Email record for the personal email
            email_obj = Email(
                employee_id=employee_id,
                email=personal_email,
                pattern_type="personal",
                is_primary=True,
                source="manual",
            )
            db.add(email_obj)
            # Un-mark other primaries — use bulk UPDATE instead of N+1
            await db.execute(
                update(Email)
                .where(
                    Email.employee_id == employee_id,
                    Email.email != personal_email,
                    Email.is_primary == True,
                )
                .values(is_primary=False)
            )
            await db.flush()
    else:
        # personal_email was cleared — remove manual Email record if it exists
        await db.execute(
            delete(Email).where(
                Email.employee_id == employee_id,
                Email.source == "manual",
                Email.pattern_type == "personal",
            )
        )
        await db.flush()


@router.get("/stats")
async def employee_stats(
    db: AsyncSession = Depends(get_db),
):
    """Return aggregate stats for the dashboard.

    Uses COUNT + GROUP BY — no row-level data loaded.
    """
    # Total emails + verification breakdown
    email_total = (await db.execute(select(func.count(Email.id)))).scalar() or 0
    email_valid = (await db.execute(
        select(func.count(Email.id)).where(Email.verification_status == "valid")
    )).scalar() or 0
    # Favorite employees
    fav_count = (await db.execute(
        select(func.count(Employee.id)).where(Employee.is_favorite == True)
    )).scalar() or 0
    # Favorite companies
    fav_companies = (await db.execute(
        select(func.count(Company.id)).where(Company.is_favorite == True)
    )).scalar() or 0

    return {
        "total_emails": email_total,
        "verified_valid": email_valid,
        "verified_unknown": email_total - email_valid,
        "favorite_employees": fav_count,
        "favorite_companies": fav_companies,
    }


@router.get("/frequent-values")
async def frequent_values(
    db: AsyncSession = Depends(get_db),
):
    """Return frequently used values for employee fields, sorted by count desc.

    Uses SQL GROUP BY + COUNT instead of loading all rows into memory.
    """
    from sqlalchemy import literal_column

    async def _top(field, limit: int = 50) -> list[str]:
        rows = await db.execute(
            select(field, func.count().label("c"))
            .where(field.isnot(None))
            .group_by(field)
            .order_by(literal_column("c").desc())
            .limit(limit)
        )
        return [r[0] for r in rows.all()]

    return {
        "positions": await _top(Employee.position),
        "departments": await _top(Employee.department),
        "seniorities": await _top(Employee.seniority),
    }


@router.get("/", response_model=EmployeeList)
async def list_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    company_id: Optional[int] = None,
    country: Optional[str] = None,
    product_ids: Optional[list[int]] = Query(None, description="按所属企业的主营产品/业务筛选，命中任意一个即算"),
    position: Optional[str] = None,
    seniority: Optional[str] = None,
    search: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    status: Optional[str] = None,
    contact_status: Optional[str] = None,
    sort_by: str = Query("created_at", pattern="^(full_name|position|created_at|updated_at)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    """List employees with pagination, filtering, and sorting.

    List query only loads Employee + Company (no emails).
    Emails are fetched on-demand when viewing employee detail.
    """
    # Build filter conditions
    conditions = []
    join_company = False  # whether we need Company join

    if company_id:
        conditions.append(Employee.company_id == company_id)
    if country:
        conditions.append(country_match(country))
        join_company = True
    if product_ids:
        # 子查询而非 join：员工列表的 join_company 是按需开启的，这里不必牵连
        conditions.append(Employee.company_id.in_(
            select(CompanyProduct.company_id).where(
                CompanyProduct.product_id.in_(product_ids)
            )
        ))
    if position:
        conditions.append(Employee.position.ilike(f"%{position}%"))
    if seniority:
        conditions.append(Employee.seniority == seniority)
    if is_favorite is not None:
        conditions.append(Employee.is_favorite == is_favorite)
    if status:
        conditions.append(Employee.status == status)
    if contact_status:
        conditions.append(Employee.contact_status == contact_status)
    if search:
        # Use subquery for email search instead of .any() to avoid implicit relationship load
        email_subq = select(Email.employee_id).where(Email.email.ilike(f"%{search}%")).correlate(Employee)
        search_cond = (
            (Employee.full_name.ilike(f"%{search}%")) |
            (Employee.position.ilike(f"%{search}%")) |
            (Company.name.ilike(f"%{search}%")) |
            (Employee.former_company_name.ilike(f"%{search}%")) |
            (Employee.id.in_(email_subq))
        )
        conditions.append(search_cond)
        join_company = True

    # Count — lightweight, no eager loads
    count_q = select(func.count(Employee.id))
    if join_company:
        count_q = count_q.outerjoin(Company, Employee.company_id == Company.id)
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    # Data query — only load Employee + Company (no emails for list)
    query = select(Employee).options(selectinload(Employee.company))
    if join_company:
        query = query.outerjoin(Company, Employee.company_id == Company.id)
    if conditions:
        query = query.where(*conditions)

    sort_col = getattr(Employee, sort_by)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    employees = result.scalars().all()

    # Batch-load email summaries for list display
    emp_ids = [e.id for e in employees]
    email_map: dict[int, list] = {}
    if emp_ids:
        email_result = await db.execute(
            select(Email).where(Email.employee_id.in_(emp_ids))
        )
        for email_obj in email_result.scalars().all():
            email_map.setdefault(email_obj.employee_id, []).append(email_obj)

    items = []
    for emp in employees:
        # Build EmployeeRead from ORM attributes directly to avoid
        # triggering lazy='raise' on emp.emails
        data = EmployeeRead(
            id=emp.id,
            company_id=emp.company_id,
            company_name=emp.company.name if emp.company else None,
            former_company_name=emp.former_company_name,
            first_name=emp.first_name,
            last_name=emp.last_name,
            full_name=emp.full_name,
            position=emp.position,
            department=emp.department,
            seniority=emp.seniority,
            phone=emp.phone,
            personal_email=emp.personal_email,
            whatsapp=emp.whatsapp,
            linkedin=emp.linkedin,
            notes=emp.notes,
            birthday=emp.birthday,
            is_favorite=emp.is_favorite,
            is_blacklisted=emp.is_blacklisted,
            status=emp.status,
            contact_status=emp.contact_status,
            letter_step=emp.letter_step,
            emails=[EmailBrief.model_validate(e) for e in email_map.get(emp.id, [])],
            tags=[],
            created_at=emp.created_at,
            updated_at=emp.updated_at,
        )
        items.append(data)

    return EmployeeList(items=items, total=total, page=page, page_size=page_size)


@router.get("/upcoming-birthdays")
async def upcoming_birthdays(
    days: int = Query(30, ge=1, le=365, description="查询未来多少天内的生日"),
    db: AsyncSession = Depends(get_db),
):
    """Return employees whose birthday falls within the next N days.

    Uses SQL-side month+day extraction to filter, avoiding loading all
    employees into Python memory.
    """
    today = date.today()
    year = today.year

    # Build a query that computes the next birthday date in SQL
    # We select only the columns we need, plus join company for name
    query = (
        select(
            Employee.id,
            Employee.full_name,
            Employee.position,
            Employee.birthday,
            Company.name.label("company_name"),
        )
        .outerjoin(Company, Employee.company_id == Company.id)
        .where(Employee.birthday.is_not(None))
    )

    rows = (await db.execute(query)).all()

    results = []
    for row in rows:
        emp_id, full_name, position, bd, company_name = row
        # This year's birthday
        try:
            bd_this_year = bd.replace(year=year)
        except ValueError:
            bd_this_year = bd.replace(year=year, day=28)

        # If it already passed this year, check next year
        if bd_this_year < today:
            try:
                bd_next = bd.replace(year=year + 1)
            except ValueError:
                bd_next = bd.replace(year=year + 1, day=28)
        else:
            bd_next = bd_this_year

        delta = (bd_next - today).days
        if delta <= days:
            results.append({
                "id": emp_id,
                "full_name": full_name,
                "position": position,
                "company_name": company_name,
                "birthday": bd.isoformat(),
                "upcoming_date": bd_next.isoformat(),
                "days_away": delta,
            })

    # Sort by days away (soonest first)
    results.sort(key=lambda x: x["days_away"])
    return results


@router.get("/{employee_id}", response_model=EmployeeRead)
async def get_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single employee by ID."""
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.company), selectinload(Employee.emails))
        .where(Employee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _build_employee_read(
        employee,
        company_name=employee.company.name if employee.company else None,
        emails=employee.emails,
    )


@router.post("/", response_model=EmployeeRead, status_code=201)
async def create_employee(
    body: EmployeeCreate,
    check_dup: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """Create a new employee. Checks for duplicates within the same company."""
    # Verify company exists
    company = None
    if body.company_id:
        company = await db.get(Company, body.company_id)
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

    # Duplicate check (using normalized name, only if company_id provided)
    if check_dup and body.company_id:
        dupes = await check_employee_duplicate(db, body.company_id, body.full_name)
        if dupes:
            raise HTTPException(
                status_code=409,
                detail={"message": "Potential duplicate employee found", "matches": dupes},
            )

    # Auto-parse first_name/last_name from full_name if not provided
    data = body.model_dump(exclude={"tags"}, exclude_none=True)
    if not data.get("first_name") and not data.get("last_name") and data.get("full_name"):
        parts = data["full_name"].strip().split()
        if len(parts) >= 2:
            data["first_name"] = parts[0]
            data["last_name"] = parts[-1]
        elif len(parts) == 1:
            data["last_name"] = parts[0]

    employee = Employee(**data)
    db.add(employee)
    await db.flush()
    await db.refresh(employee)

    # Sync personal_email to Email records table
    if body.personal_email:
        await _sync_personal_email(db, employee.id, body.personal_email)

    # Auto-deduce emails if enabled
    await _auto_deduce_after_create(db, employee, company)

    # Reload employee with emails relationship (populate_existing to refresh cache)
    result = await db.execute(
        select(Employee).options(
            selectinload(Employee.company), selectinload(Employee.emails)
        ).where(Employee.id == employee.id).execution_options(populate_existing=True)
    )
    emp = result.scalar_one()
    return _build_employee_read(
        emp,
        company_name=emp.company.name if emp.company else None,
        emails=emp.emails,
    )


@router.put("/{employee_id}", response_model=EmployeeRead)
async def update_employee(
    employee_id: int,
    body: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an employee."""
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    update_data = body.model_dump(exclude_unset=True, exclude={"tags"})
    for field, value in update_data.items():
        setattr(employee, field, value)

    # If reassigning to a new company, clear former_company_name
    if "company_id" in update_data and update_data["company_id"] is not None:
        employee.former_company_name = None

    # If contact_status changed to partner, ensure letter_step is set to 6
    if update_data.get("contact_status") == "partner":
        if employee.letter_step < 6:
            employee.letter_step = 6

    await db.flush()
    await db.refresh(employee)

    # Sync personal_email to Email records if it changed
    if "personal_email" in update_data:
        await _sync_personal_email(db, employee_id, update_data["personal_email"])

    # Load company + emails relationships for response (populate_existing to refresh cache)
    result = await db.execute(
        select(Employee).options(
            selectinload(Employee.company), selectinload(Employee.emails)
        ).where(Employee.id == employee_id).execution_options(populate_existing=True)
    )
    emp = result.scalar_one()
    return _build_employee_read(
        emp,
        company_name=emp.company.name if emp.company else None,
        emails=emp.emails,
    )


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Delete an employee."""
    employee = await db.get(Employee, employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    await db.delete(employee)


@router.post("/{employee_id}/favorite", response_model=EmployeeRead)
async def toggle_favorite(employee_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle favorite status for an employee."""
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.company), selectinload(Employee.emails))
        .where(Employee.id == employee_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    employee.is_favorite = not employee.is_favorite
    await db.flush()
    return _build_employee_read(
        employee,
        company_name=employee.company.name if employee.company else None,
        emails=employee.emails,
    )


@router.post("/batch", response_model=list[EmployeeRead], status_code=201)
async def create_employees_batch(
    employees: list[EmployeeCreate],
    db: AsyncSession = Depends(get_db),
):
    """Create multiple employees at once."""
    results = []
    for emp_data in employees:
        company = None
        if emp_data.company_id:
            company = await db.get(Company, emp_data.company_id)
            if not company:
                continue

        employee = Employee(**emp_data.model_dump(exclude={"tags"}, exclude_none=True))
        db.add(employee)
        await db.flush()
        await db.refresh(employee)

        # Sync personal_email to Email records
        if emp_data.personal_email:
            await _sync_personal_email(db, employee.id, emp_data.personal_email)

        # Auto-deduce emails if enabled
        await _auto_deduce_after_create(db, employee, company)

        # Reload with relationships for response
        emp_result = await db.execute(
            select(Employee)
            .options(selectinload(Employee.company), selectinload(Employee.emails))
            .where(Employee.id == employee.id)
            .execution_options(populate_existing=True)
        )
        emp = emp_result.scalar_one()
        results.append(_build_employee_read(
            emp,
            company_name=emp.company.name if emp.company else None,
            emails=emp.emails,
        ))

    return results


@router.post("/batch-delete", status_code=200)
async def batch_delete_employees(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple employees by IDs."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    result = await db.execute(
        delete(Employee).where(Employee.id.in_(ids))
    )
    return {"success": True, "deleted": result.rowcount}


@router.post("/batch-update", status_code=200)
async def batch_update_employees(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch update employee fields (contact_status, letter_step, etc.)."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    updatable = {"contact_status", "letter_step"}
    updates = {k: v for k, v in body.items() if k != "ids" and k in updatable}
    if not updates:
        raise HTTPException(status_code=400, detail="没有可更新的字段")
    result = await db.execute(
        update(Employee).where(Employee.id.in_(ids)).values(**updates)
    )
    return {"success": True, "updated": result.rowcount}


@router.post("/batch/favorite", status_code=200)
async def batch_favorite_employees(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch set/unset favorite for employees."""
    ids = body.get("ids", [])
    favorite = body.get("favorite", True)
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    result = await db.execute(
        update(Employee).where(Employee.id.in_(ids)).values(is_favorite=favorite)
    )
    return {"success": True, "updated": result.rowcount}
