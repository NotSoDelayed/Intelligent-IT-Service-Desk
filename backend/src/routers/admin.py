from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from auth import get_current_admin
from database import get_db
from models import Ticket, TicketStatus, User
from schemas import DashboardStats

router = APIRouter(prefix="/admin", tags=["Admin"])


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
                resolution_days.append(
                    (t.ticket_closed_date - t.created_on).total_seconds() / 86400
                )

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
