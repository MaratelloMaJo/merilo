"""
Merilo — Single-Port Backend API & Static Server
FastAPI application orchestrating SQLite data layer, scrypt password hashing,
HMAC-SHA256 card signing, 3-gate verification engine, and vanilla frontend distribution on port 8000.
"""

import json
import logging
import os
import secrets
import sqlite3
import time
import uuid
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import Body, FastAPI, Header, HTTPException, Query, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from backend import __version__
from backend.db import (
    create_custom_task,
    create_session_token,
    create_user,
    get_all_tasks,
    get_all_users,
    get_public_cards_for_slug,
    get_public_skill_card,
    get_public_users,
    get_recent_public_cards,
    get_skill_card_private,
    get_task_by_id,
    get_user_by_email,
    get_user_by_id,
    init_db,
    ping_db,
    profile_slug,
    set_user_secondary_role,
    verify_card_signature,
    verify_password,
    verify_session_token,
)
from backend.defense import (
    AlreadyDefended,
    defense_challenge_status,
    hash_token,
    seal_card_defense,
)
from backend.evidence import render_evidence_document, render_evidence_index
from backend.languages import SUPPORTED_LANGUAGES
from backend.schemas import DefenseRequest, DefenseResponse, TaskCreateRequest, VerifyRequest
from backend.seed_data import seed_database
from backend.signing import (
    MANIFEST_VERSION,
    SIGNATURE_ALGORITHM,
    badge_svg,
    manifest_for_card,
    public_base_url,
    public_key_b64,
    qr_svg,
)
from backend.verifier import (
    OWN_CODE_TASK_ID,
    get_gemini_api_key,
    get_gemini_model,
    verify_submission,
)

# Ensure static directory exists before mounting
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
STATIC_DIR = os.path.join(BASE_DIR, "static")
DOCS_DIR = os.path.join(BASE_DIR, "docs")
os.makedirs(STATIC_DIR, exist_ok=True)

# Evidence documents the landing page links to. A whitelist, not a directory
# mount: internal drafts in docs/ are never exposed by this route.
EVIDENCE_DOCUMENTS: dict[str, tuple[str, str]] = {
    "labor_market.json": ("labor_market.json", "application/json"),
    "evidence": ("EVIDENCE.md", "text/markdown; charset=utf-8"),
    "pilot": ("PILOT.md", "text/markdown; charset=utf-8"),
    "interviews": ("INTERVIEWS.md", "text/markdown; charset=utf-8"),
    "api": ("API.md", "text/markdown; charset=utf-8"),
}

LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO"

logger = logging.getLogger("merilo.main")

