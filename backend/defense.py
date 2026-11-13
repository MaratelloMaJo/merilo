"""Merilo — one-time, token-bound candidate defense of a Skill Card.

A verified card may be *defended* exactly once. The candidate answers the three
questions that were issued together with a single-use token; the answer set is
then hashed, HMAC-signed and persisted. The token itself is never stored — only
its SHA-256 digest, used to authorise the one sealing attempt.

Persistence relies on a single conditional ``UPDATE`` so that two concurrent
sealing attempts cannot both succeed: SQLite evaluates ``defended_at IS NULL``
and ``defense_token_hash = ?`` atomically for the statement, and the winner is
decided by ``cursor.rowcount``.

The verifier's :func:`backend.db.save_skill_card` uses ``ON CONFLICT DO UPDATE``
over its own columns, so re-verifying a submission (which reproduces the same
deterministic ``card_hash``) can never null out the six defense columns or
reopen a sealed card.
"""

import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any

from backend.db import (
    DEFAULT_DB_PATH,
    SECRET_KEY,
    get_db_connection,
    get_skill_card_private,
)

# The defense contract is fixed at three questions and three answers.
DEFENSE_QUESTION_COUNT = 3
DEFENSE_ANSWER_COUNT = 3


class AlreadyDefended(Exception):
    """Raised when a card already has a recorded defense.

    Checked before the token comparison on purpose: a sealed card must never
    reveal whether the presented token was correct.
    """


