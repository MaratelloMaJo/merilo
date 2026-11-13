#!/usr/bin/env python3
"""Fetch real HH.kz vacancy counts for the 13 languages Merilo parses.

The script reads the public search page and extracts the ``Найдено N вакансий``
headline.  It never estimates a number: a language whose count cannot be parsed
is written as ``status="UNKNOWN"`` with ``count=null`` and the reason goes to
stderr.  The output is a JSON array with one row per language so every figure in
``docs/EVIDENCE.md`` can be traced to a dated URL.

Usage::

    python scripts/fetch_labor_market.py --out docs/labor_market.json

Network access to ``hh.kz`` is required.  A single retry per language keeps the
run short while still tolerating one transient failure.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

SEARCH_TEMPLATE = "https://hh.kz/search/vacancy?text={query}"
USER_AGENT = "Mozilla/5.0"
TIMEOUT_SECONDS = 20
RETRY_DELAY_SECONDS = 2

# The query is intentionally "<language> разработчик" for every language: the
# methodology stays identical across rows and the raw query is stored in JSON.
LANGUAGE_QUERIES: tuple[tuple[str, str], ...] = (
    ("python", "Python разработчик"),
    ("javascript", "JavaScript разработчик"),
    ("typescript", "TypeScript разработчик"),
    ("java", "Java разработчик"),
    ("go", "Go разработчик"),
    ("csharp", "C# разработчик"),
    ("cpp", "C++ разработчик"),
    ("c", "C разработчик"),
    ("rust", "Rust разработчик"),
    ("ruby", "Ruby разработчик"),
    ("php", "PHP разработчик"),
    ("kotlin", "Kotlin разработчик"),
    ("swift", "Swift разработчик"),
)

# HH renders "Найдено 5 686 вакансий" and uses U+00A0/U+202F as separators.
COUNT_PATTERN = re.compile(
    r"Найдено[\s\u00a0\u202f]*([0-9][0-9\s\u00a0\u202f]*)[\s\u00a0\u202f]*ваканси",
)


def build_url(query: str) -> str:
    """Return the canonical, URL-encoded HH search URL stored in the report."""
    return SEARCH_TEMPLATE.format(query=urllib.parse.quote_plus(query))


def _fetch_once(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")


def parse_count(html: str) -> int | None:
    """Extract the first real ``Найдено N вакансий`` headline from the page."""
    match = COUNT_PATTERN.search(html)
    if match is None:
        return None
    digits = re.sub(r"\D", "", match.group(1))
    if not digits:
        return None
    return int(digits)


def fetch_language(language: str, query: str) -> dict[str, object]:
    """Fetch one language row, retrying once, and never inventing a count."""
    url = build_url(query)
    last_error = "unknown error"

    for attempt in range(2):
        try:
            html = _fetch_once(url)
            count = parse_count(html)
            if count is None:
                last_error = "no parseable 'Найдено N вакансий' headline"
            else:
                return {
                    "language": language,
                    "query": query,
                    "count": count,
                    "date": dt.date.today().isoformat(),
                    "url": url,
                    "status": "OK",
                }
        except (urllib.error.URLError, TimeoutError, OSError, UnicodeError) as exc:
            last_error = f"{type(exc).__name__}: {exc}"
        if attempt == 0:
            time.sleep(RETRY_DELAY_SECONDS)

    print(f"UNKNOWN {language}: {last_error}", file=sys.stderr)
    return {
        "language": language,
        "query": query,
        "count": None,
        "date": dt.date.today().isoformat(),
        "url": url,
        "status": "UNKNOWN",
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--out",
        type=Path,
        default=Path("docs/labor_market.json"),
        help="output JSON file (default: docs/labor_market.json)",
    )
    args = parser.parse_args(argv)

    rows = [fetch_language(language, query) for language, query in LANGUAGE_QUERIES]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps(rows, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    ok = sum(1 for row in rows if row["status"] == "OK")
    unknown = len(rows) - ok
    print(f"wrote {args.out} · {ok} OK · {unknown} UNKNOWN")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