# Configure logging exactly once per process (never fight an embedding host).
if not logging.getLogger().handlers:
    logging.basicConfig(
        level=getattr(logging, LOG_LEVEL, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

# Request size cap for candidate submissions (64 KB is ~10x the largest preset).
MAX_SUBMITTED_CODE_BYTES = 64 * 1024

# Defense answers are three short texts; 16 KB is far above any legitimate body.
MAX_DEFENSE_BODY_BYTES = 16 * 1024

# In-memory sliding-window rate limits (per client IP).
TASK_RATE_LIMIT_MAX_REQUESTS = 10
VERIFY_RATE_LIMIT_MAX_REQUESTS = int(os.getenv("RATE_LIMIT_MAX_REQUESTS") or "20")
DEFENSE_RATE_LIMIT_MAX_REQUESTS = 5
RATE_LIMIT_WINDOW_SECONDS = float(os.getenv("RATE_LIMIT_WINDOW_SECONDS") or "60")

# Baseline security headers for HTML documents. ``unsafe-inline`` is required by
# the pages that embed their own style/bootstrap script (card, profile), but the
# policy allows no third-party origin: fonts are system fonts and every
# stylesheet/script is served from this origin.
HTML_CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "base-uri 'self'; "
    "object-src 'none'; "
    "frame-ancestors 'none'; "
    "form-action 'self'; "
    "img-src 'self' data: https://avatars.githubusercontent.com; "
    "font-src 'self' data:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self' 'unsafe-inline'; "
    "connect-src 'self';"
)

# Separate buckets: recruiter task posting never throttles candidate verification.
_task_rate_limit_windows: dict[str, deque[float]] = defaultdict(deque)
_verify_rate_limit_windows: dict[str, deque[float]] = defaultdict(deque)
_defense_rate_limit_windows: dict[str, deque[float]] = defaultdict(deque)


def _check_rate_limit(
    client_ip: str,
    max_requests: int | None = None,
    window_seconds: float | None = None,
    windows: dict[str, deque[float]] | None = None,
) -> bool:
    """
    Sliding-window rate limiter shared by the public endpoints.

    Returns True when the client may proceed now (the hit is recorded); False when
    the bucket already holds ``max_requests`` hits inside ``window_seconds``.
    ``windows=None`` selects the task-posting bucket, so the legacy
    ``_check_rate_limit(client_ip)`` call keeps its original 10 req / 60 s policy.

    Limits are resolved at call time (never bound as default arguments) so tests
    and runtime reconfiguration can monkeypatch the module constants.
    """
    if max_requests is None:
        max_requests = TASK_RATE_LIMIT_MAX_REQUESTS
    if window_seconds is None:
        window_seconds = RATE_LIMIT_WINDOW_SECONDS
    if windows is None:
        windows = _task_rate_limit_windows

    now = time.monotonic()
    window = windows[client_ip]
    while window and now - window[0] > window_seconds:
        window.popleft()
    if len(window) >= max_requests:
        return False
    window.append(now)
    return True


def _check_verify_rate_limit(client_ip: str) -> bool:
    """
    Rate limit for POST /api/submissions/verify (default 20 req / 60 s per IP).

    Verification is the only potentially billable endpoint, so it gets its own
    bucket and a slightly more generous default than task posting. The limit is
    read at call time so ``VERIFY_RATE_LIMIT_MAX_REQUESTS`` stays patchable.
    """
    return _check_rate_limit(
        client_ip,
        VERIFY_RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_SECONDS,
        _verify_rate_limit_windows,
    )


def _check_defense_rate_limit(client_ip: str) -> bool:
    """Rate limit for POST /api/cards/{hash}/defense (5 req / 60 s per IP)."""
    return _check_rate_limit(
        client_ip,
        DEFENSE_RATE_LIMIT_MAX_REQUESTS,
        RATE_LIMIT_WINDOW_SECONDS,
        _defense_rate_limit_windows,
    )


def _defense_body_too_large(request: Request) -> bool:
    """True when a defense POST declares a body above ``MAX_DEFENSE_BODY_BYTES``.

    Only the ``Content-Length`` header is inspected: the JSON body is rejected
    before Starlette buffers or parses it. Requests without a declared length
    (chunked transfer) are left to the normal envelope validation.
    """
    if request.method != "POST":
        return False
    path = request.url.path
    if not (path.startswith("/api/cards/") and path.endswith("/defense")):
        return False
    raw_length = request.headers.get("content-length")
    if raw_length is None:
        return False
    try:
        declared = int(raw_length)
    except ValueError:
        return False
    return declared > MAX_DEFENSE_BODY_BYTES


class RegisterRequest(BaseModel):
    email: str = Field(..., description="Email пользователя")
    password: str = Field(..., min_length=6, description="Пароль пользователя (минимум 6 символов)")
    full_name: str = Field(..., min_length=2, description="Полное имя кандидата или рекрутера")
    # Self-service registration may only create these two roles. Privileged roles
    # (owner, admin) are never accepted from the client.
    role: Literal["candidate", "recruiter"] = Field(default="candidate", description="Роль: 'candidate' | 'recruiter'")


class LoginRequest(BaseModel):
    email: str = Field(..., description="Email пользователя")
    password: str = Field(..., description="Пароль пользователя")


class SetRoleRequest(BaseModel):
    role: Literal["candidate", "recruiter"] = Field(
        ...,
        description="Вторая роль пользователя: 'candidate' | 'recruiter'",
    )


SESSION_COOKIE_NAME = "merilo_session"
SESSION_COOKIE_MAX_AGE = 60 * 60 * 24 * 30  # 30 days


def _session_cookie_secure(request: Request | None = None) -> bool:
    """Only mark the cookie Secure when the request actually arrived over HTTPS."""
    if request is None:
        return False
    forwarded = (request.headers.get("x-forwarded-proto") or "").lower()
    return request.url.scheme == "https" or forwarded == "https"


def _set_session_cookie(response: Response, token: str, request: Request | None = None) -> None:
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=token,
        max_age=SESSION_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=_session_cookie_secure(request),
        path="/",
    )


def _clear_session_cookie(response: Response) -> None:
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")


