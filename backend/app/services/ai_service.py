"""AI service for generating development letter content.

Wildcard system — TWO phases:
  Phase 1 (data replacement): ALL {FieldName} wildcards replaced with real data.
    This includes wildcards INSIDE {AI:...} instructions.
    After this phase, ZERO {FieldName} wildcards remain anywhere.
  Phase 2 (AI generation): Only {AI:...} markers remain.
    These are extracted, the template is split into fixed text + AI slots.
    AI receives pure natural-language instructions with real data, no wildcards.
    AI fills each slot, and the result is assembled.

Available data wildcards:
  Employee: {FirstName} {LastName} {FullName} {Position} {Department}
            {Phone} {PersonalEmail} {WhatsApp} {LinkedIn}
  Company:  {CompanyName} {CompanyWebsite} {CompanyIndustry} {CompanyCountry}
            {CompanyRegion} {CompanyOpenEmail} {CompanyPhone} {CompanyDomain}
            {CompanyProducts}
  Sender:   {MyCompanyName} {MyProducts} {MyWebsite} {MyCountry} {MyIndustry}
            {MyIntroduction} {MyContactPerson} {MyPhone} {MyEmail} {MyAddress}
"""

import logging
import re
from typing import Optional

import httpx

from app.core.config import settings
from app.core.cache import cache

logger = logging.getLogger(__name__)

# ── Default system prompt (Chinese) ─────────────────────────────

DEFAULT_SYSTEM_PROMPT = (
    "你是一位专业的外贸商务邮件撰写助手。请根据以下邮件模板，填充需要AI生成的部分。"
    "要求：语言自然、专业、有针对性；只填充标记为需要生成的部分，不要修改其他任何文字；"
    "不要添加主题行或签名，除非模板中已包含。"
)

# ── Default templates ────────────────────────────────────────────
# 6-step progressive outreach sequence for foreign trade

LETTER_STEPS = [
    {
        "step": 1,
        "day": 1,
        "purpose": "破冰首邮",
        "purpose_en": "Ice-breaker",
        "description": "不推销、只建立关联。点明你看过他官网/店铺，一句话说清你是谁、做什么、能帮他赚什么。",
    },
    {
        "step": 2,
        "day": 4,
        "purpose": "爆款精准推荐",
        "purpose_en": "Hot-product pitch",
        "description": "让他觉得你懂他的市场。只推2-3款当地热销款，写清卖点+认证+目标价/起订量。",
    },
    {
        "step": 3,
        "day": 7,
        "purpose": "实力信任背书",
        "purpose_en": "Trust building",
        "description": "消除顾虑、建立专业度。展示认证、合作客户案例、工厂规模与交付能力。",
    },
    {
        "step": 4,
        "day": 10,
        "purpose": "痛点提问+方案",
        "purpose_en": "Pain-point probing",
        "description": "逼他回复、把对话打开。不提产品，只问真实痛点，给2选1方案让他好回复。",
    },
    {
        "step": 5,
        "day": 15,
        "purpose": "轻提醒+小刺激",
        "purpose_en": "Gentle nudge",
        "description": "温和施压、不骚扰。怕您漏看再发精简版，加弱刺激（价格波动等）。",
    },
    {
        "step": 6,
        "day": 25,
        "purpose": "收尾留后路",
        "purpose_en": "Graceful close",
        "description": "体面退场、保留未来机会。暂时不打扰，资料留底，开放入口等新品/价格变动再通知。",
    },
]

