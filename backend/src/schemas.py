from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


# ---------- Mock Auth ----------
# No registration, no password, no token. Role/team are derived purely
# from the username string on the backend (see auth.py).

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=150)
    full_name: str = Field(..., min_length=2, max_length=150)


class LoginResponse(BaseModel):
    username: str
    full_name: str
    role: Literal["user", "admin", "engineer"]
    team: str | None = None


# ---------- Tickets ----------

class TicketCreate(BaseModel):
    """
    What a logged-in user submits when filing a new ticket. Their name
    and username are already known from login (X-Username/X-Full-Name
    headers) -- this form only needs the actual issue details.
    """
    title: str = Field(..., min_length=4, max_length=255)
    content: str = Field(..., min_length=10)
    user_priority: int = Field(default=3, ge=1, le=5)


class TicketUpdateAdmin(BaseModel):
    """Fields an admin/engineer is allowed to change."""
    status: Literal["Open", "In Progress", "Pending User", "Resolved", "Closed", "Flagged"] | None = None
    severity: Literal["Low", "Medium", "High", "Urgent"] | None = None
    assigned_engineer: str | None = None
    category: Literal[
        "Network",
        "Hardware",
        "Software",
        "Access/Account",
        "Email",
        "Security",
        "Other",
    ] | None = None
    priority: Literal["P1", "P2", "P3", "P4"] | None = None
    difficulty: Literal["Easy", "Medium", "Hard"] | None = None
    assigned_team: str | None = None


class CommentCreate(BaseModel):
    message: str = Field(..., min_length=1)


class CommentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    author_name: str
    message: str
    is_system: int
    created_at: datetime


class TicketOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    ticket_no: str
    title: str
    content: str
    status: str
    author: str
    author_username: str
    age: int
    created_on: datetime
    ticket_start_date: datetime | None = None
    ticket_closed_date: datetime | None = None
    severity: str
    assigned_engineer: str | None = None
    closed_ticket: str | None = None

    # user input
    user_priority: int | None = None

    # AI-generated
    category: str | None = None
    priority: str | None = None
    difficulty: str | None = None
    assigned_team: str | None = None
    ai_recommended_steps: list[str] | None = None
    ai_confidence: int | None = None
    ai_summary: str | None = None

    # AI self-help (only populated when difficulty is Easy)
    user_self_help_steps: list[str] | None = None
    self_help_note: str | None = None

    # True when priority is P4 and difficulty is Easy -- tells the frontend
    # this ticket is self-service and won't be routed to a team.
    is_self_service: bool = False

    # SLA
    sla_minutes: int | None = None
    due_by: datetime | None = None
    sla_status: str | None = None

    # Duplicate detection (populated if a similar open ticket already exists)
    duplicate_warning: str | None = None


class TicketListOut(BaseModel):
    """Lighter payload for table/list views."""
    model_config = ConfigDict(from_attributes=True)

    ticket_no: str
    title: str
    status: str
    severity: str
    category: str | None = None
    priority: str | None = None
    difficulty: str | None = None
    assigned_team: str | None = None
    assigned_engineer: str | None = None
    author: str
    author_username: str
    age: int
    created_on: datetime
    due_by: datetime | None = None
    sla_status: str | None = None
    user_priority: int | None = None
    is_self_service: bool = False


class TicketPageOut(BaseModel):
    """Paginated response for GET /tickets (admin queue)."""
    tickets: list[TicketListOut]
    total: int
    page: int
    limit: int
    total_pages: int


class TicketTrackOut(BaseModel):
    """Public ticket status check by ticket number."""
    ticket_no: str
    title: str
    status: str
    severity: str
    priority: str | None = None
    difficulty: str | None = None
    assigned_team: str | None = None
    created_on: datetime
    ticket_start_date: datetime | None = None
    ticket_closed_date: datetime | None = None
    due_by: datetime | None = None
    sla_status: str | None = None
    age: int
    user_priority: int | None = None

    # self-help shown on tracking page too
    user_self_help_steps: list[str] | None = None
    self_help_note: str | None = None


# ---------- Dashboard ----------

class DashboardStats(BaseModel):
    total_tickets: int
    open_tickets: int
    in_progress_tickets: int
    closed_tickets: int
    flagged_tickets: int
    by_severity: dict
    by_category: dict
    by_team: dict
    by_difficulty: dict
    avg_resolution_days: float | None = None
    tickets_today: int
    sla_on_track: int
    sla_at_risk: int
    sla_overdue: int
    sla_met: int
    sla_breached: int
    sla_compliance_rate: float | None = None


# ---------- Analytics ----------

class AnalyticsSummary(BaseModel):
    total_created: int
    total_resolved: int
    median_response_minutes: float | None
    median_resolution_minutes: float | None


class AnalyticsTrend(BaseModel):
    date: str
    created: int
    resolved: int
    median_response: float | None
    median_resolution: float | None


class AnalyticsDepartment(BaseModel):
    name: str
    count: int


class AnalyticsOut(BaseModel):
    summary: AnalyticsSummary
    trend: list[AnalyticsTrend]
    departments: list[AnalyticsDepartment]