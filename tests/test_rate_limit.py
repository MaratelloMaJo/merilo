"""P1: per-IP sliding-window rate limits for verification and task posting."""

from collections import defaultdict, deque

import backend.main as main

TASK_ID = "task-fintech-01"
CODE = "return 1\n"

VALID_TASK_PAYLOAD = {
    "title": "QA Contract Task",
    "company_name": "Test Co",
    "stack": "Python 3.11",
    "difficulty": "Junior",
    "description": "Достаточно длинное описание бизнес-кейса для проверки лимита.",
    "rubric": {"clean_code": "читаемость"},
    "buggy_code": "def broken():\n    pass\n",
}


def _verify(client):
    return client.post(
        "/api/submissions/verify",
        json={"task_id": TASK_ID, "submitted_code": CODE, "candidate_name": "Rate Limited"},
    )


def test_verify_endpoint_returns_429_after_limit(client, monkeypatch):
    monkeypatch.setattr(main, "VERIFY_RATE_LIMIT_MAX_REQUESTS", 2)
    main._verify_rate_limit_windows.clear()

    assert _verify(client).status_code == 200
    assert _verify(client).status_code == 200

    blocked = _verify(client)
    assert blocked.status_code == 429
    payload = blocked.json()
    assert payload["error"]["code"] == 429


def test_check_rate_limit_unit_window_semantics():
    windows = defaultdict(deque)

    assert main._check_rate_limit("10.0.0.1", 1, 10.0, windows) is True
    assert main._check_rate_limit("10.0.0.1", 1, 10.0, windows) is False


def test_check_rate_limit_expires_stale_hits():
    windows = defaultdict(deque)
    windows["10.0.0.2"].append(0.0)

    assert main._check_rate_limit("10.0.0.2", 1, 10.0, windows) is True


def test_task_posting_returns_429_after_limit(client, monkeypatch):
    monkeypatch.setattr(main, "TASK_RATE_LIMIT_MAX_REQUESTS", 1)
    main._task_rate_limit_windows.clear()

    first = client.post("/api/tasks", json=VALID_TASK_PAYLOAD)
    assert first.status_code == 201

    second = client.post("/api/tasks", json=VALID_TASK_PAYLOAD)
    assert second.status_code == 429
    assert second.json()["error"]["code"] == 429
