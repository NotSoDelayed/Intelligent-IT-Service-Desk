from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth import hash_password
from config import settings
from database import Base, engine, get_db
from models import User, UserRole
from routers import admin, auth_routes, health, tickets

Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Intelligent IT Service Desk Automation Platform",
    description="AI-powered ticket classification, prioritization, and routing.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten to your frontend's origin in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth_routes.router)
app.include_router(tickets.router)
app.include_router(admin.router)


@app.on_event("startup")
def seed_admin():
    """Create a default admin account on first run, if none exists."""
    db = next(get_db())
    try:
        existing = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
        if not existing:
            admin_user = User(
                full_name=settings.ADMIN_FULL_NAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=hash_password(settings.ADMIN_PASSWORD),
                role=UserRole.admin,
                customer="IT Department",
                is_active=1,
            )
            db.add(admin_user)
            db.commit()
    finally:
        db.close()


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "Intelligent IT Service Desk Automation Platform API"}
