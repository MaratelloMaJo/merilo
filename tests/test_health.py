"""P1: health / readiness probes must be cheap, honest and Gemini-free."""

from backend import verifier


def test_health_returns_liveness_payload(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ok"
    assert payload["mode"] == "demo_active"
    assert payload["version"]
    assert payload["model"]
    assert payload["db"] == "ok"


def test_health_never_calls_gemini(client, monkeypatch):
    """Liveness must stay up even when the LLM layer is completely broken."""

    def _explode(*args, **kwargs):
        raise AssertionError("GET /api/health must never reach the Gemini gate")

    monkeypatch.setattr(verifier, "_evaluate_with_gemini", _explode)

    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_ready_reports_storage_and_llm_configuration(client):
    response = client.get("/api/ready")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is True
    assert payload["db"] == "ok"
    assert "gemini_key" in payload
    assert isinstance(payload["gemini_key"], bool)
    assert payload["mode"] in {"live", "fallback"}


def test_correlation_headers_present_and_parseable(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    assert len(response.headers["X-Request-ID"]) == 12

    latency_ms = float(response.headers["X-Response-Time"])
    assert latency_ms >= 0.0