def _public_user(user: dict) -> dict:
    """Sanitized profile shared by register/login/me/roles responses."""
    return {
        "id": user["id"],
        "email": user["email"],
        "full_name": user["full_name"],
        "role": user["role"],
        "secondary_role": user.get("secondary_role"),
        "profile_slug": profile_slug(user["id"]),
        "created_at": user["created_at"],
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifespan manager: runs schema initialization and database seeding
    upon startup, ensuring the zero-auth demo and default accounts are immediately ready.

    Both steps are idempotent (CREATE TABLE IF NOT EXISTS / INSERT OR IGNORE), and an
    unrecoverable storage failure fails fast with a clear message instead of serving
    requests against a broken database.
    """
    try:
        init_db()
        seed_database()
    except (sqlite3.Error, OSError, RuntimeError) as exc:
        logger.critical(
            "startup_failed stage=init_db_or_seed error=%s detail=%s",
            type(exc).__name__,
            exc,
        )
        raise RuntimeError(f"Merilo startup failed: {exc}") from exc
    logger.info("startup_complete version=%s model=%s", __version__, get_gemini_model())
    yield


app = FastAPI(
    title="Merilo API",
    description="B2B Verification Engine & Developer Portfolio Platform bridging the Experience Gap",
    version=__version__,
    lifespan=lifespan,
)

# CORS middleware for universal access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    """
    Attaches a short correlation id to every request, measures latency, mirrors both
    back as headers and emits one structured access log line per request.
    """
    request_id = uuid.uuid4().hex[:12]
    request.state.request_id = request_id
    started_at = time.perf_counter()

    if _defense_body_too_large(request):
        response = JSONResponse(
            status_code=413,
            content={
                "error": {
                    "code": 413,
                    "message": "Тело запроса защиты превышает лимит 16 KB",
                }
            },
        )
    else:
        response = await call_next(request)

    # Pages and scripts must be revalidated on every visit. Without this the
    # browser may keep an old app.js after a deploy, and its buttons keep
    # running the previous code against the new API.
    path = request.url.path
    if path in {"", "/"} or path.endswith((".html", ".js", ".css")):
        response.headers["Cache-Control"] = "no-cache, must-revalidate"

    # Baseline security headers. The CSP is attached to HTML documents only, so
    # JSON APIs stay untouched while pages and Swagger UI are covered.
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    content_type = response.headers.get("content-type", "")
    if content_type.split(";")[0].strip().lower() == "text/html":
        if "content-security-policy" not in response.headers:
            response.headers["Content-Security-Policy"] = HTML_CONTENT_SECURITY_POLICY

    latency_ms = (time.perf_counter() - started_at) * 1000.0
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Response-Time"] = f"{latency_ms:.1f}"
    logger.info(
        "request_completed request_id=%s method=%s path=%s status=%s latency_ms=%.1f",
        request_id,
        request.method,
        request.url.path,
        response.status_code,
        latency_ms,
    )
    return response


# =============================================================================
# JSON error envelopes (no stack traces, no echoed request bodies)
# =============================================================================

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """
    Wraps every HTTPException (including FastAPI's) into a stable JSON error shape.
    """
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.status_code, "message": str(exc.detail)}},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """
    Reports which fields failed validation without echoing the submitted payload.
    """
    details = [
        {"loc": list(error.get("loc", ())), "msg": str(error.get("msg", ""))}
        for error in exc.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": 422,
                "message": "Некорректный формат запроса",
                "details": details,
            }
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Last-resort handler: logs the traceback server-side, returns an opaque 500.
    """
    request_id = getattr(request.state, "request_id", "-")
    logger.exception(
        "unhandled_exception request_id=%s method=%s path=%s error=%s",
        request_id,
        request.method,
        request.url.path,
        type(exc).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={"error": {"code": 500, "message": "Внутренняя ошибка сервера"}},
    )


# =============================================================================
# REST API: Authentication & Users
# =============================================================================

@app.post("/api/auth/register")
async def register(payload: RegisterRequest, request: Request, response: Response):
    """
    Registers a new platform user with PBKDF2 password hashing and salt.
    Returns authenticated session token and profile, and sets the session cookie.
    """
    clean_email = payload.email.strip().lower()
    if "@" not in clean_email:
        raise HTTPException(status_code=400, detail="Некорректный email адрес")

    existing = get_user_by_email(clean_email)
    if existing:
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже зарегистрирован")

    user = create_user(
        email=clean_email,
        password=payload.password,
        full_name=payload.full_name.strip(),
        role=payload.role,
    )
    token = create_session_token(user["id"])
    _set_session_cookie(response, token, request)
    return {
        "status": "success",
        "token": token,
        "user": _public_user(user),
    }


@app.post("/api/auth/login")
async def login(payload: LoginRequest, request: Request, response: Response):
    """
    Authenticates user credentials using constant-time PBKDF2 hash verification.
    Returns session token and profile, and sets the session cookie.
    """
    clean_email = payload.email.strip().lower()
    user = get_user_by_email(clean_email)
    if not user or not verify_password(payload.password, user["password_hash"], user["salt"]):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")

    token = create_session_token(user["id"])
    _set_session_cookie(response, token, request)
    return {
        "status": "success",
        "token": token,
        "user": _public_user(user),
    }


DEMO_MODE = os.getenv("MERILO_DEMO_MODE", "0").strip().lower() in {"1", "true", "yes", "on"}


@app.post("/api/demo/session")
async def demo_session(
    request: Request,
    response: Response,
    payload: dict | None = Body(default=None),
):
    """
    Passwordless demo session for the live jury stand.

    Enabled only when ``MERILO_DEMO_MODE=1``; otherwise the endpoint answers 404
    so a regular deployment keeps the normal registration/login flow.

    The body selects the account: ``{"account": "owner"}`` (default) opens the
    founder, who sees both the candidate and the HR views; ``{"account":
    "recruiter"}`` opens the seeded hiring account. Only whitelisted demo
    emails can be requested, so this cannot mint a session for a real user.
    """
    if not DEMO_MODE:
        raise HTTPException(status_code=404, detail="Не найдено")

    account = str((payload or {}).get("account") or "owner").strip().lower()
    demo_accounts = {
        "owner": "marat@merilo.kz",
        "candidate": "marat@merilo.kz",
        "recruiter": "hiring@example.com",
        "hr": "hiring@example.com",
    }
    email = demo_accounts.get(account)
    if not email:
        raise HTTPException(status_code=400, detail="Неизвестный демо-аккаунт")

    user = get_user_by_email(email)
    if not user and account in {"owner", "candidate"}:
        users = get_all_users()
        user = users[0] if users else None
    if not user:
        # A fresh database seeds only the founder, so the HR demo button
        # provisions its own account on first use. The password is random and
        # never printed: this account exists to be opened by the demo endpoint.
        is_hr = account in {"recruiter", "hr"}
        try:
            user = create_user(
                email=email,
                password=secrets.token_urlsafe(24),
                full_name="Kaspi Hiring" if is_hr else "Жолынбек Марат",
                role="recruiter" if is_hr else "owner",
            )
        except ValueError:
            user = get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=503, detail="Демо-аккаунт не инициализирован")

    token = create_session_token(user["id"])
    _set_session_cookie(response, token, request)
    return {
        "status": "success",
        "token": token,
        "user": _public_user(user),
    }


def _session_token_from_request(request: Request, authorization: str | None) -> str:
    """Prefer the explicit Bearer header (API clients) and fall back to the cookie."""
    if authorization:
        token = authorization.replace("Bearer ", "").strip()
        if token:
            return token
    return request.cookies.get(SESSION_COOKIE_NAME, "").strip()


@app.get("/api/auth/me")
async def get_current_user_profile(
    request: Request,
    authorization: str | None = Header(None),
):
    """
    Returns the profile behind the Bearer token or the ``merilo_session`` cookie.

    A missing or invalid token is an honest 401: the browser must be able to
    log out, so this endpoint never falls back to a default account.
    """
    user = None
    raw_token = _session_token_from_request(request, authorization)
    if raw_token:
        user_id = verify_session_token(raw_token)
        if user_id:
            user = get_user_by_id(user_id)

    if not user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    return _public_user(user)


@app.post("/api/auth/logout")
async def logout(response: Response):
    """Clears the browser session cookie. Bearer clients simply drop their token."""
    _clear_session_cookie(response)
    return {"status": "success"}


@app.post("/api/auth/roles")
async def set_secondary_role(
    payload: SetRoleRequest,
    request: Request,
    authorization: str | None = Header(None),
):
    """
    Sets the optional second role for the current user.

    The primary role chosen at registration stays the same; the secondary role
    lets one account use both the candidate and the HR side of the workspace.
    """
    raw_token = _session_token_from_request(request, authorization)
    user_id = verify_session_token(raw_token) if raw_token else None
    user = get_user_by_id(user_id) if user_id else None
    if not user:
        raise HTTPException(status_code=401, detail="Требуется авторизация")

    if payload.role == user["role"]:
        raise HTTPException(
            status_code=400,
            detail="Вторая роль должна отличаться от основной",
        )
    if not set_user_secondary_role(user["id"], payload.role):
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    updated = get_user_by_id(user["id"])
    return {
        "status": "success",
        "user": _public_user(updated),
    }


@app.get("/api/users")
async def list_users():
    """
    Lists candidate profiles for recruiter talent search.

    Contact data and internal identifiers stay private: each entry carries an
    opaque ``profile_slug`` that ``GET /api/users/{slug}/cards`` resolves.
    """
    return get_public_users()


@app.get("/api/users/{slug}/cards")
async def list_user_cards(slug: str):
    """
    Public card summaries for one profile slug.

    The identifier is an opaque hash (``sha256("merilo-profile:" + user_id)``),
    never the raw user id, so a profile link cannot be turned back into an
    account identifier. Only verified cards are listed (the page promises
    «Только проверенные карточки»); a rejected or blocked card is omitted.
    Unknown slugs are an honest 404; a known profile without cards returns an
    empty list.
    """
    cards = get_public_cards_for_slug(slug)
    if cards is None:
        raise HTTPException(status_code=404, detail="Публичный профиль не найден")
    return cards


# =============================================================================
# REST API: Tasks & Health
# =============================================================================

@app.get("/api/health")
async def health_check():
    """
    Liveness endpoint for the demo: never calls Gemini and never raises.

    ``status`` degrades to "degraded" (HTTP 200 is kept, so orchestrators can tell
    "process is alive but storage is broken" apart from "process is dead").
    """
    db_ok = ping_db()
    return {
        "status": "ok" if db_ok else "degraded",
        "mode": "demo_active",
        "version": __version__,
        "model": get_gemini_model(),
        "db": "ok" if db_ok else "error",
    }


@app.get("/api/ready")
async def readiness_check():
    """
    Readiness probe: storage plus configuration, with no network calls at all.

    ``mode`` is "live" when a Gemini key is configured and "fallback" when the
    deterministic offline evaluator will be used instead. 503 only when the
    database is unreachable — a missing API key is a supported operating mode.
    """
    db_ok = ping_db()
    key_present = bool(get_gemini_api_key())
    payload = {
        "ready": db_ok,
        "db": "ok" if db_ok else "error",
        "gemini_key": key_present,
        "model": get_gemini_model(),
        "mode": "live" if key_present else "fallback",
        "demo_mode": DEMO_MODE,
    }
    return JSONResponse(content=payload, status_code=200 if db_ok else 503)


@app.get("/.well-known/merilo.json")
async def well_known_merilo():
    """
    Public trust document: the Ed25519 key and manifest contract a verifier needs.

    ``verify_url`` is the manifest template: replace ``{hash}`` with a card hash.
    The document is cacheable — it changes only when the signing key rotates.
    """
    payload = {
        "algorithm": SIGNATURE_ALGORITHM,
        "public_key": public_key_b64(),
        "manifest_version": MANIFEST_VERSION,
        "supported_languages": sorted(SUPPORTED_LANGUAGES),
        "verify_url": f"{public_base_url()}/api/cards/{{hash}}/manifest",
    }
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/evidence", include_in_schema=False)
@app.get("/evidence/", include_in_schema=False)
async def evidence_index():
    """
    Human-readable index of the whitelisted evidence documents.

    ``GET /evidence`` used to return 404 because only ``/evidence/{name}`` existed.
    The index makes the namespace discoverable without exposing ``docs/``.
    """
    documents = [(name, filename) for name, (filename, _media_type) in EVIDENCE_DOCUMENTS.items()]
    return HTMLResponse(render_evidence_index(documents))


@app.get("/evidence/{document}")
async def evidence_document(document: str):
    """
    Serves the dated evidence layer linked from the landing page.

    Markdown documents are rendered to a small self-contained HTML page so a
    browser link is not a raw-file download; ``labor_market.json`` stays JSON.
    Only the whitelisted documents are reachable; ``docs/`` is never mounted as
    a directory, so drafts and internal notes stay private.
    """
    entry = EVIDENCE_DOCUMENTS.get(document)
    if entry is None:
        raise HTTPException(status_code=404, detail="Evidence document not found")
    filename, media_type = entry
    path = os.path.join(DOCS_DIR, filename)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Evidence document not found")
    if media_type.startswith("text/markdown"):
        with open(path, encoding="utf-8") as handle:
            markdown = handle.read()
        return HTMLResponse(render_evidence_document(document, filename, markdown))
    return FileResponse(path, media_type=media_type)


@app.get("/offline-demo.html", include_in_schema=False)
async def offline_demo():
    """
    Serves the self-contained offline demo page.

    The page is a static artifact generated from three real evaluation runs
    (``scripts/generate_offline_demo.py``); it needs no network and no API, so a
    jury laptop with Wi-Fi off can open the same URL as the deployed app.
    """
    path = os.path.join(DOCS_DIR, "offline-demo.html")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Offline demo not found")
    return FileResponse(path, media_type="text/html; charset=utf-8")


@app.get("/api/tasks")
async def list_tasks():
    """
    Retrieves curated B2B micro-tasks for the candidate playground.
    """
    return get_all_tasks()


@app.get("/api/tasks/{task_id}")
async def get_task(task_id: str):
    """
    Retrieves a single micro-task by identifier.
    """
    task = get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Micro-task not found")
    return task


@app.post("/api/tasks", status_code=201)
async def create_task(payload: TaskCreateRequest, request: Request):
    """
    Public recruiter endpoint (deliberately zero-auth for the demo): posts a new B2B
    micro-task to the shared playground. Rate limited to 10 requests / 60s per client IP.
    All values are persisted through parameterized SQL only (no string interpolation).
    """
    client_ip = request.client.host if request.client else "unknown"
    if not _check_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Превышен лимит запросов: не более 10 публикаций задач в минуту с одного IP-адреса",
        )

    task = create_custom_task(
        title=payload.title,
        company_name=payload.company_name,
        stack=payload.stack,
        difficulty=payload.difficulty,
        description=payload.description,
        rubric_json=json.dumps(payload.rubric, ensure_ascii=False),
        buggy_code=payload.buggy_code,
        preset_ideal=payload.preset_ideal,
        preset_vulnerable=payload.preset_vulnerable,
        preset_injection=payload.preset_injection,
        language=payload.language,
    )
    return task


