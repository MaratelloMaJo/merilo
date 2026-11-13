"""P1: Gate 1 (Python AST parse) behaviour of the verification engine."""

import asyncio

from backend.verifier import verify_submission

TASK_ID = "task-fintech-01"
CANDIDATE = "Test Candidate"

SAFE_CODE = (
    "def add(left: int, right: int) -> int:\n"
    '    """Return the sum of two integers."""\n'
    "    return left + right\n"
)


def _verify(code):
    return asyncio.run(verify_submission(TASK_ID, code, CANDIDATE))


def test_syntax_error_is_rejected_on_gate_1(client):
    result = _verify("def broken(:\n    pass\n")

    assert result["status"] == "rejected"
    assert result["gate_reached"] == 1
    assert result["total_score"] == 0
    assert result["badge_tier"] == "Rejected"


def test_valid_code_reaches_at_least_gate_2(client):
    result = _verify(SAFE_CODE)

    assert result["gate_reached"] >= 2
    assert result["status"] in {"verified", "blocked"}


def test_empty_submission_does_not_crash(client):
    result = _verify("")

    assert result["status"] in {"verified", "rejected", "blocked"}
    assert 0 <= result["total_score"] <= 100
    assert len(result["card_hash"]) == 12


def test_dangerous_eval_scores_no_better_than_trivial_return(client):
    dangerous = _verify("eval('1')\n")
    trivial = _verify("return 1\n")

    assert dangerous["evaluation"]["architecture"] <= trivial["evaluation"]["architecture"]


def test_large_submission_is_handled_without_exception(client):
    big_code = "\n".join(f"value_{index} = {index}" for index in range(5000))

    result = _verify(big_code)

    assert result["status"] in {"verified", "rejected"}
    assert 0 <= result["total_score"] <= 100
