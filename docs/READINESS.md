# READINESS — журнал готовности Merilo (NFC 2026)

> Правило журнала: пункт закрывается **файлом, командой или замером**, а не обещанием.
> Всё, что не проверялось, помечено `[!]` и остаётся в списке ограничений.
> Актуальные числа: **397 тестов, покрытие 85,30 %** (замер 2026-11-13, порог CI 80 %). Числа в исторических разделах P1/P4 — это срез на дату закрытия, а не текущее состояние.
> Финальный релиз 2026-11-13: Docker-образ собран и прогнан (`merilo-final`, 326 МБ, uid 10001, smoke 200 по всем маршрутам), CI-workflow лежит в репозитории. Полный аудит — `docs/FINAL_AUDIT.md`.

## Легенда

- `[x]` закрыто с доказательством
- `[~]` в работе
- `[!]` невозможно без внешних данных — честно фиксируем «не измерено»

---

## P0 — безопасность и отсутствие дисквалификации

| # | Задача | Доказательство | Статус |
|:--|:---|:---|:---|
| P0.1 | `backend/db.py`: убрать литерал секрета. Читать `MERILO_HMAC_SECRET` (+ legacy alias), в dev — эфемерный `secrets.token_bytes(32)` + warning, `MERILO_ENV=production` без секрета — fail fast | `backend/db.py:28-62`; dev import ok, prod exit=1 с `RuntimeError` | [x] |
| P0.2 | HMAC-сравнения только `hmac.compare_digest` (подпись карты, сессия) | `backend/db.py:123-170`; tamper-тест в `tests/test_secrets.py` | [x] |
| P0.3 | `backend/seed_data.py`: убрать `marat2026`. `MERILO_DEMO_PASSWORD` или случайный при первом сидинге, печать один раз в консоль; хранение scrypt с солью; старые PBKDF2-хеши продолжают верифицироваться; повторный сидинг идемпотентен | `backend/seed_data.py:257-271`, `backend/db.py:76-120`; `pytest tests/test_secrets.py` → 10 passed; в production пароль не печатается | [x] |
| P0.4 | `static/app.js`: удалить хардкод демо-паролей (`marat2026`, `recruiter2026`); quick-login не отправляет встроенные креды; zero-auth демо не ломается | `git grep -n "marat2026\|recruiter2026" -- static/` → пусто; `node --check` ok | [x] |
| P0.5 | `.env.example` с пустыми плейсхолдерами: `MERILO_ENV`, `MERILO_DB_PATH`, `PORT`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `MERILO_HMAC_SECRET`, `MERILO_DEMO_PASSWORD`, `RATE_LIMIT_*` | `.env.example` (значения пустые); `git check-ignore -v .env` | [x] |
| P0.6 | `.gitignore`: `.env`, `*.db`, `.venv`, `__pycache__`, `output/` | `git check-ignore -v` для всех путей | [x] |
| P0.7 | Тесты P0: dev без env стартует; production без `MERILO_HMAC_SECRET` — отказ; нет `==` для HMAC; пароля нет в исходниках; повторный сидинг идемпотентен | `python -m pytest tests/test_secrets.py -q` → **10 passed** | [x] |
| P0.8 | Аудит секретов: `git grep` по ключевым паттернам, `git log -- .env`, проверка HEAD и истории | HEAD: реальных ключей нет, `.env` не отслеживается; старый литерал только в истории `ba02d14` | [x] |
| P0.9 | README: «Semantic Security Guard» → «Pattern-based prompt-injection shield + AST gate»; PostgreSQL — «production blueprint … demo runtime uses SQLite»; таблица Claim → Evidence → File/command; раздел Security; без неподтверждённых метрик | README; grep по старым формулировкам пуст | [x] |

**Acceptance P0:** `git grep` не находит реальных секретов в HEAD; dev стартует без
`.env`; production без `MERILO_HMAC_SECRET` отказывает; README не противоречит коду.

---

## P1 — работоспособность, тесты, обработка ошибок

- [x] **C1:** точные версии в `requirements.txt`; `requirements-dev.txt`;
  `requirements.lock` из чистого venv; `scripts/run_demo.py`; Quickstart Windows
  PowerShell и Linux/macOS (без ключа / с ключом); идемпотентный `lifespan`;
  `/api/health` (`status`, `mode`, `version`, `model`, `db`); аддитивный `/api/ready`.
  Доказательство: `tests/test_health.py`, `tests/test_db.py`; `python scripts/run_demo.py --help`.
