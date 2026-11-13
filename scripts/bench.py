"""
Merilo — нагрузочный бенчмарк single-port монолита (только stdlib).

Три сценария:
  1. ``GET /api/health`` — латентность liveness-эндпоинта;
  2. ``POST /api/submissions/verify`` — полный 3-gate проход на ``preset_ideal``,
     который берётся из ``GET /api/tasks`` (код кандидата в скрипте не хардкодится);
  3. ``get_fallback_evaluation`` — чистый офлайн-эвристический оценщик,
     вызывается в процессе через ``import backend.fallback_cache`` (без HTTP).

Примеры:

    # локальный сервер на 8000, 20 замеров + 3 прогрева на сценарий
    python scripts/bench.py

    # лимит verify по умолчанию 20 req/60s — для бенчмарка его надо поднять
    RATE_LIMIT_MAX_REQUESTS=1000 python scripts/bench.py --requests 20
    # PowerShell: $env:RATE_LIMIT_MAX_REQUESTS=1000; python scripts/bench.py --requests 20

    # упавший деплой на Render
    python scripts/bench.py --base-url https://merilo.onrender.com --requests 10

    # машинный вывод для CI
    python scripts/bench.py --requests 10 --json

Замечания:
  * ``--warmup`` тоже расходует бюджет rate limit: ``requests + warmup`` не должно
    превышать ``RATE_LIMIT_MAX_REQUESTS`` за окно, иначе полетят 429.
  * verify пишет submission в SQLite — это ожидаемо. Кандидат всегда ``bench-runner``,
    чтобы не засорять демо-карточки; одинаковый код даёт тот же ``card_hash``.
  * Код возврата 1 — если хотя бы в одном запущенном сценарии все запросы упали
    (сеть/таймауты/HTTP-ошибки). 429 сам по себе код возврата не меняет.
"""

from __future__ import annotations

import argparse
import contextlib
import io
import json
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

DEFAULT_BASE_URL = "http://127.0.0.1:8000"
DEFAULT_TASK_ID = "task-fintech-01"
DEFAULT_TIMEOUT = 30.0
BENCH_CANDIDATE = "bench-runner"
USER_AGENT = "merilo-bench/1.0"

REPO_ROOT = Path(__file__).resolve().parents[1]


# =============================================================================
# Замеры и статистика
# =============================================================================

class Scenario:
    """Накопитель замеров одного сценария: успешные латентности + счётчики ошибок."""

    def __init__(self, operation: str) -> None:
        self.operation = operation
        self.samples: list[float] = []
        self.errors = 0
        self.rate_limited = 0

    @property
    def attempts(self) -> int:
        return len(self.samples) + self.errors

    def record(self, elapsed_ms: float) -> None:
        self.samples.append(elapsed_ms)

    def fail(self, rate_limited: bool = False) -> None:
        self.errors += 1
        if rate_limited:
            self.rate_limited += 1

    def percentile(self, percent: int) -> float | None:
        """Percentile методом ближайшего ранга: реальное значение из выборки."""
        if not self.samples:
            return None
        ordered = sorted(self.samples)
        rank = -(-percent * len(ordered) // 100)  # ceil(percent * n / 100) без float
        return ordered[min(max(rank, 1), len(ordered)) - 1]

    def summary(self) -> dict:
        samples = self.samples
        return {
            "operation": self.operation,
            "n": len(samples),
            "attempts": self.attempts,
            "p50_ms": _round(self.percentile(50)),
            "p95_ms": _round(self.percentile(95)),
            "mean_ms": _round(statistics.mean(samples)) if samples else None,
            "min_ms": _round(min(samples)) if samples else None,
            "max_ms": _round(max(samples)) if samples else None,
            "errors": self.errors,
            "rate_limited": self.rate_limited,
        }


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 2)


# =============================================================================
# HTTP
# =============================================================================

