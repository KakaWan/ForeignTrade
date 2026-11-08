"""Dashboard aggregation endpoints: KPI summary, activity calendar, day detail.

**Time zones.** Every timestamp column is a naive `datetime.utcnow()`, and the
frontend renders those strings as-is, so a day bucket computed in UTC would sit
an offset away from the user's real local day (on this machine, 7 hours — enough
to move an evening entry into "tomorrow"). Callers therefore pass
`tz_offset_minutes` (= `-new Date().getTimezoneOffset()`), and every day bucket
here is computed in *their* local day.

Implementation notes:
- The WHERE clause filters on the raw `created_at` (index-friendly), and the
  SELECT groups by `date(created_at, '+HH:MM')` so the bucket matches the range.
- A single fixed offset is used for the whole range, so an entry within an hour
  of a DST transition can land one day off. Accepted: the alternative is shipping
  a full tz database for a single-user local tool.
"""

from datetime import date as date_type, datetime, time, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.company import Company
from app.models.dev_letter import DevLetter
from app.models.email import Email
from app.models.employee import Employee
from app.models.follow_up import FollowUp
from app.models.import_record import ImportRecord
from app.models.product import CompanyProduct, Product
from app.schemas.dashboard import (
    ActivityItem, CalendarDay, CalendarMonth, DashboardSummary, DayActivity,
    DayCounts, KpiSummary, NamedCount,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# 一次操作明细里每种类型最多返回多少条：2026-07-14 那天一次导入就建了 616 家企业，
# 不设上限会把整天的明细全塞进响应
DAY_DETAIL_LIMIT = 100


def _tz_modifier(offset_minutes: int) -> str:
    """SQLite date() modifier for the caller's UTC offset, e.g. '-07:00'."""
    sign = "+" if offset_minutes >= 0 else "-"
    minutes = abs(int(offset_minutes))
    return f"{sign}{minutes // 60:02d}:{minutes % 60:02d}"


def _local_today(offset_minutes: int) -> date_type:
    return (datetime.utcnow() + timedelta(minutes=offset_minutes)).date()


def _utc_bounds(start: date_type, end: date_type, offset_minutes: int) -> tuple[datetime, datetime]:
    """[start, end] local dates -> naive UTC datetime bounds (end exclusive)."""
    utc_start = datetime.combine(start, time.min) - timedelta(minutes=offset_minutes)
    utc_end = datetime.combine(end + timedelta(days=1), time.min) - timedelta(minutes=offset_minutes)
    return utc_start, utc_end


async def _daily_counts(
    db: AsyncSession, column, start: date_type, end: date_type, modifier: str,
    offset_minutes: int,
) -> dict[str, int]:
    """Map 'YYYY-MM-DD' (caller's local day) -> row count, for one timestamp column.

    WHERE filters the raw column (index-friendly); the GROUP BY applies the tz
    modifier so the bucket matches the range.
    """
    utc_start, utc_end = _utc_bounds(start, end, offset_minutes)
    rows = await db.execute(
        select(func.date(column, modifier), func.count())
        .where(column >= utc_start, column < utc_end)
        .group_by(func.date(column, modifier))
    )
    return {str(day): count for day, count in rows.all()}


async def _count(db: AsyncSession, model, *conditions) -> int:
    query = select(func.count()).select_from(model)
    if conditions:
        query = query.where(*conditions)
    return (await db.execute(query)).scalar() or 0


def _to_named(rows) -> list[NamedCount]:
    # 注意不能写 `name or "未填写"`：letter_step 的 0 会被当假值吞掉
    return [NamedCount(name=str(name) if name is not None else "未填写", count=count)
            for name, count in rows]


async def _named_counts(db: AsyncSession, name_col, where=None, limit: int = 8) -> list[NamedCount]:
    """Top-N {name, count} buckets on a single column — used by the distribution charts."""
    query = select(name_col, func.count().label("c"))
    if where is not None:
        query = query.where(where)
    query = query.group_by(name_col).order_by(func.count().desc()).limit(limit)
    return _to_named((await db.execute(query)).all())


async def _product_counts(db: AsyncSession, limit: int = 8) -> list[NamedCount]:
    """Top-N 主营产品/业务（跨关联表，单独写而不是硬塞进 _named_counts）。"""
    rows = await db.execute(
        select(Product.name, func.count(CompanyProduct.company_id).label("c"))
        .select_from(CompanyProduct)
        .join(Product, Product.id == CompanyProduct.product_id)
        .group_by(Product.name)
        .order_by(func.count(CompanyProduct.company_id).desc())
        .limit(limit)
    )
    return _to_named(rows.all())


# ── Summary ───────────────────────────────────────────────────────────

@router.get("/summary", response_model=DashboardSummary)
async def dashboard_summary(
    tz_offset_minutes: int = Query(0, description="客户端 UTC 偏移分钟数 = -getTimezoneOffset()"),
    trend_days: int = Query(30, ge=7, le=90),
    db: AsyncSession = Depends(get_db),
):
    """一次返回仪表盘需要的全部 KPI、趋势与分布，避免前端并发拼多个列表接口。"""
    modifier = _tz_modifier(tz_offset_minutes)
    today = _local_today(tz_offset_minutes)
    trend_start = today - timedelta(days=trend_days - 1)

    companies, employees = await _count(db, Company), await _count(db, Employee)
    emails = await _count(db, Email)
    emails_valid = await _count(db, Email, Email.verification_status == "valid")
    emails_deduced = await _count(db, Email, Email.source == "deduced")
    follow_ups_pending = await _count(db, FollowUp, FollowUp.status == "pending")
    letters_sent = await _count(db, DevLetter, DevLetter.is_sent.is_(True))
    letters_draft = await _count(db, DevLetter, DevLetter.is_sent.is_(False))
    favorites = (
        await _count(db, Company, Company.is_favorite.is_(True))
        + await _count(db, Employee, Employee.is_favorite.is_(True))
    )

    # 逐日趋势：三张表各一次 GROUP BY
    series = {
        "companies": await _daily_counts(db, Company.created_at, trend_start, today, modifier, tz_offset_minutes),
        "employees": await _daily_counts(db, Employee.created_at, trend_start, today, modifier, tz_offset_minutes),
        "emails": await _daily_counts(db, Email.created_at, trend_start, today, modifier, tz_offset_minutes),
    }
    trend: list[DayCounts] = []
    for i in range(trend_days):
        day = (trend_start + timedelta(days=i)).isoformat()
        trend.append(DayCounts(
            date=day,
            companies=series["companies"].get(day, 0),
            employees=series["employees"].get(day, 0),
            emails=series["emails"].get(day, 0),
        ))

    today_counts = trend[-1] if trend and trend[-1].date == today.isoformat() else DayCounts(date=today.isoformat())

    return DashboardSummary(
        kpi=KpiSummary(
            companies=companies, employees=employees, emails=emails,
            emails_valid=emails_valid, emails_deduced=emails_deduced,
            emails_manual=emails - emails_deduced,
            follow_ups_pending=follow_ups_pending,
            letters_sent=letters_sent, letters_draft=letters_draft,
            favorites=favorites, today=today_counts,
        ),
        trend=trend,
        countries=await _named_counts(db, Company.country, where=Company.country.isnot(None)),
        products=await _product_counts(db),
        contact_status=await _named_counts(db, Employee.contact_status),
        letter_steps=await _named_counts(db, Employee.letter_step),
        email_status=await _named_counts(db, Email.verification_status),
    )


# ── Calendar ──────────────────────────────────────────────────────────

@router.get("/calendar", response_model=CalendarMonth)
async def dashboard_calendar(
    year: int = Query(..., ge=1970, le=2999),
    month: int = Query(..., ge=1, le=12),
    tz_offset_minutes: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    """某个月逐日活跃度（用于月历热力与点击下钻）。"""
    modifier = _tz_modifier(tz_offset_minutes)
    start = date_type(year, month, 1)
    end = (date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)) - timedelta(days=1)

    sources = [
        ("companies", Company, Company.created_at),
        ("employees", Employee, Employee.created_at),
        ("emails", Email, Email.created_at),
        ("letters", DevLetter, DevLetter.created_at),
        ("follow_ups", FollowUp, FollowUp.created_at),
        ("imports", ImportRecord, ImportRecord.created_at),
    ]
    per_source = {
        key: await _daily_counts(db, column, start, end, modifier, tz_offset_minutes)
        for key, _model, column in sources
    }

    days: list[CalendarDay] = []
    cursor = start
    while cursor <= end:
        key = cursor.isoformat()
        days.append(CalendarDay(
            date=key,
            companies=per_source["companies"].get(key, 0),
            employees=per_source["employees"].get(key, 0),
            emails=per_source["emails"].get(key, 0),
            letters=per_source["letters"].get(key, 0),
            follow_ups=per_source["follow_ups"].get(key, 0),
            imports=per_source["imports"].get(key, 0),
        ))
        cursor += timedelta(days=1)

    def _sum(field: str) -> int:
        return sum(getattr(d, field) for d in days)

    totals = DayCounts(
        date=f"{year:04d}-{month:02d}",
        companies=_sum("companies"), employees=_sum("employees"), emails=_sum("emails"),
        letters=_sum("letters"), follow_ups=_sum("follow_ups"), imports=_sum("imports"),
    )
    busiest = sorted(days, key=lambda d: (d.companies + d.employees + d.emails), reverse=True)[:5]
    return CalendarMonth(
        year=year, month=month, days=days, month_totals=totals,
        busiest=[d for d in busiest if d.companies + d.employees + d.emails > 0],
    )


# ── Day detail ────────────────────────────────────────────────────────

def _parse_day(value: str) -> date_type:
    try:
        return date_type.fromisoformat(value)
    except ValueError:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="date 需要是 YYYY-MM-DD")


