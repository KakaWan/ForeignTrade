"""Customer business-line catalog API endpoints.

The catalog holds what *client* companies sell or do (胶印、展会搭建、灯箱制作 …),
not our own products. The company form's 「主营产品/业务」 multi-select reads from
it, and the 管理产品 dialog does full CRUD against it.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.product import CompanyProduct, Product
from app.schemas.product import ProductCreate, ProductRead, ProductUpdate
from app.services.product_catalog import default_product_rows

router = APIRouter(prefix="/products", tags=["products"])


async def _ensure_name_available(
    db: AsyncSession, name: str, exclude_id: Optional[int] = None
) -> None:
    """Reject duplicate names — the selector shows names without context."""
    query = select(Product).where(Product.name == name)
    if exclude_id is not None:
        query = query.where(Product.id != exclude_id)
    if (await db.execute(query)).scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"「{name}」已存在")


async def _company_counts(db: AsyncSession) -> dict[int, int]:
    """How many companies list each product — batch-loaded, no N+1."""
    rows = await db.execute(
        select(CompanyProduct.product_id, func.count())
        .group_by(CompanyProduct.product_id)
    )
    return {product_id: count for product_id, count in rows.all()}


@router.get("/", response_model=list[ProductRead])
async def list_products(
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """List products, ordered so the grouped selector can render categories in order."""
    query = select(Product)
    if category:
        query = query.where(Product.category == category)
    result = await db.execute(query.order_by(Product.sort_order, Product.id))

    counts = await _company_counts(db)
    items = []
    for product in result.scalars().all():
        data = ProductRead.model_validate(product)
        data.company_count = counts.get(product.id, 0)
        items.append(data)
    return items


@router.post("/", response_model=ProductRead, status_code=201)
async def create_product(body: ProductCreate, db: AsyncSession = Depends(get_db)):
    """Add a product to the catalog."""
    await _ensure_name_available(db, body.name)

    product = Product(**body.model_dump())
    db.add(product)
    await db.flush()
    await db.refresh(product)
    return ProductRead.model_validate(product)


@router.put("/{product_id}", response_model=ProductRead)
async def update_product(
    product_id: int,
    body: ProductUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update a catalog entry (renames are refused when they'd collide)."""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    update_data = body.model_dump(exclude_unset=True)
    if "name" in update_data and update_data["name"] != product.name:
        await _ensure_name_available(db, update_data["name"], exclude_id=product_id)

    for field, value in update_data.items():
        setattr(product, field, value)

    await db.flush()
    await db.refresh(product)
    return ProductRead.model_validate(product)


@router.delete("/{product_id}", status_code=204)
async def delete_product(product_id: int, db: AsyncSession = Depends(get_db)):
    """Delete a catalog entry and unlink it from every company."""
    product = await db.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    # SQLite runs without the foreign_keys pragma, so cascade explicitly
    await db.execute(
        delete(CompanyProduct).where(CompanyProduct.product_id == product_id)
    )
    await db.delete(product)


@router.post("/reset", response_model=list[ProductRead])
async def reset_products(db: AsyncSession = Depends(get_db)):
    """Restore the built-in catalog, discarding all custom entries and links.

    Mirrors `/email-patterns/reset/{group}`: wipe, then re-seed from defaults.
    """
    await db.execute(delete(CompanyProduct))
    await db.execute(delete(Product))
    await db.flush()

    for row in default_product_rows():
        db.add(Product(**row))
    await db.flush()

    result = await db.execute(select(Product).order_by(Product.sort_order, Product.id))
    return [ProductRead.model_validate(p) for p in result.scalars().all()]
