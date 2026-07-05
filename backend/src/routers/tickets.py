from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session

from activity_log import log_activity
from classifier import check_duplicate, classify_ticket, compute_sla, is_probable_spam
from database import get_db, SessionLocal
from models import Severity, Ticket, TicketComment, TicketStatus
from schemas import (
    CommentCreate,
    CommentOut,
    TicketCreate,
    TicketOut,
    TicketPageOut,
    TicketUpdateAdmin,
)

router = APIRouter(prefix="/tickets", tags=["Tickets"])


def background_process_ticket_creation(ticket_no: str, username: str):
    with SessionLocal() as db:
        ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
        if not ticket:
            return

        result = classify_ticket(
            ticket.title,
            ticket.content,
            ticket.user_priority or 3,
        )
        sla = compute_sla(result.priority, result.difficulty, ticket.created_on)

        open_tickets = db.query(Ticket).filter(
            Ticket.author_username == username,
            Ticket.status.in_(["Open", "In Progress", "Pending User"]),
            Ticket.ticket_no != ticket_no
        ).all()

        existing_for_check = [
            {"ticket_no": t.ticket_no, "title": t.title, "content": t.content}
            for t in open_tickets
        ]

        duplicate_match = check_duplicate(ticket.title, ticket.content, existing_for_check)
        duplicate_warning = (
            f"You may already have a similar open ticket: {duplicate_match['ticket_no']}. "
            f"Please check before proceeding."
            if duplicate_match else None
        )
        spam_flagged = is_probable_spam(ticket.title, ticket.content)

        ticket.severity = Severity(result.suggested_severity) if result.suggested_severity in Severity._value2member_map_ else Severity.medium
        ticket.category = result.category
        ticket.priority = result.priority
        ticket.difficulty = result.difficulty

        # Self-service (P4 + Easy) tickets don't need to be routed to a team.
        is_self_service = result.priority == "P4" and result.difficulty == "Easy"
        ticket.assigned_team = None if is_self_service else result.assigned_team

        ticket.ai_recommended_steps = result.recommended_steps
        ticket.ai_confidence = result.confidence
        ticket.ai_summary = result.summary
        ticket.user_self_help_steps = result.user_self_help_steps
        ticket.self_help_note = result.self_help_note
        ticket.sla_minutes = sla["sla_minutes"]
        ticket.due_by = sla["due_by"]
        ticket.duplicate_warning = duplicate_warning

        # Duplicates or likely-spam submissions get held for admin review
        # instead of dropping straight into the live queue.
        if duplicate_match or spam_flagged:
            ticket.status = TicketStatus.flagged

        hours = round(sla["sla_minutes"] / 60, 1)
        log_activity(
            db, ticket, "AI System",
            f"Ticket auto-classified as {result.category} / {result.priority} / "
            f"{result.difficulty} difficulty"
            + ("" if is_self_service else f", routed to {result.assigned_team}")
            + f". User urgency: {ticket.user_priority}/5. "
            f"Target resolution: {hours}h by {sla['due_by'].strftime('%b %d, %H:%M UTC')} "
            f"(confidence {result.confidence}%).",
        )

        if duplicate_match:
            log_activity(
                db, ticket, "AI System",
                f"Possible duplicate detected: {duplicate_match['ticket_no']} -- "
                f"ticket flagged for admin review/merge.",
            )

        if spam_flagged:
            log_activity(
                db, ticket, "AI System",
                "Submission looked like spam/low-quality content -- flagged for admin review.",
            )

        db.commit()


def background_reanalyze_ticket(ticket_no: str):
    with SessionLocal() as db:
        ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
        if not ticket:
            return

        result = classify_ticket(
            ticket.title,
            ticket.content,
            ticket.user_priority or 3,
        )
        sla = compute_sla(result.priority, result.difficulty, ticket.created_on)

        is_self_service = result.priority == "P4" and result.difficulty == "Easy"

        ticket.category = result.category
        ticket.priority = result.priority
        ticket.difficulty = result.difficulty
        ticket.assigned_team = None if is_self_service else result.assigned_team
        ticket.ai_recommended_steps = result.recommended_steps
        ticket.ai_confidence = result.confidence
        ticket.ai_summary = result.summary
        ticket.sla_minutes = sla["sla_minutes"]
        ticket.due_by = sla["due_by"]

        hours = round(sla["sla_minutes"] / 60, 1)
        log_activity(
            db, ticket, "AI System",
            f"Re-analyzed: {result.category} / {result.priority} / {result.difficulty} difficulty"
            + ("" if is_self_service else f", routed to {result.assigned_team}")
            + f". Target resolution: {hours}h "
            f"by {sla['due_by'].strftime('%b %d, %H:%M UTC')} (confidence {result.confidence}%).",
        )
        db.commit()


