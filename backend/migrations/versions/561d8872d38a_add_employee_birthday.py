"""add_employee_birthday

Revision ID: 561d8872d38a
Revises: c782187cb9c3
Create Date: 2026-07-16 03:41:07.592705
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '561d8872d38a'
down_revision: Union[str, None] = 'c782187cb9c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('employees', sa.Column('birthday', sa.Date(), nullable=True, comment='生日(月-日)'))


def downgrade() -> None:
    op.drop_column('employees', 'birthday')
