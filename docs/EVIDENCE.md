# Evidence — что и чем подтверждено

> **Дата сбора доказательств: 2026-11-13.** Каждое число в этом документе получено командой, прочитано в файле кода или взято из датированного внешнего источника. Если число не удалось подтвердить, оно помечено `UNKNOWN` или `[assumption]` — не «примерно» и не «на глаз».
>
> Окружение замеров: Windows, Python 3.14.6, локальная машина, `GEMINI_API_KEY` не задан (все оценки — детерминированный fallback), временная SQLite, порт 8019. Числа латентности не переносятся на другое железо. Внешний рынок — снимок hh.kz на 2026-11-13; он меняется ежедневно.

## 1. Технические доказательства (измерено в этой сессии)

| Claim | Value | Source | URL | Date | Supports | Confidence |
|:---|:---|:---|:---|:---|:---|:---|
| Набор тестов проходит | **397 passed**, 2 warnings; 20–23 с на этой машине (время плавает от прогрева кэша) | `python -m pytest -q -o addopts="" --basetemp=%TEMP%\merilo_t9 --cov=backend` | `tests/` | 2026-11-13 | C4, N4 | высокая — измерено |
| Покрытие `backend/` | **85,30 %** (2240 из 2626 инструкций; pytest-cov округляет до 85 %) | та же команда с `--cov=backend --cov-report=term` | `tests/` | 2026-11-13 | C4 | высокая — измерено |
| Латентность `GET /api/health` | p50 **6,53 мс**, p95 **7,17 мс**, n=20, 0 ошибок | `python scripts/bench.py --base-url http://127.0.0.1:8019 --requests 20 --warmup 3 --mode all` | `scripts/bench.py` | 2026-11-13 | D3 (техническая часть) | высокая для этой машины |
| Латентность `POST /api/submissions/verify` (fallback) | p50 **82,97 мс**, p95 **89,23 мс**, n=20, 0 ошибок | тот же прогон `scripts/bench.py` | `scripts/bench.py` | 2026-11-13 | C2, D3 | высокая для этой машины |
| Латентность `get_fallback_evaluation` (in-process) | p50 **15,66 мс**, p95 **16,87 мс**, n=20; единичный выброс 356,81 мс в max | тот же прогон `scripts/bench.py` | `backend/fallback_cache.py` | 2026-11-13 | ADR-005 | средняя — выброс честно показан |
| Три FinTech-пресета дают ожидаемые вердикты | ideal `verified` / 3 / **90** / Gold; vulnerable `verified` / 3 / **52** / Needs Work; injection `blocked` / 2 / **0** / Rejected | три `POST /api/submissions/verify` по `preset_ideal`, `preset_vulnerable`, `preset_injection` | `backend/seed_data.py` | 2026-11-13 | C2 | высокая — измерено |
| Повторная отправка того же кода даёт тот же `card_hash` | ideal → `c43265a13d32` для канонического входа `task-fintech-01` + `candidate_name="Evidence Check"` + `preset_ideal` на seeded-аккаунте `marat@merilo.kz` (включая 20 вызовов бенчмарка) | те же вызовы verify; хэш — первые 12 hex SHA-256 от `task_id:candidate_name:status:total_score:user_id:sha256(code)`; другое имя даёт другой хэш | `backend/verifier.py` | 2026-11-13 | B2, ADR-004 | высокая в пределах одной базы |
| Ed25519-манифест проверяется офлайн | `VALID` для реального манифеста; `INVALID` и exit 1 после изменения поля `score` | `python scripts/verify_card.py --file manifest.json`; затем тот же файл с испорченным полем | `scripts/verify_card.py`, `backend/signing.py` | 2026-11-13 | E2, D2 | высокая — измерено |
| Публичный ответ карточки не содержит кода и токенов | 27 ключей; нет `submitted_code`, `user_id`, `defense_token`, хэшей токенов | `GET /api/cards/c43265a13d32` (карточка `candidate_name="Evidence Check"`) + белый список `PUBLIC_CARD_FIELDS` | `backend/db.py:916` | 2026-11-13 | E2, N2 | высокая — код + живой ответ |
| Ответ verify содержит токен защиты и 23 ключа | `defense_status=pending`, `defense_token` выдан только при выдаче вызова | `POST /api/submissions/verify` (ideal) | `backend/schemas.py:218` | 2026-11-13 | E2 | высокая — измерено |
| Защита карточки защищена на уровне API | без заголовка → **401**; неверный токен → **403**; первый seal → **200**; повторный seal → **409** | четыре вызова `POST /api/cards/c43265a13d32/defense` | `backend/main.py:879` | 2026-11-13 | C2, E2 | высокая — измерено |
| SVG-бейдж отдаётся | **200**, `image/svg+xml`, 1621 байт для `c43265a13d32` | `GET /badge/c43265a13d32.svg` | `backend/signing.py` | 2026-11-13 | E2 | высокая — измерено |
| Публичный trust-документ описывает Ed25519 и языки | `algorithm=Ed25519`, `manifest_version=merilo-card-v1`, 13 языков | `GET /.well-known/merilo.json` | `backend/main.py:589` | 2026-11-13 | E2 | высокая — измерено |
| Разбирается 13 языков | 13 ключей в `SUPPORTED_LANGUAGES`; тесты фиксируют состав | `tests/test_languages.py`, `tests/test_static_contract.py` | `backend/languages.py:167` | 2026-11-13 | B1 | высокая — код + тесты |
| Живое демо отвечает | `GET /api/health` → **200**, `version=1.2.0`, `model=gemini-3.6-flash`, `db=ok`; при этом `/api/tasks` = **3** задачи: живая сборка старше финальной | `Invoke-WebRequest https://merilo-nfc.fly.dev/api/health` | https://merilo-nfc.fly.dev/api/health | 2026-11-13 | D2 | высокая на момент проверки; редеплой из `main` — за релизным лидом |
| Лендинг без горизонтальной прокрутки | 320/320 px и 1440/1440 px; 0 ошибок консоли и 0 ответов ≥ 400 | headless Chrome CDP: `scrollWidth == clientWidth`, `Runtime`/`Log`/`Network` | `static/index.html`, `static/merilo.css` | 2026-11-13 | E2 | высокая — измерено |

