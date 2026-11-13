"""
Merilo Workspace API — additive router for the recruiter workspace (/app).

Services (one module, clearly separated sections; no microservices):
  * GitHub Intelligence  — profile, repository tree, file viewer (public REST API).
  * Skill Proof Engine   — deterministic detectors linking skills to file:line evidence.
  * Talent Search        — GitHub user/repo search with a full Search Trace.
  * AI (OpenAI, one model) — query parsing, Copilot (JSON + SSE streaming),
    Repo-to-Reality challenge drafts.
All upstream calls are server-side, bounded by timeouts, cached and rate limited.
Nothing is fabricated: every finding carries its source or an explicit
"not enough evidence" status.
"""

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict, deque
from typing import Any

from fastapi import APIRouter, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from backend import openai_client
from backend.openai_client import OpenAIError

logger = logging.getLogger("merilo.workspace")
router = APIRouter(prefix="/api", tags=["workspace"])


# ---------------------------------------------------------------------------
# Guards: optional token auth + per-IP rate limit for AI endpoints
# ---------------------------------------------------------------------------

_ai_windows: dict[str, deque] = defaultdict(deque)
AI_RATE_MAX = 30
AI_RATE_WINDOW = 60.0


def _guard(request: Request, token: str | None, ai: bool = False) -> None:
    required = (os.getenv("MERILO_API_TOKEN") or "").strip()
    if required and token != required:
        raise HTTPException(401, "Нужен заголовок X-Merilo-Token")
    if ai:
        ip = request.client.host if request.client else "unknown"
        now = time.monotonic()
        win = _ai_windows[ip]
        while win and now - win[0] > AI_RATE_WINDOW:
            win.popleft()
        if len(win) >= AI_RATE_MAX:
            raise HTTPException(429, "Слишком много AI-запросов, подождите минуту")
        win.append(now)


def _ai_error(exc: OpenAIError) -> HTTPException:
    if exc.status == 401:
        return HTTPException(503, "OpenAI: ключ не задан или недействителен")
    if exc.status == 429:
        return HTTPException(429, f"OpenAI: {exc.message or 'лимит запросов'}")
    return HTTPException(502, f"OpenAI: ошибка {exc.status}. {exc.message[:160]}")


# ---------------------------------------------------------------------------
# GitHub client (cached)
# ---------------------------------------------------------------------------

_GH_CACHE: dict[str, tuple[float, Any]] = {}
GH_STATS = {"calls": 0}  # real network calls (cache hits are not counted)
_GH_TTL = 1800.0
_LOGIN_RE = re.compile(r"^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$")
_REPO_RE = re.compile(r"^[A-Za-z0-9_.-]{1,100}$")
_PATH_RE = re.compile(r"^[\w.\-/ @+]{1,300}$")