# =============================================================================
# REST API: Submissions & Cryptographically Signed Skill Cards
# =============================================================================

def _resolve_identity(payload: VerifyRequest, authorization: str | None) -> tuple[str, str]:
    """
    Resolves the candidate account and display name for a submission.

    Priority: signed Bearer token, then ``payload.user_id``, then the seeded demo
    candidate (first user, then marat@merilo.kz) so the zero-auth demo always works.
    The request body is read once by Pydantic — it is never re-parsed here.
    """
    resolved_user = None

    if authorization:
        token_user_id = verify_session_token(authorization.replace("Bearer ", "").strip())
        if token_user_id:
            resolved_user = get_user_by_id(token_user_id)

    if not resolved_user and payload.user_id:
        resolved_user = get_user_by_id(payload.user_id)

    if not resolved_user:
        resolved_user = get_user_by_email("marat@merilo.kz")
        if not resolved_user:
            all_users = get_all_users()
            if all_users:
                resolved_user = all_users[0]

    user_id = resolved_user["id"] if resolved_user else "usr_candidate"
    candidate_name = payload.candidate_name
    if (not candidate_name or candidate_name == "Anonymous Candidate") and resolved_user:
        candidate_name = resolved_user.get("full_name") or "Жолынбек Марат"
    return user_id, candidate_name