## 2. Внешний рынок: hh.kz

Скрипт `scripts/fetch_labor_market.py` для каждого языка запрашивает `https://hh.kz/search/vacancy?text=<query>` с `User-Agent: Mozilla/5.0`, парсит заголовок `Найдено N вакансий` (в N используется неразрывный пробел) и пишет строку в `docs/labor_market.json`. Один повтор на язык; при любой ошибке строка пишется как `UNKNOWN` с `count: null`. **Ни одно число не додумано.**

Прогон 2026-11-13: **13 OK, 0 UNKNOWN**.

| Claim | Value | Source | URL | Date | Supports | Confidence |
|:---|:---|:---|:---|:---|:---|:---|
| Python — спрос на hh.kz | **1 638** вакансий по запросу «Python разработчик» | `scripts/fetch_labor_market.py` → `docs/labor_market.json` | https://hh.kz/search/vacancy?text=Python+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1, лендинг | средняя — широкий поисковый запрос, снимок меняется |
| JavaScript | **1 123** | тот же скрипт | https://hh.kz/search/vacancy?text=JavaScript+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| TypeScript | **558** | тот же скрипт | https://hh.kz/search/vacancy?text=TypeScript+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| Java | **686** | тот же скрипт | https://hh.kz/search/vacancy?text=Java+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| Go | **409** | тот же скрипт | https://hh.kz/search/vacancy?text=Go+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| C# | **395** | тот же скрипт | https://hh.kz/search/vacancy?text=C%23+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| C++ | **926** | тот же скрипт | https://hh.kz/search/vacancy?text=C%2B%2B+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| C | **2 447** | тот же скрипт | https://hh.kz/search/vacancy?text=C+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | низкая — запрос «C» пересекается с C#, C++ и другими словами |
| Rust | **52** | тот же скрипт | https://hh.kz/search/vacancy?text=Rust+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| Ruby | **30** | тот же скрипт | https://hh.kz/search/vacancy?text=Ruby+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| PHP | **390** | тот же скрипт | https://hh.kz/search/vacancy?text=PHP+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| Kotlin | **176** | тот же скрипт | https://hh.kz/search/vacancy?text=Kotlin+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |
| Swift | **78** | тот же скрипт | https://hh.kz/search/vacancy?text=Swift+%D1%80%D0%B0%D0%B7%D1%80%D0%B0%D0%B1%D0%BE%D1%82%D1%87%D0%B8%D0%BA | 2026-11-13 | A1 | средняя |

**Как читать эту таблицу.** Это количество результатов поиска по строке «<язык> разработчик» на всём hh.kz, без фильтров по грейду, городу, зарплате и формату работы. Оно показывает порядок величины спроса и позволяет сравнить языки между собой, но **не** равно числу вакансий «только для джунов» и **не** равно размеру рынка Merilo. Запрос «C» намеренно оставлен как есть: он шумный, и это указано в колонке Confidence. Повторить снимок: `python scripts/fetch_labor_market.py --out docs/labor_market.json`; дата и URL каждой строки лежат в JSON.

## 3. Внешние и исторические утверждения: проверено или помечено

