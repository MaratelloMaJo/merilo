"""Task 3 — one-time, token-bound Skill Card defense domain and persistence."""

import hashlib
import hmac
import json
import sqlite3
import threading
from datetime import datetime

import pytest

import backend.db as db
from backend.defense import (
    AlreadyDefended,
    defense_hash,
    get_defense_state,
    hash_token,
    seal_card_defense,
    sign_defense,
)

QUESTIONS = ["Почему выбрано это решение?", "Как проверены границы?", "Что сломается первым?"]
TOKEN = "defense-token-1"

# Owned by the defense domain: a card re-save must leave every one of them alone.
DEFENSE_COLUMNS = (
    "defense_questions_json",
    "defense_answers_json",
    "defense_hash",
    "defense_signature",
    "defense_token_hash",
    "defended_at",
)


def _card_data(card_hash: str = "card-defense-01") -> dict:
    return {
        "card_hash": card_hash,
        "candidate_name": "Defense Candidate",
        "task_id": "task-fintech-01",
        "task_title": "Rate limiter",
        "company_name": "Merilo",
        "total_score": 77,
        "badge_tier": "Strong",
        "status": "verified",
        "gate_reached": 3,
        "clean_code": 77,
        "architecture": 77,
        "edge_cases": 77,
        "executive_summary": "Deterministic card for defense tests.",
        "submitted_code": "def add(a, b):\n    return a + b\n",
        "language": "python",
        "rubric_version": "2026-11-v1",
        "model": "test-model",
    }


@pytest.fixture
def tmp_db(tmp_path):
    path = str(tmp_path / "merilo-defense.db")
    db.init_db(path)
    return path


def _make_card(tmp_db: str, *, card_hash: str = "card-defense-01", token: str | None = TOKEN) -> dict:
    card = db.save_skill_card(_card_data(card_hash), db_path=tmp_db)
    if token is not None:
        _issue_token(tmp_db, card_hash, token)
    return card


def _issue_token(db_path: str, card_hash: str, token: str, questions: list[str] | None = QUESTIONS) -> None:
    """Mimic Task 4: the verifier stores the challenge before returning the token."""
    conn = db.get_db_connection(db_path)
    try:
        with conn:
            conn.execute(
                "UPDATE skill_cards SET defense_token_hash = ?, defense_questions_json = ? "
                "WHERE card_hash = ?",
                (
                    hash_token(token),
                    json.dumps(questions, ensure_ascii=False) if questions is not None else None,
                    card_hash,
                ),
            )
    finally:
        conn.close()


# =============================================================================
# Hashing & signing
# =============================================================================

def test_hash_token_is_sha256_hex():
    assert hash_token("abc") == hashlib.sha256(b"abc").hexdigest()
    assert len(hash_token("abc")) == 64


def test_defense_hash_is_stable_and_order_sensitive():
    questions = ["Q1", "Q2", "Q3"]
    assert defense_hash("abc", questions, ["A1", "A2", "A3"]) == defense_hash(
        "abc", questions, ["A1", "A2", "A3"]
    )
    assert defense_hash("abc", questions, ["A1", "A2", "A3"]) != defense_hash(
        "abc", questions, ["A3", "A2", "A1"]
    )
    assert defense_hash("abc", questions, ["A1", "A2", "A3"]) != defense_hash(
        "other", questions, ["A1", "A2", "A3"]
    )
    assert defense_hash("abc", questions, ["A1", "A2", "A3"]) != defense_hash(
        "abc", ["Q3", "Q2", "Q1"], ["A1", "A2", "A3"]
    )


def test_sign_defense_is_hmac_sha256_over_canonical_payload():
    digest = "a" * 64
    signature = sign_defense("secret", digest, "usr_1", 77)
    expected = hmac.new(
        b"secret", f"{digest}:usr_1:77".encode(), hashlib.sha256
    ).hexdigest()
    assert signature == expected
    assert len(signature) == 64


@pytest.mark.parametrize("secret", ["", "   ", "\t\n"])
def test_sign_defense_rejects_a_blank_secret(secret):
    # A blank secret would be a publicly known key: it must never sign.
    with pytest.raises(ValueError):
        sign_defense(secret, "a" * 64, "usr_1", 77)


