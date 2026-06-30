from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from activity_log import log_activity
from auth import get_current_user
from classifier import classify_ticket, compute_sla
from database import get_db
from models import Severity, Ticket, TicketComment, TicketStatus, User, UserRole
from schemas import (
    CommentCreate,
    CommentOut,
    TicketCreate,
    TicketListOut,
    TicketOut,
    TicketTrackOut,
)

router = APIRouter(prefix="/tickets", tags=["Tickets - User"])


@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    A normal user submits a new ticket. The AI classifier runs immediately
    so the ticket is born with category/priority/team/recommended steps
    already populated -- no manual triage needed.
    """
    result = classify_ticket(payload.title, payload.content, payload.technology_app_item)
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
    log_activity(db, ticket, "AI System",
                 f"Ticket auto-classified as {result.category} / {result.priority} / {result.difficulty} difficulty, "
                 f"routed to {result.assigned_team}. Target resolution: {hours}h by {sla['due_by'].strftime('%b %d, %H:%M UTC')} "
                 f"(confidence {result.confidence}%).")
    db.commit()

    return ticket


@router.get("/my", response_model=list[TicketListOut])
def list_my_tickets(
    status_filter: str | None = Query(None, alias="status"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket).filter(Ticket.author_id == current_user.id)
    if status_filter:
        q = q.filter(Ticket.status == status_filter)
    return q.order_by(Ticket.created_on.desc()).all()


@router.get("/track/{ticket_no}", response_model=TicketTrackOut)
def track_ticket(ticket_no: str, db: Session = Depends(get_db)):
    """
    Public-style lookup: any logged-in user can check progress with just
    the ticket number they were given on submission (no need to be the
    owner -- mirrors a real 'track my ticket' flow). Minimal fields only.
    """
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No ticket found with that ticket number")
    return ticket


@router.get("/{ticket_no}", response_model=TicketOut)
def get_ticket_detail(
    ticket_no: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    if current_user.role != UserRole.admin and ticket.author_id != current_user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You don't have access to this ticket")
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
        ticket_id=ticket.id, author_name=current_user.full_name,
        message=payload.message, is_system=0,
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
    return db.query(TicketComment).filter(TicketComment.ticket_id == ticket.id)\
        .order_by(TicketComment.created_at.asc()).all()
