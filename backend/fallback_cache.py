"""
Merilo — Deterministic Offline Fallback & Evaluation Cache
=========================================================

The fallback is deliberately *honest*: it never returns hardcoded "ideal" scores.
Every number is derived from the submitted AST plus a small set of textual
patterns, so two materially different submissions can never receive the same
canned 98/95/96 report.

Scoring scale
-------------
The three rubric dimensions start from a neutral anchor (58 / 56 / 52) and move
only in response to evidence found in the submission: a module or function
docstring, type annotations, decomposition into helpers, exception handling,
explicit ``raise`` statements, parameterised SQL, hashed de-duplication,
immutable defaults, boundary validation, non-mutating input handling, and so on.
Nothing is awarded for practices the code does not actually contain, and every
deduction points at a concrete defect that is also named in the summary.

The additive weights are calibrated so that a submission which genuinely covers
the whole practice set — documentation, typing, decomposition, error handling,
parameterisation and boundary checks — lands in the 86–92 band, i.e. Gold on the
85 threshold, while a submission that repeats the seeded defects (f-string SQL,
mutating defaults, O(N²) scans, missing validation) lands in the 35–65 band and
is reported as Needs Work. A fragment without executable logic (empty file,
comments only, ``pass``/``...`` stubs) is pinned near zero because there is
nothing to assess.

Because the rules are additive and code-derived, the score remains a function of
the code: different code yields different numbers, and identical code always
yields identical numbers (the only variance is a SHA-256-derived jitter of
±2 points). The verdict is explicitly labelled ``low`` confidence — it is a
deterministic heuristic, not a model judgement, and the summary always says so.

The module also holds a small in-process TTL cache for real Gemini responses.
Cache keys are SHA-256 of ``task_id + model + submitted_code``. The cache is
process-local by design: the demo runs as a single-port monolith, and a restart
must not resurrect stale model output.
"""

from __future__ import annotations

import ast
import hashlib
import os
import re
import sqlite3
import threading
import time
from typing import Optional

from backend.languages import (
    SUPPORTED_LANGUAGES,
    analysis_source,
    analyze_code,
    language_label,
)
from backend.schemas import CodeEvaluationResponse

# -----------------------------------------------------------------------------
# Prompt-injection / rule-bypass signatures (defence in depth).
#
# Gate 2 in verifier.py runs exactly this check before code ever reaches an LLM.
# The signatures describe *directives*, never vocabulary: an honest docstring may
# legitimately mention a "system prompt", an "extraction prompt" or even the term
# "prompt injection" while documenting an LLM gateway, and that must not be
# punished. Only an imperative that tries to steer the grader matches: nullify
# its rules, hard-set a rubric field, demand a score, or hijack its role.
#
# Each entry is ``(rule name, pattern)``; the rule names document *why* a
# submission is blocked and are handy when tuning the shield.
# -----------------------------------------------------------------------------
_INJECTION_RULES: tuple[tuple[str, str], ...] = (
    # 1. Nullify the grader's own instructions / rubric.
    (
        "nullify_prior_instructions",
        r"(?:ignore|disregard|forget|discard)\s+"
        r"(?:all\s+|any\s+)?(?:of\s+)?(?:the\s+|your\s+)?"
        r"(?:previous|prior|above|earlier|preceding|system|initial)\s+"
        r"(?:instructions?|prompts?|messages?|rules?|directions?|guidelines?|rubrics?)",
    ),
    (
        "disregard_prior_context",
        r"(?:ignore|disregard|forget)\s+(?:all\s+)?(?:of\s+)?(?:the\s+|everything\s+)?"
        r"(?:above|previous|prior)\b"
        r"(?:\s*(?:[.!:;]|$)|(?=\s+(?:and|then|now)\b))",
    ),
    # 2. Override the evaluator itself.
    (
        "override_grader",
        r"(?:override|overrule)\s+(?:the\s+|your\s+|any\s+)?"
        r"(?:system|evaluation|grading|grader|rubric|scoring)\b",
    ),
    ("system_override", r"(?:system|developer)\s+override\b"),
    # 3. A fresh directive block injected into the context.
    ("new_instructions", r"new\s+(?:system\s+)?instructions?\s*:"),
    # 4. Imperatives that demand a score.
    (
        "award_score",
        r"award\s+(?:a\s+|an\s+|the\s+)?"
        r"(?:perfect|maximum|max|full|top|100)\s+(?:score|points?|marks?)",
    ),
    (
        "demand_perfect_score",
        r"\b(?:give|grant|assign|award|return|output|set|score|rate)\s+"
        r"(?:me\s+|the\s+candidate\s+|him\s+|her\s+)?(?:a\s+)?"
        r"(?:perfect|maximum|max|full)\s+(?:score|points?|marks?)",
    ),
    (
        "demand_100_points",
        r"\b(?:give|grant|assign|award|return|output|set|score)\s+"
        r"(?:me\s+|the\s+candidate\s+)?(?:a\s+)?100\s*(?:points?|score|marks?)\b",
    ),
    (
        "must_give_100",
        r"you\s+must\s+(?:always\s+)?(?:give|return|output|award|assign|score|rate)\s+"
        r"(?:me\s+|the\s+candidate\s+)?(?:a\s+)?(?:perfect\s+|maximum\s+|full\s+)?"
        r"(?:100\b|perfect\b)",
    ),
    # 5. Rubric fields hard-set to a perfect value.
    (
        "rubric_field_100",
        r"\b(?:clean_code|architecture|edge_cases|total_score)\b[\"']?\s*[:=]\s*100\b",
    ),
    ("score_100", r"\bscore\b[\"']?\s*[:=]\s*100\b"),
    (
        "imperative_100_of_100",
        r"\b(?:give|grant|award|return|output|set|score)\s+"
        r"(?:me\s+|the\s+candidate\s+)?(?:a\s+)?100\s*/\s*100\b",
    ),
    # 6. Role hijack: turn the evaluator into something it is not.
    (
        "role_hijack_you_are",
        r"\byou\s+are\s+(?:now\s+)?(?:a|an|the)\s+"
        r"(?:admin|administrator|evaluator|grader|system|developer|root|jailbroken)\b",
    ),
    (
        "role_hijack_act_as",
        r"\bact\s+as\s+(?:a|an|the)\s+"
        r"(?:admin|administrator|evaluator|grader|system|developer|root|jailbroken)\b",
    ),
    # 7. Known bypass framings (a negated "never/not bypass" is documentation).
    (
        "bypass_rules",
        r"(?<!never )(?<!not )\bbypass\s+(?:the\s+|all\s+|any\s+)?"
        r"(?:security|rules?|filters?|guardrails?|verification|checks?|shield)\b",
    ),
    ("attention_ignore", r"\b(?:attention|note)\s*:\s*(?:ignore|disregard)\b"),
)

