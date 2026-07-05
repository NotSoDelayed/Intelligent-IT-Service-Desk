from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import Base, engine
from routers import admin, auth_routes, health, tickets, analytics

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
app.include_router(analytics.router)


@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "service": "Intelligent IT Service Desk Automation Platform API"}