"""Gate 3 tests against a fully mocked ``google-genai`` SDK.

No network access and no real API key are required: ``genai.Client``,
``types.GenerateContentConfig`` and ``errors.APIError`` are monkeypatched, and
``FakeClient.aio`` is ``None`` so the verifier takes its ``asyncio.to_thread``
branch (the same code path used for the synchronous SDK).
"""

import asyncio

import pytest

pytest.importorskip("google.genai")

from google import genai  # noqa: E402
from google.genai import errors as genai_errors  # noqa: E402
from google.genai import types as genai_types  # noqa: E402

import backend.fallback_cache as fallback_cache  # noqa: E402
import backend.verifier as verifier  # noqa: E402
from backend.db import init_db  # noqa: E402

VALID = {
    "clean_code": 80,
    "architecture": 70,
    "edge_cases": 75,
    "is_plagiarized_or_injected": False,
    "executive_summary": "mock",
}

SUBMITTED_CODE = "def f():\n    return 1\n"
TASK_ID = "task-fintech-01"


# =============================================================================
# Fakes
# =============================================================================

class FakeAPIError(Exception):
    """Stand-in for ``google.genai.errors.APIError`` with an HTTP status."""

    def __init__(self, status_code):
        super().__init__(f"HTTP {status_code}")
        self.code = status_code


class FakeResponse:
    def __init__(self, parsed=None, text=None):
        self.parsed = parsed
        self.text = text


class FakeModels:
    def __init__(self, behavior, calls):
        self._behavior = behavior
        self._calls = calls

    def generate_content(self, *, model, contents, config):
        self._calls.append(model)
        return self._behavior(model)


class FakeClient:
    def __init__(self, behavior, calls, keys, api_key):
        self.models = FakeModels(behavior, calls)
        # ``aio = None`` forces verifier._call_gemini onto asyncio.to_thread.
        self.aio = None
        keys.append(api_key)


def _always_valid(_model):
    return FakeResponse(parsed=dict(VALID))


def _install_client(monkeypatch, behavior, recorder):
    """Wire ``genai.Client`` to a fake that records models and api keys."""

    def _factory(api_key):
        return FakeClient(behavior, recorder["calls"], recorder["keys"], api_key)

    monkeypatch.setattr(genai, "Client", _factory)


@pytest.fixture(autouse=True)
def _database_ready():
    """``verify_submission`` persists cards; make sure the temp DB exists."""
    init_db()


@pytest.fixture
def mocked_gemini(monkeypatch):
    """Happy-path Gemini: every model returns the valid structured payload."""
    fallback_cache.clear_evaluation_cache()
    monkeypatch.setenv("GEMINI_API_KEY", "unit-test-key")
    monkeypatch.delenv("LLM_API_KEY", raising=False)
    monkeypatch.delenv("GEMINI_MODEL", raising=False)
    monkeypatch.setattr(genai_types, "GenerateContentConfig", lambda **kwargs: kwargs)
    monkeypatch.setattr(genai_errors, "APIError", FakeAPIError)

    recorder = {"calls": [], "keys": []}
    _install_client(monkeypatch, _always_valid, recorder)

    yield recorder

    fallback_cache.clear_evaluation_cache()


def _verify():
    return asyncio.run(
        verifier.verify_submission(
            TASK_ID,
            SUBMITTED_CODE,
            candidate_name="Mock Candidate",
        )
    )


# =============================================================================
# 1. Happy path
# =============================================================================

def test_gemini_success_marks_mode_gemini(mocked_gemini):
    result = _verify()

    assert result["evaluation_mode"] == "gemini"
    assert result["confidence"] == "high"
    assert result["fallback_reason"] is None
    assert result["gate_reached"] == 3
    assert result["status"] == "verified"

    # round(0.30*80 + 0.40*70 + 0.30*75) == 74: Python uses banker's rounding,
    # so the exact 74.5 boundary becomes 74 (the ticket's "75" was an estimate).
    assert result["total_score"] == round(0.30 * 80 + 0.40 * 70 + 0.30 * 75)
    assert result["total_score"] == 74

    assert mocked_gemini["calls"] == ["gemini-3.6-flash"]
    assert mocked_gemini["keys"] == ["unit-test-key"]


# =============================================================================
# 2. LLM_API_KEY is an accepted alias
# =============================================================================

