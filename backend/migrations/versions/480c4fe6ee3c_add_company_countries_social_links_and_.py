"""add_company_countries_social_links_and_products

Revision ID: 480c4fe6ee3c
Revises: 352dd7f70e7b
Create Date: 2026-10-16 03:30:48.520418

企业信息改造：
- companies 增加 countries（多国家，逗号+空格分隔）与 social_links（其他主页 JSON）
- 新增 products（主营产品字典）与 company_products（企业↔产品关联）
- 既有 686 条数据的 country 回填进 countries（已核实存量为纯单值，不含分隔符）

默认产品字典由启动时的 seed_default_products() 写入，不放在迁移里。
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '480c4fe6ee3c'
down_revision: Union[str, None] = '352dd7f70e7b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── companies：多国家 + 其他主页链接 ──
    # 两个都是可空新增列，SQLite 直接 ADD COLUMN 即可，无需 batch_alter_table
    op.add_column('companies', sa.Column('countries', sa.Text(), nullable=True))
    op.add_column('companies', sa.Column('social_links', sa.JSON(), nullable=True))

    # 回填：现存 country 全部是单值，直接作为国家列表的第一项
    op.execute("UPDATE companies SET countries = country WHERE country IS NOT NULL")

    # ── 主营产品字典 ──
    op.create_table(
        'products',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='中文名'),
        sa.Column('name_en', sa.String(150), nullable=True, comment='英文名'),
        sa.Column('category', sa.String(50), nullable=False, comment='分组'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('sort_order', sa.Integer(), default=0, comment='排序'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_products_name', 'products', ['name'])
    op.create_index('ix_products_category', 'products', ['category'])

    # ── 企业 ↔ 产品 关联 ──
    op.create_table(
        'company_products',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            'company_id', sa.Integer(),
            sa.ForeignKey('companies.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column(
            'product_id', sa.Integer(),
            sa.ForeignKey('products.id', ondelete='CASCADE'), nullable=False,
        ),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.UniqueConstraint('company_id', 'product_id', name='uq_company_product'),
    )
    op.create_index('ix_company_products_company_id', 'company_products', ['company_id'])
    op.create_index('ix_company_products_product_id', 'company_products', ['product_id'])
    op.create_index(
        'ix_company_product_lookup', 'company_products', ['company_id', 'product_id']
    )


def downgrade() -> None:
    op.drop_index('ix_company_product_lookup', table_name='company_products')
    op.drop_index('ix_company_products_product_id', table_name='company_products')
    op.drop_index('ix_company_products_company_id', table_name='company_products')
    op.drop_table('company_products')

    op.drop_index('ix_products_category', table_name='products')
    op.drop_index('ix_products_name', table_name='products')
    op.drop_table('products')

    op.drop_column('companies', 'social_links')
    op.drop_column('companies', 'countries')
