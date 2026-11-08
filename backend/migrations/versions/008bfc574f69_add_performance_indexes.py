"""add performance indexes

Revision ID: 008bfc574f69
Revises: 561d8872d38a
Create Date: 2026-07-22 07:07:07.004629
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '008bfc574f69'
down_revision: Union[str, None] = '561d8872d38a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # New indexes for query performance
    op.create_index(op.f('ix_companies_region'), 'companies', ['region'], unique=False)
    op.create_index(op.f('ix_employees_department'), 'employees', ['department'], unique=False)
    op.create_index(op.f('ix_employees_seniority'), 'employees', ['seniority'], unique=False)
    op.create_index(op.f('ix_emails_pattern_type'), 'emails', ['pattern_type'], unique=False)
    op.create_index(op.f('ix_emails_source'), 'emails', ['source'], unique=False)
    # Composite indexes for entity_tags and entity_categories lookup
    op.create_index('ix_entity_tag_lookup', 'entity_tags', ['entity_type', 'entity_id', 'tag_id'], unique=False)
    op.create_index('ix_entity_category_lookup', 'entity_categories', ['entity_type', 'entity_id', 'category_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_entity_category_lookup', table_name='entity_categories')
    op.drop_index('ix_entity_tag_lookup', table_name='entity_tags')
    op.drop_index(op.f('ix_emails_source'), table_name='emails')
    op.drop_index(op.f('ix_emails_pattern_type'), table_name='emails')
    op.drop_index(op.f('ix_employees_seniority'), table_name='employees')
    op.drop_index(op.f('ix_employees_department'), table_name='employees')
    op.drop_index(op.f('ix_companies_region'), table_name='companies')
