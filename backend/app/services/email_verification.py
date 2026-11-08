"""Email verification service — multi-signal approach with rate limiting.

Design principles:
  - SMTP RCPT TO is unreliable in modern email infrastructure (RBL blocks, catch-all, greylisting)
  - Rate limiting prevents IP blacklisting (configurable, default 5/min)
  - Spam trap detection prevents triggering anti-spam mechanisms
  - Multi-signal scoring: DNS (MX/SPF/DKIM) + SMTP + known provider heuristics
  - Only one email verified per API call — no batch verification

Verification flow:
  1. Format validation
  2. Spam trap check → reject suspicious addresses
  3. Rate limit check → 429 if exceeded
  4. DNS signals: MX + SPF + DKIM + known provider → confidence score
  5. SMTP RCPT TO (single attempt, no aggressive retries)
  6. Combine SMTP + DNS for final verdict

Status meanings:
  - valid:        SMTP RCPT TO confirmed (250 + not catch-all)
  - likely_valid: DNS signals strong, or IP-blocked by SMTP, or greylisted, or manual entry
  - unknown:      No MX records, format invalid, catch-all, or spam trap
"""

import asyncio
import logging
import random
import re
import string
import time
from datetime import datetime
from typing import Optional

import aiosmtplib
import dns.resolver
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cache import cache
from app.models.email import Email

logger = logging.getLogger(__name__)

# ── Constants ───────────────────────────────────────────────

_MAX_MX_FALLBACK = 2       # Max MX hosts to try
_CACHE_TTL_FAIL = 300      # 5 min — uncertain results
_CACHE_TTL_SUCCESS = 7200  # 2 hours — stable results
_CACHE_TTL_GREYLIST = 300  # 5 min — allow greylist retry

# ── Known mail provider MX hostname patterns ──────────────────

_KNOWN_PROVIDER_PATTERNS = [
    r"\.mail\.protection\.outlook\.com$",
    r"\.ppe\.protection\.outlook\.com$",
    r"googlemail\.com$",
    r"gmail-smtp-in\.l\.google\.com$",
    r"\.google\.com$",
    r"\.mail\.yahoo\.com$",
    r"\.yahoodns\.net$",
    r"\.icloud\.com$",
    r"\.proofpoint\.com$",
    r"\.mimecast\.com$",
    r"\.barracudanetworks\.com$",
    r"\.messagelabs\.com$",
    r"\.amazonses\.com$",
    r"\.rzone\.de$",
    r"\.kundenserver\.de$",
    r"\.mail\.ru$",
    r"\.yandex\.net$",
    r"\.zoho\.com$",
    r"\.hubspotmail\.net$",
    r"\.sendgrid\.net$",
    r"\.mailgun\.org$",
    r"\.postmarkapp\.com$",
]

_KNOWN_PROVIDER_RE = [re.compile(p, re.IGNORECASE) for p in _KNOWN_PROVIDER_PATTERNS]

# ── Spam Trap detection ────────────────────────────────────

# Local-part keywords that commonly indicate spam traps
_SPAM_TRAP_LOCAL_KEYWORDS = [
    "spam", "trap", "honeypot", "abuse", "postmaster",
    "noreply", "no-reply", "donotreply", "do-not-reply",
    "test", "admin", "webmaster", "null", "devnull",
    "block", "blacklist", "remove", "unsubscribe",
]

# Domains known for disposable/temporary email
_DISPOSABLE_DOMAINS = {
    "guerrillamail.com", "guerrillamailblock.com", "grr.la",
    "tempmail.com", "temp-mail.org",
    "mailinator.com", "maildrop.cc",
    "throwaway.email", "yopmail.com", "yopmail.fr",
    "dispostable.com", "trashmail.com",
    "sharklasers.com", "spam4.me",
    "guerrillamail.info", "guerrillamail.net",
    "mailcatch.com", "mailexpire.com",
    "mintemail.com", "mohmal.com",
    "trashymail.com", "mailsac.com",
    "inboxkitten.com", "emailondeck.com",
    "tempail.com", "tempr.email",
}


