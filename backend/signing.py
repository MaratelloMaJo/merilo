"""Merilo — portable Ed25519 card manifests, badges and QR codes.

A *manifest* is the portable, privacy-safe description of a Skill Card: it
carries only identity, verdict metadata and SHA-256 digests, never the submitted
code, the task text, the defense answers or any token hash. The canonical JSON
form is hashed (``content_hash``) and signed with Ed25519, so anyone holding the
public key can verify a manifest offline — no Merilo process, database or HMAC
secret required.

Key handling mirrors :mod:`backend.db`:

- ``MERILO_ED25519_SEED`` is the base64url encoding of exactly 32 seed bytes.
- In production a missing or malformed seed raises :class:`RuntimeError` the
  moment the key is used (fail fast, never sign with a guessable key).
- In development a missing/invalid seed falls back to one ephemeral per-process
  key with a warning, so a local demo never crashes.

The module also renders the public trust artifacts: the 320×120 SVG badge and
the SVG QR code pointing at the NFC card URL.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import io
import json
import logging
import os
import re
import secrets
import sqlite3
import urllib.parse
from typing import Any
from xml.sax.saxutils import escape

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

MANIFEST_VERSION = "merilo-card-v1"
SIGNATURE_ALGORITHM = "Ed25519"

# Exactly the fields covered by the signature. Digests only — no source text.
MANIFEST_FIELDS: tuple[str, ...] = (
    "version",
    "card_hash",
    "candidate_name",
    "task_id",
    "task_title",
    "language",
    "status",
    "total_score",
    "badge_tier",
    "code_sha256",
    "task_sha256",
    "defense_hash",
    "ai_assisted",
    "created_at",
    "rubric_version",
    "model",
)

SEED_ENV = "MERILO_ED25519_SEED"
SEED_BYTES = 32
PUBLIC_KEY_BYTES = 32
SIGNATURE_BYTES = 64

DEFAULT_PUBLIC_BASE_URL = "https://merilo-nfc.fly.dev"

# Paper / graphite / vermilion / olive palette shared by badge and QR.
PAPER = "#f6f1e7"
GRAPHITE = "#242424"
VERMILION = "#e0502e"
OLIVE = "#6f7f3f"

_B64URL_RE = re.compile(r"^[A-Za-z0-9_-]+$")

logger = logging.getLogger("merilo.signing")

_ephemeral_seed: bytes | None = None
_warned_ephemeral = False


# =============================================================================
# Keys & base64url helpers
# =============================================================================

def _encode_b64url(value: bytes) -> str:
    """Unpadded base64url, the single encoding used for keys and signatures."""
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _decode_b64url(value: str) -> bytes:
    """Strict unpadded/padded base64url decoding.

    ``base64.urlsafe_b64decode`` silently ignores characters outside the
    alphabet, which would accept a corrupted key. The alphabet is therefore
    checked first and decoding is done with ``validate=True``.
    """
    if not isinstance(value, str):
        raise ValueError("base64url value must be a string")
    raw = value.strip()
    if not raw:
        raise ValueError("base64url value must not be empty")
    raw = raw.rstrip("=")
    if not raw or not _B64URL_RE.match(raw):
        raise ValueError("value is not valid base64url")
    padding = "=" * (-len(raw) % 4)
    try:
        return base64.b64decode(raw + padding, altchars=b"-_", validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("value is not valid base64url") from exc


def _is_production() -> bool:
    return os.getenv("MERILO_ENV", "development").strip().lower() == "production"


def _warn_once(message: str) -> None:
    global _warned_ephemeral
    if not _warned_ephemeral:
        _warned_ephemeral = True
        logger.warning(message)


def _ephemeral_key_seed() -> bytes:
    """One random seed per process; stable for the process lifetime."""
    global _ephemeral_seed
    if _ephemeral_seed is None:
        _ephemeral_seed = secrets.token_bytes(SEED_BYTES)
    return _ephemeral_seed


def _load_seed() -> bytes:
    """Resolves the Ed25519 seed for this call (env is re-read every time).

    Re-reading keeps the key patchable in tests and lets an operator rotate the
    seed without a code change. Production never falls back to an ephemeral
    key; development always returns 32 bytes.
    """
    raw = os.getenv(SEED_ENV)
    production = _is_production()

    if raw is not None and raw.strip():
        try:
            seed = _decode_b64url(raw)
            if len(seed) != SEED_BYTES:
                raise ValueError(
                    f"{SEED_ENV} must decode to exactly {SEED_BYTES} bytes, got {len(seed)}"
                )
            return seed
        except ValueError as exc:
            if production:
                raise RuntimeError(
                    f"{SEED_ENV} is invalid: {exc}. "
                    "Generate one with: python -c \"import base64,secrets; "
                    "print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())\""
                ) from exc
            _warn_once(
                f"WARNING: {SEED_ENV} is invalid ({exc}); using an ephemeral Ed25519 key. "
                "Card manifests will not verify across restarts."
            )
            return _ephemeral_key_seed()

    if production:
        raise RuntimeError(
            f"{SEED_ENV} is required in production. "
            "Generate one with: python -c \"import base64,secrets; "
            "print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())\""
        )

    _warn_once(
        f"WARNING: {SEED_ENV} is not set; using an ephemeral Ed25519 key. "
        "Card manifests will not verify across restarts."
    )
    return _ephemeral_key_seed()


def _private_key() -> Ed25519PrivateKey:
    return Ed25519PrivateKey.from_private_bytes(_load_seed())


def public_key_b64() -> str:
    """Base64url (unpadded) encoding of the current Ed25519 public key."""
    raw = _private_key().public_key().public_bytes_raw()
    return _encode_b64url(raw)


# =============================================================================
# Canonical JSON, manifest construction, signature
# =============================================================================

def canonical_json(payload: Any) -> str:
    """The one canonical JSON form every hash and signature is computed over."""
    return json.dumps(payload, sort_keys=True, ensure_ascii=False, separators=(",", ":"))


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8", errors="replace")).hexdigest()


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _task_source_sha256(card: dict[str, Any], db_path: str | None = None) -> str:
    """SHA-256 over the task's description + rubric (never the task text itself).

    The task row is looked up lazily so ``backend.signing`` stays importable
    without the database (the CLI does not import FastAPI or app state). The
    lookup is bound to ``db_path`` — the database the card actually lives in —
    and falls back to :data:`backend.db.DEFAULT_DB_PATH` only when no explicit
    path is supplied. A card whose task has no catalogue row (synthetic
    ``own-code``) hashes the empty description/rubric pair, which keeps the
    manifest reproducible.

    A lookup is best-effort by contract: an uninitialized/absent database is an
    ordinary ``sqlite3.Error`` and must never break a card save or a manifest
    read, so every expected failure degrades to the documented empty digest.
    """
    task_id = _text(card.get("task_id"))
    task: dict[str, Any] = {}
    if task_id:
        try:
            from backend.db import get_task_by_id

            if db_path is None:
                task = get_task_by_id(task_id) or {}
            else:
                task = get_task_by_id(task_id, db_path=db_path) or {}
        except (ImportError, OSError, ValueError, TypeError, sqlite3.Error):
            task = {}

    description = _text(task.get("description"))
    rubric = task.get("rubric")
    if isinstance(rubric, str):
        rubric_text = rubric
    elif rubric is None:
        rubric_text = ""
    else:
        rubric_text = canonical_json(rubric)
    return _sha256_hex(canonical_json({"description": description, "rubric": rubric_text}))


def build_manifest(card: dict[str, Any], db_path: str | None = None) -> dict[str, Any]:
    """Builds the signed payload for a card row (public metadata + digests only).

    ``card`` may be a private row: ``submitted_code`` is consumed to produce
    ``code_sha256`` and is never copied into the result. ``db_path`` selects the
    database the card's task row is read from; ``None`` keeps the historical
    behaviour of using the module default.
    """
    card = card or {}
    defense_hash = card.get("defense_hash")
    manifest = {
        "version": MANIFEST_VERSION,
        "card_hash": _text(card.get("card_hash")),
        "candidate_name": _text(card.get("candidate_name")),
        "task_id": _text(card.get("task_id")),
        "task_title": _text(card.get("task_title")),
        "language": _text(card.get("language") or "python"),
        "status": _text(card.get("status")),
        "total_score": int(card.get("total_score") or 0),
        "badge_tier": _text(card.get("badge_tier")),
        "code_sha256": _sha256_hex(_text(card.get("submitted_code"))),
        "task_sha256": _task_source_sha256(card, db_path=db_path),
        "defense_hash": _text(defense_hash) or None,
        "ai_assisted": bool(card.get("ai_assisted")),
        "created_at": _text(card.get("created_at")),
        "rubric_version": _text(card.get("rubric_version")),
        "model": _text(card.get("model")),
    }
    return manifest


def manifest_content_hash(manifest: dict[str, Any]) -> str:
    """SHA-256 hex of the canonical manifest excluding ``content_hash`` itself."""
    payload = {key: value for key, value in manifest.items() if key != "content_hash"}
    return _sha256_hex(canonical_json(payload))


def sign_manifest(manifest: dict[str, Any]) -> str:
    """Base64url Ed25519 signature over the canonical manifest including ``content_hash``.

    A stale or tampered ``content_hash`` is recomputed rather than trusted: this
    function is the issuer, and the signature must always cover the manifest it
    actually describes.
    """
    payload = {key: value for key, value in manifest.items() if key != "content_hash"}
    payload["content_hash"] = manifest_content_hash(payload)
    signature = _private_key().sign(canonical_json(payload).encode("utf-8"))
    return _encode_b64url(signature)


def verify_manifest(manifest: Any, signature: Any, public_key_b64: Any) -> bool:
    """Returns ``True`` only for an authentic, unmodified manifest.

    Never raises: malformed base64, wrong-length keys/signatures, non-dict
    manifests and unsupported versions are ordinary verification failures.
    A modified covered field, a modified ``content_hash`` and a wrong public key
    all return ``False``.
    """
    try:
        if not isinstance(manifest, dict):
            return False
        if not isinstance(signature, str) or not isinstance(public_key_b64, str):
            return False
        if manifest.get("version") != MANIFEST_VERSION:
            return False

        computed = manifest_content_hash(manifest)
        provided = manifest.get("content_hash")
        if provided is not None and (
            not isinstance(provided, str) or provided != computed
        ):
            return False

        key_bytes = _decode_b64url(public_key_b64)
        if len(key_bytes) != PUBLIC_KEY_BYTES:
            return False
        signature_bytes = _decode_b64url(signature)
        if len(signature_bytes) != SIGNATURE_BYTES:
            return False

        payload = dict(manifest)
        payload["content_hash"] = computed
        public_key = Ed25519PublicKey.from_public_bytes(key_bytes)
        public_key.verify(
            signature_bytes,
            canonical_json(payload).encode("utf-8"),
        )
        return True
    except (InvalidSignature, ValueError, TypeError, KeyError, UnicodeError, binascii.Error):
        return False
    except Exception:  # noqa: BLE001 - the contract is "return False, never raise"
        return False


def _manifest_core(manifest: dict[str, Any]) -> dict[str, Any]:
    """The card-derived fields of a manifest, normalised for comparison."""
    return {field: manifest.get(field) for field in MANIFEST_FIELDS}


def manifest_for_card(
    card: dict[str, Any], db_path: str | None = None
) -> dict[str, Any]:
    """Returns the API envelope ``{manifest, ed25519_signature, public_key, valid}``.

    The persisted manifest/signature is reused only when it still describes the
    card *exactly*: every field in :data:`MANIFEST_FIELDS` of the stored manifest
    must equal the freshly built one (not just ``card_hash``/``defense_hash``).
    Legacy cards — and cards whose covered fields drifted since the last save
    (defense sealed later, task text or rubric edited, metadata re-saved) — get a
    freshly built, freshly signed manifest computed on read; nothing is written
    back here.

    ``db_path`` selects the database the card's task digest is read from;
    ``None`` keeps the historical default-database behaviour.
    """
    key = public_key_b64()
    fresh = build_manifest(card, db_path=db_path)
    stored: Any = None
    raw = card.get("manifest_json")
    if isinstance(raw, str) and raw.strip():
        try:
            stored = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            stored = None
    signature = card.get("ed25519_signature")

    if (
        isinstance(stored, dict)
        and isinstance(signature, str)
        and signature
        and _manifest_core(stored) == _manifest_core(fresh)
        and verify_manifest(stored, signature, key)
    ):
        return {
            "manifest": stored,
            "ed25519_signature": signature,
            "public_key": key,
            "valid": True,
        }

    manifest = fresh
    manifest["content_hash"] = manifest_content_hash(manifest)
    fresh_signature = sign_manifest(manifest)
    return {
        "manifest": manifest,
        "ed25519_signature": fresh_signature,
        "public_key": key,
        "valid": verify_manifest(manifest, fresh_signature, key),
    }


# =============================================================================
# Public badge (320×120 SVG)
# =============================================================================

def _xml(value: Any) -> str:
    """XML-escapes a dynamic value, including quotes and apostrophes."""
    return escape(str(value), {'"': "&quot;", "'": "&apos;"})


def _clip(value: Any, limit: int) -> str:
    text = "" if value is None else str(value)
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 1)] + "…"


def badge_svg(
    score: int,
    language: str,
    tier: str,
    candidate_name: str = "",
    card_hash: str = "",
    status: str = "verified",
) -> str:
    """Renders the compact public badge.

    Paper background, graphite body text, a vermilion stamp and olive stamp text
    for a verified card. Every dynamic value is XML-escaped; only local serif
    fonts are referenced (no external fonts or images), and the SVG carries an
    accessible ``<title>``.
    """
    score_value = max(0, min(100, int(score)))
    language_text = _xml(_clip(language, 18))
    tier_text = _xml(_clip(tier, 24))
    candidate_text = _xml(_clip(candidate_name, 28) or "Merilo candidate")
    verified = status == "verified"
    stamp_text_color = OLIVE if verified else VERMILION
    status_label = "VERIFIED" if verified else "UNVERIFIED"
    title = _xml(
        f"Merilo skill card {card_hash}: {score_value}/100, {language}, {tier}, {status_label}"
    )
    score_x = 18 + len(str(score_value)) * 19 + 2

    return (
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="120" '
        'viewBox="0 0 320 120" role="img" aria-labelledby="merilo-badge-title">'
        f'<title id="merilo-badge-title">{title}</title>'
        f'<rect width="320" height="120" rx="9" fill="{PAPER}"/>'
        f'<rect x="0.75" y="0.75" width="318.5" height="118.5" rx="8.25" fill="none" '
        f'stroke="{GRAPHITE}" stroke-opacity="0.25" stroke-width="1.5"/>'
        f'<text x="18" y="28" font-family="Georgia, \'Times New Roman\', serif" '
        f'font-size="10.5" letter-spacing="2" fill="{GRAPHITE}" fill-opacity="0.72">'
        "MERILO · SKILL CARD</text>"
        f'<text x="18" y="66" font-family="Georgia, \'Times New Roman\', serif" '
        f'font-size="34" font-weight="700" fill="{GRAPHITE}">{score_value}</text>'
        f'<text x="{score_x}" y="66" font-family="Georgia, \'Times New Roman\', serif" '
        f'font-size="16" fill="{GRAPHITE}" fill-opacity="0.6">/100</text>'
        f'<text x="18" y="88" font-family="Georgia, \'Times New Roman\', serif" '
        f'font-size="12.5" fill="{GRAPHITE}">{language_text} · {tier_text}</text>'
        f'<text x="18" y="105" font-family="Georgia, \'Times New Roman\', serif" '
        f'font-size="10" fill="{GRAPHITE}" fill-opacity="0.68">{candidate_text}</text>'
        '<g transform="translate(268 62) rotate(-7)">'
        f'<circle r="34" fill="none" stroke="{VERMILION}" stroke-width="2.2"/>'
        f'<circle r="27" fill="none" stroke="{VERMILION}" stroke-width="0.8" '
        'stroke-opacity="0.55"/>'
        '<text y="-3" text-anchor="middle" '
        'font-family="Georgia, \'Times New Roman\', serif" font-size="10.5" '
        f'letter-spacing="1.4" fill="{stamp_text_color}">MERILO</text>'
        '<text y="11" text-anchor="middle" '
        'font-family="Georgia, \'Times New Roman\', serif" font-size="8" '
        f'letter-spacing="1.2" fill="{stamp_text_color}">{status_label}</text>'
        "</g>"
        "</svg>"
    )


# =============================================================================
# QR code for the NFC / share URL
# =============================================================================

def public_base_url() -> str:
    """Public origin for card links, overridable via ``MERILO_PUBLIC_BASE_URL``."""
    configured = (os.getenv("MERILO_PUBLIC_BASE_URL") or "").strip()
    base = configured or DEFAULT_PUBLIC_BASE_URL
    return base.rstrip("/") or DEFAULT_PUBLIC_BASE_URL


def card_qr_url(card_hash: str) -> str:
    """The exact URL encoded into the QR code."""
    return f"{public_base_url()}/card/{urllib.parse.quote(str(card_hash), safe='')}"


def qr_svg(card_hash: str) -> str:
    """SVG QR code (segno) pointing at ``/card/{hash}`` on the public origin."""
    import segno  # imported lazily: offline verification must not need the renderer

    qr = segno.make(card_qr_url(card_hash), micro=False, error="m")
    buffer = io.BytesIO()
    qr.save(
        buffer,
        kind="svg",
        scale=4,
        border=2,
        xmldecl=False,
        svgclass=None,
        lineclass=None,
        dark=GRAPHITE,
        light=PAPER,
    )
    return buffer.getvalue().decode("utf-8")
