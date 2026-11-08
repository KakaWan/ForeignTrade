"""employee_company_nullable_and_former_company_name

Revision ID: 834abefdc124
Revises: 003
Create Date: 2026-07-06 05:20:58.566362
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '834abefdc124'
down_revision: Union[str, None] = '003'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add former_company_name column to employees
    op.add_column('employees', sa.Column(
        'former_company_name', sa.String(255),
        nullable=True,
        comment='企业删除后保留的原企业名称',
    ))

    # 2. Make company_id nullable.
    #    SQLite batch_alter_table will recreate the table.
    #    We reflect the current table, alter the column, and the new FK
    #    will be created from the model's ondelete='SET NULL' automatically
    #    because the batch migration reads the reflected schema + our changes.
    with op.batch_alter_table('employees') as batch_op:
        batch_op.alter_column(
            'company_id',
            existing_type=sa.Integer(),
            nullable=True,
        )


def downgrade() -> None:
    # Reverse: make company_id NOT NULL again, drop former_company_name
    # WARNING: downgrade will fail if any employees have company_id=NULL
    with op.batch_alter_table('employees') as batch_op:
        batch_op.alter_column(
            'company_id',
            existing_type=sa.Integer(),
            nullable=False,
        )

    op.drop_column('employees', 'former_company_name')
