"""Excel import/export service for bulk data operations."""

import io
import logging
import re
from datetime import datetime
from typing import Optional

from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.company import Company
from app.models.employee import Employee
from app.models.email import Email
from app.models.import_record import ImportRecord
from app.models.product import Product
from app.services.company_filters import (
    country_match,
    join_countries,
    split_countries,
    sync_primary_country,
)
from app.services.dedup_service import check_company_duplicate, check_employee_duplicate
from app.services.product_catalog import load_company_products, set_company_products

logger = logging.getLogger(__name__)

# ── Template column definitions ───────────────────────────────────

COMPANY_TEMPLATE_COLUMNS = [
    "公司名称*", "网站", "国家（多个用逗号分隔）", "地区", "行业", "开放邮箱",
    "电话", "地址", "员工数量", "年收入", "成立年份", "LinkedIn", "备注",
    "主营产品/业务（中英文名，多个用逗号分隔）",
]

EMPLOYEE_TEMPLATE_COLUMNS = [
    "公司名称*", "姓名*", "名(First)", "姓(Last)", "职位", "部门",
    "资历级别", "电话", "LinkedIn", "备注", "生日",
]

EMAIL_TEMPLATE_COLUMNS = [
    "邮箱地址*", "员工姓名*", "公司名称*", "推导模式", "验证状态", "是否主要邮箱",
]

# 「主营产品/业务」列追加在末尾，索引跟着列表走，避免硬编码错位
COMPANY_PRODUCTS_COL = len(COMPANY_TEMPLATE_COLUMNS) - 1


async def _product_lookup(db: AsyncSession) -> dict[str, int]:
    """Map lowercased Chinese/English catalog names to ids, for spreadsheet cells."""
    rows = await db.execute(select(Product.id, Product.name, Product.name_en))
    lookup: dict[str, int] = {}
    for product_id, name, name_en in rows.all():
        if name:
            lookup[name.strip().lower()] = product_id
        if name_en:
            lookup.setdefault(name_en.strip().lower(), product_id)
    return lookup


def _parse_product_cell(cell: str, lookup: dict[str, int]) -> list[int]:
    """Resolve a 主营产品/业务 cell to catalog ids, ignoring names not in the catalog."""
    if not cell or not cell.strip():
        return []

    # 先整体匹配：产品名本身可能含分隔符（英文名如 "Membrane / Marquee Fabric"），
    # 整格就是一个已知产品名时不该拆开
    whole = lookup.get(cell.strip().lower())
    names = [cell.strip()] if whole else split_countries(cell)

    ids: list[int] = []
    for name in names:
        product_id = lookup.get(name.lower())
        if product_id and product_id not in ids:
            ids.append(product_id)
    return ids


def _export_products_for(products: list) -> str:
    """Render a company's business lines as the spreadsheet cell value (名字清单)."""
    return join_countries([p.name for p in products]) or ""


def generate_import_template(template_type: str = "company") -> bytes:
    """Generate an Excel import template file.

    Args:
        template_type: "company", "employee", "email", or "all"

    Returns:
        bytes: The Excel file content.
    """
    wb = Workbook()

    if template_type in ("company", "all"):
        ws = wb.active if template_type == "company" else wb.create_sheet("企业")
        if template_type == "company":
            ws.title = "企业"
        for col, header in enumerate(COMPANY_TEMPLATE_COLUMNS, 1):
            ws.cell(row=1, column=col, value=header)

    if template_type in ("employee", "all"):
        ws = wb.active if template_type == "employee" else wb.create_sheet("员工")
        if template_type == "employee":
            ws.title = "员工"
        for col, header in enumerate(EMPLOYEE_TEMPLATE_COLUMNS, 1):
            ws.cell(row=1, column=col, value=header)

    if template_type in ("email", "all"):
        ws = wb.active if template_type == "email" else wb.create_sheet("邮箱")
        if template_type == "email":
            ws.title = "邮箱"
        for col, header in enumerate(EMAIL_TEMPLATE_COLUMNS, 1):
            ws.cell(row=1, column=col, value=header)

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