def _check_spam_trap(email_addr: str) -> Optional[str]:
    """Check if an email address looks like a spam trap.

    Returns a warning string if suspected, None otherwise.
    """
    local, _, domain = email_addr.partition("@")
    local_lower = local.lower()
    domain_lower = domain.lower()

    # Check disposable domain
    if domain_lower in _DISPOSABLE_DOMAINS:
        return f"Disposable/temporary email domain ({domain_lower}) — possible spam trap"

    # Check local-part keywords (but allow legitimate business addresses)
    # Skip common legitimate prefixes like "info", "contact", "sales", "support"
    _LEGITIMATE_PREFIXES = {"info", "contact", "sales", "support", "service", "help", "office", "hello", "inquiry", "enquiry"}
    if local_lower not in _LEGITIMATE_PREFIXES:
        for keyword in _SPAM_TRAP_LOCAL_KEYWORDS:
            if keyword in local_lower:
                return f"Local part contains '{keyword}' — possible spam trap"

    return None


# ── Rate Limiter (Token Bucket) ────────────────────────────

class _RateLimiter:
    """Simple token bucket rate limiter for email verification.

    Allows up to `rate` verifications per minute.
    Tokens refill at a steady rate.
    """

    def __init__(self, rate: int = 5):
        self._rate = rate
        self._tokens = float(rate)
        self._max_tokens = float(rate)
        self._last_refill = time.monotonic()
        self._lock = asyncio.Lock()

    def update_rate(self, rate: int):
        """Update the rate limit (e.g., when settings change)."""
        self._rate = rate
        self._max_tokens = float(rate)

    async def acquire(self) -> bool:
        """Try to acquire a token. Returns True if allowed, False if rate exceeded."""
        async with self._lock:
            now = time.monotonic()
            elapsed = now - self._last_refill
            # Refill tokens based on elapsed time
            self._tokens = min(self._max_tokens, self._tokens + elapsed * (self._rate / 60.0))
            self._last_refill = now

            if self._tokens >= 1.0:
                self._tokens -= 1.0
                return True
            return False

    async def wait_and_acquire(self, max_wait: float = 70.0) -> bool:
        """Wait until a token is available (up to max_wait seconds)."""
        deadline = time.monotonic() + max_wait
        while time.monotonic() < deadline:
            if await self.acquire():
                return True
            # Calculate how long until next token
            wait_time = 60.0 / max(self._rate, 1)
            # Add jitter (±30%)
            jitter = wait_time * 0.3 * (random.random() * 2 - 1)
            actual_wait = max(1.0, wait_time + jitter)
            await asyncio.sleep(min(actual_wait, deadline - time.monotonic()))
        return False


# Global rate limiter instance
_rate_limiter = _RateLimiter(rate=settings.email_verify_rate_limit)


# ── Basic email format validation ──────────────────────────

_EMAIL_RE = re.compile(r"^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$")

def _is_valid_format(email_addr: str) -> bool:
    """Check if email address has a valid format."""
    return bool(_EMAIL_RE.match(email_addr))


# ── DNS helpers ────────────────────────────────────────────

async def resolve_mx(domain: str, all_records: bool = False) -> Optional[str | list[tuple[int, str]]]:
    """Resolve MX records for a domain."""
    cache_key = f"mx:{domain}"
    cached = cache.get(cache_key)
    if cached and not all_records:
        return cached

    try:
        loop = asyncio.get_event_loop()
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(domain, "MX")
        )
        mx_records = sorted([(r.preference, str(r.exchange).rstrip(".")) for r in answers])

        if all_records:
            return mx_records

        if mx_records:
            result = mx_records[0][1]
            cache.set(cache_key, result, ttl=3600)
            return result
    except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.resolver.NoNameservers, Exception) as e:
        logger.debug(f"MX resolution failed for {domain}: {e}")

    return None


