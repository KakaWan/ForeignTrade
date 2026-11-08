"""Product/business catalog: default entries, startup seeding, and company links.

**These are the CUSTOMER's business lines, not our own product range** — the menu
records what a client company deals in (旗帜 / 灯箱 / 展会 / PVC 材料 …) so a
development letter can pitch the materials that fit that business. Our own
product range lives in the 我方企业 (SenderProfile) settings instead.

The items are the application categories we sell materials into, which is also
how these clients describe themselves. They are seeded on first startup so the
company form has a usable list out of the box.

Users are free to rename, add or delete entries — startup seeding only runs when
the table is empty, so deletions stick. The "恢复默认列表" endpoint re-applies
this list explicitly.
"""

# 分类 → 客户经营范围（中英文对照）
DEFAULT_PRODUCTS: list[tuple[str, str, str]] = [
    # ── 广告制品 ──
    ("广告制品", "旗帜", "Flags"),
    ("广告制品", "大面幅广告", "Large Format Advertising"),
    ("广告制品", "户外广告", "Outdoor Advertising"),
    ("广告制品", "灯箱", "Lightboxes"),
    ("广告制品", "标识标牌", "Signage"),
    ("广告制品", "横幅喷绘", "Banners & Printing"),
    ("广告制品", "车身广告", "Vehicle Wrapping"),
    # ── 展览活动 ──
    ("展览活动", "展会", "Exhibitions"),
    ("展览活动", "展位搭建", "Exhibition Stand Builders"),
    ("展览活动", "地毯", "Carpet"),
    ("展览活动", "易拉宝展架", "Rollup & Banner Stands"),
    ("展览活动", "活动布置", "Event Setup"),
    ("展览活动", "商业美陈", "Visual Merchandising"),
    # ── 户外装备 ──
    ("户外装备", "帐篷", "Tents"),
    ("户外装备", "篷房", "Marquees"),
    ("户外装备", "遮阳篷", "Awnings"),
    ("户外装备", "遮阳伞", "Parasols"),
    # ── 广告材料 ──
    ("广告材料", "PVC 材料", "PVC Materials"),
    ("广告材料", "遮光布", "Blockout Fabric"),
    ("广告材料", "环保材料", "Eco-friendly Materials"),
    ("广告材料", "纺织面料", "Textile Fabrics"),
    ("广告材料", "灯箱材料", "Backlit Materials"),
    ("广告材料", "广告材料经销", "Material Distribution"),
    # ── 印刷与喷绘 ──
    ("印刷与喷绘", "大幅面喷绘", "Large Format Printing"),
    ("印刷与喷绘", "数码印刷", "Digital Printing"),
    ("印刷与喷绘", "胶印", "Offset Printing"),
    ("印刷与喷绘", "丝网印刷", "Screen Printing"),
    ("印刷与喷绘", "图文快印", "Copy Shop & Print Service"),
    # ── 服务与其他 ──
    ("服务与其他", "广告代理", "Advertising Agency"),
    ("服务与其他", "设计服务", "Design Studio"),
    ("服务与其他", "经销商", "Distributor"),
    ("服务与其他", "制造商", "Manufacturer"),
    ("服务与其他", "电子商务", "E-commerce"),
]


def default_product_rows() -> list[dict]:
    """Build insertable rows for the default catalog, with a global sort_order."""
    return [
        {
            "category": category,
            "name": name,
            "name_en": name_en,
            "sort_order": idx,
        }
        for idx, (category, name, name_en) in enumerate(DEFAULT_PRODUCTS)
    ]


async def seed_default_products(db) -> int:
    """Populate the catalog when it is empty. Returns the number of rows added.

    Only seeds an empty table so user deletions/renames are not undone on restart.
    """
    from sqlalchemy import func, select

    from app.models.product import Product

    count = (await db.execute(select(func.count(Product.id)))).scalar() or 0
    if count:
        return 0

    for row in default_product_rows():
        db.add(Product(**row))
    await db.flush()
    return len(DEFAULT_PRODUCTS)


# ── Company ↔ product links ──────────────────────────────────────────

async def load_company_products(db, company_ids: list[int]) -> dict[int, list]:
    """Map company_id → its products, in one query, ordered for display."""
    from sqlalchemy import select

    from app.models.product import CompanyProduct, Product

    if not company_ids:
        return {}

    rows = await db.execute(
        select(CompanyProduct.company_id, Product)
        .join(Product, Product.id == CompanyProduct.product_id)
        .where(CompanyProduct.company_id.in_(company_ids))
        .order_by(Product.sort_order, Product.id)
    )
    result: dict[int, list] = {}
    for company_id, product in rows.all():
        result.setdefault(company_id, []).append(product)
    return result


async def set_company_products(db, company_id: int, product_ids: list[int]) -> None:
    """Replace a company's product links with `product_ids` (unknown ids dropped)."""
    from sqlalchemy import delete, select

    from app.models.product import CompanyProduct, Product

    await db.execute(
        delete(CompanyProduct).where(CompanyProduct.company_id == company_id)
    )

    wanted = list(dict.fromkeys(product_ids or []))
    if not wanted:
        return

    valid_ids = (await db.execute(
        select(Product.id).where(Product.id.in_(wanted))
    )).scalars().all()
    for product_id in valid_ids:
        db.add(CompanyProduct(company_id=company_id, product_id=product_id))
    await db.flush()


def format_products_for_letter(products: list) -> str:
    """Render products for the {CompanyProducts} wildcard, e.g.
    「旗帜布 (Standard Flag), 水晶灯箱布 (Crystal Backlit)」.

    Both languages are included because the letter is written in English but the
    Chinese name is what the user recognises when reviewing the draft.
    """
    return ", ".join(
        f"{p.name} ({p.name_en})" if p.name_en else p.name for p in products
    )


async def delete_company_product_links(db, company_ids: list[int]) -> None:
    """Drop product links for companies that are going away.

    SQLite runs without `PRAGMA foreign_keys=ON` here, so the FK's ON DELETE
    CASCADE cannot be relied on — the association rows must go explicitly.
    """
    from sqlalchemy import delete

    from app.models.product import CompanyProduct

    if company_ids:
        await db.execute(
            delete(CompanyProduct).where(CompanyProduct.company_id.in_(company_ids))
        )
