"""Shared pytest fixtures for the Merilo P1 test suite.

The environment MUST be prepared before ``backend.main`` (and therefore
``backend.db``, which binds ``DEFAULT_DB_PATH`` at import time) is imported.
Otherwise every test would read and write the real ``backend/merilo.db``.
"""

import os
import tempfile
from pathlib import Path

_TMP_DIR = tempfile.mkdtemp(prefix="merilo-tests-")
os.environ["MERILO_ENV"] = "development"
os.environ["MERILO_DB_PATH"] = str(Path(_TMP_DIR) / "merilo-test.db")
os.environ.pop("GEMINI_API_KEY", None)
os.environ.pop("LLM_API_KEY", None)
# Never call the paid OpenAI API from the test suite (.env is not read either).
os.environ["MERILO_DISABLE_DOTENV"] = "1"
os.environ.pop("OPENAI_API_KEY", None)
os.environ.setdefault("MERILO_EVAL_CACHE_TTL", "3600")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import backend.main as main  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def reset_rate_limits():
    main._task_rate_limit_windows.clear()
    main._verify_rate_limit_windows.clear()
    main._defense_rate_limit_windows.clear()
    yield
    main._task_rate_limit_windows.clear()
    main._verify_rate_limit_windows.clear()
    main._defense_rate_limit_windows.clear()


@pytest.fixture
def sample_task(client):
    response = client.get("/api/tasks")
    assert response.status_code == 200
    tasks = response.json()
    assert len(tasks) >= 3
    return tasks[0]