async def resolve_a(domain: str) -> Optional[str]:
    """Resolve A record for a domain."""
    cache_key = f"a:{domain}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    try:
        loop = asyncio.get_event_loop()
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(domain, "A")
        )
        for rdata in answers:
            ip = str(rdata)
            cache.set(cache_key, ip, ttl=3600)
            return ip
    except Exception as e:
        logger.debug(f"A record resolution failed for {domain}: {e}")

    return None


async def check_spf(domain: str) -> bool:
    """Check if domain has an SPF record."""
    cache_key = f"spf:{domain}"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached

    try:
        loop = asyncio.get_event_loop()
        answers = await loop.run_in_executor(
            None, lambda: dns.resolver.resolve(domain, "TXT")
        )
        has_spf = any(
            str(rdata).strip('"').startswith("v=spf1")
            for rdata in answers
        )
        cache.set(cache_key, has_spf, ttl=3600)
        return has_spf
    except Exception:
        cache.set(cache_key, False, ttl=600)
        return False


async def check_dkim(domain: str) -> bool:
    """Check if domain has a DKIM record (best-effort)."""
    for selector in ("default", "google", "selector1", "s1"):
        cache_key = f"dkim:{selector}.{domain}"
        cached = cache.get(cache_key)
        if cached is not None:
            if cached:
                return True
            continue
        try:
            loop = asyncio.get_event_loop()
            answers = await loop.run_in_executor(
                None, lambda: dns.resolver.resolve(f"{selector}._domainkey.{domain}", "TXT")
            )
            for rdata in answers:
                txt = str(rdata).strip('"')
                if "v=DKIM1" in txt or "k=rsa" in txt:
                    cache.set(cache_key, True, ttl=3600)
                    return True
            cache.set(cache_key, False, ttl=600)
        except Exception:
            cache.set(cache_key, False, ttl=600)
    return False


def _is_known_provider(mx_host: str) -> bool:
    """Check if the MX host belongs to a known mail provider."""
    return any(pat.search(mx_host) for pat in _KNOWN_PROVIDER_RE)


# ── DNS-based domain confidence scoring ────────────────────

async def _domain_confidence(domain: str, mx_host: str) -> str:
    """Evaluate domain confidence from DNS signals alone (no SMTP).

    Returns: "likely_valid" / "weak_likely" / "unknown"
    """
    score = 0

    if _is_known_provider(mx_host):
        score += 3

    if await check_spf(domain):
        score += 1

    if await check_dkim(domain):
        score += 1

    if score >= 2:
        return "likely_valid"

    if mx_host:
        return "weak_likely"

    return "unknown"


# ── SMTP verification against a single host ────────────────

def _is_ip_block_rejection(code: int, message: str) -> bool:
    """Check if SMTP rejection is due to sender IP policy."""
    msg = message.lower()
    return any(kw in msg for kw in (
        "blocked", "spamhaus", "spam", "blacklist", "policy",
        "rbl", "dnsbl", "service unavailable", "client host",
        "ip blocked", "sender denied", "not allowed",
    ))


