"""Email address deduction service.

Generates possible email prefixes from a person's name and a domain,
using configurable pattern templates (conservative / standard / comprehensive).
"""

import re
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.email_pattern import EmailPattern
from app.models.email import Email
from app.core.cache import cache


# ── Default pattern templates ────────────────────────────────────
# These are seeded into the DB on first run and can be customized.

DEFAULT_PATTERNS = {
    "conservative": [
        {"name": "first.last", "pattern": "{first}.{last}", "sort_order": 1},
        {"name": "f.last", "pattern": "{fi}.{last}", "sort_order": 2},
        {"name": "first", "pattern": "{first}", "sort_order": 3},
        {"name": "last", "pattern": "{last}", "sort_order": 4},
        {"name": "firstlast", "pattern": "{first}{last}", "sort_order": 5},
        {"name": "flast", "pattern": "{fi}{last}", "sort_order": 6},
    ],
    "standard": [
        {"name": "first.last", "pattern": "{first}.{last}", "sort_order": 1},
        {"name": "f.last", "pattern": "{fi}.{last}", "sort_order": 2},
        {"name": "first.l", "pattern": "{first}.{li}", "sort_order": 3},
        {"name": "last.first", "pattern": "{last}.{first}", "sort_order": 4},
        {"name": "l.first", "pattern": "{li}.{first}", "sort_order": 5},
        {"name": "first", "pattern": "{first}", "sort_order": 6},
        {"name": "last", "pattern": "{last}", "sort_order": 7},
        {"name": "f3.last", "pattern": "{f3}.{last}", "sort_order": 8},
        {"name": "first.l3", "pattern": "{first}.{l3}", "sort_order": 9},
        {"name": "firstlast", "pattern": "{first}{last}", "sort_order": 10},
        {"name": "flast", "pattern": "{fi}{last}", "sort_order": 11},
        {"name": "firstl", "pattern": "{first}{li}", "sort_order": 12},
        {"name": "f3l3", "pattern": "{f3}{l3}", "sort_order": 13},
    ],
    "comprehensive": [
        {"name": "first.last", "pattern": "{first}.{last}", "sort_order": 1},
        {"name": "f.last", "pattern": "{fi}.{last}", "sort_order": 2},
        {"name": "first.l", "pattern": "{first}.{li}", "sort_order": 3},
        {"name": "last.first", "pattern": "{last}.{first}", "sort_order": 4},
        {"name": "l.first", "pattern": "{li}.{first}", "sort_order": 5},
        {"name": "last.f", "pattern": "{last}.{fi}", "sort_order": 6},
        {"name": "f3.last", "pattern": "{f3}.{last}", "sort_order": 7},
        {"name": "first.l3", "pattern": "{first}.{l3}", "sort_order": 8},
        {"name": "f_l", "pattern": "{fi}_{li}", "sort_order": 9},
        {"name": "first_last", "pattern": "{first}_{last}", "sort_order": 10},
        {"name": "f_l3", "pattern": "{fi}_{l3}", "sort_order": 11},
        {"name": "first", "pattern": "{first}", "sort_order": 12},
        {"name": "last", "pattern": "{last}", "sort_order": 13},
        {"name": "firstlast", "pattern": "{first}{last}", "sort_order": 14},
        {"name": "flast", "pattern": "{fi}{last}", "sort_order": 15},
        {"name": "firstl", "pattern": "{first}{li}", "sort_order": 16},
        {"name": "lfirst", "pattern": "{li}{first}", "sort_order": 17},
        {"name": "lastf", "pattern": "{last}{fi}", "sort_order": 18},
        {"name": "f3l3", "pattern": "{f3}{l3}", "sort_order": 19},
    ],
}


def _parse_name(full_name: str) -> tuple[str, str]:
    """Parse a full name into (first_name, last_name).

    Handles:
    - "Alex Bob" → first="Alex", last="Bob"
    - "Alex Middle Bob" → first="Alex", last="Bob" (ignore middle)
    - "Bob" → first="", last="Bob"
    """
    parts = full_name.strip().split()
    if len(parts) == 0:
        return "", ""
    if len(parts) == 1:
        return "", parts[0]
    # Ignore middle names — use first and last only
    return parts[0], parts[-1]