INJECTION_KEYWORDS = re.compile(
    "|".join(f"(?:{pattern})" for _, pattern in _INJECTION_RULES),
    re.IGNORECASE,
)

# Calls that are unsafe to execute inside an automated grader, even in a demo.
_DANGEROUS_CALLS = {
    "eval",
    "exec",
    "compile",
    "__import__",
    "globals",
    "locals",
    "breakpoint",
    "input",
}

# --- Scale anchors -----------------------------------------------------------
# Neutral starting points. A submission with no evidence at all is "average at
# best"; the practice bonuses below are what lift a complete solution to Gold.
BASE_CLEAN = 58
BASE_ARCH = 56
BASE_EDGE = 52

# Ceiling per dimension. A single dimension is never allowed to claim a
# near-perfect score on its own, so the weighted total still needs breadth.
SCORE_CAP = 96

# Below this many executable logic nodes there is simply nothing to assess.
_MIN_LOGIC_NODES = 2

# Grade words used in the executive summary (kept aligned with the badge tiers).
_STRONG_GRADE = 80
_MEDIUM_GRADE = 60

# Behaviour that changes a caller-owned container (a real source of aliasing bugs).
_MUTATING_METHODS = {
    "append",
    "extend",
    "insert",
    "remove",
    "pop",
    "clear",
    "sort",
    "reverse",
    "update",
    "add",
    "discard",
    "setdefault",
    "popitem",
}

# Annotations that imply the parameter is a caller-owned collection.
_CONTAINER_ANNOTATIONS = {
    "list",
    "dict",
    "set",
    "tuple",
    "frozenset",
    "deque",
    "Deque",
    "Sequence",
    "MutableSequence",
    "Mapping",
    "MutableMapping",
    "Iterable",
    "Iterator",
    "Collection",
}

_LOGIC_NODES = (
    ast.Call,
    ast.If,
    ast.For,
    ast.AsyncFor,
    ast.While,
    ast.Try,
    ast.Raise,
    ast.Return,
    ast.Assign,
    ast.AnnAssign,
    ast.AugAssign,
    ast.BinOp,
    ast.Compare,
    ast.With,
    ast.AsyncWith,
    ast.Yield,
    ast.YieldFrom,
    ast.ListComp,
    ast.DictComp,
    ast.SetComp,
    ast.GeneratorExp,
)

_CACHE_LOCK = threading.Lock()
_CACHE: dict[str, tuple[float, CodeEvaluationResponse]] = {}
_DEFAULT_CACHE_TTL = float(os.getenv("MERILO_EVAL_CACHE_TTL", "3600"))


# =============================================================================
# TTL cache for real Gemini evaluations
# =============================================================================

def evaluation_cache_key(task_id: str, submitted_code: str, model: str, language: str | None = None) -> str:
    """Stable cache key: task + model + exact submitted code (+ optional language).

    ``language`` is omitted from the payload when it is ``None`` so keys produced
    before multilingual support keep working unchanged.
    """
    digest = hashlib.sha256(submitted_code.encode("utf-8", errors="replace")).hexdigest()
    suffix = f":{language}" if language else ""
    return f"{task_id}:{model}:{digest}{suffix}"


def get_cached_evaluation(key: str) -> Optional[CodeEvaluationResponse]:
    """Return a defensive copy of a cached evaluation, or None when expired."""
    now = time.monotonic()
    with _CACHE_LOCK:
        entry = _CACHE.get(key)
        if not entry:
            return None
        expires_at, evaluation = entry
        if expires_at <= now:
            _CACHE.pop(key, None)
            return None
        return evaluation.model_copy(deep=True)


def set_cached_evaluation(
    key: str,
    evaluation: CodeEvaluationResponse,
    ttl: Optional[float] = None,
) -> None:
    """Store a real model evaluation for a bounded amount of time."""
    lifetime = _DEFAULT_CACHE_TTL if ttl is None else float(ttl)
    if lifetime <= 0:
        return
    with _CACHE_LOCK:
        _CACHE[key] = (time.monotonic() + lifetime, evaluation.model_copy(deep=True))


def clear_evaluation_cache() -> None:
    """Test/ops helper: drop all cached evaluations."""
    with _CACHE_LOCK:
        _CACHE.clear()


# =============================================================================
# AST helpers
# =============================================================================

