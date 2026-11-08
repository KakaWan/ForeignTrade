"""Tests for deduplication service."""

import pytest
from app.services.dedup_service import check_company_duplicate, check_employee_duplicate, _extract_domain
from app.models.company import Company
from app.models.employee import Employee


class TestExtractDomain:
    def test_simple_url(self):
        assert _extract_domain("example.com") == "example.com"

    def test_with_protocol(self):
        assert _extract_domain("https://example.com") == "example.com"

    def test_with_www(self):
        assert _extract_domain("www.example.com") == "example.com"

    def test_full_url(self):
        assert _extract_domain("https://www.example.com/about") == "example.com"

    def test_email(self):
        assert _extract_domain("info@example.com") == "example.com"

    def test_empty(self):
        assert _extract_domain("") is None


class TestCompanyDedup:
    @pytest.mark.asyncio
    async def test_no_duplicates(self, db_session):
        # Add a company
        company = Company(name="Unique Corp", website="unique.com", domain="unique.com", country="USA")
        db_session.add(company)
        await db_session.flush()

        # Check for a different company
        matches = await check_company_duplicate(db_session, "Different Corp", "different.com", "USA")
        assert len(matches) == 0

    @pytest.mark.asyncio
    async def test_domain_duplicate(self, db_session):
        company = Company(name="Test Corp", website="test.com", domain="test.com", country="USA")
        db_session.add(company)
        await db_session.flush()

        matches = await check_company_duplicate(db_session, "Another Corp", "test.com", "USA")
        assert len(matches) > 0
        assert matches[0]["match_type"] == "domain"

    @pytest.mark.asyncio
    async def test_name_duplicate(self, db_session):
        company = Company(name="Test Corporation", country="USA")
        db_session.add(company)
        await db_session.flush()

        matches = await check_company_duplicate(db_session, "Test Corporation", None, "USA")
        assert len(matches) > 0
        assert matches[0]["match_type"] == "name"


class TestEmployeeDedup:
    @pytest.mark.asyncio
    async def test_exact_name_duplicate(self, db_session):
        company = Company(name="Test Corp")
        db_session.add(company)
        await db_session.flush()

        emp = Employee(company_id=company.id, full_name="John Smith", first_name="John", last_name="Smith")
        db_session.add(emp)
        await db_session.flush()

        matches = await check_employee_duplicate(db_session, company.id, "John Smith")
        assert len(matches) > 0
        assert matches[0]["match_type"] == "exact_name"

    @pytest.mark.asyncio
    async def test_no_duplicate(self, db_session):
        company = Company(name="Test Corp")
        db_session.add(company)
        await db_session.flush()

        matches = await check_employee_duplicate(db_session, company.id, "Jane Doe")
        assert len(matches) == 0
