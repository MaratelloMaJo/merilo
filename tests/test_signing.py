"""Task 5 — Ed25519 manifests, persistence, HTTP endpoint and offline CLI.

The manifest is the portable trust artifact of a Skill Card: identity and verdict
metadata plus SHA-256 digests, signed with Ed25519. These tests pin the signature
contract (tamper detection, wrong key, malformed input), the privacy guarantee
(no raw code or task text), the SQLite persistence/legacy behaviour and the CLI.
"""

import base64
import functools
import hashlib
import http.server
import json
import re
import subprocess
import sys
import threading
from pathlib import Path

import pytest

import backend.db as db
from backend import signing
from backend.signing import (
    MANIFEST_FIELDS,
    MANIFEST_VERSION,
    SEED_ENV,
    build_manifest,
    manifest_content_hash,
    manifest_for_card,
    public_key_b64,
    sign_manifest,
    verify_manifest,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
FIXTURE = Path(__file__).resolve().parent / "fixtures" / "manifest.json"
CLI = REPO_ROOT / "scripts" / "verify_card.py"

SEED_A = base64.urlsafe_b64encode(bytes(range(32))).decode()
SEED_B = base64.urlsafe_b64encode(bytes(range(32, 64))).decode()

CODE_MARKER = "SECRET_CODE_MARKER_5"
CARD = {
    "card_hash": "abc123abc123",
    "candidate_name": "Ada Lovelace",
    "task_id": "task-fintech-01",
    "task_title": "Ledger integrity",
    "language": "python",
    "status": "verified",
    "total_score": 88,
    "badge_tier": "Gold Verified",
    "submitted_code": f"{CODE_MARKER} = 1\n",
    "defense_hash": None,
    "ai_assisted": False,
    "created_at": "2026-11-12T00:00:00+00:00",
    "rubric_version": "2026-11-v1",
    "model": "gemini-3.6-flash",
}

# Fresh, migration-complete row inserted without a manifest (legacy card).


@pytest.fixture
def seed_a(monkeypatch):
    monkeypatch.setenv("MERILO_ENV", "development")
    monkeypatch.setenv(SEED_ENV, SEED_A)


def _signed() -> tuple[dict, str]:
    manifest = build_manifest(CARD)
    return manifest, sign_manifest(manifest)


def _insert_card(card_hash: str, **extra) -> None:
    row = {
        "card_hash": card_hash,
        "candidate_name": "Legacy Candidate",
        "task_id": "task-fintech-01",
        "task_title": "Legacy card",
        "company_name": "Merilo",
        "total_score": 77,
        "badge_tier": "Silver Verified",
        "status": "verified",
        "gate_reached": 3,
        "clean_code": 77,
        "architecture": 77,
        "edge_cases": 77,
        "executive_summary": "Persisted before manifests existed.",
        "evaluation_json": "{}",
        "submitted_code": "def add(a, b):\n    return a + b\n",
        "verify_url": f"/card/{card_hash}",
        "created_at": "2026-10-01T10:00:00+00:00",
    }
    row.update(extra)
    columns = ", ".join(row)
    placeholders = ", ".join("?" for _ in row)
    conn = db.get_db_connection()
    try:
        with conn:
            conn.execute(
                f"INSERT INTO skill_cards ({columns}) VALUES ({placeholders})",
                tuple(row.values()),
            )
    finally:
        conn.close()


def _verify_card(client, candidate: str, code: str) -> dict:
    response = client.post(
        "/api/submissions/verify",
        json={
            "task_id": "task-fintech-01",
            "submitted_code": code,
            "candidate_name": candidate,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


# =============================================================================
# Manifest shape and privacy
# =============================================================================

def test_manifest_covers_exactly_the_documented_fields(client):
    manifest = build_manifest(CARD)

    assert tuple(manifest) == MANIFEST_FIELDS
    assert manifest["version"] == MANIFEST_VERSION
    assert manifest["card_hash"] == CARD["card_hash"]
    assert manifest["total_score"] == 88
    assert manifest["ai_assisted"] is False
    assert json.loads(json.dumps(manifest)) == manifest


def test_manifest_contains_digests_never_source_text(client):
    manifest = build_manifest(CARD)
    serialized = json.dumps(manifest, ensure_ascii=False)

    assert manifest["code_sha256"] == hashlib.sha256(
        CARD["submitted_code"].encode("utf-8")
    ).hexdigest()
    assert re.fullmatch(r"[0-9a-f]{64}", manifest["task_sha256"])
    assert CODE_MARKER not in serialized

    for forbidden in (
        "submitted_code",
        "task_description",
        "defense_answers",
        "defense_questions",
        "defense_token_hash",
        "user_id",
        "signature",
    ):
        assert forbidden not in manifest


def test_task_digest_covers_description_and_rubric(client):
    task = db.get_task_by_id(CARD["task_id"])
    assert task is not None
    expected = hashlib.sha256(
        signing.canonical_json(
            {
                "description": task["description"],
                "rubric": signing.canonical_json(task["rubric"]),
            }
        ).encode("utf-8")
    ).hexdigest()

    manifest = build_manifest(CARD)

    assert manifest["task_sha256"] == expected
    assert task["description"] not in json.dumps(manifest, ensure_ascii=False)


def test_content_hash_ignores_content_hash_field(seed_a):
    manifest = build_manifest(CARD)
    assert manifest_content_hash(manifest) == manifest_content_hash(
        {**manifest, "content_hash": "ignored"}
    )


# =============================================================================
# Signature round-trip and tamper detection
# =============================================================================

def test_manifest_signature_roundtrip(seed_a):
    manifest, signature = _signed()
    signed = {**manifest, "content_hash": manifest_content_hash(manifest)}

    assert verify_manifest(signed, signature, public_key_b64()) is True
    # A manifest without the content_hash field verifies too: it is recomputed.
    assert verify_manifest(manifest, signature, public_key_b64()) is True


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("version", "merilo-card-v2"),
        ("card_hash", "0123456789ab"),
        ("candidate_name", "Mallory"),
        ("task_id", "task-web-04"),
        ("task_title", "Different task"),
        ("language", "go"),
        ("status", "blocked"),
        ("total_score", 100),
        ("badge_tier", "Needs Work"),
        ("code_sha256", "0" * 64),
        ("task_sha256", "1" * 64),
        ("defense_hash", "f" * 64),
        ("ai_assisted", True),
        ("created_at", "2026-01-01T00:00:00+00:00"),
        ("rubric_version", "2026-12-v9"),
        ("model", "gpt-other"),
    ],
)
def test_modified_covered_field_is_rejected(seed_a, field, value):
    manifest, signature = _signed()
    manifest[field] = value

    assert verify_manifest(manifest, signature, public_key_b64()) is False


def test_modified_content_hash_is_rejected(seed_a):
    manifest, signature = _signed()
    manifest["content_hash"] = "0" * 64

    assert verify_manifest(manifest, signature, public_key_b64()) is False


def test_wrong_public_key_is_rejected(seed_a, monkeypatch):
    manifest, signature = _signed()
    key_a = public_key_b64()

    monkeypatch.setenv(SEED_ENV, SEED_B)
    key_b = public_key_b64()

    assert key_a != key_b
    assert verify_manifest(manifest, signature, key_b) is False


def test_malformed_inputs_return_false_without_raising(seed_a):
    manifest, signature = _signed()
    key = public_key_b64()
    short_signature = base64.urlsafe_b64encode(b"x" * 10).decode()
    short_key = base64.urlsafe_b64encode(b"y" * 16).decode()

    cases = [
        ("not a manifest", signature, key),
        (["not", "a", "dict"], signature, key),
        (manifest, "not base64!!", key),
        (manifest, "", key),
        (manifest, None, key),
        (manifest, short_signature, key),
        (manifest, signature, "not base64!!"),
        (manifest, signature, ""),
        (manifest, signature, None),
        (manifest, signature, short_key),
        ({}, signature, key),
    ]
    for candidate_manifest, candidate_signature, candidate_key in cases:
        assert (
            verify_manifest(candidate_manifest, candidate_signature, candidate_key)
            is False
        )


# =============================================================================
# Key handling: deterministic when configured, fail-fast in production
# =============================================================================

def test_public_key_is_deterministic_for_a_seed(seed_a):
    first = public_key_b64()
    second = public_key_b64()

    assert first == second
    assert len(base64.urlsafe_b64decode(first + "=" * (-len(first) % 4))) == 32


def test_production_without_seed_fails_at_use_time(monkeypatch):
    monkeypatch.setenv("MERILO_ENV", "production")
    monkeypatch.delenv(SEED_ENV, raising=False)

    # Importing and building metadata stays safe; only key *use* raises.
    build_manifest(CARD)
    with pytest.raises(RuntimeError, match=SEED_ENV):
        public_key_b64()
    with pytest.raises(RuntimeError, match=SEED_ENV):
        sign_manifest(build_manifest(CARD))


def test_production_with_invalid_seed_fails(monkeypatch):
    monkeypatch.setenv("MERILO_ENV", "production")
    monkeypatch.setenv(SEED_ENV, "too-short")

    with pytest.raises(RuntimeError, match=SEED_ENV):
        public_key_b64()


def test_development_with_invalid_seed_warns_and_never_crashes(monkeypatch, caplog):
    monkeypatch.setenv("MERILO_ENV", "development")
    monkeypatch.setenv(SEED_ENV, "not-a-valid-seed!")
    monkeypatch.setattr(signing, "_warned_ephemeral", False)
    monkeypatch.setattr(signing, "_ephemeral_seed", None)

    with caplog.at_level("WARNING", logger="merilo.signing"):
        key = public_key_b64()

    assert len(base64.urlsafe_b64decode(key + "=" * (-len(key) % 4))) == 32
    assert any(SEED_ENV in record.message for record in caplog.records)


# =============================================================================
# Persistence: saved manifests, legacy cards, defense preservation
# =============================================================================

def test_save_skill_card_persists_manifest_and_signature(client, seed_a):
    card_hash = "magicmanifest1"
    db.save_skill_card(
        {
            **CARD,
            "card_hash": card_hash,
            "submitted_code": f"{CODE_MARKER} = 2\n",
        }
    )

    row = db.get_skill_card_private(card_hash)
    assert row is not None
    assert isinstance(row["manifest_json"], str)
    assert isinstance(row["ed25519_signature"], str)

    envelope = manifest_for_card(row)
    assert envelope["valid"] is True
    assert envelope["manifest"]["card_hash"] == card_hash
    assert verify_manifest(
        envelope["manifest"], envelope["ed25519_signature"], envelope["public_key"]
    )


def test_legacy_card_without_manifest_is_signed_on_read(client, seed_a):
    card_hash = "legacymanifest1"
    _insert_card(card_hash)

    row = db.get_skill_card_private(card_hash)
    assert row["manifest_json"] is None
    assert row["ed25519_signature"] is None

    envelope = manifest_for_card(row)
    assert envelope["valid"] is True
    assert envelope["manifest"]["card_hash"] == card_hash
    assert verify_manifest(
        envelope["manifest"], envelope["ed25519_signature"], envelope["public_key"]
    )


def test_resave_preserves_defense_columns_and_covers_defense_hash(client, seed_a):
    card_hash = "defensemanifest1"
    defense = {
        "defense_questions_json": '["q1", "q2", "q3"]',
        "defense_answers_json": '["a1", "a2", "a3"]',
        "defense_hash": "a" * 64,
        "defense_signature": "b" * 64,
        "defense_token_hash": "c" * 64,
        "defended_at": "2026-11-01T09:00:00+00:00",
    }
    _insert_card(card_hash, **defense)

    db.save_skill_card(
        {
            **CARD,
            "card_hash": card_hash,
            "total_score": 88,
            "submitted_code": f"{CODE_MARKER} = 3\n",
        }
    )

    row = db.get_skill_card_private(card_hash)
    for column, expected in defense.items():
        assert row[column] == expected, column

    envelope = manifest_for_card(row)
    assert envelope["valid"] is True
    assert envelope["manifest"]["defense_hash"] == defense["defense_hash"]


def test_production_save_without_seed_keeps_the_card_unsigned(tmp_path, monkeypatch):
    """A missing key must not break card verification/startup seeding."""
    monkeypatch.setenv("MERILO_ENV", "production")
    monkeypatch.delenv(SEED_ENV, raising=False)
    db_path = str(tmp_path / "prod.db")
    db.init_db(db_path)

    saved = db.save_skill_card(
        {**CARD, "card_hash": "prodseedless1"},
        db_path=db_path,
    )

    assert saved["card_hash"] == "prodseedless1"
    assert saved["manifest_json"] is None
    assert saved["ed25519_signature"] is None


# =============================================================================
# Database isolation: the manifest is bound to the card's own database
# =============================================================================

def _empty_task_digest() -> str:
    """The documented deterministic digest of an absent task row."""
    return hashlib.sha256(
        signing.canonical_json({"description": "", "rubric": ""}).encode("utf-8")
    ).hexdigest()


def test_build_manifest_with_a_fresh_or_missing_db_never_raises(tmp_path, monkeypatch):
    """A lookup failure must never break a card save (Task 5 fix round).

    Before the fix, ``build_manifest`` read the module default database, so this
    raised ``sqlite3.OperationalError: no such table: micro_tasks`` in a fresh
    process. The digest now comes from the database the card belongs to and
    degrades to the documented empty description/rubric digest.
    """
    monkeypatch.setenv("MERILO_DB_PATH", str(tmp_path / "definitely" / "absent.db"))
    fresh_db = str(tmp_path / "fresh.db")
    db.init_db(fresh_db)

    first = build_manifest(CARD, db_path=fresh_db)
    second = build_manifest(CARD, db_path=fresh_db)

    assert first["task_sha256"] == second["task_sha256"]
    assert first["task_sha256"] == _empty_task_digest()
    assert re.fullmatch(r"[0-9a-f]{64}", first["task_sha256"])

    # A path with no schema at all (and a directory) are ordinary failures too.
    missing = build_manifest(CARD, db_path=str(tmp_path / "definitely" / "absent.db"))
    assert missing["task_sha256"] == _empty_task_digest()
    directory = build_manifest(CARD, db_path=str(tmp_path))
    assert directory["task_sha256"] == _empty_task_digest()


def test_save_into_a_temp_db_never_reads_the_default_db(tmp_path, monkeypatch):
    """A save into ``db_path`` must resolve its task row in that same database."""
    default_path = db.DEFAULT_DB_PATH
    real_get_task = db.get_task_by_id

    def _guarded(task_id, db_path=default_path):
        assert db_path != default_path, "manifest lookup escaped to the default database"
        return real_get_task(task_id, db_path=db_path)

    monkeypatch.setattr(db, "get_task_by_id", _guarded)
    monkeypatch.setenv("MERILO_DB_PATH", str(tmp_path / "uninitialized.db"))

    db_path = str(tmp_path / "isolated.db")
    db.init_db(db_path)
    task = db.create_custom_task(
        title="Isolated ledger",
        company_name="Isolation Co",
        stack="python",
        difficulty="medium",
        description="Only this database knows this description.",
        rubric_json='{"clean_code": "readable"}',
        buggy_code="def broken(): pass\n",
        db_path=db_path,
    )

    saved = db.save_skill_card(
        {**CARD, "card_hash": "isolated0001", "task_id": task["id"]},
        db_path=db_path,
    )

    expected = hashlib.sha256(
        signing.canonical_json(
            {
                "description": task["description"],
                "rubric": signing.canonical_json(task["rubric"]),
            }
        ).encode("utf-8")
    ).hexdigest()
    stored = json.loads(saved["manifest_json"])
    assert stored["task_sha256"] == expected
    assert stored["task_sha256"] != _empty_task_digest()

    envelope = manifest_for_card(saved, db_path=db_path)
    assert envelope["valid"] is True
    assert envelope["manifest"]["task_sha256"] == expected


def test_stored_manifest_is_reused_only_when_every_covered_field_matches(client, seed_a):
    """Reuse compares all covered fields, not just ``card_hash``/``defense_hash``."""
    card_hash = "strictreuse01"
    db.save_skill_card({**CARD, "card_hash": card_hash})

    row = db.get_skill_card_private(card_hash)
    stored = json.loads(row["manifest_json"])
    reused = manifest_for_card(row)
    assert reused["manifest"] == stored
    assert reused["ed25519_signature"] == row["ed25519_signature"]

    for field, stale_value in (
        ("task_title", "A title that no longer matches"),
        ("task_sha256", "0" * 64),
        ("rubric_version", "2026-01-v0"),
    ):
        row["manifest_json"] = json.dumps({**stored, field: stale_value})
        rebuilt = manifest_for_card(row)
        assert rebuilt["manifest"][field] == stored[field], field
        assert rebuilt["manifest"][field] != stale_value, field
        # The tampered stored payload is never returned as "valid".
        assert rebuilt["manifest"] != {**stored, field: stale_value}, field
        assert rebuilt["valid"] is True, field
        assert verify_manifest(
            rebuilt["manifest"], rebuilt["ed25519_signature"], rebuilt["public_key"]
        )


# =============================================================================
# HTTP surface
# =============================================================================

def test_well_known_document(client, seed_a):
    response = client.get("/.well-known/merilo.json")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {
        "algorithm",
        "public_key",
        "manifest_version",
        "supported_languages",
        "verify_url",
    }
    assert body["algorithm"] == "Ed25519"
    assert body["manifest_version"] == MANIFEST_VERSION
    assert body["public_key"] == public_key_b64()
    assert "{hash}" in body["verify_url"]
    assert "python" in body["supported_languages"]


def test_manifest_endpoint_returns_verifiable_envelope(client, seed_a):
    code = "def multiply(a, b):\n    return a * b\n"
    verdict = _verify_card(client, "Manifest Endpoint", code)
    card_hash = verdict["card_hash"]

    response = client.get(f"/api/cards/{card_hash}/manifest")

    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"manifest", "ed25519_signature", "public_key", "valid"}
    assert body["valid"] is True
    assert body["public_key"] == public_key_b64()
    assert verify_manifest(body["manifest"], body["ed25519_signature"], body["public_key"])
    assert body["manifest"]["card_hash"] == card_hash
    assert body["manifest"]["content_hash"] == manifest_content_hash(body["manifest"])
    assert "def multiply" not in response.text
    assert "submitted_code" not in response.text


