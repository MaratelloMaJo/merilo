"""Tests for the talent agent, Developer DNA, adaptive challenge review and the
extension bridge. No network: GitHub and OpenAI are mocked or absent."""

import json

import pytest

from backend import agent_api, workspace_api as ws


def _sse(response):
    return [json.loads(line[5:]) for line in response.text.splitlines() if line.startswith("data:")]


@pytest.fixture
def fake_github(monkeypatch):
    repo = {"name": "shop-api", "full_name": "alice/shop-api", "html_url": "https://github.com/alice/shop-api", "default_branch": "main",
            "description": "FastAPI + PostgreSQL service", "topics": ["fastapi"], "language": "Python", "size": 900, "fork": False,
            "pushed_at": "2026-10-01T00:00:00Z", "stargazers_count": 3, "owner": {"login": "alice", "type": "User", "avatar_url": "", "html_url": "https://github.com/alice"}}
    tutorial = {**repo, "name": "fastapi-tutorial", "full_name": "bob/fastapi-tutorial", "description": "learning fastapi postgresql course",
                "owner": {"login": "bob", "type": "User", "avatar_url": "", "html_url": "https://github.com/bob"}}
    org = {**repo, "full_name": "acme/platform", "owner": {"login": "acme", "type": "Organization"}}
    files = {"requirements.txt": "# deps\nfastapi==0.110\nasyncpg==0.29\n", "pyproject.toml": "[project]\nname = \"fastapi-shop\"\n"}
    tree = ["requirements.txt", "pyproject.toml", "app/api/routes.py", "app/services/orders.py", "app/models/order.py",
            "tests/test_orders.py", ".github/workflows/ci.yml", "Dockerfile", "alembic/versions/001.py"]

    async def fake_gh(path):
        if path.startswith("/search/repositories"):
            return {"total_count": 3, "items": [repo, tutorial, org]}
        if "/git/trees/" in path:
            return {"tree": [{"type": "blob", "path": p} for p in tree]}
        if path.startswith("/users/alice/repos"):
            return [repo]
        if path == "/users/alice":
            return {"login": "alice", "name": "Alice", "html_url": "https://github.com/alice"}
        if "/commits?" in path:
            return [{"commit": {"author": {"date": "2026-11-01T10:00:00Z"}, "message": "feat: add order endpoint"}},
                    {"commit": {"author": {"date": "2026-10-20T10:00:00Z"}, "message": "fix"}}]
        if path.startswith("/users/alice/events"):
            return [{"type": "PullRequestReviewEvent", "repo": {"name": "other/lib"}}]
        if path.startswith("/search/issues"):
            return {"total_count": 4, "items": [{"title": "Fix pool leak", "html_url": "https://github.com/other/lib/pull/1", "repository_url": "https://api.github.com/repos/other/lib"}]}
        raise AssertionError(path)

    async def fake_read(owner, repo_name, path, ref=None):
        return files[path]

    def no_rate_limit(path):
        raise ws.UpstreamError(503, "offline")

    monkeypatch.setattr(ws, "_gh", fake_gh)
    monkeypatch.setattr(ws, "_read_file", fake_read)
    monkeypatch.setattr(ws, "_gh_sync", no_rate_limit)
    agent_api._MEM_CACHE.clear()


def test_plan_queries_combine_technologies():
    plan = agent_api._plan_queries(["Python"], ["FastAPI", "PostgreSQL", "Docker"], "Kazakhstan")
    assert plan[0]["q"].startswith("fastapi postgresql language:Python")
    assert any(q["q"].startswith("topic:fastapi") for q in plan)
    assert plan[-1]["kind"] == "users" and 'location:"Kazakhstan"' in plan[-1]["q"]
    assert all("fork:false" in q["q"] for q in plan if q["kind"] == "repositories")


