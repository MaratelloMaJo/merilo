# Jury Q&A — три killer questions

Каждый ответ ниже проверяем по файлу, строке или команде из таблицы «Доказательство»: утверждений без ссылки на код или тест здесь нет.

## Q1. «Что будет, если Gemini недоступен?»

### Ответ за 30 секунд

Деградация, а не отказ. Если ключа нет, `_evaluate_with_gemini` вообще не импортирует SDK и сразу вызывает `_fallback`, а тот передаёт управление в `get_fallback_evaluation`. Таймаут, 429 и невалидный JSON после ретраев приводят туда же. Контракт ответа сохраняется — `CodeEvaluationResponse`, но с `evaluation_mode="fallback"`, `confidence="low"` и непустым `fallback_reason`, поэтому происхождение оценки видно и в API, и на карточке. Это детерминированная AST-эвристика: без сети, без второй модели и без таблицы пресетов.

### Доказательство

| Claim | File / command | Что показывает |
|---|---|---|
| Нет ключа — сразу fallback, SDK не трогаем | `backend/verifier.py:331-334` | проверка `get_gemini_api_key()` и `return _fallback(...)` стоят до `from google import genai` |
| `_fallback` — тонкая обёртка над офлайн-оценщиком | `backend/verifier.py:309-312`; `backend/fallback_cache.py:1030-1039` | один вызов `get_fallback_evaluation`, никакого сетевого ввода-вывода |
| Происхождение оценки раскрывается в схеме | `backend/schemas.py:50-61` | поля `evaluation_mode: Literal["gemini","fallback"]`, `confidence: Literal["high","low"]`, `fallback_reason` |
| Это эвристика, а не вторая AI и не кэш пресетов | `backend/fallback_cache.py:752-758`, `backend/fallback_cache.py:1035-1038`; `tests/test_fallback.py:35` | контракт детерминизма по AST-признакам; тест запрещает `PRESET_EVALUATIONS`; `git grep -nE "genai|requests|urllib|http" -- backend/fallback_cache.py` не находит сетевых вызовов |
| Ошибки Gemini тоже ведут в fallback | `backend/verifier.py:439`; `tests/test_gemini_mock.py:177`, `tests/test_gemini_mock.py:196`, `tests/test_gemini_mock.py:214` | 429, таймаут и невалидная схема после ретраев дают `evaluation_mode="fallback"` |
| Без ключа SDK не конструируется | `tests/test_gemini_mock.py:245` | тест подменяет `genai.Client` на функцию, которая обязана упасть |
| Прозрачность проверяется тестом | `tests/test_fallback.py:61` | `evaluation_mode == "fallback"`, `confidence == "low"`, `fallback_reason` непустой |
| Все тесты зелёные | `python -m pytest tests/test_fallback.py tests/test_gemini_mock.py -q` | 23 теста, exit code 0 |
| Латентность fallback измерена | `python scripts/bench.py --mode fallback --requests 10` | p50 13,4 мс / p95 14,3 мс, n=10, 0 ошибок, 2026-11-08; на холодном процессе первый прогон дал p50 18,1 мс / p95 19,9 мс |
| Живой Gemini p95 не измерен | нет ключа и квоты в демо-среде | эту метрику мы не заявляем и не подставляем вместо неё fallback-цифру |

### Ограничение

Fallback-оценка — низкоуверенное приближение: она не заменяет суждение модели и не должна выдаваться за финальный скор без человека.

## Q2. «У вас HMAC-секрет в коде?»

### Ответ за 30 секунд

В коде секрета нет. `_load_hmac_secret()` читает `MERILO_HMAC_SECRET` и два legacy-алиаса; в production без секрета процесс падает на старте с `RuntimeError`, а не подписывает карточки угадываемым литералом. В development генерируется эфемерный `secrets.token_bytes(32)` с предупреждением в stderr. Подпись — HMAC-SHA256, все сравнения через `hmac.compare_digest`. Старый литерал действительно был в коммите `ba02d14`; в HEAD его нет, историю без разрешения владельца не переписывали, значение считаем скомпрометированным.

### Доказательство

