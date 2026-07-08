from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status, BackgroundTasks
from sqlalchemy.orm import Session

from activity_log import log_activity
from auth import MockUser, Role, get_current_staff, get_current_user
from classifier import (
    apply_trend_bump,
    check_duplicate,
    classify_ticket,
    compute_sla,
    is_probable_spam,
    TEAMS,
    TREND_WINDOW_HOURS,
)
from database import get_db, SessionLocal
from models import Severity, Ticket, TicketAnalytics, TicketComment, TicketStatus
from schemas import (
    CommentCreate,
    CommentOut,
    TicketCreate,
    TicketOut,
    TicketPageOut,
    TicketTrackOut,
    TicketUpdateAdmin,
    UserCompleteRequest,
    UserEscalateRequest,
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

        # Trend check: how many OTHER tickets in this same category came in
        # recently? A spike here is a signal no single ticket's classifier
        # can see on its own -- it's the analytics layer feeding back into
        # classification, not just per-ticket triage.
        trend_window_start = datetime.utcnow() - timedelta(hours=TREND_WINDOW_HOURS)
        similar_recent_count = db.query(Ticket).filter(
            Ticket.category == result.category,
            Ticket.created_on >= trend_window_start,
            Ticket.id != ticket.id,
        ).count()
        trend = apply_trend_bump(
            result.priority, result.suggested_severity, result.category, similar_recent_count
        )
        final_priority = trend["priority"]
        final_severity = trend["severity"]

        sla = compute_sla(final_priority, result.difficulty, ticket.created_on)

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

        ticket.severity = Severity(final_severity) if final_severity in Severity._value2member_map_ else Severity.medium
        ticket.category = result.category
        ticket.priority = final_priority
        ticket.difficulty = result.difficulty
        ticket.trend_warning = trend["trend_warning"]

        # Self-service (P4 + Easy) tickets can still be routed to a team so
        # engineers can see them in case the user needs further help.
        # (Whether a ticket qualifies for the self-service *shortcut*
        # buttons is now separately gated on confidence -- see
        # Ticket.is_self_service in models.py.)
        ticket.assigned_team = result.assigned_team

        ticket.ai_recommended_steps = result.recommended_steps
        ticket.ai_confidence = result.confidence

        if spam_flagged:
            # Override whatever the classifier reported -- it has no idea
            # the content looked like spam, so its confidence number can't
            # be trusted here regardless of source (AI or rule-based).
            ticket.ai_confidence_level = "Low"
            ticket.ai_confidence_reason = (
                "This submission looks like spam or very low-quality content, so the "
                "classification above may not be meaningful."
            )
        else:
            ticket.ai_confidence_level = result.confidence_level
            ticket.ai_confidence_reason = result.confidence_reason

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
            f"Ticket auto-classified as {result.category} / {final_priority} / "
            f"{result.difficulty} difficulty, routed to {result.assigned_team}"
            + f". User urgency: {ticket.user_priority}/5. "
            f"Target resolution: {hours}h by {sla['due_by'].strftime('%b %d, %H:%M UTC')} "
            f"(confidence: {ticket.ai_confidence_level}).",
        )

        if trend["trend_warning"]:
            log_activity(db, ticket, "AI System", trend["trend_warning"])

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

        trend_window_start = datetime.utcnow() - timedelta(hours=TREND_WINDOW_HOURS)
        similar_recent_count = db.query(Ticket).filter(
            Ticket.category == result.category,
            Ticket.created_on >= trend_window_start,
            Ticket.id != ticket.id,
        ).count()
        trend = apply_trend_bump(
            result.priority, result.suggested_severity, result.category, similar_recent_count
        )
        final_priority = trend["priority"]

        sla = compute_sla(final_priority, result.difficulty, ticket.created_on)

        spam_flagged = is_probable_spam(ticket.title, ticket.content)

        ticket.category = result.category
        ticket.priority = final_priority
        ticket.difficulty = result.difficulty
        ticket.trend_warning = trend["trend_warning"]
        ticket.assigned_team = result.assigned_team
        ticket.ai_recommended_steps = result.recommended_steps
        ticket.ai_confidence = result.confidence

        if spam_flagged:
            ticket.ai_confidence_level = "Low"
            ticket.ai_confidence_reason = (
                "This submission looks like spam or very low-quality content, so the "
                "classification above may not be meaningful."
            )
        else:
            ticket.ai_confidence_level = result.confidence_level
            ticket.ai_confidence_reason = result.confidence_reason

        ticket.ai_summary = result.summary
        ticket.sla_minutes = sla["sla_minutes"]
        ticket.due_by = sla["due_by"]

        hours = round(sla["sla_minutes"] / 60, 1)
        log_activity(
            db, ticket, "AI System",
            f"Re-analyzed: {result.category} / {final_priority} / {result.difficulty} difficulty, routed to {result.assigned_team}. Target resolution: {hours}h "
            f"by {sla['due_by'].strftime('%b %d, %H:%M UTC')} (confidence: {ticket.ai_confidence_level}).",
        )
        if trend["trend_warning"]:
            log_activity(db, ticket, "AI System", trend["trend_warning"])
        db.commit()