class UpstreamError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def _gh_sync(path: str) -> Any:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "merilo-workspace", "X-GitHub-Api-Version": "2022-11-28"}
    token = (os.getenv("GITHUB_TOKEN") or "").strip()
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"https://api.github.com{path}", headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8") or "null")
    except urllib.error.HTTPError as exc:
        raise UpstreamError(exc.code, str(exc.reason)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise UpstreamError(503, str(exc)) from exc


_DISK_TTL = 3 * 3600.0  # GitHub responses survive server restarts (the unauthenticated limit is 60 calls/hour)


def _disk_get(path: str) -> Any:
    try:
        from backend.db import get_db_connection
        conn = get_db_connection()
        try:
            conn.execute("CREATE TABLE IF NOT EXISTS gh_cache (path TEXT PRIMARY KEY, body TEXT NOT NULL, ts REAL NOT NULL)")
            row = conn.execute("SELECT body, ts FROM gh_cache WHERE path = ?", (path,)).fetchone()
        finally:
            conn.close()
        if row and time.time() - row[1] < _DISK_TTL:
            return json.loads(row[0])
    except Exception:  # noqa: BLE001 — the cache must never break a request
        logger.debug("gh_disk_cache_read_failed")
    return None


def _disk_set(path: str, data: Any) -> None:
    try:
        body = json.dumps(data, ensure_ascii=False)
        if len(body) > 3_000_000:
            return
        from backend.db import get_db_connection
        conn = get_db_connection()
        try:
            conn.execute("INSERT INTO gh_cache (path, body, ts) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET body = excluded.body, ts = excluded.ts",
                         (path, body, time.time()))
            conn.execute("DELETE FROM gh_cache WHERE ts < ?", (time.time() - _DISK_TTL,))
            conn.commit()
        finally:
            conn.close()
    except Exception:  # noqa: BLE001
        logger.debug("gh_disk_cache_write_failed")


async def _gh(path: str) -> Any:
    cached = _GH_CACHE.get(path)
    if cached and time.time() - cached[0] < _GH_TTL:
        return cached[1]
    data = await asyncio.to_thread(_disk_get, path)
    if data is None:
        data = await asyncio.to_thread(_gh_sync, path)
        GH_STATS["calls"] += 1
        await asyncio.to_thread(_disk_set, path, data)
    _GH_CACHE[path] = (time.time(), data)
    if len(_GH_CACHE) > 2000:
        for key in list(_GH_CACHE)[:500]:
            _GH_CACHE.pop(key, None)
    return data


def _gh_error(exc: UpstreamError) -> HTTPException:
    if exc.status == 404:
        return HTTPException(404, "GitHub: объект не найден")
    if exc.status in (403, 429):
        return HTTPException(429, "GitHub API: исчерпан лимит запросов. Добавьте GITHUB_TOKEN в .env")
    return HTTPException(502, f"GitHub API недоступен ({exc.status})")


def _decode(blob: dict) -> str:
    try:
        return base64.b64decode(blob.get("content", "")).decode("utf-8", errors="replace")
    except Exception:  # noqa: BLE001
        return ""


async def _read_file(owner: str, repo: str, path: str, ref: str | None = None) -> str:
    q = f"?ref={urllib.parse.quote(ref)}" if ref else ""
    blob = await _gh(f"/repos/{owner}/{repo}/contents/{urllib.parse.quote(path)}{q}")
    if isinstance(blob, dict) and blob.get("size", 0) > 400_000:
        return ""
    return _decode(blob) if isinstance(blob, dict) else ""


_SIGNAL_FILES = {
    "readme": re.compile(r"^readme(\.|$)", re.I),
    "license": re.compile(r"^(license|licence|copying)(\.|$)", re.I),
    "tests": re.compile(r"^(tests?|__tests__|spec|specs)$", re.I),
    "ci": re.compile(r"^\.github$|^\.gitlab-ci\.yml$|^\.circleci$", re.I),
    "docker": re.compile(r"^(dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$", re.I),
    "typescript": re.compile(r"^tsconfig\.json$", re.I),
    "lint": re.compile(r"^(\.eslintrc.*|eslint\.config\..*|\.prettierrc.*|ruff\.toml|\.flake8|\.pre-commit-config\.yaml)$", re.I),
    "manifest": re.compile(r"^(package\.json|pyproject\.toml|requirements\.txt|go\.mod|cargo\.toml|pom\.xml|build\.gradle(\.kts)?|composer\.json|gemfile)$", re.I),
}


def _signals_from_names(names: list[str]) -> dict[str, bool]:
    return {key: any(rx.search(n) for n in names) for key, rx in _SIGNAL_FILES.items()}


# ---------------------------------------------------------------------------
# GitHub Intelligence endpoints
# ---------------------------------------------------------------------------

@router.get("/github/users/{login}")
async def github_profile(login: str):
    """Public profile + repository inventory with per-repo engineering signals."""
    if not _LOGIN_RE.match(login):
        raise HTTPException(422, "Некорректный GitHub login")
    try:
        user = await _gh(f"/users/{login}")
        repos = await _gh(f"/users/{login}/repos?per_page=100&sort=pushed&type=owner")
    except UpstreamError as exc:
        raise _gh_error(exc) from exc

    own = [r for r in repos if not r.get("fork")]
    languages: dict[str, int] = {}
    for repo in own:
        if repo.get("language"):
            languages[repo["language"]] = languages.get(repo["language"], 0) + 1

    inspected = []
    for repo in own[:6]:
        try:
            root = await _gh(f"/repos/{login}/{repo['name']}/contents/")
            names = [item.get("name", "") for item in root] if isinstance(root, list) else []
        except UpstreamError:
            names = []
        inspected.append({"name": repo["name"], "signals": _signals_from_names(names)})
    sig_by_name = {i["name"]: i for i in inspected}

    return {
        "source": "github_rest_api",
        "fetched_at": int(time.time()),
        "profile": {k: user.get(k) for k in ("login", "name", "avatar_url", "bio", "company", "location", "public_repos", "followers", "created_at")}
        | {"url": user.get("html_url"), "blog": user.get("blog") or None},
        "languages": languages,
        "repo_count": {"own": len(own), "forks": len(repos) - len(own)},
        "repos": [{
            "name": r["name"], "full_name": r.get("full_name"), "url": r.get("html_url"), "description": r.get("description"),
            "language": r.get("language"), "topics": r.get("topics") or [], "stars": r.get("stargazers_count", 0),
            "forks": r.get("forks_count", 0), "size_kb": r.get("size", 0), "pushed_at": r.get("pushed_at"),
            "created_at": r.get("created_at"), "homepage": r.get("homepage") or None, "default_branch": r.get("default_branch"),
            "inspected": r["name"] in sig_by_name, "signals": sig_by_name.get(r["name"], {}).get("signals"),
        } for r in own[:40]],
        "limits": [
            "Только публичные репозитории; приватная и коммерческая работа не видна.",
            "Сигналы (тесты, CI, README) проверены по корню первых 6 репозиториев.",
            "Звёзды и число коммитов не являются доказательством компетенции.",
        ],
    }


@router.get("/github/repos/{owner}/{repo}")
async def github_repo(owner: str, repo: str):
    """Repository metadata, full file tree and practice signals."""
    if not _LOGIN_RE.match(owner) or not _REPO_RE.match(repo):
        raise HTTPException(422, "Некорректный репозиторий")
    try:
        meta = await _gh(f"/repos/{owner}/{repo}")
        branch = meta.get("default_branch") or "main"
        tree = await _gh(f"/repos/{owner}/{repo}/git/trees/{urllib.parse.quote(branch)}?recursive=1")
        langs = await _gh(f"/repos/{owner}/{repo}/languages")
    except UpstreamError as exc:
        raise _gh_error(exc) from exc
    paths = [i["path"] for i in tree.get("tree", []) if i.get("type") == "blob"]
    base = f"https://github.com/{owner}/{repo}/blob/{branch}/"
    checks = [
        ("Тесты", r"(^|/)(tests?|__tests__|spec)/|\.(test|spec)\.[jt]sx?$|(^|/)test_[^/]+\.py$"),
        ("CI/CD", r"^\.github/workflows/.+\.ya?ml$|^\.gitlab-ci\.yml$"),
        ("Docker", r"(^|/)dockerfile$|docker-compose\.ya?ml$"),
        ("Линтер/форматтер", r"(^|/)(\.eslintrc|eslint\.config|\.prettierrc|ruff\.toml|\.pre-commit-config)"),
        ("Типизация TypeScript", r"(^|/)tsconfig\.json$"),
        ("Миграции БД", r"(^|/)(migrations|alembic|prisma)/"),
    ]
    practices = []
    for label, rx in checks:
        pat = re.compile(rx, re.I)
        hits = [p for p in paths if pat.search(p)]
        practices.append({"practice": label, "present": bool(hits), "count": len(hits), "example": hits[0] if hits else None,
                          "source": base + hits[0] if hits else None})
    readme = next((p for p in paths if re.match(r"^readme(\.md|\.rst|\.txt)?$", p, re.I)), None)
    try:
        readme_text = (await _read_file(owner, repo, readme, branch))[:2500] if readme else ""
    except UpstreamError:
        readme_text = ""
    return {
        "source": "github_rest_api", "fetched_at": int(time.time()),
        "repo": {"full_name": meta.get("full_name"), "url": meta.get("html_url"), "description": meta.get("description"),
                 "default_branch": branch, "stars": meta.get("stargazers_count"), "forks": meta.get("forks_count"),
                 "open_issues": meta.get("open_issues_count"), "license": (meta.get("license") or {}).get("spdx_id"),
                 "pushed_at": meta.get("pushed_at"), "topics": meta.get("topics") or [], "fork": meta.get("fork")},
        "languages_bytes": langs, "tree": paths[:2000], "tree_truncated": bool(tree.get("truncated")) or len(paths) > 2000,
        "file_count": len(paths), "practices": practices, "readme_excerpt": readme_text,
        "readme_url": base + readme if readme else None,
    }


@router.get("/github/repos/{owner}/{repo}/file")
async def github_file(owner: str, repo: str, path: str, ref: str | None = None):
    """Raw text of one file for the code viewer (≤ 400 KB)."""
    if not _LOGIN_RE.match(owner) or not _REPO_RE.match(repo) or not _PATH_RE.match(path) or ".." in path:
        raise HTTPException(422, "Некорректный путь")
    try:
        text = await _read_file(owner, repo, path, ref)
    except UpstreamError as exc:
        raise _gh_error(exc) from exc
    return {"path": path, "ref": ref, "content": text, "lines": text.count("\n") + 1 if text else 0,
            "url": f"https://github.com/{owner}/{repo}/blob/{ref or 'HEAD'}/{path}"}


# ---------------------------------------------------------------------------
# Skill Proof Engine — deterministic detectors, every proof has file:line
# ---------------------------------------------------------------------------

# skill -> (file glob regex, content regex, human-readable meaning)
_DETECTORS: list[tuple[str, str, str, str]] = [
    ("FastAPI", r"\.py$", r"^\s*(from fastapi import|import fastapi)|@(app|router)\.(get|post|put|delete|patch)\(", "импорт FastAPI / объявление HTTP-маршрута"),
    ("Django", r"\.py$", r"^\s*from django|INSTALLED_APPS\s*=", "импорт Django / настройки приложения"),
    ("Flask", r"\.py$", r"^\s*from flask import|Flask\(__name__\)", "импорт Flask / создание приложения"),
    ("SQLAlchemy", r"\.py$", r"from sqlalchemy|declarative_base\(|DeclarativeBase|mapped_column\(", "ORM-модели SQLAlchemy"),
    ("PostgreSQL", r"\.(py|ts|js|go|ya?ml|env\.example|toml|json)$|(^|/)docker-compose", r"postgres(ql)?://|psycopg|asyncpg|image:\s*postgres|\"pg\"\s*:", "подключение/драйвер PostgreSQL"),
    ("SQL", r"\.(sql|py|ts|js|go)$", r"\b(SELECT|INSERT INTO|UPDATE|CREATE TABLE)\b[^\n]{0,80}\b(FROM|SET|VALUES|\()", "SQL-запросы в коде"),
    ("pytest", r"(^|/)test_[^/]+\.py$|_test\.py$|conftest\.py$", r"^\s*def test_|import pytest|@pytest\.", "тестовые функции pytest"),
    ("Docker", r"(^|/)(dockerfile|docker-compose\.ya?ml|compose\.ya?ml)$", r"^\s*(FROM|services:)", "Dockerfile / compose-сервисы"),
    ("CI/CD", r"^\.github/workflows/.+\.ya?ml$|^\.gitlab-ci\.yml$", r"^\s*(on:|jobs:|stages:)", "конвейер CI"),
    ("React", r"\.(jsx|tsx|js|ts)$", r"from ['\"]react['\"]|useState\(|useEffect\(", "импорт React / хуки"),
    ("TypeScript", r"\.tsx?$|(^|/)tsconfig\.json$", r"^\s*(export )?(interface|type) \w+|\"strict\"\s*:\s*true|:\s*(string|number|boolean)\b", "типы и интерфейсы TypeScript"),
    ("Next.js", r"\.(jsx|tsx|js|ts|mjs)$", r"from ['\"]next/|export default function \w*(Page|Layout)\b", "импорт Next.js / страницы"),
    ("Node.js / Express", r"\.(js|ts|mjs)$", r"require\(['\"]express['\"]\)|from ['\"]express['\"]|app\.listen\(", "сервер Express"),
    ("Jest / Vitest", r"\.(test|spec)\.[jt]sx?$", r"\b(describe|it|test)\(['\"]|from ['\"]vitest['\"]", "тесты JS/TS"),
    ("Go", r"\.go$", r"^package \w+|^func \w+\(", "исходники Go"),
    ("Kubernetes", r"\.ya?ml$", r"^kind:\s*(Deployment|Service|Ingress|StatefulSet)", "манифесты Kubernetes"),
    ("Redis", r"\.(py|ts|js|go|ya?ml)$", r"\bredis(\.asyncio)?\b|image:\s*redis|ioredis", "использование Redis"),
    ("Async Python", r"\.py$", r"^\s*async def \w+\(|await asyncio\.", "асинхронный код Python"),
]
_SOURCE_PRIORITY = re.compile(r"(main|app|server|index|api|routes?|models?|db|database|settings|config)\.\w+$|(^|/)(docker-compose\.ya?ml|dockerfile)$", re.I)
_SKIP = re.compile(r"(^|/)(node_modules|dist|build|vendor|\.venv|venv|__pycache__|\.next|coverage)/|\.(min\.js|lock|map|png|jpe?g|gif|svg|ico|pdf|woff2?)$", re.I)


def _select_files(paths: list[str], limit: int) -> list[str]:
    candidates = [p for p in paths if not _SKIP.search(p)]
    scored = []
    for p in candidates:
        score = 0
        if any(re.search(glob, p, re.I) for _, glob, _, _ in _DETECTORS):
            score += 1
        if _SOURCE_PRIORITY.search(p):
            score += 3
        if re.search(r"^\.github/workflows/|(^|/)(test_|conftest)|\.(test|spec)\.", p, re.I):
            score += 2
        score -= p.count("/") * 0.3
        if score > 0:
            scored.append((score, p))
    scored.sort(key=lambda x: -x[0])
    return [p for _, p in scored[:limit]]


@router.get("/github/repos/{owner}/{repo}/proofs")
async def skill_proofs(owner: str, repo: str, limit: int = 14):
    """Links skills to concrete file:line evidence. No evidence → 'not_enough_evidence'."""
    if not _LOGIN_RE.match(owner) or not _REPO_RE.match(repo):
        raise HTTPException(422, "Некорректный репозиторий")
    limit = max(4, min(limit, 20))
    try:
        meta = await _gh(f"/repos/{owner}/{repo}")
        branch = meta.get("default_branch") or "main"
        tree = await _gh(f"/repos/{owner}/{repo}/git/trees/{urllib.parse.quote(branch)}?recursive=1")
    except UpstreamError as exc:
        raise _gh_error(exc) from exc
    paths = [i["path"] for i in tree.get("tree", []) if i.get("type") == "blob"]
    files = _select_files(paths, limit)
    base = f"https://github.com/{owner}/{repo}/blob/{branch}/"
    found: dict[str, list[dict]] = defaultdict(list)
    analyzed = []
    limited = False
    for path in files:
        try:
            text = await _read_file(owner, repo, path, branch)
        except UpstreamError as exc:
            if exc.status in (403, 429):
                limited = True
                break
            continue
        analyzed.append(path)
        lines = text.splitlines()
        for skill, glob, pattern, meaning in _DETECTORS:
            if not re.search(glob, path, re.I):
                continue
            rx = re.compile(pattern, re.I | re.M)
            for no, line in enumerate(lines[:3000], start=1):
                if rx.search(line):
                    if len(found[skill]) < 6:
                        found[skill].append({"path": path, "line": no, "snippet": line.strip()[:160],
                                             "url": f"{base}{path}#L{no}", "meaning": meaning})
                    if sum(1 for s in found[skill] if s["path"] == path) >= 2:
                        break
    checked = int(time.time())
    proofs = []
    for skill, _, _, meaning in _DETECTORS:
        sources = found.get(skill, [])
        if not sources:
            continue
        files_n = len({s["path"] for s in sources})
        level = "medium" if files_n >= 2 or len(sources) >= 3 else "low"
        proofs.append({
            "skill": skill, "status": "evidence_found", "sources": sources,
            "explanation": f"Найдено: {meaning} — {len(sources)} совпад. в {files_n} файл.",
            "confidence": {"level": level, "reason": (
                "Использование встречается в нескольких файлах проекта" if level == "medium"
                else "Единичное совпадение: подтверждает использование, но не глубину владения")},
            "limits": "Наличие кода не означает экспертного уровня и не подтверждает авторство.",
            "checked_at": checked,
        })
    try:
        repo_langs = list((await _gh(f"/repos/{owner}/{repo}/languages")).keys())[:8]
    except UpstreamError:
        repo_langs = [meta["language"]] if meta.get("language") else []
    return {"source": "github_rest_api + merilo_detectors_v1", "repo": f"{owner}/{repo}", "branch": branch, "languages": repo_langs,
            "limited": limited, "notice": "Лимит GitHub API исчерпан — изучена только часть файлов. Добавьте GITHUB_TOKEN или повторите позже." if limited else None,
            "files_analyzed": analyzed, "files_total": len(paths), "checked_at": checked, "proofs": proofs,
            "not_found": [s for s, _, _, _ in _DETECTORS if s not in found],
            "method": "Детерминированные правила (импорты, маршруты, конфиги) по выбранным файлам; без LLM."}


# ---------------------------------------------------------------------------
# Talent Search with Search Trace
# ---------------------------------------------------------------------------

class TalentSearchRequest(BaseModel):
    languages: list[str] = Field(default_factory=list, max_length=6)
    frameworks: list[str] = Field(default_factory=list, max_length=8)
    location: str | None = Field(default=None, max_length=60)
    min_stars: int = Field(default=0, ge=0, le=100000)
    pushed_after: str | None = Field(default=None, max_length=10)


_SAFE_TERM = re.compile(r"[^A-Za-z0-9#+.\- ]")


def _candidate(owner: dict, repos: list[dict], terms: list[str], langs: list[str], origin: str) -> dict:
    matched: set[str] = set()
    evidence = []
    for repo in repos[:12]:
        hay = " ".join([repo.get("name") or "", repo.get("description") or "", " ".join(repo.get("topics") or []), repo.get("language") or ""]).lower()
        hits = [t for t in terms if t and t in hay] + [l for l in langs if l and l.lower() == (repo.get("language") or "").lower()]
        if hits:
            matched.update(hits)
            evidence.append({"name": repo.get("full_name") or repo.get("name"), "url": repo.get("html_url"), "description": repo.get("description"),
                             "language": repo.get("language"), "stars": repo.get("stargazers_count", 0), "pushed_at": repo.get("pushed_at"),
                             "matched": sorted(set(hits)), "default_branch": repo.get("default_branch")})
    wanted = [t for t in terms if t] + [l for l in langs if l]
    return {"login": owner.get("login"), "avatar_url": owner.get("avatar_url"), "url": owner.get("html_url"),
            "matched": sorted(matched), "missing": [w for w in wanted if w not in matched], "evidence_repos": evidence[:5],
            "source": "GitHub (public)", "origin": origin,
            "reason": f"Совпадения в репозиториях: {', '.join(sorted(matched)) or '—'} ({len(evidence)} репоз.)"}


@router.post("/github/talent-search")
async def github_talent_search(payload: TalentSearchRequest):
    """Multi-query GitHub discovery. Returns candidates and a Search Trace of every step."""
    started = time.time()
    trace: dict[str, Any] = {"started_at": int(started), "steps": [], "sources": [], "excluded": []}
    terms = [_SAFE_TERM.sub("", f).strip().lower().replace(" ", "-") for f in payload.frameworks]
    terms = [t for t in terms if t]
    langs = [l for l in (_SAFE_TERM.sub("", x).strip() for x in payload.languages) if l]
    by_owner: dict[str, dict] = {}
    excluded = defaultdict(int)

    q_parts = terms[:3] + [f"language:{l}" for l in langs[:1]]
    if payload.min_stars:
        q_parts.append(f"stars:>={payload.min_stars}")
    if payload.pushed_after and re.match(r"^\d{4}-\d{2}-\d{2}$", payload.pushed_after):
        q_parts.append(f"pushed:>={payload.pushed_after}")
    q_parts += ["fork:false", "archived:false"]
    repo_query = " ".join(q_parts)
    try:
        found = await _gh(f"/search/repositories?per_page=60&sort=updated&q={urllib.parse.quote(repo_query)}")
    except UpstreamError as exc:
        raise _gh_error(exc) from exc
    items = found.get("items", [])
    trace["sources"].append({"source": "GitHub Search · repositories", "query": repo_query, "total": found.get("total_count", 0), "fetched": len(items)})
    for repo in items:
        owner = repo.get("owner") or {}
        if owner.get("type") != "User":
            excluded["организация, не человек"] += 1
            continue
        by_owner.setdefault(owner["login"], {"owner": owner, "repos": [], "origin": "repo-search"})["repos"].append(repo)
    trace["steps"].append({"step": "Поиск репозиториев", "detail": f"{len(items)} репозиториев → {len(by_owner)} уникальных авторов"})

    if payload.location:
        loc = _SAFE_TERM.sub("", payload.location).strip()
        user_query = " ".join([f'location:"{loc}"'] + [f"language:{l}" for l in langs[:1]] + ["repos:>=3"])
        try:
            users = await _gh(f"/search/users?per_page=10&q={urllib.parse.quote(user_query)}")
            u_items = users.get("items", [])
            trace["sources"].append({"source": "GitHub Search · users", "query": user_query, "total": users.get("total_count", 0), "fetched": len(u_items)})
            for item in u_items[:6]:
                if item["login"] in by_owner:
                    excluded["дубликат (тот же login)"] += 1
                    continue
                try:
                    repos = await _gh(f"/users/{item['login']}/repos?per_page=30&sort=pushed&type=owner")
                except UpstreamError:
                    excluded["не удалось получить репозитории"] += 1
                    continue
                by_owner[item["login"]] = {"owner": item, "repos": [r for r in repos if not r.get("fork")], "origin": "user-search"}
            trace["steps"].append({"step": "Поиск по географии", "detail": f"{len(u_items)} профилей, location: {loc}"})
        except UpstreamError as exc:
            trace["steps"].append({"step": "Поиск по географии", "detail": f"ошибка GitHub {exc.status}"})

    results = []
    for login, v in by_owner.items():
        cand = _candidate(v["owner"], v["repos"], terms, langs, v["origin"])
        if not cand["matched"]:
            excluded["нет совпадений с критериями"] += 1
            continue
        results.append(cand)
    results.sort(key=lambda c: (-len(c["matched"]), -len(c["evidence_repos"])))
    trace["excluded"] = [{"reason": k, "count": v} for k, v in excluded.items()]
    trace["sources"].append({"source": "LinkedIn", "query": None, "total": None, "fetched": 0,
                             "skipped": "не используется: нет авторизованной интеграции, скрейпинг запрещён"})
    trace["steps"].append({"step": "Дедупликация", "detail": "по GitHub login; профили с одинаковым именем не объединяются"})
    trace["steps"].append({"step": "Ранжирование", "detail": "по числу подтверждённых критериев, затем по числу репозиториев-доказательств"})
    trace["finished_at"] = int(time.time())
    trace["duration_ms"] = int((time.time() - started) * 1000)
    return {"source": "github_search", "query": repo_query, "total": found.get("total_count", 0), "results": results[:20], "trace": trace}


# ---------------------------------------------------------------------------
# AI endpoints (one OpenAI model for all tasks)
# ---------------------------------------------------------------------------

_KNOWN_LANGS = ["TypeScript", "JavaScript", "Python", "Go", "Java", "Kotlin", "Rust", "C#", "C++", "PHP", "Ruby", "Swift"]
_KNOWN_FW = ["React", "Next.js", "Vue", "Angular", "Svelte", "Node.js", "Express", "NestJS", "FastAPI", "Django", "Flask", "Spring",
             "GraphQL", "PostgreSQL", "Docker", "Kubernetes", "Tailwind", "Redux", "Jest", "pytest", "Redis", "SQLAlchemy"]
_GEO = {"казахстан": "Kazakhstan", "kazakhstan": "Kazakhstan", "алматы": "Almaty", "almaty": "Almaty",
        "астана": "Astana", "astana": "Astana", "шымкент": "Shymkent", "shymkent": "Shymkent"}


def _heuristic_criteria(text: str) -> dict:
    low = text.lower()
    langs = [l for l in _KNOWN_LANGS if re.search(rf"(?<![a-z]){re.escape(l.lower())}(?![a-z])", low)]
    fws = [f for f in _KNOWN_FW if f.lower().replace(".js", "") in low]
    return {
        "languages": langs, "frameworks": fws, "location": next((v for k, v in _GEO.items() if k in low), None),
        "experience": "junior" if re.search(r"junior|джун|начина|без коммерческ|entry", low) else None,
        "open_source": bool(re.search(r"open.?source|опенсорс|контриб|contribut", low)),
        "required_skills": (langs + fws)[:4], "preferred_skills": (langs + fws)[4:8],
        "portfolio_evidence": ["Публичные репозитории с README", "Тесты в проектах"], "summary": None,
        "count": _heuristic_count(text),
        "real_projects": bool(re.search(r"реальн|production|продакшен|прод\b|коммерч|real[- ]world|боев", low)),
    }


def _heuristic_count(text: str) -> int:
    m = re.search(r"\b(\d{1,2})\b[^.\n]{0,40}?(разработ|developer|engineer|инженер|кандидат|специалист|программист)", text, re.I)
    return max(1, min(10, int(m.group(1)))) if m else 5


class ParseQueryRequest(BaseModel):
    query: str = Field(..., min_length=3, max_length=1200)
    fast: bool = Field(default=False, description="true = keyword heuristic only, no model call (0 tokens)")


_PARSE_CACHE: dict[str, tuple[float, dict]] = {}


async def parse_criteria(query: str, use_ai: bool = True) -> dict:
    """Query → criteria. The model is called at most once per distinct query (1 h cache)."""
    base = _heuristic_criteria(query)
    if not use_ai:
        return {"mode": "heuristic", "criteria": base, "tokens": 0, "notice": None}
    if not openai_client.api_key():
        return {"mode": "heuristic", "criteria": base, "tokens": 0, "notice": "OPENAI_API_KEY не задан — критерии извлечены по ключевым словам"}
    key = " ".join(query.lower().split())
    hit = _PARSE_CACHE.get(key)
    if hit and time.time() - hit[0] < 3600:
        return {**hit[1], "tokens": 0, "cached": True}
    prompt = (
        "Extract hiring search criteria as JSON: languages (string[] canonical programming languages), "
        "frameworks (string[] frameworks, databases, tools), location (string|null, only if explicitly stated, English), "
        "experience (\"junior\"|\"middle\"|\"senior\"|null), open_source (bool), required_skills (string[]), "
        "preferred_skills (string[]), portfolio_evidence (string[] short Russian phrases), summary (one Russian sentence), "
        "count (int, how many people are requested, default 5), real_projects (bool, production-like experience requested). "
        "Never keep protected characteristics (age, gender, ethnicity, religion, health)."
    )
    before = openai_client.usage()["tokens"]
    try:
        data = await openai_client.chat_json([{"role": "system", "content": prompt}, {"role": "user", "content": query}], max_tokens=400)
    except OpenAIError as exc:
        logger.warning("parse_query_failed status=%s", exc.status)
        return {"mode": "heuristic", "criteria": base, "tokens": 0, "notice": f"OpenAI недоступен ({exc.status}) — критерии извлечены по ключевым словам"}
    base.update({k: v for k, v in data.items() if k in base and v is not None})
    try:
        base["count"] = max(1, min(10, int(base.get("count") or 5)))
    except (TypeError, ValueError):
        base["count"] = 5
    result = {"mode": "openai", "model": openai_client.model(), "criteria": base, "notice": None}
    _PARSE_CACHE[key] = (time.time(), result)
    if len(_PARSE_CACHE) > 300:
        _PARSE_CACHE.pop(next(iter(_PARSE_CACHE)))
    return {**result, "tokens": max(0, openai_client.usage()["tokens"] - before)}


@router.post("/ai/parse-query")
async def ai_parse_query(payload: ParseQueryRequest, request: Request, x_merilo_token: str | None = Header(None)):
    _guard(request, x_merilo_token, ai=not payload.fast)
    return await parse_criteria(payload.query, use_ai=not payload.fast)


class CopilotMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=6000)


class CopilotRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    context: dict[str, Any] = Field(default_factory=dict)
    history: list[CopilotMessage] = Field(default_factory=list, max_length=12)


_COPILOT_SYSTEM = (
    "Ты — Merilo Copilot, ассистент технического рекрутера. Отвечай по-русски, кратко и структурно (markdown-списки). "
    "Опирайся ТОЛЬКО на JSON-контекст страницы и историю диалога. Каждое утверждение о навыке подкрепляй источником "
    "из контекста (URL файла/репозитория с номером строки, card_hash). Если доказательства нет — пиши «Недостаточно "
    "доказательств», а не отрицательный вывод о человеке. Явно разделяй: Наблюдаемые доказательства / Вывод AI / "
    "Подтверждено заданием / Неизвестно. Никогда не утверждай, что выполнил поиск, отправил приглашение или провёл "
    "оценку — действия выполняет рекрутер. Не используй и не выводи защищённые характеристики, популярность профиля "
    "и не принимай решений о найме. В конце дай 1-2 коротких вопроса для продолжения в строке, начинающейся с '→ '."
)


def _copilot_messages(payload: CopilotRequest) -> list[dict]:
    context = json.dumps(payload.context, ensure_ascii=False)[:14000]
    messages = [{"role": "system", "content": _COPILOT_SYSTEM},
                {"role": "system", "content": f"Контекст текущей страницы Merilo (JSON):\n{context}"}]
    messages += [m.model_dump() for m in payload.history[-10:]]
    messages.append({"role": "user", "content": payload.message})
    return messages