def test_gemini_uses_llm_api_key(mocked_gemini, monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.setenv("LLM_API_KEY", "judge-key")

    result = _verify()

    assert result["evaluation_mode"] == "gemini"
    assert result["fallback_reason"] is None
    assert mocked_gemini["keys"] == ["judge-key"]


# =============================================================================
# 3. 404 rotates to the next model
# =============================================================================

def test_gemini_404_rotates_to_fallback_model(mocked_gemini, monkeypatch):
    def behavior(model):
        if model == "gemini-3.6-flash":
            raise FakeAPIError(404)
        return FakeResponse(parsed=dict(VALID))

    _install_client(monkeypatch, behavior, mocked_gemini)

    result = _verify()

    assert result["evaluation_mode"] == "gemini"
    assert mocked_gemini["calls"] == ["gemini-3.6-flash", "gemini-3.5-flash"]


# =============================================================================
# 4. 429 retries once per model, then falls back
# =============================================================================

def test_gemini_429_retries_once_then_falls_back(mocked_gemini, monkeypatch):
    def behavior(_model):
        raise FakeAPIError(429)

    _install_client(monkeypatch, behavior, mocked_gemini)

    result = _verify()

    # 3 models x 2 attempts.
    assert len(mocked_gemini["calls"]) == 6
    assert result["evaluation_mode"] == "fallback"
    assert result["confidence"] == "low"
    assert "429" in (result["fallback_reason"] or "")


# =============================================================================
# 5. Timeouts retry and fall back
# =============================================================================

def test_gemini_timeout_retries_and_falls_back(mocked_gemini, monkeypatch):
    def behavior(_model):
        raise TimeoutError("mock timeout")

    _install_client(monkeypatch, behavior, mocked_gemini)

    result = _verify()

    assert len(mocked_gemini["calls"]) == 6
    assert result["evaluation_mode"] == "fallback"
    assert result["confidence"] == "low"
    assert "таймаут" in (result["fallback_reason"] or "")


# =============================================================================
# 6. Broken JSON / schema mismatch falls back
# =============================================================================

def test_gemini_invalid_schema_falls_back(mocked_gemini, monkeypatch):
    _install_client(monkeypatch, lambda _model: FakeResponse(text="not-json"), mocked_gemini)

    result = _verify()

    assert result["evaluation_mode"] == "fallback"
    assert result["confidence"] == "low"
    reason = result["fallback_reason"] or ""
    assert "JSON" in reason or "схема" in reason


# =============================================================================
# 7. The TTL cache serves the second identical submission
# =============================================================================

def test_gemini_cache_hit_avoids_second_call(mocked_gemini):
    first = _verify()
    calls_after_first = len(mocked_gemini["calls"])

    second = _verify()

    assert calls_after_first == 1
    assert len(mocked_gemini["calls"]) == calls_after_first
    assert first["card_hash"] == second["card_hash"]
    assert second["evaluation_mode"] == "gemini"


# =============================================================================
# 8. Without a key the SDK is never touched
# =============================================================================

def test_no_key_never_calls_sdk(monkeypatch):
    fallback_cache.clear_evaluation_cache()
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("LLM_API_KEY", raising=False)

    def _explode(*args, **kwargs):
        raise AssertionError("genai.Client must not be constructed without a key")

    monkeypatch.setattr(genai, "Client", _explode)

    result = _verify()

    assert result["evaluation_mode"] == "fallback"
    assert result["confidence"] == "low"
    assert "GEMINI_API_KEY" in (result["fallback_reason"] or "")
    fallback_cache.clear_evaluation_cache()


# =============================================================================
# 9. A semantic injection verdict from the model is still blocked at Gate 2
# =============================================================================

def test_semantic_injection_from_model_blocks(mocked_gemini, monkeypatch):
    injected = dict(VALID)
    injected["is_plagiarized_or_injected"] = True

    _install_client(monkeypatch, lambda _model: FakeResponse(parsed=injected), mocked_gemini)

    result = _verify()

    assert result["status"] == "blocked"
    assert result["gate_reached"] == 2
    assert result["total_score"] == 0
    assert result["badge_tier"] == "Rejected"
    # Provenance is preserved: the block came from the real model answer.
    assert result["evaluation_mode"] == "gemini"
