from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

# ---------- Auth / Users ----------

class UserRegister(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(..., min_length=6)
    customer: str = Field(..., description="Company / department name, used on tickets")


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: str
    customer: str | None = None
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Tickets ----------

class TicketCreate(BaseModel):
    """What a normal user submits when filing a new ticket."""
    title: str = Field(..., min_length=4, max_length=255)
    content: str = Field(..., min_length=10, description="Detailed description of the issue")
    technology_app_item: str = Field(..., description="e.g. VPN, Outlook, Laptop, ERP System")


class TicketUpdateAdmin(BaseModel):
    """Fields an admin/engineer is allowed to change."""
    status: str | None = None
    severity: str | None = None
    assigned_engineer: str | None = None
    category: str | None = None
    priority: str | None = None
    difficulty: str | None = None
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
    age: int
    customer: str
    created_on: datetime
    ticket_start_date: datetime | None = None
    ticket_closed_date: datetime | None = None
    technology_app_item: str
    severity: str
    assigned_engineer: str | None = None
    closed_ticket: str | None = None

    category: str | None = None
    priority: str | None = None
    difficulty: str | None = None
    assigned_team: str | None = None
    ai_recommended_steps: list[str] | None = None
    ai_confidence: int | None = None
    ai_summary: str | None = None

    sla_minutes: int | None = None
    due_by: datetime | None = None
    sla_status: str | None = None


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
    customer: str
    author: str
    age: int
    created_on: datetime
    due_by: datetime | None = None
    sla_status: str | None = None


class TicketTrackOut(BaseModel):
    """Public 'check my ticket status' response -- intentionally minimal."""
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


# ---------- Dashboard ----------

class DashboardStats(BaseModel):
    total_tickets: int
    open_tickets: int
    in_progress_tickets: int
    closed_tickets: int
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
    sla_compliance_rate: float | None = None  # % of resolved tickets that met SLA