async def import_companies_from_excel(
    db: AsyncSession,
    file_content: bytes,
    skip_duplicates: bool = True,
    merge_duplicates: bool = False,
) -> dict:
    """Import companies from an Excel file.

    Returns: {"total": int, "success": int, "skipped": int, "errors": list}
    """
    wb = load_workbook(io.BytesIO(file_content), read_only=True)
    ws = wb.active

    result = {"total": 0, "success": 0, "skipped": 0, "errors": []}

    product_lookup = await _product_lookup(db)

    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if not row or not row[0]:
            continue
        result["total"] += 1

        try:
            name = str(row[0]).strip()
            website = str(row[1]).strip() if len(row) > 1 and row[1] else None
            # 国家可以一格填多个（逗号/顿号/斜杠分隔），第一个作主国家
            countries = join_countries(split_countries(
                str(row[2]) if len(row) > 2 and row[2] else None
            ))
            region = str(row[3]).strip() if len(row) > 3 and row[3] else None
            industry = str(row[4]).strip() if len(row) > 4 and row[4] else None
            open_email = str(row[5]).strip() if len(row) > 5 and row[5] else None
            phone = str(row[6]).strip() if len(row) > 6 and row[6] else None
            address = str(row[7]).strip() if len(row) > 7 and row[7] else None
            employee_count = int(row[8]) if len(row) > 8 and row[8] else None
            revenue = str(row[9]).strip() if len(row) > 9 and row[9] else None
            founded_year = int(row[10]) if len(row) > 10 and row[10] else None
            linkedin = str(row[11]).strip() if len(row) > 11 and row[11] else None
            notes = str(row[12]).strip() if len(row) > 12 and row[12] else None
            product_cell = (
                str(row[COMPANY_PRODUCTS_COL])
                if len(row) > COMPANY_PRODUCTS_COL and row[COMPANY_PRODUCTS_COL] else None
            )

            # Extract domain from website
            domain = None
            if website:
                domain = website.lower().replace("https://", "").replace("http://", "").replace("www.", "").split("/")[0]

            # Check duplicates — 用主国家做同国家内的模糊匹配
            if skip_duplicates:
                dupes = await check_company_duplicate(
                    db, name, website, split_countries(countries)[0] if countries else None
                )
                if dupes:
                    result["skipped"] += 1
                    continue

            company = Company(
                name=name,
                website=website,
                domain=domain,
                region=region,
                industry=industry,
                open_email=open_email,
                phone=phone,
                address=address,
                employee_count=employee_count,
                revenue=revenue,
                founded_year=founded_year,
                linkedin=linkedin,
                notes=notes,
            )
            sync_primary_country(company, countries)
            db.add(company)
            await db.flush()

            product_ids = _parse_product_cell(product_cell, product_lookup)
            if product_ids:
                await set_company_products(db, company.id, product_ids)

            result["success"] += 1

        except Exception as e:
            result["errors"].append(f"Row {row_idx}: {str(e)}")

    await db.flush()

    # Record import
    import_record = ImportRecord(
        filename="import_companies",
        operation="import",
        total_rows=result["total"],
        success_rows=result["success"],
        fail_rows=result["total"] - result["success"] - result["skipped"],
        errors=result["errors"] if result["errors"] else None,
        status="completed",
    )
    db.add(import_record)
    await db.flush()

    wb.close()
    return result


async def import_employees_from_excel(
    db: AsyncSession,
    file_content: bytes,
    skip_duplicates: bool = True,
) -> dict:
    """Import employees from an Excel file."""
    wb = load_workbook(io.BytesIO(file_content), read_only=True)
    ws = wb.active

    result = {"total": 0, "success": 0, "skipped": 0, "errors": []}

    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        if not row or not row[0] or not row[1]:
            continue
        result["total"] += 1

        try:
            company_name = str(row[0]).strip()
            full_name = str(row[1]).strip()
            first_name = str(row[2]).strip() if len(row) > 2 and row[2] else None
            last_name = str(row[3]).strip() if len(row) > 3 and row[3] else None
            position = str(row[4]).strip() if len(row) > 4 and row[4] else None
            department = str(row[5]).strip() if len(row) > 5 and row[5] else None
            seniority = str(row[6]).strip() if len(row) > 6 and row[6] else None
            phone = str(row[7]).strip() if len(row) > 7 and row[7] else None
            linkedin = str(row[8]).strip() if len(row) > 8 and row[8] else None
            notes = str(row[9]).strip() if len(row) > 9 and row[9] else None
            birthday = None
            if len(row) > 10 and row[10]:
                try:
                    from datetime import date as date_type
                    bd_val = row[10]
                    if isinstance(bd_val, date_type):
                        birthday = bd_val
                    else:
                        # Try parsing string: YYYY-MM-DD or MM-DD
                        bd_str = str(bd_val).strip()
                        if len(bd_str) == 5 and '-' in bd_str:  # MM-DD
                            birthday = date_type(1900, int(bd_str[:2]), int(bd_str[3:]))
                        else:  # YYYY-MM-DD
                            parts = bd_str.split('-')
                            birthday = date_type(int(parts[0]), int(parts[1]), int(parts[2]))
                except Exception:
                    pass

            # Find company by name
            from sqlalchemy import select
            company_result = await db.execute(
                select(Company).where(Company.name == company_name).limit(1)
            )
            company = company_result.scalar_one_or_none()
            if not company:
                result["errors"].append(f"Row {row_idx}: Company '{company_name}' not found")
                continue

            # Check duplicates
            if skip_duplicates:
                dupes = await check_employee_duplicate(db, company.id, full_name)
                if dupes:
                    result["skipped"] += 1
                    continue

            employee = Employee(
                company_id=company.id,
                first_name=first_name,
                last_name=last_name,
                full_name=full_name,
                position=position,
                department=department,
                seniority=seniority,
                phone=phone,
                linkedin=linkedin,
                notes=notes,
                birthday=birthday,
            )
            db.add(employee)
            result["success"] += 1

        except Exception as e:
            result["errors"].append(f"Row {row_idx}: {str(e)}")

    await db.flush()
    wb.close()
    return result


