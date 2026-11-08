"""add_sender_profiles_table

Revision ID: c4b660043569
Revises: 21f5050fd4ab
Create Date: 2026-07-06 09:03:46.660206
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4b660043569'
down_revision: Union[str, None] = '21f5050fd4ab'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'sender_profiles',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(200), nullable=False),
        sa.Column('company_name', sa.String(255), nullable=True),
        sa.Column('products', sa.Text(), nullable=True),
        sa.Column('website', sa.String(500), nullable=True),
        sa.Column('country', sa.String(100), nullable=True),
        sa.Column('industry', sa.String(200), nullable=True),
        sa.Column('introduction', sa.Text(), nullable=True),
        sa.Column('contact_person', sa.String(200), nullable=True),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('address', sa.String(500), nullable=True),
        sa.Column('is_default', sa.Boolean(), default=False),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table('sender_profiles')
