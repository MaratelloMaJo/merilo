"""
Merilo — Database & Cryptographic Security Layer
Zero external C-dependency SQLite3 implementation with PBKDF2 password hashing,
HMAC-SHA256 skill card tamper-proof digital signing, and user identity management.
"""

import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import sys
from datetime import UTC, datetime
from typing import Any

from backend.signing import build_manifest, manifest_content_hash, sign_manifest

# New env var name (MERILO_DB_PATH) takes priority; legacy MARYM_DB_PATH is kept
# as a fallback so existing deployments continue to work after the rebrand.
DEFAULT_DB_PATH = (
    os.getenv("MERILO_DB_PATH")
    or os.getenv("MARYM_DB_PATH")
    or os.path.join(os.path.dirname(os.path.abspath(__file__)), "merilo.db")
)

MERILO_ENV = os.getenv("MERILO_ENV", "development").strip().lower()


def _load_hmac_secret() -> bytes:
    """
    Loads the HMAC-SHA256 signing key from the environment.

    - ``MERILO_HMAC_SECRET`` is the canonical variable. ``MERILO_SECRET_KEY`` and
      ``MARYM_SECRET_KEY`` are accepted as deprecated aliases for older deployments.
    - In production the key is mandatory: the process fails fast instead of silently
      signing cards with a guessable literal.
    - In development/test an ephemeral random key is generated once per process.
      Cards signed with it stop verifying after a restart — acceptable for local demos.
    """
    explicit_secret = (
        os.getenv("MERILO_HMAC_SECRET")
        or os.getenv("MERILO_SECRET_KEY")
        or os.getenv("MARYM_SECRET_KEY")
    )
    if explicit_secret:
        return explicit_secret.encode("utf-8")

    current_env = os.getenv("MERILO_ENV", "development").strip().lower()
    if current_env == "production":
        raise RuntimeError(
            "MERILO_HMAC_SECRET is required in production. "
            "Generate one with: python -c \"import secrets; print(secrets.token_hex(32))\""
        )

    print(
        "WARNING: MERILO_HMAC_SECRET is not set; using an ephemeral secret. "
        "Skill-card signatures will not verify across restarts.",
        file=sys.stderr,
    )
    return secrets.token_bytes(32)


SECRET_KEY = _load_hmac_secret()

logger = logging.getLogger("merilo.db")


# =============================================================================
# Cryptography & Signing Utilities (Zero external C-dependencies)
# =============================================================================

SCRYPT_PREFIX = "scrypt$"
SCRYPT_N = 2 ** 14  # CPU/memory cost (~16 MiB per hash)
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32


def hash_password(password: str) -> tuple[str, str]:
    """
    Generates a secure 16-byte random salt and computes a memory-hard scrypt hash.

    Returns: (stored_hash, salt_hex), where stored_hash is prefixed with
    "scrypt$" so verify_password can distinguish it from legacy PBKDF2 hashes.
    """
    salt = secrets.token_hex(16)
    password_hash = hashlib.scrypt(
        password.encode(),
        salt=salt.encode(),
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
    ).hex()
    return f"{SCRYPT_PREFIX}{password_hash}", salt


def verify_password(password: str, password_hash: str, salt: str) -> bool:
    """
    Verifies a password using constant-time comparison.

    Supports scrypt hashes ("scrypt$<hex>") and legacy PBKDF2-HMAC-SHA256
    hashes (bare 64-char hex) created before the scrypt migration.
    """
    if password_hash.startswith(SCRYPT_PREFIX):
        computed_hash = hashlib.scrypt(
            password.encode(),
            salt=salt.encode(),
            n=SCRYPT_N,
            r=SCRYPT_R,
            p=SCRYPT_P,
            dklen=SCRYPT_DKLEN,
        ).hex()
        return hmac.compare_digest(computed_hash, password_hash[len(SCRYPT_PREFIX):])

    # Legacy PBKDF2-HMAC-SHA256 (kept for users seeded before the migration).
    computed_hash = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode(),
        salt.encode(),
        100_000
    ).hex()
    return hmac.compare_digest(computed_hash, password_hash)


def sign_card(card_hash: str, user_id: str, total_score: int) -> str:
    """
    Generates a cryptographically unforgeable HMAC-SHA256 signature for a Skill Card.
    Binds the card hash, candidate user ID, and awarded score to platform secret key.
    """
    payload = f"{card_hash}:{user_id}:{total_score}".encode()
    return hmac.new(SECRET_KEY, payload, hashlib.sha256).hexdigest()


def verify_card_signature(card_data: dict[str, Any]) -> bool:
    """
    Verifies that a Skill Card's HMAC-SHA256 signature is authentic and untampered.
    """
    signature = card_data.get("signature")
    if not signature:
        return False
    card_hash = card_data.get("card_hash", "")
    user_id = card_data.get("user_id") or ""
    total_score = int(card_data.get("total_score", 0))
    expected = sign_card(card_hash, user_id, total_score)
    return hmac.compare_digest(signature, expected)


