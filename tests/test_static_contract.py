"""Static contract tests for the candidate workbench and the public Skill Card.

These tests are intentionally filesystem-only: they pin the DOM ids, the
one-time defense storage rules and the "no innerHTML for API data" rule without
starting the application or a browser.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "static" / "index.html"
CARD_HTML = ROOT / "static" / "card.html"
PROFILE_HTML = ROOT / "static" / "profile.html"
APP_JS = ROOT / "static" / "app.js"
I18N_JS = ROOT / "static" / "i18n.js"

INDEX_IDS = (
    "language-select",
    "task-tabs",
    "own-code-panel",
    "own-code-language",
    "own-code-editor",
    "ai-assisted",
    "candidate-link",
    "candidate-link-status",
    "candidate-link-fallback",
    "defense-panel",
    "defense-q1",
    "defense-q2",
    "defense-q3",
    "defense-answers",
    "defense-seal",
    "defense-status",
)

CARD_IDS = (
    "card-language",
    "card-ai-disclosure",
    "card-metadata",
    "card-defense-block",
    "card-defense-answers",
    "card-manifest-link",
    "card-badge-link",
    "card-qr",
    "card-print-btn",
    "card-profile-link",
    "card-copy-badge-md",
    "card-copy-badge-status",
)

PROFILE_IDS = (
    "profile-title",
    "profile-slug",
    "profile-loading",
    "profile-error",
    "profile-stats",
    "profile-card-count",
    "profile-avg-score",
    "profile-defense-count",
    "profile-languages",
    "profile-empty",
    "profile-cards",
)

COMPARE_IDS = (
    "recruiter-compare",
    "compare-selection-count",
    "compare-clear-btn",
    "compare-export-btn",
    "compare-status",
    "compare-empty",
    "compare-table",
    "compare-head",
    "compare-body",
)

EXPECTED_LANGUAGES = {
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


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _ids(html: str) -> list[str]:
    return re.findall(r'\bid="([^"]+)"', html)


def _select_options(html: str, select_id: str) -> set[str]:
    match = re.search(
        r'<select[^>]*\bid="' + re.escape(select_id) + r'"[^>]*>(.*?)</select>',
        html,
        re.DOTALL,
    )
    assert match is not None, f"select #{select_id} not found"
    return set(re.findall(r'<option[^>]*\bvalue="([^"]+)"', match.group(1)))


def test_index_has_language_and_defense_controls():
    html = _read(INDEX_HTML)
    for marker in [
        "language-select",
        "own-code-panel",
        "ai-assisted",
        "defense-seal",
        "candidate-link",
    ]:
        assert marker in html


def test_card_has_portable_actions():
    html = _read(CARD_HTML)
    for marker in [
        "card-print-btn",
        "card-qr",
        "card-manifest-link",
        "card-badge-link",
        "card-ai-disclosure",
    ]:
        assert marker in html


def test_no_unescaped_user_data_sink():
    js = _read(APP_JS)
    assert "card.defense_answers" not in js or "escapeHtml" in js


def test_every_required_index_id_exists_exactly_once():
    ids = _ids(_read(INDEX_HTML))
    for required in INDEX_IDS:
        assert ids.count(required) == 1, f"#{required} must appear exactly once"


def test_every_required_card_id_exists_exactly_once():
    ids = _ids(_read(CARD_HTML))
    for required in CARD_IDS:
        assert ids.count(required) == 1, f"#{required} must appear exactly once"


def test_every_required_profile_id_exists_exactly_once():
    ids = _ids(_read(PROFILE_HTML))
    for required in PROFILE_IDS:
        assert ids.count(required) == 1, f"#{required} must appear exactly once"


def test_every_required_compare_id_exists_exactly_once():
    ids = _ids(_read(INDEX_HTML))
    for required in COMPARE_IDS:
        assert ids.count(required) == 1, f"#{required} must appear exactly once"


def test_language_select_has_all_supported_languages():
    options = _select_options(_read(INDEX_HTML), "language-select")
    assert options == EXPECTED_LANGUAGES
    assert len(options) == 13


def test_own_code_language_select_has_all_supported_languages():
    options = _select_options(_read(INDEX_HTML), "own-code-language")
    assert options == EXPECTED_LANGUAGES
    assert len(options) == 13


def test_no_innerhtml_assignment_receives_api_data():
    """Static heuristic: API-ish sources may only reach the DOM via textContent.

    ``escapeHtml(...)`` wrapping is accepted as an escaping helper, but the new
    UI does not need it: every API value is written with ``textContent``.
    """
    api_source = re.compile(
        r"\b(?:task|card|candidate|result|payload|envelope|defense|answer|answers|question|questions)\s*\."
    )
    for path in (APP_JS, CARD_HTML, PROFILE_HTML):
        for lineno, line in enumerate(_read(path).splitlines(), start=1):
            if ".innerHTML" not in line:
                continue
            sanitized = re.sub(r"escapeHtml\([^)]*\)", "", line)
            assert not api_source.search(sanitized), (
                f"{path.name}:{lineno} assigns API data with innerHTML"
            )
            assert "${" not in line, (
                f"{path.name}:{lineno} interpolates into innerHTML"
            )


def test_no_defense_token_in_localstorage():
    for path in (APP_JS, CARD_HTML):
        for lineno, line in enumerate(_read(path).splitlines(), start=1):
            lowered = line.lower()
            if "localstorage" in lowered:
                assert "defense" not in lowered, (
                    f"{path.name}:{lineno} writes a defense token to localStorage"
                )
                assert "merilo-defense-" not in lowered


def test_defense_token_uses_sessionstorage_only():
    js = _read(APP_JS)
    card_js = _read(CARD_HTML)
    assert "sessionStorage.setItem(DEFENSE_STORAGE_PREFIX + cardHash, token)" in js
    assert "sessionStorage.getItem(DEFENSE_STORAGE_PREFIX + cardHash)" in js
    assert "'merilo-defense-' + hash" in card_js
    assert "'X-Defense-Token'" in js
    assert "'X-Defense-Token'" in card_js


def test_defense_token_never_lands_in_url_or_history():
    for path in (APP_JS, CARD_HTML):
        for lineno, line in enumerate(_read(path).splitlines(), start=1):
            lowered = line.lower()
            if "defense" not in lowered:
                continue
            assert "history.pushstate" not in lowered
            assert "history.replacestate" not in lowered
            assert "location.search =" not in lowered
            assert "searchparams.set" not in lowered


def test_ai_disclosure_defaults_to_unchecked():
    html = _read(INDEX_HTML)
    match = re.search(r"<input[^>]*\bid=\"ai-assisted\"[^>]*>", html, re.DOTALL)
    assert match is not None, "#ai-assisted checkbox not found"
    assert not re.search(r"\bchecked\b", match.group(0))
    assert "Я использовал AI при подготовке решения" in html
    assert "ai_assisted" in _read(APP_JS)


def test_task_deep_link_contract():
    js = _read(APP_JS)
    assert "new URLSearchParams(window.location.search).get('task')" in js
    assert "'/?task='" in js
    assert "OWN_CODE_TASK_ID" in js
    assert "own-code" in js


def test_card_fetches_public_api_and_renders_defense_text():
    card_js = _read(CARD_HTML)
    assert "fetch('/api/cards/' + encodeURIComponent(cardHash)" in card_js
    assert "card-defense-answers" in card_js
    assert "Защита не записана" in card_js
    assert "defense_answers" in card_js
    assert "textContent" in card_js


def test_card_print_contract():
    html = _read(CARD_HTML)
    assert "window.print()" in html
    assert "@page" in html
    assert "size: A4" in html
    assert "#card-qr" in html


def test_copy_actions_are_present_and_wired():
    card_html = _read(CARD_HTML)
    index_html = _read(INDEX_HTML)
    app_js = _read(APP_JS)

    # Public card: GitHub-flavoured Markdown badge copy.
    assert 'id="card-copy-badge-md"' in card_html
    assert 'id="card-copy-badge-status"' in card_html
    assert "Merilo Verified" in card_html
    assert "'/badge/' + safeHash + '.svg)]'" in card_html.replace("\n", " ")
    assert "'/card/' + safeHash + ')'" in card_html.replace("\n", " ")

    # Candidate link: selectable fallback plus a polite live confirmation.
    assert 'id="candidate-link-fallback"' in index_html
    assert 'id="candidate-link-status"' in index_html
    assert 'aria-live="polite"' in index_html
    assert "showCandidateLinkFallback" in app_js
    assert "candidateLinkFallback.select()" in app_js
    assert "candidateLinkStatus.textContent" in app_js
    assert "window.location.origin + '/?task='" in app_js


def test_print_css_resets_chip_backgrounds():
    html = _read(CARD_HTML)
    print_block = html.split("@media print", 1)[1]
    for chip in (
        "#card-language",
        "#card-ai-disclosure",
        "#card-issued-at",
        "#card-eval-mode",
    ):
        assert chip in print_block, f"{chip} must be addressed by the print CSS"
    assert re.search(
        r"#card-language,\s*"
        r"#card-ai-disclosure,\s*"
        r"#card-issued-at,\s*"
        r"#card-eval-mode,",
        print_block,
    ), "the four chips must share one print rule"
    assert "background: transparent !important" in print_block
    assert "color: #191816 !important" in print_block
    assert "1px solid #CFC7B8" in print_block


def test_i18n_defines_new_candidate_keys_in_all_locales():
    js = _read(I18N_JS)
    for key in (
        "ai.label",
        "candidate.copyLink",
        "defense.seal",
        "card.metadataTitle",
        "card.defenseTitle",
        "card.portableTitle",
    ):
        assert js.count("'" + key + "'") == 3, f"{key} must exist in RU, KZ and EN"


def test_profile_page_has_no_external_resources():
    html = _read(PROFILE_HTML)
    assert "https://" not in html
    assert "http://" not in html
    assert "fonts.googleapis" not in html
    assert "cdn." not in html
    assert "<script src=" not in html
    assert "<link rel=\"stylesheet\"" not in html


def test_profile_page_fetches_summary_api_and_renders_with_textcontent():
    html = _read(PROFILE_HTML)
    assert "fetch('/api/users/' + encodeURIComponent(slug) + '/cards'" in html
    assert "textContent" in html
    assert ".innerHTML" not in html
    assert "profile-empty" in html
    assert "Array.isArray(cards)" in html
    # The page never turns the slug into a request for a raw user id.
    assert "/api/users/" in html
    assert "user_id" not in html


def test_compare_controls_contract():
    html = _read(INDEX_HTML)
    js = _read(APP_JS)

    assert 'id="compare-export-btn"' in html
    assert 'id="compare-clear-btn"' in html
    assert 'id="compare-selection-count"' in html
    assert 'aria-live="polite"' in html

    assert "const MAX_COMPARE_CARDS = 3;" in js
    assert "compareSelected.size >= MAX_COMPARE_CARDS" in js
    assert "renderCompareTable(selected)" in js
    assert "cmp.defense" in js
    assert "cmp.language" in js
    assert "cmp.clean" in js
    assert "data-compare-hash" in js


def test_talent_stream_uses_verified_cards_api_and_real_data_only():
    js = _read(APP_JS)
    i18n = _read(I18N_JS)

    assert "fetch('/api/cards/recent?limit=50'" in js
    assert "let recruiterCards = [];" in js
    assert "recruiterCards.find((candidate) => candidate.hash === hash)" in js

    # No hardcoded recruiter dataset may come back.
    assert "hrCandidates" not in js
    for invented in ("Айгерим Серикова", "Данияр Куаныш", "sec_shield", "logist_aig88"):
        assert invented not in js, f"fabricated recruiter row leaked back: {invented}"

    # The empty state is a real, localized string, not a blank table body.
    assert "'hr.streamEmpty': 'Пока нет проверенных карточек'" in i18n
    assert i18n.count("'hr.streamEmpty'") == 3
    assert "renderTalentStreamEmptyRow(t('hr.streamEmpty'))" in js


def test_fourth_compare_click_reports_a_visible_limit_message():
    html = _read(INDEX_HTML)
    js = _read(APP_JS)
    i18n = _read(I18N_JS)

    status_tag = re.search(r'<p[^>]*\bid="compare-status"[^>]*>', html)
    assert status_tag is not None, "#compare-status must exist"
    assert 'aria-live="polite"' in status_tag.group(0)
    assert 'role="status"' in status_tag.group(0)

    # The 4th click is answered with the visible message, never a dead checkbox.
    assert "setCompareStatus(t('hr.compareLimit'))" in js
    assert "selectBox.disabled" not in js
    assert "box.disabled = !isSelected" not in js
    assert "'hr.compareLimit': 'Можно сравнить не более 3 карточек'" in i18n



def test_compare_i18n_keys_exist_in_all_locales():
    js = _read(I18N_JS)
    for key in (
        "th.compare",
        "hr.compareTitle",
        "hr.compareClear",
        "hr.compareExport",
        "hr.compareLimit",
        "hr.compareNone",
        "cmp.metric",
        "cmp.defense",
        "defense.recorded",
        "defense.notRecorded",
        "defense.unavailable",
    ):
        assert js.count("'" + key + "'") == 3, f"{key} must exist in RU, KZ and EN"


def test_offline_demo_is_served_over_http():
    """The offline artifact linked from the deck must resolve at the live URL."""
    from fastapi.testclient import TestClient

    from backend.main import app

    with TestClient(app) as client:
        response = client.get("/offline-demo.html")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/html")
    body = response.text.lower()
    assert "вердикт" in body
    assert "ml-2026-" in body
