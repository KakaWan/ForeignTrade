"""Initial schema

Revision ID: 001
Revises: None
Create Date: 2026-07-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Companies
    op.create_table(
        "companies",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("website", sa.String(500), nullable=True),
        sa.Column("domain", sa.String(255), nullable=True),
        sa.Column("country", sa.String(100), nullable=True),
        sa.Column("region", sa.String(100), nullable=True),
        sa.Column("industry", sa.String(200), nullable=True),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("open_email", sa.String(255), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("address", sa.String(500), nullable=True),
        sa.Column("employee_count", sa.Integer, nullable=True),
        sa.Column("revenue", sa.String(100), nullable=True),
        sa.Column("founded_year", sa.Integer, nullable=True),
        sa.Column("linkedin", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("extra_data", sa.JSON, nullable=True),
        sa.Column("is_favorite", sa.Boolean, server_default="0", nullable=True),
        sa.Column("is_blacklisted", sa.Boolean, server_default="0", nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_companies_name", "companies", ["name"])
    op.create_index("ix_companies_website", "companies", ["website"])
    op.create_index("ix_companies_domain", "companies", ["domain"])
    op.create_index("ix_companies_country", "companies", ["country"])
    op.create_index("ix_companies_industry", "companies", ["industry"])
    op.create_index("ix_companies_is_favorite", "companies", ["is_favorite"])
    op.create_index("ix_companies_is_blacklisted", "companies", ["is_blacklisted"])
    op.create_index("ix_companies_status", "companies", ["status"])

    # Employees
    op.create_table(
        "employees",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("company_id", sa.Integer, nullable=False),
        sa.Column("first_name", sa.String(100), nullable=True),
        sa.Column("last_name", sa.String(100), nullable=True),
        sa.Column("full_name", sa.String(255), nullable=False),
        sa.Column("position", sa.String(200), nullable=True),
        sa.Column("department", sa.String(200), nullable=True),
        sa.Column("seniority", sa.String(50), nullable=True),
        sa.Column("phone", sa.String(50), nullable=True),
        sa.Column("linkedin", sa.String(500), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_favorite", sa.Boolean, server_default="0", nullable=True),
        sa.Column("is_blacklisted", sa.Boolean, server_default="0", nullable=True),
        sa.Column("status", sa.String(20), server_default="active", nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_employees_company_id", "employees", ["company_id"])
    op.create_index("ix_employees_full_name", "employees", ["full_name"])
    op.create_index("ix_employees_position", "employees", ["position"])
    op.create_index("ix_employees_is_favorite", "employees", ["is_favorite"])
    op.create_index("ix_employees_status", "employees", ["status"])

    # Emails
    op.create_table(
        "emails",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("employee_id", sa.Integer, nullable=False),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("pattern_type", sa.String(50), nullable=True),
        sa.Column("verification_status", sa.String(20), server_default="unknown", nullable=True),
        sa.Column("verified_at", sa.DateTime, nullable=True),
        sa.Column("mx_record", sa.String(255), nullable=True),
        sa.Column("smtp_response", sa.Text, nullable=True),
        sa.Column("is_primary", sa.Boolean, server_default="0", nullable=True),
        sa.Column("source", sa.String(20), server_default="deduced", nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_emails_employee_id", "emails", ["employee_id"])
    op.create_index("ix_emails_email", "emails", ["email"], unique=True)
    op.create_index("ix_emails_is_primary", "emails", ["is_primary"])
    op.create_index("ix_emails_verification_status", "emails", ["verification_status"])

    # Development Letters
    op.create_table(
        "dev_letters",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("employee_id", sa.Integer, nullable=True),
        sa.Column("company_id", sa.Integer, nullable=True),
        sa.Column("email_id", sa.Integer, nullable=True),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("language", sa.String(10), server_default="en", nullable=True),
        sa.Column("template_name", sa.String(100), nullable=True),
        sa.Column("ai_model", sa.String(50), nullable=True),
        sa.Column("ai_prompt", sa.Text, nullable=True),
        sa.Column("is_sent", sa.Boolean, server_default="0", nullable=True),
        sa.Column("sent_at", sa.DateTime, nullable=True),
        sa.Column("send_method", sa.String(20), server_default="manual", nullable=True),
        sa.Column("progress", sa.String(20), server_default="draft", nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["email_id"], ["emails.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_dev_letters_employee_id", "dev_letters", ["employee_id"])
    op.create_index("ix_dev_letters_company_id", "dev_letters", ["company_id"])
    op.create_index("ix_dev_letters_email_id", "dev_letters", ["email_id"])
    op.create_index("ix_dev_letters_is_sent", "dev_letters", ["is_sent"])
    op.create_index("ix_dev_letters_progress", "dev_letters", ["progress"])

    # Tags
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("color", sa.String(7), nullable=True),
        sa.Column("tag_type", sa.String(20), server_default="custom", nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    # Categories
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("parent_id", sa.Integer, nullable=True),
        sa.Column("category_type", sa.String(20), server_default="custom", nullable=True),
        sa.Column("icon", sa.String(50), nullable=True),
        sa.Column("sort_order", sa.Integer, server_default="0", nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["parent_id"], ["categories.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_categories_parent_id", "categories", ["parent_id"])

    # Entity Tags
    op.create_table(
        "entity_tags",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("tag_id", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("entity_type", "entity_id", "tag_id", name="uq_entity_tag"),
    )
    op.create_index("ix_entity_tags_entity_type", "entity_tags", ["entity_type"])
    op.create_index("ix_entity_tags_entity_id", "entity_tags", ["entity_id"])
    op.create_index("ix_entity_tags_tag_id", "entity_tags", ["tag_id"])

    # Entity Categories
    op.create_table(
        "entity_categories",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("entity_type", sa.String(20), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("category_id", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["category_id"], ["categories.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("entity_type", "entity_id", "category_id", name="uq_entity_category"),
    )

    # Follow-ups
    op.create_table(
        "follow_ups",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("employee_id", sa.Integer, nullable=True),
        sa.Column("company_id", sa.Integer, nullable=True),
        sa.Column("reminder_date", sa.DateTime, nullable=False),
        sa.Column("status", sa.String(20), server_default="pending", nullable=True),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.Column("updated_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["employee_id"], ["employees.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_follow_ups_employee_id", "follow_ups", ["employee_id"])
    op.create_index("ix_follow_ups_company_id", "follow_ups", ["company_id"])
    op.create_index("ix_follow_ups_reminder_date", "follow_ups", ["reminder_date"])
    op.create_index("ix_follow_ups_status", "follow_ups", ["status"])

    # Email Patterns
    op.create_table(
        "email_patterns",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("pattern", sa.String(100), nullable=False),
        sa.Column("description", sa.String(255), nullable=True),
        sa.Column("template_group", sa.String(20), server_default="standard", nullable=True),
        sa.Column("is_enabled", sa.Boolean, server_default="1", nullable=True),
        sa.Column("sort_order", sa.Integer, server_default="0", nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_patterns_is_enabled", "email_patterns", ["is_enabled"])

    # Import Records
    op.create_table(
        "import_records",
        sa.Column("id", sa.Integer, autoincrement=True, nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("operation", sa.String(20), server_default="import", nullable=True),
        sa.Column("total_rows", sa.Integer, server_default="0", nullable=True),
        sa.Column("success_rows", sa.Integer, server_default="0", nullable=True),
        sa.Column("fail_rows", sa.Integer, server_default="0", nullable=True),
        sa.Column("errors", sa.JSON, nullable=True),
        sa.Column("status", sa.String(20), server_default="processing", nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("import_records")
    op.drop_table("email_patterns")
    op.drop_table("follow_ups")
    op.drop_table("entity_categories")
    op.drop_table("entity_tags")
    op.drop_table("categories")
    op.drop_table("tags")
    op.drop_table("dev_letters")
    op.drop_table("emails")
    op.drop_table("employees")
    op.drop_table("companies")