# =============================================================================
# Public profile identity (opaque, deterministic, never the raw user id)
# =============================================================================

PROFILE_SLUG_PREFIX = "merilo-profile:"
PROFILE_SLUG_LENGTH = 12


def profile_slug(user_id: str) -> str:
    """Opaque public identifier for a candidate profile.

    ``sha256("merilo-profile:" + user_id)[:12]`` — deterministic, so a shared
    profile link stays stable, and one-way, so a public page never carries the
    internal ``usr_…`` identifier. An empty user id has no public profile.
    """
    if not isinstance(user_id, str) or not user_id:
        return ""
    digest = hashlib.sha256(
        (PROFILE_SLUG_PREFIX + user_id).encode("utf-8")
    ).hexdigest()
    return digest[:PROFILE_SLUG_LENGTH]


def profile_url_for_user(user_id: str | None) -> str | None:
    """Relative public profile URL for a user, or ``None`` when unowned."""
    slug = profile_slug(user_id or "")
    return f"/p/{slug}" if slug else None


def create_session_token(user_id: str) -> str:
    """
    Issues a stateless, cryptographically signed session token: user_id:timestamp:sig
    """
    timestamp = int(datetime.now(UTC).timestamp())
    payload = f"{user_id}:{timestamp}"
    sig = hmac.new(SECRET_KEY, payload.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{payload}:{sig}"


def verify_session_token(token: str) -> str | None:
    """
    Validates a session token signature and returns the user_id if authentic.

    Malformed input (non-string, wrong number of segments, non-ASCII signature)
    is a normal authentication failure, so it returns ``None`` instead of raising.
    """
    try:
        parts = token.strip().split(":")
        if len(parts) != 3:
            return None
        user_id, timestamp_str, sig = parts
        payload = f"{user_id}:{timestamp_str}"
        expected = hmac.new(SECRET_KEY, payload.encode(), hashlib.sha256).hexdigest()[:32]
        if hmac.compare_digest(sig, expected):
            return user_id
    except (ValueError, AttributeError, TypeError):
        return None
    return None


# =============================================================================
# Database Connection & Schema Management
# =============================================================================

def get_db_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    """
    Creates and returns a connection to SQLite with row_factory set to sqlite3.Row.

    The connection is tuned for a small single-process demo deployment:
    WAL journaling (readers never block the writer), a 5s busy timeout instead of
    an instant "database is locked", NORMAL synchronous mode (safe under WAL) and
    enforced foreign keys. PRAGMA statements return rows, so their output is
    intentionally discarded rather than asserted on.
    """
    db_dir = os.path.dirname(os.path.abspath(db_path))
    if db_dir:
        os.makedirs(db_dir, exist_ok=True)

    conn = sqlite3.connect(db_path, timeout=5.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=5000;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def ping_db(db_path: str = DEFAULT_DB_PATH) -> bool:
    """
    Lightweight liveness probe for the SQLite layer.

    Returns True when a connection can be opened and ``SELECT 1`` succeeds,
    False on any expected storage failure. Never raises; the connection is
    always closed.
    """
    try:
        conn = get_db_connection(db_path)
    except (sqlite3.Error, OSError):
        return False

    try:
        conn.execute("SELECT 1").fetchone()
        return True
    except (sqlite3.Error, OSError):
        return False
    finally:
        conn.close()


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """
    Initializes SQLite tables for users, micro-tasks, and cryptographically signed skill cards.
    Applies automatic zero-downtime column migrations if database already exists.
    """
    conn = get_db_connection(db_path)
    try:
        with conn:
            # 1. Users Table with Cryptographic Salt and Password Hash
            conn.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    salt TEXT NOT NULL,
                    full_name TEXT NOT NULL,
                    role TEXT NOT NULL DEFAULT 'candidate',
                    secondary_role TEXT,
                    created_at TEXT NOT NULL
                );
            """)

            # 2. Micro Tasks Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS micro_tasks (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    stack TEXT NOT NULL,
                    difficulty TEXT NOT NULL,
                    description TEXT NOT NULL,
                    rubric TEXT NOT NULL,
                    buggy_code TEXT NOT NULL,
                    preset_ideal TEXT NOT NULL,
                    preset_vulnerable TEXT NOT NULL,
                    preset_injection TEXT NOT NULL,
                    preset_ideal_name TEXT NOT NULL DEFAULT 'Эталонная реализация',
                    preset_vulnerable_name TEXT NOT NULL DEFAULT 'Базовая реализация',
                    preset_injection_name TEXT NOT NULL DEFAULT 'Альтернативное решение',
                    language TEXT NOT NULL DEFAULT 'python',
                    created_at TEXT NOT NULL
                );
            """)

            # 3. Verified Skill Cards Table with HMAC Signature & User Association
            conn.execute("""
                CREATE TABLE IF NOT EXISTS skill_cards (
                    card_hash TEXT PRIMARY KEY,
                    candidate_name TEXT NOT NULL,
                    task_id TEXT NOT NULL,
                    task_title TEXT NOT NULL,
                    company_name TEXT NOT NULL,
                    total_score INTEGER NOT NULL,
                    badge_tier TEXT NOT NULL,
                    status TEXT NOT NULL,
                    gate_reached INTEGER NOT NULL,
                    clean_code INTEGER NOT NULL,
                    architecture INTEGER NOT NULL,
                    edge_cases INTEGER NOT NULL,
                    executive_summary TEXT NOT NULL,
                    evaluation_json TEXT NOT NULL,
                    submitted_code TEXT NOT NULL,
                    verify_url TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    user_id TEXT,
                    signature TEXT,
                    language TEXT NOT NULL DEFAULT 'python',
                    ai_assisted INTEGER NOT NULL DEFAULT 0,
                    duration_ms INTEGER NOT NULL DEFAULT 0,
                    rubric_version TEXT NOT NULL DEFAULT '',
                    model TEXT NOT NULL DEFAULT '',
                    defense_questions_json TEXT,
                    defense_answers_json TEXT,
                    defense_hash TEXT,
                    defense_signature TEXT,
                    defense_token_hash TEXT,
                    defended_at TEXT,
                    manifest_json TEXT,
                    ed25519_signature TEXT
                );
            """)

            # Safe Schema Migrations for Existing SQLite DBs
            cursor = conn.cursor()

            # Check micro_tasks columns
            cursor.execute("PRAGMA table_info(micro_tasks)")
            task_cols = [row["name"] for row in cursor.fetchall()]
            if "preset_ideal_name" not in task_cols:
                conn.execute(
                    "ALTER TABLE micro_tasks ADD COLUMN preset_ideal_name TEXT NOT NULL "
                    "DEFAULT 'Эталонная реализация'"
                )
            if "preset_vulnerable_name" not in task_cols:
                conn.execute(
                    "ALTER TABLE micro_tasks ADD COLUMN preset_vulnerable_name TEXT NOT NULL "
                    "DEFAULT 'Базовая реализация'"
                )
            if "preset_injection_name" not in task_cols:
                conn.execute(
                    "ALTER TABLE micro_tasks ADD COLUMN preset_injection_name TEXT NOT NULL "
                    "DEFAULT 'Альтернативное решение'"
                )
            if "language" not in task_cols:
                conn.execute(
                    "ALTER TABLE micro_tasks ADD COLUMN language TEXT NOT NULL DEFAULT 'python'"
                )

            # Check skill_cards columns
            cursor.execute("PRAGMA table_info(skill_cards)")
            card_cols = [row["name"] for row in cursor.fetchall()]
            if "user_id" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN user_id TEXT")
            if "signature" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN signature TEXT")
            if "language" not in card_cols:
                conn.execute(
                    "ALTER TABLE skill_cards ADD COLUMN language TEXT NOT NULL DEFAULT 'python'"
                )
            if "ai_assisted" not in card_cols:
                conn.execute(
                    "ALTER TABLE skill_cards ADD COLUMN ai_assisted INTEGER NOT NULL DEFAULT 0"
                )
            if "duration_ms" not in card_cols:
                conn.execute(
                    "ALTER TABLE skill_cards ADD COLUMN duration_ms INTEGER NOT NULL DEFAULT 0"
                )
            if "rubric_version" not in card_cols:
                conn.execute(
                    "ALTER TABLE skill_cards ADD COLUMN rubric_version TEXT NOT NULL DEFAULT ''"
                )
            if "model" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN model TEXT NOT NULL DEFAULT ''")
            if "defense_questions_json" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN defense_questions_json TEXT")
            if "defense_answers_json" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN defense_answers_json TEXT")
            if "defense_hash" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN defense_hash TEXT")
            if "defense_signature" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN defense_signature TEXT")
            if "defense_token_hash" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN defense_token_hash TEXT")
            if "defended_at" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN defended_at TEXT")
            if "manifest_json" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN manifest_json TEXT")
            if "ed25519_signature" not in card_cols:
                conn.execute("ALTER TABLE skill_cards ADD COLUMN ed25519_signature TEXT")

            # Check users columns
            cursor.execute("PRAGMA table_info(users)")
            user_cols = [row["name"] for row in cursor.fetchall()]
            if "secondary_role" not in user_cols:
                conn.execute("ALTER TABLE users ADD COLUMN secondary_role TEXT")

            # Backfill metadata for cards created before rubric/model existed.
            # Only empty values are touched: an explicit value is never overwritten.
            # Imports stay local so ``backend.db`` remains importable on its own.
            try:
                from backend.verifier import RUBRIC_VERSION, get_gemini_model

                default_rubric_version = RUBRIC_VERSION
                default_model = get_gemini_model()
            except ImportError:  # pragma: no cover - defensive for stripped deployments
                default_rubric_version = "2026-11-v1"
                default_model = "gemini-3.6-flash"
            conn.execute(
                "UPDATE skill_cards SET rubric_version = ? "
                "WHERE rubric_version IS NULL OR TRIM(rubric_version) = ''",
                (default_rubric_version,),
            )
            conn.execute(
                "UPDATE skill_cards SET model = ? "
                "WHERE model IS NULL OR TRIM(model) = ''",
                (default_model,),
            )

            # Indexes for fast B2B queries
            conn.execute("CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_skill_cards_task ON skill_cards (task_id);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_skill_cards_created ON skill_cards (created_at DESC);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_skill_cards_user_id ON skill_cards (user_id);")
    finally:
        conn.close()


