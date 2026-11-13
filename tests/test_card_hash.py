"""P1: the public card hash is a stable, reproducible 12-char SHA-256 prefix."""

import asyncio
import re

import backend.db as db
import backend.verifier as verifier
from backend.seed_data import seed_database
from backend.verifier import _card_hash

HASH_PATTERN = re.compile(r"^[0-9a-f]{12}$")

TASK_ID = "task-fintech-01"
CODE = "def add(a: int, b: int) -> int:\n    return a + b\n"

DEMO_EMAIL = "marat@merilo.kz"
DEMO_CANDIDATE = "Жолынбек Марат"


def test_card_hash_is_twelve_hex_characters():
    card_hash = _card_hash(TASK_ID, "Test Candidate", "verified", 80, CODE)

    assert len(card_hash) == 12
    assert HASH_PATTERN.match(card_hash)


def test_same_input_produces_same_hash():
    first = _card_hash(TASK_ID, "Test Candidate", "verified", 80, CODE)
    second = _card_hash(TASK_ID, "Test Candidate", "verified", 80, CODE)

    assert first == second


def test_candidate_name_changes_the_hash():
    first = _card_hash(TASK_ID, "Test Candidate", "verified", 80, CODE)
    second = _card_hash(TASK_ID, "Another Candidate", "verified", 80, CODE)

    assert first != second


def test_unknown_hash_returns_404(client):
    response = client.get("/api/cards/000000000000")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == 404


# =============================================================================
# Cross-database stability: the user id (and therefore the card hash) must be a
# deterministic function of the normalized email, not of a random token.
# =============================================================================

def test_create_user_id_is_stable_across_databases(tmp_path):
    first_db = str(tmp_path / "first-users.db")
    second_db = str(tmp_path / "second-users.db")
    db.init_db(first_db)
    db.init_db(second_db)

    first = db.create_user(
        "Stable@Merilo.kz", "password123", "Stable Candidate", db_path=first_db
    )
    second = db.create_user(
        "Stable@Merilo.kz", "password123", "Stable Candidate", db_path=second_db
    )

    assert first["id"] == second["id"]
    assert first["id"].startswith("usr_")
    assert len(first["id"]) == 20
    assert re.fullmatch(r"usr_[0-9a-f]{16}", first["id"])


def test_create_user_id_differs_by_email(tmp_path):
    db_path = str(tmp_path / "distinct-users.db")
    db.init_db(db_path)

    first = db.create_user("first@merilo.kz", "password123", "First", db_path=db_path)
    second = db.create_user("second@merilo.kz", "password123", "Second", db_path=db_path)

    assert first["id"] != second["id"]


def _seeded_db(tmp_path, monkeypatch, name: str) -> str:
    """Creates a fresh DB seeded with the canonical demo candidate and tasks."""
    monkeypatch.setenv("MERILO_DEMO_PASSWORD", "unit-test-demo-password")
    db_path = str(tmp_path / name)
    db.init_db(db_path)
    seed_database(db_path)
    return db_path


def _verify_against_db(monkeypatch, db_path: str, submitted_code: str) -> dict:
    """Runs the real pipeline, binding its task lookup and persistence to ``db_path``."""
    # A scoped patch: capturing the originals inside it guarantees the second call
    # sees the pristine db functions rather than the previous call's wrapper.
    with monkeypatch.context() as scoped:
        real_get_task = db.get_task_by_id
        real_save_card = db.save_skill_card

        scoped.setattr(
            db, "get_task_by_id", lambda task_id, *_a, **_k: real_get_task(task_id, db_path=db_path)
        )
        scoped.setattr(
            db, "save_skill_card", lambda card_data, *_a, **_k: real_save_card(card_data, db_path=db_path)
        )

        # Mirrors main._resolve_identity for the zero-auth demo: default candidate from the DB.
        user = db.get_user_by_email(DEMO_EMAIL, db_path=db_path)
        assert user is not None
        return asyncio.run(
            verifier.verify_submission(
                TASK_ID,
                submitted_code,
                candidate_name=DEMO_CANDIDATE,
                user_id=user["id"],
            )
        )


def test_card_hash_is_stable_across_databases(tmp_path, monkeypatch):
    first_db = _seeded_db(tmp_path, monkeypatch, "first.db")
    second_db = _seeded_db(tmp_path, monkeypatch, "second.db")

    first_task = db.get_task_by_id(TASK_ID, db_path=first_db)
    second_task = db.get_task_by_id(TASK_ID, db_path=second_db)
    assert first_task is not None and second_task is not None
    assert first_task["preset_ideal"] == second_task["preset_ideal"]

    first_result = _verify_against_db(monkeypatch, first_db, first_task["preset_ideal"])
    second_result = _verify_against_db(monkeypatch, second_db, second_task["preset_ideal"])

    assert first_result["status"] == "verified"
    assert first_result["card_hash"] == second_result["card_hash"]

    for db_path, result in ((first_db, first_result), (second_db, second_result)):
        card = db.get_skill_card(result["card_hash"], db_path=db_path)
        assert card is not None, f"card {result['card_hash']} was not persisted in {db_path}"
        assert card["card_hash"] == result["card_hash"]
        assert card["is_signature_valid"] is True
