import json
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
import re

from config import settings

CATEGORIES = ["Network", "Hardware", "Software", "Access/Account", "Email", "Security", "Other"]
TEAMS = {
    "Network": "Network Team",
    "Hardware": "Hardware Team",
    "Software": "Software Team",
    "Access/Account": "Access & Security Team",
    "Security": "Access & Security Team",
    "Email": "General Team",
    "Other": "General Team",
}
# Note: "System Team" isn't produced by the classifier on purpose -- it's
# reserved for admins to manually assign via TicketUpdateAdmin.assigned_team
# when a ticket is really an infra/systems issue regardless of AI category.
PRIORITIES = ["P1", "P2", "P3", "P4"]
DIFFICULTIES = ["Easy", "Medium", "Hard"]

SELF_HELP_NOTE = (
    "Your ticket has been received and an engineer will look into it. "
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
    confidence_level: str = "Medium"
    confidence_reason: str = ""
    summary: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


# ============================================================
# Trend-aware classification
# ============================================================
# If a spike of same-category tickets comes in within a short window,
# that's a signal an individual ticket's classifier can never see on its
# own (it only reads one ticket at a time) -- e.g. 10 separate "VPN"
# tickets in an hour almost certainly means an outage, not 10 unrelated
# problems. The router counts recent same-category tickets and passes
# that count in here; this function decides whether to escalate.
TREND_WINDOW_HOURS = 24
TREND_THRESHOLD = 3  # this many same-category tickets in the window triggers a bump

# Priority order from least to most urgent -- a bump moves one step
# toward the front (more urgent), capped at P1.
_PRIORITY_ORDER = ["P4", "P3", "P2", "P1"]
_PRIORITY_TO_SEVERITY = {"P1": "Urgent", "P2": "High", "P3": "Medium", "P4": "Low"}


def apply_trend_bump(priority: str, severity: str, category: str, similar_count: int) -> dict:
    """
    Given a ticket's already-decided priority/severity and how many other
    same-category tickets showed up in the last TREND_WINDOW_HOURS,
    returns the (possibly bumped) priority/severity plus a human-readable
    trend_warning, or trend_warning=None if nothing unusual is happening.
    """
    if similar_count < TREND_THRESHOLD:
        return {"priority": priority, "severity": severity, "trend_warning": None}

    if priority in _PRIORITY_ORDER:
        idx = _PRIORITY_ORDER.index(priority)
        bumped_priority = _PRIORITY_ORDER[min(idx + 1, len(_PRIORITY_ORDER) - 1)]
    else:
        bumped_priority = priority

    bumped_severity = _PRIORITY_TO_SEVERITY.get(bumped_priority, severity)
    was_bumped = bumped_priority != priority

    trend_warning = (
        f"Possible outage pattern: {similar_count} similar {category} tickets were filed "
        f"in the last {TREND_WINDOW_HOURS}h."
    )
    if was_bumped:
        trend_warning += f" Priority raised from {priority} to {bumped_priority} as a precaution."

    return {
        "priority": bumped_priority,
        "severity": bumped_severity,
        "trend_warning": trend_warning,
    }


def confidence_bucket(score: int) -> str:
    """Converts a raw 0-100 confidence score into Low/Medium/High."""
    if score >= 75:
        return "High"
    if score >= 45:
        return "Medium"
    return "Low"


SYSTEM_PROMPT = """You are an IT service desk triage assistant. Given a support \
ticket's title, description, and the user's self-reported urgency (1=low, \
5=critical), classify the ticket so the desk can route and schedule it \
correctly.

The user urgency rating is ONE input -- use your judgment. If the description \
doesn't match the rating (e.g. user says 5 but issue is trivial, or user says 1 \
but team is down), override it based on the actual content.

Watch for descriptions that are exaggerated, sarcastic, or physically implausible \
(e.g. a laptop "catching fire and exploding" combined with jokes, laughter, or \
demands like "pay me" / "before I sue you") -- these read as trolling, not a \
genuine report, even if they contain a real technical keyword like "laptop" or \
"VPN". Don't let a single matched keyword override obviously non-genuine \
framing. When a ticket looks like this, keep priority no higher than P3, cap \
confidence at Low, and say why in confidence_reason (e.g. "the description \
contains exaggerated/implausible claims that don't read as a genuine report").

Respond with ONLY a raw JSON object (no markdown fences, no preamble) with this \
exact shape:
{
  "category": one of ["Network", "Hardware", "Software", "Access/Account", "Email", "Security", "Other"],
  "priority": one of ["P1", "P2", "P3", "P4"]  (P1 = critical/business-stopping, P4 = low/cosmetic),
  "difficulty": one of ["Easy", "Medium", "Hard"] -- how much hands-on engineer effort this takes. \
Easy = single quick action (~minutes). Medium = routine investigation (~1 hour). \
Hard = deep troubleshooting, vendor escalation, or hardware replacement (~half a day or more).,
  "suggested_severity": one of ["Low", "Medium", "High", "Urgent"],
  "recommended_steps": array of 3-5 concrete troubleshooting steps for the ENGINEER, fastest fix first,
  "user_self_help_steps": array of 2-4 simple steps the USER can try themselves while waiting \
(populate this whenever difficulty is Easy, regardless of priority -- even urgent Easy tickets \
benefit from a quick self-service first step. Return empty array [] only if difficulty is \
Medium or Hard),
  "confidence": one of ["Low", "Medium", "High"] -- how confident you are in this \
classification given the information available. Judge this yourself directly -- \
don't return a number.,
  "confidence_reason": one short sentence explaining WHY you gave that confidence level -- \
e.g. what made the ticket clear or ambiguous. Write it for a non-technical reader.,
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


# Self-Diagnosis steps for the rule-based fallback, keyed by category.
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

    # Self-Diagnosis for any Easy ticket regardless of priority
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

    # Confidence varies with what was actually matched, instead of a flat
    # guess -- a clean keyword hit + enough detail earns more trust than a
    # ticket that fell through to defaults on every signal.
    matched_category = category != "Other"
    matched_urgency = any(w in text for w in urgent_words + high_words)
    has_detail = len(content.strip()) >= 40

    score = 35
    reason_bits = []
    if matched_category:
        score += 25
        reason_bits.append(f"clear keywords pointed to the {category} category")
    else:
        reason_bits.append("no strong category keywords were found, so this defaulted to Other")
    if matched_urgency:
        score += 15
        reason_bits.append("urgency/impact language was present")
    if has_detail:
        score += 10
        reason_bits.append("the description had enough detail to work with")
    else:
        reason_bits.append("the description was quite short on detail")
    score = min(score, 90)  # rule-based fallback never claims full certainty

    reason = "Rule-based fallback (no AI model used): " + "; ".join(reason_bits) + "."

    return {
        "category": category,
        "priority": priority,
        "difficulty": difficulty,
        "suggested_severity": severity,
        "assigned_team": TEAMS.get(category, "General Team"),
        "recommended_steps": steps_map.get(category, steps_map["Other"]),
        "user_self_help_steps": user_self_help_steps,
        "confidence": score,
        "confidence_reason": reason,
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
    tickets never get Self-Diagnosis -- too complex for the user to attempt.
    """
    ai_result = _call_gemini(title, content, user_priority)
    data = ai_result if ai_result else _rule_based_classify(
        title, content, user_priority
    )

    category = data.get("category") if data.get("category") in CATEGORIES else "Other"
    priority = data.get("priority") if data.get("priority") in PRIORITIES else "P3"
    difficulty = data.get("difficulty") if data.get("difficulty") in DIFFICULTIES else "Medium"

    # Self-Diagnosis for any Easy ticket, regardless of priority
    raw_self_help = data.get("user_self_help_steps", [])
    is_self_help_eligible = difficulty == "Easy"
    user_self_help_steps = raw_self_help[:4] if is_self_help_eligible and raw_self_help else []
    self_help_note = SELF_HELP_NOTE if user_self_help_steps else ""

    raw_confidence_field = data.get("confidence")

    if isinstance(raw_confidence_field, str) and raw_confidence_field.strip().title() in (
        "Low", "Medium", "High"
    ):
        # AI path: Gemini judged its own confidence directly, same as it does
        # for priority/category -- no numeric threshold of ours involved.
        level = raw_confidence_field.strip().title()
        raw_confidence = {"Low": 30, "Medium": 60, "High": 90}[level]  # kept for internal reference only
    else:
        # Rule-based fallback path (or a model that still returned a number
        # despite instructions): this number comes from OUR OWN transparent,
        # fully-explainable point system in _rule_based_classify -- bucketing
        # it isn't reinterpreting a black-box AI judgment, it's just labeling
        # our own deterministic score.
        raw_confidence = int(raw_confidence_field) if raw_confidence_field is not None else 60
        level = confidence_bucket(raw_confidence)

    reason = data.get("confidence_reason") or (
        "The AI reported this confidence level based on how clear and specific "
        "the ticket description was."
    )

    return ClassificationResult(
        category=category,
        priority=priority,
        difficulty=difficulty,
        # Team is ALWAYS derived deterministically from category -- never
        # taken from the AI's free text. The prompt no longer even asks for
        # a team name (see SYSTEM_PROMPT above); this is the fix for the
        # "assigned_team": "Helpdesk" bug, where the AI invented a team name
        # that didn't match any of the 6 real engineer-login teams.
        assigned_team=TEAMS.get(category, "General Team"),
        suggested_severity=data.get("suggested_severity", "Medium"),
        recommended_steps=data.get("recommended_steps", [])[:6],
        user_self_help_steps=user_self_help_steps,
        self_help_note=self_help_note,
        confidence=raw_confidence,
        confidence_level=level,
        confidence_reason=reason,
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

    # --- Additional lightweight gibberish heuristics ---
    # 1) If many tokens look non-wordlike (no vowels or extremely short),
    #    treat as probable spam.
    words = re.findall(r"[a-z]+", text.lower())
    if words:
        vowels = set("aeiou")
        non_wordlike = 0
        short_words = 0
        bigram_matches = 0
        total_bigrams = 0

        COMMON_BIGRAMS = {
            "th",
            "he",
            "in",
            "er",
            "an",
            "re",
            "on",
            "at",
            "en",
            "nd",
            "ti",
            "es",
            "or",
            "te",
            "of",
            "ed",
        }

        for w in words:
            if len(w) <= 2:
                short_words += 1
            if not any(ch in vowels for ch in w):
                non_wordlike += 1

            # bigram signal: real English words tend to contain common digrams
            if len(w) >= 2:
                for i in range(len(w) - 1):
                    total_bigrams += 1
                    if w[i : i + 2] in COMMON_BIGRAMS:
                        bigram_matches += 1

        word_count = len(words)
        non_wordlike_ratio = non_wordlike / word_count
        short_word_ratio = short_words / word_count
        bigram_ratio = (bigram_matches / total_bigrams) if total_bigrams else 0.0

        # Heuristic thresholds tuned to avoid false positives on short-but-real
        # text while catching common keyboard-gibberish and random-letter spam.
        if non_wordlike_ratio > 0.6:
            return True
        if short_word_ratio > 0.6 and word_count > 3:
            return True
        if bigram_ratio < 0.25 and word_count >= 4:
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
    "Easy": 90,
    "Medium": 240,
    "Hard": 960,
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


def sla_status(
    status: str,
    due_by: datetime | None,
    closed_on: datetime | None,
    resolved_at: datetime | None = None,
    sla_minutes: int | None = None,
) -> str:
    """
    Human-readable SLA status used by the frontend to flag tickets that
    need attention before they breach their time budget.

    Resolved and Closed are judged against the moment work actually
    finished (resolved_at / closed_on respectively) -- not against
    "right now" -- so a ticket resolved comfortably within SLA doesn't
    silently drift into "Breached" just because an admin hasn't gotten
    around to formally closing it yet.
    """
    if not due_by:
        return "Unscheduled"

    if status == "Closed":
        reference = closed_on or datetime.utcnow()
        return "Met" if reference <= due_by else "Breached"

    if status == "Resolved":
        reference = resolved_at or datetime.utcnow()
        return "Met" if reference <= due_by else "Breached"

    now = datetime.utcnow()
    if now > due_by:
        return "Overdue"

    remaining_seconds = (due_by - now).total_seconds()
    # Scale the warning window to the ticket's own budget -- a flat 15
    # minutes is meaningless on a 36h SLA but reasonable on a 24min one.
    at_risk_window_seconds = max(900, (sla_minutes or 0) * 60 * 0.1)
    return "At Risk" if remaining_seconds < at_risk_window_seconds else "On Track"