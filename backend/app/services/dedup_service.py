"""Deduplication service for companies and employees.

Uses:
- Exact name_normalized match (stripped, lowercased, suffix-removed)
- Exact website/domain match
- Fuzzy name similarity (Levenshtein ratio + token_sort_ratio)
- Country/region cross-check
"""

import logging
import re
from typing import Optional

from difflib import SequenceMatcher
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.company import Company
from app.models.employee import Employee
from app.services.company_filters import country_match

logger = logging.getLogger(__name__)

# Similarity threshold for name-based dedup (0-100)
NAME_SIMILARITY_THRESHOLD = 80

# Company suffixes to strip during normalization
_COMPANY_SUFFIXES = (
    "gmbh", "gmbh & co kg", "gmbh & co. kg", "ag", "co kg", "co. kg",
    "inc", "inc.", "ltd", "ltd.", "llc", "llp", "corp", "corp.",
    "corporation", "limited", "s.a.", "sa", "s.r.l.", "srl",
    "s.p.a.", "spa", "b.v.", "bv", "n.v.", "nv", "a/s",
    "ab", "oy", "as", "a.o.", "ao", "s.a.s.", "sas",
    "k.k.", "kk", "pty ltd", "pty. ltd.", "pte ltd", "pte. ltd.",
    "se", "societe anonyme", "sarl", "eurl", "ev", "e.v.",
)


def normalize_company_name(name: str) -> Optional[str]:
    """Normalize a company name for dedup comparison.

    Steps: lowercase -> strip -> remove special chars -> remove company suffixes -> strip again.
    """
    if not name:
        return None
    n = name.lower().strip()
    # Remove special characters (keep only alphanumeric and spaces)
    n = re.sub(r"[^a-z0-9\s]", "", n)
    # Collapse multiple spaces
    n = re.sub(r"\s+", " ", n).strip()
    # Remove known company suffixes (try longer suffixes first)
    tokens = n.split()
    # Try removing suffix from the end (could be multi-word like "gmbh & co kg")
    for suffix in sorted(_COMPANY_SUFFIXES, key=len, reverse=True):
        suffix_words = suffix.split()
        if len(tokens) >= len(suffix_words):
            if tokens[-len(suffix_words):] == suffix_words:
                tokens = tokens[:-len(suffix_words)]
                break
    n = " ".join(tokens).strip()
    # Remove all remaining spaces for a compact normalized form
    n = n.replace(" ", "")
    return n if n else None


def normalize_person_name(full_name: str) -> Optional[str]:
    """Normalize a person name for dedup comparison.

    Steps: lowercase -> remove spaces, hyphens, dots.
    """
    if not full_name:
        return None
    n = full_name.lower()
    # Remove spaces, hyphens, and dots
    n = n.replace(" ", "").replace("-", "").replace(".", "")
    # Remove any other special characters
    n = re.sub(r"[^a-z0-9]", "", n)
    return n if n else None


def _token_sort_ratio(s1: str, s2: str) -> float:
    """Compute similarity after sorting tokens alphabetically.

    This handles cases like "ABC GmbH" vs "GmbH ABC" where token order differs.
    Returns a value in 0-100.
    """
    tokens1 = sorted(s1.lower().split())
    tokens2 = sorted(s2.lower().split())
    sorted1 = " ".join(tokens1)
    sorted2 = " ".join(tokens2)
    return SequenceMatcher(None, sorted1, sorted2).ratio() * 100


