"""Add name_normalized to companies

Revision ID: 002
Revises: 001
Create Date: 2026-07-02
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("companies", sa.Column("name_normalized", sa.String(255), nullable=True))
    op.create_index("ix_companies_name_normalized", "companies", ["name_normalized"])


def downgrade() -> None:
    op.drop_index("ix_companies_name_normalized", "companies")
    op.drop_column("companies", "name_normalized")
