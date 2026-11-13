#!/usr/bin/env python3
"""Offline verifier for Merilo Skill Card manifests.

Usage::

    python scripts/verify_card.py --url https://HOST/api/cards/HASH/manifest
    python scripts/verify_card.py --file manifest.json
    python scripts/verify_card.py --file manifest.json --public-key merilo.pub

The input is either the API envelope (``{manifest, ed25519_signature,
public_key, valid}``) or a bare manifest carrying ``signature``/
``ed25519_signature`` and ``public_key``. ``--public-key`` pins the expected key
independently of the document, which is the strong verification mode.

Prints exactly ``VALID`` or ``INVALID`` on stdout and exits 0/1. This script
imports only :mod:`backend.signing` — never FastAPI, the database or app state —
so it works completely offline.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from backend.signing import verify_manifest  # noqa: E402

DEFAULT_TIMEOUT_SECONDS = 10.0


def _read_json(text: str, origin: str) -> dict[str, Any]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError(f"{origin} is not valid JSON") from exc
    if not isinstance(data, dict):
        raise ValueError(f"{origin} must contain a JSON object")
    return data


def _load_file(path: Path) -> dict[str, Any]:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc
    return _read_json(text, str(path))


def _load_url(url: str) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        text = response.read().decode(charset, errors="replace")
    return _read_json(text, url)


def _load_public_key(path: Path) -> str:
    """Accepts a raw base64url key or a JSON object with ``public_key``."""
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ValueError(f"cannot read {path}: {exc}") from exc
    if not text:
        raise ValueError(f"{path} is empty")
    if text.startswith("{"):
        data = _read_json(text, str(path))
        key = data.get("public_key")
        if not isinstance(key, str) or not key.strip():
            raise ValueError(f"{path} has no public_key field")
        return key.strip()
    return text.splitlines()[0].strip()


def _extract(payload: dict[str, Any]) -> tuple[Any, Any, Any]:
    """Normalises the envelope and bare-manifest shapes."""
    manifest = payload.get("manifest", payload)
    signature = payload.get("ed25519_signature") or payload.get("signature")
    public_key = payload.get("public_key")
    return manifest, signature, public_key


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Verify a Merilo Skill Card manifest offline (Ed25519)."
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--url", help="manifest endpoint or any URL returning the envelope")
    source.add_argument("--file", type=Path, help="local JSON envelope or bare manifest")
    parser.add_argument(
        "--public-key",
        type=Path,
        metavar="FILE",
        help="pin the expected base64url public key (raw text or JSON)",
    )
    args = parser.parse_args(argv)

    valid = False
    try:
        payload = _load_url(args.url) if args.url else _load_file(args.file)
        manifest, signature, embedded_key = _extract(payload)
        public_key = (
            _load_public_key(args.public_key) if args.public_key else embedded_key
        )
        if not isinstance(public_key, str) or not public_key.strip():
            raise ValueError("no public key in the document; pass --public-key FILE")
        valid = verify_manifest(manifest, signature, public_key)
    except (OSError, ValueError, TypeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        valid = False

    print("VALID" if valid else "INVALID")
    return 0 if valid else 1


if __name__ == "__main__":
    raise SystemExit(main())