- [x] **C2:** `GEMINI_MODEL` по умолчанию `gemini-3.6-flash`, fallback
  `gemini-3.5-flash` → `gemini-3.5-flash-lite`; `GEMINI_API_KEY` и `LLM_API_KEY`;
  `types.GenerateContentConfig(temperature=0.0, response_mime_type="application/json",
  response_schema=CodeEvaluationResponse)`; таймаут 6 с, 1 retry, 404/429/5xx →
  fallback; `PRESET_EVALUATIONS` удалён; AST-эвристика возвращает
  `evaluation_mode="fallback"`, `confidence="low"`, `fallback_reason`; TTL-кэш
  реальных ответов по SHA-256(`task_id` + `model` + код).
  Доказательство: `tests/test_fallback.py`, `tests/test_injection_shield.py`,
  `tests/test_gemini_mock.py` (404/429/timeout/schema/retry/cache без сети).
- [x] **N4:** `tests/` — 10 файлов на момент закрытия P1 (AST, injection shield, fallback, API contract,
  card hash, db, rate limit, health, secrets, mocked Gemini) + `conftest.py`;
  исторический прогон P1: **109 passed**; покрытие **84,29 %** при гейте 70 %; `.github/workflows/ci.yml`
  (Python 3.11/3.12, ruff, pytest, `--cov-fail-under=80`) — `.github/workflows/ci.yml` в репозитории.
  Команда: `python -m pytest -q --cov=backend --cov-report=term-missing --cov-fail-under=80`.
  Актуальный замер 2026-11-13: **397 тестов, 85,30 %** (см. верх журнала).
- [x] **N5:** bare `except` отсутствует (`git grep -n "except:" -- backend` → пусто);
  структурные логи `request_id`, `task_id`, `gate`, `latency_ms`, `error_code`;
  JSON-конверт ошибок без stack trace; 413 при коде > 64 KB; 429 на
  `/api/submissions/verify` и `/api/tasks`.
  Доказательство: `tests/test_api_contract.py`, `tests/test_rate_limit.py`.
- [x] **C4:** пустой код → 400; невалидный UTF-8 → 400; > 64 KB → 413; неизвестный
  `task_id`/`card_hash` → 404; повторная отправка того же кода → тот же `card_hash`;
  WAL + `busy_timeout=5000`; Gemini недоступен → `evaluation_mode="fallback"` без
  фиктивных 98. Доказательство: `tests/test_api_contract.py`, `tests/test_card_hash.py`,
  `tests/test_db.py`.

**Acceptance P1 (исторический срез на момент закрытия):** `compileall` exit 0; `ruff` — All checks passed;
`pytest --cov` — 109 passed, 84,29 %; ошибки API — JSON. Актуальный замер 2026-11-13: 397 тестов, 85,30 %.
Исторический срез на момент закрытия P1: 69 passed, 82,72 % (до расширения набора тестов).

> Live-путь Gemini на момент P1 не проверялся: не было квоты. Mock-тесты покрывают
> 404/429/timeout/schema/retry/cache. Исторический прогон P4 (2026-11-09) сообщал живой
> вызов; в текущей сборке 2026-11-13 он не перепроверялся и помечен `UNKNOWN` в `docs/EVIDENCE.md`.

---

## P2 — доказательства: UI, скриншоты, демо-путь

- [x] **D1:** палитра `#0B0D0F / #11151A / #161B22`, акценты, Inter/Geist; 360 px+;
  состояния idle / loading / success / blocked / error / empty + Gate 1/2/3;
  a11y AA, `focus-visible`, aria, reduced-motion; title/description/OG; zero-auth сохранён.
- [x] **E1:** реальные PNG в `screenshots/`: `landing-1440.png`, `landing-390.png`,
  `card-gold.png`, `injection-blocked.png`, `architecture.png`; мокапов нет.
- [x] **D2:** 60-секундный journey `/` → кейс → preset ideal → verify → карточка →
  `/card/{hash}`; stepper 1→2→3; `docs/DEMO.md`; три пресета дают
  verified / needs work / blocked.
