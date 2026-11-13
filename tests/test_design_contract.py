"""Design contract for the measurement-lab visual system.

These tests pin the paper/letterpress palette, the self-contained asset rule,
the accessibility landmarks, and the offline demo. They are filesystem-only so
they can run in CI without a browser or a running server.
"""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "static" / "index.html"
CARD = ROOT / "static" / "card.html"
PROFILE = ROOT / "static" / "profile.html"
OFFLINE = ROOT / "docs" / "offline-demo.html"
CSS = ROOT / "static" / "merilo.css"
APP_JS = ROOT / "static" / "app.js"

PAGES = (INDEX, CARD, PROFILE, OFFLINE)
SURFACES = (*PAGES, CSS, APP_JS)

TOKENS = {
    "--paper": "#F3EFE6",
    "--panel": "#FAF7F0",
    "--ink": "#191816",
    "--muted": "#5E5A52",
    "--accent": "#B33A2B",
    "--verified": "#59624E",
    "--rule": "#CFC7B8",
}

# Old dark-theme / Tailwind arbitrary values that must not leak back in.
OLD_PALETTE = (
    "#7c5cff",
    "#9b85ff",
    "#8b5cf6",
    "#8b949e",
    "#0d1117",
    "#161b22",
    "#11151a",
    "#e6edf3",
    "#c9d1d9",
    "#f85149",
    "#3fb950",
    "#d29922",
)

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
    "card-serial",
    "card-key-fingerprint",
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


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _ids(html: str) -> list[str]:
    return re.findall(r'\bid="([^"]+)"', html)