async def _smtp_verify_single(host: str, email_addr: str, domain: str) -> dict | None:
    """Attempt SMTP verification against a single host.

    Returns the verification result dict, or None if the connection itself failed.
    """
    smtp = aiosmtplib.SMTP(
        hostname=host,
        port=25,
        timeout=settings.email_verify_timeout,
        use_tls=False,
    )

    try:
        await smtp.connect()
    except (aiosmtplib.SMTPConnectError, aiosmtplib.SMTPConnectTimeoutError):
        logger.debug(f"SMTP connect failed to {host} for {email_addr}")
        return None
    except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
        logger.debug(f"SMTP connect failed to {host} for {email_addr}")
        return None

    result = {
        "email": email_addr,
        "verification_status": "unknown",
        "mx_record": host,
        "smtp_response": None,
        "details": None,
    }

    try:
        await smtp.ehlo()

        if smtp.supports_extension("starttls"):
            try:
                await smtp.starttls()
                await smtp.ehlo()
            except aiosmtplib.SMTPException:
                await smtp.ehlo()

        await smtp.mail("verify@foreigntrade.local")
        response = await smtp.rcpt(email_addr)
        code = response.code

        if code == 250:
            # Catch-all check
            rand_local = "zzzznonexistent" + "".join(random.choices(string.digits, k=6))
            rand_addr = f"{rand_local}@{domain}"
            try:
                catchall_resp = await smtp.rcpt(rand_addr)
                if catchall_resp.code == 250:
                    result["verification_status"] = "unknown"
                    result["smtp_response"] = f"{code} {response.message}"
                    result["details"] = "Catch-all domain (accepts all addresses, cannot verify)"
                else:
                    result["verification_status"] = "valid"
                    result["smtp_response"] = f"{code} {response.message}"
            except Exception:
                result["verification_status"] = "valid"
                result["smtp_response"] = f"{code} {response.message}"

        elif code in (450, 451):
            # Greylisting — server asks us to try again later
            result["verification_status"] = "likely_valid"
            result["smtp_response"] = f"{code} {response.message}"
            result["details"] = "Greylisted — server requests retry later, mailbox likely valid"

        elif code in (550, 551, 553):
            if _is_ip_block_rejection(code, str(response.message)):
                result["verification_status"] = "likely_valid"
                result["smtp_response"] = f"{code} {response.message}"
                result["details"] = "SMTP rejected due to sender IP policy/blocklist — mailbox may be valid"
            else:
                result["verification_status"] = "unknown"
                result["smtp_response"] = f"{code} {response.message}"
                result["details"] = "SMTP rejected (may be greylisting or policy block)"

        else:
            result["verification_status"] = "unknown"
            result["smtp_response"] = f"{code} {response.message}"
            result["details"] = "Server returned non-standard response (possible catch-all)"

    except aiosmtplib.SMTPResponseException as e:
        result["smtp_response"] = f"{e.code} {e.message}"
        if e.code in (450, 451):
            result["verification_status"] = "likely_valid"
            result["details"] = "Greylisted — server requests retry later, mailbox likely valid"
        elif e.code in (550, 551, 553):
            if _is_ip_block_rejection(e.code, str(e.message)):
                result["verification_status"] = "likely_valid"
                result["details"] = "SMTP rejected due to sender IP policy/blocklist — mailbox may be valid"
            else:
                result["verification_status"] = "unknown"
                result["details"] = "SMTP rejected (may be greylisting or policy block)"
        else:
            result["verification_status"] = "unknown"
            result["details"] = f"SMTP error: {e.code} {e.message}"
    except asyncio.TimeoutError:
        result["details"] = "SMTP operation timed out"
    except ConnectionRefusedError:
        result["details"] = "Connection refused after handshake"
    except aiosmtplib.SMTPServerDisconnected:
        result["details"] = "Server disconnected unexpectedly"
    except Exception as e:
        result["details"] = f"Verification error: {type(e).__name__}"
        logger.debug(f"Email verification error for {email_addr} on {host}: {e}")
    finally:
        try:
            await smtp.quit()
        except Exception:
            pass

    return result


# ── Main verification entry point (single email) ──────────