@app.get("/api/cards/recent")
async def list_recent_cards(limit: int = Query(default=20, ge=1, le=100)):
    """
    Public feed of real, verified Skill Cards for the recruiter shortlist.

    Declared before ``/api/cards/{card_hash}`` so the literal path wins over the
    dynamic one. Only ``status='verified'`` cards are listed, newest first.

    ``limit`` defaults to 20 and must be within 1..100: the value is validated
    (clamped envelope) rather than silently rewritten, so an out-of-range or
    non-integer value is an honest 422. ``defense_status`` is derived in bulk
    from columns already fetched with the rows — no per-card query.
    """
    return get_recent_public_cards(limit)


@app.get("/api/cards/{card_hash}")
async def get_card(card_hash: str):
    """
    Retrieves full details of a cryptographically hashed, verified Skill Card,
    including HMAC-SHA256 signature verification status.
    """
    card = get_public_skill_card(card_hash)
    if not card:
        raise HTTPException(status_code=404, detail="Verified Skill Card not found")
    return card


@app.get("/api/cards/{card_hash}/manifest")
async def get_card_manifest(card_hash: str):
    """
    Portable, offline-verifiable manifest of a Skill Card.

    Returns ``{manifest, ed25519_signature, public_key, valid}``. The manifest
    carries public metadata and SHA-256 digests only — the submitted code, the
    task text, the defense answers and every token hash are never included.
    Legacy cards without a stored manifest are signed on read.
    """
    card = get_skill_card_private(card_hash)
    if not card:
        raise HTTPException(status_code=404, detail="Verified Skill Card not found")
    envelope = manifest_for_card(card)
    return JSONResponse(
        content=envelope,
        headers={"Cache-Control": "public, max-age=60"},
    )