| Claim | File / command | Что показывает |
|---|---|---|
| Секрет берётся только из окружения | `backend/db.py:28-45` | `MERILO_HMAC_SECRET` — каноническое имя, `MERILO_SECRET_KEY` и `MARYM_SECRET_KEY` — legacy-алиасы |
| Production без секрета не стартует | `backend/db.py:47-52` | `MERILO_ENV=production` и пустой секрет дают `RuntimeError` с требованием `MERILO_HMAC_SECRET` |
| В dev — эфемерный ключ с предупреждением | `backend/db.py:54-59` | `secrets.token_bytes(32)` и явный warning, что подписи не переживут рестарт |
| Подпись — HMAC-SHA256 по трём полям | `backend/db.py:123-129` | payload `card_hash:user_id:total_score`, ключ `SECRET_KEY`, `hashlib.sha256` |
| Сравнение подписи — constant-time | `backend/db.py:143`; `tests/test_secrets.py:69` | `hmac.compare_digest`; тест запрещает сравнение `signature ==` |
| Пакет тестов на секреты | `tests/test_secrets.py:25`, `:36`, `:44`, `:52`, `:69`, `:76` | dev-ключ, fail-fast в production, старт с секретом, детект подмены, `compare_digest`, отсутствие литералов в `backend/*.py` |
| Плейсхолдеры пустые, `.env` не в репозитории | `.env.example:27`; `.gitignore:2` | `MERILO_HMAC_SECRET=` без значения; `.env` игнорируется git |
| Старый литерал был, но не в HEAD | `git show ba02d14:backend/db.py`; `git grep -n "SECRET_KEY = " -- backend` | в той ревизии `SECRET_KEY` имел дефолтный литерал; в HEAD команда даёт только `backend/db.py:62: SECRET_KEY = _load_hmac_secret()` — литерала нет |
| В коде нет других жёстких секретов | `git grep -nE "(secret|token|password)\s*=\s*['\"][^'\"]{8,}" -- backend static` | 0 совпадений (exit code 1) |
| Ротация обесценивает старые карточки | `backend/db.py:132-143`; `tests/test_secrets.py:52` | подпись пересчитывается текущим ключом, поэтому после смены секрета старые карточки не проходят проверку и требуют перевыпуска |
| Тесты зелёные | `python -m pytest tests/test_secrets.py -q` | 10 тестов, exit code 0 |

### Ограничение

HMAC подтверждает, что карточку подписал сервер, но не подтверждает, что выставленная в ней оценка верна.

## Q3. «Regex — это не semantic security»

### Ответ за 30 секунд

Согласны, это не semantic security. Gate 2 — pattern-based щит по известным формулировкам, `INJECTION_KEYWORDS`. Поэтому слоёв четыре: tree-sitter-парсинг отсекает не-код; regex ищет известные паттерны до и после Gate 1; модель после вызова выставляет флаг `is_plagiarized_or_injected`; офлайн-fallback тоже классифицирует инъекции с `confidence="high"`. Тесты фиксируют и блокировку, и отсутствие ложных срабатываний на документации. Мы нигде не называем этот слой семантическим: в коде и документации он честно называется pattern-based.

### Доказательство

| Claim | File / command | Что показывает |
|---|---|---|
| Gate 1 — tree-sitter-разбор любого поддерживаемого языка | `backend/verifier.py:713-719`, `backend/languages.py:791` | `analyze_code(submitted_code, language)` через tree-sitter; при ошибке парсинга — `status="rejected"`, `gate_reached=1` |
| Regex-щит стоит до и после Gate 1 | `backend/verifier.py:724`, `backend/verifier.py:782` | поиск `INJECTION_KEYWORDS` и в ветке синтаксической ошибки, и в основной ветке Gate 2 |
| Паттерны — фиксированный список, не модель | `backend/fallback_cache.py:144-147` | `INJECTION_KEYWORDS` собран из `_INJECTION_RULES` с `re.IGNORECASE` |
| Флаг модели — отдельный слой | `backend/verifier.py:679-688` | `evaluation.is_plagiarized_or_injected` приводит к `_blocked_response(..., gate=2)` |
| Fallback тоже ловит инъекции | `backend/fallback_cache.py:759-771` | при совпадении паттерна — нулевые баллы, `is_plagiarized_or_injected=True`, `confidence="high"` |
| Bare-инъекция блокируется на Gate 2 | `tests/test_injection_shield.py:30` | директива без валидного кода не уходит в Gate 1 как «просто синтаксис» |
| Директива внутри валидного кода блокируется | `tests/test_injection_shield.py:44` | код парсится, но regex всё равно даёт block на Gate 2 |
| Документация не даёт ложных срабатываний | `tests/test_injection_shield.py:154`, `tests/test_injection_shield.py:150` | упоминание «system prompt» в docstring и термины prompt engineering не блокируются |
| Все засеянные пресеты инъекций блокируются | `tests/test_injection_shield.py:203` | матрица «задача × injection preset» → `blocked`, Gate 2, счёт 0 |
| Блокировка видна на уровне HTTP | `tests/test_injection_shield.py:224` | тот же результат через `POST /api/submissions/verify` |
| Тесты зелёные | `python -m pytest tests/test_injection_shield.py -q` | 38 тестов, exit code 0 |
| Мы не выдаём regex за семантику | `git grep -in "semantic security" -- backend README.md static` → 0 совпадений; в `docs/` формулировки только отрицательные | в коде, README и статике положительных заявлений нет |

### Ограничение

Перефразированная или обфусцированная инъекция может обойти regex, а флаг модели доступен только когда Gemini отвечает, поэтому это defense-in-depth, а не гарантия.

## Что отвечать, если давят

1. **Признайте границу одной фразой.** «Да, regex не понимает смысл — поэтому это один из четырёх слоёв, а не единственная защита».
2. **Покажите тест.** Назовите файл и запустите `python -m pytest tests/test_injection_shield.py -q` (или `tests/test_secrets.py`, или `tests/test_gemini_mock.py`) — exit code 0 говорит сам за себя.
3. **Покажите файл и строку.** Откройте `backend/verifier.py:656`, `backend/db.py:47` или `backend/fallback_cache.py:1030` и дайте жюри прочитать код, а не слайд.