async def export_companies_to_excel(
    db: AsyncSession,
    company_ids: Optional[list[int]] = None,
    country: Optional[str] = None,
) -> bytes:
    """Export companies (and their employees/emails) to an Excel file."""
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload

    query = select(Company).options(
        selectinload(Company.employees).selectinload(Employee.emails)
    )
    if company_ids:
        query = query.where(Company.id.in_(company_ids))
    if country:
        # 多值国家：命中任意一个国家都算
        query = query.where(country_match(country))

    result = await db.execute(query)
    companies = result.scalars().all()

    product_map = await load_company_products(db, [c.id for c in companies])

    wb = Workbook()

    # Companies sheet
    ws_comp = wb.active
    ws_comp.title = "企业"
    for col, header in enumerate(COMPANY_TEMPLATE_COLUMNS, 1):
        ws_comp.cell(row=1, column=col, value=header)

    # Employees sheet
    ws_emp = wb.create_sheet("员工")
    for col, header in enumerate(EMPLOYEE_TEMPLATE_COLUMNS, 1):
        ws_emp.cell(row=1, column=col, value=header)

    comp_row = 2
    emp_row = 2

    for company in companies:
        ws_comp.cell(row=comp_row, column=1, value=company.name)
        ws_comp.cell(row=comp_row, column=2, value=company.website)
        ws_comp.cell(row=comp_row, column=3, value=company.countries or company.country)
        ws_comp.cell(row=comp_row, column=4, value=company.region)
        ws_comp.cell(row=comp_row, column=5, value=company.industry)
        ws_comp.cell(row=comp_row, column=6, value=company.open_email)
        ws_comp.cell(row=comp_row, column=7, value=company.phone)
        ws_comp.cell(row=comp_row, column=8, value=company.address)
        ws_comp.cell(row=comp_row, column=9, value=company.employee_count)
        ws_comp.cell(row=comp_row, column=10, value=company.revenue)
        ws_comp.cell(row=comp_row, column=11, value=company.founded_year)
        ws_comp.cell(row=comp_row, column=12, value=company.linkedin)
        ws_comp.cell(row=comp_row, column=13, value=company.notes)
        ws_comp.cell(
            row=comp_row, column=COMPANY_PRODUCTS_COL + 1,
            value=_export_products_for(product_map.get(company.id, [])),
        )
        comp_row += 1

        for emp in company.employees:
            ws_emp.cell(row=emp_row, column=1, value=company.name)
            ws_emp.cell(row=emp_row, column=2, value=emp.full_name)
            ws_emp.cell(row=emp_row, column=3, value=emp.first_name)
            ws_emp.cell(row=emp_row, column=4, value=emp.last_name)
            ws_emp.cell(row=emp_row, column=5, value=emp.position)
            ws_emp.cell(row=emp_row, column=6, value=emp.department)
            ws_emp.cell(row=emp_row, column=7, value=emp.seniority)
            ws_emp.cell(row=emp_row, column=8, value=emp.phone)
            ws_emp.cell(row=emp_row, column=9, value=emp.linkedin)
            ws_emp.cell(row=emp_row, column=10, value=emp.notes)
            ws_emp.cell(row=emp_row, column=11, value=emp.birthday.isoformat() if emp.birthday else None)
            emp_row += 1

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


# ── User Template Format (模板-外贸企业) ────────────────────────────
# Col 1:  序号
# Col 2:  公司名称
# Col 3:  公共及关键人邮箱 (complex: emails + positions + names, \n separated)
# Col 4:  官网链接
# Col 5:  列1 (formula: company - <email> concatenation)
# Col 6:  电话&WhatsApp
# Col 7:  领英链接
# Col 8:  备注
# Col 9:  国家 (多个用逗号分隔)
# Col 10: 行业
# Col 11: 地址
# Col 12: 推导邮箱 (是/否, default 是)
# Col 13: 主营产品/业务 (中英文名，多个用逗号分隔)

USER_TEMPLATE_COLUMNS = [
    "序号", "公司名称", "公共及关键人邮箱", "官网链接",
    "列1", "电话&WhatsApp", "领英链接", "备注",
    "国家（多个用逗号分隔）", "行业", "地址", "推导邮箱",
    "主营产品/业务（中英文名，多个用逗号分隔）",
]

