"""Tags, Categories, and Follow-ups API endpoints."""

import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, update, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.tag import Tag, Category, EntityTag, EntityCategory
from app.models.follow_up import FollowUp
from app.models.employee import Employee
from app.models.company import Company
from app.schemas.common import (
    TagCreate, TagRead,
    CategoryCreate, CategoryRead,
    FollowUpCreate, FollowUpUpdate, FollowUpRead,
    EmailPatternCreate, EmailPatternUpdate, EmailPatternRead,
    AiPatternGenerateRequest, AiPatternItem,
    MessageResponse,
)
from app.models.email_pattern import EmailPattern

router = APIRouter(tags=["tags"])


# ── Tags ──────────────────────────────────────────────

@router.get("/tags", response_model=list[TagRead])
async def list_tags(
    tag_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Tag)
    if tag_type:
        query = query.where(Tag.tag_type == tag_type)
    result = await db.execute(query.order_by(Tag.name))
    return result.scalars().all()


@router.post("/tags", response_model=TagRead, status_code=201)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(Tag).where(Tag.name == body.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Tag already exists")
    tag = Tag(**body.model_dump())
    db.add(tag)
    await db.flush()
    await db.refresh(tag)
    return TagRead.model_validate(tag)


@router.delete("/tags/{tag_id}", status_code=204)
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db)):
    tag = await db.get(Tag, tag_id)
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)


@router.post("/entities/{entity_type}/{entity_id}/tags/{tag_id}", response_model=MessageResponse)
async def attach_tag(entity_type: str, entity_id: int, tag_id: int, db: AsyncSession = Depends(get_db)):
    """Attach a tag to an entity (company or employee)."""
    existing = await db.execute(
        select(EntityTag).where(
            EntityTag.entity_type == entity_type,
            EntityTag.entity_id == entity_id,
            EntityTag.tag_id == tag_id,
        )
    )
    if existing.scalar_one_or_none():
        return MessageResponse(message="Tag already attached")
    db.add(EntityTag(entity_type=entity_type, entity_id=entity_id, tag_id=tag_id))
    await db.flush()
    return MessageResponse(message="Tag attached")


@router.delete("/entities/{entity_type}/{entity_id}/tags/{tag_id}", status_code=204)
async def detach_tag(entity_type: str, entity_id: int, tag_id: int, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(EntityTag).where(
            EntityTag.entity_type == entity_type,
            EntityTag.entity_id == entity_id,
            EntityTag.tag_id == tag_id,
        )
    )
    et = existing.scalar_one_or_none()
    if et:
        await db.delete(et)


# ── Categories ────────────────────────────────────────

@router.get("/categories", response_model=list[CategoryRead])
async def list_categories(
    category_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(Category)
    if category_type:
        query = query.where(Category.category_type == category_type)
    result = await db.execute(query.order_by(Category.sort_order))
    return result.scalars().all()


@router.post("/categories", response_model=CategoryRead, status_code=201)
async def create_category(body: CategoryCreate, db: AsyncSession = Depends(get_db)):
    cat = Category(**body.model_dump())
    db.add(cat)
    await db.flush()
    await db.refresh(cat)
    return CategoryRead.model_validate(cat)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: int, db: AsyncSession = Depends(get_db)):
    cat = await db.get(Category, category_id)
    if not cat:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(cat)


# ── Follow-ups ────────────────────────────────────────

