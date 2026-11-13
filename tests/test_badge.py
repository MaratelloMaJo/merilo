"""Task 5 — public badge and QR rendering.

The badge is a self-contained 320×120 SVG (paper, graphite, vermilion stamp,
olive for verified), every dynamic value XML-escaped, no external fonts/images
and an accessible title. The QR endpoint serves a segno SVG for the public card
URL, parameterised by ``MERILO_PUBLIC_BASE_URL``.
"""

import xml.etree.ElementTree as ET

import pytest

from backend.signing import (
    DEFAULT_PUBLIC_BASE_URL,
    GRAPHITE,
    OLIVE,
    PAPER,
    VERMILION,
    badge_svg,
    card_qr_url,
    qr_svg,
)

SVG_NS = "{http://www.w3.org/2000/svg}"


def _parse(svg: str) -> ET.Element:
    return ET.fromstring(svg)


# =============================================================================
# badge_svg()
# =============================================================================

def test_badge_escapes_xml():
    svg = badge_svg(
        score=90,
        language="C#<script>alert(1)</script>",
        tier='Gold & "Verified"',
        candidate_name="Ada <Lovelace> & 'Co'",
    )

    assert "<script>" not in svg
    assert "&lt;script&gt;" in svg
    assert "&amp;" in svg
    assert "&quot;" in svg
    # The document still parses: escaping did not break the markup.
    _parse(svg)


def test_badge_is_compact_and_on_palette():
    svg = badge_svg(
        score=93,
        language="C#",
        tier="Gold Verified",
        candidate_name="Ada Lovelace",
        card_hash="abc123abc123",
    )
    root = _parse(svg)

    assert root.attrib["width"] == "320"
    assert root.attrib["height"] == "120"
    assert root.attrib["viewBox"] == "0 0 320 120"
    assert root.attrib["role"] == "img"
    for color in (PAPER, GRAPHITE, VERMILION, OLIVE):
        assert color in svg
    assert ">93</text>" in svg
    assert "C#" in svg
    assert "Gold Verified" in svg
    assert "VERIFIED" in svg


def test_badge_has_accessible_title_and_no_external_resources():
    svg = badge_svg(score=70, language="python", tier="Silver Verified")

    title = _parse(svg).find(f"{SVG_NS}title")
    assert title is not None
    assert title.text and "Merilo" in title.text
    assert title.attrib["id"] == "merilo-badge-title"

    lowered = svg.lower()
    assert "fonts.googleapis" not in lowered
    assert "<image" not in lowered
    assert "@import" not in lowered
    assert "href=" not in lowered
    assert "url(" not in lowered


def test_unverified_badge_uses_no_olive():
    svg = badge_svg(
        score=0,
        language="python",
        tier="Rejected",
        status="blocked",
    )

    assert "UNVERIFIED" in svg
    assert OLIVE not in svg
    assert VERMILION in svg
    _parse(svg)


def test_badge_clamps_scores():
    assert ">0</text>" in badge_svg(score=-10, language="go", tier="Needs Work")
    assert ">100</text>" in badge_svg(score=140, language="go", tier="Gold Verified")


# =============================================================================
# QR helpers
# =============================================================================

def test_card_qr_url_honours_the_public_base_url(monkeypatch):
    monkeypatch.setenv("MERILO_PUBLIC_BASE_URL", "https://example.test/")
    assert card_qr_url("abc123") == "https://example.test/card/abc123"

    monkeypatch.delenv("MERILO_PUBLIC_BASE_URL", raising=False)
    assert card_qr_url("abc123") == f"{DEFAULT_PUBLIC_BASE_URL}/card/abc123"


def test_qr_svg_is_deterministic_per_hash():
    first = qr_svg("abc123abc123")

    assert _parse(first).tag == f"{SVG_NS}svg"
    assert qr_svg("abc123abc123") == first
    assert qr_svg("def456def456") != first
    assert GRAPHITE in first


# =============================================================================
# HTTP routes
# =============================================================================

def _card_hash(client, code: str = "def square(n):\n    return n * n\n") -> str:
    response = client.post(
        "/api/submissions/verify",
        json={
            "task_id": "task-fintech-01",
            "submitted_code": code,
            "candidate_name": "Badge Candidate",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()["card_hash"]


def test_badge_route_serves_svg(client):
    card_hash = _card_hash(client)
    score = client.get(f"/api/cards/{card_hash}").json()["total_score"]

    response = client.get(f"/badge/{card_hash}.svg")

    assert response.status_code == 200
    assert response.headers["content-type"].split(";")[0].strip() == "image/svg+xml"
    assert response.text.startswith("<svg")
    assert _parse(response.text).attrib["width"] == "320"
    assert f">{score}</text>" in response.text


def test_badge_route_unknown_card_is_404(client):
    response = client.get("/badge/doesnotexist.svg")

    assert response.status_code == 404
    assert response.headers["content-type"].split(";")[0].strip() == "application/json"


def test_qr_route_serves_svg(client):
    card_hash = _card_hash(client)

    response = client.get(f"/card/{card_hash}/qr.svg")

    assert response.status_code == 200
    assert response.headers["content-type"].split(";")[0].strip() == "image/svg+xml"
    assert _parse(response.text).tag == f"{SVG_NS}svg"


def test_qr_route_unknown_card_is_404(client):
    response = client.get("/card/doesnotexist/qr.svg")

    assert response.status_code == 404


@pytest.mark.parametrize("path", ["/badge/legacy.svg", "/card/legacy/qr.svg"])
def test_render_routes_are_reachable_without_auth(client, path):
    """No auth, no cookies: a recruiter can embed these URLs directly."""
    response = client.get(path)

    assert response.status_code == 404