- [x] **D3:** `Dockerfile` (`python:3.12-slim`, non-root, healthcheck `/api/health`,
  без `.env`); `render.yaml`; `docs/DEPLOY.md`; метрики
  `request_id / latency / fallback_rate / blocked_rate`; `scripts/bench.py` p50/p95.
- [x] **E2:** адаптив 390 px; CSS от 360 px; `focus-visible` / aria / reduced-motion;
  360 px снят отдельно на P4.
- [x] **Latency:** middleware `X-Response-Time`; fallback p95 < 200 мс (измерено
  81,7 мс на P3); Gemini timeout 6 с; без заявлений «sub-second AI».
- [x] **A1:** `docs/PROBLEM.md` — проблема, аудитория, TAM/SAM/SOM как оценка,
  plan 5 интервью.
- [x] **A2:** поток «боль → решение → дифференциация»; без выдуманных цифр и клиентов.
- [x] **A3:** `docs/COMPETITORS.md` — Codility, HackerRank, TestGorilla и др.
- [x] **B1:** 3-шлюзовая архитектура + Verified Skill Card + SHA-256 + fallback;
  без «магии Gemini».
- [x] **B2:** Mermaid: AST → injection shield → LLM rubric → deterministic fallback → hash → SQLite.
- [x] **B3:** moat / scalability / roadmap без «$100M ARR».

### Факты проверки P2 (2026-11-08)

**Код и тесты.** `compileall` exit 0; `ruff` All checks passed; на этот момент
105 passed, покрытие 84,25 %; `node --check static/app.js` exit 0.

**Три пресета (fallback, без Gemini-ключа, чистая БД, порт 8013).**

| Задача | ideal | vulnerable | injection |
|:---|:---|:---|:---|
| task-fintech-01 | verified / gate 3 / 90 / Gold Verified | verified / gate 3 / 52 / Needs Work | blocked / gate 2 / 0 / Rejected |
| task-logistics-02 | verified / gate 3 / 89 / Gold Verified | verified / gate 3 / 42 / Needs Work | blocked / gate 2 / 0 / Rejected |
| task-edtech-03 | verified / gate 3 / 91 / Gold Verified | verified / gate 3 / 53 / Needs Work | blocked / gate 2 / 0 / Rejected |

Детерминизм: повторный ideal-прогон `task-fintech-01` дал тот же `card_hash` и ту же
`signature`. `GET /api/cards/{hash}` → 21 ключ, `is_signature_valid=true`.

**Скриншоты (реальный Chrome, без мокапов, без подмены API).**

| Файл | Размер | Снимок |
|:---|:---|:---|
| `screenshots/landing-1440.png` | 196,9 KB | 1440×1021 |
| `screenshots/landing-390.png` | 166,1 KB | 390×2306, `scrollWidth=390` |
| `screenshots/card-gold.png` | 144,6 KB | 1280×1271, Gold Verified, 89/100, hash `8ae69306c608` |
| `screenshots/injection-blocked.png` | 246,6 KB | 1440×1403, `Score: 0 · Gate 2 · Blocked` |
| `screenshots/architecture.png` | 312,9 KB | 3306×3760, рендер Mermaid из README |

**Латентность P2** (`scripts/bench.py`, n=10 http / n=20 fallback): `GET /api/health`
p50 7,0 / p95 7,7 мс; `POST /api/submissions/verify` (fallback) p50 58,9 / p95 62,5 мс;
`get_fallback_evaluation` p50 12,5 / p95 12,8 мс; Gemini Gate 3 — не измерялось.
`X-Response-Time` и `X-Request-ID` подтверждены на всех эндпоинтах.

**Не проверено на P2:** `docker build` / `docker run` (демон был недоступен —
выполнено на P4); деплой на Render; живой Gemini (закрыто на P4).

---

## P3 — презентация: README-лендинг, Evidence Index, питч, офлайн-демо

- [x] README-лендинг: скриншоты, проблема, демо за 60 секунд, архитектура,
  метрики, Security, ограничения, Evidence Index на 23 строки.