def test_manifest_endpoint_unknown_card_is_404(client):
    response = client.get("/api/cards/doesnotexist/manifest")

    assert response.status_code == 404


# =============================================================================
# Generated fixture and the offline CLI
# =============================================================================

def test_generated_fixture_verifies_offline():
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))

    assert payload["valid"] is True
    assert payload["manifest"]["version"] == MANIFEST_VERSION
    assert payload["manifest"]["content_hash"] == manifest_content_hash(payload["manifest"])
    assert verify_manifest(
        payload["manifest"], payload["ed25519_signature"], payload["public_key"]
    )
    assert "submitted_code" not in payload["manifest"]


def _run_cli(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(CLI), *args],
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        timeout=60,
        check=False,
    )


def test_cli_accepts_the_generated_fixture():
    result = _run_cli("--file", str(FIXTURE))

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "VALID"


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format, *args):
        return


def test_cli_fetches_the_manifest_over_http():
    handler = functools.partial(_QuietHandler, directory=str(FIXTURE.parent))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        url = f"http://127.0.0.1:{server.server_address[1]}/{FIXTURE.name}"
        result = _run_cli("--url", url)
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "VALID"


def test_cli_with_pinned_public_key(tmp_path):
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    key_file = tmp_path / "merilo.pub"
    key_file.write_text(payload["public_key"] + "\n", encoding="utf-8")

    result = _run_cli("--file", str(FIXTURE), "--public-key", str(key_file))

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "VALID"


def test_cli_rejects_a_tampered_manifest(tmp_path):
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payload["manifest"]["total_score"] = 100
    tampered = tmp_path / "tampered.json"
    tampered.write_text(json.dumps(payload), encoding="utf-8")

    result = _run_cli("--file", str(tampered))

    assert result.returncode == 1
    assert result.stdout.strip() == "INVALID"
