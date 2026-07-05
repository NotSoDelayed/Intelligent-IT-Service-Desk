import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta

from config import settings

CATEGORIES = ["Network", "Hardware", "Software", "Access/Account", "Email", "Security", "Other"]
TEAMS = {
    "Network": "Network Operations",
    "Hardware": "Desktop Support",
    "Software": "Application Support",
    "Access/Account": "Identity & Access Management",
    "Email": "Messaging & Collaboration",
    "Security": "Security Operations (SOC)",
    "Other": "Service Desk Tier 1",
}
PRIORITIES = ["P1", "P2", "P3", "P4"]
DIFFICULTIES = ["Easy", "Medium", "Hard"]

SELF_HELP_NOTE = (
    "Your ticket has been received and an engineer will verify and close it. "
    "In the meantime, here are a few quick steps you can try yourself to resolve it faster."
)

# --- Gemini call resilience ---
# No env var changes required -- these are safe defaults. Tune if needed.
GEMINI_TIMEOUT_SECONDS = 10
GEMINI_MAX_RETRIES = 2          # total attempts = 1 + this
GEMINI_RETRY_BACKOFF_SECONDS = 1


@dataclass
class ClassificationResult:
    category: str
    priority: str
    difficulty: str
    assigned_team: str
    suggested_severity: str
    recommended_steps: list[str] = field(default_factory=list)
    user_self_help_steps: list[str] = field(default_factory=list)
    self_help_note: str = ""
    confidence: int = 60
    summary: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


SYSTEM_PROMPT = """You are an IT service desk triage assistant. Given a support \
ticket's title, description, and the user's self-reported urgency (1=low, \
5=critical), classify the ticket so the desk can route and schedule it \
correctly.

The user urgency rating is ONE input -- use your judgment. If the description \
doesn't match the rating (e.g. user says 5 but issue is trivial, or user says 1 \
but team is down), override it based on the actual content.

Respond with ONLY a raw JSON object (no markdown fences, no preamble) with this \
exact shape:
{
  "category": one of ["Network", "Hardware", "Software", "Access/Account", "Email", "Security", "Other"],
  "priority": one of ["P1", "P2", "P3", "P4"]  (P1 = critical/business-stopping, P4 = low/cosmetic),
  "difficulty": one of ["Easy", "Medium", "Hard"] -- how much hands-on engineer effort this takes. \
Easy = single quick action (~minutes). Medium = routine investigation (~1 hour). \
Hard = deep troubleshooting, vendor escalation, or hardware replacement (~half a day or more).,
  "suggested_severity": one of ["Low", "Medium", "High", "Urgent"],
  "assigned_team": short team name responsible for resolving it,
  "recommended_steps": array of 3-5 concrete troubleshooting steps for the ENGINEER, fastest fix first,
  "user_self_help_steps": array of 2-4 simple steps the USER can try themselves while waiting \
(populate this whenever difficulty is Easy, regardless of priority -- even urgent Easy tickets \
benefit from a quick self-service first step. Return empty array [] only if difficulty is \
Medium or Hard),
  "confidence": integer 0-100,
  "summary": one or two sentence neutral summary of the actual problem
}
"""


def _get_gemini_client():
    """
    Builds a Gemini client with a request timeout configured, so a hung
    Gemini call can't block a request indefinitely.
    """
    from google import genai
    from google.genai import types

    return genai.Client(
        api_key=settings.GEMINI_API_KEY,
        http_options=types.HttpOptions(timeout=GEMINI_TIMEOUT_SECONDS * 1000),  # ms
    )