async def verify_email_smtp(email_addr: str) -> dict:
    """Verify a single email address using multi-signal approach.

    Strategy:
    1. Format check
    2. Spam trap detection
    3. DNS signals (MX/SPF/DKIM/known provider)
    4. SMTP RCPT TO (single attempt per host)
    5. Combine signals for final verdict

    Rate limiting is applied at the API level, not here.
    """
    # Check cache first
    cache_key = f"verify:{email_addr}"
    cached = cache.get(cache_key)
    if cached:
        return cached

    # Basic format check
    if not _is_valid_format(email_addr):
        result = {
            "email": email_addr,
            "verification_status": "unknown",
            "mx_record": None,
            "smtp_response": None,
            "details": "Invalid email format",
        }
        cache.set(cache_key, result, ttl=_CACHE_TTL_SUCCESS)
        return result

    # Spam trap check
    spam_warning = _check_spam_trap(email_addr)
    if spam_warning:
        result = {
            "email": email_addr,
            "verification_status": "unknown",
            "mx_record": None,
            "smtp_response": None,
            "details": spam_warning,
        }
        cache.set(cache_key, result, ttl=_CACHE_TTL_FAIL)
        return result

    domain = email_addr.split("@")[-1]
    result = {
        "email": email_addr,
        "verification_status": "unknown",
        "mx_record": None,
        "smtp_response": None,
        "details": None,
    }

    # ── Step 1: Resolve MX records ──
    mx_records = await resolve_mx(domain, all_records=True)

    if not mx_records:
        result["details"] = "No MX record found for domain"
        cache.set(cache_key, result, ttl=_CACHE_TTL_FAIL)
        return result

    top_mx_host = mx_records[0][1]
    result["mx_record"] = top_mx_host

    # ── Step 2: DNS confidence scoring ──
    dns_confidence = await _domain_confidence(domain, top_mx_host)

    # ── Step 3: SMTP RCPT TO (best-effort, single attempt per host) ──
    smtp_result = None
    hosts_to_try = [host for _, host in mx_records[:_MAX_MX_FALLBACK]]

    for mx_host in hosts_to_try:
        r = await _smtp_verify_single(mx_host, email_addr, domain)
        if r is not None:
            smtp_result = r
            break

    # If SMTP failed on MX hosts, try A record fallback
    if smtp_result is None:
        a_record = await resolve_a(domain)
        if a_record and a_record not in hosts_to_try:
            r = await _smtp_verify_single(a_record, email_addr, domain)
            if r is not None:
                r["mx_record"] = r["mx_record"] or a_record
                smtp_result = r

    # ── Step 4: Combine SMTP + DNS signals ──
    if smtp_result is not None:
        if smtp_result["verification_status"] == "valid":
            ttl = _CACHE_TTL_SUCCESS
        elif smtp_result["verification_status"] == "likely_valid":
            ttl = _CACHE_TTL_FAIL
        elif smtp_result["verification_status"] == "unknown":
            # SMTP inconclusive — upgrade based on DNS signals
            if dns_confidence == "likely_valid":
                smtp_result["verification_status"] = "likely_valid"
                smtp_result["details"] = (
                    f"SMTP inconclusive, but DNS signals strong "
                    f"(MX: {top_mx_host}, SPF/DKIM configured) — likely deliverable"
                )
            elif dns_confidence == "weak_likely" and _is_known_provider(top_mx_host):
                smtp_result["verification_status"] = "likely_valid"
                smtp_result["details"] = (
                    f"SMTP inconclusive, but MX hosted by known provider ({top_mx_host}) — likely deliverable"
                )
            ttl = _CACHE_TTL_FAIL
        else:
            ttl = _CACHE_TTL_FAIL

        cache.set(cache_key, smtp_result, ttl=ttl)
        return smtp_result

    # ── Step 5: SMTP unreachable — rely on DNS signals ──
    result["verification_status"] = "likely_valid"
    result["details"] = f"MX record exists ({top_mx_host}), SMTP unreachable — email is likely deliverable"
    cache.set(cache_key, result, ttl=_CACHE_TTL_FAIL)
    return result


# ── Batch verification (kept for backward compat, but processes one at a time with rate limiting) ──