# 「主营产品/业务」列追加在末尾，索引跟着列表走
USER_PRODUCTS_COL = len(USER_TEMPLATE_COLUMNS) - 1


# Common generic email prefixes that indicate a company mailbox, not a person
_GENERIC_EMAIL_PREFIXES = frozenset({
    # English
    "info", "sales", "hello", "office", "support", "contact", "admin",
    "enquiries", "inquiries", "accounts", "service", "help", "orders", "order",
    "booking", "reserve", "reservation", "pr", "marketing", "comms",
    "communication", "press", "media", "hr", "careers", "jobs", "legal",
    "finance", "accounting", "billing", "payments", "logistics", "warehouse",
    "reception", "frontdesk", "postmaster", "webmaster", "hostmaster",
    "abuse", "spam", "root", "administrator", "noreply", "no-reply",
    "donotreply", "do-not-reply", "mail", "email", "general", "enquiry",
    "inquiry", "customercare", "customerservice", "customersupport",
    "tech", "technical", "it", "ops", "operations", "production",
    "print", "printing", "shop", "store", "online", "web", "website",
    "crew", "team", "staff", "everyone", "all", "group", "global",
    "smile", "hi", "reach", "connect", "talk", "chat",
    # Italian
    "commerciale", "amministrazione", "segreteria", "assistenza",
    "stampa", "vendite", "logistica", "magazzino", "contace",
    "direzionale", "produzione", "acquisti", "spedizioni",
    # Polish
    "biuro", "drukarnia", "ksiegowosc",
    # Spanish/Portuguese
    "comercial", "contacto", "presupuestos", "archivos", "administracion",
    "atencion", "ventas", "facturacion",
    # German
    "kundenservice", "kundendienst", "bestellung", "rechnung",
    # French
    "vente", "commande", "contactez",
    # Serbian
    "prodaja",
})

# Bases for compound generic prefixes (info-au, sales.admin, etc.)
# BUT compound prefixes like biuro.colibers, amministrazione.agfiorin are NOT generic
_GENERIC_COMPOUND_BASES = frozenset({
    "info", "sales", "office", "support", "contact", "admin", "service",
    "help", "orders", "marketing", "press", "media", "hr", "legal",
    "finance", "accounting", "billing", "logistics", "warehouse",
    "noreply", "no-reply", "mail", "email", "general", "enquiries",
    "customerservice", "customersupport", "customercare", "tech",
    "print", "printing", "shop", "store", "online", "web", "website",
    "team", "group", "global", "commerciale", "amministrazione",
    "comercial", "contacto", "biuro", "drukarnia", "stampa", "vendite",
    "assistenza", "logistica", "segreteria", "magazzino",
})


def _is_generic_email(email: str) -> bool:
    """Check if an email address is a generic/company mailbox (not a person)."""
    prefix = email.split("@")[0].strip()
    if not prefix:
        return False
    lower = prefix.lower()

    # Exact match on full prefix
    if lower in _GENERIC_EMAIL_PREFIXES:
        return True

    # Compound prefix: "info-au", "sales.admin" → generic
    # But "biuro.colibers", "amministrazione.agfiorin" → NOT generic (specific)
    if "." in lower or "-" in lower or "_" in lower:
        base = lower.split(".")[0].split("-")[0].split("_")[0]
        rest = lower[len(base) + 1:]
        if base in _GENERIC_COMPOUND_BASES:
            # Short suffix (1-5 chars, no uppercase) → generic pattern like info-au
            # Longer or uppercase suffix → likely personal like biuro.colibers
            if len(rest) <= 5 and not any(c.isupper() for c in prefix[len(base) + 1:]):
                return True
            else:
                return False

    # Single-word base check
    base = lower.split(".")[0].split("-")[0].split("_")[0]
    if base in _GENERIC_EMAIL_PREFIXES:
        return True

    return False


def _extract_name_from_email(email: str) -> str | None:
    """Try to extract a person's name from an email prefix.

    Examples:
      john.smith@company.com → "John Smith"
      J.Smith@company.com → "J Smith"
      Paweł@company.com → "Paweł"
      mtrybulska@company.com → "Mtrybulska"
      Alice Moore@company.com → "Alice Moore"  (name-in-email)
    """
    prefix = email.split("@")[0].strip()
    if not prefix:
        return None

    # Name-in-email: local part contains space and looks like a person name
    if " " in prefix:
        parts = prefix.split()
        if all(p[0].isupper() for p in parts if p):
            return prefix  # Already properly cased like "Alice Moore"

    # dot-separated: first.last or f.last
    if "." in prefix:
        parts = prefix.split(".")
        name_parts = []
        for p in parts:
            if p:
                # Capitalize first letter, keep rest as-is (preserve accented chars)
                name_parts.append(p[0].upper() + p[1:] if len(p) > 1 else p.upper())
        return " ".join(name_parts) if name_parts else None

    # underscore or hyphen separated
    if "_" in prefix or "-" in prefix:
        sep = "_" if "_" in prefix else "-"
        parts = prefix.split(sep)
        name_parts = []
        for p in parts:
            if p:
                name_parts.append(p[0].upper() + p[1:] if len(p) > 1 else p.upper())
        return " ".join(name_parts) if name_parts else None

    # Single word — capitalize first letter
    if prefix:
        return prefix[0].upper() + prefix[1:] if len(prefix) > 1 else prefix.upper()

    return None


