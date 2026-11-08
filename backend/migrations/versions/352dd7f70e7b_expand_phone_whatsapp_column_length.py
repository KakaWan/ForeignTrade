"""expand phone whatsapp column length

Revision ID: 352dd7f70e7b
Revises: 008bfc574f69
Create Date: 2026-07-23 05:21:07.333187
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '352dd7f70e7b'
down_revision: Union[str, None] = '008bfc574f69'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('companies') as batch_op:
        batch_op.alter_column('phone',
                   existing_type=sa.VARCHAR(length=50),
                   type_=sa.String(length=500),
                   existing_nullable=True)
        batch_op.alter_column('whatsapp',
                   existing_type=sa.VARCHAR(length=50),
                   type_=sa.String(length=500),
                   existing_nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('companies') as batch_op:
        batch_op.alter_column('whatsapp',
                   existing_type=sa.String(length=500),
                   type_=sa.VARCHAR(length=50),
                   existing_nullable=True)
        batch_op.alter_column('phone',
                   existing_type=sa.String(length=500),
                   type_=sa.VARCHAR(length=50),
                   existing_nullable=True)
