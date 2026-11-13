"""P0 security regression tests: HMAC secret handling and demo password storage."""

import hashlib
from pathlib import Path

import pytest

import backend.db as db
from backend.seed_data import seed_database

BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
SECRET_ENV_VARS = ("MERILO_HMAC_SECRET", "MERILO_SECRET_KEY", "MARYM_SECRET_KEY")

# Built at runtime so the forbidden literals do not themselves appear as plain
# strings in the source tree (keeps `git grep`/secret scanners meaningful).
OLD_SECRET_LITERAL = "marym-proof-" + "cryptographic-signing-key-2026"
OLD_DEMO_PASSWORD = "marat" + "2026"


def _clear_secret_env(monkeypatch) -> None:
    for var in SECRET_ENV_VARS:
        monkeypatch.delenv(var, raising=False)


def test_dev_without_secret_uses_ephemeral_key(monkeypatch):
    _clear_secret_env(monkeypatch)
    monkeypatch.setenv("MERILO_ENV", "development")

    secret = db._load_hmac_secret()

    assert isinstance(secret, bytes)
    assert len(secret) >= 32
    assert secret.decode("utf-8", errors="ignore") != OLD_SECRET_LITERAL


def test_production_without_secret_fails_fast(monkeypatch):
    _clear_secret_env(monkeypatch)
    monkeypatch.setenv("MERILO_ENV", "production")

    with pytest.raises(RuntimeError, match="MERILO_HMAC_SECRET"):
        db._load_hmac_secret()


def test_production_with_secret_starts(monkeypatch):
    _clear_secret_env(monkeypatch)
    monkeypatch.setenv("MERILO_ENV", "production")
    monkeypatch.setenv("MERILO_HMAC_SECRET", "unit-test-hmac-secret")

    assert db._load_hmac_secret() == b"unit-test-hmac-secret"


def test_card_signature_verification_detects_tampering(monkeypatch):
    monkeypatch.setattr(db, "SECRET_KEY", b"unit-test-signing-key")

    signature = db.sign_card("card-hash-1", "usr_1", 90)
    card = {
        "card_hash": "card-hash-1",
        "user_id": "usr_1",
        "total_score": 90,
        "signature": signature,
    }
    assert db.verify_card_signature(card) is True

    card["total_score"] = 100
    assert db.verify_card_signature(card) is False
    assert db.verify_card_signature({**card, "signature": "00"}) is False


def test_hmac_comparisons_use_compare_digest():
    source = (BACKEND_DIR / "db.py").read_text(encoding="utf-8")
    assert "hmac.compare_digest" in source
    assert "signature ==" not in source
    assert "expected ==" not in source


def test_no_hardcoded_secrets_in_backend_sources():
    forbidden = (OLD_SECRET_LITERAL, OLD_DEMO_PASSWORD)
    for path in BACKEND_DIR.glob("*.py"):
        source = path.read_text(encoding="utf-8")
        for literal in forbidden:
            assert literal not in source, f"hardcoded secret in {path}"


def test_seeding_is_idempotent_and_stores_scrypt_hash(tmp_path, monkeypatch, capsys):
    _clear_secret_env(monkeypatch)
    monkeypatch.setenv("MERILO_ENV", "development")
    monkeypatch.setenv("MERILO_DEMO_PASSWORD", "unit-test-demo-password")
    db_path = str(tmp_path / "idempotent.db")
    db.init_db(db_path)

    seed_database(db_path)
    seed_database(db_path)

    users = db.get_all_users(db_path)
    assert len(users) == 1
    full_user = db.get_user_by_email("marat@merilo.kz", db_path)
    assert full_user is not None
    assert full_user["password_hash"].startswith(db.SCRYPT_PREFIX)
    assert "unit-test-demo-password" not in full_user["password_hash"]
    assert db.verify_password(
        "unit-test-demo-password", full_user["password_hash"], full_user["salt"]
    )
    assert db.verify_password("wrong-password", full_user["password_hash"], full_user["salt"]) is False
    # Explicit MERILO_DEMO_PASSWORD must never be echoed to the console.
    assert "MERILO demo password" not in capsys.readouterr().out


def test_generated_demo_password_is_printed_once(tmp_path, monkeypatch, capsys):
    _clear_secret_env(monkeypatch)
    monkeypatch.delenv("MERILO_DEMO_PASSWORD", raising=False)
    monkeypatch.setenv("MERILO_ENV", "development")
    db_path = str(tmp_path / "generated.db")
    db.init_db(db_path)

    seed_database(db_path)
    seed_database(db_path)

    output = capsys.readouterr().out
    assert output.count("MERILO demo password") == 1


def test_demo_password_not_printed_in_production(tmp_path, monkeypatch, capsys):
    """A production container must never leak the generated demo password into platform logs."""
    monkeypatch.setenv("MERILO_ENV", "production")
    monkeypatch.delenv("MERILO_DEMO_PASSWORD", raising=False)
    db_path = str(tmp_path / "prod.db")
    db.init_db(db_path)

    seed_database(db_path)

    captured = capsys.readouterr()
    combined = (captured.out + captured.err).lower()
    assert "demo password" not in combined
    assert "demo login disabled: set merilo_demo_password to enable it" in combined

    # Zero-auth verification keeps working: the default candidate lives in the DB.
    user = db.get_user_by_email("marat@merilo.kz", db_path)
    assert user is not None
    assert user["password_hash"].startswith(db.SCRYPT_PREFIX)


def test_legacy_pbkdf2_password_still_verifies():
    salt = "0123456789abcdef0123456789abcdef"
    legacy_hash = hashlib.pbkdf2_hmac(
        "sha256", b"legacy-password", salt.encode("utf-8"), 100_000
    ).hex()

    assert db.verify_password("legacy-password", legacy_hash, salt) is True
    assert db.verify_password("wrong-password", legacy_hash, salt) is False
