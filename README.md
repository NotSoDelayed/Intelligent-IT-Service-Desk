# Intelligent IT Service Desk Automation Platform
A K-Youth Week 4 Group Project

## Setup

### Frontend

Copy `.env.example` to `.env` and configure.

Run `npm run dev` to start frontend for development.
The URL is http://localhost:5173

### Backend

Requires [uv](https://docs.astral.sh/uv/) and Python 3.14.

```bash
cd backend
uv sync
```

Copy/create a `.env` file in `backend/` with your config (Gemini API
key, admin credentials, etc.) — see [`backend/README.md`](backend/README.md)
for the full list of variables.

Run the backend for development:

```bash
uv run uvicorn main:app --reload --app-dir src --port 8000
```

The API runs at http://localhost:8000, with interactive docs at
http://localhost:8000/docs

For full backend details — architecture, API reference, AI
classification, duplicate detection, SLA engine, testing, and known
limitations — see **[`backend/README.md`](backend/README.md)**.