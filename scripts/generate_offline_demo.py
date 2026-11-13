#!/usr/bin/env python
"""Regenerate ``docs/offline-demo.html`` from three real verification runs.

The page used to be hand-written and contained invented people, tasks, scores and
serials. This script makes the artefact reproducible instead:

* starts the real FastAPI app against a temporary SQLite database (``TestClient``
  runs the lifespan, so seeding happens exactly as in production);
* takes the three presets of ``task-fintech-01`` straight from ``/api/tasks``;
* submits each one to ``POST /api/submissions/verify`` without a Gemini key, so
  the verdicts come from the deterministic fallback engine;
* reads the persisted public card back from ``GET /api/cards/{hash}``;
* renders the responses into the template unchanged — no invented values.

Usage::

    python scripts/generate_offline_demo.py
    python scripts/generate_offline_demo.py --screenshot

``--screenshot`` additionally renders ``screenshots/offline-demo.png`` with a
local headless Chrome (``--chrome`` can point at another executable).
"""

from __future__ import annotations

import argparse
import html
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO_ROOT = Path(__file__).resolve().parent.parent
TEMPLATE = REPO_ROOT / "scripts" / "offline_demo_template.html"
DEFAULT_OUT = REPO_ROOT / "docs" / "offline-demo.html"
DEFAULT_SCREENSHOT = REPO_ROOT / "screenshots" / "offline-demo.png"
TASK_ID = "task-fintech-01"
PRESETS = ("ideal", "vulnerable", "injection")


def _serial_from_hash(card_hash: str) -> str:
    """Mirror ``serialFromHash`` in ``static/card.html`` (first four chars % 10)."""
    clean = "".join(ch for ch in str(card_hash) if ch.isalnum())
    digits = ""
    for ch in clean:
        if len(digits) == 4:
            break
        digits += str(ord(ch) % 10)
    return "ML-2026-" + digits.ljust(4, "0")


def _esc(value: Any) -> str:
    return html.escape(str(value), quote=True)


def _run_presets() -> dict[str, Any]:
    """Run the app and the three presets, returning only the API's own values."""
    tmp_dir = tempfile.mkdtemp(prefix="merilo-offline-")
    # Environment must be set before backend.main is imported: backend.db binds
    # DEFAULT_DB_PATH at import time, exactly like tests/conftest.py does.
    os.environ["MERILO_ENV"] = "development"
    os.environ["MERILO_DB_PATH"] = str(Path(tmp_dir) / "offline-demo.db")
    os.environ.pop("GEMINI_API_KEY", None)
    os.environ.pop("LLM_API_KEY", None)
    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))

    try:
        from fastapi.testclient import TestClient  # noqa: PLC0415 - after env setup

        import backend.main as main  # noqa: PLC0415 - after env setup

        with TestClient(main.app) as client:
            tasks = client.get("/api/tasks")
            tasks.raise_for_status()
            task = next(item for item in tasks.json() if item["id"] == TASK_ID)

            results: list[dict[str, Any]] = []
            for preset in PRESETS:
                code = task[f"preset_{preset}"]
                response = client.post(
                    "/api/submissions/verify",
                    json={
                        "task_id": TASK_ID,
                        "submitted_code": code,
                        "ai_assisted": False,
                    },
                )
                response.raise_for_status()
                verdict = response.json()

                card_response = client.get(f"/api/cards/{verdict['card_hash']}")
                card_response.raise_for_status()
                card = card_response.json()

                results.append(
                    {
                        "preset": preset,
                        "preset_label": task.get(f"preset_{preset}_name") or preset,
                        "verdict": verdict,
                        "card": card,
                        "serial": _serial_from_hash(verdict["card_hash"]),
                    }
                )

            return {
                "candidate_name": results[0]["card"]["candidate_name"],
                "task": task,
                "results": results,
            }
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)


def _stamp(result: dict[str, Any]) -> str:
    verdict = result["verdict"]
    if verdict["status"] == "verified":
        return str(verdict["badge_tier"])
    return f"Rejected · Gate {verdict['gate_reached']}"


def _css_class(result: dict[str, Any]) -> str:
    verdict = result["verdict"]
    if verdict["status"] != "verified":
        return "verdict--rejected"
    if verdict["badge_tier"] == "Gold Verified":
        return "verdict--gold"
    if verdict["badge_tier"] == "Silver Verified":
        return "verdict--silver"
    return "verdict--needs-work"


def _signal(result: dict[str, Any]) -> str:
    verdict = result["verdict"]
    if verdict["status"] == "blocked":
        return "Gate 1 <strong>пройден</strong> · Gate 2 <strong>блокировка</strong> · Gate 3 не запускался"
    if verdict["status"] == "rejected":
        return "Gate 1 <strong>отказ</strong> · Gate 2 не запускался · Gate 3 не запускался"
    return "Gate 1 <strong>пройден</strong> · Gate 2 <strong>чисто</strong> · Gate 3 <strong>подписано</strong>"


def _defense(result: dict[str, Any]) -> str:
    verdict = result["verdict"]
    status = verdict.get("defense_status")
    questions = verdict.get("defense_questions") or []
    if status == "pending":
        return f"вызов выдан · {len(questions)} вопроса"
    if status == "recorded":
        return "записана"
    return "недоступна (вердикт не verified)"


