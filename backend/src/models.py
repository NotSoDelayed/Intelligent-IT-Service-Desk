import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON

from database import Base


def gen_ticket_no() -> str:
    """Public-facing ticket id, e.g. TCK-20260701-AB12CD."""
    return f"TCK-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"


class TicketStatus(str, enum.Enum):
    open = "Open"
    in_progress = "In Progress"
    pending_user = "Pending User"
    resolved = "Resolved"
    closed = "Closed"
    flagged = "Flagged"


class Severity(str, enum.Enum):
    low = "Low"
    medium = "Medium"
    high = "High"
    urgent = "Urgent"


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)

    # --- required dataset columns ---
    ticket_no = Column(String(40), unique=True, index=True, default=gen_ticket_no, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(Enum(TicketStatus), default=TicketStatus.open, nullable=False)
    author = Column(String(150), nullable=False)
    author_username = Column(String(150), nullable=False)
    created_on = Column(DateTime, default=datetime.utcnow, nullable=False)
    ticket_start_date = Column(DateTime, nullable=True)
    ticket_closed_date = Column(DateTime, nullable=True)
    severity = Column(Enum(Severity), nullable=False)
    assigned_engineer = Column(String(150), nullable=True)
    closed_ticket = Column(String(150), nullable=True)

    # --- user input ---
    user_priority = Column(Integer, nullable=True)

    # --- AI-generated fields ---
    category = Column(String(100), nullable=True)
    priority = Column(String(20), nullable=True)
    difficulty = Column(String(10), nullable=True)
    assigned_team = Column(String(100), nullable=True)
    ai_recommended_steps = Column(JSON, nullable=True)
    ai_confidence = Column(Integer, nullable=True)  # numerical confidence score
    ai_confidence_level = Column(String(10), nullable=True)  # "Low" / "Medium" / "High"
    ai_confidence_reason = Column(Text, nullable=True)  # one-sentence explanation of the level above
    ai_summary = Column(Text, nullable=True)

    # --- AI self-help (populated only when P4 + Easy) ---
    user_self_help_steps = Column(JSON, nullable=True)   # steps the user can try themselves
    self_help_note = Column(Text, nullable=True)          # explanatory message shown to user

    # --- SLA time budget ---
    sla_minutes = Column(Integer, nullable=True)
    due_by = Column(DateTime, nullable=True)

    # --- Duplicate detection result ---
    duplicate_warning = Column(Text, nullable=True)  # set if a similar open ticket was found

    # --- Trend detection result ---
    trend_warning = Column(Text, nullable=True)  # set if a spike in same-category tickets was detected

    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan")
    analytics = relationship(
        "TicketAnalytics", back_populates="ticket", uselist=False, cascade="all, delete-orphan"
    )

    @property
    def age(self) -> int:
        """Age of ticket in days, computed live."""
        end = self.ticket_closed_date or datetime.utcnow()
        return max((end - self.created_on).days, 0)

    @property
    def sla_status(self) -> str:
        """On Track / At Risk / Overdue / Met / Breached."""
        from classifier import sla_status as compute_status
        resolved_at = self.analytics.resolved_at if self.analytics else None
        return compute_status(
            self.status.value, self.due_by, self.ticket_closed_date, resolved_at, self.sla_minutes
        )

    @property
    def is_self_service(self) -> bool:
        """
        True when the ticket qualifies for the self-resolve shortcut
        (/complete and /escalate): priority P4 + difficulty Easy, AND the
        AI wasn't just guessing -- if confidence was Low, the
        classification itself might be wrong, so we don't let the user
        prematurely self-close (or self-escalate) something that was
        never confidently classified as low-effort in the first place.
        The ticket still gets a real team either way (see
        background_process_ticket_creation) -- this only gates the
        self-service shortcut buttons, not team routing.
        """
        return (
            self.priority == "P4"
            and self.difficulty == "Easy"
            and self.ai_confidence_level != "Low"
        )

    @property
    def is_trending(self) -> bool:
        """True when this ticket was caught up in a same-category spike (see trend_warning)."""
        return bool(self.trend_warning)


class TicketComment(Base):
    """Activity log / notes thread on a ticket."""
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    author_name = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    is_system = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="comments")


class TicketAnalytics(Base):
    """
    One row per ticket, tracking the timestamps analytics needs:
    when it was created, when it first got a response (engineer
    assigned or first admin comment), and when it was resolved.
    """
    __tablename__ = "ticket_analytics"

    ticket_id = Column(Integer, ForeignKey("tickets.id"), primary_key=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True, nullable=False)
    first_responded_at = Column(DateTime, nullable=True)
    resolved_at = Column(DateTime, nullable=True)

    ticket = relationship("Ticket", back_populates="analytics")