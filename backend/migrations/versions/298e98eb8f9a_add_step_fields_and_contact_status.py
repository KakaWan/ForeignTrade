"""add_step_fields_and_contact_status

Revision ID: 298e98eb8f9a
Revises: c4b660043569
Create Date: 2026-07-06 10:51:06.254457
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '298e98eb8f9a'
down_revision: Union[str, None] = 'c4b660043569'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add step column to dev_letters
    op.add_column('dev_letters', sa.Column('step', sa.Integer(), nullable=True, comment='步骤 1-6'))

    # Add step column to letter_templates
    op.add_column('letter_templates', sa.Column('step', sa.Integer(), nullable=True, comment='步骤 1-6，null 表示通用模板'))

    # Add contact_status and letter_step to employees
    op.add_column('employees', sa.Column('contact_status', sa.String(length=20), nullable=True, comment='联系状态: new/contacting/follow_up/rejected/partner'))
    op.add_column('employees', sa.Column('letter_step', sa.Integer(), nullable=True, comment='开发信当前步骤 0-6'))

    # Set default values for existing rows
    op.execute("UPDATE employees SET contact_status = 'new', letter_step = 0 WHERE contact_status IS NULL")

    # Create index
    op.create_index(op.f('ix_employees_contact_status'), 'employees', ['contact_status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_employees_contact_status'), table_name='employees')
    op.drop_column('employees', 'letter_step')
    op.drop_column('employees', 'contact_status')
    op.drop_column('letter_templates', 'step')
    op.drop_column('dev_letters', 'step')
