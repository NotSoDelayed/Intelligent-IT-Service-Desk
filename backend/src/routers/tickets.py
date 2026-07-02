from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from activity_log import log_activity
from auth import get_current_admin
from classifier import classify_ticket, compute_sla
from database import get_db
from models import Severity, Ticket, TicketComment, TicketStatus, User
from schemas import (
    CommentCreate,
    CommentOut,
    TicketCreate,
    TicketListOut,
    TicketOut,
    TicketPageOut,
    TicketUpdateAdmin,
)

router = APIRouter(prefix="/tickets", tags=["Tickets"])


# ------------------------------------------------------------------
# POST /tickets  -- PUBLIC, no login required
# ------------------------------------------------------------------
@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    db: Session = Depends(get_db),
):
    """
    Anyone can submit a ticket -- no account or login needed.
    AI classification and SLA calculation run automatically.
    Returns the ticket_no so the user can track progress later.
    """
    result = classify_ticket(
        payload.title,
        payload.content,
        payload.technology_app_item,
        payload.user_priority,
    )
    created_on = datetime.utcnow()
    sla = compute_sla(result.priority, result.difficulty, created_on)

    ticket = Ticket(
        title=payload.title,
        content=payload.content,
        status=TicketStatus.open,
        author=payload.name,
        author_email=payload.email,
        author_id=None,
        department=payload.department,
        created_on=created_on,
        technology_app_item=payload.technology_app_item,
        user_priority=payload.user_priority,
        severity=Severity(result.suggested_severity) if result.suggested_severity in Severity._value2member_map_ else Severity.medium,
        category=result.category,
        priority=result.priority,
        difficulty=result.difficulty,
        assigned_team=result.assigned_team,
        ai_recommended_steps=result.recommended_steps,
        ai_confidence=result.confidence,
        ai_summary=result.summary,
        user_self_help_steps=result.user_self_help_steps,
        self_help_note=result.self_help_note,
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


# ------------------------------------------------------------------
# GET /tickets  -- ADMIN only, paginated
# ?page=1&limit=20 (default: page 1, 20 per page)
# ------------------------------------------------------------------
@router.get("", response_model=TicketPageOut)
def list_tickets(
    status_filter: str | None = Query(None, alias="status"),
    severity_filter: str | None = Query(None, alias="severity"),
    category_filter: str | None = Query(None, alias="category"),
    priority_filter: str | None = Query(None, alias="priority"),
    assigned_team: str | None = None,
    sort: str = Query("queue", description="'queue' (SLA deadline order) or 'newest'"),
    search: str | None = Query(None, description="Search by title or ticket no."),
    page: int = Query(1, ge=1, description="Page number, starts at 1"),
    limit: int = Query(20, ge=1, le=100, description="Tickets per page, max 100"),
    # current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket)

    if status_filter:
        q = q.filter(Ticket.status == status_filter)
    if severity_filter:
        q = q.filter(Ticket.severity == severity_filter)
    if category_filter:
        q = q.filter(Ticket.category == category_filter)
    if priority_filter:
        q = q.filter(Ticket.priority == priority_filter)
    if assigned_team:
        q = q.filter(Ticket.assigned_team == assigned_team)
    if search:
        like = f"%{search}%"
        q = q.filter(
            (Ticket.title.ilike(like)) | (Ticket.ticket_no.ilike(like))
        )

    if sort == "newest":
        q = q.order_by(Ticket.created_on.desc())
    else:
        q = q.order_by(Ticket.due_by.asc().nullslast())

    total = q.count()
    tickets = q.offset((page - 1) * limit).limit(limit).all()
    total_pages = (total + limit - 1) // limit

    return TicketPageOut(
        tickets=tickets,
        total=total,
        page=page,
        limit=limit,
        total_pages=total_pages,
    )


# ------------------------------------------------------------------
# GET /tickets/{ticket_no}  -- PUBLIC, no login required
# ------------------------------------------------------------------
@router.get("/{ticket_no}", response_model=TicketOut)
def get_ticket(
    ticket_no: str,
    db: Session = Depends(get_db),
):
    """
    Anyone with the ticket number can check status --
    no login required. This is the track my ticket endpoint.
    """
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No ticket found with that ticket number")
    return ticket


# ------------------------------------------------------------------
# PATCH /tickets/{ticket_no}  -- ADMIN only
# ------------------------------------------------------------------
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


# ------------------------------------------------------------------
# DELETE /tickets/{ticket_no}  -- ADMIN only
# ------------------------------------------------------------------
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


# ------------------------------------------------------------------
# POST /tickets/{ticket_no}/analyze  -- ADMIN only
# ------------------------------------------------------------------
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
        ticket.user_priority or 3,
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


# ------------------------------------------------------------------
# POST/GET /tickets/{ticket_no}/comments  -- ADMIN only
# ------------------------------------------------------------------
@router.post("/{ticket_no}/comments", response_model=CommentOut)
def add_comment(
    ticket_no: str,
    payload: CommentCreate,
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    comment = TicketComment(
        ticket_id=ticket.id,
        author_name=current_admin.full_name,
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
    current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")
    return (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket.id)
        .order_by(TicketComment.created_at.asc())
        .all()
    )