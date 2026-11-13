"""
Merilo — Pydantic Schemas & Data Contracts
Strict type definitions for the 3-gate AI verification pipeline.
"""

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class CriterionScore(BaseModel):
    """
    Individual rubric criterion score with reviewer commentary.
    """
    name: str = Field(..., description="Название критерия оценки")
    score: int = Field(..., ge=0, le=100, description="Оценка от 0 до 100")
    comment: str = Field(..., description="Комментарий аудитора по критерию")


class CodeEvaluationResponse(BaseModel):
    """
    Structured AI evaluation model enforced by Gemini structured-output schema.
    """
    clean_code: int = Field(
        ...,
        ge=0,
        le=100,
        description="Качество кода, читаемость, PEP8, типизация (0..100)",
    )
    architecture: int = Field(
        ...,
        ge=0,
        le=100,
        description="Архитектура, алгоритмическая сложность O(N), безопасность (0..100)",
    )
    edge_cases: int = Field(
        ...,
        ge=0,
        le=100,
        description="Граничные условия, валидация и обработка исключений (0..100)",
    )
    is_plagiarized_or_injected: bool = Field(
        default=False,
        description="Попытка взлома промпта, обхода правил или инъекции вредоносных инструкций",
    )
    executive_summary: str = Field(
        ...,
        description="Краткая объективная выжимка для работодателя (2-3 предложения)",
    )
    evaluation_mode: Literal["gemini", "openai", "fallback"] = Field(
        default="gemini",
        description="Источник оценки: реальный вызов Gemini или детерминированная офлайн-эвристика",
    )
    confidence: Literal["high", "low"] = Field(
        default="high",
        description="Уверенность оценки: high для Gemini, low для fallback",
    )
    fallback_reason: Optional[str] = Field(
        default=None,
        description="Почему сработал fallback (нет ключа, таймаут, 429 и т.п.)",
    )


class TaskCreateRequest(BaseModel):
    """
    Public recruiter request payload for posting a new B2B micro-task.
    No authentication for the demo; hardening is via strict field validation and rate limiting.
    Strings are stripped, `rubric` accepts any dict of short strings
    (keys clean_code / architecture / edge_cases recommended).
    """

    title: str = Field(
        ...,
        min_length=5,
        max_length=120,
        description="Название задачи (5-120 символов)",
    )
    company_name: str = Field(
        ...,
        min_length=2,
        max_length=80,
        description="Название компании-работодателя (2-80 символов)",
    )
    stack: str = Field(
        ...,
        min_length=3,
        max_length=120,
        description="Технологический стек (3-120 символов)",
    )
    difficulty: str = Field(
        default="Junior",
        max_length=40,
        description="Уровень сложности: Junior / Middle / Senior (по умолчанию 'Junior')",
    )
    description: str = Field(
        ...,
        min_length=20,
        description="Полное описание кейса с бизнес-контекстом (минимум 20 символов)",
    )
    rubric: dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Критерии оценки: произвольный словарь коротких строк "
            "(рекомендуются ключи clean_code, architecture, edge_cases)"
        ),
    )
    buggy_code: str = Field(
        ...,
        min_length=10,
        max_length=8000,
        description="Исходный код с ошибкой/уязвимостью для исправления (10-8000 символов)",
    )
    preset_ideal: str = Field(
        default="",
        max_length=8000,
        description="Опциональный пресет эталонного решения",
    )
    preset_vulnerable: str = Field(
        default="",
        max_length=8000,
        description="Опциональный пресет решения с уязвимостью",
    )
    preset_injection: str = Field(
        default="",
        max_length=8000,
        description="Опциональный пресет с попыткой prompt-инъекции",
    )
    language: str = Field(
        default="python",
        max_length=20,
        description="Язык программирования задачи (ключ из SUPPORTED_LANGUAGES)",
    )

    @field_validator("language", mode="before")
    @classmethod
    def _validate_language(cls, v: Any) -> Any:
        """Normalize the language key and reject anything outside the supported set."""
        if not isinstance(v, str):
            return v
        key = v.strip().lower() or "python"
        from backend.languages import SUPPORTED_LANGUAGES

        if key not in SUPPORTED_LANGUAGES:
            supported = ", ".join(sorted(SUPPORTED_LANGUAGES))
            raise ValueError(f"Неподдерживаемый язык «{key}». Доступные языки: {supported}")
        return key

    @field_validator(
        "title",
        "company_name",
        "stack",
        "difficulty",
        "description",
        "buggy_code",
        "preset_ideal",
        "preset_vulnerable",
        "preset_injection",
        mode="before",
    )
    @classmethod
    def _strip_strings(cls, v: Any) -> Any:
        """Strip whitespace from incoming strings before length validation (input hardening)."""
        return v.strip() if isinstance(v, str) else v

    @field_validator("rubric", mode="before")
    @classmethod
    def _clean_rubric(cls, v: Any) -> dict[str, str]:
        """Accept any dict of short strings; reject non-string values and truncate oversized entries."""
        if v is None:
            return {}
        if not isinstance(v, dict):
            raise ValueError("rubric должен быть объектом со строковыми значениями")
        cleaned: dict[str, str] = {}
        for key, value in v.items():
            if not isinstance(value, str):
                raise ValueError("rubric должен быть объектом со строковыми значениями")
            cleaned[str(key).strip()[:80]] = value.strip()[:800]
        return cleaned


