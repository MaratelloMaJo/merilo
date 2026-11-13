# Merilo — Single-Port Monolith (FastAPI + SQLite + Vanilla JS)
#
# One container, one process, one port: FastAPI serves the JSON API, the static
# frontend (StaticFiles) and the SQLite-backed verification engine on :8000.
# The database is created and seeded idempotently during the FastAPI lifespan,
# so a fresh container has a working demo without any migration step.
#
# Image invariants:
#   * runs as non-root (uid 10001) — no writes outside /app/data
#   * no .env, no *.db, no tests inside the image (see .dockerignore)
#   * docs/ is present because /evidence/{document} renders a whitelist of
#     evidence documents straight from that directory
#   * healthcheck uses the Python stdlib (curl is absent from python:*-slim)
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    MERILO_ENV=production \
    MERILO_DB_PATH=/app/data/merilo.db

WORKDIR /app

# Dependencies first: this layer is reused until requirements.txt changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Application code. sql/ holds the Supabase/PostgreSQL reference schema used as
# the cloud-architecture blueprint; the running app itself only talks to SQLite.
COPY backend/ ./backend/
COPY static/ ./static/
COPY sql/ ./sql/
# /evidence/{document} serves a fixed whitelist (EVIDENCE.md, PILOT.md,
# INTERVIEWS.md, labor_market.json) from docs/; nothing else in that directory
# is reachable, and drafts are excluded from the build context (.dockerignore).
COPY docs/ ./docs/

# Non-root runtime user. /app/data is the only path the application needs to
# write to: SQLite plus its -wal/-shm sidecars. backend/db.py creates the parent
# directory itself, so an empty mounted volume works out of the box.
RUN useradd --create-home --uid 10001 merilo \
    && mkdir -p /app/data \
    && chown -R merilo:merilo /app

# The entrypoint runs as root for two operations only — handing the mounted
# Fly volume to uid 10001 and dropping privileges — then execs the app, so the
# FastAPI process itself never runs as root.
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

EXPOSE 8000

# Liveness probe against /api/health (200 = process alive, DB reachable).
# sys.exit(0 if ... else 1) keeps the exit code deterministic on both paths.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=3).getcode()==200 else 1)"

# Single worker on purpose: the SQLite file, the in-memory rate-limit buckets and
# the evaluation cache are process-local. PORT is honored (Render, Cloud Run, ...).
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
