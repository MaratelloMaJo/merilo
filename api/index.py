"""
Vercel entry point for Merilo.

Vercel runs the FastAPI app as a serverless function. The filesystem is
read-only except /tmp, so the SQLite database lives in /tmp: it is created and
seeded on every cold start and is NOT persistent (demo deployment).
"""

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

os.environ.setdefault("MERILO_DB_PATH", "/tmp/merilo.db")
os.environ.setdefault("MERILO_EVAL_CACHE_TTL", "3600")

from backend.db import init_db  # noqa: E402
from backend.main import app  # noqa: E402,F401 — Vercel looks for `app`
from backend.seed_data import seed_database  # noqa: E402

# The ASGI lifespan is not guaranteed to run on every serverless cold start,
# so the idempotent schema init + seed also run at import time.
init_db()
seed_database()