- [x] `docs/PITCH.md`: питч на 3 минуты + 30-секундная версия, 10 Q&A, backup-слайды.
- [x] `docs/JURY_QA.md`: три killer question с доказательствами файл/строка/команда.
- [x] `docs/offline-demo.html` — статический HTML, 12 166 байт, 0 внешних ссылок и
  0 `<img>`: вердикты, таблицы и подписи нарисованы текстом и CSS, страница
  открывается с `file://` без сети. Перепроверено 2026-11-13 в headless Chrome с
  выключенным сетевым стеком: 0 ошибок консоли, 0 сетевых запросов.

### Факты проверки P3 (2026-11-08)

- README: 354 строки на момент проверки; 3 hero-скриншота; Evidence Index 23 строки
  (A1–A3, B1–B3, C1–C4, D1–D3, E1–E2, N1–N8); проверка запрещённых строк
  (`gemini-2.5`, `2.5 Flash`, `98/95/96`, `sub-second`, `semantic security`) — 0 совпадений.
- PITCH: 180 с, 10 вопросов, backup B1–B8.
- JURY_QA: `pytest tests/test_fallback.py tests/test_gemini_mock.py -q` → 23 passed;
  `pytest tests/test_secrets.py -q` → 9 passed (на P4 — 10);
  `pytest tests/test_injection_shield.py -q` → 38 passed.
- Offline: страница `docs/offline-demo.html` открыта в реальном Chrome с `file://`
  при выключенной сети; 0 внешних ссылок, 0 `<img>`, 0 ошибок консоли
  (перепроверено 2026-11-13);
  горизонтального скролла нет.
- Bench (порт 8017, без ключа, временная SQLite, n=10): health p50 8,01 / p95 9,14 мс;
  verify fallback p50 69,97 / p95 81,72 мс; `get_fallback_evaluation` p50 13,35 /
  p95 14,26 мс; 0 ошибок, 0 rate-limited; `/api/ready` → `mode=fallback`,
  `model=gemini-3.6-flash`.
- Пресеты `task-fintech-01`, кандидат «P3 Audit»: ideal verified gate 3 90 Gold
  `d897bc535170`; vulnerable verified gate 3 52 Needs Work `13a9f361a692`;
  injection blocked gate 2 0 Rejected `f01dcd4bbf22`; повтор ideal → тот же hash;
  `GET /api/cards/d897bc535170` → `is_signature_valid=true`, 21 ключ.
- На момент P3 живой Gemini не вызывался и Docker не собирался — закрыто на P4.
  Интервью и пилоты не проводились и кодом не закрываются.

**Acceptance P3 — выполнено:** README читается без кода; Evidence Index покрывает
23 критерия; питч укладывается в 180 с; три killer answer готовы; офлайн-демо существует.

---

## P4 — финальная верификация (исторический срез 2026-11-09)

- [x] Чистый venv вне репозитория (Python 3.14.6): `pip install -r requirements.txt
  -r requirements-dev.txt` → exit 0; `uvicorn` на 8123 без ключа и без `.env`;
  `/api/health` 200; `/api/ready` `mode=fallback`; `/api/tasks` 3 кейса; 9/9 пресетов;
  `/card/{hash}` 200 + `is_signature_valid=true`; 400/413/404/429; fallback не содержит 98/95/96.
- [x] С ключом (исторический прогон 2026-11-09; в текущей сборке не перепроверялся): `/api/ready` → `{"ready":true,"db":"ok","gemini_key":true,"model":"gemini-3.6-flash","mode":"live"}`.
  Один `POST /api/submissions/verify` (`task-fintech-01`, ideal, 2 597 символов) →
  HTTP 200, verified, gate 3, **100**, Gold Verified, `card_hash=821a151cc9e4`,
  `evaluation_mode="gemini"`, `fallback_reason=null`, `confidence="high"`, подпись
  валидна, `X-Response-Time: 3958.0`, wall 4 041 мс. Цепочка: `gemini-3.6-flash`
  429 ×2 → `gemini-3.5-flash` 429 ×2 → `gemini-3.5-flash-lite` 200 за 1,67 с;
  в логе `verify_gemini_ok model=gemini-3.5-flash-lite`, `gate=3 latency_ms=3947.8`;
  строки `verify_fallback` нет. `GET /api/cards/821a151cc9e4` → 200, подпись валидна.