@app.get("/badge/{card_hash}.svg")
async def get_card_badge(card_hash: str):
    """
    Compact 320×120 SVG badge for a card. Unknown cards are an honest 404.
    """
    card = get_public_skill_card(card_hash)
    if not card:
        raise HTTPException(status_code=404, detail="Verified Skill Card not found")
    svg = badge_svg(
        score=card.get("total_score", 0),
        language=card.get("language") or "python",
        tier=card.get("badge_tier") or "",
        candidate_name=card.get("candidate_name") or "",
        card_hash=card_hash,
        status=card.get("status") or "",
    )
    return Response(
        content=svg,
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.get("/card/{card_hash}/qr.svg")
async def get_card_qr(card_hash: str):
    """
    SVG QR code pointing at the public card URL (``MERILO_PUBLIC_BASE_URL``).
    """
    if not get_public_skill_card(card_hash):
        raise HTTPException(status_code=404, detail="Verified Skill Card not found")
    return Response(
        content=qr_svg(card_hash),
        media_type="image/svg+xml",
        headers={"Cache-Control": "public, max-age=300"},
    )


@app.post("/api/submissions/verify")
async def verify_submission_endpoint(
    payload: VerifyRequest,
    request: Request,
    response: Response,
    authorization: str | None = Header(None),
):
    """
    Passes candidate submission through the 3-gate verification engine:
    1. Tree-sitter parsing for the task language
    2. Security / Prompt Injection shield
    3. Gemini structured evaluation (model from GEMINI_MODEL)

    The engine itself binds the resulting Skill Card to the candidate account,
    signs it with an HMAC-SHA256 signature and persists it — this endpoint only
    validates the request envelope, resolves the language and resolves the identity.
    """
    request_id = getattr(request.state, "request_id", "-")
    started_at = time.perf_counter()

    # 1. Per-IP rate limit: verification is the only potentially billable endpoint.
    client_ip = request.client.host if request.client else "unknown"
    if not _check_verify_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Превышен лимит запросов на верификацию. Повторите попытку позже.",
        )

    # 2. Language resolution: ``own-code`` has no catalogue row, every other
    # task's own language is authoritative.
    if payload.task_id == OWN_CODE_TASK_ID:
        resolved_language = payload.language
        if not resolved_language:
            raise HTTPException(
                status_code=422,
                detail="Для собственного кода укажите language: один из поддерживаемых языков",
            )
        if resolved_language not in SUPPORTED_LANGUAGES:
            supported = ", ".join(sorted(SUPPORTED_LANGUAGES))
            raise HTTPException(
                status_code=422,
                detail=f"Язык «{resolved_language}» не поддерживается. Доступные языки: {supported}",
            )
    else:
        task = get_task_by_id(payload.task_id)
        if task is None:
            raise HTTPException(status_code=404, detail="Micro-task not found")
        resolved_language = str(task.get("language") or "python")
        if payload.language and payload.language != resolved_language:
            raise HTTPException(
                status_code=422,
                detail=(
                    "language does not match task: "
                    f"задача выполняется на «{resolved_language}»"
                ),
            )

    # 3. Payload hardening: non-empty, valid UTF-8, bounded size.
    submitted_code = payload.submitted_code
    if not submitted_code.strip():
        raise HTTPException(status_code=400, detail="Код не может быть пустым")
    try:
        code_bytes = submitted_code.encode("utf-8", errors="strict")
    except UnicodeEncodeError as exc:
        raise HTTPException(status_code=400, detail="Код должен быть валидным UTF-8") from exc
    if len(code_bytes) > MAX_SUBMITTED_CODE_BYTES:
        raise HTTPException(status_code=413, detail="Код превышает лимит 64 KB")

    # 4. Resolve identity, then run the engine (it stores the signed card).
    user_id, candidate_name = _resolve_identity(payload, authorization)
    result = await verify_submission(
        task_id=payload.task_id,
        submitted_code=submitted_code,
        candidate_name=candidate_name,
        user_id=user_id,
        language=resolved_language,
        ai_assisted=payload.ai_assisted,
    )
    result["user_id"] = user_id
    result["is_signature_valid"] = verify_card_signature(result)

    # The payload carries the single-use defense token: never let a proxy or the
    # browser cache it.
    response.headers["Cache-Control"] = "no-store"

    # 5. Operational log: never includes the submitted code itself.
    latency_ms = (time.perf_counter() - started_at) * 1000.0
    error_code = "-" if result.get("status") == "verified" else str(result.get("status", "unknown"))
    logger.info(
        "verification_completed request_id=%s task_id=%s gate=%s latency_ms=%.1f error_code=%s",
        request_id,
        payload.task_id,
        result.get("gate_reached"),
        latency_ms,
        error_code,
    )
    return result


