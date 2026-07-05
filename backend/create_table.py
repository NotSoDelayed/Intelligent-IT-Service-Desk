from src.database import Base, engine
from src.models import TicketAnalytics

Base.metadata.create_all(bind=engine)

