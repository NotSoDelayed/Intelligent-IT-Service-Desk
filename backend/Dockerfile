FROM python:3.14.4-bookworm

# Install uv (fast Python package manager) -- matches your local
# `uv run uvicorn ...` workflow rather than pip.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first so Docker caches this layer separately from
# your source code -- rebuilds only re-run `uv sync` when deps actually
# change, not on every code edit.
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev

# Copy the actual application code
COPY src ./src

# SQLite file lives here -- mount this as a volume (see docker-compose.yml)
# so ticket data survives container restarts/redeploys.
RUN mkdir -p /app/data

ENV PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/')" || exit 1

ENTRYPOINT ["uv", "run", "uvicorn"]
CMD ["main:app", "--app-dir", "src", "--host", "0.0.0.0", "--port", "8000"]