def _parse_email_column(text: str) -> dict:
    """Parse the complex '公共及关键人邮箱' column.

    Each line is one of:
    - `email   职位-姓名` → employee with email + position + name
    - `email   姓名`     → employee with email + name (no position)
    - `姓名   职位-姓名` → employee without email (name is prefix + suffix)
    - `email` (generic)   → company open email (info@, sales@, etc.)
    - `email` (personal)  → employee with email, name extracted from prefix
    - `姓名` (no @)       → employee without email

    Returns: {"open_emails": [...], "people": [{"email"?, "name", "position"?}]}
    """
    if not text or not str(text).strip():
        return {"open_emails": [], "people": []}

    lines = str(text).strip().split("\n")
    open_emails = []
    people = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Try to match: prefix   职位-姓名  (e.g. "Barbara.B@x.at   CEO-Barbara B")
        match = re.match(r"^(.*?)\s{2,}(\S+)-(.+)$", line)
        # Also match standalone 职位-姓名 (e.g. "CEO-John Doe" with no prefix)
        if not match:
            match = re.match(r"^(\S+)-(.+)$", line)
            if match:
                # Reformat to fit the same logic: prefix="", position=group1, name=group2
                match = re.match(r"^(.*?)\s{2,}(\S+)-(.+)$", "  " + line)
        if match:
            prefix = match.group(1).strip()
            position = match.group(2).strip()
            name_suffix = match.group(3).strip()

            if "@" in prefix:
                # prefix is an email → employee with email
                people.append({"email": prefix, "name": name_suffix, "position": position})
            else:
                # prefix is part of the name (e.g. "Christian Marousek  生产经理-Christian Marousek")
                if prefix.lower() == name_suffix.lower():
                    full_name = name_suffix
                elif name_suffix.lower().startswith(prefix.lower().split()[0].lower() if prefix.split() else ""):
                    # suffix contains the prefix name, use suffix
                    full_name = name_suffix
                else:
                    full_name = f"{prefix} {name_suffix}"
                people.append({"email": None, "name": full_name, "position": position})
            continue

        # Try: email   姓名 (no position, no dash) — e.g. "Paweł@midea.pl   Paweł"
        # Support emails with spaces in local part like "Richard Mathys@domain.ch"
        match_name = re.match(r"^(.+?@\S+?)\s{2,}(.+)$", line)
        if not match_name:
            match_name = re.match(r"^(\S+@\S+?)\s+(.+)$", line)
        if match_name:
            email = match_name.group(1).strip()
            name = match_name.group(2).strip()
            # Only treat as email+name if the name doesn't look like a position
            if not re.match(r"^[一-鿿]+$", name) and "-" not in name:
                people.append({"email": email, "name": name, "position": None})
                continue

        # Pure email (no suffix at all)
        if "@" in line:
            email = line.strip()
            if _is_generic_email(email):
                # Generic mailbox → company open email
                open_emails.append(email)
            else:
                # Personal email → extract name from prefix, create employee
                name = _extract_name_from_email(email)
                people.append({"email": email, "name": name or email.split("@")[0], "position": None})
            continue

        # Pure name, no email no position
        people.append({"email": None, "name": line.strip(), "position": None})

    return {"open_emails": open_emails, "people": people}


def _parse_phone_column(text: str) -> dict:
    """Parse the '电话&WhatsApp' column.

    Formats:
    - `+49 123 456789` → phone only
    - `+49 123 456789 / WA: +49 987 654321` → phone + whatsapp
    - `WA: +49 987 654321` → whatsapp only

    Returns: {"phone"?, "whatsapp"?}
    """
    if not text or not str(text).strip():
        return {"phone": None, "whatsapp": None}

    text = str(text).strip()
    phone = None
    whatsapp = None

    # Split by WA: marker
    wa_match = re.search(r"WA[:\s]+(.+)$", text, re.IGNORECASE)
    if wa_match:
        whatsapp = wa_match.group(1).strip()
        before_wa = text[: wa_match.start()].strip().rstrip("/").strip()
        if before_wa:
            phone = before_wa
    else:
        phone = text

    return {"phone": phone or None, "whatsapp": whatsapp or None}