# ------------------------------------------------------------------
# POST /tickets  -- requires being "logged in" (X-Username header)
# ------------------------------------------------------------------
@router.post("", response_model=TicketTrackOut, status_code=status.HTTP_201_CREATED)
def create_ticket(
    payload: TicketCreate,
    background_tasks: BackgroundTasks,
    current_user: MockUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Files a ticket as whoever is logged in (their username/full name come
    from the X-Username / X-Full-Name headers set at login, not this
    form). AI classification and SLA calculation run automatically.
    Returns the ticket_no so the user can track progress later.
    """
    created_on = datetime.utcnow()

    ticket = Ticket(
        title=payload.title,
        content=payload.content,
        status=TicketStatus.open,
        author=current_user.full_name,
        author_username=current_user.username,
        technology_app_item=payload.technology_app_item,
        created_on=created_on,
        user_priority=payload.user_priority,
        severity=Severity.medium,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)

    analytics = TicketAnalytics(ticket_id=ticket.id)
    db.add(analytics)
    db.commit()

    log_activity(
        db, ticket, "System",
        "Ticket created. AI analysis pending in background.",
    )
    db.commit()

    background_tasks.add_task(
        background_process_ticket_creation, ticket.ticket_no, current_user.username
    )

    return ticket


# ------------------------------------------------------------------
# GET /tickets  -- ADMIN or ENGINEER
# ?page=1&limit=20 (default: page 1, 20 per page)
# Admins see the full queue (minus Flagged, unless explicitly requested).
# Engineers are auto-scoped to their own team's tickets and never see
# Flagged (that review queue is admin-only -- see /admin/tickets/flagged).
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
    author_username: str | None = Query(None, description="Filter by author username (demo only)"),
    current_user: MockUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Ticket)

    if author_username:
        q = q.filter(Ticket.author_username == author_username)
        if status_filter:
            q = q.filter(Ticket.status == status_filter)
    elif current_user.role == Role.user:
        q = q.filter(Ticket.author_username == current_user.username)
        if status_filter:
            q = q.filter(Ticket.status == status_filter)
    elif current_user.role == Role.engineer:
        # Ignore any assigned_team query param -- engineers only ever see
        # their own team's queue, and Flagged tickets are always excluded.
        q = q.filter(Ticket.assigned_team == current_user.team)
        if status_filter and status_filter != TicketStatus.flagged.value:
            q = q.filter(Ticket.status == status_filter)
        else:
            q = q.filter(Ticket.status != TicketStatus.flagged)
    else:
        if status_filter:
            q = q.filter(Ticket.status == status_filter)
        else:
            q = q.filter(Ticket.status != TicketStatus.flagged)
        if assigned_team:
            q = q.filter(Ticket.assigned_team == assigned_team)


    if severity_filter:
        q = q.filter(Ticket.severity == severity_filter)
    if category_filter:
        q = q.filter(Ticket.category == category_filter)
    if priority_filter:
        q = q.filter(Ticket.priority == priority_filter)
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
@router.get("/{ticket_no}")
def get_ticket(
    ticket_no: str,
    current_user: MockUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No ticket found with that ticket number")

    if current_user.role == Role.user and ticket.author_username != current_user.username:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to view this ticket")

    if current_user.role == Role.engineer and ticket.assigned_team != current_user.team:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This ticket isn't assigned to your team")

    if current_user.role in (Role.admin, Role.engineer):
        return TicketOut.model_validate(ticket)
    return TicketTrackOut.model_validate(ticket)


# ------------------------------------------------------------------
# POST /tickets/{ticket_no}/complete  -- PUBLIC (ticket owner only)
# Self-service tickets only (priority P4 + difficulty Easy + confidence
# not Low -- see Ticket.is_self_service). One click, no message needed:
# the user tried the self-help steps and it worked. Moves the ticket to
# Resolved; an admin closes it from there.
# ------------------------------------------------------------------
@router.post("/{ticket_no}/complete", response_model=TicketTrackOut)
def mark_self_service_complete(
    ticket_no: str,
    payload: UserCompleteRequest,
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    if ticket.author_username != payload.username:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This ticket doesn't belong to that username")

    if not ticket.is_self_service:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This action is only available for self-service (P4 + Easy, confidently classified) tickets",
        )

    if ticket.status in (TicketStatus.resolved, TicketStatus.closed):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Ticket is already {ticket.status.value}")

    ticket.status = TicketStatus.resolved
    if ticket.analytics and not ticket.analytics.resolved_at:
        ticket.analytics.resolved_at = datetime.utcnow()

    log_activity(
        db, ticket, "User",
        "User marked the ticket as complete after trying the self-help steps.",
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ------------------------------------------------------------------
# POST /tickets/{ticket_no}/escalate  -- PUBLIC (ticket owner only)
# The counterpart to /complete. Self-service tickets only (P4 + Easy +
# confidence not Low). The user tried the self-help steps and it
# didn't work -- this bumps the ticket to a real priority/difficulty
# and recalculates the SLA. From here it behaves like any normal
# engineer-handled ticket.
# ------------------------------------------------------------------
@router.post("/{ticket_no}/escalate", response_model=TicketTrackOut)
def escalate_self_service_ticket(
    ticket_no: str,
    payload: UserEscalateRequest,
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    if ticket.author_username != payload.username:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This ticket doesn't belong to that username")

    if not ticket.is_self_service:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This action is only available for self-service (P4 + Easy, confidently classified) tickets",
        )

    if ticket.status in (TicketStatus.resolved, TicketStatus.closed):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Ticket is already {ticket.status.value}")

    old_priority, old_difficulty = ticket.priority, ticket.difficulty

    ticket.priority = "P3"
    ticket.difficulty = "Medium"
    ticket.severity = Severity.medium
    ticket.assigned_team = TEAMS.get(ticket.category, "Service Desk Tier 1")

    sla = compute_sla(ticket.priority, ticket.difficulty, ticket.created_on)
    ticket.sla_minutes = sla["sla_minutes"]
    ticket.due_by = sla["due_by"]

    log_activity(
        db, ticket, "User",
        f"User reported the self-help steps didn't resolve the issue -- escalated "
        f"from {old_priority}/{old_difficulty} to {ticket.priority}/{ticket.difficulty} "
        f"and routed to {ticket.assigned_team}.",
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ------------------------------------------------------------------
# PATCH /tickets/{ticket_no}  -- ADMIN or ENGINEER
# Admins can change anything. Engineers can only update status (e.g.
# mark a ticket Resolved once the user's issue is fixed) and claim/
# release themselves via assigned_engineer, and only on tickets already
# routed to their own team.
# ------------------------------------------------------------------
@router.patch("/{ticket_no}", response_model=TicketOut)
def update_ticket(
    ticket_no: str,
    payload: TicketUpdateAdmin,
    current_user: MockUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    is_engineer = current_user.role == Role.engineer
    update_data = payload.model_dump(exclude_unset=True)

    if is_engineer:
        if ticket.assigned_team != current_user.team:
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "This ticket isn't assigned to your team"
            )

        admin_only_fields = {"severity", "category", "priority", "difficulty", "assigned_team"}
        if admin_only_fields & update_data.keys():
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Engineers can only update status and assigned_engineer -- "
                "severity, category, priority, difficulty, and team reassignment require an admin",
            )
        if payload.status == TicketStatus.flagged.value:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only admins can flag a ticket")

    if current_user.role == Role.user:
        if ticket.author_username != current_user.username:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have permission to update this ticket")

        allowed_user_fields = {"status"}
        if set(update_data.keys()) - allowed_user_fields:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Users can only update the ticket status")

        if payload.status != TicketStatus.closed.value:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Users can only close tickets")

    actor_label = current_user.full_name

    changes = []

    if payload.status and payload.status != ticket.status.value:
        old = ticket.status.value
        ticket.status = TicketStatus(payload.status)
        if ticket.status == TicketStatus.in_progress and not ticket.ticket_start_date:
            ticket.ticket_start_date = datetime.utcnow()
        if ticket.status == TicketStatus.closed:
            ticket.ticket_closed_date = datetime.utcnow()
            ticket.closed_ticket = actor_label
        if ticket.status == TicketStatus.resolved:
            if ticket.analytics and not ticket.analytics.resolved_at:
                ticket.analytics.resolved_at = datetime.utcnow()
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

            # If the engineer is set, automatically route the ticket to their team
            from auth import get_team_from_engineer_name
            if new_eng:
                new_team = get_team_from_engineer_name(new_eng)
                if new_team and new_team != ticket.assigned_team:
                    ticket.assigned_team = new_team
                    changes.append(f"assigned team: {new_team}")

        if new_eng and ticket.analytics and not ticket.analytics.first_responded_at:
            ticket.analytics.first_responded_at = datetime.utcnow()

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
        log_activity(db, ticket, actor_label, "Updated " + "; ".join(changes))

    db.commit()
    db.refresh(ticket)
    return ticket


# ------------------------------------------------------------------
# DELETE /tickets/{ticket_no}  -- ADMIN only
# ------------------------------------------------------------------
@router.delete("/{ticket_no}", status_code=status.HTTP_204_NO_CONTENT)
def delete_ticket(
    ticket_no: str,
    # current_admin: MockUser = Depends(get_current_admin),
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
    # current_admin: MockUser = Depends(get_current_admin),
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
    ticket.ai_confidence_level = None
    ticket.ai_confidence_reason = None
    ticket.trend_warning = None
    ticket.ai_summary = None
    ticket.sla_minutes = None
    ticket.due_by = None

    log_activity(db, ticket, "System", "Re-analysis triggered in background.")
    db.commit()

    background_tasks.add_task(background_reanalyze_ticket, ticket_no)

    db.refresh(ticket)
    return ticket


# ------------------------------------------------------------------
# POST/GET /tickets/{ticket_no}/comments  -- ADMIN or ENGINEER
# Engineers can only comment/read on tickets assigned to their own team.
# ------------------------------------------------------------------
@router.post("/{ticket_no}/comments", response_model=CommentOut)
def add_comment(
    ticket_no: str,
    payload: CommentCreate,
    current_user: MockUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    if current_user.role == Role.engineer and ticket.assigned_team != current_user.team:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This ticket isn't assigned to your team")

    if current_user.role == Role.user and ticket.author_username != current_user.username:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only comment on your own tickets")

    if ticket.analytics and not ticket.analytics.first_responded_at:
        ticket.analytics.first_responded_at = datetime.utcnow()

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
    current_user: MockUser = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_no == ticket_no).first()
    if not ticket:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ticket not found")

    if current_user.role == Role.engineer and ticket.assigned_team != current_user.team:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This ticket isn't assigned to your team")

    if current_user.role == Role.user and ticket.author_username != current_user.username:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You can only view comments on your own tickets")

    return (
        db.query(TicketComment)
        .filter(TicketComment.ticket_id == ticket.id)
        .order_by(TicketComment.created_at.asc())
        .all()
    )