def _call_gemini(title: str, content: str, user_priority: int = 3) -> dict | None:
    if not settings.GEMINI_API_KEY:
        return None

    from google.genai import types

    urgency_label = {
        1: "1/5 - not urgent at all",
        2: "2/5 - low urgency",
        3: "3/5 - moderate urgency",
        4: "4/5 - high urgency",
        5: "5/5 - critical, cannot work",
    }.get(user_priority, "3/5 - moderate urgency")

    user_prompt = (
        f"Title: {title}\n"
        f"User-reported urgency: {urgency_label}\n"
        f"Description: {content}\n\n"
        "Classify this ticket now."
    )

    for attempt in range(GEMINI_MAX_RETRIES + 1):
        try:
            client = _get_gemini_client()
            response = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=user_prompt,
                config=types.GenerateContentConfig(
                    system_instruction=SYSTEM_PROMPT,
                    response_mime_type="application/json",
                    temperature=0.2,
                ),
            )
            return json.loads(response.text)
        except Exception:
            if attempt < GEMINI_MAX_RETRIES:
                time.sleep(GEMINI_RETRY_BACKOFF_SECONDS * (attempt + 1))
                continue
            return None  # exhausted retries -- caller falls back to rule-based


# Self-help steps for the rule-based fallback, keyed by category.
# Used whenever difficulty is Easy, regardless of priority.
SELF_HELP_MAP = {
    "Network": [
        "Restart your router or modem and wait 60 seconds before reconnecting",
        "Try connecting to a different WiFi network or use mobile data to confirm the issue",
        "Restart your device and try again",
    ],
    "Hardware": [
        "Power off your device completely, wait 30 seconds, then turn it back on",
        "Check all cable connections are firmly plugged in",
        "Try a different power outlet or USB port if applicable",
    ],
    "Software": [
        "Close the application completely and reopen it",
        "Check for any pending software updates and install them",
        "Try clearing the application cache or restarting your browser",
    ],
    "Access/Account": [
        "Try resetting your password using the Forgot Password link",
        "Clear your browser cookies and cache then try logging in again",
        "Check if Caps Lock is on when entering your password",
    ],
    "Email": [
        "Try accessing your email via the web browser instead of the desktop app",
        "Check your internet connection and try again",
        "Check your spam/junk folder if you are missing emails",
    ],
    "Other": [
        "Try restarting the affected application or device",
        "Check if other users in your team are experiencing the same issue",
    ],
}


