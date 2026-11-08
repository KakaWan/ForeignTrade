"""add_whatsapp_to_company

Revision ID: da8bf8e2af58
Revises: 298e98eb8f9a
Create Date: 2026-07-12 00:23:13.410009
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'da8bf8e2af58'
down_revision: Union[str, None] = '298e98eb8f9a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('companies', sa.Column('whatsapp', sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column('companies', 'whatsapp')