def _relative_luminance(hex_color: str) -> float:
    value = hex_color.lstrip("#")
    channels = [int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)]
    linear = [
        channel / 12.92
        if channel <= 0.03928
        else ((channel + 0.055) / 1.055) ** 2.4
        for channel in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def _contrast(foreground: str, background: str) -> float:
    lighter = max(_relative_luminance(foreground), _relative_luminance(background))
    darker = min(_relative_luminance(foreground), _relative_luminance(background))
    return (lighter + 0.05) / (darker + 0.05)


def test_no_external_assets_or_purple():
    for path in SURFACES:
        text = _read(path).lower()
        assert "cdn.tailwindcss.com" not in text, path
        assert "fonts.googleapis" not in text, path
        assert "fonts.gstatic" not in text, path
        assert "@import" not in text, path
        assert "@font-face" not in text, path
        assert "linear-gradient" not in text, path
        assert "radial-gradient" not in text, path
        assert "conic-gradient" not in text, path
        assert "box-shadow" not in text, path
        for colour in OLD_PALETTE:
            assert colour not in text, f"{colour} leaked into {path.name}"


def test_every_surface_is_local_and_has_no_remote_url():
    for path in PAGES:
        text = _read(path)
        assert "http://" not in text, f"remote URL in {path.name}"
        assert "https://" not in text, f"remote URL in {path.name}"
        assert "cdn." not in text, f"CDN reference in {path.name}"
        assert not re.search(r'\b(?:src|href)\s*=\s*"//', text), path.name


def test_css_defines_the_exact_palette_and_system_fonts():
    css = _read(CSS)
    for name, value in TOKENS.items():
        assert re.search(
            re.escape(name) + r"\s*:\s*" + re.escape(value) + r"\s*;", css
        ), f"{name} must be exactly {value}"
    assert 'Georgia, "Times New Roman", serif' in css
    assert 'ui-monospace, "Cascadia Mono"' in css
    assert "font-family: var(--sans)" in css


def test_palette_contrast_meets_wcag_aa_for_text_pairs():
    # Pairs used for body copy, labels, links and status text. The rule colour is
    # decorative (1.46:1) and is never used as a text colour.
    pairs = (
        ("ink/paper", TOKENS["--ink"], TOKENS["--paper"]),
        ("muted/paper", TOKENS["--muted"], TOKENS["--paper"]),
        ("accent/paper", TOKENS["--accent"], TOKENS["--paper"]),
        ("verified/paper", TOKENS["--verified"], TOKENS["--paper"]),
        ("paper/accent", TOKENS["--paper"], TOKENS["--accent"]),
        ("ink/panel", TOKENS["--ink"], TOKENS["--panel"]),
        ("muted/panel", TOKENS["--muted"], TOKENS["--panel"]),
    )
    for label, foreground, background in pairs:
        ratio = _contrast(foreground, background)
        assert ratio >= 4.5, f"{label} contrast {ratio:.2f} is below AA"


def test_no_tailwind_utility_classes_remain():
    for path in (INDEX, CARD, PROFILE, APP_JS):
        text = _read(path)
        assert "tailwind" not in text.lower(), path.name
        for pattern in (
            r"\bbg-\[#",
            r"\btext-\[#",
            r"\bborder-\[#",
            r"\brounded-(?:md|lg|xl|2xl)\b",
            r"\bshadow-(?:sm|md|lg|xl)\b",
        ):
            assert not re.search(pattern, text), f"{pattern} in {path.name}"


def test_both_public_pages_have_one_h1_lang_skip_link_and_landmarks():
    for path in PAGES:
        html = _read(path)
        assert '<html lang="ru">' in html, path.name
        assert len(re.findall(r"<h1\b", html)) == 1, path.name
        assert 'class="skip-link"' in html, path.name
        assert "<main" in html, path.name
        assert "<footer" in html or path is PROFILE, path.name


def test_landing_has_required_sections_facts_and_prices():
    html = _read(INDEX)
    for anchor in ("workbench", "how", "candidate", "companies", "boundaries", "faq"):
        assert f'id="{anchor}"' in html, f"missing #{anchor} section"
    for heading in (
        "Как это работает",
        "Кандидату",
        "Компаниям",
        "Границы",
        "Вопросы",
    ):
        assert heading in html
    for fact in ("Тесты", "Подпись", "Языки"):
        assert fact in html
    for price in ("3 000 ₸", "29 000 ₸", "149 000 ₸"):
        assert price in html, f"missing price {price}"
    hero = html.split('<section class="hero wrap"', 1)[1].split(
        "<!-- WORKBENCH", 1
    )[0]
    assert hero.count("btn-primary") == 1, "hero must expose one primary CTA"


def test_required_functional_ids_are_preserved_once():
    index_ids = _ids(_read(INDEX))
    card_ids = _ids(_read(CARD))
    profile_ids = _ids(_read(PROFILE))
    for required in INDEX_IDS:
        assert index_ids.count(required) == 1, f"index #{required}"
    for required in CARD_IDS:
        assert card_ids.count(required) == 1, f"card #{required}"
    for required in PROFILE_IDS:
        assert profile_ids.count(required) == 1, f"profile #{required}"


def test_card_is_a_certificate_with_derived_serial_and_print_rules():
    html = _read(CARD)
    assert "ML-2026-" in html
    assert "serialFromHash" in html
    assert "serialFromHash(cardHashValue)" in html
    assert "card-defense-block" in html
    assert "card-key-fingerprint" in html
    assert "@media print" in html
    assert "size: A4 portrait" in html
    assert "954" in html, "the one-page pixel budget must stay documented"
    print_block = html.split("@media print", 1)[1]
    assert "background: transparent !important" in print_block
    assert "color: #191816 !important" in print_block


def test_offline_demo_is_standalone_and_shows_three_verdicts():
    html = _read(OFFLINE)
    assert html.count('class="verdict ') == 3
    for verdict in ("verdict--gold", "verdict--needs-work", "verdict--rejected"):
        assert verdict in html
    for label in ("Gold Verified", "Needs Work", "Rejected · Gate 2"):
        assert label in html
    assert "статический снимок · без сети" in html
    assert "LIVE" not in html
    assert "<script" not in html.lower()
    assert '<link rel="stylesheet"' not in html.lower()
    assert "<img" not in html.lower()
    assert "fetch(" not in html
    assert "xmlhttprequest" not in html.lower()
    assert "http://" not in html
    assert "https://" not in html


def test_accessibility_hooks_exist():
    css = _read(CSS)
    assert ":focus-visible" in css
    assert "@media (prefers-reduced-motion: reduce)" in css
    assert ".skip-link" in css
    assert _read(PROFILE).count("prefers-reduced-motion") == 1
    assert _read(OFFLINE).count("prefers-reduced-motion") == 1
    assert ":focus-visible" in _read(PROFILE)
    assert ":focus-visible" in _read(OFFLINE)
    index = _read(INDEX)
    assert 'aria-live="polite"' in index
    assert 'role="alert"' in index
    assert "<label" in index
    assert "aria-pressed" in index


def test_no_innerhtml_assignment_receives_api_data():
    api_source = re.compile(
        r"\b(?:task|card|candidate|result|payload|envelope|defense|answer|"
        r"answers|question|questions)\s*\."
    )
    for path in (APP_JS, CARD, PROFILE):
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
