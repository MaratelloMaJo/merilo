"""Public profile API and recruiter shortlist export contract.

Privacy rule under test: a public payload identifies a profile by an opaque,
deterministic slug — never by the raw ``user_id`` or the account email.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import re
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

import pytest

from backend import db, defense

ROOT = Path(__file__).resolve().parents[1]
APP_JS = ROOT / "static" / "app.js"

SUMMARY_FIELDS = {
    "card_hash",
    "task_title",
    "language",
    "total_score",
    "badge_tier",
    "created_at",
    "defense_status",
    "verify_url",
    "profile_url",
}

RECENT_FIELDS = SUMMARY_FIELDS | {"status", "profile_slug", "candidate_name"}


def _slug_for(user_id: str) -> str:
    return hashlib.sha256(("merilo-profile:" + user_id).encode()).hexdigest()[:12]


def _new_user(prefix: str = "task7") -> dict[str, Any]:
    token = uuid.uuid4().hex[:12]
    return db.create_user(
        email=f"{prefix}-{token}@example.test",
        password="correct-horse-battery",
        full_name=f"Task Seven {token}",
        role="candidate",
    )


def _save_card(
    user_id: str,
    *,
    score: int = 82,
    tier: str = "Silver Verified",
    status: str = "verified",
    task_title: str = "Task 7 card",
    language: str = "python",
    created_at: str | None = None,
) -> str:
    card_hash = uuid.uuid4().hex[:12]
    db.save_skill_card(
        {
            "card_hash": card_hash,
            "candidate_name": "Task Seven Candidate",
            "task_id": "task-fintech-01",
            "task_title": task_title,
            "company_name": "Merilo Test",
            "total_score": score,
            "badge_tier": tier,
            "status": status,
            "gate_reached": 3 if status == "verified" else 2,
            "clean_code": score,
            "architecture": score,
            "edge_cases": score,
            "executive_summary": "test card",
            "submitted_code": "def transfer(amount):\n    return max(0, amount)\n",
            "verify_url": f"/card/{card_hash}",
            "user_id": user_id,
            "language": language,
            "created_at": created_at,
        }
    )
    return card_hash


def _profile(client, slug: str):
    return client.get(f"/api/users/{slug}/cards")


def test_profile_slug_is_opaque_deterministic_and_hides_identity(client):
    user = _new_user()
    slug = _slug_for(user["id"])
    card_hash = _save_card(user["id"])

    assert db.profile_slug(user["id"]) == slug
    assert db.profile_url_for_user(user["id"]) == f"/p/{slug}"

    response = _profile(client, slug)
    assert response.status_code == 200
    raw = response.text
    assert user["id"] not in raw
    assert user["email"] not in raw

    cards = response.json()
    assert [card["card_hash"] for card in cards] == [card_hash]
    assert cards[0]["profile_url"] == f"/p/{slug}"
    assert "usr_" not in raw


def test_profile_summary_exposes_only_public_fields(client):
    user = _new_user()
    _save_card(user["id"])

    cards = _profile(client, _slug_for(user["id"])).json()
    assert cards
    assert set(cards[0]) == SUMMARY_FIELDS
    for forbidden in (
        "user_id",
        "user_email",
        "email",
        "submitted_code",
        "evaluation",
        "evaluation_json",
        "answers",
        "defense_answers",
        "defense_token_hash",
        "signature",
    ):
        assert forbidden not in cards[0]


def test_unknown_slug_is_404_and_known_profile_may_be_empty(client):
    assert _profile(client, "deadbeefcafe").status_code == 404
    assert _profile(client, "not-a-slug").status_code == 404
    assert _profile(client, "000000000000").status_code == 404

    user = _new_user()
    response = _profile(client, _slug_for(user["id"]))
    assert response.status_code == 200
    assert response.json() == []


def test_profile_page_is_served_for_known_and_unknown_slugs(client):
    user = _new_user()
    known = client.get(f"/p/{_slug_for(user['id'])}")
    assert known.status_code == 200
    assert "text/html" in known.headers["content-type"]
    assert 'id="profile-cards"' in known.text
    assert 'id="profile-avg-score"' in known.text

    # Documented choice: the page always renders; the API decides existence and
    # the page shows its empty "profile not found" state for an unknown slug.
    unknown = client.get("/p/deadbeefcafe")
    assert unknown.status_code == 200
    assert 'id="profile-empty"' in unknown.text


def test_profiles_are_isolated_per_user(client):
    owner = _new_user("owner")
    other = _new_user("other")
    owner_cards = {_save_card(owner["id"]), _save_card(owner["id"])}
    other_card = _save_card(other["id"])

    owner_result = _profile(client, _slug_for(owner["id"])).json()
    other_result = _profile(client, _slug_for(other["id"])).json()

    assert {card["card_hash"] for card in owner_result} == owner_cards
    assert {card["card_hash"] for card in other_result} == {other_card}
    assert other_card not in {card["card_hash"] for card in owner_result}


def test_defense_status_values_are_derived(client):
    user = _new_user()
    plain = _save_card(user["id"], task_title="No challenge")

    issued = _save_card(user["id"], task_title="Challenge issued")
    questions = ["q1", "q2", "q3"]
    token = defense.hash_token("task7-issued-token")
    assert defense.set_defense_challenge(issued, questions, token)

    sealed = _save_card(user["id"], task_title="Defense sealed")
    seal_token = defense.hash_token("task7-sealed-token")
    assert defense.set_defense_challenge(sealed, questions, seal_token)
    defense.seal_card_defense(sealed, seal_token, ["a1", "a2", "a3"])

    cards = {
        card["card_hash"]: card
        for card in _profile(client, _slug_for(user["id"])).json()
    }
    assert cards[plain]["defense_status"] == "unavailable"
    assert cards[issued]["defense_status"] == "not_recorded"
    assert cards[sealed]["defense_status"] == "recorded"


def test_public_card_payload_links_profile_by_slug_not_user_id(client):
    user = _new_user()
    card_hash = _save_card(user["id"])

    payload = client.get(f"/api/cards/{card_hash}").json()
    raw = json.dumps(payload, ensure_ascii=False)

    assert payload["profile_url"] == f"/p/{_slug_for(user['id'])}"
    assert user["id"] not in raw
    assert user["email"] not in raw
    assert "submitted_code" not in payload


def test_user_directory_exposes_slugs_without_identifiers(client):
    user = _new_user("directory")
    slug = _slug_for(user["id"])

    payload = client.get("/api/users").json()
    raw = json.dumps(payload, ensure_ascii=False)
    assert user["id"] not in raw
    assert user["email"] not in raw

    entry = next(item for item in payload if item["profile_slug"] == slug)
    assert set(entry) == {"profile_slug", "full_name", "role", "created_at"}


def test_verify_response_profile_url_is_opaque(client):
    response = client.post(
        "/api/submissions/verify",
        json={
            "task_id": "own-code",
            "language": "python",
            "submitted_code": "def slug_probe(value):\n    return value + 1\n",
            "candidate_name": "Slug Probe",
        },
    )
    assert response.status_code == 200
    data = response.json()
    assert data["profile_url"] == f"/p/{_slug_for(data['user_id'])}"
    assert data["user_id"] not in data["profile_url"]


def test_profile_lists_only_verified_cards_and_average_uses_verified_only(client):
    """The page promises «Только проверенные карточки».

    A rejected or blocked card must neither appear in the public profile nor
    contribute to its average score.
    """
    user = _new_user()
    verified_a = _save_card(user["id"], score=90, status="verified", task_title="verified A")
    verified_b = _save_card(user["id"], score=80, status="verified", task_title="verified B")
    rejected = _save_card(user["id"], score=5, status="rejected", task_title="rejected card")
    blocked = _save_card(user["id"], score=0, status="blocked", task_title="blocked card")

    cards = _profile(client, _slug_for(user["id"])).json()
    hashes = {card["card_hash"] for card in cards}

    assert hashes == {verified_a, verified_b}
    assert rejected not in hashes
    assert blocked not in hashes

    scores = [card["total_score"] for card in cards]
    assert scores == [90, 80] or scores == [80, 90]
    assert 5 not in scores
    assert sum(scores) / len(scores) == 85.0


def _recent(client, limit: int | str | None = None):
    suffix = "" if limit is None else f"?limit={limit}"
    return client.get("/api/cards/recent" + suffix)


def test_recent_cards_expose_only_verified_real_summaries(client):
    user = _new_user("recent")
    slug = _slug_for(user["id"])
    token = uuid.uuid4().hex[:8]

    older = _save_card(
        user["id"],
        score=91,
        task_title=f"recent-{token}-older",
        created_at="2032-01-01T00:00:00+00:00",
    )
    newer = _save_card(
        user["id"],
        score=77,
        task_title=f"recent-{token}-newer",
        created_at="2032-01-02T00:00:00+00:00",
    )
    blocked = _save_card(
        user["id"],
        status="blocked",
        task_title=f"recent-{token}-blocked",
        created_at="2032-01-03T00:00:00+00:00",
    )
    rejected = _save_card(
        user["id"],
        status="rejected",
        task_title=f"recent-{token}-rejected",
        created_at="2032-01-04T00:00:00+00:00",
    )

    response = _recent(client, 100)
    assert response.status_code == 200
    items = response.json()
    raw = response.text

    by_hash = {item["card_hash"]: item for item in items}
    assert blocked not in by_hash, "a blocked card must never reach the recruiter feed"
    assert rejected not in by_hash, "a rejected card must never reach the recruiter feed"
    assert older in by_hash and newer in by_hash

    # Newest first (the two probe cards sit in the future, above every seed card).
    assert [item["card_hash"] for item in items].index(newer) < [item["card_hash"] for item in items].index(older)

    for item in items:
        assert set(item) == RECENT_FIELDS
        assert item["status"] == "verified"
        assert isinstance(item["total_score"], int)

    probe = by_hash[newer]
    assert probe["task_title"] == f"recent-{token}-newer"
    assert probe["candidate_name"] == "Task Seven Candidate"
    assert probe["profile_slug"] == slug
    assert probe["profile_url"] == f"/p/{slug}"
    assert probe["language"] == "python"
    assert probe["verify_url"] == f"/card/{newer}"

    for forbidden in (
        user["id"],
        user["email"],
        "user_id",
        "email",
        "submitted_code",
        "evaluation",
        "answers",
        "defense_answers",
        "defense_token_hash",
        "signature",
    ):
        assert forbidden not in raw


def test_recent_cards_derive_all_defense_states_in_bulk(client):
    user = _new_user("recent-defense")
    token = uuid.uuid4().hex[:8]
    questions = ["q1", "q2", "q3"]

    unavailable = _save_card(user["id"], task_title=f"recent-{token}-plain", created_at="2032-02-01T00:00:00+00:00")
    issued = _save_card(user["id"], task_title=f"recent-{token}-issued", created_at="2032-02-02T00:00:00+00:00")
    assert defense.set_defense_challenge(issued, questions, defense.hash_token(f"recent-{token}-issued"))
    sealed = _save_card(user["id"], task_title=f"recent-{token}-sealed", created_at="2032-02-03T00:00:00+00:00")
    seal_token = defense.hash_token(f"recent-{token}-sealed")
    assert defense.set_defense_challenge(sealed, questions, seal_token)
    defense.seal_card_defense(sealed, seal_token, ["a1", "a2", "a3"])

    by_hash = {item["card_hash"]: item for item in _recent(client, 100).json()}
    assert by_hash[unavailable]["defense_status"] == "unavailable"
    assert by_hash[issued]["defense_status"] == "not_recorded"
    assert by_hash[sealed]["defense_status"] == "recorded"


def test_recent_cards_never_issue_a_per_card_query(client, monkeypatch):
    """One query for cards + one pass over their defense columns — no N+1."""
    user = _new_user("recent-nplusone")
    _save_card(user["id"], created_at="2032-03-01T00:00:00+00:00")

    def _boom(*args, **kwargs):  # pragma: no cover - must never be called
        raise AssertionError("recent feed performed a per-card defense lookup")

    monkeypatch.setattr(defense, "get_skill_card_private", _boom)
    response = _recent(client, 50)
    assert response.status_code == 200
    assert response.json()


def test_recent_cards_limit_defaults_to_20_and_rejects_out_of_range(client):
    default_items = _recent(client).json()
    assert len(default_items) <= 20

    one = _recent(client, 1).json()
    assert len(one) == (1 if default_items else 0)

    assert len(_recent(client, 100).json()) <= 100

    # Documented choice: 1..100 is validated, so anything else is an honest 422
    # rather than a silently different page size.
    for invalid in ("0", "101", "-1", "abc", "1.5"):
        assert _recent(client, invalid).status_code == 422, invalid


def test_public_profile_route_docstring_documents_verified_only():
    source = (ROOT / "backend" / "db.py").read_text(encoding="utf-8")
    assert "status = 'verified'" in source
    assert source.count("WHERE status = 'verified'") >= 1


def _csv_escape_body() -> str:
    source = APP_JS.read_text(encoding="utf-8")
    match = re.search(
        r"function csvEscape\(value\) \{(?P<body>.*?)\n\}",
        source,
        re.DOTALL,
    )
    assert match is not None, "csvEscape(value) helper not found in static/app.js"
    return match.group("body")


def test_csv_export_header_is_exact():
    source = APP_JS.read_text(encoding="utf-8")
    assert (
        "const COMPARE_CSV_COLUMNS = ['card_hash', 'title', 'language', "
        "'score', 'tier', 'defense', 'created_at'];"
    ) in source


def test_csv_escaping_contract_quotes_commas_quotes_and_newlines():
    body = _csv_escape_body()
    # Quote when the field contains a comma, a double quote, CR or LF...
    assert 'if (/[",\\r\\n]/.test(text))' in body
    # ...and double every embedded quote (RFC 4180).
    assert "text.replace(/\"/g, '\"\"')" in body
    assert "return '\"' +" in body
    # Plain fields stay unquoted.
    assert "return text;" in body


def test_csv_is_generated_client_side_and_downloaded():
    source = APP_JS.read_text(encoding="utf-8")
    assert "new Blob([csv], { type: 'text/csv;charset=utf-8' })" in source
    assert "URL.createObjectURL(blob)" in source
    assert "link.download = 'merilo-shortlist.csv'" in source
    assert "function buildCompareCsv(candidates)" in source
    assert "lines.join('\\r\\n')" in source


def test_compare_view_supports_at_most_three_cards():
    source = APP_JS.read_text(encoding="utf-8")
    assert "const MAX_COMPARE_CARDS = 3;" in source
    assert "compareSelected.size >= MAX_COMPARE_CARDS" in source
    assert "input[data-compare-hash]" in source
    assert "setAttribute('data-compare-hash'" in source


# =============================================================================
# CSV: pure builder, RFC 4180 quoting and spreadsheet-formula neutralization
# =============================================================================

CSV_HEADER = "card_hash,title,language,score,tier,defense,created_at"

CSV_NODE_RUNNER = r"""
const fs = require('fs');
const [purePath, inputPath] = process.argv.slice(2);
const source = fs.readFileSync(purePath, 'utf8');
const candidates = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const api = new Function(
  source + '\nreturn { build: buildCompareCsv, escape: csvEscape, '
  + 'neutralize: csvNeutralize, columns: COMPARE_CSV_COLUMNS, bom: COMPARE_CSV_BOM };'
)();
process.stdout.write(JSON.stringify({
  csv: api.build(candidates),
  columns: api.columns,
  bom: api.bom,
}));
"""


def _csv_pure_source() -> str:
    source = APP_JS.read_text(encoding="utf-8")
    start = source.index("// BEGIN MERILO_CSV_PURE")
    end = source.index("// END MERILO_CSV_PURE")
    assert start < end, "pure CSV markers are missing or inverted"
    return source[start:end]


def _build_csv_in_node(tmp_path: Path, candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Runs the shipped pure CSV builder under Node if the runtime is available.

    The source is extracted verbatim from ``static/app.js`` between the marker
    comments, so this tests the code that actually ships — not a duplicate of it.
    """
    node = shutil.which("node")
    if not node:
        pytest.skip(
            "node is unavailable: CSV behaviour is verified through the CDP "
            "browser evaluation recorded in the task report"
        )
    (tmp_path / "csv_pure.js").write_text(_csv_pure_source(), encoding="utf-8")
    (tmp_path / "csv_input.json").write_text(
        json.dumps(candidates, ensure_ascii=False), encoding="utf-8"
    )
    (tmp_path / "csv_runner.js").write_text(CSV_NODE_RUNNER, encoding="utf-8")
    completed = subprocess.run(
        [
            node,
            str(tmp_path / "csv_runner.js"),
            str(tmp_path / "csv_pure.js"),
            str(tmp_path / "csv_input.json"),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=60,
        check=False,
    )
    assert completed.returncode == 0, completed.stderr
    return json.loads(completed.stdout)


def _csv_candidate(index: int, title: str) -> dict[str, Any]:
    return {
        "hash": f"card{index:02d}",
        "task_title": title,
        "language": "python",
        "score": 80 + index,
        "tier": "Gold Verified",
        "defense_status": "recorded",
        "created_at": "2026-11-12T10:00:00+00:00",
    }


def test_csv_formula_injection_is_neutralized_and_quoted(tmp_path):
    cases = [
        ('=HYPERLINK("http://evil.test")', '\'=HYPERLINK("http://evil.test")'),
        ("+SUM(1,2)", "'+SUM(1,2)"),
        ("-2+3", "'-2+3"),
        ("@cmd", "'@cmd"),
        ("\tlead", "'\tlead"),
        ("\rlead", "'\rlead"),
        ("A,B", "A,B"),
        ('he said "hi"', 'he said "hi"'),
        ("line1\nline2", "line1\nline2"),
        ("Plain title", "Plain title"),
    ]
    candidates = [_csv_candidate(index, title) for index, (title, _) in enumerate(cases)]
    result = _build_csv_in_node(tmp_path, candidates)
    csv_text = result["csv"]

    # UTF-8 BOM first, then the exact pinned header.
    assert result["bom"] == "\ufeff"
    assert csv_text.startswith("\ufeff")
    assert result["columns"] == CSV_HEADER.split(",")
    assert csv_text[1:].split("\r\n", 1)[0] == CSV_HEADER

    # Raw file checks: the apostrophe is inserted BEFORE RFC 4180 quoting.
    assert '"\'=HYPERLINK(""http://evil.test"")"' in csv_text
    assert '"\'+SUM(1,2)"' in csv_text
    assert "'-2+3" in csv_text
    assert "'@cmd" in csv_text
    assert "'\tlead" in csv_text
    assert '"A,B"' in csv_text
    assert '"he said ""hi"""' in csv_text
    assert '"line1\nline2"' in csv_text

    # Parsed values: neutralization changes the cell to inert text, quoting is
    # undone by a real RFC 4180 reader, and nothing gained a stray apostrophe.
    rows = list(csv.reader(io.StringIO(csv_text[1:], newline="")))
    assert rows[0] == CSV_HEADER.split(",")
    assert len(rows) == len(cases) + 1
    for candidate, (_, expected_title), row in zip(candidates, cases, rows[1:], strict=True):
        assert row[0] == candidate["hash"]
        assert row[1] == expected_title
        assert row[2] == "python"
        assert row[3] == str(candidate["score"])
        assert row[4] == "Gold Verified"
        assert row[5] == "recorded"
        assert row[6] == "2026-11-12T10:00:00+00:00"


def test_csv_builder_is_pure_and_exposed_as_namespace(tmp_path):
    source = APP_JS.read_text(encoding="utf-8")
    pure = _csv_pure_source()
    assert "document." not in pure
    assert "window." not in pure
    assert "fetch(" not in pure
    assert "window.MeriloCsv = Object.freeze({" in source
    assert "neutralize: csvNeutralize" in source
    assert "build: buildCompareCsv" in source
    # One definition each: a later duplicate silently overrides the shipped
    # builder (it already happened once during this fix round).
    assert source.count("function csvEscape(") == 1
    assert source.count("function buildCompareCsv(") == 1
    assert source.count("function csvNeutralize(") == 1