async def check_company_duplicate(
    db: AsyncSession,
    name: str,
    website: Optional[str] = None,
    country: Optional[str] = None,
    exclude_id: Optional[int] = None,
) -> list[dict]:
    """Check if a company already exists (duplicate detection).

    Returns list of potential matches with similarity scores.
    """
    matches = []

    # 1. Exact name_normalized match
    name_norm = normalize_company_name(name)
    if name_norm:
        query = select(Company).where(Company.name_normalized == name_norm)
        if exclude_id:
            query = query.where(Company.id != exclude_id)
        result = await db.execute(query)
        for company in result.scalars().all():
            matches.append({
                "existing_id": company.id,
                "existing_name": company.name,
                "match_type": "name_normalized",
                "similarity": 100.0,
            })

    # 2. Exact website/domain match
    if website:
        domain = _extract_domain(website)
        if domain:
            query = select(Company).where(Company.domain == domain)
            if exclude_id:
                query = query.where(Company.id != exclude_id)
            result = await db.execute(query)
            for company in result.scalars().all():
                if not any(m["existing_id"] == company.id for m in matches):
                    matches.append({
                        "existing_id": company.id,
                        "existing_name": company.name,
                        "match_type": "domain",
                        "similarity": 100.0,
                    })

    # 3. Name similarity (within same country if specified)
    # OPTIMIZATION: Only SELECT id + name columns, not full ORM objects.
    # This avoids loading all columns when we only need names for comparison.
    query = select(Company.id, Company.name)
    if country:
        # 国家是多值的，匹配任意一个都算同一国家
        query = query.where(country_match(country))
    if exclude_id:
        query = query.where(Company.id != exclude_id)

    # Limit the fuzzy comparison set to avoid loading too many rows
    result = await db.execute(query.limit(500))
    matched_ids = {m["existing_id"] for m in matches}

    for row in result.all():
        comp_id, comp_name = row[0], row[1]

        # Skip if already matched by name_normalized or domain
        if comp_id in matched_ids:
            continue

        name_lower = name.lower()
        company_name_lower = comp_name.lower()

        # Standard ratio similarity
        similarity = SequenceMatcher(None, name_lower, company_name_lower).ratio() * 100

        # Also compute token_sort_ratio as a supplement
        token_sim = _token_sort_ratio(name, comp_name)

        # Use the higher of the two
        best_similarity = max(similarity, token_sim)

        if best_similarity >= NAME_SIMILARITY_THRESHOLD:
            matches.append({
                "existing_id": comp_id,
                "existing_name": comp_name,
                "match_type": "name",
                "similarity": float(best_similarity),
            })

    # Sort by similarity descending
    matches.sort(key=lambda x: x["similarity"], reverse=True)
    return matches


async def check_employee_duplicate(
    db: AsyncSession,
    company_id: int,
    full_name: str,
    exclude_id: Optional[int] = None,
) -> list[dict]:
    """Check if an employee already exists within a company."""
    # OPTIMIZATION: Only SELECT id + full_name columns for comparison
    query = select(Employee.id, Employee.full_name).where(Employee.company_id == company_id)
    if exclude_id:
        query = query.where(Employee.id != exclude_id)

    result = await db.execute(query)
    matches = []

    name_norm = normalize_person_name(full_name)

    for row in result.all():
        emp_id, emp_full_name = row[0], row[1]
        emp_name_norm = normalize_person_name(emp_full_name)

        # Exact match on normalized name
        if name_norm and emp_name_norm and name_norm == emp_name_norm:
            matches.append({
                "existing_id": emp_id,
                "existing_name": emp_full_name,
                "match_type": "exact_name",
                "similarity": 100.0,
            })
        else:
            # Fuzzy comparison on normalized names
            if name_norm and emp_name_norm:
                similarity = SequenceMatcher(None, name_norm, emp_name_norm).ratio() * 100
            else:
                # Fallback to original names
                name1 = full_name.lower().replace(" ", "")
                name2 = emp_full_name.lower().replace(" ", "")
                similarity = SequenceMatcher(None, name1, name2).ratio() * 100

            if similarity >= 90:
                matches.append({
                    "existing_id": emp_id,
                    "existing_name": emp_full_name,
                    "match_type": "fuzzy_name",
                    "similarity": float(similarity),
                })

    return matches


def _extract_domain(url: str) -> Optional[str]:
    """Extract the base domain from a URL or email."""
    if not url:
        return None
    url = url.strip().lower()
    # Remove protocol
    url = url.replace("https://", "").replace("http://", "").replace("www.", "")
    # Remove path
    domain = url.split("/")[0]
    # For emails, extract domain part
    if "@" in domain:
        domain = domain.split("@")[-1]
    return domain if domain else None
