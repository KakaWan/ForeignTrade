"""Tests for email deduction service."""

import pytest
from app.services.email_deduction import deduce_emails, _parse_name, _apply_pattern


class TestParseName:
    def test_two_parts(self):
        first, last = _parse_name("Alex Bob")
        assert first == "Alex"
        assert last == "Bob"

    def test_three_parts_ignore_middle(self):
        first, last = _parse_name("Jean Pierre Dupont")
        assert first == "Jean"
        assert last == "Dupont"

    def test_single_name(self):
        first, last = _parse_name("Madonna")
        assert first == ""
        assert last == "Madonna"

    def test_empty(self):
        first, last = _parse_name("")
        assert first == ""
        assert last == ""

    def test_whitespace(self):
        first, last = _parse_name("  Alex   Bob  ")
        assert first == "Alex"
        assert last == "Bob"


class TestApplyPattern:
    def test_first_last(self):
        result = _apply_pattern("{first}.{last}", "Alex", "Bob")
        assert result == "alex.bob"

    def test_f_last(self):
        result = _apply_pattern("{fi}.{last}", "Alex", "Bob")
        assert result == "a.bob"

    def test_flast(self):
        result = _apply_pattern("{fi}{last}", "Alex", "Bob")
        assert result == "abob"

    def test_first_l(self):
        result = _apply_pattern("{first}.{li}", "Alex", "Bob")
        assert result == "alex.b"

    def test_last_first(self):
        result = _apply_pattern("{last}.{first}", "Alex", "Bob")
        assert result == "bob.alex"

    def test_l_first(self):
        result = _apply_pattern("{li}.{first}", "Alex", "Bob")
        assert result == "b.alex"

    def test_empty_first(self):
        """If first name is empty and pattern uses {first}, return None."""
        result = _apply_pattern("{first}.{last}", "", "Bob")
        assert result is None

    def test_first_underscore_last(self):
        result = _apply_pattern("{first}_{last}", "Alex", "Bob")
        assert result == "alex_bob"


class TestDeduceEmails:
    @pytest.mark.asyncio
    async def test_deduce_standard(self, db_session):
        results = await deduce_emails(
            db_session, "Alex Bob", "example.com", template_group="standard"
        )
        assert len(results) >= 8
        # Check that common patterns are present
        emails = [r["email"] for r in results]
        assert "alex.bob@example.com" in emails
        assert "alexbob@example.com" in emails
        assert "alex@example.com" in emails
        assert "a.bob@example.com" in emails
        assert "abob@example.com" in emails

    @pytest.mark.asyncio
    async def test_deduce_conservative(self, db_session):
        results = await deduce_emails(
            db_session, "Alex Bob", "example.com", template_group="conservative"
        )
        assert len(results) >= 3
        assert len(results) <= 6

    @pytest.mark.asyncio
    async def test_deduce_comprehensive(self, db_session):
        results = await deduce_emails(
            db_session, "Alex Bob", "example.com", template_group="comprehensive"
        )
        assert len(results) >= 10

    @pytest.mark.asyncio
    async def test_deduce_no_duplicates(self, db_session):
        results = await deduce_emails(
            db_session, "Alex Bob", "example.com"
        )
        emails = [r["email"] for r in results]
        assert len(emails) == len(set(emails))

    @pytest.mark.asyncio
    async def test_deduce_domain_extraction(self, db_session):
        results = await deduce_emails(
            db_session, "John Smith", "company.co.uk"
        )
        assert all(r["email"].endswith("@company.co.uk") for r in results)

    @pytest.mark.asyncio
    async def test_deduce_with_protocol_in_domain(self, db_session):
        results = await deduce_emails(
            db_session, "John Smith", "https://www.company.com/about"
        )
        assert all(r["email"].endswith("@company.com") for r in results)