@app.post("/api/cards/{card_hash}/defense", response_model=DefenseResponse)
async def seal_defense_endpoint(
    card_hash: str,
    payload: DefenseRequest,
    request: Request,
    x_defense_token: str | None = Header(None),
):
    """
    Seals a card defense exactly once, bound to the one-time challenge token.

    Status contract: 200 sealed; 401 missing ``X-Defense-Token``; 403 token
    mismatch; 404 unknown card; 409 already sealed, no challenge was ever issued
    (legacy card), or the card is not ``verified``; 413 body above 16 KB (enforced
    by the request middleware); 422 invalid answer envelope; 429 over the per-IP
    limit (5 requests / minute, separate bucket from verification).
    """
    client_ip = request.client.host if request.client else "unknown"
    if not _check_defense_rate_limit(client_ip):
        raise HTTPException(
            status_code=429,
            detail="Превышен лимит попыток защиты: не более 5 в минуту с одного IP-адреса",
        )

    if not x_defense_token or not x_defense_token.strip():
        raise HTTPException(status_code=401, detail="Требуется заголовок X-Defense-Token")

    status = defense_challenge_status(card_hash)
    if status == "missing":
        raise HTTPException(status_code=404, detail="Verified Skill Card not found")
    if status == "sealed":
        raise HTTPException(status_code=409, detail="Защита уже записана для этой карточки")
    if status == "ineligible":
        raise HTTPException(
            status_code=409,
            detail=(
                "Защита доступна только для карточек со статусом verified: "
                "заблокированные и отклонённые решения защищать нельзя"
            ),
        )
    if status == "absent":
        raise HTTPException(
            status_code=409,
            detail="Для этой карточки не выпускался вызов защиты — записать защиту нельзя",
        )

    try:
        sealed = seal_card_defense(
            card_hash,
            hash_token(x_defense_token.strip()),
            payload.answers,
        )
    except AlreadyDefended:
        # Lost a concurrent seal: report the recorded state, never the token.
        raise HTTPException(status_code=409, detail="Защита уже записана для этой карточки") from None
    except PermissionError:
        raise HTTPException(status_code=403, detail="Неверный токен защиты") from None
    except LookupError:
        raise HTTPException(status_code=404, detail="Verified Skill Card not found") from None
    except ValueError:
        raise HTTPException(status_code=422, detail="Некорректный набор ответов защиты") from None

    return sealed