# =============================================================================
# User Identity Management
# =============================================================================

def create_user(
    email: str,
    password: str,
    full_name: str,
    role: str = "candidate",
    db_path: str = DEFAULT_DB_PATH,
    secondary_role: str | None = None,
) -> dict[str, Any]:
    """
    Creates a new user record with cryptographically secure scrypt salt and hash.

    The user id is derived deterministically from the normalized email
    (``usr_`` + 16 hex chars of ``sha256(email)``): the same candidate always gets
    the same id in every database, so a card hash that includes ``user_id`` stays
    stable across fresh deployments. Distinct emails map to distinct ids (barring
    a 64-bit prefix collision).

    Returns sanitized user profile dictionary.
    """
    conn = get_db_connection(db_path)
    try:
        clean_email = email.strip().lower()
        user_id = f"usr_{hashlib.sha256(clean_email.encode('utf-8')).hexdigest()[:16]}"
        password_hash, salt = hash_password(password)
        created_at = datetime.now(UTC).isoformat()

        with conn:
            conn.execute("""
                INSERT INTO users (id, email, password_hash, salt, full_name, role, secondary_role, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                user_id, clean_email, password_hash, salt, full_name.strip(),
                role, secondary_role, created_at,
            ))

        return {
            "id": user_id,
            "email": clean_email,
            "full_name": full_name.strip(),
            "role": role,
            "secondary_role": secondary_role,
            "created_at": created_at,
        }
    finally:
        conn.close()


def get_user_by_email(email: str, db_path: str = DEFAULT_DB_PATH) -> dict[str, Any] | None:
    """
    Retrieves full user record by email (including password_hash and salt for auth).
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def get_user_by_id(user_id: str, db_path: str = DEFAULT_DB_PATH) -> dict[str, Any] | None:
    """
    Retrieves full user record by identifier.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
        row = cursor.fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def set_user_secondary_role(
    user_id: str,
    secondary_role: str | None,
    db_path: str = DEFAULT_DB_PATH,
) -> bool:
    """Sets (or clears) the optional second role for a user."""
    conn = get_db_connection(db_path)
    try:
        with conn:
            cursor = conn.execute(
                "UPDATE users SET secondary_role = ? WHERE id = ?",
                (secondary_role, user_id),
            )
        return cursor.rowcount > 0
    finally:
        conn.close()


def get_all_users(db_path: str = DEFAULT_DB_PATH) -> list[dict[str, Any]]:
    """
    Retrieves list of all registered platform users with sanitized public profiles.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, email, full_name, role, secondary_role, created_at "
            "FROM users ORDER BY created_at ASC"
        )
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_public_users(db_path: str = DEFAULT_DB_PATH) -> list[dict[str, Any]]:
    """Recruiter-facing user directory without identifiers or contact details.

    Neither the raw ``user_id`` nor the email is exposed: a caller that needs to
    link a profile uses the opaque ``profile_slug`` returned here.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT id, full_name, role, created_at FROM users ORDER BY created_at ASC"
        )
        return [
            {
                "profile_slug": profile_slug(row["id"]),
                "full_name": row["full_name"],
                "role": row["role"],
                "created_at": row["created_at"],
            }
            for row in cursor.fetchall()
        ]
    finally:
        conn.close()


# =============================================================================
# Micro-tasks Repository
# =============================================================================

def _format_task_row(row: sqlite3.Row) -> dict[str, Any]:
    task = dict(row)
    if isinstance(task.get("rubric"), str):
        try:
            task["rubric"] = json.loads(task["rubric"])
        except (json.JSONDecodeError, TypeError):
            pass
    if "preset_ideal_name" not in task:
        task["preset_ideal_name"] = "Эталонная реализация"
    if "preset_vulnerable_name" not in task:
        task["preset_vulnerable_name"] = "Базовая реализация"
    if "preset_injection_name" not in task:
        task["preset_injection_name"] = "Альтернативное решение"
    if "language" not in task:
        task["language"] = "python"
    return task


def get_all_tasks(db_path: str = DEFAULT_DB_PATH) -> list[dict[str, Any]]:
    """
    Retrieves all micro-tasks for the demo selector.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        # Newest curated tasks stay stable; recruiter-created tasks appear last.
        cursor.execute("SELECT * FROM micro_tasks ORDER BY created_at ASC, id ASC")
        rows = cursor.fetchall()
        return [_format_task_row(row) for row in rows]
    finally:
        conn.close()


