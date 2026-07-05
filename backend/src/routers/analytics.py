from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import get_db
from models import Ticket, TicketAnalytics
from schemas import AnalyticsOut, AnalyticsSummary, AnalyticsTrend, AnalyticsDepartment

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def median(lst: list[float]) -> float | None:
    if not lst:
        return None
    sorted_lst = sorted(lst)
    n = len(sorted_lst)
    if n % 2 == 1:
        return sorted_lst[n // 2]
    else:
        return (sorted_lst[n // 2 - 1] + sorted_lst[n // 2]) / 2.0


@router.get("", response_model=AnalyticsOut)
def get_analytics(
    days: int = 7,
    # current_admin: User = Depends(get_current_admin), # Requires admin privileges in prod
    db: Session = Depends(get_db),
):
    cutoff = datetime.utcnow() - timedelta(days=days)

    # We join Ticket to get the department
    query = (
        db.query(TicketAnalytics, Ticket)
        .join(Ticket, Ticket.id == TicketAnalytics.ticket_id)
        .filter(TicketAnalytics.created_at >= cutoff)
    )
    records = query.all()

    total_created = len(records)
    response_times = []
    resolution_times = []
    total_resolved = 0

    # group by date string
    trend_dict: dict[str, dict[str, Any]] = {}
    # group by department
    dept_dict: dict[str, int] = {}

    for analytics, ticket in records:
        date_str = analytics.created_at.strftime("%Y-%m-%d")
        if date_str not in trend_dict:
            trend_dict[date_str] = {
                "created": 0,
                "resolved": 0,
                "resp_times": [],
                "res_times": [],
            }

        trend_dict[date_str]["created"] += 1
        dept_dict[ticket.department] = dept_dict.get(ticket.department, 0) + 1

        if analytics.first_responded_at:
            minutes = (analytics.first_responded_at - analytics.created_at).total_seconds() / 60.0
            response_times.append(minutes)
            trend_dict[date_str]["resp_times"].append(minutes)

        if analytics.resolved_at:
            total_resolved += 1
            trend_dict[date_str]["resolved"] += 1
            minutes = (analytics.resolved_at - analytics.created_at).total_seconds() / 60.0
            resolution_times.append(minutes)
            trend_dict[date_str]["res_times"].append(minutes)

    summary = AnalyticsSummary(
        total_created=total_created,
        total_resolved=total_resolved,
        median_response_minutes=median(response_times),
        median_resolution_minutes=median(resolution_times),
    )

    trend_list = []
    for date_str, data in sorted(trend_dict.items()):
        trend_list.append(
            AnalyticsTrend(
                date=date_str,
                created=data["created"],
                resolved=data["resolved"],
                median_response=median(data["resp_times"]),
                median_resolution=median(data["res_times"]),
            )
        )

    dept_list = []
    for dept_name, count in sorted(dept_dict.items(), key=lambda x: x[1], reverse=True):
        dept_list.append(AnalyticsDepartment(name=dept_name, count=count))

    return AnalyticsOut(
        summary=summary,
        trend=trend_list,
        departments=dept_list,
    )