def hash_token(token: str) -> str:
    """Returns the SHA-256 hex digest stored in ``defense_token_hash``."""
    if not isinstance(token, str):
        raise TypeError("token must be a string")
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _canonical_json(payload: Any) -> str:
    """Single canonical JSON form used by every defense hash."""
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def defense_hash(card_hash: str, questions: list[str], answers: list[str]) -> str:
    """SHA-256 over the canonical ``{card_hash, questions, answers}`` payload.

    Dict keys are sorted, so only the order of the question/answer *lists*
    matters — which is intended: reordering answers is a different defense.

    This function hashes the values exactly as given: it does **not** strip
    whitespace. :func:`seal_card_defense` normalizes each answer (``strip()``)
    before hashing, so ``"  A1  "`` and ``"A1"`` seal to the same digest. A
    caller that hashes raw input directly is on its own.
    """
    payload = {
        "card_hash": card_hash,
        "questions": list(questions),
        "answers": list(answers),
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


def sign_defense(secret: str, defense_hash: str, user_id: str, score: int) -> str:
    """HMAC-SHA256 hex over ``defense_hash:user_id:score``.

    ``secret`` is explicit so the function is testable in isolation; production
    callers pass ``MERILO_HMAC_SECRET`` (or the development fallback) through
    :data:`backend.db.SECRET_KEY`, keeping one env-parsing path.

    An empty or whitespace-only secret is rejected with :class:`ValueError`:
    signing under a known key would produce a signature that any caller could
    forge. Both ``str`` and ``bytes`` secrets are accepted, because
    :data:`backend.db.SECRET_KEY` is bytes while tests pass text.
    """
    if isinstance(secret, str):
        key = secret.encode("utf-8")
    elif isinstance(secret, (bytes, bytearray)):
        key = bytes(secret)
    else:
        raise ValueError("signature secret must be a string or bytes")
    if not key.strip():
        raise ValueError("signature secret must not be empty")
    payload = f"{defense_hash}:{user_id or ''}:{int(score)}".encode("utf-8")
    return hmac.new(key, payload, hashlib.sha256).hexdigest()


def _normalize_answers(answers: Any) -> list[str]:
    """Validates the answer envelope and strips each answer.

    Character limits (20–1200) belong to the HTTP layer; the domain only cares
    that there are exactly three non-empty answers.
    """
    if isinstance(answers, str) or not isinstance(answers, (list, tuple)):
        raise ValueError(f"answers must be a list of exactly {DEFENSE_ANSWER_COUNT} strings")
    if len(answers) != DEFENSE_ANSWER_COUNT:
        raise ValueError(
            f"exactly {DEFENSE_ANSWER_COUNT} answers are required, got {len(answers)}"
        )

    normalized: list[str] = []
    for index, answer in enumerate(answers, start=1):
        if not isinstance(answer, str):
            raise ValueError(f"answer {index} must be a string")
        stripped = answer.strip()
        if not stripped:
            raise ValueError(f"answer {index} must not be empty")
        normalized.append(stripped)
    return normalized


def _parse_string_list(raw: Any) -> list[str]:
    """Parses a stored JSON list of strings.

    An absent column returns ``[]``. Every other shape is rejected with
    :class:`ValueError` rather than silently repaired: dropping a non-string
    element would change the list a defense hash is computed over, so a
    malformed payload must fail loudly instead of sealing something else.
    """
    if raw is None or raw == "":
        return []
    if not isinstance(raw, str):
        raise ValueError("stored defense payload must be JSON text")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError("stored defense payload is not valid JSON") from exc
    if not isinstance(parsed, list):
        raise ValueError("stored defense payload must be a JSON list of strings")
    for index, item in enumerate(parsed, start=1):
        if not isinstance(item, str):
            raise ValueError(f"stored defense payload item {index} must be a string")
    return list(parsed)


def _validate_questions(questions: list[str]) -> list[str]:
    """Requires exactly three non-empty questions (``["", "", ""]`` is invalid)."""
    if len(questions) != DEFENSE_QUESTION_COUNT:
        raise ValueError(
            f"defense requires exactly {DEFENSE_QUESTION_COUNT} questions, "
            f"got {len(questions)}"
        )
    for index, question in enumerate(questions, start=1):
        if not isinstance(question, str) or not question.strip():
            raise ValueError(f"question {index} must be a non-empty string")
    return questions


def _load_questions(row: dict[str, Any]) -> list[str]:
    """Returns the questions issued with the challenge, deriving them if absent."""
    stored = _parse_string_list(row.get("defense_questions_json"))
    if stored:
        return _validate_questions(stored)

    # Legacy cards issued before questions were persisted: regenerate the
    # deterministic question set from the code that produced the card.
    from backend.languages import analysis_source, analyze_code, generate_defense_questions

    code = row.get("submitted_code") or ""
    language = row.get("language") or "python"
    return _validate_questions(
        generate_defense_questions(analyze_code(analysis_source(code, language), language))
    )


def set_defense_challenge(
    card_hash: str,
    questions: list[str],
    token_hash: str,
    db_path: str = DEFAULT_DB_PATH,
) -> bool:
    """Stores a freshly issued challenge for an unsealed card.

    Only the two verifier-owned challenge columns are written:
    ``defense_questions_json`` and ``defense_token_hash``. The raw token is never
    persisted — callers pass :func:`hash_token` output.

    A sealed card (``defended_at IS NOT NULL``) is never touched, so a re-issued
    challenge cannot overwrite a recorded defense. Returns ``True`` when the
    challenge was stored and ``False`` when the card is missing or already sealed.
    """
    validated = _validate_questions(questions)
    if not isinstance(token_hash, str) or not token_hash.strip():
        raise ValueError("token hash must be a non-empty string")

    conn = get_db_connection(db_path)
    try:
        with conn:
            cursor = conn.execute(
                "UPDATE skill_cards SET defense_questions_json = ?, "
                "defense_token_hash = ? "
                "WHERE card_hash = ? AND defended_at IS NULL",
                (
                    json.dumps(validated, ensure_ascii=False),
                    token_hash,
                    card_hash,
                ),
            )
        return cursor.rowcount == 1
    finally:
        conn.close()


def defense_challenge_status(
    card_hash: str, db_path: str = DEFAULT_DB_PATH
) -> str:
    """Challenge state used by the HTTP layer to pick a status code.

    Returns ``"missing"`` (no such card), ``"ineligible"`` (a blocked or rejected
    card can never be defended), ``"sealed"`` (defense recorded), ``"issued"``
    (an unsealed challenge exists) or ``"absent"`` (legacy card that never had a
    challenge issued). Never exposes the token hash itself.
    """
    card = get_skill_card_private(card_hash, db_path=db_path)
    if card is None:
        return "missing"
    if card.get("status") != "verified":
        return "ineligible"
    if card.get("defended_at"):
        return "sealed"
    token_hash = card.get("defense_token_hash")
    if isinstance(token_hash, str) and token_hash.strip():
        return "issued"
    return "absent"


def seal_card_defense(
    card_hash: str,
    token_hash: str,
    answers: list[str],
    db_path: str = DEFAULT_DB_PATH,
) -> dict[str, Any]:
    """Seals a card's defense once, atomically and bound to ``token_hash``.

    Error precedence: missing card → :class:`LookupError`; already sealed →
    :class:`AlreadyDefended` (before any token comparison); missing/empty/mismatched
    token → :class:`PermissionError`; malformed answers or an unusable stored
    challenge → :class:`ValueError`.

    Returns ``{defense_hash, defense_signature, answered_count, defended_at}``.
    ``defended_at`` is UTC ISO 8601 with an explicit ``+00:00`` offset.
    """
    card = get_skill_card_private(card_hash, db_path=db_path)
    if card is None:
        raise LookupError(f"Skill Card not found: {card_hash}")

    if card.get("defended_at"):
        raise AlreadyDefended(f"Skill Card {card_hash} is already defended")

    stored_token_hash = card.get("defense_token_hash")
    if not isinstance(stored_token_hash, str) or not stored_token_hash.strip():
        # A card whose challenge was never issued (or whose token hash is empty)
        # must never be sealable, and an empty presented token must never match.
        raise PermissionError("Invalid or missing defense token")
    if not isinstance(token_hash, str) or not token_hash.strip():
        raise PermissionError("Invalid or missing defense token")
    try:
        token_matches = hmac.compare_digest(stored_token_hash, token_hash)
    except TypeError:  # non-ASCII ``str`` payloads are not comparable as ASCII
        raise PermissionError("Invalid or missing defense token") from None
    if not token_matches:
        raise PermissionError("Invalid or missing defense token")

    normalized_answers = _normalize_answers(answers)
    questions = _load_questions(card)

    digest = defense_hash(card_hash, questions, normalized_answers)
    signature = sign_defense(
        SECRET_KEY,
        digest,
        card.get("user_id") or "",
        int(card.get("total_score", 0) or 0),
    )
    defended_at = datetime.now(UTC).isoformat()

    # The one and only write: a conditional UPDATE is atomic in SQLite, so a
    # concurrent attempt that loses the race affects zero rows.
    conn = get_db_connection(db_path)
    try:
        with conn:
            cursor = conn.execute(
                "UPDATE skill_cards SET "
                "defense_questions_json = ?, "
                "defense_answers_json = ?, "
                "defense_hash = ?, "
                "defense_signature = ?, "
                "defended_at = ? "
                "WHERE card_hash = ? AND defended_at IS NULL AND defense_token_hash = ?",
                (
                    json.dumps(questions, ensure_ascii=False),
                    json.dumps(normalized_answers, ensure_ascii=False),
                    digest,
                    signature,
                    defended_at,
                    card_hash,
                    token_hash,
                ),
            )
        sealed = cursor.rowcount == 1
    finally:
        conn.close()

    if not sealed:
        # Lost the race (or the row changed underneath us). Re-read to report
        # the truthful reason without ever confirming a token on a sealed card.
        fresh = get_skill_card_private(card_hash, db_path=db_path)
        if fresh is None:
            raise LookupError(f"Skill Card not found: {card_hash}")
        if fresh.get("defended_at"):
            raise AlreadyDefended(f"Skill Card {card_hash} is already defended")
        raise PermissionError("Invalid or missing defense token")

    return {
        "defense_hash": digest,
        "defense_signature": signature,
        "answered_count": len(normalized_answers),
        "defended_at": defended_at,
    }


def defense_state_for_card(card: dict[str, Any] | None) -> dict[str, Any]:
    """Public defense projection for an already-loaded private card row.

    The token hash is deliberately absent. ``defense_status`` is derived rather
    than stored: a sealed card is ``recorded``, a card with an outstanding
    challenge is ``not_recorded``, and a legacy card that never had a challenge
    is ``unavailable``.

    A malformed stored payload raises :class:`ValueError` — callers that serve
    HTTP decide how to report that data-integrity failure.
    """
    if card is None:
        return {
            "defense_questions": [],
            "defense_answers": [],
            "defense_hash": None,
            "defense_signature": None,
            "defended_at": None,
            "defense_status": "unavailable",
        }

    defended_at = card.get("defended_at")
    questions = _parse_string_list(card.get("defense_questions_json"))
    answers = _parse_string_list(card.get("defense_answers_json"))
    token_hash = card.get("defense_token_hash")

    if defended_at:
        status = "recorded"
    elif questions or (isinstance(token_hash, str) and token_hash.strip()):
        status = "not_recorded"
    else:
        status = "unavailable"

    return {
        "defense_questions": questions,
        "defense_answers": answers,
        "defense_hash": card.get("defense_hash"),
        "defense_signature": card.get("defense_signature"),
        "defended_at": defended_at,
        "defense_status": status,
    }


def defense_status_from_columns(
    defended_at: Any, questions_json: Any, token_hash: Any
) -> str:
    """Derives ``defense_status`` from the three raw defense columns.

    Same precedence as :func:`defense_state_for_card`, without parsing the
    questions into a public list: sealed → ``recorded``, an outstanding
    challenge → ``not_recorded``, a legacy card with neither → ``unavailable``.

    A malformed stored payload is withheld as ``unavailable`` instead of raising:
    one bad row must not fail a whole listing.
    """
    if defended_at:
        return "recorded"
    try:
        has_questions = bool(_parse_string_list(questions_json))
    except ValueError:
        has_questions = False
    has_token = isinstance(token_hash, str) and bool(token_hash.strip())
    return "not_recorded" if (has_questions or has_token) else "unavailable"


def bulk_defense_status(cards: list[dict[str, Any]]) -> list[str]:
    """Derives ``defense_status`` for many already-loaded card rows.

    One in-memory pass over rows that were fetched with their defense columns in
    a single query — no per-card database access, so a feed of N cards stays at
    two queries (rows + zero) instead of N+1.
    """
    return [
        defense_status_from_columns(
            card.get("defended_at"),
            card.get("defense_questions_json"),
            card.get("defense_token_hash"),
        )
        for card in cards
    ]


def get_defense_state(
    card_hash: str, db_path: str = DEFAULT_DB_PATH
) -> dict[str, Any] | None:
    """Public defense read model, or ``None`` when the card does not exist.

    ``defense_token_hash`` is deliberately absent: it is an audit-only column
    and must never reach an HTTP response.

    A stored payload with the wrong JSON shape raises :class:`ValueError`
    instead of being repaired — that can only happen through out-of-band
    tampering, and a silently "fixed" list would misrepresent the defense.
    """
    card = get_skill_card_private(card_hash, db_path=db_path)
    if card is None:
        return None

    state = defense_state_for_card(card)
    return {
        "defense_questions": state["defense_questions"],
        "defense_answers": state["defense_answers"],
        "defense_hash": state["defense_hash"],
        "defense_signature": state["defense_signature"],
        "defended_at": state["defended_at"],
        "defended": bool(state["defended_at"]),
    }