async def import_from_user_template(
    db: AsyncSession,
    file_content: bytes,
    skip_duplicates: bool = True,
) -> dict:
    """Import from the user's custom Excel template format.

    Supports two layouts:
    - One row per company (Col 3 has multi-line emails + employees)
    - One row per person (Col 3 has a single email/employee, company may repeat)

    When a company already exists, new employees/emails are added to it
    instead of skipping the entire row (merge-on-duplicate).
    """
    wb = load_workbook(io.BytesIO(file_content), read_only=True)
    ws = wb.active

    result = {
        "total": 0, "companies_success": 0, "employees_success": 0,
        "skipped": 0, "errors": [],
    }

    # Cache company lookups to avoid repeated DB queries
    _company_cache: dict[str, int | None] = {}
    _product_lookup_cache = await _product_lookup(db)

    for row_idx, row in enumerate(ws.iter_rows(min_row=2, values_only=True), 2):
        # Col 2 (index 1) = company name — skip empty rows
        if not row or len(row) < 2 or not row[1]:
            continue
        result["total"] += 1

        try:
            company_name = str(row[1]).strip()
            if not company_name:
                continue

            email_col = str(row[2]).strip() if len(row) > 2 and row[2] else ""
            website = str(row[3]).strip() if len(row) > 3 and row[3] else None
            phone_col = str(row[5]).strip() if len(row) > 5 and row[5] else ""
            linkedin = str(row[6]).strip() if len(row) > 6 and row[6] else None
            notes = str(row[7]).strip() if len(row) > 7 and row[7] else None
            # 国家可以一格填多个（逗号/顿号/斜杠分隔）
            country_names = split_countries(
                str(row[8]) if len(row) > 8 and row[8] else None
            )
            industry = str(row[9]).strip() if len(row) > 9 and row[9] else None
            address = str(row[10]).strip() if len(row) > 10 and row[10] else None
            deduce_col = str(row[11]).strip() if len(row) > 11 and row[11] else "是"
            should_deduce = deduce_col.strip() not in ("否", "no", "No", "NO", "N", "n", "0")
            product_cell = (
                str(row[USER_PRODUCTS_COL])
                if len(row) > USER_PRODUCTS_COL and row[USER_PRODUCTS_COL] else None
            )
            product_ids = _parse_product_cell(product_cell, _product_lookup_cache)

            # Extract domain from website
            domain = None
            if website:
                domain = website.lower()
                domain = re.sub(r"^https?://", "", domain)
                domain = re.sub(r"^www\.", "", domain)
                domain = domain.split("/")[0]

            # Parse email column
            parsed = _parse_email_column(email_col)
            open_email = ", ".join(parsed["open_emails"]) if parsed["open_emails"] else None

            # Also try to extract domain from open_email if website not set
            if not domain and open_email:
                first_email = parsed["open_emails"][0] if parsed["open_emails"] else None
                if first_email and "@" in first_email:
                    domain = first_email.split("@")[-1].lower()

            # Parse phone column
            phone_info = _parse_phone_column(phone_col)

            # ── Find or create company (merge-on-duplicate) ──
            company_id = _company_cache.get(company_name)
            company = None

            if company_id is not None:
                # Already created in a previous row — reuse it
                company = await db.get(Company, company_id)
            else:
                # Check if company already exists in DB
                dupes = await check_company_duplicate(db, company_name, website, None)
                if dupes:
                    company_id = dupes[0]["existing_id"]
                    company = await db.get(Company, company_id)
                    _company_cache[company_name] = company_id

            if company is None:
                # Create new company
                company = Company(
                    name=company_name,
                    website=website,
                    domain=domain,
                    industry=industry,
                    open_email=open_email,
                    phone=phone_info["phone"],
                    address=address,
                    linkedin=linkedin,
                    notes=notes,
                )
                sync_primary_country(company, join_countries(country_names))
                db.add(company)
                await db.flush()

                # Normalize company name
                from app.services.dedup_service import normalize_company_name
                company.name_normalized = normalize_company_name(company_name)
                result["companies_success"] += 1
                _company_cache[company_name] = company.id
                company_id = company.id
            else:
                # Merge: update missing fields on existing company
                updated = False
                if not company.website and website:
                    company.website = website; updated = True
                if not company.domain and domain:
                    company.domain = domain; updated = True
                if country_names:
                    # 并集合并：重复导入时新增的国家不能丢
                    merged = join_countries(
                        split_countries(company.countries) + country_names
                    )
                    if merged != company.countries:
                        sync_primary_country(company, merged); updated = True
                if not company.industry and industry:
                    company.industry = industry; updated = True
                if open_email:
                    # Append new public emails (avoid duplicates)
                    existing = {e.strip().lower() for e in (company.open_email or "").split(",") if e.strip()}
                    new_emails = [e.strip() for e in open_email.split(",") if e.strip() and e.strip().lower() not in existing]
                    if new_emails:
                        combined = (company.open_email or "").rstrip(", ") + ", " + ", ".join(new_emails) if company.open_email else ", ".join(new_emails)
                        company.open_email = combined.strip(", ")
                        updated = True
                if not company.phone and phone_info.get("phone"):
                    company.phone = phone_info["phone"]; updated = True
                if not company.address and address:
                    company.address = address; updated = True
                if not company.linkedin and linkedin:
                    company.linkedin = linkedin; updated = True
                if updated:
                    await db.flush()

            # 主营产品/业务：与已有项取并集（和上面的备注/邮箱合并语义一致，
            # 重复导入同一家企业时不会把之前登记的业务冲掉）
            if product_ids:
                existing_products = await load_company_products(db, [company_id])
                existing_ids = [p.id for p in existing_products.get(company_id, [])]
                merged_ids = existing_ids + [i for i in product_ids if i not in existing_ids]
                if merged_ids != existing_ids:
                    await set_company_products(db, company_id, merged_ids)

            # Create employees from parsed people
            for person in parsed["people"]:
                emp_name = person.get("name", "").strip()
                if not emp_name:
                    continue

                # Check duplicate employee
                if skip_duplicates:
                    emp_dupes = await check_employee_duplicate(db, company_id, emp_name)
                    if emp_dupes:
                        continue

                employee = Employee(
                    company_id=company_id,
                    full_name=emp_name,
                    position=person.get("position"),
                    phone=phone_info.get("phone") if len(parsed["people"]) == 1 else None,
                    whatsapp=phone_info.get("whatsapp") if len(parsed["people"]) == 1 else None,
                    linkedin=linkedin if len(parsed["people"]) == 1 else None,
                )
                db.add(employee)
                await db.flush()
                result["employees_success"] += 1

                # If person has an email, create Email record (skip if duplicate)
                person_email = person.get("email")
                if person_email:
                    existing_email = await db.execute(
                        select(Email).where(Email.email == person_email).limit(1)
                    )
                    if not existing_email.scalar_one_or_none():
                        email_obj = Email(
                            employee_id=employee.id,
                            email=person_email,
                            pattern_type="personal",
                            verification_status="unknown",
                            source="manual",
                            is_primary=True,
                        )
                        db.add(email_obj)

            # Auto-deduce emails if deduce switch is on and company has domain
            effective_domain = company.domain if company else domain
            if should_deduce and effective_domain:
                try:
                    from app.services.email_deduction import deduce_emails
                    for person in parsed["people"]:
                        emp_name = person.get("name", "").strip()
                        if not emp_name or person.get("email"):
                            continue  # skip empty names or already has email
                        # Find the employee we just created
                        emp_result = await db.execute(
                            select(Employee).where(
                                Employee.company_id == company_id,
                                Employee.full_name == emp_name,
                            ).limit(1)
                        )
                        emp = emp_result.scalar_one_or_none()
                        if emp:
                            await deduce_emails(db, emp.full_name, effective_domain, employee_id=emp.id)
                except Exception as deduce_err:
                    logger.warning(f"Auto-deduce failed for company {company_name}: {deduce_err}")

            try:
                await db.flush()
            except Exception as flush_err:
                await db.rollback()
                result["errors"].append(f"Row {row_idx}: {str(flush_err)}")

        except Exception as e:
            await db.rollback()
            result["errors"].append(f"Row {row_idx}: {str(e)}")

    # Record import
    import_record = ImportRecord(
        filename="user_template_import",
        operation="import",
        total_rows=result["total"],
        success_rows=result["companies_success"],
        fail_rows=result["total"] - result["companies_success"] - result["skipped"],
        errors=result["errors"] if result["errors"] else None,
        status="completed",
    )
    db.add(import_record)
    await db.flush()

    wb.close()
    return result