def http_call(
    url: str,
    payload: dict | None = None,
    timeout: float = DEFAULT_TIMEOUT,
) -> tuple[float, int, bytes]:
    """
    Выполняет один запрос и возвращает ``(elapsed_ms, status, body)``.

    HTTP-ошибки (4xx/5xx) не поднимаются исключением: нужен и статус, и время.
    Сетевые сбои (URLError/OSError/таймаут) пробрасываются вызывающему коду.
    """
    data = None
    headers = {"Accept": "application/json", "User-Agent": USER_AGENT}
    if payload is not None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method="POST" if data is not None else "GET",
    )

    started_at = time.perf_counter()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read()
            status = response.status
    except urllib.error.HTTPError as exc:  # сервер ответил, но с ошибкой
        body = exc.read()
        return (time.perf_counter() - started_at) * 1000.0, exc.code, body
    return (time.perf_counter() - started_at) * 1000.0, status, body


NETWORK_ERRORS = (urllib.error.URLError, TimeoutError, OSError)


def run_http_scenario(
    scenario: Scenario,
    url: str,
    payload: dict | None = None,
    requests: int = 0,
    warmup: int = 0,
    timeout: float = DEFAULT_TIMEOUT,
) -> None:
    """Выполняет прогревы (без учёта) и замеры (с учётом) одного HTTP-сценария."""
    for _ in range(warmup):
        try:
            http_call(url, payload, timeout)
        except NETWORK_ERRORS:
            pass

    for _ in range(requests):
        try:
            elapsed_ms, status, _body = http_call(url, payload, timeout)
        except NETWORK_ERRORS:
            scenario.fail()
            continue

        if status == 429:
            scenario.fail(rate_limited=True)
        elif status >= 400:
            scenario.fail()
        else:
            scenario.record(elapsed_ms)


# =============================================================================
# Данные для verify (без хардкода кода кандидата)
# =============================================================================