@router.get("/day", response_model=DayActivity)
async def dashboard_day(
    date: str = Query(..., description="本地日 YYYY-MM-DD"),
    tz_offset_minutes: int = Query(0),
    db: AsyncSession = Depends(get_db),
):
    """某一天发生过哪些操作 —— 日历点击下钻用的明细。"""
    day = _parse_day(date)
    utc_start, utc_end = _utc_bounds(day, day, tz_offset_minutes)

    def _in_range(column):
        return (column >= utc_start, column < utc_end)

    companies = (await db.execute(
        select(Company.id, Company.name, Company.country, Company.industry, Company.created_at)
        .where(*_in_range(Company.created_at)).order_by(Company.created_at).limit(DAY_DETAIL_LIMIT)
    )).all()
    employees = (await db.execute(
        select(Employee.id, Employee.full_name, Employee.position, Employee.company_id, Employee.created_at)
        .where(*_in_range(Employee.created_at)).order_by(Employee.created_at).limit(DAY_DETAIL_LIMIT)
    )).all()
    emails = (await db.execute(
        select(Email.id, Email.email, Email.source, Email.employee_id, Email.created_at)
        .where(*_in_range(Email.created_at)).order_by(Email.created_at).limit(DAY_DETAIL_LIMIT)
    )).all()
    letters = (await db.execute(
        select(DevLetter.id, DevLetter.step, DevLetter.is_sent, DevLetter.employee_id, DevLetter.company_id, DevLetter.created_at)
        .where(*_in_range(DevLetter.created_at)).order_by(DevLetter.created_at).limit(DAY_DETAIL_LIMIT)
    )).all()
    follow_ups = (await db.execute(
        select(FollowUp.id, FollowUp.title, FollowUp.reminder_date, FollowUp.employee_id, FollowUp.company_id, FollowUp.created_at)
        .where(*_in_range(FollowUp.created_at)).order_by(FollowUp.created_at).limit(DAY_DETAIL_LIMIT)
    )).all()
    imports = (await db.execute(
        select(ImportRecord.id, ImportRecord.filename, ImportRecord.total_rows, ImportRecord.success_rows, ImportRecord.created_at)
        .where(*_in_range(ImportRecord.created_at)).order_by(ImportRecord.created_at).limit(DAY_DETAIL_LIMIT)
    )).all()

    # 批量取名字，避免逐条查库
    company_ids = {r.company_id for r in employees if r.company_id} | {r.company_id for r in letters if r.company_id} | {r.company_id for r in follow_ups if r.company_id}
    company_names: dict[int, str] = {}
    if company_ids:
        company_names = dict((await db.execute(
            select(Company.id, Company.name).where(Company.id.in_(company_ids))
        )).all())

    employee_ids = {r.employee_id for r in emails if r.employee_id} | {r.employee_id for r in letters if r.employee_id} | {r.employee_id for r in follow_ups if r.employee_id}
    employee_names: dict[int, str] = {}
    if employee_ids:
        employee_names = dict((await db.execute(
            select(Employee.id, Employee.full_name).where(Employee.id.in_(employee_ids))
        )).all())

    items: list[ActivityItem] = []
    for r in companies:
        items.append(ActivityItem(
            type="company", at=r.created_at.isoformat(), title=r.name,
            subtitle=" / ".join(x for x in (r.country, r.industry) if x) or None,
            entity_id=r.id,
        ))
    for r in employees:
        items.append(ActivityItem(
            type="employee", at=r.created_at.isoformat(), title=r.full_name,
            subtitle=" · ".join(x for x in (r.position, company_names.get(r.company_id)) if x) or None,
            entity_id=r.id,
        ))
    for r in emails:
        items.append(ActivityItem(
            type="email", at=r.created_at.isoformat(), title=r.email,
            subtitle=f"{'推导' if r.source == 'deduced' else '手工/导入'} · {employee_names.get(r.employee_id) or ''}".strip(" ·"),
            entity_id=r.employee_id,
        ))
    for r in letters:
        who = employee_names.get(r.employee_id) or company_names.get(r.company_id) or ""
        items.append(ActivityItem(
            type="letter", at=r.created_at.isoformat(),
            title=f"第 {r.step} 封开发信" if r.step else "通用开发信",
            subtitle=f"{'已发送' if r.is_sent else '草稿'} · {who}".strip(" ·"),
            entity_id=r.employee_id or r.company_id,
        ))
    for r in follow_ups:
        who = employee_names.get(r.employee_id) or company_names.get(r.company_id) or ""
        items.append(ActivityItem(
            type="follow_up", at=r.created_at.isoformat(),
            title=r.title or "新建跟进提醒",
            subtitle=f"计划 {r.reminder_date.isoformat()} · {who}".strip(" ·"),
            entity_id=r.employee_id or r.company_id,
        ))
    for r in imports:
        items.append(ActivityItem(
            type="import", at=r.created_at.isoformat(), title=f"导入 {r.filename}",
            subtitle=f"共 {r.total_rows} 行，成功 {r.success_rows} 行", entity_id=r.id,
        ))

    items.sort(key=lambda i: i.at, reverse=True)

    # 当天的真实总数单独 COUNT：上面的查询带了 LIMIT，用 len() 会把 616 家企业
    # 的那天报成 100
    utc_start, utc_end = _utc_bounds(day, day, tz_offset_minutes)
    true_counts = {}
    for key, model in (
        ("companies", Company), ("employees", Employee), ("emails", Email),
        ("letters", DevLetter), ("follow_ups", FollowUp), ("imports", ImportRecord),
    ):
        true_counts[key] = await _count(
            db, model, model.created_at >= utc_start, model.created_at < utc_end
        )
    truncated = len(items) < sum(true_counts.values())

    return DayActivity(
        date=day.isoformat(),
        counts=DayCounts(date=day.isoformat(), **true_counts),
        items=items,
        truncated=truncated,
    )
