"""Data import/export API endpoints."""

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from urllib.parse import quote

import io

from app.core.database import get_db
from app.services.import_export import (
    generate_import_template,
    import_companies_from_excel,
    import_employees_from_excel,
    export_companies_to_excel,
    generate_user_template,
    import_from_user_template,
    export_to_user_template,
)

router = APIRouter(prefix="/data", tags=["data"])


@router.get("/template")
async def download_template(template_type: str = Query("all", pattern="^(company|employee|email|all)$")):
    """Download an Excel import template."""
    content = generate_import_template(template_type)
    filename = quote(f"import_template_{template_type}.xlsx")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("/template/user")
async def download_user_template():
    """Download the user's custom import template (外贸企业格式)."""
    content = generate_user_template()
    filename = quote("模板-外贸企业.xlsx")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.post("/import/companies")
async def import_companies(
    file: UploadFile = File(...),
    skip_duplicates: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """Import companies from an Excel file."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx and .xls files are supported")

    content = await file.read()
    result = await import_companies_from_excel(db, content, skip_duplicates=skip_duplicates)
    return result


@router.post("/import/employees")
async def import_employees(
    file: UploadFile = File(...),
    skip_duplicates: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """Import employees from an Excel file."""
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx and .xls files are supported")

    content = await file.read()
    result = await import_employees_from_excel(db, content, skip_duplicates=skip_duplicates)
    return result


@router.post("/import/template")
async def import_user_template(
    file: UploadFile = File(...),
    skip_duplicates: bool = Query(True),
    db: AsyncSession = Depends(get_db),
):
    """Import from the user's custom template format.

    Each row is one company; Col 3 contains public emails + employee info.
    """
    if not file.filename.endswith((".xlsx", ".xls")):
        raise HTTPException(status_code=400, detail="Only .xlsx and .xls files are supported")

    content = await file.read()
    result = await import_from_user_template(db, content, skip_duplicates=skip_duplicates)
    await db.commit()
    return result


@router.get("/export/companies")
async def export_companies(
    country: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Export companies (with employees) to an Excel file."""
    content = await export_companies_to_excel(db, country=country)
    filename = quote("companies_export.xlsx")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("/export/template")
async def export_user_template(
    country: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Export data in the user's custom template format."""
    content = await export_to_user_template(db, country=country)
    filename = quote("外贸企业导出.xlsx")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{filename}"},
    )


@router.get("/dedup/check-company")
async def check_company_dedup(
    name: str = Query(...),
    website: str = Query(None),
    country: str = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """Check if a company already exists (for frontend pre-check)."""
    from app.services.dedup_service import check_company_duplicate
    matches = await check_company_duplicate(db, name, website, country)
    return {"matches": matches}