def fetch_tasks(base_url: str, timeout: float) -> list[dict]:
    """``GET /api/tasks`` -> список микро-кейсов (кидает исключение при сбое)."""
    _elapsed_ms, status, body = http_call(f"{base_url}/api/tasks", timeout=timeout)
    if status >= 400:
        raise RuntimeError(f"GET /api/tasks -> HTTP {status}")
    try:
        tasks = json.loads(body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RuntimeError(f"GET /api/tasks вернул не-JSON: {type(exc).__name__}") from exc
    if not isinstance(tasks, list) or not tasks:
        raise RuntimeError("GET /api/tasks вернул не список")
    return tasks


def preset_from_tasks(tasks: list[dict], task_id: str) -> str:
    """Достаёт ``preset_ideal`` нужного кейса; ValueError, если кейса нет."""
    for task in tasks:
        if task.get("id") == task_id:
            code = task.get("preset_ideal") or ""
            if not code.strip():
                raise ValueError(f"у задачи {task_id} пустой preset_ideal")
            return code
    available = ", ".join(str(task.get("id")) for task in tasks)
    raise ValueError(f"задача {task_id} не найдена. Доступные: {available}")


def _ensure_repo_root_on_path() -> None:
    root = str(REPO_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


def local_preset(task_id: str) -> str | None:
    """
    ``preset_ideal`` из ``backend.seed_data`` — офлайн-источник для режима fallback.

    Возвращает None, если импорт недоступен (например, ``MERILO_ENV=production``
    без ``MERILO_HMAC_SECRET``: backend.db падает на старте по задумке).
    Предупреждение backend.db про эфемерный секрет на время импорта глушится:
    бенчмарк ничего не подписывает, а шум в отчёте только мешает.
    """
    _ensure_repo_root_on_path()
    try:
        with contextlib.redirect_stderr(io.StringIO()):
            from backend.seed_data import SEED_TASKS
    except Exception:  # noqa: BLE001 - импорт не должен ронять бенчмарк
        return None
    for task in SEED_TASKS:
        if task.get("id") == task_id:
            return task.get("preset_ideal") or None
    return None


def load_fallback_evaluator():
    """Импортирует ``get_fallback_evaluation`` в текущий процесс (без HTTP)."""
    _ensure_repo_root_on_path()
    from backend.fallback_cache import get_fallback_evaluation

    return get_fallback_evaluation


# =============================================================================
# Вывод
# =============================================================================

def format_table(summaries: list[dict]) -> str:
    """Таблица «операция | n | p50 ms | p95 ms | errors»."""
    op_width = min(max([len("операция")] + [len(item["operation"]) for item in summaries]), 44)
    lines = [
        f"{'операция':<{op_width}} | {'n':>3} | {'p50 ms':>7} | {'p95 ms':>7} | {'errors':>6}",
        f"{'-' * op_width}-+-{'-' * 3}-+-{'-' * 7}-+-{'-' * 7}-+-{'-' * 6}",
    ]
    for item in summaries:
        p50 = "—" if item["p50_ms"] is None else f"{item['p50_ms']:.2f}"
        p95 = "—" if item["p95_ms"] is None else f"{item['p95_ms']:.2f}"
        lines.append(
            f"{item['operation'][:op_width]:<{op_width}} | {item['n']:>3} | {p50:>7} | {p95:>7} | {item['errors']:>6}"
        )
    return "\n".join(lines)


def format_details(summaries: list[dict]) -> str:
    """min / max / mean по сценариям (для успешных замеров)."""
    lines = ["", "детали (мс, только успешные ответы):"]
    for item in summaries:
        if not item["n"]:
            lines.append(f"  {item['operation']}: нет успешных замеров (ошибок: {item['errors']})")
            continue
        lines.append(
            f"  {item['operation']}: mean={item['mean_ms']:.2f} min={item['min_ms']:.2f} max={item['max_ms']:.2f}"
        )
    return "\n".join(lines)


def collect_warnings(summaries: list[dict], skipped: list[str]) -> list[str]:
    warnings: list[str] = []
    limited = sum(item["rate_limited"] for item in summaries)
    if limited:
        warnings.append(
            f"получено 429-ответов: {limited} — поднимите RATE_LIMIT_MAX_REQUESTS "
            f"(нужно не меньше requests + warmup) и повторите замер"
        )
    failed_all = [item["operation"] for item in summaries if item["attempts"] and not item["n"]]
    if failed_all:
        warnings.append("все запросы упали: " + ", ".join(failed_all))
    warnings.extend(skipped)
    return warnings


# =============================================================================
# CLI
# =============================================================================

def configure_stdio() -> None:
    """
    Консоль Windows по умолчанию cp1252 и падает на кириллице (UnicodeEncodeError).
    Переключаем stdout/stderr на UTF-8; ``errors="replace"`` гарантирует, что
    печать отчёта никогда не уронит бенчмарк.
    """
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8", errors="replace")
        except (LookupError, ValueError, OSError):
            continue


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="bench.py",
        description="Нагрузочный бенчмарк Merilo: p50/p95 для health, verify и офлайн-fallback.",
        epilog=(
            "Пример: RATE_LIMIT_MAX_REQUESTS=1000 python scripts/bench.py --requests 20 "
            "(PowerShell: $env:RATE_LIMIT_MAX_REQUESTS=1000; ...)"
        ),
    )
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"адрес сервера (по умолчанию {DEFAULT_BASE_URL})")
    parser.add_argument("--requests", type=int, default=20, help="замеров на сценарий (по умолчанию 20)")
    parser.add_argument(
        "--warmup", type=int, default=3, help="прогревов на сценарий, не учитываются (по умолчанию 3)"
    )
    parser.add_argument(
        "--task-id",
        default=DEFAULT_TASK_ID,
        help=f"id микро-задачи для verify (по умолчанию {DEFAULT_TASK_ID})",
    )
    parser.add_argument("--mode", choices=("fallback", "http", "all"), default="all", help="какие сценарии гонять")
    parser.add_argument(
        "--timeout", type=float, default=DEFAULT_TIMEOUT, help="таймаут запроса, секунды (по умолчанию 30)"
    )
    parser.add_argument("--json", action="store_true", help="машинный вывод (без таблицы)")
    return parser


