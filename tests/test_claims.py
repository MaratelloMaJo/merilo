"""Claim-level tests for the evidence layer.

These tests do not measure the product: they prevent the documentation and the
landing page from drifting away from the dated data in ``docs/labor_market.json``
and from the three canonical prices.  The rule is simple: every number a jury can
see must be traceable to a file, a command or a dated source.
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
LABOR_MARKET = ROOT / "docs" / "labor_market.json"
EVIDENCE = ROOT / "docs" / "EVIDENCE.md"
PILOT = ROOT / "docs" / "PILOT.md"
INTERVIEWS = ROOT / "docs" / "INTERVIEWS.md"
INDEX = ROOT / "static" / "index.html"
OFFLINE_DEMO = ROOT / "docs" / "offline-demo.html"
API_DOC = ROOT / "docs" / "API.md"

PRICES = ("3 000 ₸", "29 000 ₸", "149 000 ₸")
SUPPORTED_LANGUAGE_KEYS = {
    "python",
    "javascript",
    "typescript",
    "java",
    "go",
    "csharp",
    "cpp",
    "c",
    "rust",
    "ruby",
    "php",
    "kotlin",
    "swift",
}
# A percent figure is sourced when the same line names a file, a command or a URL.
SOURCE_MARKERS = (
    "docs/",
    "tests/",
    "scripts/",
    "backend/",
    "http",
    "`",
    "[assumption]",
    "[измерено]",
    "pytest",
    "hh.kz",
)


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _rows() -> list[dict]:
    payload = json.loads(_read(LABOR_MARKET))
    assert isinstance(payload, list), "labor_market.json must be a JSON array"
    return payload


def test_labor_market_has_one_row_per_supported_language():
    rows = _rows()
    assert len(rows) == 13, f"expected 13 rows, got {len(rows)}"
    assert {row["language"] for row in rows} == SUPPORTED_LANGUAGE_KEYS


def test_every_ok_row_has_count_url_and_date_from_hh_kz():
    for row in _rows():
        if row["status"] != "OK":
            continue
        assert isinstance(row["count"], int), row
        assert row["count"] >= 0, row
        assert row["date"], row
        assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", row["date"]), row
        assert row["url"], row

        parsed = urlparse(row["url"])
        assert parsed.scheme == "https", row
        assert parsed.hostname == "hh.kz", row
        assert parse_qs(parsed.query).get("text"), row
        assert row["query"], row


def test_unknown_rows_never_invent_a_count():
    for row in _rows():
        assert row["status"] in {"OK", "UNKNOWN"}, row
        if row["status"] == "UNKNOWN":
            assert row["count"] is None, row
            assert row["url"], row
            assert row["date"], row


def test_labor_market_is_a_dated_2026_11_13_snapshot():
    rows = _rows()
    assert rows, "labor_market.json is empty"
    assert {row["date"] for row in rows} == {"2026-11-13"}


def test_evidence_has_the_required_columns_and_retrieval_date():
    text = _read(EVIDENCE)
    for column in ("Claim", "Value", "Source", "URL", "Date", "Supports", "Confidence"):
        assert column in text, f"missing evidence column: {column}"
    assert "2026-11-13" in text
    assert "docs/labor_market.json" in text


def test_evidence_has_no_bare_percent_figure():
    for lineno, line in enumerate(_read(EVIDENCE).splitlines(), start=1):
        if "%" not in line:
            continue
        assert any(marker in line for marker in SOURCE_MARKERS), (
            f"EVIDENCE.md:{lineno} has a percent figure without a source marker: {line}"
        )


def test_evidence_does_not_claim_ai_authorship_detection():
    text = _read(EVIDENCE).lower()
    assert "ai-detected" not in text
    assert "определение авторства" not in text


def test_evidence_states_the_limits_of_the_offer():
    text = _read(EVIDENCE)
    limits = text.split("Что мы не утверждаем", 1)
    assert len(limits) == 2, "EVIDENCE.md must contain a 'Что мы не утверждаем' section"
    body = limits[1]
    for statement in (
        "Нет клиентов",
        "Нет пилотов",
        "Нет выручки",
        "Нет определения авторства по AI",
        "Нет production-grade для всех 13 языков",
    ):
        assert statement in body, f"missing limit: {statement}"


def test_pilot_contains_exactly_the_canonical_prices():
    text = _read(PILOT)
    for price in PRICES:
        assert price in text, f"PILOT.md is missing {price}"

    found = set(re.findall(r"\d[\d\s\u00a0]*₸", text))
    assert found - {"0 ₸"} == set(PRICES), f"unexpected price strings: {found}"


def test_pilot_labels_assumptions_and_has_a_plan():
    text = _read(PILOT)
    assert "[assumption]" in text
    for marker in ("30", "60", "90", "time-to-shortlist", "recruiter confidence"):
        assert marker.lower() in text.lower(), f"PILOT.md is missing {marker}"
    assert "клиентов нет" in text
    assert "выручки нет" in text


def test_interviews_are_explicitly_not_conducted():
    text = _read(INTERVIEWS)
    assert "не проведены" in text
    assert "5 интервью запланированы" in text
    assert "0 из 5" in text


def test_interviews_have_three_twenty_minute_scripts():
    text = _read(INTERVIEWS)
    assert text.count("20 минут") >= 3
    for role in ("рекрутер", "тимлид", "буткемп"):
        assert role in text.lower(), f"missing interview script for {role}"


def test_landing_mentions_languages_own_code_defense_ed25519_and_badge():
    html = _read(INDEX)
    assert "13 языков" in html
    assert "Свой код" in html
    assert "Защита решения" in html
    assert "Ed25519" in html
    assert "badge" in html.lower() or "бейдж" in html.lower()


def test_landing_shows_the_real_python_demand_with_source_and_date():
    html = _read(INDEX)
    rows = _rows()
    python_row = next(row for row in rows if row["language"] == "python")
    if python_row["status"] == "OK":
        formatted = f"{python_row['count']:,}".replace(",", " ")
        assert formatted in html, f"landing must show the measured Python count {formatted}"
    assert "hh.kz" in html
    assert "13.11.2026" in html
    assert "/evidence/labor_market.json" in html


def test_landing_shows_the_three_prices_and_a_pilot_cta():
    html = _read(INDEX)
    for price in PRICES:
        assert price in html, f"landing is missing {price}"
    assert "Запросить пилот" in html


def test_landing_has_no_fabricated_recruiter_metrics():
    html = _read(INDEX)
    assert "72 ч" not in html
    assert "1.8 млн" not in html
    assert "+6 за последнюю неделю" not in html


def test_offline_demo_is_generated_from_real_runs():
    html = _read(OFFLINE_DEMO)
    # The old hand-written snapshot invented people, a task and serials.
    for invented in ("Айгерим Серикова", "Данияр Куаныш", "Backend — Rate Limiter", "ML-2026-7K2Q"):
        assert invented not in html, f"offline-demo.html still contains invented value: {invented}"

    assert "scripts/generate_offline_demo.py" in html, "offline demo must name its generator"
    assert "evaluation_mode=fallback" in html, "offline demo must state that it ran without an API key"
    assert "Жолынбек Марат" in html, "offline demo must show the seeded candidate's real name"

    # The three hashes below came from the three real preset runs documented in
    # task-9-report.md; if they change, the snapshot was not regenerated.
    for card_hash in ("51babc0444ac", "cb1866d54d75", "e4cf819e4672"):
        assert card_hash in html, f"offline-demo.html is missing the real run {card_hash}"


def test_api_walkthrough_hash_matches_its_canonical_input():
    text = _read(API_DOC)
    assert '"candidate_name": "Evidence Check"' in text
    assert "c43265a13d32" in text

    from backend.seed_data import SEED_TASKS  # noqa: PLC0415 - keep import local
    from backend.verifier import _card_hash  # noqa: PLC0415 - keep import local

    task = next(item for item in SEED_TASKS if item["id"] == "task-fintech-01")
    # Mirrors backend.db.create_user: usr_ + 16 hex chars of sha256(normalized email).
    user_id = "usr_" + hashlib.sha256(b"marat@merilo.kz").hexdigest()[:16]
    expected = _card_hash("task-fintech-01", "Evidence Check", "verified", 90, task["preset_ideal"], user_id)
    assert expected == "c43265a13d32", (
        "docs/API.md and docs/EVIDENCE.md cite c43265a13d32, but the canonical input now hashes to "
        f"{expected}; update the docs or the canonical candidate name."
    )
