"""Demo access: one-click sessions and an honest logout.

``MERILO_DEMO_MODE`` is read once at import time, so the tests flip the module
global instead of the environment.
"""

import backend.main as main


def test_demo_session_is_404_when_disabled(client, monkeypatch):
    monkeypatch.setattr(main, "DEMO_MODE", False)

    response = client.post("/api/demo/session", json={"account": "owner"})

    assert response.status_code == 404


def test_demo_session_opens_founder_account(client, monkeypatch):
    monkeypatch.setattr(main, "DEMO_MODE", True)

    response = client.post("/api/demo/session", json={"account": "owner"})

    assert response.status_code == 200
    data = response.json()
    assert data["user"]["email"] == "marat@merilo.kz"
    assert data["user"]["role"] == "owner"
    assert data["token"]

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {data['token']}"})
    assert me.status_code == 200
    assert me.json()["role"] == "owner"


def test_demo_session_opens_recruiter_account(client, monkeypatch):
    monkeypatch.setattr(main, "DEMO_MODE", True)

    response = client.post("/api/demo/session", json={"account": "recruiter"})

    assert response.status_code == 200
    assert response.json()["user"]["email"] == "hiring@example.com"


def test_demo_session_rejects_unknown_account(client, monkeypatch):
    monkeypatch.setattr(main, "DEMO_MODE", True)

    response = client.post("/api/demo/session", json={"account": "admin"})

    assert response.status_code == 400


def test_me_without_token_is_401(client):
    """Without a session the profile endpoint must not resurrect a default user,
    otherwise the logout button cannot work."""
    client.cookies.clear()
    response = client.get("/api/auth/me")

    assert response.status_code == 401


def test_pages_and_scripts_are_revalidated(client):
    """A deploy must not leave an old app.js in the browser cache."""
    for path in ("/", "/static/app.js"):
        response = client.get(path)
        assert response.status_code == 200
        assert response.headers.get("cache-control") == "no-cache, must-revalidate"