def test_defense_hash_does_not_strip_whitespace():
    # Documented contract: normalization is the sealer's job, not the hasher's.
    assert defense_hash("abc", ["Q1"], ["A1"]) != defense_hash("abc", ["Q1"], ["  A1  "])


# =============================================================================
# Schema migration
# =============================================================================

def test_init_db_adds_defense_columns_idempotently(tmp_db):
    expected = {
        "defense_questions_json",
        "defense_answers_json",
        "defense_hash",
        "defense_signature",
        "defense_token_hash",
        "defended_at",
    }

    def columns() -> set[str]:
        conn = db.get_db_connection(tmp_db)
        try:
            return {row["name"] for row in conn.execute("PRAGMA table_info(skill_cards)")}
        finally:
            conn.close()

    assert expected <= columns()
    db.init_db(tmp_db)  # must stay idempotent after the columns exist
    assert expected <= columns()


# =============================================================================
# Sealing
# =============================================================================

def test_seal_is_one_time_and_token_bound(tmp_db):
    card = _make_card(tmp_db)

    first = seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)
    assert first["answered_count"] == 3
    assert len(first["defense_hash"]) == 64
    assert len(first["defense_signature"]) == 64
    assert first["defended_at"].endswith("+00:00")
    assert datetime.fromisoformat(first["defended_at"]).tzinfo is not None

    with pytest.raises(AlreadyDefended):
        seal_card_defense(card["card_hash"], hash_token(TOKEN), ["B1", "B2", "B3"], db_path=tmp_db)
    # Sealed cards answer "already defended" even for a wrong token: the error
    # must not confirm whether the presented token was correct.
    with pytest.raises(AlreadyDefended):
        seal_card_defense(card["card_hash"], hash_token("bad"), ["B1", "B2", "B3"], db_path=tmp_db)


def test_already_sealed_beats_bad_token(tmp_db):
    card = _make_card(tmp_db)
    seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)

    # A sealed card must never reveal whether a presented token was correct.
    with pytest.raises(AlreadyDefended):
        seal_card_defense(card["card_hash"], hash_token("wrong"), ["B1", "B2", "B3"], db_path=tmp_db)


def test_bad_token_does_not_seal_and_card_stays_undefended(tmp_db):
    card = _make_card(tmp_db)

    with pytest.raises(PermissionError):
        seal_card_defense(card["card_hash"], hash_token("wrong"), ["A1", "A2", "A3"], db_path=tmp_db)

    state = get_defense_state(card["card_hash"], db_path=tmp_db)
    assert state is not None
    assert state["defended"] is False
    assert state["defended_at"] is None

    seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)
    assert get_defense_state(card["card_hash"], db_path=tmp_db)["defended"] is True


def test_seal_missing_card_raises_lookup(tmp_db):
    with pytest.raises(LookupError):
        seal_card_defense("missing-card", hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)


def test_card_without_issued_token_cannot_be_sealed(tmp_db):
    card = _make_card(tmp_db, token=None)

    with pytest.raises(PermissionError):
        seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)

    assert get_defense_state(card["card_hash"], db_path=tmp_db)["defended"] is False


def test_empty_stored_token_hash_cannot_seal(tmp_db):
    card = _make_card(tmp_db, token=None)
    _issue_token(tmp_db, card["card_hash"], TOKEN)
    for stored in (None, "", "   "):
        conn = db.get_db_connection(tmp_db)
        try:
            with conn:
                conn.execute(
                    "UPDATE skill_cards SET defense_token_hash = ? WHERE card_hash = ?",
                    (stored, card["card_hash"]),
                )
        finally:
            conn.close()

        with pytest.raises(PermissionError):
            seal_card_defense(
                card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db
            )
    assert get_defense_state(card["card_hash"], db_path=tmp_db)["defended"] is False


@pytest.mark.parametrize("token_hash", ["", "   ", None])
def test_empty_presented_token_hash_cannot_seal(tmp_db, token_hash):
    card = _make_card(tmp_db)

    with pytest.raises(PermissionError):
        seal_card_defense(card["card_hash"], token_hash, ["A1", "A2", "A3"], db_path=tmp_db)

    assert get_defense_state(card["card_hash"], db_path=tmp_db)["defended"] is False


