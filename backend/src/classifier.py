import json
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
PRIORITIES = ["P1", "P2", "P3", "P4"]  # P1 = critical/urgent, P4 = low
DIFFICULTIES = ["Easy", "Medium", "Hard"]


@dataclass
class ClassificationResult:
    category: str
    priority: str
    difficulty: str
    assigned_team: str
    suggested_severity: str
    recommended_steps: list[str] = field(default_factory=list)
    confidence: int = 60
    summary: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


SYSTEM_PROMPT = """You are an IT service desk triage assistant. Given a support \
ticket's title, description, affected technology/app/item, and the user's \
self-reported urgency (1=low, 5=critical), classify the ticket so the desk \
can route and schedule it correctly.

The user urgency rating is ONE input -- use your judgment. If the description \
doesn't match the rating (e.g. user says 5 but issue is trivial, or user says 1 \
but team is down), override it based on the actual content.

Respond with ONLY a raw JSON object (no markdown fences, no preamble) with this \
exact shape:
{
  "category": one of ["Network", "Hardware", "Software", "Access/Account", "Email", "Security", "Other"],
  "priority": one of ["P1", "P2", "P3", "P4"]  (P1 = critical/business-stopping, P4 = low/cosmetic),
  "difficulty": one of ["Easy", "Medium", "Hard"] -- how much hands-on engineer effort/time this realistically \
takes to resolve. Easy = single quick action (reset, restart, simple config change, ~minutes). \
Medium = needs investigation/multiple steps but is routine (~an hour or so). \
Hard = needs deep troubleshooting, multiple teams, vendor escalation, or hardware replacement \
(~half a day or more).,
  "suggested_severity": one of ["Low", "Medium", "High", "Urgent"],
  "assigned_team": short team name responsible for resolving it,
  "recommended_steps": array of 3-5 short, concrete troubleshooting steps for the assigned engineer, \
ordered so the fastest, highest-likelihood fix is tried first -- the goal is to resolve easy tickets \
in the first one or two steps so the queue keeps moving,
  "confidence": integer 0-100 reflecting how confident you are in this classification,
  "summary": one or two sentence neutral summary of the actual problem
}
"""


def _call_gemini(title: str, content: str, tech_item: str, user_priority: int = 3) -> dict | None:
    if not settings.GEMINI_API_KEY:
        return None
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=settings.GEMINI_API_KEY)

        urgency_label = {
            1: "1/5 - not urgent at all",
            2: "2/5 - low urgency",
            3: "3/5 - moderate urgency",
            4: "4/5 - high urgency",
            5: "5/5 - critical, cannot work",
        }.get(user_priority, "3/5 - moderate urgency")

        user_prompt = (
            f"Title: {title}\n"
            f"Technology/App/Item: {tech_item}\n"
            f"User-reported urgency: {urgency_label}\n"
            f"Description: {content}\n\n"
            "Classify this ticket now."
        )
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
        # Any failure (no network, bad key, malformed JSON, etc.) -> fall back gracefully
        return None


def _rule_based_classify(title: str, content: str, tech_item: str, user_priority: int = 3) -> dict:
    """Deterministic keyword fallback so the platform works without an API key."""
    text = f"{title} {content} {tech_item}".lower()

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
        "confidence": 55,
        "summary": (title.strip() or content.strip())[:200],
    }


def classify_ticket(
    title: str,
    content: str,
    tech_item: str,
    user_priority: int = 3,
) -> ClassificationResult:
    """
    Main entry point. Tries Gemini first, falls back to rule-based.
    user_priority (1-5) is passed to both paths as a classification hint.
    """
    ai_result = _call_gemini(title, content, tech_item, user_priority)
    data = ai_result if ai_result else _rule_based_classify(
        title, content, tech_item, user_priority
    )

    category = data.get("category") if data.get("category") in CATEGORIES else "Other"
    priority = data.get("priority") if data.get("priority") in PRIORITIES else "P3"
    difficulty = data.get("difficulty") if data.get("difficulty") in DIFFICULTIES else "Medium"

    return ClassificationResult(
        category=category,
        priority=priority,
        difficulty=difficulty,
        assigned_team=data.get("assigned_team") or TEAMS.get(category, "Service Desk Tier 1"),
        suggested_severity=data.get("suggested_severity", "Medium"),
        recommended_steps=data.get("recommended_steps", [])[:6],
        confidence=int(data.get("confidence", 60)),
        summary=data.get("summary", "")[:500],
    )


# ============================================================
# SLA / time-budget engine
#
# Goal: clear easy tickets fast so they don't clog the queue, give medium
# tickets a fair working window, and give hard tickets the time they
# genuinely need -- while urgent priority always compresses the deadline
# regardless of difficulty.
# ============================================================
DIFFICULTY_BASE_MINUTES = {
    "Easy": 60,      # ~1 hour ceiling for a quick, single-step fix
    "Medium": 240,   # ~4 hours for routine multi-step investigation
    "Hard": 1440,    # ~24 hours for deep troubleshooting / escalation
}

PRIORITY_MULTIPLIER = {
    "P1": 0.4,   # urgent: compress the window hard
    "P2": 0.7,
    "P3": 1.0,
    "P4": 1.5,   # low priority: more slack is fine
}

MIN_SLA_MINUTES = 15  # never promise a sub-15-minute SLA


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