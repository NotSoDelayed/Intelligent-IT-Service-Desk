from sqlalchemy.orm import Session

from models import Ticket, TicketComment


def log_activity(db: Session, ticket: Ticket, author_name: str, message: str, is_system: bool = True):
    db.add(TicketComment(
        ticket_id=ticket.id, author_name=author_name, message=message,
        is_system=1 if is_system else 0,
    ))
