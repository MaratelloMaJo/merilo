"""Self-service registration must never grant privileged roles."""

import uuid

import pytest


def _email() -> str:
    return f"role-{uuid.uuid4().hex[:10]}@example.com"


@pytest.mark.parametrize("role", ["owner", "admin", "superuser", "", "Candidate", None])
def test_privileged_or_unknown_roles_are_rejected(client, role):
    res = client.post("/api/auth/register", json={"email": _email(), "password": "secret12", "full_name": "Role Test", "role": role})
    assert res.status_code == 422


@pytest.mark.parametrize("role", ["candidate", "recruiter"])
def test_allowed_roles_are_kept(client, role):
    res = client.post("/api/auth/register", json={"email": _email(), "password": "secret12", "full_name": "Role Test", "role": role})
    assert res.status_code == 200
    assert res.json()["user"]["role"] == role


def test_role_defaults_to_candidate(client):
    res = client.post("/api/auth/register", json={"email": _email(), "password": "secret12", "full_name": "Role Test"})
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "candidate"