def _call_name(node: ast.Call) -> str:
    """``len`` for ``len(x)``, ``isfinite`` for ``math.isfinite(x)``."""
    func = node.func
    if isinstance(func, ast.Name):
        return func.id
    if isinstance(func, ast.Attribute):
        return func.attr
    return ""


def _all_args(args: ast.arguments) -> list[ast.arg]:
    """Positional, keyword-only, ``*args`` and ``**kwargs`` parameters."""
    collected = [*args.posonlyargs, *args.args, *args.kwonlyargs]
    if args.vararg is not None:
        collected.append(args.vararg)
    if args.kwarg is not None:
        collected.append(args.kwarg)
    return collected


def _functions(tree: ast.AST) -> list[ast.FunctionDef | ast.AsyncFunctionDef]:
    node_types = (ast.FunctionDef, ast.AsyncFunctionDef)
    return [node for node in ast.walk(tree) if isinstance(node, node_types)]


def _docstring_present(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            if ast.get_docstring(node):
                return True
    return False


def _has_type_hints(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.returns is not None:
                return True
            if any(arg.annotation is not None for arg in _all_args(node.args)):
                return True
        if isinstance(node, ast.AnnAssign):
            return True
    return False


def _has_future_annotations(tree: ast.AST) -> bool:
    """``from __future__ import annotations`` — modern typing practice."""
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom) and node.module == "__future__":
            if any(alias.name == "annotations" for alias in node.names):
                return True
    return False


def _bare_except_count(tree: ast.AST) -> int:
    return sum(
        1
        for node in ast.walk(tree)
        if isinstance(node, ast.ExceptHandler) and node.type is None
    )


def _try_count(tree: ast.AST) -> int:
    return sum(1 for node in ast.walk(tree) if isinstance(node, ast.Try))


def _with_count(tree: ast.AST) -> int:
    return sum(1 for node in ast.walk(tree) if isinstance(node, (ast.With, ast.AsyncWith)))


def _raise_count(tree: ast.AST) -> int:
    return sum(1 for node in ast.walk(tree) if isinstance(node, ast.Raise))


def _function_count(tree: ast.AST) -> int:
    return len(_functions(tree))


def _class_count(tree: ast.AST) -> int:
    return sum(1 for node in ast.walk(tree) if isinstance(node, ast.ClassDef))


def _logic_node_count(tree: ast.AST) -> int:
    """Number of nodes that represent actual behaviour (not ``pass``/docstrings)."""
    count = 0
    for node in ast.walk(tree):
        if not isinstance(node, _LOGIC_NODES):
            continue
        if isinstance(node, ast.Return) and node.value is None:
            continue
        count += 1
    return count


def _has_mutable_default(tree: ast.AST) -> bool:
    for node in _functions(tree):
        for default in list(node.args.defaults) + list(node.args.kw_defaults):
            if isinstance(default, (ast.List, ast.Dict, ast.Set, ast.ListComp, ast.DictComp, ast.SetComp)):
                return True
    return False


def _has_none_default(tree: ast.AST) -> bool:
    for node in _functions(tree):
        for default in node.args.defaults + node.args.kw_defaults:
            if isinstance(default, ast.Constant) and default.value is None:
                return True
    return False


def _has_isinstance_check(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and _call_name(node) == "isinstance":
            return True
    return False


def _has_finite_guard(tree: ast.AST) -> bool:
    """NaN/Inf guard: ``math.isfinite``, ``isnan`` or ``isinf``."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Call) and _call_name(node) in {"isfinite", "isnan", "isinf"}:
            return True
    return False


def _has_generator(tree: ast.AST) -> bool:
    return any(isinstance(node, (ast.Yield, ast.YieldFrom)) for node in ast.walk(tree))


def _annotation_mentions(annotation: ast.expr | None, names: set[str]) -> bool:
    if annotation is None:
        return False
    for node in ast.walk(annotation):
        if isinstance(node, ast.Name) and node.id in names:
            return True
        if isinstance(node, ast.Attribute) and node.attr in names:
            return True
    return False


def _annotated_container_params(tree: ast.AST) -> int:
    """Count parameters explicitly annotated with a collection type."""
    count = 0
    for node in _functions(tree):
        for arg in _all_args(node.args):
            if _annotation_mentions(arg.annotation, _CONTAINER_ANNOTATIONS):
                count += 1
    return count


def _allows_none_annotation(annotation: ast.expr | None) -> bool:
    """``X | None``, ``Optional[X]`` or a bare ``None`` default type."""
    if annotation is None:
        return False
    for node in ast.walk(annotation):
        if isinstance(node, ast.Constant) and node.value is None:
            return True
        if isinstance(node, ast.Name) and node.id == "Optional":
            return True
    return False


def _optional_param_count(tree: ast.AST) -> int:
    return sum(
        1
        for node in _functions(tree)
        for arg in _all_args(node.args)
        if _allows_none_annotation(arg.annotation)
    )


def _mutated_params(tree: ast.AST) -> set[str]:
    """Parameters the function mutates (``p.append``, ``p[k] = v``, …)."""
    mutated: set[str] = set()
    for node in _functions(tree):
        params = {arg.arg for arg in _all_args(node.args)}
        for inner in ast.walk(node):
            if isinstance(inner, ast.Call) and isinstance(inner.func, ast.Attribute):
                owner = inner.func.value
                if isinstance(owner, ast.Name) and owner.id in params:
                    if inner.func.attr in _MUTATING_METHODS:
                        mutated.add(owner.id)
            elif isinstance(inner, ast.Assign):
                for target in inner.targets:
                    if isinstance(target, ast.Subscript) and isinstance(target.value, ast.Name):
                        if target.value.id in params:
                            mutated.add(target.value.id)
    return mutated


def _guard_names(test: ast.expr) -> set[str]:
    """Names a condition proves to be present (``not x``, ``x is not None``, ``len(x)``)."""
    names: set[str] = set()
    for node in ast.walk(test):
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.Not):
            names |= {inner.id for inner in ast.walk(node.operand) if isinstance(inner, ast.Name)}
        elif isinstance(node, ast.Compare):
            comparator_ops = node.ops
            if isinstance(node.left, ast.Call) and _call_name(node.left) == "len":
                names |= {inner.id for inner in ast.walk(node.left) if isinstance(inner, ast.Name)}
                if any(
                    isinstance(item, ast.Constant) and item.value == 0
                    for item in node.comparators
                ):
                    continue
            if any(isinstance(op, (ast.IsNot, ast.NotEq, ast.Gt, ast.GtE)) for op in comparator_ops):
                names |= {inner.id for inner in ast.walk(node) if isinstance(inner, ast.Name)}
    return names


def _name_origins(function: ast.AST) -> dict[str, set[str]]:
    """Shallow provenance: which names feed each local assignment."""
    origins: dict[str, set[str]] = {}
    for node in ast.walk(function):
        if isinstance(node, ast.Assign):
            used = {inner.id for inner in ast.walk(node.value) if isinstance(inner, ast.Name)}
            for target in node.targets:
                if isinstance(target, ast.Name):
                    origins.setdefault(target.id, set()).update(used)
    return origins


def _division_guard_status(tree: ast.AST) -> Optional[bool]:
    """
    ``None`` when the code never divides by ``len(...)``, otherwise whether every
    such division is dominated by a guard on the collection being measured.
    """
    verdicts: list[bool] = []
    for function in _functions(tree):
        origins = _name_origins(function)
        for node in ast.walk(function):
            if not isinstance(node, ast.BinOp) or not isinstance(node.op, ast.Div):
                continue
            divisor = node.right
            if not isinstance(divisor, ast.Call) or _call_name(divisor) != "len":
                continue
            measured = {inner.id for inner in ast.walk(divisor) if isinstance(inner, ast.Name)}
            measured.discard("len")
            relevant = set(measured)
            for name in measured:
                relevant |= origins.get(name, set())

            guarded = False
            for candidate in ast.walk(function):
                if not isinstance(candidate, ast.If) or candidate.lineno > node.lineno:
                    continue
                if _guard_names(candidate.test) & relevant:
                    guarded = True
                    break
            verdicts.append(guarded)
    if not verdicts:
        return None
    return all(verdicts)


_SQL_KEYWORDS = re.compile(r"(?i)\b(SELECT|INSERT|UPDATE|DELETE)\b")
_SQL_PLACEHOLDER = re.compile(r"\?|%s|%\(\w+\)s|:\w+")


def _string_literals(node: ast.expr) -> list[str]:
    """Constant string fragments of an expression (f-strings contribute literals only)."""
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return [node.value]
    if isinstance(node, ast.JoinedStr):
        return [
            part.value
            for part in node.values
            if isinstance(part, ast.Constant) and isinstance(part.value, str)
        ]
    if isinstance(node, ast.BinOp):
        return _string_literals(node.left) + _string_literals(node.right)
    return []


def _sql_signals(tree: ast.AST) -> tuple[bool, bool, bool]:
    """
    ``(has_sql, parameterized, interpolated)`` for every ``execute``-style call.

    Everything is read from the AST, so SQL mentioned in a comment or docstring
    can never earn — or lose — points.
    """
    has_sql = False
    parameterized = False
    interpolated = False
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
            continue
        if node.func.attr not in {"execute", "executemany", "executescript"}:
            continue
        if not node.args:
            continue
        query = node.args[0]
        text = " ".join(_string_literals(query))
        if not _SQL_KEYWORDS.search(text):
            continue
        has_sql = True
        if isinstance(query, (ast.JoinedStr, ast.BinOp)):
            interpolated = True
        elif _SQL_PLACEHOLDER.search(text) and len(node.args) > 1:
            parameterized = True
    return has_sql, parameterized, interpolated


def _has_empty_guard(tree: ast.AST) -> bool:
    """``if not x`` / ``if len(x) == 0`` / ``if x == []`` style boundary guard."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        for part in ast.walk(node.test):
            if isinstance(part, ast.UnaryOp) and isinstance(part.op, ast.Not):
                return True
            if isinstance(part, ast.Compare):
                if isinstance(part.left, ast.Call) and _call_name(part.left) == "len":
                    if any(
                        isinstance(item, ast.Constant) and item.value == 0
                        for item in part.comparators
                    ):
                        return True
            if isinstance(part, ast.Constant) and isinstance(part.value, (list, dict, tuple)):
                if not part.value:
                    return True
    return False


def _validates_positive_amount(tree: ast.AST) -> bool:
    """``if amount <= 0: raise/return`` — the transfer-specific boundary check."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.If):
            continue
        for part in ast.walk(node.test):
            if not isinstance(part, ast.Compare):
                continue
            sides = [part.left, *part.comparators]
            mentions_amount = any(_annotation_mentions(side, {"amount"}) for side in sides)
            compares_zero = any(
                isinstance(side, ast.Constant) and side.value == 0 and not isinstance(side.value, bool)
                for side in sides
            )
            ordered = any(isinstance(op, (ast.Lt, ast.LtE, ast.Gt, ast.GtE)) for op in part.ops)
            if mentions_amount and compares_zero and ordered:
                return True
    return False


def _has_ordered_dedupe(tree: ast.AST, code: str) -> bool:
    """
    Order-preserving single-pass de-duplication: a ``yield``/``append`` inside a
    loop, or the explicit ``dict.fromkeys`` idiom.
    """
    if "dict.fromkeys" in code:
        return True
    for loop in ast.walk(tree):
        if not isinstance(loop, (ast.For, ast.AsyncFor)):
            continue
        for node in ast.walk(loop):
            if isinstance(node, (ast.Yield, ast.YieldFrom)):
                return True
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if node.func.attr == "append":
                    return True
    return False


def _dangerous_calls(tree: ast.AST) -> list[str]:
    found: list[str] = []
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if isinstance(func, ast.Name) and func.id in _DANGEROUS_CALLS:
            found.append(func.id)
        elif isinstance(func, ast.Attribute) and isinstance(func.value, ast.Name):
            if func.value.id == "os" and func.attr in {"system", "popen"}:
                found.append(f"os.{func.attr}")
            if func.value.id == "subprocess" and func.attr in {"run", "Popen", "call"}:
                found.append(f"subprocess.{func.attr}")
    return sorted(set(found))


def _is_stub(tree: ast.AST) -> bool:
    """Detect empty/placeholder functions that only ``pass`` or ``...``."""
    for node in _functions(tree):
        body = [item for item in node.body if not isinstance(item, ast.Expr)]
        if len(body) == 1 and isinstance(body[0], ast.Pass):
            return True
        if not body:
            return True
    return False


def _has_atomicity_guard(tree: ast.AST) -> bool:
    """Write-safety evidence: a guarded ``UPDATE`` (``rowcount``) or a transaction."""
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr in {"rowcount", "commit", "rollback"}:
            return True
        if isinstance(node, (ast.With, ast.AsyncWith)):
            for inner in ast.walk(node):
                if isinstance(inner, ast.Call) and isinstance(inner.func, ast.Attribute):
                    if inner.func.attr in {"execute", "executemany", "commit", "rollback"}:
                        return True
    return False


def _looks_like_login_or_secret(tree: ast.AST) -> bool:
    """A string literal of 4+ chars assigned to a password/secret/key/token name."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        value = node.value
        if not (isinstance(value, ast.Constant) and isinstance(value.value, str)):
            continue
        if len(value.value) < 4 or value.value.isidentifier():
            continue
        for target in node.targets:
            name = ""
            if isinstance(target, ast.Name):
                name = target.id
            elif isinstance(target, ast.Attribute):
                name = target.attr
            elif isinstance(target, ast.Subscript):
                name = " ".join(_string_literals(target.slice))
            if re.search(r"(?i)(password|secret|api[_-]?key|token)", name):
                return True
    return False


def _grade(weighted: int) -> str:
    if weighted >= _STRONG_GRADE:
        return "сильное"
    if weighted >= _MEDIUM_GRADE:
        return "среднее"
    return "слабое"


def _build_summary(
    reason: str,
    weighted: int,
    strengths: list[str],
    issues: list[str],
) -> str:
    summary = (
        f"Офлайн-эвристика (fallback, низкая уверенность; причина: {reason}). "
        f"Ориентировочный балл {weighted}/100 — {_grade(weighted)} решение. "
    )
    if strengths:
        summary += "Сильные стороны: " + ", ".join(strengths) + ". "
    if issues:
        summary += "Области для доработки: " + ", ".join(issues) + "."
    if not strengths and not issues:
        summary += "Явных сильных сторон и дефектов не обнаружено; нужна ручная проверка."
    return summary.strip()


# =============================================================================
# Deterministic AST heuristic
# =============================================================================

def _heuristic_evaluate(
    task_id: str,
    code: str,
    reason: str = "Gemini недоступен",
) -> CodeEvaluationResponse:
    """
    Deterministic offline evaluator.

    Determinism contract: same ``task_id`` + same ``code`` always produce the exact
    same score. Uniqueness contract: materially different code produces different
    scores because every adjustment is derived from AST features.
    """
    if INJECTION_KEYWORDS.search(code):
        return CodeEvaluationResponse(
            clean_code=0,
            architecture=0,
            edge_cases=0,
            is_plagiarized_or_injected=True,
            executive_summary=(
                "Политика безопасности: обнаружены недопустимые инструкции и попытка "
                "обхода правил верификации (Security Policy Violation). Решение отклонено."
            ),
            evaluation_mode="fallback",
            confidence="high",
            fallback_reason="Обнаружен паттерн prompt injection до вызова Gemini.",
        )

    try:
        tree = ast.parse(code)
    except (SyntaxError, ValueError) as exc:
        return CodeEvaluationResponse(
            clean_code=10,
            architecture=10,
            edge_cases=10,
            is_plagiarized_or_injected=False,
            executive_summary=(
                f"Синтаксический анализ: код не компилируется ({type(exc).__name__}). "
                "Решение отклонено на первом шлюзе."
            ),
            evaluation_mode="fallback",
            confidence="high",
            fallback_reason=reason,
        )

    # -------------------------------------------------------------------------
    # Substance gate: an empty file, comments only, or a bare stub demonstrates
    # nothing, so it must not inherit the neutral baseline of a real solution.
    # -------------------------------------------------------------------------
    if _logic_node_count(tree) < _MIN_LOGIC_NODES:
        return CodeEvaluationResponse(
            clean_code=8,
            architecture=5,
            edge_cases=4,
            is_plagiarized_or_injected=False,
            executive_summary=(
                f"Офлайн-эвристика (fallback, низкая уверенность; причина: {reason}). "
                "В отправленном фрагменте нет исполняемой логики: пустой файл, только "
                "комментарии либо заглушка (pass/…). Оценивать нечего — 6/100, слабое решение."
            ),
            evaluation_mode="fallback",
            confidence="low",
            fallback_reason=reason,
        )

    clean = BASE_CLEAN
    architecture = BASE_ARCH
    edge = BASE_EDGE
    strengths: list[str] = []
    issues: list[str] = []

    # -------------------------------------------------------------------------
    # Readability / maintainability (clean_code)
    # -------------------------------------------------------------------------
    if _has_type_hints(tree):
        clean += 9
        strengths.append("есть аннотации типов")
    else:
        clean -= 6
        issues.append("нет аннотаций типов")

    fn_count = _function_count(tree)
    class_count = _class_count(tree)

    if _docstring_present(tree):
        clean += 7
        strengths.append("есть docstring")
    elif fn_count:
        clean -= 4
        issues.append("нет docstring у функций")

    if _has_future_annotations(tree):
        clean += 2

    if re.search(r"(?m)^\s*#", code):
        clean += 3
        strengths.append("есть комментарии")

    if fn_count >= 2:
        clean += 6
        strengths.append("код разбит на функции")
    if class_count:
        clean += 2
        strengths.append("использованы классы")
    if _with_count(tree):
        clean += 3
        strengths.append("использован контекстный менеджер with")

    if not fn_count and not class_count:
        clean -= 8
        architecture -= 8
        issues.append("нет определённых функций или классов")

    long_lines = [line for line in code.splitlines() if len(line) > 110]
    if long_lines:
        clean -= 4
        issues.append(f"слишком длинные строки ({len(long_lines)} шт.)")

    bare_excepts = _bare_except_count(tree)
    if bare_excepts:
        clean -= 6
        edge -= 8
        issues.append(f"bare except ({bare_excepts} шт.) скрывает ошибки")

    # -------------------------------------------------------------------------
    # Architecture / design
    # -------------------------------------------------------------------------
    if fn_count >= 2:
        architecture += 6

    if _has_generator(tree):
        architecture += 5
        strengths.append("ленивая генерация (yield) вместо материализации списка")

    annotated_containers = _annotated_container_params(tree)
    mutated = _mutated_params(tree)
    if mutated:
        architecture -= 12
        issues.append("мутация входного аргумента (" + ", ".join(sorted(mutated)) + ")")
    elif annotated_containers:
        architecture += 5
        strengths.append("входные коллекции не мутируются")

    if _is_stub(tree):
        architecture -= 10
        issues.append("обнаружены функции-заглушки (pass/пустое тело)")

    dangerous = _dangerous_calls(tree)
    if dangerous:
        architecture -= 10
        issues.append("опасные вызовы: " + ", ".join(dangerous))

    if re.search(r"TODO|FIXME|NotImplementedError", code):
        architecture -= 4
        issues.append("незавершённые TODO/FIXME/NotImplementedError")

    # --- SQL handling (applies wherever SQL appears) --------------------------
    has_sql, has_sql_params, has_fstring_sql = _sql_signals(tree)

    if has_sql:
        if has_fstring_sql:
            architecture -= 25
            edge -= 5
            issues.append("SQL-запрос собран f-строкой — риск SQL injection (CWE-89)")
        elif has_sql_params:
            architecture += 20
            strengths.append("параметризованный SQL-запрос")
        else:
            architecture -= 5
            issues.append("SQL без явной параметризации")

        if has_sql_params and _has_atomicity_guard(tree):
            architecture += 8
            strengths.append("защита от конкурентного списания (rowcount/условный UPDATE)")

    # --- Error handling / boundary conditions (edge_cases) --------------------
    if _try_count(tree):
        edge += 8
        strengths.append("есть обработка исключений")
    if _raise_count(tree):
        edge += 6
        strengths.append("явные raise/исключения")

    division_status = _division_guard_status(tree)
    if division_status is True:
        edge += 26
        strengths.append("защита от деления на ноль при пустой истории")
    elif division_status is False:
        edge -= 18
        issues.append("риск ZeroDivisionError на пустой истории")

    if _has_isinstance_check(tree):
        edge += 5
        strengths.append("проверка типа входных данных (isinstance)")

    if _has_finite_guard(tree):
        edge += 6
        strengths.append("защита от NaN/Inf во входных числах")

    optional_params = _optional_param_count(tree)
    if optional_params:
        edge += 6
        strengths.append("явно обработан Optional/None-вход")

    # --- Task-specific rubric checks -----------------------------------------
    if task_id == "task-fintech-01":
        if _validates_positive_amount(tree):
            edge += 20
            strengths.append("валидация положительной суммы")
        else:
            # The graded defect of this case: negative/zero transfers must be
            # rejected before any write. Missing it cannot still be Gold.
            edge -= 30
            issues.append("нет проверки amount <= 0")

        if re.search(r"(?i)\bif\s+(?:not\s+)?sender\b", code):
            edge += 5
            strengths.append("проверка существования счёта отправителя")
        if re.search(r"(?i)\bif\s+(?:not\s+)?receiver\b", code):
            edge += 5
            strengths.append("проверка существования счёта получателя")

    elif task_id == "task-logistics-02":
        has_set = bool(re.search(r"set\(|set\s*\{|dict\.fromkeys", code))
        has_nested = bool(re.search(r"\.count\(|not\s+in\s+unique|not\s+in\s+result", code))
        if has_set and not has_nested:
            architecture += 24
            strengths.append("линейная сложность O(N), хэш-структура")
        elif has_nested:
            architecture -= 22
            issues.append("квадратичная сложность O(N^2) из-за .count()/поиска в цикле")
        else:
            issues.append("не видно хэш-структуры для дедупликации")

        if _has_empty_guard(tree):
            edge += 18
            strengths.append("обработан пустой список")
        else:
            edge -= 16
            issues.append("нет явной обработки пустого списка")

        if _has_ordered_dedupe(tree, code):
            edge += 8
            strengths.append("сохранён порядок первого появления при дедупликации")

    elif task_id == "task-edtech-03":
        if _has_mutable_default(tree):
            architecture -= 22
            issues.append("мутируемый аргумент по умолчанию (history=[])")
        elif _has_none_default(tree):
            architecture += 22
            strengths.append("history=None + локальная инициализация")

    # --- Security hygiene (not a replacement for Gate 2) ----------------------
    if _looks_like_login_or_secret(tree):
        architecture -= 8
        issues.append("в коде есть строковый секрет/пароль (проверьте N2)")

    # --- Deterministic variance ----------------------------------------------
    # A tiny code-derived jitter avoids a uniform "one size fits all" score while
    # staying fully reproducible. It is derived from the code hash, not random.
    jitter = (int(hashlib.sha256(code.encode("utf-8", errors="replace")).hexdigest(), 16) % 5) - 2
    clean += jitter
    architecture += jitter
    edge += jitter

    clean = max(0, min(SCORE_CAP, clean))
    architecture = max(0, min(SCORE_CAP, architecture))
    edge = max(0, min(SCORE_CAP, edge))

    weighted = round(0.30 * clean + 0.40 * architecture + 0.30 * edge)

    return CodeEvaluationResponse(
        clean_code=clean,
        architecture=architecture,
        edge_cases=edge,
        is_plagiarized_or_injected=False,
        executive_summary=_build_summary(reason, weighted, strengths, issues),
        evaluation_mode="fallback",
        confidence="low",
        fallback_reason=reason,
    )


# =============================================================================
# Generic (non-Python) deterministic heuristic
#
# ``CodeAnalysis`` from ``backend.languages`` is the only structural input: the
# number of functions, branches, loops, returns and classes, plus the parse
# verdict. Text-level signals below are deliberately language-agnostic (comments,
# error handling keywords and boundary guards) and never execute the submission.
# There is no ``ast.parse`` anywhere on this path, so a JavaScript, Go or C#
# snippet can never raise a Python ``SyntaxError``.
# =============================================================================

GENERIC_BASE_CLEAN = 64
GENERIC_BASE_ARCH = 60
GENERIC_BASE_EDGE = 58

_GENERIC_COMMENT_LINE = re.compile(r"(?m)^\s*(?://|#|/\*|\*|--|///)")
_GENERIC_DOC_COMMENT = re.compile(r"/\*\*|\"\"\"|'''|///")
_GENERIC_ERROR_HANDLING = re.compile(
    r"\btry\b|\bcatch\b|\bexcept\b|\brescue\b|\bif\s+err\s*!=\s*nil\b",
    re.IGNORECASE,
)
_GENERIC_RAISED = re.compile(
    r"\bthrow\b|\braise\b|\bpanic\(|\berrors\.New\b|\bfmt\.Errorf\b|\breturn\s+nil\s*,\s*err\b",
    re.IGNORECASE,
)
_GENERIC_BOUNDARY_GUARD = re.compile(
    r"(?:==|!=|===|!==)\s*(?:null|undefined|nil)\b"
    r"|(?:==|!=|===|!==)\s*\"\""
    r"|\blength\s*(?:===|==|!==|!=)\s*0\b"
    r"|\bLength\s*(?:===|==|!==|!=)\s*0\b"
    r"|\.isEmpty\(\)|\.isBlank\(\)|isNullOrEmpty"
    r"|\.Count\s*==\s*0\b"
    r"|\blen\("
    r"|<=?\s*0\b"
)
_GENERIC_DANGEROUS_CALL = re.compile(r"\beval\s*\(|\bexec\s*\(")


def _resolve_task_language(task_id: str, language: str | None) -> str:
    """Resolve the scoring language without ever raising ``KeyError``.

    A supported explicit language wins; an unknown explicit value is ignored in
    favour of the task's own language (or ``python`` for an unknown task), so
    direct callers such as ``get_fallback_evaluation(..., language="cobol")``
    degrade gracefully instead of crashing on a profile lookup.
    """
    if language and language in SUPPORTED_LANGUAGES:
        return language
    try:
        from backend.db import get_task_by_id

        task = get_task_by_id(task_id)
    except (ImportError, sqlite3.Error, OSError, ValueError, TypeError):
        return "python"
    if isinstance(task, dict):
        return str(task.get("language") or "python")
    return "python"


def _generic_heuristic_evaluate(
    task_id: str,
    code: str,
    language: str,
    reason: str,
) -> CodeEvaluationResponse:
    """Deterministic offline scoring for every language except Python."""
    if INJECTION_KEYWORDS.search(code):
        return CodeEvaluationResponse(
            clean_code=0,
            architecture=0,
            edge_cases=0,
            is_plagiarized_or_injected=True,
            executive_summary=(
                "Политика безопасности: обнаружены недопустимые инструкции и попытка "
                "обхода правил верификации (Security Policy Violation). Решение отклонено."
            ),
            evaluation_mode="fallback",
            confidence="high",
            fallback_reason="Обнаружен паттерн prompt injection до вызова Gemini.",
        )

    analysis = analyze_code(analysis_source(code, language), language)
    label = language_label(language)
    hint = SUPPORTED_LANGUAGES[language].rubric_hint

    if not analysis.parse_ok:
        return CodeEvaluationResponse(
            clean_code=10,
            architecture=10,
            edge_cases=10,
            is_plagiarized_or_injected=False,
            executive_summary=(
                f"Синтаксический анализ ({label}): {analysis.error or 'код не разбирается'}. "
                "Решение отклонено на первом шлюзе."
            ),
            evaluation_mode="fallback",
            confidence="high",
            fallback_reason=reason,
        )

    function_count = len(analysis.functions)
    class_count = len(analysis.classes)
    branch_count = len(analysis.branches)
    loop_count = len(analysis.loops)
    return_count = len(analysis.returns)
    logic_nodes = function_count + branch_count + loop_count + return_count

    # Substance gate: nothing executable means nothing to assess.
    if logic_nodes < _MIN_LOGIC_NODES:
        return CodeEvaluationResponse(
            clean_code=8,
            architecture=5,
            edge_cases=4,
            is_plagiarized_or_injected=False,
            executive_summary=(
                f"Офлайн-эвристика (fallback, низкая уверенность; причина: {reason}). "
                f"В отправленном фрагменте на {label} нет исполняемой логики: пустой файл, "
                "только комментарии либо заглушка. Оценивать нечего — 6/100, слабое решение."
            ),
            evaluation_mode="fallback",
            confidence="low",
            fallback_reason=reason,
        )

    clean = GENERIC_BASE_CLEAN
    architecture = GENERIC_BASE_ARCH
    edge = GENERIC_BASE_EDGE
    strengths: list[str] = []
    issues: list[str] = []

    # --- Readability / maintainability --------------------------------------
    if _GENERIC_COMMENT_LINE.search(code):
        clean += 6
        strengths.append("есть комментарии")
    if _GENERIC_DOC_COMMENT.search(code):
        clean += 4
        strengths.append("есть документирующие комментарии")

    if function_count >= 2:
        clean += 10
        architecture += 8
        strengths.append("код разбит на функции")
    elif function_count == 1:
        clean += 2
    if class_count:
        clean += 3
        architecture += 4
        strengths.append(f"использованы классы или интерфейсы ({label})")

    if not function_count and not class_count:
        clean -= 8
        architecture -= 8
        issues.append("нет определённых функций или классов")

    long_lines = [line for line in code.splitlines() if len(line) > 110]
    if long_lines:
        clean -= 4
        issues.append(f"слишком длинные строки ({len(long_lines)} шт.)")

    if _GENERIC_DANGEROUS_CALL.search(code):
        architecture -= 10
        issues.append("опасные вызовы eval/exec")

    if re.search(r"TODO|FIXME|NotImplementedError", code):
        architecture -= 4
        issues.append("незавершённые TODO/FIXME")

    # --- Architecture -------------------------------------------------------
    if branch_count >= 2:
        architecture += 6
    elif branch_count:
        architecture += 2
    if loop_count:
        architecture += 4
    if return_count >= 2:
        architecture += 4

    handles_errors = bool(_GENERIC_ERROR_HANDLING.search(code))
    if handles_errors:
        architecture += 12
        edge += 10
        strengths.append("есть обработка ошибок")
    else:
        architecture -= 10
        edge -= 12
        issues.append("нет обработки ошибок")

    if _GENERIC_RAISED.search(code):
        edge += 10
        strengths.append("явные исключения или возврат ошибки")

    # --- Boundary conditions -------------------------------------------------
    guard_count = len(_GENERIC_BOUNDARY_GUARD.findall(code))
    if guard_count >= 2:
        edge += 12
        strengths.append("проверены пустые/null-значения и границы")
    elif guard_count:
        edge += 6
        strengths.append("есть частичная проверка границ")
    else:
        edge -= 12
        issues.append(f"не обработаны пустые и null-значения ({label}: {hint})")

    # --- Deterministic variance (same contract as the Python heuristic) ------
    jitter = (int(hashlib.sha256(code.encode("utf-8", errors="replace")).hexdigest(), 16) % 5) - 2
    clean += jitter
    architecture += jitter
    edge += jitter

    clean = max(0, min(SCORE_CAP, clean))
    architecture = max(0, min(SCORE_CAP, architecture))
    edge = max(0, min(SCORE_CAP, edge))

    weighted = round(0.30 * clean + 0.40 * architecture + 0.30 * edge)

    return CodeEvaluationResponse(
        clean_code=clean,
        architecture=architecture,
        edge_cases=edge,
        is_plagiarized_or_injected=False,
        executive_summary=_build_summary(reason, weighted, strengths, issues),
        evaluation_mode="fallback",
        confidence="low",
        fallback_reason=reason,
    )


def get_fallback_evaluation(
    task_id: str,
    submitted_code: str,
    reason: str = "Gemini недоступен",
    language: str | None = None,
) -> CodeEvaluationResponse:
    """
    Main offline entry point. Runs in milliseconds, never performs network I/O,
    and never returns a fixed per-task preset score.

    Python keeps the richer AST-based rubric. Every other language is scored by
    the generic :func:`_generic_heuristic_evaluate`, which relies exclusively on
    ``CodeAnalysis`` plus the language profile hints and never calls ``ast``.
    ``language`` falls back to the seeded task's language (``python`` when the
    task is unknown), so direct callers stay source-compatible.
    """
    resolved = _resolve_task_language(task_id, language)
    if resolved == "python":
        return _heuristic_evaluate(task_id, submitted_code, reason=reason)
    return _generic_heuristic_evaluate(task_id, submitted_code, resolved, reason=reason)