DEFAULT_TEMPLATES = [
    {
        "name": "第1封 - 破冰首邮",
        "step": 1,
        "content": (
            "Hi {FirstName},\n\n"
            "{AI:Write 1-2 personalized sentences showing you've researched {CompanyName} and know they specialize in {CompanyIndustry}. Mention something specific about their business that caught your attention.}\n\n"
            "I'm {MyContactPerson} from {MyCompanyName}. We specialize in {MyProducts}, and I believe we can help {CompanyName} gain a competitive edge in your market.\n\n"
            "{AI:In one brief sentence, highlight a key selling point of {MyCompanyName}'s products — keep it short, no hard sell.}\n\n"
            "Best regards,\n{MyContactPerson}\n{MyCompanyName}\n{MyEmail}"
        ),
        "is_default": False,
        "sort_order": 0,
    },
    {
        "name": "第2封 - 爆款精准推荐",
        "step": 2,
        "content": (
            "Hi {FirstName},\n\n"
            "Following up on my earlier message. Based on {CompanyName}'s focus in the {CompanyIndustry} market, I'd like to share 2-3 of our best-selling items in your region:\n\n"
            "{AI:Write 2-3 product recommendations tailored to {CompanyName}'s {CompanyIndustry} market in {CompanyCountry}. For each product, include: key selling point, relevant certifications (CE/REACH/BSCI), target price range, and minimum order quantity. Mention that other customers in the same region are already selling these profitably.}\n\n"
            "Would any of these interest you? I'm happy to send samples.\n\n"
            "Best regards,\n{MyContactPerson}\n{MyCompanyName}\n{MyEmail}"
        ),
        "is_default": False,
        "sort_order": 1,
    },
    {
        "name": "第3封 - 实力信任背书",
        "step": 3,
        "content": (
            "Hi {FirstName},\n\n"
            "I understand that choosing the right supplier is a big decision. Let me share a bit more about {MyCompanyName}:\n\n"
            "{AI:Write 3-4 sentences building trust for {MyCompanyName}. Include: certifications held (CE/REACH/BSCI/GRS), factory size and production capacity, R&D and quality control processes, and any notable client collaborations or case studies. End with: 'We can support full compliance documentation and retailer audit requirements.'}\n\n"
            "I'd be happy to arrange a video factory tour or share our audit reports.\n\n"
            "Best regards,\n{MyContactPerson}\n{MyCompanyName}\n{MyEmail}"
        ),
        "is_default": False,
        "sort_order": 2,
    },
    {
        "name": "第4封 - 痛点提问+方案",
        "step": 4,
        "content": (
            "Hi {FirstName},\n\n"
            "{AI:Write 2-3 sentences that directly ask {FirstName} about their biggest challenges as a buyer in the {CompanyIndustry} industry. Do NOT mention products. Instead, pose thoughtful questions about: pricing pressure, lead times, compliance/certification needs, minimum order flexibility, or new product development. Then offer two clear options for them to choose from, for example: 'Would you say your priority is cost optimization, or is compliance and supply stability more important?'}\n\n"
            "I'd love to understand your needs better — even a one-line reply helps.\n\n"
            "Best regards,\n{MyContactPerson}\n{MyCompanyName}\n{MyEmail}"
        ),
        "is_default": False,
        "sort_order": 3,
    },
    {
        "name": "第5封 - 轻提醒+小刺激",
        "step": 5,
        "content": (
            "Hi {FirstName},\n\n"
            "Just in case my previous emails got buried — here's a quick recap of what {MyCompanyName} can offer {CompanyName}:\n\n"
            "{AI:Write a very concise 2-3 sentence summary of {MyCompanyName}'s key value proposition for {CompanyName}, keeping it brief and easy to scan. Then add a gentle urgency note: mention that raw material prices or shipping costs have been fluctuating recently, and locking in orders sooner could help secure better pricing.}\n\n"
            "No pressure — just didn't want you to miss out.\n\n"
            "Best regards,\n{MyContactPerson}\n{MyCompanyName}\n{MyEmail}"
        ),
        "is_default": False,
        "sort_order": 4,
    },
    {
        "name": "第6封 - 收尾留后路",
        "step": 6,
        "content": (
            "Hi {FirstName},\n\n"
            "I don't want to take up more of your time, so this will be my last message for now. I'll keep {MyCompanyName}'s catalog on file for you.\n\n"
            "{AI:Write 1-2 sentences leaving the door open for future contact. Mention that you'll reach out when there are new products or price changes that might be relevant to {CompanyName}. Keep the tone warm but not desperate — dignified and professional. End with: 'I look forward to the possibility of working together in the future.'}\n\n"
            "Wishing {CompanyName} continued success.\n\n"
            "Best regards,\n{MyContactPerson}\n{MyCompanyName}\n{MyEmail}"
        ),
        "is_default": False,
        "sort_order": 5,
    },
]