| Claim | Value | Source | URL | Date | Supports | Confidence |
|:---|:---|:---|:---|:---|:---|:---|
| TAM / SAM / SOM | 990 млн / 247,5 млн / 4,95 млн ₸ — арифметика допущений, не прогноз | формула и параметры помечены `[assumption]` | `docs/PROBLEM.md` §3 | 2026-11-13 | D3 | низкая — `[assumption]` |
| Цена за проверку | 3 000 ₸ — гипотеза предложения, не результат теста цены | `docs/PILOT.md` | `docs/PILOT.md` | 2026-11-13 | D3 | низкая — `[assumption]` |
| Интервью | **не проведены**; запланированы 5 | `docs/INTERVIEWS.md`, `docs/PROBLEM.md` §6 | `docs/INTERVIEWS.md` | 2026-11-13 | A3 | статус, не измерение |
| Контейнер собран и прогнан | `docker build -t merilo-final .` → exit 0, **326 МБ**; `docker top` → uvicorn под `uid 10001`; `docker ps` → `healthy`; в `/app` нет `.env` и `*.db`; все 20 зависимостей — wheels | `docker build`, `docker run -v …:/data -e MERILO_ENV=development` | `Dockerfile`, `.dockerignore`, `docker-entrypoint.sh` | 2026-11-13 | D2 | высокая — измерено |
| Smoke контейнера | `/`, `/api/health`, `/api/ready`, `/api/tasks` (8), JS-пресет (verified / gate 3 / **91** / Gold), Go own-code (verified / gate 3 / **88** / `language=go`), `/api/cards/{hash}` (27 ключей, `is_signature_valid=true`), manifest (`valid=true`), бейдж, QR, `/.well-known/merilo.json`, `/evidence/pilot` — все **200** | `python %TEMP%\merilo_smoke.py` против `127.0.0.1:8100` | — | 2026-11-13 | C2, D2, E2 | высокая — измерено |
| 9/9 пресетов в контейнере | перепроверены JS-пресет и Go own-code; остальные 7 пресетов в контейнере не перезапускались | smoke 2026-11-13; исторический прогон 2026-11-09 дал 90 / 52 / 0, 89 / 42 / 0, 91 / 53 / 0 | — | 2026-11-13 | C2 | частично — 2 из 9 |
| Живой вызов Gemini и его латентность | не измерялась; ключ в этой сессии не использовался | `docs/PITCH.md`, `docs/READINESS.md` | — | — | D3 | `UNKNOWN` |
| «Семантическая рубрика откалибрована для Python и JavaScript» | позиционирование, не измерение: сверки с оценками тимлидов не было | `README.md`, `docs/PROBLEM.md` §7 | — | 2026-11-13 | A2 | `[assumption]` |
| Скриншоты (36 PNG), дека и офлайн-страница | в репозитории: `screenshots/`, `docs/presentation.html`, `docs/Merilo_NFC_Pitch.pdf/.pptx`, `docs/offline-demo.html`; дека собрана `scripts/generate_pitch.mjs` | `screenshots/`, `docs/` | 2026-11-13 | D1 | высокая — файлы на месте |

## 4. Удалено или заменено как неподтверждённое

| Что было | Почему убрано | Чем заменено |
|:---|:---|:---|
| «105 тестов, покрытие 84,25 %» в `docs/PITCH.md` | число устарело и не совпадало с прогоном | 397 passed, 85,30 % (замер 2026-11-13) |
| «109 passed, 84,29 %» в `README.md` | число устарело | 397 passed, 85,30 % (замер 2026-11-13) |
| «21 ключ в ответе» `GET /api/cards/{hash}` | не совпадало с фактическим ответом | 27 ключей публичной карточки; 23 ключа ответа verify |
| HR-метрики «24 верифицировано», «+6 за неделю», «7 Gold», «72 ч», «~1,8 млн ₸» | числа не имели источника и выглядели как реальные клиентские данные | значения считаются из живого `/api/cards/recent`; экономия времени помечена «не измерена» |
| «Клиенты», «пилоты», «выручка» | их нет | прямая оговорка в README, `docs/PILOT.md`, `docs/INTERVIEWS.md` |

## 5. Что мы не утверждаем

- **Нет клиентов.** Ни одна компания не платила и не подписывала договор; слова «клиент» и «заказчик» в документах означают гипотетический сегмент.
- **Нет пилотов.** Пилот не запущен, результатов «до/после» нет. `docs/PILOT.md` — план и гипотеза цены, а не отчёт.
- **Нет выручки.** Счетов, оплат и MRR нет.
- **Нет определения авторства по AI.** Merilo не детектирует AI-авторство и не заявляет, что умеет это. `ai_assisted` — декларация кандидата, а не вывод системы.
- **Нет production-grade для всех 13 языков.** Все 13 языков проходят синтаксический шлюз tree-sitter и защитный шлюз; семантическая рубрика откалибрована в первую очередь для Python и JavaScript. Для остальных языков качество оценки не измерено.
- **Нет валидации рубрики на людях.** Балл — структурированное мнение модели/эвристики, не измерение уровня инженера.
- **Нет замера живой модели.** Все числа латентности в этом документе получены в fallback-режиме.
- **Нет утверждения о полноте Gate 2.** Это regex по известным формулировкам; перефразированная инъекция может пройти.
- **Нет приватности кода.** Публичная карточка отдаёт метаданные, защиту и хэши, но не исходный код; при этом сам код хранится в SQLite и доступен серверу.
