from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from activity_log import log_activity
from auth import get_current_admin
from classifier import classify_ticket, compute_sla
from database import get_db
from models import Severity, Ticket, TicketStatus, User
from schemas import DashboardStats, TicketListOut, TicketOut, TicketUpdateAdmin

router = APIRouter(prefix="/admin", tags=["Tickets - Admin"])


@router.get("/tickets", response_model=list[TicketListOut])
def list_all_tickets(
    status_filter: str | None = Query(None, alias="status"),
    severity_filter: str | None = Query(None, alias="severity"),
    category_filter: str | None = Query(None, alias="category"),
    assigned_team: str | None = None,
    sort: str = Query("queue", description="'queue' (SLA deadline order, default) or 'newest'"),
    search: str | None = Query(None, description="Search by title or ticket no."),
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket)
    if status_filter:
        q = q.filter(Ticket.status == status_filter)
    if severity_filter:
        q = q.filter(Ticket.severity == severity_filter)
    if category_filter:
        q = q.filter(Ticket.category == category_filter)
    if assigned_team:
        q = q.filter(Ticket.assigned_team == assigned_team)
    if search:
        like = f"%{search}%"
        q = q.filter((Ticket.title.ilike(like)) | (Ticket.ticket_no.ilike(like)))

    if sort == "newest":
        q = q.order_by(Ticket.created_on.desc())
    else:
        q = q.order_by(Ticket.due_by.asc().nullslast())

    return q.all()


@router.patch("/tickets/{ticket_no}", response_model=TicketOut)
def update_ticket(
    ticket_no: str,
    payload: TicketUpdateAdmin,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Admin/engineer updates status, severity, assignment, or AI fields manually."""
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    changes = []

    if payload.status and payload.status != ticket.status.value:
        old = ticket.status.value
        ticket.status = TicketStatus(payload.status)
        if ticket.status == TicketStatus.in_progress and not ticket.ticket_start_date:
            ticket.ticket_start_date = datetime.utcnow()
        if ticket.status == TicketStatus.closed:
            ticket.ticket_closed_date = datetime.utcnow()
            ticket.closed_ticket = current_admin.full_name
        changes.append(f"status: {old} -> {ticket.status.value}")

    if payload.severity and payload.severity != ticket.severity.value:
        old = ticket.severity.value
        ticket.severity = Severity(payload.severity)
        changes.append(f"severity: {old} -> {ticket.severity.value}")

    if payload.assigned_engineer and payload.assigned_engineer != ticket.assigned_engineer:
        ticket.assigned_engineer = payload.assigned_engineer
        changes.append(f"assigned engineer: {ticket.assigned_engineer}")

    if payload.category:
        ticket.category = payload.category
        changes.append(f"category: {ticket.category}")

    if payload.priority:
        ticket.priority = payload.priority
        changes.append(f"priority: {ticket.priority}")

    if payload.difficulty:
        ticket.difficulty = payload.difficulty
        changes.append(f"difficulty: {ticket.difficulty}")

    if payload.priority or payload.difficulty:
        sla = compute_sla(ticket.priority, ticket.difficulty or "Medium", ticket.created_on)
        ticket.sla_minutes = sla["sla_minutes"]
        ticket.due_by = sla["due_by"]
        changes.append(f"SLA recalculated: {round(sla['sla_minutes']/60, 1)}h by {sla['due_by'].strftime('%b %d, %H:%M UTC')}")

    if payload.assigned_team:
        ticket.assigned_team = payload.assigned_team
        changes.append(f"team: {ticket.assigned_team}")

    if changes:
        log_activity(db, ticket, current_admin.full_name, "Updated " + "; ".join(changes))

    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/tickets/{ticket_no}/analyze", response_model=TicketOut)
def reanalyze_ticket(
    ticket_no: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    """Manually re-trigger the AI classifier on a ticket (e.g. after content was clarified)."""
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    result = classify_ticket(ticket.title, ticket.content, ticket.technology_app_item)
    sla = compute_sla(result.priority, result.difficulty, ticket.created_on)

    ticket.category = result.category
    ticket.priority = result.priority
    ticket.difficulty = result.difficulty
    ticket.assigned_team = result.assigned_team
    ticket.ai_recommended_steps = result.recommended_steps
    ticket.ai_confidence = result.confidence
    ticket.ai_summary = result.summary
    ticket.sla_minutes = sla["sla_minutes"]
    ticket.due_by = sla["due_by"]

    hours = round(sla["sla_minutes"] / 60, 1)
    log_activity(db, ticket, "AI System",
                 f"Re-analyzed: {result.category} / {result.priority} / {result.difficulty} difficulty, "
                 f"routed to {result.assigned_team}. Target resolution: {hours}h by {sla['due_by'].strftime('%b %d, %H:%M UTC')} "
                 f"(confidence {result.confidence}%).")
    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/tickets/{ticket_no}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(
    ticket_no: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    db.delete(ticket)
    db.commit()


@router.get("/dashboard", response_model=DashboardStats)
def dashboard_stats(
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    tickets = db.query(Ticket).all()
    total = len(tickets)

    by_severity, by_category, by_team, by_difficulty = {}, {}, {}, {}
    open_count = in_progress_count = closed_count = today_count = 0
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
                resolution_days.append((t.ticket_closed_date - t.created_on).total_seconds() / 86400)

        if t.created_on.date() == today:
            today_count += 1

        status_label = t.sla_status
        if status_label == "On Track":
            sla_on_track += 1
        elif status_label == "At Risk":
            sla_at_risk += 1
        elif status_label == "Overdue":
            sla_overdue += 1
        elif status_label == "Met":
            sla_met += 1
        elif status_label == "Breached":
            sla_breached += 1

    avg_resolution = round(sum(resolution_days) / len(resolution_days), 2) if resolution_days else None

    finished = sla_met + sla_breached
    sla_compliance_rate = round((sla_met / finished) * 100, 1) if finished else None

    return DashboardStats(
        total_tickets=total,
        open_tickets=open_count,
        in_progress_tickets=in_progress_count,
        closed_tickets=closed_count,
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