@router.post("/ai/copilot")
async def ai_copilot(payload: CopilotRequest, request: Request, x_merilo_token: str | None = Header(None)):
    _guard(request, x_merilo_token, ai=True)
    if not openai_client.api_key():
        return {"mode": "unavailable", "reply": None, "notice": "Copilot отключён: задайте OPENAI_API_KEY в .env и перезапустите сервер."}
    try:
        reply = await openai_client.chat(_copilot_messages(payload), max_tokens=1200)
    except OpenAIError as exc:
        raise _ai_error(exc) from exc
    return {"mode": "openai", "model": openai_client.model(), "reply": reply}


@router.post("/ai/copilot/stream")
async def ai_copilot_stream(payload: CopilotRequest, request: Request, x_merilo_token: str | None = Header(None)):
    """Server-Sent Events: `data: {"delta": "..."}` … `data: {"done": true}`."""
    _guard(request, x_merilo_token, ai=True)

    async def events():
        if not openai_client.api_key():
            yield "data: " + json.dumps({"error": "Copilot отключён: задайте OPENAI_API_KEY в .env"}, ensure_ascii=False) + "\n\n"
            return
        yield "data: " + json.dumps({"model": openai_client.model()}) + "\n\n"
        try:
            async for delta in openai_client.chat_stream(_copilot_messages(payload), max_tokens=1200):
                yield "data: " + json.dumps({"delta": delta}, ensure_ascii=False) + "\n\n"
            yield 'data: {"done": true}\n\n'
        except OpenAIError as exc:
            yield "data: " + json.dumps({"error": f"OpenAI {exc.status}: {exc.message[:160]}"}, ensure_ascii=False) + "\n\n"

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


