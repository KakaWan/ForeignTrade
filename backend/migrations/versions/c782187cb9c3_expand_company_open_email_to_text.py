"""expand_company_open_email_to_text

Revision ID: c782187cb9c3
Revises: da8bf8e2af58
Create Date: 2026-07-13 23:36:30.997891
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c782187cb9c3'
down_revision: Union[str, None] = 'da8bf8e2af58'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('companies', schema=None) as batch_op:
        batch_op.alter_column(
            'open_email',
            existing_type=sa.String(255),
            type_=sa.Text(),
            existing_nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table('companies', schema=None) as batch_op:
        batch_op.alter_column(
            'open_email',
            existing_type=sa.Text(),
            type_=sa.String(255),
            existing_nullable=True,
        )