def get_task_by_id(task_id: str, db_path: str = DEFAULT_DB_PATH) -> dict[str, Any] | None:
    """
    Retrieves a single micro-task by its ID.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM micro_tasks WHERE id = ?", (task_id,))
        row = cursor.fetchone()
        return _format_task_row(row) if row else None
    finally:
        conn.close()


def create_custom_task(
    title: str,
    company_name: str,
    stack: str,
    difficulty: str,
    description: str,
    rubric_json: str,
    buggy_code: str,
    preset_ideal: str = "",
    preset_vulnerable: str = "",
    preset_injection: str = "",
    created_at: str | None = None,
    language: str = "python",
    db_path: str = DEFAULT_DB_PATH,
) -> dict[str, Any]:
    """
    Persists a recruiter-posted micro-task with neutral preset naming.
    All values are passed as bound SQL parameters (no string interpolation — SQLi-safe).
    """
    conn = get_db_connection(db_path)
    try:
        task_id = f"task-custom-{secrets.token_hex(4)}"
        created_at = created_at or datetime.now(UTC).isoformat()
        with conn:
            conn.execute("""
                INSERT INTO micro_tasks (
                    id,
                    title,
                    company_name,
                    stack,
                    difficulty,
                    description,
                    rubric,
                    buggy_code,
                    preset_ideal,
                    preset_vulnerable,
                    preset_injection,
                    preset_ideal_name,
                    preset_vulnerable_name,
                    preset_injection_name,
                    language,
                    created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (
                task_id,
                title.strip(),
                company_name.strip(),
                stack.strip(),
                difficulty.strip(),
                description.strip(),
                rubric_json,
                buggy_code,
                preset_ideal,
                preset_vulnerable,
                preset_injection,
                "Эталонная реализация",
                "Базовая реализация",
                "Альтернативное решение",
                language.strip() or "python",
                created_at,
            ))
        return get_task_by_id(task_id, db_path=db_path) or {"id": task_id}
    finally:
        conn.close()