- [x] `compileall` exit 0; `ruff check backend tests scripts` → All checks passed;
  исторический прогон P4: `pytest` **109 passed**, 0 failed/skipped, покрытие **84,29 %** при пороге 70 %;
  актуальный замер 2026-11-13: **397 тестов, 85,30 %**;
  `node --check static/app.js` exit 0. Модули: `db.py` 82 %, `main.py` 73 %,
  `verifier.py` 84 %, `fallback_cache.py` 88 %, `schemas.py` 95 %, `seed_data.py` 100 %.
- [x] Browser QA в реальном Chrome: 1440×900, 390×844 и 360×800; journey
  `/` → кейс → ideal → verify → `/card/{hash}`; vulnerable = Needs Work;
  injection = `blocked`, Gate 2, 0, без 5xx и без Gold; loading/disabled/error/retry/429
  проверены. Мобильная CTA `#mobile-verify-cta` видна на первом экране
  (390×844: `y775 h69`, кнопка 358×44; 360×800: `y731 h69`, кнопка 328×44),
  `scrollWidth` равен вьюпорту, горизонтального скролла нет; бар скрыт в режиме
  рекрутера. 7 PNG в `screenshots/p4/`; 5 старых PNG валидны и не перезаписывались.
- [x] Docker: `docker build -t merilo:p4b .` → exit 0, **288 МБ**, `python:3.12-slim`,
  `uid=10001(merilo)`; `/app` = `backend data requirements.txt sql static`, без `.env`
  и `*.db`; `HEALTHCHECK` → `healthy` за ~8–12 с. 9/9 пресетов в контейнере без ключа
  и без `.env`: `90/52/0`, `89/42/0`, `91/53/0`; все три инъекции `blocked` на Gate 2,
  `Rejected`; подпись валидна; 98/95/96 отсутствуют. Детерминизм: одинаковый
  `card_hash=8c101d0a2a98` на двух независимых свежих volume, обе подписи валидны.
  В production-логах нет демо-пароля и токена — только
  `demo login disabled: set MERILO_DEMO_PASSWORD to enable it`.
- [!] **A3** — первичного исследования спроса нет: интервью, пилоты и лист ожидания
  не проводились. Документальные рыночные доказательства есть (`docs/PROBLEM.md`,
  `docs/COMPETITORS.md`), но это не первичные данные.
- [!] **D3** — измеренной на реальном пилоте бизнес-метрики нет: определённая метрика
  экономии времени описана, замер на пользователях не делался.
- [!] Старый литерал секрета в истории `ba02d14` — HEAD чистый, переписывание истории
  требует явного согласия владельца и не выполнялось.
- [!] Render не задеплоен: живого URL нет, проверены только синтаксис и дизайн `render.yaml`.

### Факты проверки P4 (2026-11-09)

- API-матрица (fallback, без ключа): `task-fintech-01` 90/52/0, `task-logistics-02`
  89/42/0, `task-edtech-03` 91/53/0 (ideal/vulnerable/injection); injection везде
  `blocked`/gate 2; повтор ideal → тот же `card_hash` (снимок до фикса `create_user`
  — `2e92ff456cf0`; после фикса между БД — `8c101d0a2a98`); карточка → 21 ключ,
  `is_signature_valid=true`. Те же 9 отправок воспроизведены в контейнере с теми же баллами.
- Ошибки: 400 (пустой код), 413 (> 64 KB), 404 (task/card), 429 (`200, 200, 429`
  при лимите 2) — все в JSON-конверте.
- Латентность после фиксов (n=20, warmup=3, без ключа, два прогона подряд):
  health p50 6,26/6,17, p95 7,47/7,17 мс; verify p50 **60,42/61,31**, p95
  64,70/69,39 мс; `get_fallback_evaluation` p50 **12,97/12,56**, p95 14,94/15,27 мс;
  0 ошибок, 0 rate-limited. Относительно baseline этого прохода (verify p50 57,03,
  fallback p50 12,37) это +3,4…+4,3 мс (+6–7,5 %) на verify p50; горячий путь
  побайтово совпадает с baseline, `create_user` на нём не вызывается,
  health/fallback сдвинулись в ту же сторону (+2–4 %) — дрейф машины, не регрессия.
