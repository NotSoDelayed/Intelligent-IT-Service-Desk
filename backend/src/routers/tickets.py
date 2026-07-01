from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from activity_log import log_activity
from auth import get_current_admin, get_current_user
from classifier import classify_ticket, compute_sla
from database import get_db
from models import Severity, Ticket, TicketComment, TicketStatus, User, UserRole
from schemas import (
    CommentCreate,
    CommentOut,
    TicketCreate,
    TicketListOut,
    TicketOut,
    TicketUpdateAdmin,
)

router = APIRouter(prefix="/tickets", tags=["Tickets"])


@router.get("", response_model=list[TicketListOut])
def list_tickets(
    status_filter: str | None = Query(None, alias="status"),
    severity_filter: str | None = Query(None, alias="severity"),
    category_filter: str | None = Query(None, alias="category"),
    assigned_team: str | None = None,
    sort: str = Query("queue", description="'queue' (SLA deadline order) or 'newest'"),
    search: str | None = Query(None, description="Search by title or ticket no. (admin only)"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket)

    if current_user.role != UserRole.admin:
        q = q.filter(Ticket.author_id == current_user.id)

    if status_filter:
        q = q.filter(Ticket.status == status_filter)
    if severity_filter:
        q = q.filter(Ticket.severity == severity_filter)
    if category_filter:
        q = q.filter(Ticket.category == category_filter)
    if assigned_team:
        q = q.filter(Ticket.assigned_team == assigned_team)

    if search and current_user.role == UserRole.admin:
        like = f"%{search}%"
        q = q.filter(
            (Ticket.title.ilike(like)) | (Ticket.ticket_no.ilike(like))
        )

    if sort == "newest" or current_user.role != UserRole.admin:
        q = q.order_by(Ticket.created_on.desc())
    else:
        q = q.order_by(Ticket.due_by.asc().nullslast())

    return q.all()


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = classify_ticket(
        payload.title,
        payload.content,
        payload.technology_app_item,
        payload.user_priority,          # <-- passed to AI as urgency hint
    )
    created_on = datetime.utcnow()
    sla = compute_sla(result.priority, result.difficulty, created_on)

    ticket = Ticket(
        title=payload.title,
        content=payload.content,
        status=TicketStatus.open,
        author=current_user.full_name,
        author_id=current_user.id,
        customer=current_user.customer or "N/A",
        created_on=created_on,
        technology_app_item=payload.technology_app_item,
        user_priority=payload.user_priority,    # <-- stored on the ticket
        severity=Severity(result.suggested_severity) if result.suggested_severity in Severity._value2member_map_ else Severity.medium,
        category=result.category,
        priority=result.priority,
        difficulty=result.difficulty,
        assigned_team=result.assigned_team,
        ai_recommended_steps=result.recommended_steps,
        ai_confidence=result.confidence,
        ai_summary=result.summary,
        sla_minutes=sla["sla_minutes"],
        due_by=sla["due_by"],
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    hours = round(sla["sla_minutes"] / 60, 1)
    log_activity(
        db, ticket, "AI System",
        f"Ticket auto-classified as {result.category} / {result.priority} / "
        f"{result.difficulty} difficulty, routed to {result.assigned_team}. "
        f"User urgency: {payload.user_priority}/5. "
        f"Target resolution: {hours}h by {sla['due_by'].strftime('%b %d, %H:%M UTC')} "
        f"(confidence {result.confidence}%).",
    )
    db.commit()

    return ticket


@router.get("/{ticket_no}", response_model=TicketOut)
def get_ticket(
    ticket_no: str,
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No ticket found with that ticket number")
    return ticket


@router.patch("/{ticket_no}", response_model=TicketOut)
def update_ticket(
    ticket_no: str,
    payload: TicketUpdateAdmin,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
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
        changes.append(
            f"SLA recalculated: {round(sla['sla_minutes']/60, 1)}h "
            f"by {sla['due_by'].strftime('%b %d, %H:%M UTC')}"
        )

    if payload.assigned_team:
        ticket.assigned_team = payload.assigned_team
        changes.append(f"team: {ticket.assigned_team}")

    if changes:
        log_activity(db, ticket, current_admin.full_name, "Updated " + "; ".join(changes))

    db.commit()
    db.refresh(ticket)
    return ticket


@router.delete("/{ticket_no}", status_code=status.HTTP_204_NO_CONTENT)
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


@router.post("/{ticket_no}/analyze", response_model=TicketOut)
def reanalyze_ticket(
    ticket_no: str,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    result = classify_ticket(
        ticket.title,
        ticket.content,
        ticket.technology_app_item,
        ticket.user_priority or 3,     # <-- reuse stored user_priority on re-analysis
    )
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
    log_activity(
        db, ticket, "AI System",
        f"Re-analyzed: {result.category} / {result.priority} / {result.difficulty} difficulty, "
        f"routed to {result.assigned_team}. Target resolution: {hours}h "
        f"by {sla['due_by'].strftime('%b %d, %H:%M UTC')} (confidence {result.confidence}%).",
    )
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/{ticket_no}/comments", response_model=CommentOut)
def add_comment(
    ticket_no: str,
    payload: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    if current_user.role != UserRole.admin and ticket.author_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this ticket")

    comment = TicketComment(
        ticket_id=ticket.id,
        author_name=current_user.full_name,
        message=payload.message,
        is_system=0,
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return comment


@router.get("/{ticket_no}/comments", response_model=list[CommentOut])
def list_comments(
    ticket_no: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    if current_user.role != UserRole.admin and ticket.author_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this ticket")
    return (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket.id)
        .order_by(TicketComment.created_at.asc())
        .all()
    )