# =============================================================================
# Skill Cards Repository & HMAC Digital Signing
# =============================================================================

def save_skill_card(card_data: dict[str, Any], db_path: str = DEFAULT_DB_PATH) -> dict[str, Any]:
    """
    Saves or updates a verified Skill Card in SQLite, ensuring HMAC-SHA256 digital signature
    and candidate user binding are properly computed and persisted.

    Updates are restricted to the verifier-owned columns: the defense columns
    (``defense_questions_json``, ``defense_answers_json``, ``defense_hash``,
    ``defense_signature``, ``defense_token_hash``, ``defended_at``) are owned by
    :mod:`backend.defense` and are never touched by a re-save. The portable
    Ed25519 ``manifest_json``/``ed25519_signature`` pair is recomputed on every
    save (including the stored defense hash, which is read but never written).

    The manifest is bound to ``db_path``: its ``task_sha256`` is derived from the
    task row in the *same* database as the card, so a card saved into a fresh or
    side database never reads (or depends on) the module default.
    """
    conn = get_db_connection(db_path)
    try:
        evaluation = card_data.get("evaluation")
        evaluation_json = card_data.get("evaluation_json")

        if not evaluation_json and isinstance(evaluation, dict):
            evaluation_json = json.dumps(evaluation, ensure_ascii=False)
        elif not evaluation_json and evaluation is not None and hasattr(evaluation, "model_dump"):
            evaluation_json = json.dumps(evaluation.model_dump(), ensure_ascii=False)
        elif not evaluation_json:
            evaluation_json = "{}"

        created_at = card_data.get("created_at") or datetime.now(UTC).isoformat()
        card_hash = card_data["card_hash"]
        verify_url = card_data.get("verify_url") or f"/card/{card_hash}"
        total_score = int(card_data.get("total_score", 0))

        # Associate with user_id or resolve default candidate
        user_id = card_data.get("user_id") or ""
        if not user_id:
            cursor = conn.cursor()
            cursor.execute("SELECT id FROM users ORDER BY created_at ASC LIMIT 1")
            u_row = cursor.fetchone()
            if u_row:
                user_id = u_row["id"]

        # Ensure cryptographically authentic signature
        signature = card_data.get("signature")
        if not signature:
            signature = sign_card(card_hash, user_id, total_score)

        # Portable Ed25519 manifest: persisted next to the HMAC signature so a
        # recruiter can verify the card offline. A re-save must not drop the
        # manifest's ``defense_hash``, so the stored defense hash (owned by
        # ``backend.defense``) is read here and covered by the new manifest
        # without ever being written by this function.
        existing_defense_hash = None
        existing_row = conn.execute(
            "SELECT defense_hash FROM skill_cards WHERE card_hash = ?", (card_hash,)
        ).fetchone()
        if existing_row:
            existing_defense_hash = existing_row["defense_hash"]

        manifest_source = dict(card_data)
        manifest_source.update({
            "created_at": created_at,
            "total_score": total_score,
            "language": card_data.get("language") or "python",
            "ai_assisted": bool(card_data.get("ai_assisted")),
            "rubric_version": card_data.get("rubric_version") or "",
            "model": card_data.get("model") or "",
        })
        if not manifest_source.get("defense_hash") and existing_defense_hash:
            manifest_source["defense_hash"] = existing_defense_hash
        try:
            manifest = build_manifest(manifest_source, db_path=db_path)
            manifest["content_hash"] = manifest_content_hash(manifest)
            manifest_json = json.dumps(manifest, ensure_ascii=False)
            ed25519_signature = sign_manifest(manifest)
        except RuntimeError as exc:
            # A missing/invalid Ed25519 seed in production must not break card
            # verification or startup seeding. The manifest endpoint and the CLI
            # still raise/fail at the point where the key is actually used.
            logger.warning(
                "manifest_signing_skipped card_hash=%s error=%s",
                card_hash,
                type(exc).__name__,
            )
            manifest_json = None
            ed25519_signature = None

        # ``ON CONFLICT DO UPDATE`` instead of ``INSERT OR REPLACE``: REPLACE
        # deletes the existing row and inserts a fresh one, so any column omitted
        # from the INSERT list (the six defense columns) would be reset to NULL.
        # Re-saving a card happens on every re-verification of the same
        # submission (same deterministic ``card_hash``), which must never erase a
        # recorded defense or allow a second seal.
        with conn:
            conn.execute("""
                INSERT INTO skill_cards (
                    card_hash,
                    candidate_name,
                    task_id,
                    task_title,
                    company_name,
                    total_score,
                    badge_tier,
                    status,
                    gate_reached,
                    clean_code,
                    architecture,
                    edge_cases,
                    executive_summary,
                    evaluation_json,
                    submitted_code,
                    verify_url,
                    created_at,
                    user_id,
                    signature,
                    language,
                    ai_assisted,
                    duration_ms,
                    rubric_version,
                    model,
                    manifest_json,
                    ed25519_signature
                ) VALUES (
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
                )
                ON CONFLICT(card_hash) DO UPDATE SET
                    candidate_name = excluded.candidate_name,
                    task_id = excluded.task_id,
                    task_title = excluded.task_title,
                    company_name = excluded.company_name,
                    total_score = excluded.total_score,
                    badge_tier = excluded.badge_tier,
                    status = excluded.status,
                    gate_reached = excluded.gate_reached,
                    clean_code = excluded.clean_code,
                    architecture = excluded.architecture,
                    edge_cases = excluded.edge_cases,
                    executive_summary = excluded.executive_summary,
                    evaluation_json = excluded.evaluation_json,
                    submitted_code = excluded.submitted_code,
                    verify_url = excluded.verify_url,
                    created_at = excluded.created_at,
                    user_id = excluded.user_id,
                    signature = excluded.signature,
                    language = excluded.language,
                    ai_assisted = excluded.ai_assisted,
                    duration_ms = excluded.duration_ms,
                    rubric_version = excluded.rubric_version,
                    model = excluded.model,
                    manifest_json = excluded.manifest_json,
                    ed25519_signature = excluded.ed25519_signature;
            """, (
                card_hash,
                card_data.get("candidate_name", "Anonymous Candidate"),
                card_data.get("task_id", ""),
                card_data.get("task_title", ""),
                card_data.get("company_name", ""),
                total_score,
                card_data.get("badge_tier", "Needs Work"),
                card_data.get("status", "verified"),
                int(card_data.get("gate_reached", 3)),
                int(card_data.get("clean_code", 0)),
                int(card_data.get("architecture", 0)),
                int(card_data.get("edge_cases", 0)),
                card_data.get("executive_summary", ""),
                evaluation_json,
                card_data.get("submitted_code", ""),
                verify_url,
                created_at,
                user_id,
                signature,
                card_data.get("language") or "python",
                1 if card_data.get("ai_assisted") else 0,
                int(card_data.get("duration_ms", 0)),
                card_data.get("rubric_version") or "",
                card_data.get("model") or "",
                manifest_json,
                ed25519_signature,
            ))

        return get_skill_card(card_hash, db_path=db_path) or card_data
    finally:
        conn.close()


