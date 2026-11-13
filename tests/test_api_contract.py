"""P1: the public JSON API contract (tasks, verification, cards, error envelopes)."""

import pytest

DEFAULT_TASK_IDS = {"task-fintech-01", "task-logistics-02", "task-edtech-03"}

TASK_KEYS = {
    "id",
    "title",
    "company_name",
    "stack",
    "difficulty",
    "description",
    "rubric",
    "buggy_code",
    "preset_ideal",
    "preset_vulnerable",
    "preset_injection",
}


def _post_verify(client, task_id, code, candidate="Test Candidate"):
    return client.post(
        "/api/submissions/verify",
        json={
            "task_id": task_id,
            "submitted_code": code,
            "candidate_name": candidate,
        },
    )


def test_tasks_endpoint_returns_curated_micro_tasks(client):
    response = client.get("/api/tasks")

    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) >= 3
    for task in tasks:
        assert TASK_KEYS <= set(task)

    assert DEFAULT_TASK_IDS <= {task["id"] for task in tasks}


def test_ideal_preset_is_verified_on_gate_3(client, sample_task):
    response = _post_verify(client, sample_task["id"], sample_task["preset_ideal"])

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "verified"
    assert payload["gate_reached"] == 3
    assert 0 <= payload["total_score"] <= 100
    assert len(payload["card_hash"]) == 12
    assert payload["verify_url"] == f"/card/{payload['card_hash']}"

    # No API key in the test env => the honest deterministic fallback is used.
    assert payload["evaluation_mode"] == "fallback"
    assert payload["confidence"] == "low"
    assert payload["fallback_reason"]

    evaluation = payload["evaluation"]
    assert {"clean_code", "architecture", "edge_cases", "executive_summary"} <= set(evaluation)


def test_public_card_is_retrievable_and_signature_is_valid(client, sample_task):
    verified = _post_verify(client, sample_task["id"], sample_task["preset_ideal"]).json()

    response = client.get(f"/api/cards/{verified['card_hash']}")

    assert response.status_code == 200
    card = response.json()
    assert card["is_signature_valid"] is True
    assert card["total_score"] == verified["total_score"]
    assert card["card_hash"] == verified["card_hash"]


@pytest.mark.parametrize("blank_code", ["", "   \n\t  "])
def test_blank_submission_is_rejected_with_400(client, sample_task, blank_code):
    response = _post_verify(client, sample_task["id"], blank_code)

    assert response.status_code == 400
    assert response.json()["error"]["code"] == 400


def test_oversized_submission_is_rejected_with_413(client, sample_task):
    response = _post_verify(client, sample_task["id"], "a" * (64 * 1024 + 1))

    assert response.status_code == 413
    assert response.json()["error"]["code"] == 413


def test_unknown_task_id_returns_404(client):
    response = _post_verify(client, "task-does-not-exist", "return 1\n")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == 404


def test_unknown_card_hash_returns_404(client):
    response = client.get("/api/cards/does-not-exist")

    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == 404


def test_missing_fields_return_json_422_envelope(client):
    response = client.post("/api/submissions/verify", json={})

    assert response.status_code == 422
    payload = response.json()
    assert payload["error"]["code"] == 422
    assert "message" in payload["error"]


def test_unknown_route_returns_json_404_envelope(client):
    response = client.get("/api/definitely-not-a-route")

    assert response.status_code == 404
    payload = response.json()
    assert payload["error"]["code"] == 404


def test_card_hash_is_stable_per_candidate_and_changes_per_candidate(client, sample_task):
    code = sample_task["preset_ideal"]

    first = _post_verify(client, sample_task["id"], code, candidate="Test Candidate").json()
    second = _post_verify(client, sample_task["id"], code, candidate="Test Candidate").json()
    other = _post_verify(client, sample_task["id"], code, candidate="Another Candidate").json()

    assert first["card_hash"] == second["card_hash"]
    assert first["card_hash"] != other["card_hash"]


def test_non_utf8_request_body_is_rejected_without_500(client):
    """Raw 0xFF/0xFE bytes are not valid UTF-8 JSON.

    Observed behaviour: the body parser fails and the stable JSON error envelope
    answers 400 (matching the expected code; the body is never echoed back).
    """
    response = client.post(
        "/api/submissions/verify",
        content=b'{"task_id":"task-fintech-01","submitted_code":"\xff\xfe"}',
        headers={"content-type": "application/json"},
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == 400