class VerifyRequest(BaseModel):
    """
    Incoming request payload for code verification.
    """
    task_id: str = Field(..., description="Идентификатор верифицируемой микро-задачи")
    submitted_code: str = Field(..., description="Исходный код решения кандидата")
    candidate_name: str = Field(
        default="Anonymous Candidate",
        description="Имя и фамилия кандидата",
    )
    user_id: Optional[str] = Field(
        default=None,
        description="Идентификатор зарегистрированного пользователя (опционально)",
    )
    language: Optional[str] = Field(
        default=None,
        max_length=20,
        description=(
            "Язык программирования. Обязателен для own-code; для задачи из каталога "
            "должен совпадать с языком задачи"
        ),
    )
    ai_assisted: bool = Field(
        default=False,
        description="Признак того, что кандидат использовал AI-ассистента",
    )

    @field_validator("language", mode="before")
    @classmethod
    def _normalize_language(cls, v: Any) -> Any:
        """Trim/lower-case the optional language key; an empty string means 'not sent'."""
        if not isinstance(v, str):
            return v
        key = v.strip().lower()
        return key or None


class VerifyResponse(BaseModel):
    """
    Comprehensive verification result returned after passing through the 3 gates.
    """
    status: str = Field(
        ...,
        description="Статус верификации: 'verified' | 'rejected' | 'blocked'",
    )
    gate_reached: int = Field(
        ...,
        ge=1,
        le=3,
        description="Номер достигнутого шлюза: 1 (AST) | 2 (AI Security) | 3 (Scored & Hashed)",
    )
    total_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Итоговый взвешенный балл решения (0..100)",
    )
    badge_tier: str = Field(
        ...,
        description="Квалификационный тир: 'Gold Verified' | 'Silver Verified' | 'Needs Work' | 'Rejected'",
    )
    card_hash: str = Field(
        ...,
        description="Криптографический хэш карточки навыка (12 символов SHA-256)",
    )
    verify_url: str = Field(
        ...,
        description="Ссылка для публичной проверки карточки (/card/{card_hash})",
    )
    evaluation: CodeEvaluationResponse = Field(
        ...,
        description="Детальный отчет по чистоте кода, архитектуре и граничным случаям",
    )
    signature: Optional[str] = Field(
        default=None,
        description="Криптографическая подпись карточки HMAC-SHA256",
    )
    is_signature_valid: Optional[bool] = Field(
        default=None,
        description="Результат валидации HMAC-SHA256 подписи",
    )
    evaluation_mode: Literal["gemini", "openai", "fallback"] = Field(
        default="gemini",
        description="Источник итоговой оценки (пробрасывается наверх для UI)",
    )
    confidence: Literal["high", "low"] = Field(
        default="high",
        description="Уверенность итоговой оценки",
    )
    fallback_reason: Optional[str] = Field(
        default=None,
        description="Причина fallback для честного отображения в интерфейсе",
    )
    language: str = Field(
        default="python",
        description="Язык верифицированного решения (ключ из SUPPORTED_LANGUAGES)",
    )
    ai_assisted: bool = Field(
        default=False,
        description="Было ли решение помечено кандидатом как созданное с AI-ассистентом",
    )
    duration_ms: int = Field(
        default=0,
        ge=0,
        description="Длительность верификации в миллисекундах",
    )
    rubric_version: str = Field(
        default="2026-11-v1",
        description="Версия рубрики, применённой при оценке",
    )
    model: str = Field(
        default="",
        description="Модель/движок, вынесший итоговый вердикт",
    )
    defense_questions: list[str] = Field(
        default_factory=list,
        description="Три вопроса защиты, выданные вместе с одноразовым токеном",
    )
    defense_token: Optional[str] = Field(
        default=None,
        description=(
            "Одноразовый токен защиты. Возвращается только при выдаче вызова; "
            "null для уже записанной защиты и legacy-карточек"
        ),
    )
    defense_url: str = Field(
        default="",
        description="Ссылка на блок защиты карточки (/card/{card_hash}#defense)",
    )
    defense_status: Literal["pending", "recorded", "unavailable"] = Field(
        default="unavailable",
        description="Состояние защиты: вызов выдан, защита записана или недоступна",
    )
    profile_url: Optional[str] = Field(
        default=None,
        description="Публичный профиль кандидата (/p/{user_id}) или null",
    )


DEFENSE_ANSWER_COUNT = 3
DEFENSE_ANSWER_MIN_CHARS = 20
DEFENSE_ANSWER_MAX_CHARS = 1200


class DefenseRequest(BaseModel):
    """Answers sealed against the challenge token sent in ``X-Defense-Token``."""

    answers: list[str] = Field(
        ...,
        min_length=DEFENSE_ANSWER_COUNT,
        max_length=DEFENSE_ANSWER_COUNT,
        description="Ровно три ответа, каждый 20-1200 символов после strip()",
    )

    @field_validator("answers")
    @classmethod
    def _validate_answers(cls, answers: list[str]) -> list[str]:
        """Strips each answer and enforces the 20-1200 character window."""
        cleaned: list[str] = []
        for index, answer in enumerate(answers, start=1):
            stripped = answer.strip()
            if len(stripped) < DEFENSE_ANSWER_MIN_CHARS:
                raise ValueError(
                    f"ответ {index}: минимум {DEFENSE_ANSWER_MIN_CHARS} символов"
                )
            if len(stripped) > DEFENSE_ANSWER_MAX_CHARS:
                raise ValueError(
                    f"ответ {index}: максимум {DEFENSE_ANSWER_MAX_CHARS} символов"
                )
            cleaned.append(stripped)
        return cleaned


class DefenseResponse(BaseModel):
    """Result of sealing a card defense."""

    defense_hash: str = Field(..., description="SHA-256 канонического набора ответов")
    defense_signature: str = Field(..., description="HMAC-SHA256 подпись защиты")
    answered_count: int = Field(..., description="Количество принятых ответов")
    defended_at: str = Field(..., description="Момент фиксации защиты (UTC ISO 8601)")