# ── Build data map from all sources ─────────────────────────────

def build_data_map(
    employee: Optional[dict] = None,
    company: Optional[dict] = None,
    sender: Optional[dict] = None,
) -> dict[str, str]:
    """Build wildcard→value mapping from employee, company, and sender data."""
    data: dict[str, str] = {}
    if employee:
        parts = (employee.get("full_name") or "").strip().split()
        data.update({
            "FirstName": parts[0] if parts else "",
            "LastName": parts[-1] if len(parts) > 1 else (parts[0] if parts else ""),
            "FullName": employee.get("full_name", ""),
            "Position": employee.get("position") or "",
            "Department": employee.get("department") or "",
            "Phone": employee.get("phone") or "",
            "PersonalEmail": employee.get("personal_email") or "",
            "WhatsApp": employee.get("whatsapp") or "",
            "LinkedIn": employee.get("linkedin") or "",
        })
    if company:
        data.update({
            "CompanyName": company.get("name", ""),
            "CompanyWebsite": company.get("website") or "",
            "CompanyIndustry": company.get("industry") or "",
            # 国家是多值的，通配符里给出完整列表，没有列表时退回主国家
            "CompanyCountry": company.get("countries") or company.get("country") or "",
            "CompanyRegion": company.get("region") or "",
            "CompanyOpenEmail": company.get("open_email") or "",
            "CompanyPhone": company.get("phone") or "",
            "CompanyDomain": company.get("domain") or "",
            # 客户主营产品，用于「爆款精准推荐」按客户业务选品
            "CompanyProducts": company.get("products") or "",
        })
    if sender:
        data.update({
            "MyCompanyName": sender.get("company_name") or "",
            "MyProducts": sender.get("products") or "",
            "MyWebsite": sender.get("website") or "",
            "MyCountry": sender.get("country") or "",
            "MyIndustry": sender.get("industry") or "",
            "MyIntroduction": sender.get("introduction") or "",
            "MyContactPerson": sender.get("contact_person") or "",
            "MyPhone": sender.get("phone") or "",
            "MyEmail": sender.get("email") or "",
            "MyAddress": sender.get("address") or "",
        })
    return data


def replace_data_wildcards(text: str, data_map: dict[str, str]) -> str:
    """Replace ALL {FieldName} wildcards with real data.
    This includes wildcards inside {AI:...} instructions.
    After this call, ZERO {FieldName} wildcards remain.
    Only {AI:...} markers are preserved (with data-filled instructions).
    """
    def _replacer(match: re.Match) -> str:
        key = match.group(1)
        if key.startswith("AI:"):
            return match.group(0)  # preserve AI markers
        return data_map.get(key, match.group(0))  # replace or keep as-is if no data

    return re.sub(r"\{(\w+)\}", _replacer, text)


