"""Company API endpoints."""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.company import Company
from app.models.employee import Employee
from app.models.email import Email
from app.models.tag import EntityTag, Tag
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyRead, CompanyList
from app.schemas.product import ProductBrief
from app.services.company_filters import (
    country_match,
    country_counts,
    join_countries,
    product_match,
    split_countries,
    sync_primary_country,
)
from app.services.dedup_service import check_company_duplicate, normalize_company_name, _extract_domain
from app.services.email_deduction import deduce_emails
from app.services.email_verification import verify_emails_batch
from app.services.product_catalog import (
    delete_company_product_links,
    load_company_products,
    set_company_products,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/companies", tags=["companies"])


async def _attach_products(
    db: AsyncSession, data: CompanyRead, company_id: int
) -> CompanyRead:
    """Fill in 主营产品 on a single-company response.

    Company has no `products` relationship (associations are queried explicitly,
    like EntityTag), so this must be done by hand wherever one company is returned.
    """
    product_map = await load_company_products(db, [company_id])
    data.products = [
        ProductBrief.model_validate(p) for p in product_map.get(company_id, [])
    ]
    return data


@router.get("/frequent-values")
async def frequent_values(
    db: AsyncSession = Depends(get_db),
):
    """Return frequently used values for company fields, sorted by count desc.

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

    # 国家是多值字段，不能直接 GROUP BY；按国家计数再排序
    counts = await country_counts(db)
    countries = [
        name for name, _ in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:50]
    ]

    return {
        "countries": countries,
        "regions": await _top(Company.region),
        "industries": await _top(Company.industry),
    }


@router.get("/", response_model=CompanyList)
async def list_companies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    country: Optional[str] = None,
    industry: Optional[str] = None,
    product_ids: Optional[list[int]] = Query(None, description="按主营产品/业务筛选，命中任意一个即算"),
    search: Optional[str] = None,
    is_favorite: Optional[bool] = None,
    status: Optional[str] = None,
    sort_by: str = Query("created_at", pattern="^(name|country|industry|created_at|updated_at)$"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$"),
    db: AsyncSession = Depends(get_db),
):
    """List companies with pagination, filtering, and sorting."""
    # Build base filter conditions (no eager loads for list)
    conditions = []
    if country:
        conditions.append(country_match(country))
    if industry:
        conditions.append(Company.industry == industry)
    if product_ids:
        conditions.append(product_match(product_ids))
    if is_favorite is not None:
        conditions.append(Company.is_favorite == is_favorite)
    if status:
        conditions.append(Company.status == status)
    if search:
        search_cond = (
            (Company.name.ilike(f"%{search}%")) |
            (Company.website.ilike(f"%{search}%")) |
            (Company.industry.ilike(f"%{search}%")) |
            (Company.open_email.ilike(f"%{search}%"))
        )
        conditions.append(search_cond)

    # Count — lightweight, no joins
    count_q = select(func.count(Company.id))
    if conditions:
        count_q = count_q.where(*conditions)
    total = (await db.execute(count_q)).scalar() or 0

    # Data query — no eager loads, just Company columns
    query = select(Company)
    if conditions:
        query = query.where(*conditions)

    sort_col = getattr(Company, sort_by)
    query = query.order_by(sort_col.desc() if sort_order == "desc" else sort_col.asc())

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    companies = result.scalars().all()

    # Batch-load employee counts via a single subquery
    company_ids = [c.id for c in companies]
    emp_count_map: dict[int, int] = {}
    if company_ids:
        count_result = await db.execute(
            select(Employee.company_id, func.count(Employee.id))
            .where(Employee.company_id.in_(company_ids))
            .group_by(Employee.company_id)
        )
        emp_count_map = dict(count_result.all())

    # Batch-load 主营产品 for the page in one query
    product_map = await load_company_products(db, company_ids)

    items = []
    for c in companies:
        data = CompanyRead.model_validate(c)
        data.employee_count_actual = emp_count_map.get(c.id, 0)
        data.products = [
            ProductBrief.model_validate(p) for p in product_map.get(c.id, [])
        ]
        items.append(data)

    return CompanyList(items=items, total=total, page=page, page_size=page_size)


@router.get("/{company_id}", response_model=CompanyRead)
async def get_company(company_id: int, db: AsyncSession = Depends(get_db)):
    """Get a single company by ID."""
    result = await db.execute(
        select(Company).options(selectinload(Company.employees)).where(Company.id == company_id)
    )
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    data = CompanyRead.model_validate(company)
    data.employee_count_actual = len(company.employees)
    return await _attach_products(db, data, company_id)


@router.post("/", response_model=CompanyRead, status_code=201)
async def create_company(
    body: CompanyCreate,
    check_dup: bool = Query(True, description="Check for duplicates before creating"),
    db: AsyncSession = Depends(get_db),
):
    """Create a new company. Optionally checks for duplicates first."""
    # Extract domain from website
    domain = _extract_domain(body.website) if body.website else None

    # 域名重复不在这里单独拦截：check_company_duplicate 的第 2 步已经按
    # match_type="domain" 报出来（见 dedup_service）。原来那条“无论如何都拦”的
    # 硬校验会让 check_dup=false 的强制创建永远失败，用户点了「仍要创建」也只
    # 得到一句「创建失败」。域名本来也不是强约束——改企业时就能改成重复域名。

    # countries 是真实来源，country（主国家）由它推导；只传了 country 时反过来补齐
    raw_countries = body.countries if body.countries is not None else body.country
    countries = join_countries(split_countries(raw_countries))
    primary_country = split_countries(countries)[0] if countries else None

    # Duplicate check
    if check_dup:
        dupes = await check_company_duplicate(db, body.name, body.website, primary_country)
        if dupes:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Potential duplicate company found",
                    "matches": dupes,
                },
            )

    # Compute name_normalized
    name_normalized = normalize_company_name(body.name)

    company = Company(
        **body.model_dump(exclude={"tags", "product_ids"}, exclude_none=True),
        domain=domain,
        name_normalized=name_normalized,
    )
    sync_primary_country(company, countries)

    db.add(company)
    await db.flush()
    await db.refresh(company)

    if body.product_ids is not None:
        await set_company_products(db, company.id, body.product_ids)

    # Handle tags — batch lookup instead of N+1
    if body.tags:
        existing_tags = (await db.execute(
            select(Tag).where(Tag.name.in_(body.tags))
        )).scalars().all()
        tag_map = {t.name: t for t in existing_tags}

        for tag_name in body.tags:
            if tag_name in tag_map:
                tag = tag_map[tag_name]
            else:
                tag = Tag(name=tag_name)
                db.add(tag)
                await db.flush()
            db.add(EntityTag(entity_type="company", entity_id=company.id, tag_id=tag.id))
        await db.flush()

    return await _attach_products(db, CompanyRead.model_validate(company), company.id)


@router.put("/{company_id}", response_model=CompanyRead)
async def update_company(
    company_id: int,
    body: CompanyUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a company.

    When a company's domain becomes available (was empty, now set),
    automatically trigger email deduction + verification for all employees
    who don't yet have a valid email.
    """
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    old_domain = company.domain

    update_data = body.model_dump(exclude_unset=True, exclude={"tags", "product_ids"})
    for field, value in update_data.items():
        setattr(company, field, value)

    # countries 是真实来源，country（主国家）跟着它走
    if "countries" in update_data or "country" in update_data:
        raw_countries = (
            update_data["countries"] if "countries" in update_data else update_data.get("country")
        )
        sync_primary_country(company, join_countries(split_countries(raw_countries)))

    # Update domain if website changed
    if body.website is not None:
        domain = _extract_domain(body.website) if body.website else None
        company.domain = domain

    # Also try to extract domain from open_email if domain is still empty
    if not company.domain and body.open_email:
        company.domain = _extract_domain(body.open_email)

    # Update name_normalized if name changed
    if body.name is not None:
        company.name_normalized = normalize_company_name(body.name)

    # 主营产品：传了才改，避免其它入口（收藏、状态切换等）误清空
    if body.product_ids is not None:
        await set_company_products(db, company_id, body.product_ids)

    await db.flush()
    await db.refresh(company)

    # Auto-deduce emails when domain becomes newly available
    new_domain = company.domain
    domain_newly_available = (not old_domain) and new_domain

    if domain_newly_available:
        # Find employees without a valid email in a single query using NOT EXISTS
        valid_email_subq = (
            select(Email.id)
            .where(
                Email.employee_id == Employee.id,
                Email.verification_status.in_(("valid", "likely_valid")),
            )
            .correlate(Employee)
            .exists()
        )
        result = await db.execute(
            select(Employee).where(
                Employee.company_id == company_id,
                ~valid_email_subq,
            )
        )
        employees = result.scalars().all()

        for emp in employees:
            try:
                await deduce_emails(
                    db, emp.full_name, new_domain, employee_id=emp.id,
                )
                # Verify deduced emails
                email_result = await db.execute(
                    select(Email).where(
                        Email.employee_id == emp.id,
                        Email.source == "deduced",
                    )
                )
                deduced_emails = email_result.scalars().all()
                if deduced_emails:
                    await verify_emails_batch(
                        db, email_ids=[e.id for e in deduced_emails],
                    )
                await db.commit()
                logger.info(
                    f"Auto-deduced emails for employee {emp.id} ({emp.full_name}) "
                    f"after company {company_id} domain set to {new_domain}"
                )
            except Exception as e:
                logger.warning(f"Auto-deduce failed for employee {emp.id}: {e}")

    return await _attach_products(db, CompanyRead.model_validate(company), company_id)


@router.delete("/{company_id}", status_code=204)
async def delete_company(
    company_id: int,
    delete_employees: bool = Query(False, description="同时删除关联的员工"),
    db: AsyncSession = Depends(get_db),
):
    """Delete a company. Optionally delete associated employees or preserve them with former_company_name."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Handle associated employees
    if delete_employees:
        # Bulk delete all employees (their emails will cascade via DB FK)
        await db.execute(
            delete(Employee).where(Employee.company_id == company_id)
        )
    else:
        # Preserve employees: set company_id to NULL and save former company name
        await db.execute(
            update(Employee)
            .where(Employee.company_id == company_id)
            .values(former_company_name=company.name, company_id=None)
        )

    await delete_company_product_links(db, [company_id])
    await db.delete(company)


@router.post("/{company_id}/favorite", response_model=CompanyRead)
async def toggle_favorite(company_id: int, db: AsyncSession = Depends(get_db)):
    """Toggle favorite status for a company."""
    company = await db.get(Company, company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    company.is_favorite = not company.is_favorite
    await db.flush()
    await db.refresh(company)
    return await _attach_products(db, CompanyRead.model_validate(company), company_id)


@router.get("/countries/list", response_model=list[str])
async def list_countries(db: AsyncSession = Depends(get_db)):
    """Get distinct list of countries that have companies (multi-country aware)."""
    return sorted(await country_counts(db))


@router.get("/industries/list", response_model=list[str])
async def list_industries(db: AsyncSession = Depends(get_db)):
    """Get distinct list of industries."""
    result = await db.execute(
        select(Company.industry).distinct().where(Company.industry.isnot(None)).order_by(Company.industry)
    )
    return [r[0] for r in result.all()]


@router.post("/batch-delete", status_code=200)
async def batch_delete_companies(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Delete multiple companies by IDs."""
    ids = body.get("ids", [])
    delete_employees = body.get("delete_employees", False)
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")

    if delete_employees:
        # Bulk delete employees belonging to these companies (cascade will handle emails)
        await db.execute(
            delete(Employee).where(Employee.company_id.in_(ids))
        )

    await delete_company_product_links(db, ids)

    # Bulk delete companies — use single DELETE statement
    result = await db.execute(
        delete(Company).where(Company.id.in_(ids))
    )
    return {"success": True, "deleted": result.rowcount}


@router.post("/batch/favorite", status_code=200)
async def batch_favorite_companies(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch set/unset favorite for companies."""
    ids = body.get("ids", [])
    favorite = body.get("favorite", True)
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    result = await db.execute(
        update(Company).where(Company.id.in_(ids)).values(is_favorite=favorite)
    )
    return {"success": True, "updated": result.rowcount}