# ------------------------------------------------------------------
# POST /tickets  -- PUBLIC, no login required
# ------------------------------------------------------------------
@router.post("", response_model=TicketOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Anyone can submit a ticket -- no account or login needed.
    AI classification and SLA calculation run automatically.
    Returns the ticket_no so the user can track progress later.
    """
    created_on = datetime.utcnow()

    ticket = Ticket(
        title=payload.title,
        content=payload.content,
        status=TicketStatus.open,
        author=payload.name,
        author_username=payload.username,
        author_id=None,
        created_on=created_on,
        user_priority=payload.user_priority,
        severity=Severity.medium,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    log_activity(
        db, ticket, "System",
        "Ticket created. AI analysis pending in background.",
    )
    db.commit()

    background_tasks.add_task(background_process_ticket_creation, ticket.ticket_no, payload.username)

    return ticket


# ------------------------------------------------------------------
# GET /tickets  -- ADMIN only, paginated
# ?page=1&limit=20 (default: page 1, 20 per page)
# Flagged tickets are excluded from the default queue unless explicitly
# requested via ?status=Flagged (see /admin/tickets/flagged for that view).
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
    # # current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket)

    if status_filter:
        q = q.filter(Ticket.status == status_filter)
    else:
        # Flagged tickets need admin review before they join the live queue.
        q = q.filter(Ticket.status != TicketStatus.flagged)

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
    # current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    changes = []
    update_data = payload.model_dump(exclude_unset=True)

    if payload.status and payload.status != ticket.status.value:
        old = ticket.status.value
        ticket.status = TicketStatus(payload.status)
        if ticket.status == TicketStatus.in_progress and not ticket.ticket_start_date:
            ticket.ticket_start_date = datetime.utcnow()
        if ticket.status == TicketStatus.closed:
            ticket.ticket_closed_date = datetime.utcnow()
            ticket.closed_ticket = "Admin"
        changes.append(f"status: {old} -> {ticket.status.value}")

    if payload.severity and payload.severity != ticket.severity.value:
        old = ticket.severity.value
        ticket.severity = Severity(payload.severity)
        changes.append(f"severity: {old} -> {ticket.severity.value}")

    if "assigned_engineer" in update_data:
        new_eng = update_data["assigned_engineer"]
        if new_eng != ticket.assigned_engineer:
            ticket.assigned_engineer = new_eng
            changes.append(f"assigned engineer: {new_eng or 'Unassigned'}")

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
        log_activity(db, ticket, "Admin", "Updated " + "; ".join(changes))

    db.commit()
    db.refresh(ticket)
    return ticket


# ------------------------------------------------------------------
# DELETE /tickets/{ticket_no}  -- ADMIN only
# ------------------------------------------------------------------
@router.delete("/{ticket_no}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(
    ticket_no: str,
    # current_admin: User = Depends(get_current_admin),
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
    background_tasks: BackgroundTasks,
    # current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    ticket.category = None
    ticket.priority = None
    ticket.difficulty = None
    ticket.assigned_team = None
    ticket.ai_recommended_steps = None
    ticket.ai_confidence = None
    ticket.ai_summary = None
    ticket.sla_minutes = None
    ticket.due_by = None

    log_activity(db, ticket, "System", "Re-analysis triggered in background.")
    db.commit()

    background_tasks.add_task(background_reanalyze_ticket, ticket_no)

    db.refresh(ticket)
    return ticket


# ------------------------------------------------------------------
# POST/GET /tickets/{ticket_no}/comments  -- ADMIN only
# ------------------------------------------------------------------
@router.post("/{ticket_no}/comments", response_model=CommentOut)
def add_comment(
    ticket_no: str,
    payload: CommentCreate,
    # current_admin: User = Depends(get_current_admin),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    comment = TicketComment(
        ticket_id=ticket.id,
        author_name="Admin",
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
    # current_admin: User = Depends(get_current_admin),
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