def render_preview(text: str, data_map: dict[str, str]) -> list[dict]:
    """Render template for preview: replace data wildcards, mark AI sections.
    Returns a list of segments: {type: 'text'|'data'|'ai', content: str}
    Used by frontend to display colored preview.
    """
    # First replace data wildcards
    filled = replace_data_wildcards(text, data_map)

    # Split by {AI:...} markers
    segments = []
    last_end = 0
    for m in re.finditer(r"\{AI:(.*?)\}", filled):
        # Text before this AI marker
        if m.start() > last_end:
            segments.append({"type": "text", "content": filled[last_end:m.start()]})
        # The AI instruction (data already replaced inside)
        segments.append({"type": "ai", "content": m.group(1)})
        last_end = m.end()
    # Remaining text
    if last_end < len(filled):
        segments.append({"type": "text", "content": filled[last_end:]})

    # Now split text segments further: find parts that came from data replacement
    # We do this by re-checking which substrings match known data values
    result = []
    for seg in segments:
        if seg["type"] == "ai":
            result.append(seg)
            continue
        # Check each data value in the text
        text_content = seg["content"]
        if not text_content:
            continue
        # Find all data values present in this text
        data_positions = []
        for key, value in data_map.items():
            if not value or value not in text_content:
                continue
            idx = 0
            while True:
                pos = text_content.find(value, idx)
                if pos == -1:
                    break
                data_positions.append((pos, pos + len(value), key, value))
                idx = pos + 1
        if not data_positions:
            result.append({"type": "text", "content": text_content})
            continue
        # Sort by position and build interleaved segments
        data_positions.sort(key=lambda x: x[0])
        merged = []
        for start, end, key, value in data_positions:
            if merged and start < merged[-1][1]:
                continue  # skip overlapping
            merged.append((start, end, key, value))
        cursor = 0
        for start, end, key, value in merged:
            if start > cursor:
                result.append({"type": "text", "content": text_content[cursor:start]})
            result.append({"type": "data", "content": value, "field": key})
            cursor = end
        if cursor < len(text_content):
            result.append({"type": "text", "content": text_content[cursor:]})

    return result


# ── AI generation ────────────────────────────────────────────────

async def generate_letter_from_template(
    template_content: str,
    employee: Optional[dict] = None,
    company: Optional[dict] = None,
    sender: Optional[dict] = None,
    custom_prompt: Optional[str] = None,
    language: str = "en",
) -> str:
    """Generate a letter. Ensures ZERO wildcards reach the AI."""
    data_map = build_data_map(employee, company, sender)

    # Phase 1: Replace ALL data wildcards (including inside AI instructions)
    filled = replace_data_wildcards(template_content, data_map)

    # Check for remaining data wildcards (shouldn't be any)
    remaining = re.findall(r"\{(\w+)\}", filled)
    remaining_data = [r for r in remaining if not r.startswith("AI:")]
    if remaining_data:
        logger.warning(f"Unreplaced data wildcards: {remaining_data}")

    # Phase 2: Extract AI sections
    ai_sections = list(re.finditer(r"\{AI:(.*?)\}", filled))
    if not ai_sections:
        # No AI sections — return the data-filled template as-is
        return filled

    # Build the prompt for AI — no wildcards, only real data and natural language
    # Apply data wildcard replacement to system prompt too
    system_prompt = replace_data_wildcards(custom_prompt or DEFAULT_SYSTEM_PROMPT, data_map)

    # Inject language directive into system prompt
    _LANG_NAMES = {
        "en": "English", "de": "German (Deutsch)", "fr": "French (Français)",
        "es": "Spanish (Español)", "it": "Italian (Italiano)", "pt": "Portuguese (Português)",
        "nl": "Dutch (Nederlands)", "ru": "Russian (Русский)", "ja": "Japanese (日本語)",
        "zh": "Chinese (中文)", "ko": "Korean (한국어)", "ar": "Arabic (العربية)",
        "tr": "Turkish (Türkçe)", "pl": "Polish (Polski)", "sv": "Swedish (Svenska)",
    }
    lang_name = _LANG_NAMES.get(language, language)
    if language != "zh":
        system_prompt += (
            f"\n\nIMPORTANT: The entire email must be written exclusively in {lang_name}. "
            f"Do NOT use any other language — no mixed language, no Chinese phrases, "
            f"no transliteration from other languages. Every sentence must be natural, "
            f"idiomatic {lang_name}."
        )
    else:
        system_prompt += (
            "\n\n重要：整封邮件必须使用中文撰写。不要混合其他语言，不要使用英文短语或句子。"
            "每一句话都应该是自然、地道的中文表达。"
        )

    # Create slot markers: [SECTION_1], [SECTION_2], etc.
    template_with_slots = filled
    section_instructions = []
    for i, m in enumerate(ai_sections, 1):
        instruction = m.group(1)  # Already data-replaced in Phase 1
        section_instructions.append(f"SECTION_{i}: {instruction}")
        template_with_slots = template_with_slots.replace(m.group(0), f"[SECTION_{i}]", 1)

    user_message = (
        "以下是邮件模板，其中 [SECTION_N] 标记处需要你生成内容。"
        "各标记的生成要求如下：\n\n"
        + "\n".join(section_instructions)
        + "\n\n请输出完整的邮件内容（包含非标记部分的原文字），不要输出任何额外说明。"
        f"\n\n模板：\n{template_with_slots}"
    )

    # Check cache
    cache_key = f"ai:{settings.ai_provider}:{system_prompt}:{template_with_slots}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        if settings.ai_provider == "anthropic":
            result = await _call_anthropic(system_prompt, user_message)
        else:
            result = await _call_openai(system_prompt, user_message)

        cache.set(cache_key, result, ttl=600)
        return result
    except Exception as e:
        logger.error(f"AI generation failed: {e}")
        raise ValueError(f"AI generation failed: {e}") from e


