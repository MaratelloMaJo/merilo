"""
Server-side OpenAI client shared by every Merilo AI task.

One model for everything (``OPENAI_MODEL``, default ``gpt-6-luna``). GPT-5+/luna
models reject ``max_tokens`` and non-default ``temperature``; this client sends
``max_completion_tokens`` and omits ``temperature`` for them, which was the
cause of the earlier "AI error". No SDK dependency: plain ``urllib`` in a
worker thread, bounded by timeouts and a daily token budget.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import queue
import re
import threading
import time
import urllib.error
import urllib.request
from typing import Any, AsyncIterator

logger = logging.getLogger("merilo.openai")

DEFAULT_MODEL = "gpt-6-luna"
API_URL = "https://api.openai.com/v1/chat/completions"
_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_ENV_KEYS = ("OPENAI_API_KEY", "OPENAI_MODEL", "GITHUB_TOKEN", "OPENAI_DAILY_TOKEN_BUDGET", "MERILO_API_TOKEN")


def load_dotenv_subset() -> None:
    """Reads only Merilo AI/integration keys from ``.env`` (never overrides real env)."""
    if os.getenv("MERILO_DISABLE_DOTENV") == "1":
        return
    path = os.path.join(_BASE_DIR, ".env")
    if not os.path.exists(path):
        return
    try:
        with open(path, encoding="utf-8") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                if key in _ENV_KEYS and not os.getenv(key):
                    os.environ[key] = value.strip().strip('"').strip("'")
    except OSError:
        logger.warning("dotenv_read_failed")


load_dotenv_subset()


class OpenAIError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def api_key() -> str:
    return (os.getenv("OPENAI_API_KEY") or "").strip()


def model() -> str:
    return (os.getenv("OPENAI_MODEL") or "").strip() or DEFAULT_MODEL


def _is_reasoning_model(name: str) -> bool:
    return bool(re.match(r"^(gpt-[5-9]|gpt-\d{2}|o\d)", name))


# --- Cost guard: a simple per-process daily token budget -------------------
_usage = {"day": time.strftime("%Y-%m-%d"), "tokens": 0, "calls": 0}
_usage_lock = threading.Lock()


def _budget() -> int:
    try:
        return int(os.getenv("OPENAI_DAILY_TOKEN_BUDGET") or "400000")
    except ValueError:
        return 400000


def _account(tokens: int) -> None:
    with _usage_lock:
        today = time.strftime("%Y-%m-%d")
        if _usage["day"] != today:
            _usage.update(day=today, tokens=0, calls=0)
        _usage["tokens"] += max(0, int(tokens))
        _usage["calls"] += 1


def usage() -> dict[str, Any]:
    with _usage_lock:
        return {**_usage, "budget": _budget()}


def _check_budget() -> None:
    if usage()["tokens"] >= _budget():
        raise OpenAIError(429, "Дневной лимит токенов Merilo исчерпан (OPENAI_DAILY_TOKEN_BUDGET)")


def _body(messages: list[dict], max_tokens: int, json_mode: bool, stream: bool) -> dict:
    name = model()
    body: dict[str, Any] = {"model": name, "messages": messages}
    if _is_reasoning_model(name):
        # Reasoning models spend part of the budget on hidden reasoning.
        body["max_completion_tokens"] = max_tokens + 2000
        body["reasoning_effort"] = "low"
    else:
        body["max_tokens"] = max_tokens
        body["temperature"] = 0.2
    if json_mode:
        body["response_format"] = {"type": "json_object"}
    if stream:
        body["stream"] = True
        body["stream_options"] = {"include_usage": True}
    return body


def _request(body: dict, timeout: float):
    key = api_key()
    if not key:
        raise OpenAIError(401, "OPENAI_API_KEY не задан")
    req = urllib.request.Request(
        API_URL,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    try:
        return urllib.request.urlopen(req, timeout=timeout)
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = json.loads(exc.read().decode("utf-8")).get("error", {}).get("message", "")
        except Exception:  # noqa: BLE001
            pass
        raise OpenAIError(exc.code, detail or str(exc.reason)) from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise OpenAIError(503, f"сеть: {getattr(exc, 'reason', exc)}") from exc


def _reasoning_retry(body: dict, exc: OpenAIError) -> bool:
    """Drops ``reasoning_effort`` once if a model rejects it."""
    if exc.status == 400 and "reasoning_effort" in body and "reasoning" in exc.message.lower():
        body.pop("reasoning_effort", None)
        return True
    return False


def chat_sync(messages: list[dict], *, max_tokens: int = 900, json_mode: bool = False, timeout: float = 60.0) -> str:
    _check_budget()
    body = _body(messages, max_tokens, json_mode, stream=False)
    started = time.perf_counter()
    try:
        resp = _request(body, timeout)
    except OpenAIError as exc:
        if not _reasoning_retry(body, exc):
            raise
        resp = _request(body, timeout)
    with resp:
        data = json.loads(resp.read().decode("utf-8"))
    tokens = (data.get("usage") or {}).get("total_tokens", 0)
    _account(tokens)
    logger.info("openai_ok model=%s tokens=%s latency_ms=%.0f", body["model"], tokens, (time.perf_counter() - started) * 1000)
    content = data["choices"][0]["message"].get("content") or ""
    if not content.strip():
        raise OpenAIError(502, "Модель вернула пустой ответ")
    return content


async def chat(messages: list[dict], **kwargs: Any) -> str:
    return await asyncio.to_thread(chat_sync, messages, **kwargs)


async def chat_json(messages: list[dict], **kwargs: Any) -> dict:
    raw = await chat(messages, json_mode=True, **kwargs)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        match = re.search(r"\{.*\}", raw, re.S)
        if match:
            return json.loads(match.group(0))
        raise OpenAIError(502, "Модель вернула невалидный JSON") from exc


async def chat_stream(messages: list[dict], *, max_tokens: int = 900, timeout: float = 90.0) -> AsyncIterator[str]:
    """Yields text deltas from a streamed completion (SSE parsed in a thread)."""
    _check_budget()
    body = _body(messages, max_tokens, json_mode=False, stream=True)
    q: queue.Queue = queue.Queue()
    sentinel = object()

    def worker() -> None:
        try:
            try:
                resp = _request(body, timeout)
            except OpenAIError as exc:
                if not _reasoning_retry(body, exc):
                    raise
                resp = _request(body, timeout)
            with resp:
                for raw in resp:
                    line = raw.decode("utf-8").strip()
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        chunk = json.loads(payload)
                    except json.JSONDecodeError:
                        continue
                    if chunk.get("usage"):
                        _account(chunk["usage"].get("total_tokens", 0))
                    for choice in chunk.get("choices") or []:
                        delta = (choice.get("delta") or {}).get("content")
                        if delta:
                            q.put(delta)
        except OpenAIError as exc:
            q.put(exc)
        except Exception as exc:  # noqa: BLE001
            q.put(OpenAIError(502, str(exc)))
        finally:
            q.put(sentinel)

    threading.Thread(target=worker, daemon=True).start()
    while True:
        item = await asyncio.to_thread(q.get)
        if item is sentinel:
            return
        if isinstance(item, OpenAIError):
            raise item
        yield item