def _apply_pattern(pattern: str, first: str, last: str) -> Optional[str]:
    """Apply a pattern template with the given first/last name.

    Pattern placeholders:
    - {first}  → full first name (lowercase)
    - {last}   → full last name (lowercase)
    - {fi}     → first initial (first char of first name, lowercase)
    - {li}     → last initial (first char of last name, lowercase)
    - {fN}     → first N chars of first name (e.g. {f3} = first 3 letters; short name → full name)
    - {lN}     → first N chars of last name  (e.g. {l3} = first 3 letters; short name → full name)
    """
    if not first and not last:
        return None

    fi = first[0].lower() if first else ""
    li = last[0].lower() if last else ""

    result = pattern.lower()
    result = result.replace("{first}", first.lower())
    result = result.replace("{last}", last.lower())
    result = result.replace("{fi}", fi)
    result = result.replace("{li}", li)

    # Handle {fN} and {lN} placeholders (e.g. {f3}, {l4})
    def _replace_fn(match: re.Match) -> str:
        n = int(match.group(1))
        if len(first) >= n:
            return first[:n].lower()
        return first.lower()  # short name → full name

    def _replace_ln(match: re.Match) -> str:
        n = int(match.group(1))
        if len(last) >= n:
            return last[:n].lower()
        return last.lower()

    result = re.sub(r"\{f(\d)\}", _replace_fn, result)
    result = re.sub(r"\{l(\d)\}", _replace_ln, result)

    # Remove empty/invalid patterns (e.g., if first is empty and pattern uses it)
    # Check the ORIGINAL pattern (before substitution) for required placeholders
    if re.search(r"\{first\}", pattern) and not first:
        return None
    if re.search(r"\{fi\}|\{f\d\}", pattern) and not fi:
        return None

    return result


async def deduce_emails(
    db: AsyncSession,
    full_name: str,
    domain: str,
    template_group: Optional[str] = None,
    custom_patterns: Optional[list[str]] = None,
    employee_id: Optional[int] = None,
) -> list[dict]:
    """Deduce possible email addresses for a person.

    Returns a list of dicts: [{"email": "...", "pattern_type": "..."}]
    Also persists them to the DB if employee_id is provided.
    """
    cache_key = f"deduce:{full_name}:{domain}:{template_group}"
    cached = cache.get(cache_key)
    if cached and not employee_id:
        return cached

    first, last = _parse_name(full_name)
    domain = domain.lower().strip()
    # Remove protocol if present
    domain = re.sub(r"^https?://", "", domain)
    # Remove www. prefix
    domain = re.sub(r"^www\.", "", domain)
    # Remove path after domain
    domain = domain.split("/")[0]

    # Load enabled patterns from DB
    group = template_group or "standard"
    result = await db.execute(
        select(EmailPattern)
        .where(EmailPattern.is_enabled == True)
        .where(EmailPattern.template_group == group)
        .order_by(EmailPattern.sort_order)
    )
    patterns = result.scalars().all()

    # If no patterns in DB, use defaults
    if not patterns:
        defaults = DEFAULT_PATTERNS.get(group, DEFAULT_PATTERNS["standard"])
        pattern_list = [(d["pattern"], d["name"]) for d in defaults]
    else:
        pattern_list = [(p.pattern, p.name) for p in patterns]

    # Add custom patterns if provided
    if custom_patterns:
        for i, cp in enumerate(custom_patterns):
            pattern_list.append((cp, f"custom_{i}"))

    # Generate emails
    seen = set()
    results = []
    for pattern_str, pattern_name in pattern_list:
        prefix = _apply_pattern(pattern_str, first, last)
        if prefix and prefix not in seen:
            seen.add(prefix)
            email_addr = f"{prefix}@{domain}"
            results.append({
                "email": email_addr,
                "pattern_type": pattern_name,
                "domain": domain,
            })

    # Persist to DB if employee_id is provided
    if employee_id:
        # Load existing emails for this employee to skip duplicates
        existing_result = await db.execute(
            select(Email.email).where(Email.employee_id == employee_id)
        )
        existing_emails = {row[0].lower() for row in existing_result.all()}

        for r in results:
            # Skip if this email already exists for the employee
            if r["email"].lower() in existing_emails:
                continue
            # Also skip if email exists globally (belongs to another employee)
            global_check = await db.execute(
                select(Email).where(Email.email == r["email"])
            )
            if global_check.scalar_one_or_none():
                continue
            email_obj = Email(
                employee_id=employee_id,
                email=r["email"],
                pattern_type=r["pattern_type"],
                verification_status="unknown",
                source="deduced",
            )
            db.add(email_obj)
            existing_emails.add(r["email"].lower())
        await db.flush()

    # Cache results (without employee_id — just the deduced list)
    cache.set(cache_key, results, ttl=600)

    return results


async def seed_default_patterns(db: AsyncSession) -> None:
    """Seed the default email patterns into the database.

    - Inserts patterns that don't already exist (by name + template_group).
    - Updates sort_order and is_enabled for existing patterns to keep them
      in sync with DEFAULT_PATTERNS.
    """
    for group, patterns in DEFAULT_PATTERNS.items():
        for p in patterns:
            # Check if this pattern already exists
            existing = await db.execute(
                select(EmailPattern).where(
                    EmailPattern.name == p["name"],
                    EmailPattern.template_group == group,
                )
            )
            existing_pattern = existing.scalar_one_or_none()
            if not existing_pattern:
                db.add(EmailPattern(
                    name=p["name"],
                    pattern=p["pattern"],
                    template_group=group,
                    is_enabled=True,
                    sort_order=p["sort_order"],
                ))
            else:
                # Update sort_order to match current defaults
                existing_pattern.sort_order = p["sort_order"]
                existing_pattern.is_enabled = True
    await db.flush()