# ── Legacy API ───────────────────────────────────────────────────

DEFAULT_PROMPTS = {"en": DEFAULT_SYSTEM_PROMPT, "zh": DEFAULT_SYSTEM_PROMPT}


async def generate_dev_letter(
    company_name: Optional[str] = None,
    company_industry: Optional[str] = None,
    employee_name: Optional[str] = None,
    employee_position: Optional[str] = None,
    language: str = "en",
    custom_prompt: Optional[str] = None,
    my_company_info: Optional[str] = None,
) -> str:
    """Legacy compat: generate letter using simple template."""
    employee = {"full_name": employee_name or "", "position": employee_position or ""}
    company = {"name": company_name or "", "industry": company_industry or ""}
    sender = {"company_name": my_company_info or ""} if my_company_info else None

    template = (
        "Hi {FirstName},\n\n"
        "{AI:Write a professional, personalized business development email opening "
        "(2-3 sentences) to {FullName} at {CompanyName} in the {CompanyIndustry} industry.}\n\n"
        "Best regards"
    )
    return await generate_letter_from_template(template, employee, company, sender, custom_prompt, language=language)


async def call_ai(system_prompt: str, user_message: str) -> str:
    """General-purpose AI call. Dispatches to the configured provider.

    Returns the raw text response. Throws ValueError on configuration/API errors.
    """
    if settings.ai_provider == "anthropic":
        return await _call_anthropic(system_prompt, user_message)
    else:
        return await _call_openai(system_prompt, user_message)


# ── Low-level API calls ─────────────────────────────────────────

