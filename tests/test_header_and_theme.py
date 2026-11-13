"""Contract for the refreshed public header, the dark theme, and the help page.

The landing is candidate-first: the HR switch is gone from the masthead, the
Workspace button is the HR Portal, and the theme follows the system preference
with a manual override. These tests are filesystem-only.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"


def _read(name: str) -> str:
    return (STATIC / name).read_text(encoding="utf-8")


def test_landing_header_is_candidate_first_and_has_no_role_switch():
    html = _read("index.html")

    assert "role-switch" not in html
    assert "role-toggle-candidate" not in html
    assert "role-toggle-recruiter" not in html

    header = html.split("<header class=\"masthead\">", 1)[1].split("</header>", 1)[0]
    for label in ("Стенд", "Как это работает", "Вопросы", "HR-Портал"):
        assert label in header, label

    assert 'id="theme-toggle"' in header
    assert 'id="mobile-menu-toggle"' in header
    assert 'id="mobile-menu"' in html
    assert 'data-theme' in html


def test_theme_is_painted_before_css_and_has_dark_tokens():
    html = _read("index.html")
    assert "prefers-color-scheme: dark" in html
    assert "localStorage.getItem(\"merilo.theme\")" in html

    css = _read("merilo.css")
    assert ':root[data-theme="dark"]' in css
    for token in ("--paper", "--panel", "--ink", "--muted", "--accent", "--verified", "--rule"):
        assert token in css


def test_help_page_is_a_standalone_translated_page():
    html = _read("help.html")
    assert '<html lang="ru">' in html
    assert html.count("<h1") == 1
    assert 'class="skip-link"' in html
    assert "<main" in html
    assert "<footer" in html
    assert 'data-i18n="help.title"' in html
    assert "/static/i18n.js" in html


def test_workspace_loads_candidate_pages_and_role_helpers():
    workspace = _read("workspace.html")
    assert "pages-candidate.js" in workspace

    core = _read("ws/core.js")
    for symbol in ("NAV_CANDIDATE", "loadUser", "applyRole", "setRole", "canSwitchRole"):
        assert symbol in core, symbol

    pages = _read("ws/pages-candidate.js")
    for page in ("candidateDashboard", "candidateCards", "candidateTasks", "candidateProfile"):
        assert page in pages, page


def test_backend_exposes_cookie_session_and_secondary_role():
    main = (ROOT / "backend" / "main.py").read_text(encoding="utf-8")
    db = (ROOT / "backend" / "db.py").read_text(encoding="utf-8")

    assert 'SESSION_COOKIE_NAME = "merilo_session"' in main
    assert '@app.post("/api/auth/logout")' in main
    assert '@app.post("/api/auth/roles")' in main
    assert "secondary_role" in db
    assert "set_user_secondary_role" in main
