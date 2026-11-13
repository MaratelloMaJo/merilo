#!/usr/bin/env python
"""Cross-platform launcher for the Merilo demo stand.

Starts the single-port FastAPI app (REST API + static frontend) with uvicorn and
opens the browser once ``/api/health`` answers. No dependencies beyond uvicorn.

Usage::

    python scripts/run_demo.py                # http://127.0.0.1:8000
    python scripts/run_demo.py --port 9000
    python scripts/run_demo.py --reload       # dev auto-reload
    python scripts/run_demo.py --no-browser   # CI / headless

Environment:
    PORT            default port when ``--port`` is not given (default 8000)
    DEMO_HOST       default host when ``--host`` is not given (default 127.0.0.1)
"""

from __future__ import annotations

import argparse
import os
import sys
import threading
import time
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
HEALTH_TIMEOUT_SECONDS = 15.0
HEALTH_POLL_INTERVAL_SECONDS = 0.3


def _default_port() -> int:
    raw = os.getenv("PORT", "").strip()
    if raw.isdigit():
        return int(raw)
    return DEFAULT_PORT


def _default_host() -> str:
    return os.getenv("DEMO_HOST", "").strip() or DEFAULT_HOST


def _health_url(host: str, port: int) -> str:
    # 0.0.0.0 is a bind address, not a connectable one.
    probe_host = "127.0.0.1" if host in {"0.0.0.0", "::", ""} else host
    return f"http://{probe_host}:{port}/api/health"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Merilo demo (FastAPI + static frontend) on a single port.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--host", default=_default_host(), help="Bind host.")
    parser.add_argument("--port", type=int, default=_default_port(), help="Bind port (env PORT).")
    parser.add_argument(
        "--no-browser",
        action="store_true",
        help="Do not open the default browser.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable uvicorn auto-reload (development only).",
    )
    return parser


def _open_browser_when_ready(url: str, health_url: str, deadline_seconds: float) -> None:
    """Daemon thread: poll the health endpoint, then open the demo page."""
    deadline = time.monotonic() + deadline_seconds
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=1.0) as response:  # noqa: S310 - localhost only
                if response.status == 200:
                    print(f"[run_demo] Ready at {url}")
                    webbrowser.open(url)
                    return
        except (urllib.error.URLError, OSError, ValueError):
            pass
        time.sleep(HEALTH_POLL_INTERVAL_SECONDS)
    print(f"[run_demo] Server did not answer {health_url} within {deadline_seconds:.0f}s; open {url} manually.")


def main(argv: list[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)

    if str(REPO_ROOT) not in sys.path:
        sys.path.insert(0, str(REPO_ROOT))

    try:
        import uvicorn
    except ImportError:
        print(
            "[run_demo] uvicorn is not installed. Run: pip install -r requirements.txt",
            file=sys.stderr,
        )
        return 1

    url = f"http://{'127.0.0.1' if args.host in {'0.0.0.0', '::', ''} else args.host}:{args.port}/"
    health_url = _health_url(args.host, args.port)

    print(f"[run_demo] Starting backend.main:app on http://{args.host}:{args.port} (reload={args.reload})")
    print("[run_demo] No GEMINI_API_KEY/LLM_API_KEY? The demo still runs on the deterministic fallback engine.")

    if not args.no_browser:
        threading.Thread(
            target=_open_browser_when_ready,
            args=(url, health_url, HEALTH_TIMEOUT_SECONDS),
            name="open-browser",
            daemon=True,
        ).start()

    try:
        uvicorn.run(
            "backend.main:app",
            host=args.host,
            port=args.port,
            reload=args.reload,
            log_level="info",
        )
    except OSError as exc:
        print(
            f"[run_demo] Could not bind {args.host}:{args.port} ({exc}).\n"
            f"[run_demo] The port may already be in use - try another one: "
            f"python scripts/run_demo.py --port {args.port + 1}",
            file=sys.stderr,
        )
        return 1
    except KeyboardInterrupt:
        print("\n[run_demo] Stopped.")
        return 0

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