async def _call_anthropic(system_prompt: str, user_message: str) -> str:
    if not settings.anthropic_api_key:
        raise ValueError("未配置 Anthropic API Key，请在 设置 页面或 .env 文件中填入 ANTHROPIC_API_KEY")
    # base_url is the root URL (e.g. https://api.anthropic.com or https://qianfan.baidubce.com/anthropic/coding)
    # Always append /v1/messages
    api_url = settings.anthropic_base_url.rstrip("/") + "/v1/messages"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)) as client:
            response = await client.post(
                api_url,
                headers={
                    "x-api-key": settings.anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": settings.anthropic_model,
                    "max_tokens": settings.ai_max_tokens,
                    "temperature": settings.ai_temperature,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_message}],
                },
            )
            # Log response body for debugging on non-2xx
            if response.status_code >= 400:
                body = response.text[:500]
                logger.error(f"Anthropic API error {response.status_code}: URL={api_url} Body={body}")
            if response.status_code == 401:
                raise ValueError("Anthropic API Key 无效或已过期，请检查设置")
            if response.status_code == 403:
                raise ValueError(f"请求被拒绝 (403)，可能 API 地址或 Key 不匹配。地址: {api_url}")
            if response.status_code == 404:
                raise ValueError(f"API 地址不存在 (404)，请检查 API 地址是否正确: {api_url}")
            if response.status_code == 429:
                raise ValueError("AI 请求频率超限，请稍后重试")
            if response.status_code == 500:
                raise ValueError("AI 服务端错误 (500)，请稍后重试")
            if response.status_code == 529:
                raise ValueError("AI 服务过载 (529)，请稍后重试")
            if response.status_code == 400:
                detail = ""
                try:
                    err = response.json()
                    detail = err.get("error", {}).get("message", "") or str(err)[:300]
                except Exception:
                    detail = response.text[:300]
                raise ValueError(f"请求格式错误 (400): {detail}")
            response.raise_for_status()
            data = response.json()
            if "content" not in data or not data["content"]:
                raise ValueError(f"AI 返回格式异常: {str(data)[:200]}")
            # Extract text from content blocks, skipping non-text types (e.g. "thinking")
            for block in data["content"]:
                if block.get("type") == "text" and block.get("text"):
                    return block["text"]
            raise ValueError(f"AI 返回无文本内容: {str(data)[:300]}")
    except httpx.TimeoutException:
        raise ValueError("AI 请求超时（120秒），请检查网络连接或稍后重试")
    except httpx.ConnectError:
        raise ValueError(f"无法连接 AI 服务 ({settings.anthropic_base_url})，请检查网络或代理设置")
    except ValueError:
        raise  # re-raise our own ValueErrors
    except Exception as e:
        raise ValueError(f"AI 请求失败: {type(e).__name__}: {e}") from e


async def _call_openai(system_prompt: str, user_message: str) -> str:
    if not settings.openai_api_key:
        raise ValueError("未配置 OpenAI API Key，请在 设置 页面或 .env 文件中填入 OPENAI_API_KEY")
    # base_url is the root URL (e.g. https://api.openai.com/v1)
    # Always append /chat/completions
    api_url = settings.openai_base_url.rstrip("/") + "/chat/completions"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=120.0, write=10.0, pool=10.0)) as client:
            response = await client.post(
                api_url,
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.openai_model,
                    "max_tokens": settings.ai_max_tokens,
                    "temperature": settings.ai_temperature,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_message},
                    ],
                },
            )
            if response.status_code >= 400:
                body = response.text[:500]
                logger.error(f"OpenAI API error {response.status_code}: URL={api_url} Body={body}")
            if response.status_code == 401:
                raise ValueError("OpenAI API Key 无效或已过期，请检查设置")
            if response.status_code == 404:
                raise ValueError(f"API 地址不存在 (404)，请检查 API 地址是否正确: {api_url}")
            if response.status_code == 429:
                raise ValueError("AI 请求频率超限，请稍后重试")
            if response.status_code == 500:
                raise ValueError("AI 服务端错误 (500)，请稍后重试")
            if response.status_code == 400:
                detail = ""
                try:
                    err = response.json()
                    detail = err.get("error", {}).get("message", "") or str(err)[:300]
                except Exception:
                    detail = response.text[:300]
                raise ValueError(f"请求格式错误 (400): {detail}")
            response.raise_for_status()
            data = response.json()
            if "choices" not in data or not data["choices"]:
                raise ValueError(f"AI 返回格式异常: {str(data)[:200]}")
            return data["choices"][0]["message"]["content"]
    except httpx.TimeoutException:
        raise ValueError("AI 请求超时（120秒），请检查网络连接或稍后重试")
    except httpx.ConnectError:
        raise ValueError(f"无法连接 AI 服务 ({settings.openai_base_url})，请检查网络或代理设置")
    except ValueError:
        raise  # re-raise our own ValueErrors
    except Exception as e:
        raise ValueError(f"AI 请求失败: {type(e).__name__}: {e}") from e