async def export_to_user_template(
    db: AsyncSession,
    company_ids: Optional[list[int]] = None,
    country: Optional[str] = None,
) -> bytes:
    """Export data in the user's custom template format.

    Col 1: 序号, Col 2: 公司名称, Col 3: 公共及关键人邮箱,
    Col 4: 官网链接, Col 5: 列1 (concatenated), Col 6: 电话&WhatsApp,
    Col 7: 领英链接, Col 8: 备注, Col 9: 国家, Col 10: 行业,
    Col 11: 地址, Col 12: 推导邮箱, Col 13: 主营产品/业务
    """
    query = select(Company).options(
        selectinload(Company.employees).selectinload(Employee.emails)
    )
    if company_ids:
        query = query.where(Company.id.in_(company_ids))
    if country:
        # 多值国家：命中任意一个国家都算
        query = query.where(country_match(country))

    result = await db.execute(query.order_by(Company.id))
    companies = result.scalars().all()

    product_map = await load_company_products(db, [c.id for c in companies])

    wb = Workbook()
    ws = wb.active
    ws.title = "外贸企业"

    # Write header
    for col, header in enumerate(USER_TEMPLATE_COLUMNS, 1):
        ws.cell(row=1, column=col, value=header)

    data_row = 2
    for idx, company in enumerate(companies, 1):
        # Col 1: 序号
        ws.cell(row=data_row, column=1, value=idx)

        # Col 2: 公司名称
        ws.cell(row=data_row, column=2, value=company.name)

        # Col 3: 公共及关键人邮箱
        col3_lines = []
        if company.open_email:
            for em in company.open_email.split(","):
                em = em.strip()
                if em:
                    col3_lines.append(em)
        for emp in company.employees:
            valid_emails = [
                e for e in emp.emails
                if e.verification_status in ("valid", "likely_valid") or e.source == "manual"
            ]
            email_part = valid_emails[0].email if valid_emails else ""

            if emp.position:
                pos_name = f"{emp.position}-{emp.full_name}"
            else:
                pos_name = emp.full_name

            if email_part and pos_name:
                col3_lines.append(f"{email_part}   {pos_name}")
            elif email_part:
                col3_lines.append(email_part)
            elif pos_name:
                col3_lines.append(pos_name)

        ws.cell(row=data_row, column=3, value="\n".join(col3_lines))

        # Col 4: 官网链接
        ws.cell(row=data_row, column=4, value=company.website or "")

        # Col 5: 列1 — concatenated "company_name - <email>"
        col5_parts = []
        for line in col3_lines:
            email_match = re.match(r"^(\S+@\S+)", line)
            if email_match:
                col5_parts.append(f"{company.name} - <{email_match.group(1)}>")
        ws.cell(row=data_row, column=5, value=", ".join(col5_parts) if col5_parts else "")

        # Col 6: 电话&WhatsApp
        col6_value = ""
        if company.phone:
            col6_value = company.phone
        if len(company.employees) == 1 and company.employees[0].whatsapp:
            wa = company.employees[0].whatsapp
            if wa != company.phone:
                col6_value = f"{col6_value} / WA: {wa}" if col6_value else f"WA: {wa}"
        ws.cell(row=data_row, column=6, value=col6_value)

        # Col 7: 领英链接
        ws.cell(row=data_row, column=7, value=company.linkedin or "")

        # Col 8: 备注
        ws.cell(row=data_row, column=8, value=company.notes or "")

        # Col 9: 国家（多个用逗号分隔，导出完整列表）
        ws.cell(row=data_row, column=9, value=company.countries or company.country or "")

        # Col 10: 行业
        ws.cell(row=data_row, column=10, value=company.industry or "")

        # Col 11: 地址
        ws.cell(row=data_row, column=11, value=company.address or "")

        # Col 12: 推导邮箱
        ws.cell(row=data_row, column=12, value="是")

        # Col 13: 主营产品/业务
        ws.cell(
            row=data_row, column=USER_PRODUCTS_COL + 1,
            value=_export_products_for(product_map.get(company.id, [])),
        )

        data_row += 1

    # Adjust column widths
    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 25
    ws.column_dimensions['C'].width = 50
    ws.column_dimensions['D'].width = 30
    ws.column_dimensions['E'].width = 40
    ws.column_dimensions['F'].width = 25
    ws.column_dimensions['G'].width = 40
    ws.column_dimensions['H'].width = 20
    ws.column_dimensions['I'].width = 12
    ws.column_dimensions['J'].width = 18
    ws.column_dimensions['K'].width = 25
    ws.column_dimensions['L'].width = 10
    ws.column_dimensions['M'].width = 32

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def generate_user_template() -> bytes:
    """Generate an empty user template with headers only."""
    wb = Workbook()
    ws = wb.active
    ws.title = "外贸企业"

    for col, header in enumerate(USER_TEMPLATE_COLUMNS, 1):
        ws.cell(row=1, column=col, value=header)

    # Adjust column widths
    ws.column_dimensions['A'].width = 6
    ws.column_dimensions['B'].width = 25
    ws.column_dimensions['C'].width = 50
    ws.column_dimensions['D'].width = 30
    ws.column_dimensions['E'].width = 40
    ws.column_dimensions['F'].width = 25
    ws.column_dimensions['G'].width = 40
    ws.column_dimensions['H'].width = 20
    ws.column_dimensions['I'].width = 12
    ws.column_dimensions['J'].width = 18
    ws.column_dimensions['K'].width = 25
    ws.column_dimensions['L'].width = 10
    ws.column_dimensions['M'].width = 32

    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