def test_non_ascii_token_hash_raises_permission_error_not_type_error(tmp_db):
    card = _make_card(tmp_db)

    # ``hmac.compare_digest`` raises TypeError for non-ASCII ``str`` operands;
    # the domain must surface a denied token instead of a 500.
    with pytest.raises(PermissionError):
        seal_card_defense(card["card_hash"], "naïve-token", ["A1", "A2", "A3"], db_path=tmp_db)

    assert get_defense_state(card["card_hash"], db_path=tmp_db)["defended"] is False


@pytest.mark.parametrize(
    ("case", "answers"),
    [
        ("no-answers", []),
        ("one-answer", ["A1"]),
        ("two-answers", ["A1", "A2"]),
        ("four-answers", ["A1", "A2", "A3", "A4"]),
        ("empty-middle", ["A1", "", "A3"]),
        ("blank-middle", ["A1", "   ", "A3"]),
        ("none-item", ["A1", None, "A3"]),
        ("int-item", ["A1", 42, "A3"]),
        ("single-string", "A1 A2 A3"),
    ],
)
def test_invalid_answers_are_rejected(tmp_db, case, answers):
    card = _make_card(tmp_db, card_hash=f"card-bad-{case}")

    with pytest.raises(ValueError):
        seal_card_defense(card["card_hash"], hash_token(TOKEN), answers, db_path=tmp_db)

    assert get_defense_state(card["card_hash"], db_path=tmp_db)["defended"] is False


def test_seal_strips_answers_and_persists_the_full_record(tmp_db):
    card = _make_card(tmp_db)

    sealed = seal_card_defense(
        card["card_hash"], hash_token(TOKEN), ["  A1  ", "A2\n", "\tA3"], db_path=tmp_db
    )
    state = get_defense_state(card["card_hash"], db_path=tmp_db)

    assert state["defense_answers"] == ["A1", "A2", "A3"]
    assert state["defense_questions"] == QUESTIONS
    assert state["defense_hash"] == defense_hash(card["card_hash"], QUESTIONS, ["A1", "A2", "A3"])
    assert state["defense_hash"] == sealed["defense_hash"]
    assert state["defense_signature"] == sealed["defense_signature"]
    assert state["defended_at"] == sealed["defended_at"]


def test_questions_are_derived_when_the_challenge_had_none(tmp_db):
    card = _make_card(tmp_db)
    _issue_token(tmp_db, card["card_hash"], TOKEN, questions=None)

    seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)

    state = get_defense_state(card["card_hash"], db_path=tmp_db)
    assert len(state["defense_questions"]) == 3
    assert all(isinstance(question, str) and question for question in state["defense_questions"])
    assert state["defense_hash"] == defense_hash(
        card["card_hash"], state["defense_questions"], ["A1", "A2", "A3"]
    )


@pytest.mark.parametrize(
    ("case", "questions"),
    [
        ("empty-strings", ["", "", ""]),
        ("blank-middle", ["Q1", "   ", "Q3"]),
        ("two-questions", ["Q1", "Q2"]),
        ("four-questions", ["Q1", "Q2", "Q3", "Q4"]),
        ("non-string", ["Q1", 2, "Q3"]),
        ("non-list", {"Q1": 1}),
    ],
)
def test_invalid_stored_questions_block_the_seal(tmp_db, case, questions):
    card = _make_card(tmp_db, card_hash=f"card-q-{case}")
    _issue_token(tmp_db, card["card_hash"], TOKEN, questions=questions)

    with pytest.raises(ValueError):
        seal_card_defense(
            card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db
        )

    private = db.get_skill_card_private(card["card_hash"], db_path=tmp_db)
    assert private["defended_at"] is None
    assert private["defense_hash"] is None