# =============================================================================
# Frontend & Static Files Routing
# =============================================================================

@app.get("/")
async def serve_index():
    """
    Serves the main single-page application dashboard.
    """
    index_file = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return JSONResponse({
        "status": "ok",
        "message": "Merilo API active. Frontend index.html located in static/."
    })


@app.get("/card/{card_hash}")
async def serve_card(card_hash: str):
    """
    Serves the public Verified Skill Card view for recruiters and social sharing.
    """
    card_file = os.path.join(STATIC_DIR, "card.html")
    if os.path.exists(card_file):
        return FileResponse(card_file)
    return JSONResponse({
        "status": "ok",
        "card_hash": card_hash,
        "message": "Verified Skill Card view located in static/card.html."
    })


@app.get("/p/{slug}")
async def serve_profile(slug: str):
    """
    Serves the public candidate profile for an opaque profile slug.

    The static page always renders; it is the summary endpoint that decides
    whether the slug exists. An unknown slug therefore shows the profile's empty
    state ("profile not found") rather than a server-level 404 page, so the
    public route never becomes an existence oracle beyond the API contract.
    """
    profile_file = os.path.join(STATIC_DIR, "profile.html")
    if os.path.exists(profile_file):
        return FileResponse(profile_file)
    return JSONResponse({
        "status": "ok",
        "profile_slug": slug,
        "message": "Public candidate profile located in static/profile.html."
    })


@app.get("/app", include_in_schema=False)
async def serve_workspace():
    """Serves the role-aware workspace SPA (hash-routed, static/workspace.html)."""
    return FileResponse(os.path.join(STATIC_DIR, "workspace.html"))


@app.get("/help", include_in_schema=False)
async def serve_help():
    """Serves the standalone help and product-guide page."""
    help_file = os.path.join(STATIC_DIR, "help.html")
    if os.path.exists(help_file):
        return FileResponse(help_file)
    return JSONResponse({"status": "ok", "message": "Help page located in static/help.html."})


# Recruiter workspace API (OpenAI + GitHub evidence) — additive router.
from backend.workspace_api import router as workspace_router  # noqa: E402

app.include_router(workspace_router)

# Talent agent, Developer DNA, adaptive challenges, extension bridge — additive router.
from backend.agent_api import router as agent_router  # noqa: E402

app.include_router(agent_router)

# Mount static assets directory
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