def get_skill_card_private(
    card_hash: str, db_path: str = DEFAULT_DB_PATH
) -> dict[str, Any] | None:
    """
    Retrieves the complete persisted row, including internal fields such as
    ``submitted_code``, ``user_id`` and ``evaluation_json``.

    This is intentionally *private*: callers that serve HTTP must use
    :func:`get_public_skill_card` so that a newly added column can never leak
    through ``SELECT *`` by default.
    """
    conn = get_db_connection(db_path)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM skill_cards WHERE card_hash = ?", (card_hash,))
        row = cursor.fetchone()
        if not row:
            return None

        card = dict(row)
        # SQLite stores booleans as integers; the API contract exposes a real bool.
        card["ai_assisted"] = bool(card.get("ai_assisted", 0))
        card["duration_ms"] = int(card.get("duration_ms", 0) or 0)
        card["rubric_version"] = card.get("rubric_version") or ""
        card["model"] = card.get("model") or ""
        card["language"] = card.get("language") or "python"
        # Verify HMAC-SHA256 signature authenticity
        card["is_signature_valid"] = verify_card_signature(card)

        # Parse evaluation JSON for rich frontend consumption
        try:
            card["evaluation"] = json.loads(card["evaluation_json"])
        except (json.JSONDecodeError, TypeError):
            card["evaluation"] = {
                "clean_code": card.get("clean_code", 0),
                "architecture": card.get("architecture", 0),
                "edge_cases": card.get("edge_cases", 0),
                "is_plagiarized_or_injected": False,
                "executive_summary": card.get("executive_summary", "")
            }
        return card
    finally:
        conn.close()