def _rule_based_classify(title: str, content: str, user_priority: int = 3) -> dict:
    """Deterministic keyword fallback so the platform works without an API key."""
    text = f"{title} {content}".lower()

    keyword_map = [
        ("Security", ["phishing", "malware", "virus", "breach", "hacked", "suspicious login",
                       "ransomware", "unauthorized access", "security alert"]),
        ("Network", ["wifi", "vpn", "network", "internet", "connection", "dns", "firewall",
                      "router", "switch", "ip address", "latency", "packet loss"]),
        ("Access/Account", ["password", "login", "locked out", "account", "access denied",
                              "permission", "mfa", "2fa", "sso", "reset"]),
        ("Email", ["outlook", "email", "mailbox", "spam", "inbox", "exchange", "smtp"]),
        ("Hardware", ["laptop", "monitor", "printer", "keyboard", "mouse", "device", "battery",
                       "screen", "hardware", "machine won't", "won't turn on", "docking"]),
        ("Software", ["application", "software", "app crash", "error message", "install",
                       "update failed", "bug", "license", "erp", "crm", "excel", "word",
                       "freeze", "not responding"]),
    ]

    category = "Other"
    for cat, keywords in keyword_map:
        if any(kw in text for kw in keywords):
            category = cat
            break

    urgent_words = ["urgent", "down", "outage", "all users", "cannot work", "production",
                     "critical", "breach", "data loss", "entire team", "company-wide"]
    high_words = ["cannot access", "blocked", "not working", "error", "failed", "locked out"]

    if any(w in text for w in urgent_words) or user_priority == 5:
        priority, severity = "P1", "Urgent"
    elif any(w in text for w in high_words) or user_priority == 4:
        priority, severity = "P2", "High"
    elif category == "Security":
        priority, severity = "P2", "High"
    elif user_priority <= 2 and len(content) < 60:
        priority, severity = "P4", "Low"
    else:
        priority, severity = "P3", "Medium"

    easy_words = ["reset", "restart", "reboot", "unlock", "locked out", "forgot password",
                  "request access", "add me to", "install"]
    hard_words = ["multiple users", "all users", "entire team", "company-wide", "outage",
                  "data loss", "breach", "won't turn on", "replace", "hardware failure",
                  "intermittent", "random", "for weeks", "for months"]

    if any(w in text for w in hard_words) or category == "Security":
        difficulty = "Hard"
    elif any(w in text for w in easy_words):
        difficulty = "Easy"
    else:
        difficulty = "Medium"

    # Option A: self-help for any Easy ticket regardless of priority
    user_self_help_steps = (
        SELF_HELP_MAP.get(category, SELF_HELP_MAP["Other"])
        if difficulty == "Easy"
        else []
    )

    steps_map = {
        "Network": [
            "Confirm scope: single user or multiple users affected",
            "Check VPN/firewall/router status and recent network changes",
            "Have user run a connectivity/ping test and share results",
            "Escalate to Network Operations if outage is confirmed",
        ],
        "Hardware": [
            "Ask user to confirm device model and error behavior",
            "Check warranty/asset record for the device",
            "Attempt basic hardware troubleshooting (reboot, reseat cables, power cycle)",
            "Arrange replacement/loaner if hardware fault is confirmed",
        ],
        "Software": [
            "Reproduce the issue or request screenshots/error logs",
            "Check for pending updates or known issues with the application",
            "Try reinstall/repair of the application",
            "Escalate to vendor support if issue persists",
        ],
        "Access/Account": [
            "Verify user identity per access policy",
            "Check account status (locked, expired, disabled) in directory service",
            "Reset credentials or restore access as appropriate",
            "Confirm MFA/SSO is functioning correctly",
        ],
        "Email": [
            "Confirm mailbox status and storage quota",
            "Check mail flow / spam filter rules",
            "Test send/receive from a different client or webmail",
            "Escalate to Messaging & Collaboration team if server-side issue",
        ],
        "Security": [
            "Treat as priority -- isolate affected account/device if needed",
            "Do not click any links/attachments mentioned in the ticket",
            "Escalate immediately to Security Operations (SOC)",
            "Document timeline of events for incident response",
        ],
        "Other": [
            "Clarify the exact issue with the requester",
            "Check knowledge base for similar past tickets",
            "Route to the most relevant specialist team",
        ],
    }

    return {
        "category": category,
        "priority": priority,
        "difficulty": difficulty,
        "suggested_severity": severity,
        "assigned_team": TEAMS.get(category, "Service Desk Tier 1"),
        "recommended_steps": steps_map.get(category, steps_map["Other"]),
        "user_self_help_steps": user_self_help_steps,
        "confidence": 55,
        "summary": (title.strip() or content.strip())[:200],
    }


def classify_ticket(
    title: str,
    content: str,
    user_priority: int = 3,
) -> ClassificationResult:
    """
    Main entry point. Tries Gemini first (with timeout + retries), falls
    back to rule-based. user_priority (1-5) is passed to both paths as a
    classification hint.

    Option A: user_self_help_steps is populated whenever difficulty is Easy,
    regardless of priority. Even a P1 Easy ticket benefits from a quick
    self-service step while the engineer is being paged. Medium and Hard
    tickets never get self-help -- too complex for the user to attempt.
    """
    ai_result = _call_gemini(title, content, user_priority)
    data = ai_result if ai_result else _rule_based_classify(
        title, content, user_priority
    )

    category = data.get("category") if data.get("category") in CATEGORIES else "Other"
    priority = data.get("priority") if data.get("priority") in PRIORITIES else "P3"
    difficulty = data.get("difficulty") if data.get("difficulty") in DIFFICULTIES else "Medium"

    # Option A: self-help for any Easy ticket, regardless of priority
    raw_self_help = data.get("user_self_help_steps", [])
    is_self_help_eligible = difficulty == "Easy"
    user_self_help_steps = raw_self_help[:4] if is_self_help_eligible and raw_self_help else []
    self_help_note = SELF_HELP_NOTE if user_self_help_steps else ""

    return ClassificationResult(
        category=category,
        priority=priority,
        difficulty=difficulty,
        assigned_team=data.get("assigned_team") or TEAMS.get(category, "Service Desk Tier 1"),
        suggested_severity=data.get("suggested_severity", "Medium"),
        recommended_steps=data.get("recommended_steps", [])[:6],
        user_self_help_steps=user_self_help_steps,
        self_help_note=self_help_note,
        confidence=int(data.get("confidence", 60)),
        summary=data.get("summary", "")[:500],
    )