def test_agent_streams_real_steps_and_evidence(client, fake_github, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    res = client.post("/api/agent/talent-search", json={"query": "Найди 3 Python-разработчиков с FastAPI, PostgreSQL и опытом реальных проектов"})
    events = _sse(res)
    steps = [e["id"] for e in events if e["type"] == "step" and e["status"] == "done"]
    assert steps == ["understand", "plan", "search", "prefilter", "verify", "rank"]
    done = events[-1]
    assert done["type"] == "done" and done["count"] == 3
    assert done["budget"]["model_calls"] == 0 and done["budget"]["tokens"] == 0  # no key → no model call
    assert [r["login"] for r in done["results"]] == ["alice"]
    alice = done["results"][0]
    assert alice["statuses"] == {"Python": "code", "FastAPI": "code", "PostgreSQL": "code"}
    fastapi = next(e for e in alice["evidence"] if e["skill"] == "FastAPI")
    assert fastapi["url"].endswith("requirements.txt#L2")  # the "# deps" comment and project name are skipped
    reasons = {x["reason"]: x["count"] for x in done["excluded"]}
    assert reasons["организация, а не человек"] == 1
    assert reasons["только учебные/шаблонные проекты"] == 1
    assert any("тесты" in s for s in alice["real"])


def test_agent_uses_recruiter_criteria_without_model(client, fake_github):
    res = client.post("/api/agent/talent-search", json={"query": "python fastapi", "criteria": {"languages": ["Python"], "frameworks": ["FastAPI"], "count": 2}})
    first = next(e for e in _sse(res) if e["type"] == "step" and e["id"] == "understand" and e["status"] == "done")
    assert "модель не вызывалась" in first["detail"] and first["count"] == 2


def test_developer_dna_dimensions_have_sources(client, fake_github):
    body = client.get("/api/github/users/alice/dna").json()
    dims = {d["key"]: d for d in body["dimensions"]}
    assert set(dims) == {"activity", "complexity", "testing", "architecture", "collaboration", "evidence"}
    assert body["model_tokens"] == 0 and body["commit_sample"] == 2
    assert dims["testing"]["level"] >= 2 and dims["testing"]["facts"][0]["url"].endswith("tests/test_orders.py")
    assert "4 смёрженных" in dims["collaboration"]["facts"][0]["text"]
    assert any("слои" in f["text"] for f in dims["architecture"]["facts"])
    assert len(body["weeks"]) == 26


def test_dna_rejects_bad_login(client):
    assert client.get("/api/github/users/bad..login/dna").status_code == 422


def test_adaptive_challenge_is_honest_without_key(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    agent_api._MEM_CACHE.clear()
    body = client.post("/api/ai/adaptive-challenge", json={"skill": "PostgreSQL"}).json()
    assert body["mode"] == "unavailable" and body["draft"] is None


def test_challenge_review_runs_deterministic_checks(client, monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    task = client.get("/api/tasks/task-edtech-03").json()
    defect = next(line.strip() for line in task["buggy_code"].splitlines() if "history" in line and "def " in line)
    agent_api.kv_set("challenge_meta:task-edtech-03", {"skill": "Python", "criteria": ["Нет изменяемого аргумента по умолчанию"], "defects": [{"name": "Изменяемый аргумент по умолчанию", "snippet": defect}]})
    unchanged = client.post("/api/ai/challenge-review", json={"task_id": "task-edtech-03", "code": task["buggy_code"]}).json()
    assert unchanged["executed"] is False and unchanged["mode"] == "unavailable"
    assert [c["pass"] for c in unchanged["checks"]] == [False, False]
    fixed = task["buggy_code"].replace(defect, "def record_and_calculate_average(new_score, history=None):")
    review = client.post("/api/ai/challenge-review", json={"task_id": "task-edtech-03", "code": fixed, "card_hash": "abcdef123456"}).json()
    assert [c["pass"] for c in review["checks"]] == [True, True]
    assert client.get("/api/challenges/review/abcdef123456").json()["checks"][1]["pass"] is True


def test_challenge_meta_is_write_once(client):
    payload = {"skill": "SQL", "criteria": ["Параметризованный запрос"], "defects": []}
    assert client.put("/api/challenges/task-fintech-01/meta", json=payload).status_code == 200
    assert client.put("/api/challenges/task-fintech-01/meta", json=payload).status_code == 409
    assert client.put("/api/challenges/no-such-task/meta", json=payload).status_code == 404
    assert client.get("/api/challenges/task-fintech-01/meta").json()["skill"] == "SQL"


def test_extension_bridge_roundtrip(client):
    assert client.put("/api/workspace/active-job", json={"title": "Python Backend", "required": ["Python", "FastAPI"], "preferred": []}).status_code == 200
    assert client.get("/api/workspace/active-job").json()["required"] == ["Python", "FastAPI"]
    assert client.post("/api/extension/inbox", json={"url": "javascript:alert(1)"}).status_code == 422
    added = client.post("/api/extension/inbox", json={"login": "alice", "url": "https://github.com/alice", "source": "github", "skills": ["FastAPI"],
                                                      "evidence": [{"skill": "FastAPI", "detail": "main.py:2", "url": "https://github.com/alice/x/blob/main/main.py#L2", "secret": "drop me"}]}).json()
    items = client.get("/api/extension/inbox").json()["items"]
    assert items[-1]["login"] == "alice" and "secret" not in items[-1]["evidence"][0]
    client.delete(f"/api/extension/inbox/{added['id']}")
    assert all(i["id"] != added["id"] for i in client.get("/api/extension/inbox").json()["items"])


def test_parse_query_fast_mode_never_calls_model(client, monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    async def boom(*a, **k):
        raise AssertionError("model must not be called in fast mode")

    monkeypatch.setattr(ws.openai_client, "chat_json", boom)
    body = client.post("/api/ai/parse-query", json={"query": "Найди 7 Python-разработчиков с FastAPI", "fast": True}).json()
    assert body["mode"] == "heuristic" and body["criteria"]["count"] == 7