def _excerpt(text: Any, limit: int = 360) -> str:
    """First sentence of the API's executive summary, never rewritten."""
    value = " ".join(str(text or "—").split())
    if len(value) <= limit:
        return value
    cut = value[:limit]
    boundary = cut.rfind(". ")
    if boundary >= 80:
        cut = cut[: boundary + 1]
    return cut.rstrip() + "…"


def _render_verdict(result: dict[str, Any]) -> str:
    verdict = result["verdict"]
    evaluation = verdict["evaluation"]
    card = result["card"]
    status = verdict["status"]

    score = "0" if status == "blocked" else str(verdict["total_score"])
    score_note = "заблокирован на Gate 2" if status == "blocked" else "/100"
    ai_assisted = "да, декларация" if verdict.get("ai_assisted") else "нет"
    summary_label = "Причина" if status != "verified" else "Резюме"
    summary = _excerpt(evaluation.get("executive_summary"))
    language = card.get("language") or "python"
    case = f"{card.get('task_title') or TASK_ID} · пресет «{result['preset_label']}» · {language}"

    score_cell = f'<span class="score">{_esc(score)}</span><span class="score-total">{_esc(score_note)}</span>'
    criteria = (
        f"{evaluation.get('clean_code', 0)} / {evaluation.get('architecture', 0)} / "
        f"{evaluation.get('edge_cases', 0)}"
    )

    return f"""      <article class="verdict {_css_class(result)}" aria-labelledby="{_esc(result['preset'])}-name">
        <div class="verdict-head">
          <div>
            <h2 id="{_esc(result['preset'])}-name" class="verdict-name">{_esc(card.get('candidate_name') or '—')}</h2>
            <p class="verdict-case">
              {_esc(case)}
            </p>
          </div>
          <span class="verdict-stamp">{_esc(_stamp(result))}</span>
        </div>
        <p class="score-row">{score_cell}</p>
        <p class="serial">{_esc(result['serial'])} · {_esc(verdict['card_hash'])}</p>
        <dl class="facts">
          <div><dt>Подпись</dt><dd>HMAC-SHA256 · Ed25519-манифест</dd></div>
          <div><dt>Защита</dt><dd>{_esc(_defense(result))}</dd></div>
          <div><dt>Критерии</dt><dd>{criteria}</dd></div>
          <div><dt>AI</dt><dd>{_esc(ai_assisted)}</dd></div>
        </dl>
        <p class="signal">
          {_signal(result)}
        </p>
        <p class="defense"><span>{_esc(summary_label)}</span>{_esc(summary)}</p>
      </article>"""


def render(data: dict[str, Any], generated_on: str) -> str:
    """Fill the template with values that came from the API, never from this file."""
    results = data["results"]
    task = data["task"]
    hashes = ", ".join(f"<code>{_esc(result['verdict']['card_hash'])}</code>" for result in results)
    lede = (
        "Эти три карточки — сохранённый снимок трёх реальных прогонов "
        "<code>POST /api/submissions/verify</code>, а не макет и не live-лента. "
        f"Один seeded-кандидат «{_esc(data['candidate_name'])}», задача "
        f"<code>{_esc(task['id'])}</code> «{_esc(task['title'])}», три пресета: "
        "ideal, vulnerable, injection. Прогон на временной SQLite без "
        "<code>GEMINI_API_KEY</code> (<code>evaluation_mode=fallback</code>). "
        "Хэши: " + hashes + "."
    )
    body = "\n\n".join(_render_verdict(result) for result in results)
    template = TEMPLATE.read_text(encoding="utf-8")
    return (
        template.replace("%%LEDE%%", lede)
        .replace("%%GENERATED_DATE%%", _esc(generated_on))
        .replace("%%VERDICTS%%", body)
    )


def _find_chrome(explicit: str | None) -> str | None:
    candidates = [
        explicit,
        os.getenv("CHROME_PATH"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def take_screenshot(chrome: str, page: Path, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    command = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        "--window-size=1440,1050",
        f"--screenshot={out}",
        page.resolve().as_uri(),
    ]
    subprocess.run(command, check=True, capture_output=True, timeout=60)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT, help="HTML output path.")
    parser.add_argument("--screenshot", action="store_true", help="Also render screenshots/offline-demo.png.")
    parser.add_argument("--screenshot-out", type=Path, default=DEFAULT_SCREENSHOT, help="PNG output path.")
    parser.add_argument("--chrome", default=None, help="Path to a Chrome/Chromium executable.")
    args = parser.parse_args(argv)

    if not TEMPLATE.is_file():
        print(f"[offline-demo] Template not found: {TEMPLATE}", file=sys.stderr)
        return 1

    data = _run_presets()
    page = render(data, generated_on="2026-11-13")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(page, encoding="utf-8", newline="\n")

    print(f"[offline-demo] wrote {args.out}")
    for result in data["results"]:
        verdict = result["verdict"]
        print(
            "[offline-demo] "
            f"preset={result['preset']} status={verdict['status']} gate={verdict['gate_reached']} "
            f"score={verdict['total_score']} tier={verdict['badge_tier']} "
            f"hash={verdict['card_hash']} serial={result['serial']}"
        )

    if args.screenshot:
        chrome = _find_chrome(args.chrome)
        if chrome is None:
            print("[offline-demo] Chrome not found; pass --chrome or skip --screenshot.", file=sys.stderr)
            return 1
        take_screenshot(chrome, args.out, args.screenshot_out)
        print(f"[offline-demo] wrote {args.screenshot_out}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