# ============================================================
# Spam heuristic (used to route obvious junk into Flagged)
# ============================================================
def is_probable_spam(title: str, content: str) -> bool:
    """
    Lightweight, dependency-free spam filter. Not meant to be clever --
    just catches obviously junk submissions (empty-ish, mostly non-letter
    characters, or a single character repeated) so they land in the
    Flagged queue for admin review instead of the live queue.
    """
    text = f"{title} {content}".strip()
    if not text:
        return True

    letters = sum(ch.isalpha() for ch in text)
    if letters / max(len(text), 1) < 0.3:
        return True

    compact = text.lower().replace(" ", "")
    if len(compact) > 5 and len(set(compact)) <= 2:
        return True

    return False


# ============================================================
# Duplicate ticket detection
# ============================================================
# Tier 1: Gemini (semantic, best quality, needs API key + network)
# Tier 2: local sentence-embeddings (semantic, offline, no API key)
# Tier 3: keyword overlap (crude, last resort, always available)
EMBEDDING_MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_SIMILARITY_THRESHOLD = 0.72

_embedding_model = None  # lazy-loaded singleton, only loaded if actually needed


def check_duplicate(
    new_title: str,
    new_content: str,
    existing_tickets: list[dict],
) -> dict | None:
    """
    Checks if a new ticket matches any existing open ticket from the same
    user. Tries Gemini for semantic comparison first (catches things like
    "VPN not working" vs "VPN keeps dropping"). If Gemini isn't configured
    or the call fails/times out, falls back to a locally-run embedding
    model for semantic matching without any API key. If that model can't
    be loaded either, falls back to plain keyword overlap.

    existing_tickets: list of dicts with keys ticket_no, title, content
    Returns the matching ticket dict, or None if no duplicate found.
    """
    if not existing_tickets:
        return None

    if settings.GEMINI_API_KEY:
        result = _check_duplicate_gemini(new_title, new_content, existing_tickets)
        if result is not None:
            return result

    result = _check_duplicate_embeddings(new_title, new_content, existing_tickets)
    if result is not None:
        return result

    return _check_duplicate_keywords(new_title, new_content, existing_tickets)


def _check_duplicate_gemini(new_title: str, new_content: str, existing_tickets: list[dict]) -> dict | None:
    from google.genai import types

    candidates_text = "\n".join(
        f"{i + 1}. [{t['ticket_no']}] {t['title']} -- {t['content'][:200]}"
        for i, t in enumerate(existing_tickets)
    )
    prompt = (
        f"New ticket:\nTitle: {new_title}\nDescription: {new_content}\n\n"
        f"Existing open tickets from the same user:\n{candidates_text}\n\n"
        "Does the new ticket describe the SAME underlying problem as any "
        "existing ticket, even if worded differently? Respond with ONLY "
        "raw JSON, no markdown fences: "
        '{"is_duplicate": true or false, "matching_ticket_no": "<ticket_no or null>"}'
    )

    for attempt in range(GEMINI_MAX_RETRIES + 1):
        try:
            client = _get_gemini_client()
            response = client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=prompt,
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,
                ),
            )
            data = json.loads(response.text)
            if data.get("is_duplicate") and data.get("matching_ticket_no"):
                for t in existing_tickets:
                    if t["ticket_no"] == data["matching_ticket_no"]:
                        return t
            return None
        except Exception:
            if attempt < GEMINI_MAX_RETRIES:
                time.sleep(GEMINI_RETRY_BACKOFF_SECONDS * (attempt + 1))
                continue
            return None  # exhausted retries -- caller falls back to embeddings/keywords


