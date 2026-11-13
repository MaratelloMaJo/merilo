"""Cookie sessions and the optional second role.

The browser should stay signed in through an HttpOnly cookie, while API clients
keep using the Bearer token. One account may hold a primary role and one
secondary role so the same person can use both sides of the workspace.
"""

import uuid


def _register(client, role="candidate"):
    email = f"cookie-{uuid.uuid4().hex[:12]}@example.com"
    response = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "secret123",
            "full_name": "Cookie Tester",
            "role": role,
        },
    )
    assert response.status_code == 200, response.text
    return email, response.json()


def test_register_sets_http_only_session_cookie(client):
    client.cookies.clear()
    _, data = _register(client)

    cookie = client.cookies.get("merilo_session")
    assert cookie == data["token"]

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == data["user"]["email"]

    # The token still works as a Bearer credential for API clients.
    header_me = client.get(
        "/api/auth/me",
        headers={"Authorization": f"Bearer {data['token']}"},
    )
    assert header_me.status_code == 200


def test_logout_clears_the_session_cookie(client):
    client.cookies.clear()
    _register(client)

    response = client.post("/api/auth/logout")
    assert response.status_code == 200

    me = client.get("/api/auth/me")
    assert me.status_code == 401


def test_secondary_role_must_differ_from_primary(client):
    client.cookies.clear()
    _, data = _register(client, role="candidate")

    same = client.post("/api/auth/roles", json={"role": "candidate"})
    assert same.status_code == 400

    added = client.post("/api/auth/roles", json={"role": "recruiter"})
    assert added.status_code == 200
    assert added.json()["user"]["role"] == "candidate"
    assert added.json()["user"]["secondary_role"] == "recruiter"

    me = client.get("/api/auth/me")
    assert me.json()["secondary_role"] == "recruiter"


def test_secondary_role_rejects_privileged_roles(client):
    client.cookies.clear()
    _register(client)

    response = client.post("/api/auth/roles", json={"role": "owner"})
    assert response.status_code == 422


def test_secondary_role_requires_a_session(client):
    client.cookies.clear()
    response = client.post("/api/auth/roles", json={"role": "recruiter"})
    assert response.status_code == 401