def get_skill_card(card_hash: str, db_path: str = DEFAULT_DB_PATH) -> dict[str, Any] | None:
    """Backward-compatible full-row accessor used by internal callers.

    HTTP handlers must not use this function directly; :func:`get_public_skill_card`
    applies the public whitelist.
    """
    return get_skill_card_private(card_hash, db_path=db_path)


# The only fields a public card may ever expose. Anything not listed here —
# ``submitted_code``, ``user_id``, ``evaluation_json``, future tokens/hashes —
# stays private by construction.
PUBLIC_CARD_FIELDS: tuple[str, ...] = (
    "card_hash",
    "candidate_name",
    "task_id",
    "task_title",
    "company_name",
    "language",
    "status",
    "gate_reached",
    "total_score",
    "badge_tier",
    "verify_url",
    "created_at",
    # Derived, never stored: ``/p/{profile_slug}``. The raw ``user_id`` is not
    # part of the public contract, so this is the only identity link a card has.
    "profile_url",
    "evaluation",
    "signature",
    "is_signature_valid",
    "evaluation_mode",
    "ai_assisted",
    "duration_ms",
    "rubric_version",
    "model",
    # Defense projection: questions/answers are public after sealing, the token
    # hash and the raw code never are. ``defense_status`` is derived.
    "defense_questions",
    "defense_answers",
    "defense_hash",
    "defense_signature",
    "defended_at",
    "defense_status",
)


def serialize_public_card(card: dict[str, Any]) -> dict[str, Any]:
    """Projects a private card row onto the public whitelist.

    ``evaluation_mode`` is persisted inside ``evaluation_json`` rather than as a
    column, so it is lifted to the top level when missing. The six defense
    columns are parsed/derived by :func:`backend.defense.defense_state_for_card`
    so JSON payloads and ``defense_status`` never leak raw storage columns.
    """
    public = {field: card.get(field) for field in PUBLIC_CARD_FIELDS}
    # ``profile_url`` is derived from the private user binding; the binding
    # itself is never projected, so a public payload cannot carry a user id.
    public["profile_url"] = profile_url_for_user(card.get("user_id"))
    if not public.get("evaluation_mode"):
        evaluation = card.get("evaluation")
        if isinstance(evaluation, dict):
            public["evaluation_mode"] = evaluation.get("evaluation_mode")

    # Imported lazily: ``backend.defense`` imports this module at import time.
    from backend.defense import defense_state_for_card

    try:
        defense = defense_state_for_card(card)
    except ValueError:
        # A tampered payload must not turn one card's public read into a 500.
        # Withhold the defense instead of publishing a repaired/partial record.
        defense = defense_state_for_card(None)
    public.update(defense)
    return public


def get_public_skill_card(
    card_hash: str, db_path: str = DEFAULT_DB_PATH
) -> dict[str, Any] | None:
    """Public read model for ``GET /api/cards/{hash}``."""
    card = get_skill_card_private(card_hash, db_path=db_path)
    return serialize_public_card(card) if card else None


# The only fields a *summary* listing (public profile, recruiter stream) may
# expose. ``candidate_name`` is deliberately absent: the profile is identified
# by its opaque slug, and a listing must not become a name/email directory.
PUBLIC_CARD_SUMMARY_FIELDS: tuple[str, ...] = (
    "card_hash",
    "task_title",
    "language",
    "total_score",
    "badge_tier",
    "created_at",
    "defense_status",
    "verify_url",
    "profile_url",
)

_SLUG_HEX_CHARS = frozenset("0123456789abcdef")


def serialize_card_summary(card: dict[str, Any]) -> dict[str, Any]:
    """Projects a private card row onto :data:`PUBLIC_CARD_SUMMARY_FIELDS`.

    ``defense_status`` is derived by :mod:`backend.defense`; a malformed defense
    payload is withheld (``unavailable``) instead of failing the whole listing.
    """
    summary = {field: card.get(field) for field in PUBLIC_CARD_SUMMARY_FIELDS}
    summary["language"] = card.get("language") or "python"
    summary["total_score"] = int(card.get("total_score") or 0)
    summary["profile_url"] = profile_url_for_user(card.get("user_id"))

    # Imported lazily: ``backend.defense`` imports this module at import time.
    from backend.defense import defense_state_for_card

    try:
        defense = defense_state_for_card(card)
    except ValueError:
        defense = defense_state_for_card(None)
    summary["defense_status"] = defense["defense_status"]
    return summary


