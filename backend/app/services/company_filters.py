"""Country helpers for companies.

A company can operate in several countries. The full list lives in the
`countries` column (comma+space separated, matching the multi-value convention
already used by `open_email` / `phone` / `whatsapp`), while `country` keeps the
*primary* country so every single-value code path (sorting, dashboard, dedup,
Excel export) keeps working unchanged.
"""

import re
from typing import Iterable, Optional

from sqlalchemy import or_

from app.models.company import Company

# Canonical separator for the `countries` column
COUNTRY_SEP = ", "

# Separators accepted when reading user input / Excel cells: comma (both widths),
# 、, semicolon, slash, pipe, newline
_SPLIT_RE = re.compile(r"[,，、;；/|\n\r]+")


def split_countries(value: Optional[str]) -> list[str]:
    """Split a country string into clean, de-duplicated, order-preserving names."""
    if not value:
        return []
    countries: list[str] = []
    for raw in _SPLIT_RE.split(str(value)):
        name = raw.strip()
        if name and name not in countries:
            countries.append(name)
    return countries


def join_countries(values: Iterable[str]) -> Optional[str]:
    """Join country names into the canonical storage format, or None when empty."""
    countries: list[str] = []
    for raw in values:
        name = (raw or "").strip()
        if name and name not in countries:
            countries.append(name)
    return COUNTRY_SEP.join(countries) if countries else None


def sync_primary_country(company, countries: Optional[str]) -> None:
    """Write the country list and keep `country` (primary) in sync with it."""
    company.countries = countries
    names = split_countries(countries)
    company.country = names[0] if names else None


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def country_match(value: str):
    """SQL condition matching companies that operate in `value`.

    Hits the primary `country` as well as any entry of the `countries` list.
    Matching is separator-aware so a filter for 中国 never pulls in 中国香港.
    """
    v = value.strip()
    escaped = _escape_like(v)
    col = Company.countries
    return or_(
        Company.country == v,
        col == v,
        col.like(f"{escaped}, %", escape="\\"),
        col.like(f"%, {escaped}", escape="\\"),
        col.like(f"%, {escaped}, %", escape="\\"),
    )


def country_matches(company, value: str) -> bool:
    """Python-side equivalent of `country_match`, for rows already loaded."""
    v = value.strip()
    return company.country == v or v in split_countries(company.countries)


def product_match(product_ids: Iterable[int]):
    """SQL condition matching companies that deal in ANY of the given business lines.

    Uses a subquery rather than a JOIN so callers can reuse one condition list for
    both the COUNT and the page query without introducing a join.
    """
    from sqlalchemy import select

    from app.models.product import CompanyProduct

    return Company.id.in_(
        select(CompanyProduct.company_id).where(
            CompanyProduct.product_id.in_(list(product_ids))
        )
    )


async def country_counts(db) -> dict[str, int]:
    """Map every country name to how many companies operate there.

    Groups on the (country, countries) pair first — the number of distinct
    combinations is far smaller than the row count — then splits each list in
    Python so multi-country companies count once per country.
    """
    from sqlalchemy import func, or_, select

    rows = await db.execute(
        select(Company.country, Company.countries, func.count())
        .where(or_(Company.country.isnot(None), Company.countries.isnot(None)))
        .group_by(Company.country, Company.countries)
    )

    counts: dict[str, int] = {}
    for primary, countries, count in rows.all():
        names = split_countries(countries) or ([primary] if primary else [])
        for name in names:
            counts[name] = counts.get(name, 0) + count
    return counts
