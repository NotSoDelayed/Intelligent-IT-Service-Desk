import enum
import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON

from database import Base


def gen_ticket_no() -> str:
    """Public-facing ticket id users use to track status, e.g. TCK-2026-00001-AB12."""
    return f"TCK-{datetime.utcnow().strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"


class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"


class TicketStatus(str, enum.Enum):
    open = "Open"
    in_progress = "In Progress"
    pending_user = "Pending User"
    resolved = "Resolved"
    closed = "Closed"


class Severity(str, enum.Enum):
    low = "Low"
    medium = "Medium"
    high = "High"
    urgent = "Urgent"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(150), nullable=False)
    email = Column(String(150), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), default=UserRole.user, nullable=False)
    customer = Column(String(150), nullable=True)  # company/department, used for ticket "Customer" field
    is_active = Column(Integer, default=1)  # 1/0 instead of Boolean for sqlite simplicity
    created_at = Column(DateTime, default=datetime.utcnow)

    tickets = relationship("Ticket", back_populates="owner", foreign_keys="Ticket.author_id")


class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)

    # --- required dataset columns ---
    ticket_no = Column(String(40), unique=True, index=True, default=gen_ticket_no, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=False)
    status = Column(Enum(TicketStatus), default=TicketStatus.open, nullable=False)
    author = Column(String(150), nullable=False)            # display name snapshot at creation time
    customer = Column(String(150), nullable=False)           # company/department
    created_on = Column(DateTime, default=datetime.utcnow, nullable=False)
    ticket_start_date = Column(DateTime, nullable=True)       # set when an engineer starts work
    ticket_closed_date = Column(DateTime, nullable=True)      # set when status -> Closed
    technology_app_item = Column(String(150), nullable=False)
    severity = Column(Enum(Severity), nullable=False)
    assigned_engineer = Column(String(150), nullable=True)
    closed_ticket = Column(String(150), nullable=True)        # name of person who closed it

    # --- system / relational fields ---
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # --- AI-generated fields (filled by classifier.py) ---
    category = Column(String(100), nullable=True)             # e.g. Network, Hardware, Software, Access
    priority = Column(String(20), nullable=True)               # P1-P4
    difficulty = Column(String(10), nullable=True)             # Easy / Medium / Hard
    assigned_team = Column(String(100), nullable=True)         # routing target
    ai_recommended_steps = Column(JSON, nullable=True)         # list[str]
    ai_confidence = Column(Integer, nullable=True)             # 0-100
    ai_summary = Column(Text, nullable=True)

    # --- SLA time budget (derived from priority + difficulty at classification time) ---
    sla_minutes = Column(Integer, nullable=True)                # target minutes to resolve
    due_by = Column(DateTime, nullable=True)                    # created_on + sla_minutes

    owner = relationship("User", back_populates="tickets", foreign_keys=[author_id])
    comments = relationship("TicketComment", back_populates="ticket", cascade="all, delete-orphan")

    @property
    def age(self) -> int:
        """Age of ticket in days, computed live (matches dataset's 'Age' column)."""
        end = self.ticket_closed_date or datetime.utcnow()
        return max((end - self.created_on).days, 0)

    @property
    def sla_status(self) -> str:
        """On Track / At Risk / Overdue / Met / Breached -- see classifier.sla_status()."""
        from classifier import sla_status as compute_status
        return compute_status(self.status.value, self.due_by, self.ticket_closed_date)


class TicketComment(Base):
    """Activity log / notes thread on a ticket (admin updates, AI notes, status changes)."""
    __tablename__ = "ticket_comments"

    id = Column(Integer, primary_key=True, index=True)
    ticket_id = Column(Integer, ForeignKey("tickets.id"), nullable=False)
    author_name = Column(String(150), nullable=False)
    message = Column(Text, nullable=False)
    is_system = Column(Integer, default=0)  # 1 if auto-generated (status change, AI run, etc.)
    created_at = Column(DateTime, default=datetime.utcnow)

    ticket = relationship("Ticket", back_populates="comments")
