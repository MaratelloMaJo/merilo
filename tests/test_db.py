"""P1: SQLite data layer — SQLi safety, idempotent seeding, WAL, concurrency."""

import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest

import backend.db as db
from backend.seed_data import seed_database


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    monkeypatch.setenv("MERILO_DEMO_PASSWORD", "unit-test-demo-password")
    path = str(tmp_path / "merilo-test.db")
    db.init_db(path)
    return path


def test_sql_injection_in_task_id_returns_none(db_path):
    assert db.get_task_by_id("' OR 1=1 --", db_path=db_path) is None
    assert db.get_task_by_id("task-fintech-01'; DROP TABLE micro_tasks; --", db_path=db_path) is None


def test_double_seed_is_idempotent(db_path):
    seed_database(db_path)
    seed_database(db_path)

    assert len(db.get_all_tasks(db_path)) == 8
    assert len(db.get_all_users(db_path)) == 1


def test_connection_pragmas_are_tuned(db_path):
    conn = db.get_db_connection(db_path)
    try:
        journal_mode = conn.execute("PRAGMA journal_mode;").fetchone()[0]
        busy_timeout = conn.execute("PRAGMA busy_timeout;").fetchone()[0]
        synchronous = conn.execute("PRAGMA synchronous;").fetchone()[0]
    finally:
        conn.close()

    assert str(journal_mode).lower() == "wal"
    assert busy_timeout >= 5000
    assert synchronous in (1, "normal")


def test_eight_threads_can_create_users_without_locking_errors(db_path):
    seed_database(db_path)

    def _create(index: int) -> str:
        user = db.create_user(
            email=f"thread-{index}@merilo.kz",
            password=f"thread-password-{index}",
            full_name=f"Thread {index}",
            db_path=db_path,
        )
        return user["id"]

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_create, index) for index in range(8)]
        created_ids = []
        for future in futures:
            try:
                created_ids.append(future.result())
            except sqlite3.Error as exc:  # pragma: no cover - only on a real bug
                pytest.fail(f"concurrent create_user raised {type(exc).__name__}: {exc}")

    assert len(set(created_ids)) == 8
    # The seeded demo candidate plus the eight concurrent users.
    assert len(db.get_all_users(db_path)) == 9


def test_ping_db_ok_and_failure(db_path, tmp_path):
    assert db.ping_db(db_path) is True
    # A directory is not a SQLite database file: the probe must degrade to False.
    assert db.ping_db(str(tmp_path)) is False


def test_get_skill_card_unknown_hash_returns_none(db_path):
    assert db.get_skill_card("nope", db_path=db_path) is None


def test_init_db_backfills_empty_card_metadata_without_overwriting(db_path):
    legacy = {
        "card_hash": "legacy000001",
        "candidate_name": "Legacy Candidate",
        "task_id": "task-fintech-01",
        "task_title": "Legacy task",
        "company_name": "Legacy Co",
        "total_score": 42,
        "badge_tier": "Needs Work",
        "status": "verified",
        "gate_reached": 3,
        "clean_code": 42,
        "architecture": 42,
        "edge_cases": 42,
        "executive_summary": "Created before rubric metadata existed.",
        "submitted_code": "def legacy(): pass\n",
        "rubric_version": "",
        "model": "",
    }
    explicit = {
        **legacy,
        "card_hash": "explicit0001",
        "rubric_version": "custom-rubric",
        "model": "custom-model",
    }
    db.save_skill_card(legacy, db_path=db_path)
    db.save_skill_card(explicit, db_path=db_path)

    db.init_db(db_path)

    backfilled = db.get_skill_card_private("legacy000001", db_path=db_path)
    assert backfilled is not None
    assert backfilled["rubric_version"] == "2026-11-v1"
    assert backfilled["model"]

    preserved = db.get_skill_card_private("explicit0001", db_path=db_path)
    assert preserved is not None
    assert preserved["rubric_version"] == "custom-rubric"
    assert preserved["model"] == "custom-model"