# The recruiter feed ("Live Talent Stream") is richer than a profile summary: it
# names the candidate and states ``status``, because a recruiter is choosing whose
# card to open. It still carries no email, no raw user id and no code/answers.
RECENT_CARD_FIELDS: tuple[str, ...] = (
    "card_hash",
    "task_title",
    "language",
    "total_score",
    "badge_tier",
    "created_at",
    "defense_status",
    "status",
    "verify_url",
    "profile_url",
    "profile_slug",
    "candidate_name",
)

# Columns read in the single feed query. The three defense columns feed the
# bulk ``defense_status`` derivation (no per-card lookup, therefore no N+1).
_RECENT_CARD_SELECT = (
    "card_hash, candidate_name, task_title, language, total_score, badge_tier, "
    "created_at, status, verify_url, user_id, "
    "defense_questions_json, defense_token_hash, defended_at"
)


def serialize_recent_card(card: dict[str, Any], defense_status: str) -> dict[str, Any]:
    """Projects a private card row onto :data:`RECENT_CARD_FIELDS`.

    ``defense_status`` is passed in by the caller (see
    :func:`get_recent_public_cards`) so a whole page of cards is derived in one
    pass instead of one call per row.
    """
    summary = {field: card.get(field) for field in RECENT_CARD_FIELDS}
    summary["language"] = card.get("language") or "python"
    summary["total_score"] = int(card.get("total_score") or 0)
    summary["status"] = card.get("status") or ""
    summary["candidate_name"] = card.get("candidate_name") or ""
    summary["defense_status"] = defense_status
    summary["profile_url"] = profile_url_for_user(card.get("user_id"))
    summary["profile_slug"] = profile_slug(card.get("user_id") or "")
    return summary


def get_recent_public_cards(
    limit: int = 20, db_path: str = DEFAULT_DB_PATH
) -> list[dict[str, Any]]:
    """Newest verified cards, newest first, capped at ``limit`` rows.

    Two fixed costs regardless of page size: one ``SELECT`` for the card rows and
    one in-memory pass deriving ``defense_status`` from the defense columns that
    came with those rows. Only ``status='verified'`` cards are listed, matching
    the public profile rule. ``limit`` validation (1..100) belongs to the HTTP
    layer; this function trusts the caller.
    """
    conn = get_db_connection(db_path)
    try:
        rows = conn.execute(
            f"SELECT {_RECENT_CARD_SELECT} FROM skill_cards "
            "WHERE status = 'verified' "
            "ORDER BY created_at DESC, card_hash ASC LIMIT ?",
            (int(limit),),
        ).fetchall()
    finally:
        conn.close()

    cards = [dict(row) for row in rows]
    # Imported lazily: ``backend.defense`` imports this module at import time.
    from backend.defense import bulk_defense_status

    statuses = bulk_defense_status(cards)
    return [
        serialize_recent_card(card, status)
        for card, status in zip(cards, statuses, strict=True)
    ]


def resolve_profile_slug(
    slug: str, db_path: str = DEFAULT_DB_PATH
) -> str | None:
    """Resolves an opaque ``profile_slug`` to its internal user id, or ``None``.

    The user table is small, so the slug is matched by hashing each id rather
    than by storing a second identifier that could drift. Comparing in constant
    time keeps a guessed slug from leaking timing information.
    """
    if (
        not isinstance(slug, str)
        or len(slug) != PROFILE_SLUG_LENGTH
        or not set(slug) <= _SLUG_HEX_CHARS
    ):
        return None

    conn = get_db_connection(db_path)
    try:
        rows = conn.execute("SELECT id FROM users").fetchall()
    finally:
        conn.close()

    for row in rows:
        candidate = profile_slug(row["id"])
        if candidate and hmac.compare_digest(candidate, slug):
            return str(row["id"])
    return None


def get_public_cards_for_slug(
    slug: str, db_path: str = DEFAULT_DB_PATH
) -> list[dict[str, Any]] | None:
    """Public card summaries for a profile slug.

    Only ``status='verified'`` cards are listed: the page copy promises
    «Только проверенные карточки», and a rejected/blocked card must never reach
    a public profile or skew its average score.

    Returns ``None`` when the slug does not belong to any user (the HTTP layer
    answers 404) and ``[]`` when the profile exists but has no cards yet.
    """
    user_id = resolve_profile_slug(slug, db_path=db_path)
    if user_id is None:
        return None

    conn = get_db_connection(db_path)
    try:
        rows = conn.execute(
            "SELECT * FROM skill_cards WHERE user_id = ? AND status = 'verified' "
            "ORDER BY created_at DESC, card_hash ASC",
            (user_id,),
        ).fetchall()
        return [serialize_card_summary(dict(row)) for row in rows]
    finally:
        conn.close()