@router.get("/follow-ups", response_model=list[FollowUpRead])
async def list_follow_ups(
    status: Optional[str] = None,
    employee_id: Optional[int] = None,
    company_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(FollowUp)
    if status:
        query = query.where(FollowUp.status == status)
    if employee_id:
        query = query.where(FollowUp.employee_id == employee_id)
    if company_id:
        query = query.where(FollowUp.company_id == company_id)
    query = query.order_by(FollowUp.reminder_date)

    result = await db.execute(query)
    follow_ups = result.scalars().all()

    # Batch-load employee and company names to avoid N+1
    emp_ids = {fu.employee_id for fu in follow_ups if fu.employee_id}
    comp_ids = {fu.company_id for fu in follow_ups if fu.company_id}

    emp_name_map: dict[int, str] = {}
    if emp_ids:
        emp_rows = (await db.execute(
            select(Employee.id, Employee.full_name).where(Employee.id.in_(emp_ids))
        )).all()
        emp_name_map = {r[0]: r[1] for r in emp_rows}

    comp_name_map: dict[int, str] = {}
    if comp_ids:
        comp_rows = (await db.execute(
            select(Company.id, Company.name).where(Company.id.in_(comp_ids))
        )).all()
        comp_name_map = {r[0]: r[1] for r in comp_rows}

    items = []
    for fu in follow_ups:
        data = FollowUpRead.model_validate(fu)
        if fu.employee_id:
            data.employee_name = emp_name_map.get(fu.employee_id)
        if fu.company_id:
            data.company_name = comp_name_map.get(fu.company_id)
        items.append(data)
    return items


@router.post("/follow-ups", response_model=FollowUpRead, status_code=201)
async def create_follow_up(body: FollowUpCreate, db: AsyncSession = Depends(get_db)):
    fu = FollowUp(**body.model_dump())
    db.add(fu)
    await db.flush()
    await db.refresh(fu)
    return FollowUpRead.model_validate(fu)


@router.put("/follow-ups/{follow_up_id}", response_model=FollowUpRead)
async def update_follow_up(follow_up_id: int, body: FollowUpUpdate, db: AsyncSession = Depends(get_db)):
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(fu, field, value)
    await db.flush()
    await db.refresh(fu)
    return FollowUpRead.model_validate(fu)


@router.delete("/follow-ups/{follow_up_id}", status_code=204)
async def delete_follow_up(follow_up_id: int, db: AsyncSession = Depends(get_db)):
    fu = await db.get(FollowUp, follow_up_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    await db.delete(fu)


@router.put("/follow-ups/batch", status_code=200)
async def batch_update_follow_ups(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch update follow-up status."""
    ids = body.get("ids", [])
    status = body.get("status")
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    if not status:
        raise HTTPException(status_code=400, detail="status 不能为空")
    result = await db.execute(
        update(FollowUp).where(FollowUp.id.in_(ids)).values(status=status)
    )
    return {"success": True, "updated": result.rowcount}


@router.delete("/follow-ups/batch", status_code=200)
async def batch_delete_follow_ups(
    body: dict,
    db: AsyncSession = Depends(get_db),
):
    """Batch delete follow-ups."""
    ids = body.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="ids 不能为空")
    result = await db.execute(
        delete(FollowUp).where(FollowUp.id.in_(ids))
    )
    return {"success": True, "deleted": result.rowcount}


# ── Email Patterns ────────────────────────────────────

@router.get("/email-patterns", response_model=list[EmailPatternRead])
async def list_email_patterns(
    template_group: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    query = select(EmailPattern)
    if template_group:
        query = query.where(EmailPattern.template_group == template_group)
    result = await db.execute(query.order_by(EmailPattern.sort_order))
    return result.scalars().all()


@router.post("/email-patterns", response_model=EmailPatternRead, status_code=201)
async def create_email_pattern(
    body: EmailPatternCreate,
    db: AsyncSession = Depends(get_db),
):
    """Create a custom email deduction pattern."""
    # Validate pattern contains at least one placeholder
    import re
    if not re.search(r"\{(first|last|fi|li|f\d|l\d)\}", body.pattern):
        raise HTTPException(status_code=400, detail="Pattern must contain at least one placeholder like {first}, {last}, {fi}, {li}, {f3}, etc.")

    # Check name uniqueness within template_group
    existing = await db.execute(
        select(EmailPattern).where(
            EmailPattern.name == body.name,
            EmailPattern.template_group == body.template_group,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"Pattern '{body.name}' already exists in group '{body.template_group}'")

    pattern_obj = EmailPattern(
        name=body.name,
        pattern=body.pattern,
        description=body.description,
        template_group=body.template_group,
        is_enabled=body.is_enabled,
        sort_order=body.sort_order,
    )
    db.add(pattern_obj)
    await db.flush()
    await db.refresh(pattern_obj)
    return EmailPatternRead.model_validate(pattern_obj)


@router.put("/email-patterns/{pattern_id}", response_model=EmailPatternRead)
async def update_email_pattern(
    pattern_id: int,
    body: EmailPatternUpdate,
    db: AsyncSession = Depends(get_db),
):
    """Update an email pattern (name, pattern, description, is_enabled, sort_order)."""
    pattern = await db.get(EmailPattern, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Pattern not found")

    update_data = body.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(pattern, field, value)

    # If name or template_group changed, check uniqueness
    if "name" in update_data or "template_group" in update_data:
        existing = await db.execute(
            select(EmailPattern).where(
                EmailPattern.name == pattern.name,
                EmailPattern.template_group == pattern.template_group,
                EmailPattern.id != pattern_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail=f"Pattern '{pattern.name}' already exists in group '{pattern.template_group}'")

    await db.flush()
    await db.refresh(pattern)
    return EmailPatternRead.model_validate(pattern)


@router.delete("/email-patterns/{pattern_id}", status_code=204)
async def delete_email_pattern(
    pattern_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Delete an email pattern."""
    pattern = await db.get(EmailPattern, pattern_id)
    if not pattern:
        raise HTTPException(status_code=404, detail="Pattern not found")
    await db.delete(pattern)


@router.post("/email-patterns/reset/{template_group}")
async def reset_email_patterns(
    template_group: str,
    db: AsyncSession = Depends(get_db),
):
    """Reset a template group to its default patterns.

    Deletes all existing patterns for the group, then re-seeds from DEFAULT_PATTERNS.
    """
    from app.services.email_deduction import DEFAULT_PATTERNS

    if template_group not in DEFAULT_PATTERNS:
        raise HTTPException(status_code=400, detail=f"Unknown template group: {template_group}")

    # Delete all existing patterns for this group — single DELETE
    await db.execute(
        delete(EmailPattern).where(EmailPattern.template_group == template_group)
    )
    await db.flush()

    # Re-seed defaults for this group
    for p in DEFAULT_PATTERNS[template_group]:
        db.add(EmailPattern(
            name=p["name"],
            pattern=p["pattern"],
            template_group=template_group,
            is_enabled=True,
            sort_order=p["sort_order"],
        ))
    await db.flush()

    return {"message": f"Group '{template_group}' reset to defaults", "count": len(DEFAULT_PATTERNS[template_group])}


@router.post("/email-patterns/ai-generate", response_model=list[AiPatternItem])
async def ai_generate_patterns(
    body: AiPatternGenerateRequest,
):
    """Use AI to generate email patterns based on country/industry conventions."""
    from app.services.ai_service import call_ai
    import json

    system_prompt = (
        "你是邮箱地址命名格式专家。根据指定国家/地区的商务邮件习惯，生成常见的邮箱地址命名格式。\n\n"
        "可用占位符：\n"
        "- {first} 名字全称（小写） - {last} 姓氏全称（小写）\n"
        "- {fi} 名首字母 - {li} 姓首字母\n"
        "- {f3} 名前3字母（不足则全名） - {l3} 姓前3字母（不足则全姓）\n"
        "- {f4} 名前4字母 - {l4} 姓前4字母\n\n"
        "请生成 5-10 个该国家/地区常见的邮箱格式。只返回 JSON 数组，不要其他文字：\n"
        '[{"name": "格式名称(英文)", "pattern": "格式模板", "description": "说明"}]'
    )

    user_parts = []
    if body.country:
        user_parts.append(f"国家/地区：{body.country}")
    if body.industry:
        user_parts.append(f"行业：{body.industry}")
    if body.prompt:
        user_parts.append(f"额外提示：{body.prompt}")
    if not user_parts:
        user_parts.append("生成全球通用的常见邮箱格式")

    user_message = "\n".join(user_parts)

    try:
        response = await call_ai(system_prompt, user_message)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Parse AI response — extract JSON array
    # Try to find JSON in the response (AI might wrap it in markdown)
    json_match = re.search(r"\[.*\]", response, re.DOTALL)
    if not json_match:
        raise HTTPException(status_code=500, detail="AI 返回格式异常，无法解析")

    try:
        items = json.loads(json_match.group())
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI 返回的 JSON 格式无效")

    # Validate and clean
    results = []
    for item in items:
        if isinstance(item, dict) and "name" in item and "pattern" in item:
            results.append(AiPatternItem(
                name=item["name"],
                pattern=item["pattern"],
                description=item.get("description"),
            ))

    if not results:
        raise HTTPException(status_code=500, detail="AI 未生成有效的邮箱格式")

    return results
