import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from activity_log import log_activity
from auth import get_current_admin
from database import get_db
from models import Ticket, TicketStatus, User
from schemas import DashboardStats, TicketListOut, TicketOut

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    tickets = db.query(Ticket).all()
    total = len(tickets)

    by_severity, by_category, by_team, by_difficulty = {}, {}, {}, {}
    open_count = in_progress_count = closed_count = flagged_count = today_count = 0
    resolution_days = []
    sla_on_track = sla_at_risk = sla_overdue = sla_met = sla_breached = 0

    today = datetime.utcnow().date()

    for t in tickets:
        by_severity[t.severity.value] = by_severity.get(t.severity.value, 0) + 1
        if t.category:
            by_category[t.category] = by_category.get(t.category, 0) + 1
        if t.assigned_team:
            by_team[t.assigned_team] = by_team.get(t.assigned_team, 0) + 1
        if t.difficulty:
            by_difficulty[t.difficulty] = by_difficulty.get(t.difficulty, 0) + 1

        if t.status == TicketStatus.open:
            open_count += 1
        elif t.status == TicketStatus.in_progress:
            in_progress_count += 1
        elif t.status == TicketStatus.closed:
            closed_count += 1
            if t.ticket_closed_date:
                resolution_days.append(
                    (t.ticket_closed_date - t.created_on).total_seconds() / 86400
                )
        elif t.status == TicketStatus.flagged:
            flagged_count += 1

        if t.created_on.date() == today:
            today_count += 1

        sla_label = t.sla_status
        if sla_label == "On Track":
            sla_on_track += 1
        elif sla_label == "At Risk":
            sla_at_risk += 1
        elif sla_label == "Overdue":
            sla_overdue += 1
        elif sla_label == "Met":
            sla_met += 1
        elif sla_label == "Breached":
            sla_breached += 1

    avg_resolution = (
        round(sum(resolution_days) / len(resolution_days), 2) if resolution_days else None
    )
    finished = sla_met + sla_breached
    sla_compliance_rate = round((sla_met / finished) * 100, 1) if finished else None

    return DashboardStats(
        total_tickets=total,
        open_tickets=open_count,
        in_progress_tickets=in_progress_count,
        closed_tickets=closed_count,
        flagged_tickets=flagged_count,
        by_severity=by_severity,
        by_category=by_category,
        by_team=by_team,
        by_difficulty=by_difficulty,
        avg_resolution_days=avg_resolution,
        tickets_today=today_count,
        sla_on_track=sla_on_track,
        sla_at_risk=sla_at_risk,
        sla_overdue=sla_overdue,
        sla_met=sla_met,
        sla_breached=sla_breached,
        sla_compliance_rate=sla_compliance_rate,
    )


# ------------------------------------------------------------------
# GET /admin/tickets/flagged  -- ADMIN only
# Tickets held back from the live queue (likely duplicates or spam)
# pending manual review.
# ------------------------------------------------------------------
@router.get("/tickets/flagged", response_model=list[TicketListOut])
def list_flagged_tickets(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    return (
        db.query(Ticket)
        .filter(Ticket.status == TicketStatus.flagged)
        .order_by(Ticket.created_on.desc())
        .all()
    )


# ------------------------------------------------------------------
# POST /admin/tickets/{ticket_no}/approve  -- ADMIN only
# Moves a Flagged ticket back into the live queue as Open.
# ------------------------------------------------------------------
@router.post("/tickets/{ticket_no}/approve", response_model=TicketOut)
def approve_flagged_ticket(
    ticket_no: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    if ticket.status != TicketStatus.flagged:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ticket is not currently flagged")

    ticket.status = TicketStatus.open
    log_activity(
        db, ticket, "Admin",
        "Ticket approved after review and moved back into the live queue.",
    )
    db.commit()
    db.refresh(ticket)
    return ticket


@router.get("/tickets/export")
def export_tickets_csv(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """
    Export all tickets as a downloadable CSV file.
    Columns match the required dataset schema:
    Ticket No., Title, Content, Status, Author, Author Username, Age,
    Created On, Ticket Start Date, Ticket Closed Date, Severity,
    Assigned Engineer, Closed Ticket, plus AI-generated fields
    (Category, Priority, Difficulty, Assigned Team).
    """
    tickets = db.query(Ticket).order_by(Ticket.created_on.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)

    # header row -- matches your dataset column schema
    writer.writerow([
        "Ticket No.",
        "Title",
        "Content",
        "Status",
        "Author",
        "Author Username",
        "Age",
        "Created On",
        "Ticket Start Date",
        "Ticket Closed Date",
        "Severity",
        "Assigned Engineer",
        "Closed Ticket",
        "Category",
        "Priority",
        "Difficulty",
        "Assigned Team",
        "SLA Minutes",
        "Due By",
        "SLA Status",
    ])

    def fmt(dt) -> str:
        """Format datetime to readable string, empty string if None."""
        return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""

    for t in tickets:
        writer.writerow([
            t.ticket_no,
            t.title,
            t.content,
            t.status.value,
            t.author,
            t.author_username,
            t.age,
            fmt(t.created_on),
            fmt(t.ticket_start_date),
            fmt(t.ticket_closed_date),
            t.severity.value,
            t.assigned_engineer or "",
            t.closed_ticket or "",
            t.category or "",
            t.priority or "",
            t.difficulty or "",
            t.assigned_team or "",
            t.sla_minutes or "",
            fmt(t.due_by),
            t.sla_status,
        ])

    output.seek(0)
    filename = f"tickets_export_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )