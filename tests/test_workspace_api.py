"""Regression tests for the recruiter workspace API, the shared OpenAI client
and the OpenAI-backed Gate 3. No network: OpenAI and GitHub are mocked."""

import asyncio

import pytest

from backend import openai_client, verifier, workspace_api
from backend.schemas import CodeEvaluationResponse


def test_luna_models_use_max_completion_tokens(monkeypatch):
    monkeypatch.setenv("OPENAI_MODEL", "gpt-6-luna")
    body = openai_client._body([{"role": "user", "content": "x"}], 300, json_mode=True, stream=False)
    assert "max_tokens" not in body and "temperature" not in body
    assert body["max_completion_tokens"] >= 300
    assert body["response_format"] == {"type": "json_object"}


def test_legacy_models_keep_max_tokens(monkeypatch):
    monkeypatch.setenv("OPENAI_MODEL", "gpt-4.1-mini")
    body = openai_client._body([], 300, json_mode=False, stream=True)
    assert body["max_tokens"] == 300 and body["stream"] is True


def test_default_model_is_luna(monkeypatch):
    monkeypatch.delenv("OPENAI_MODEL", raising=False)
    assert openai_client.model() == "gpt-6-luna"


def test_budget_guard_blocks_calls(monkeypatch):
    monkeypatch.setenv("OPENAI_DAILY_TOKEN_BUDGET", "1")
    monkeypatch.setitem(openai_client._usage, "tokens", 5)
    with pytest.raises(openai_client.OpenAIError) as exc:
        openai_client._check_budget()
    assert exc.value.status == 429
    openai_client._usage["tokens"] = 0


def test_copilot_without_key_is_honest(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    res = client.post("/api/ai/copilot", json={"message": "Привет"})
    assert res.status_code == 200
    assert res.json()["mode"] == "unavailable" and res.json()["reply"] is None


def test_parse_query_falls_back_to_heuristic(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    res = client.post("/api/ai/parse-query", json={"query": "Python backend FastAPI PostgreSQL Docker"})
    body = res.json()
    assert body["mode"] == "heuristic"
    assert "Python" in body["criteria"]["languages"]
    assert {"FastAPI", "PostgreSQL", "Docker"} <= set(body["criteria"]["frameworks"])


def test_api_token_is_enforced_when_configured(client, monkeypatch):
    monkeypatch.setenv("MERILO_API_TOKEN", "secret-token")
    assert client.post("/api/ai/parse-query", json={"query": "python dev"}).status_code == 401
    ok = client.post("/api/ai/parse-query", json={"query": "python dev"}, headers={"X-Merilo-Token": "secret-token"})
    assert ok.status_code == 200


def test_skill_proofs_link_skills_to_file_and_line(client, monkeypatch):
    files = {
        "backend/main.py": "import os\nfrom fastapi import FastAPI\napp = FastAPI()\n\n@app.get('/health')\nasync def health():\n    return {}\n",
        "docker-compose.yml": "services:\n  db:\n    image: postgres:16\n",
        "tests/test_api.py": "import pytest\n\ndef test_health():\n    assert True\n",
    }

    async def fake_gh(path):
        if path.endswith("/repos/acme/shop"):
            return {"default_branch": "main"}
        if "/git/trees/" in path:
            return {"tree": [{"type": "blob", "path": p} for p in files]}
        if path.endswith("/languages"):
            return {"Python": 1200, "Dockerfile": 40}
        raise AssertionError(path)

    async def fake_read(owner, repo, path, ref=None):
        return files[path]

    monkeypatch.setattr(workspace_api, "_gh", fake_gh)
    monkeypatch.setattr(workspace_api, "_read_file", fake_read)
    body = client.get("/api/github/repos/acme/shop/proofs").json()
    by_skill = {p["skill"]: p for p in body["proofs"]}
    fastapi = by_skill["FastAPI"]
    assert fastapi["status"] == "evidence_found"
    assert fastapi["sources"][0]["path"] == "backend/main.py"
    assert fastapi["sources"][0]["line"] == 2
    assert fastapi["sources"][0]["url"].endswith("backend/main.py#L2")
    assert "PostgreSQL" in by_skill and "pytest" in by_skill
    assert "Kubernetes" in body["not_found"]  # no evidence → listed, never a negative verdict
    assert body["languages"] == ["Python", "Dockerfile"] and body["limited"] is False


def test_file_endpoint_rejects_traversal(client):
    assert client.get("/api/github/repos/acme/shop/file", params={"path": "../etc/passwd"}).status_code == 422


def test_gate3_uses_openai_when_configured(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-6-luna")

    async def fake_chat_json(messages, **kwargs):
        return {"clean_code": 80, "architecture": 70, "edge_cases": 60, "is_plagiarized_or_injected": False,
                "executive_summary": "Аккуратное решение."}

    monkeypatch.setattr(openai_client, "chat_json", fake_chat_json)
    task = {"id": "task-x", "description": "d", "rubric": {}}
    evaluation, reason = asyncio.run(verifier._evaluate_with_openai("task-x-unique", "print(1)\n", "Тест", "python", task))
    assert reason is None
    assert isinstance(evaluation, CodeEvaluationResponse)
    assert evaluation.evaluation_mode == "openai" and evaluation.confidence == "high"
    assert evaluation.architecture == 70


def test_gate3_openai_failure_falls_back_honestly(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)

    async def boom(messages, **kwargs):
        raise openai_client.OpenAIError(500, "upstream")

    monkeypatch.setattr(openai_client, "chat_json", boom)
    task = {"id": "task-fintech-01", "description": "d", "rubric": {}}
    evaluation = asyncio.run(verifier._evaluate_with_gemini("task-fintech-01", "def f():\n    return 1\n", "Тест", "python", task))
    assert evaluation.evaluation_mode == "fallback"
    assert "OpenAI 500" in (evaluation.fallback_reason or "")