def test_two_threads_seal_exactly_once(tmp_db):
    card = _make_card(tmp_db)
    barrier = threading.Barrier(2, timeout=10)
    successes: list[dict] = []
    failures: list[BaseException] = []
    lock = threading.Lock()

    def attempt() -> None:
        barrier.wait()
        try:
            result = seal_card_defense(
                card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db
            )
        except BaseException as exc:  # noqa: BLE001 - the assertion below classifies it
            with lock:
                failures.append(exc)
        else:
            with lock:
                successes.append(result)

    threads = [threading.Thread(target=attempt) for _ in range(2)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(timeout=15)

    assert all(not thread.is_alive() for thread in threads)
    assert len(successes) == 1, failures
    assert len(failures) == 1, failures
    assert isinstance(failures[0], AlreadyDefended)
    assert not any(isinstance(exc, sqlite3.Error) for exc in failures)


# =============================================================================
# Re-saving a card must not disturb a recorded defense
# =============================================================================

def test_resaving_the_same_card_preserves_the_recorded_defense(tmp_db):
    card = _make_card(tmp_db)
    sealed = seal_card_defense(
        card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db
    )
    before = db.get_skill_card_private(card["card_hash"], db_path=tmp_db)

    # Re-verifying the same submission recomputes the same deterministic hash.
    resaved = db.save_skill_card(_card_data(card["card_hash"]), db_path=tmp_db)
    assert resaved["card_hash"] == card["card_hash"]

    after = db.get_skill_card_private(card["card_hash"], db_path=tmp_db)
    state = get_defense_state(card["card_hash"], db_path=tmp_db)

    for column in DEFENSE_COLUMNS:
        assert after[column] == before[column], column
    assert state["defended"] is True
    assert state["defense_hash"] == sealed["defense_hash"]
    assert state["defense_signature"] == sealed["defense_signature"]
    assert state["defended_at"] == sealed["defended_at"]

    # The six columns still describe one coherent defense.
    assert after["defense_token_hash"] == hash_token(TOKEN)
    assert json.loads(after["defense_questions_json"]) == QUESTIONS
    assert json.loads(after["defense_answers_json"]) == ["A1", "A2", "A3"]
    assert after["defense_hash"] == defense_hash(
        card["card_hash"], state["defense_questions"], state["defense_answers"]
    )

    with pytest.raises(AlreadyDefended):
        seal_card_defense(
            card["card_hash"], hash_token(TOKEN), ["B1", "B2", "B3"], db_path=tmp_db
        )


def test_resaving_a_card_still_updates_verifier_owned_columns(tmp_db):
    card = _make_card(tmp_db)
    seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)

    updated = dict(
        _card_data(card["card_hash"]), total_score=88, executive_summary="Re-verified."
    )
    resaved = db.save_skill_card(updated, db_path=tmp_db)

    assert resaved["total_score"] == 88
    assert resaved["executive_summary"] == "Re-verified."
    private = db.get_skill_card_private(card["card_hash"], db_path=tmp_db)
    assert private["defended_at"] is not None
    assert private["defense_hash"] is not None


# =============================================================================
# Public read model
# =============================================================================

def test_defense_state_shape_never_contains_the_token_hash(tmp_db):
    card = _make_card(tmp_db)

    before = get_defense_state(card["card_hash"], db_path=tmp_db)
    assert before == {
        "defense_questions": QUESTIONS,
        "defense_answers": [],
        "defense_hash": None,
        "defense_signature": None,
        "defended_at": None,
        "defended": False,
    }

    seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)
    after = get_defense_state(card["card_hash"], db_path=tmp_db)

    assert after["defended"] is True
    assert after["defense_answers"] == ["A1", "A2", "A3"]
    assert "defense_token_hash" not in after
    assert TOKEN not in json.dumps(after, ensure_ascii=False)


def test_get_defense_state_missing_card_returns_none(tmp_db):
    assert get_defense_state("missing-card", db_path=tmp_db) is None


def test_defense_state_rejects_a_corrupt_stored_payload(tmp_db):
    card = _make_card(tmp_db)
    conn = db.get_db_connection(tmp_db)
    try:
        with conn:
            conn.execute(
                "UPDATE skill_cards SET defense_answers_json = ? WHERE card_hash = ?",
                ('{"not": "a list"}', card["card_hash"]),
            )
    finally:
        conn.close()

    # A malformed payload is a data-integrity error, never silently emptied.
    with pytest.raises(ValueError):
        get_defense_state(card["card_hash"], db_path=tmp_db)


def test_public_card_projection_omits_the_token_hash(tmp_db):
    card = _make_card(tmp_db)
    seal_card_defense(card["card_hash"], hash_token(TOKEN), ["A1", "A2", "A3"], db_path=tmp_db)

    private = db.get_skill_card_private(card["card_hash"], db_path=tmp_db)
    assert private["defense_token_hash"] == hash_token(TOKEN)

    public = db.get_public_skill_card(card["card_hash"], db_path=tmp_db)
    assert "defense_token_hash" not in public
    assert hash_token(TOKEN) not in json.dumps(public, ensure_ascii=False)