async def verify_emails_batch(
    db: AsyncSession,
    email_ids: Optional[list[int]] = None,
    email_addrs: Optional[list[str]] = None,
) -> list[dict]:
    """Verify emails one at a time with rate limiting.

    Updates the database records and returns results.
    For manual-source emails with valid format, marks as likely_valid without SMTP.
    """
    # Update rate limiter from current settings
    _rate_limiter.update_rate(settings.email_verify_rate_limit)

    emails_to_verify: list[tuple[int, str, str]] = []  # (db_id, email_addr, source)

    # Load from DB if IDs provided
    if email_ids:
        db_result = await db.execute(
            select(Email).where(Email.id.in_(email_ids))
        )
        for email_obj in db_result.scalars().all():
            emails_to_verify.append((email_obj.id, email_obj.email, email_obj.source or "deduced"))

    # Add raw email strings — also try to find existing DB records
    if email_addrs:
        for addr in email_addrs:
            existing = await db.execute(
                select(Email).where(Email.email == addr)
            )
            existing_obj = existing.scalar_one_or_none()
            if existing_obj:
                emails_to_verify.append((existing_obj.id, existing_obj.email, existing_obj.source or "deduced"))
            else:
                emails_to_verify.append((0, addr, "unknown"))

    # Deduplicate by email address (keep the one with db_id > 0)
    seen: dict[str, tuple[int, str]] = {}
    deduped: list[tuple[int, str, str]] = []
    for db_id, addr, source in emails_to_verify:
        if addr in seen:
            if db_id > 0 and seen[addr][0] == 0:
                deduped = [(d, a, s) if a != addr else (db_id, a, source) for d, a, s in deduped]
                seen[addr] = (db_id, source)
            continue
        seen[addr] = (db_id, source)
        deduped.append((db_id, addr, source))
    emails_to_verify = deduped

    # Separate: manual emails → skip SMTP, mark likely_valid
    manual_skip: list[tuple[int, str, str]] = []
    smtp_verify: list[tuple[int, str, str]] = []

    for db_id, addr, source in emails_to_verify:
        if source == "manual" and _is_valid_format(addr):
            manual_skip.append((db_id, addr, source))
        else:
            smtp_verify.append((db_id, addr, source))

    results: list[dict] = []

    # Manual emails: trust user input, mark as likely_valid
    for db_id, addr, source in manual_skip:
        result = {
            "email": addr,
            "verification_status": "likely_valid",
            "mx_record": None,
            "smtp_response": None,
            "details": "Manual entry — email format valid",
        }
        results.append(result)

        if db_id > 0:
            email_obj = await db.get(Email, db_id)
            if email_obj:
                if email_obj.verification_status != "valid":
                    email_obj.verification_status = "likely_valid"
                    email_obj.verified_at = datetime.utcnow()
                    email_obj.smtp_response = result.get("smtp_response")

    # SMTP + DNS verification — one at a time with rate limiting
    for db_id, email_addr, _source in smtp_verify:
        # Wait for rate limiter (blocks until token available)
        acquired = await _rate_limiter.wait_and_acquire(max_wait=70.0)
        if not acquired:
            results.append({
                "email": email_addr,
                "verification_status": "unknown",
                "details": "Rate limit exceeded — try again later",
            })
            continue

        try:
            verify_result = await verify_email_smtp(email_addr)
        except Exception as e:
            verify_result = {
                "email": email_addr,
                "verification_status": "unknown",
                "details": f"Error: {type(e).__name__}",
            }

        results.append(verify_result)

        # Update DB
        if db_id > 0:
            email_obj = await db.get(Email, db_id)
            if email_obj:
                new_status = verify_result["verification_status"]
                if email_obj.verification_status == "valid" and new_status != "valid":
                    logger.info(f"Protecting valid email {email_addr} from downgrade to {new_status}")
                else:
                    email_obj.verification_status = new_status
                email_obj.verified_at = datetime.utcnow()
                email_obj.mx_record = verify_result.get("mx_record")
                email_obj.smtp_response = verify_result.get("smtp_response")

    await db.flush()
    return results
