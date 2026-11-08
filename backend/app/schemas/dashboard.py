"""Pydantic schemas for the dashboard aggregation endpoints.

All day buckets are computed in the *caller's* local day (see `tz_offset_minutes`
in app/api/dashboard.py), not UTC — see the module docstring there for why.
"""

from typing import Optional

from pydantic import BaseModel


class DayCounts(BaseModel):
    """Per-day activity counters."""
    date: str  # YYYY-MM-DD, local day
    companies: int = 0
    employees: int = 0
    emails: int = 0
    letters: int = 0
    follow_ups: int = 0
    imports: int = 0

    @property
    def total(self) -> int:
        return self.companies + self.employees + self.emails + self.letters + self.follow_ups + self.imports


class NamedCount(BaseModel):
    """A generic {name, count} bucket used by the distribution charts."""
    name: str
    count: int


class KpiSummary(BaseModel):
    companies: int = 0
    employees: int = 0
    emails: int = 0
    emails_valid: int = 0
    emails_deduced: int = 0
    emails_manual: int = 0
    follow_ups_pending: int = 0
    letters_sent: int = 0
    letters_draft: int = 0
    favorites: int = 0
    today: DayCounts


class DashboardSummary(BaseModel):
    kpi: KpiSummary
    trend: list[DayCounts]
    countries: list[NamedCount]
    products: list[NamedCount]
    # 下面几项现在很可能只有一个非零取值（数据还没流转起来）。前端据此决定
    # 是画图还是显示一行汇总——「只有一根柱子的柱状图」是明确的反模式。
    contact_status: list[NamedCount]
    letter_steps: list[NamedCount]
    email_status: list[NamedCount]


class CalendarDay(BaseModel):
    date: str  # YYYY-MM-DD, local day
    companies: int = 0
    employees: int = 0
    emails: int = 0
    letters: int = 0
    follow_ups: int = 0
    imports: int = 0


class CalendarMonth(BaseModel):
    year: int
    month: int
    days: list[CalendarDay]
    month_totals: DayCounts
    busiest: list[CalendarDay]


class ActivityItem(BaseModel):
    """One operation that happened on a given day."""
    type: str  # company / employee / email / letter / follow_up / import
    at: str  # ISO datetime (UTC, as stored)
    title: str
    subtitle: Optional[str] = None
    # 前端据此跳转到对应实体；没有对应页面的（如导入）为 None
    entity_id: Optional[int] = None


class DayActivity(BaseModel):
    date: str
    # 当天的**真实**总数（不是 items 的条数）
    counts: DayCounts
    items: list[ActivityItem]
    # items 每种类型最多 DAY_DETAIL_LIMIT 条；true 表示有类型被截断
    # （2026-07-14 那天一次导入建了 616 家企业，全塞进响应不合适）
    truncated: bool = False
