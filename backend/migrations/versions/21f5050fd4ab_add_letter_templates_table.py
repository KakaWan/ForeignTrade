"""add_letter_templates_table

Revision ID: 21f5050fd4ab
Revises: 834abefdc124
Create Date: 2026-07-06 08:33:33.754012
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '21f5050fd4ab'
down_revision: Union[str, None] = '834abefdc124'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'letter_templates',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(200), nullable=False, comment='模板名称'),
        sa.Column('content', sa.Text(), nullable=False, comment='模板正文'),
        sa.Column('is_default', sa.Boolean(), default=False, comment='是否默认模板'),
        sa.Column('sort_order', sa.Integer(), default=0, comment='排序'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('letter_templates')