class ChallengeDraftRequest(BaseModel):
    language: str = Field(..., max_length=20)
    technology: str = Field(default="", max_length=60)
    difficulty: str = Field(default="Junior", max_length=20)
    minutes: int = Field(default=30, ge=10, le=180)
    skills: list[str] = Field(default_factory=list, max_length=6)
    gaps: list[str] = Field(default_factory=list, max_length=8)
    evidence: list[dict[str, Any]] = Field(default_factory=list, max_length=12)
    job_requirements: list[str] = Field(default_factory=list, max_length=12)


@router.post("/ai/challenge-draft")
async def ai_challenge_draft(payload: ChallengeDraftRequest, request: Request, x_merilo_token: str | None = Header(None)):
    """Repo-to-Reality: drafts a task for the skills that lack evidence. Recruiter reviews before publishing."""
    _guard(request, x_merilo_token, ai=True)
    if not openai_client.api_key():
        return {"mode": "unavailable", "draft": None, "notice": "Генерация недоступна без OPENAI_API_KEY. Можно опубликовать задачу вручную."}
    prompt = (
        "Ты проектируешь короткое практическое задание Merilo (Repo-to-Reality). На входе: навыки, по которым у кандидата "
        "НЕТ достаточных доказательств в публичном коде, и навыки, которые уже подтверждены. Создай самостоятельную задачу "
        "(не копируй чужой код и лицензированные фрагменты): небольшой реалистичный фрагмент кода с 2-3 дефектами, "
        "который нужно исправить. Задача должна проверять именно недоказанные навыки, укладываться во время и проверяться "
        "по рубрике Merilo (Clean Code 30%, Architecture 40%, Edge Cases & Security 30%). Ответ JSON: "
        "title (≤80 символов, по-русски), description (по-русски, контекст продукта, что сделать, 3-6 предложений), "
        "buggy_code (стартовый код на указанном языке, 20-70 строк, без решения), skills (string[] проверяемые навыки), "
        "acceptance (string[] 3-5 проверяемых критериев приёмки), "
        "rationale (по-русски: какой пробел закрывает задание и почему, со ссылкой на отсутствующее доказательство)."
    )
    try:
        draft = await openai_client.chat_json(
            [{"role": "system", "content": prompt}, {"role": "user", "content": json.dumps(payload.model_dump(), ensure_ascii=False)[:8000]}],
            max_tokens=1800,
        )
    except OpenAIError as exc:
        raise _ai_error(exc) from exc
    return {"mode": "openai", "model": openai_client.model(), "draft": draft}


@router.get("/ai/usage")
async def ai_usage():
    """Process-level OpenAI usage for analytics (tokens/calls today vs budget)."""
    return {"model": openai_client.model(), "configured": bool(openai_client.api_key()), **openai_client.usage()}


@router.get("/integrations/status")
async def integrations_status():
    return {
        "openai": {"configured": bool(openai_client.api_key()), "model": openai_client.model(),
                   "used_for": ["Copilot", "разбор запросов", "Repo-to-Reality", "Gate 3 AI-ревью"]},
        "github": {"configured": True, "authenticated": bool((os.getenv("GITHUB_TOKEN") or "").strip()),
                   "note": "Публичный REST API; без токена лимит 60 запросов/час"},
        "linkedin": {"configured": False, "note": "Не подключено. Merilo не скрапит LinkedIn; нужен авторизованный партнёрский доступ."},
        "evaluation": {"configured": True, "note": "3-шлюзовая проверка: /api/submissions/verify"},
        "auth": {"token_required": bool((os.getenv("MERILO_API_TOKEN") or "").strip())},
    }