def _get_embedding_model():
    """Lazy-loads the local sentence-embedding model on first use only."""
    global _embedding_model
    if _embedding_model is None:
        from sentence_transformers import SentenceTransformer
        _embedding_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    return _embedding_model


def _check_duplicate_embeddings(
    new_title: str, new_content: str, existing_tickets: list[dict]
) -> dict | None:
    """
    Semantic duplicate check that runs fully offline -- no API key, no
    network call. Encodes ticket text into vectors and compares cosine
    similarity. Returns None (falls through to keyword check) if the
    embedding library/model isn't available for any reason.
    """
    try:
        from sentence_transformers import util

        model = _get_embedding_model()

        new_text = f"{new_title} {new_content}"
        new_embedding = model.encode(new_text, convert_to_tensor=True)

        best_match = None
        best_score = 0.0
        for t in existing_tickets:
            existing_text = f"{t['title']} {t['content']}"
            existing_embedding = model.encode(existing_text, convert_to_tensor=True)
            score = util.cos_sim(new_embedding, existing_embedding).item()
            if score > best_score:
                best_score = score
                best_match = t

        if best_match is not None and best_score >= EMBEDDING_SIMILARITY_THRESHOLD:
            return best_match
        return None
    except Exception:
        return None  # library missing / model failed to load -- fall back to keywords


def _check_duplicate_keywords(
    new_title: str, new_content: str, existing_tickets: list[dict], threshold: float = 0.4
) -> dict | None:
    """Deterministic fallback: 40%+ keyword overlap = likely duplicate."""
    stop = {"the", "a", "an", "is", "are", "to", "of", "and", "or", "my",
            "in", "on", "for", "with", "i", "it", "this", "that", "not"}

    def keywords(text: str) -> set[str]:
        return {w for w in text.lower().split() if w not in stop and len(w) > 2}

    new_words = keywords(f"{new_title} {new_content}")
    if not new_words:
        return None

    for t in existing_tickets:
        existing_words = keywords(f"{t['title']} {t['content']}")
        if not existing_words:
            continue
        overlap = len(new_words & existing_words) / max(len(new_words), len(existing_words))
        if overlap >= threshold:
            return t

    return None


# ============================================================
# SLA / time-budget engine
# ============================================================
DIFFICULTY_BASE_MINUTES = {
    "Easy": 60,
    "Medium": 240,
    "Hard": 1440,
}

PRIORITY_MULTIPLIER = {
    "P1": 0.4,
    "P2": 0.7,
    "P3": 1.0,
    "P4": 1.5,
}

MIN_SLA_MINUTES = 15


def compute_sla(priority: str, difficulty: str, created_on: datetime) -> dict:
    """
    Returns the SLA time budget for a ticket: how many minutes it should
    take, and the deadline timestamp derived from when it was filed.
    """
    base = DIFFICULTY_BASE_MINUTES.get(difficulty, DIFFICULTY_BASE_MINUTES["Medium"])
    mult = PRIORITY_MULTIPLIER.get(priority, 1.0)
    sla_minutes = max(MIN_SLA_MINUTES, round(base * mult))
    due_by = created_on + timedelta(minutes=sla_minutes)
    return {"sla_minutes": sla_minutes, "due_by": due_by}


def sla_status(status: str, due_by: datetime | None, closed_on: datetime | None) -> str:
    """
    Human-readable SLA status used by the frontend to flag tickets that
    need attention before they breach their time budget.
    """
    if not due_by:
        return "Unscheduled"

    if status in ("Resolved", "Closed"):
        reference = closed_on or datetime.utcnow()
        return "Met" if reference <= due_by else "Breached"

    now = datetime.utcnow()
    if now > due_by:
        return "Overdue"

    remaining_seconds = (due_by - now).total_seconds()
    return "At Risk" if remaining_seconds < 900 else "On Track"