- Живой Gemini (исторический прогон 2026-11-09, в текущей сборке не перепроверялся): `/api/ready` `mode=live`; один POST, wall 4 041 мс,
  `X-Response-Time: 3958.0`, score 100, Gold Verified, hash `821a151cc9e4`,
  `evaluation_mode="gemini"`, `fallback_reason=null`; цепочка `gemini-3.6-flash`
  429 ×2 → `gemini-3.5-flash` 429 ×2 → `gemini-3.5-flash-lite` 200 за 1,67 с;
  `verify_gemini_ok model=gemini-3.5-flash-lite`, `gate=3 latency_ms=3947.8`.
- Docker: 288 МБ, `uid=10001`, HEALTHCHECK `healthy` за 8–12 с, без `.env`/`*.db`;
  9/9 пресетов; две свежие volume → один `8c101d0a2a98`; пароль/токен в логи не попадают.
- UI-фиксы P4: конверт ошибок `{"error":{"message","details"}}` в login/register/task
  publish; снят `Uncaught (in promise)`; убрана двойная точка; табы кейсов на 390 px
  в столбик; inline favicon (404 устранён); sticky CTA на первом экране;
  `scrollWidth` равен вьюпорту на 360 и 390 px.

**Итог P4 (2026-11-09, исторический срез).** Все локальные проверки были зелёными; исторический
живой вызов Gemini (`gemini-3.5-flash-lite` после 429 на старших моделях) не перепроверялся в текущей сборке и помечен `UNKNOWN` в `docs/EVIDENCE.md`; Docker 288 МБ, `uid 10001`,
детерминизм `8c101d0a2a98`; на 2026-11-09 — 109 тестов, покрытие 84,29 %. Актуальный замер
2026-11-13: 397 тестов, 85,30 %. Незакрытыми остаются
только внешние пункты: A3, D3, переписывание истории, Render.

---

## P5 — финальный релиз (2026-11-13)

Инфраструктура перенесена из ветки `deploy` в основную ветку релиза: `Dockerfile`,
`.dockerignore`, `fly.toml`, `docker-entrypoint.sh`, `render.yaml`,
`.github/workflows/ci.yml`. Перенос сделан выборочным `git checkout deploy -- …`,
а не merge: merge вернул бы старый код.

| Проверка | Команда | Результат |
|:---|:---|:---|
| Тесты | `python -m pytest -q -o addopts="" --cov=backend` | **397 passed**, 2 warnings, 20,8 с |
| Покрытие | та же команда | **85,30 %** (2240 из 2626), порог CI поднят с 70 до **80** |
| Ruff | `python -m ruff check backend tests scripts` | All checks passed |
| Compile | `python -m compileall -q backend tests scripts` | exit 0 |
| JS | `node --check static/app.js` | exit 0 |
| Docker build | `docker build -t merilo-final .` | exit 0, **326 МБ**, только wheels, компилятор не нужен |
| Non-root | `docker top merilo-t12 -o pid,user,args` | uvicorn под `10001`, entrypoint сбрасывает root |
| Healthcheck | `docker ps` | `Up … (healthy)` |
| Образ без секретов | `find /app -name .env -o -name '*.db'` | пусто; `/app` = `backend data docs requirements.txt sql static` |
| Container smoke | `docs/FINAL_AUDIT.md` §2 | `/`, health, ready, tasks (8), verify JS (91) и Go own-code (88), card, manifest, badge, QR, well-known, evidence — **200** |
| Адаптив | headless Chrome, CDP | 320/768/1024/1440 — `scrollWidth == clientWidth`, 0 ошибок консоли |
| Офлайн | CDP, сеть выключена | 0 внешних ссылок, 0 ошибок |
| Живой Fly | `GET https://merilo-nfc.fly.dev/api/health` | **200**, но `/api/tasks` = 3 кейса: требуется редеплой из `main` |

Важно для деплоя: `fly.toml` не хранит секреты. Перед `fly deploy` нужны
`fly secrets set MERILO_HMAC_SECRET=…` (иначе production падает на старте по
fail-fast) и, для переносимости манифестов между рестартами,
`fly secrets set MERILO_ED25519_SEED=…`.

---

## Ограничения (кодом не закрываются)

- Реальные интервью, клиенты и выручка — только `validation plan`, данных нет.
- История git: переписывание — только после явного решения владельца.
- Render: деплой не выполнялся, живого URL нет.
- Рубрика 30/40/30 не откалибрована против оценок тимлидов.
- Rate limit хранится в памяти процесса; SQLite — один писатель; RLS в демо не активен.