def main(argv: list[str] | None = None) -> int:
    configure_stdio()
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.requests < 1:
        parser.error("--requests должен быть >= 1")
    if args.warmup < 0:
        parser.error("--warmup должен быть >= 0")

    base_url = args.base_url.rstrip("/")
    summaries: list[dict] = []
    skipped: list[str] = []

    # --- 1. HTTP: health (+ verify) ------------------------------------------
    code_for_verify: str | None = None
    tasks_error: str | None = None

    if args.mode in ("http", "all"):
        try:
            tasks = fetch_tasks(base_url, args.timeout)
            code_for_verify = preset_from_tasks(tasks, args.task_id)
        except ValueError as exc:
            tasks_error = f"verify-сценарий пропущен: {exc}"
        except (RuntimeError, *NETWORK_ERRORS) as exc:
            tasks_error = f"GET /api/tasks недоступен ({type(exc).__name__}: {exc}) — verify-сценарий пропущен"

    if args.mode in ("http", "all"):
        health = Scenario("GET /api/health")
        run_http_scenario(
            health,
            f"{base_url}/api/health",
            requests=args.requests,
            warmup=args.warmup,
            timeout=args.timeout,
        )
        summaries.append(health.summary())

    if args.mode in ("http", "all") and code_for_verify:
        verify = Scenario("POST /api/submissions/verify")
        payload = {
            "task_id": args.task_id,
            "submitted_code": code_for_verify,
            "candidate_name": BENCH_CANDIDATE,
        }
        run_http_scenario(
            verify,
            f"{base_url}/api/submissions/verify",
            payload=payload,
            requests=args.requests,
            warmup=args.warmup,
            timeout=args.timeout,
        )
        summaries.append(verify.summary())

    if tasks_error:
        skipped.append(tasks_error)

    # --- 2. Fallback в процессе (без HTTP) ----------------------------------
    fallback_skipped: str | None = None
    if args.mode in ("fallback", "all"):
        if code_for_verify is None:
            code_for_verify = local_preset(args.task_id)

        evaluator = None
        import_error: str | None = None
        try:
            evaluator = load_fallback_evaluator()
        except Exception as exc:  # noqa: BLE001 - сообщаем, а не падаем стектрейсом
            import_error = f"{type(exc).__name__}: {exc}"

        if evaluator is None:
            fallback_skipped = f"fallback недоступен: импорт backend.fallback_cache упал ({import_error})"
        elif not code_for_verify:
            fallback_skipped = f"fallback пропущен: нет кода для задачи {args.task_id} (ни HTTP, ни seed_data)"
        else:
            fallback = Scenario("fallback::get_fallback_evaluation")
            submitted_code = code_for_verify
            for _ in range(args.warmup):
                try:
                    evaluator(args.task_id, submitted_code)
                except Exception:  # noqa: BLE001 - прогрев не влияет на результат
                    pass
            for _ in range(args.requests):
                started_at = time.perf_counter()
                try:
                    evaluator(args.task_id, submitted_code)
                except Exception:  # noqa: BLE001 - единичный сбой не рушит бенчмарк
                    fallback.fail()
                    continue
                fallback.record((time.perf_counter() - started_at) * 1000.0)
            summaries.append(fallback.summary())

    if fallback_skipped:
        skipped.append(fallback_skipped)

    warnings = collect_warnings(summaries, skipped)

    # --- 3. Вывод -----------------------------------------------------------
    if args.json:
        print(
            json.dumps(
                {
                    "base_url": base_url,
                    "task_id": args.task_id,
                    "requests": args.requests,
                    "warmup": args.warmup,
                    "mode": args.mode,
                    "results": summaries,
                    "warnings": warnings,
                },
                ensure_ascii=False,
                indent=2,
            )
        )
    else:
        target = base_url if args.mode != "fallback" else "in-process (без HTTP)"
        print(f"Merilo bench → {target} (task: {args.task_id}, requests: {args.requests}, warmup: {args.warmup})")
        print()
        if summaries:
            print(format_table(summaries))
            print(format_details(summaries))
        else:
            print("нет ни одного сценария — нечего измерять")
        for warning in warnings:
            print(f"\n! {warning}")

    all_failed = any(item["attempts"] and not item["n"] for item in summaries)
    if all_failed:
        return 1
    if not summaries:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
