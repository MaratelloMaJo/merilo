# Merilo — полное овервью проекта и идеи

> **Назначение документа.** Это единая точка входа для другого агента (или человека), который будет анализировать проект: продукт, код, безопасность, экономику, дизайн, питч. Документ собран 12.11.2026 по фактическому состоянию репозитория `D:\documents\Projects\Merilo`, а не только по README. Где README/старые доки расходятся с кодом — это отмечено явно.
>
> **Статус репозитория на момент сборки:** ветка `final-sprint`, есть незакоммиченные изменения в `static/*`, `docs/UI_NOTES.md`, `tests/test_static_contract.py` и два untracked-файла. Ветки `main` и `deploy` существуют отдельно; `deploy` содержит инфраструктуру и презентационные артефакты.
>
> **Главное предупреждение:** часть документации устарела. README всё ещё говорит про `ast.parse` и «только Python», тогда как в коде уже tree-sitter и 13 языков; README говорит про 109 тестов, фактически собирается 337. Ниже — актуальная картина.

---

## 0. TL;DR для агента

1. **Merilo — это не платформа найма и не «ChatGPT для проверки кода».** Это узкий инструмент: кандидат решает одну короткую рабочую задачу в браузере, система прогоняет код через три шлюза, ставит оценку по прозрачной рубрике и выдаёт публичную подписанную **Verified Skill Card**.
2. **Идея одним предложением:** заменить «резюме + GitHub + тестовое задание» одним компактным проверяемым артефактом — карточкой, которая подтверждает, что *именно этот код* прошёл *именно этот конвейер* и получил *именно эту оценку*, и которую работодатель открывает по ссылке.
3. **Три шлюза с возрастающей стоимостью:** (1) локальный парсинг кода (tree-sitter, 13 языков) → `rejected`; (2) regex-щит от prompt injection → `blocked`; (3) LLM-оценка по рубрике 30/40/30 с детерминированным AST-fallback → `verified`.
4. **Порог:** 85+ — Gold Verified, 70+ — Silver Verified, ниже — Needs Work.
5. **Доверие двухслойное:** быстрый HMAC-SHA256 по `card_hash + user_id + score` (сервер) и переносимый Ed25519-манифест (офлайн-проверка без сервера). Манифест содержит SHA-256 кода и задания, но не сам исходник.
6. **Live Code Defense:** после успешной проверки кандидат отвечает на 3 вопроса, сгенерированных из его же AST; ответы, хэш и отдельная HMAC-подпись «запечатываются» в карточку. Это **не** оценка правильности и **не** доказательство авторства — это зафиксированное объяснение.
7. **Публичная карточка не отдаёт исходный код.** Отдаются оценка, разбивка, summary, defense Q/A, подписи, manifest. Исходник остаётся в приватной БД.
8. **Демо работает без ключа Gemini:** при отсутствии ключа/таймауте/429 включается детерминированная эвристика (`evaluation_mode=fallback`, `confidence=low`). Это ключевая страховка для жюри и офлайн-демо.
9. **Честные границы:** нет интервью, пилотов, клиентов и выручки; TAM/SAM/SOM — арифметика допущений; рубрика не откалибрована на людях; Gate 2 — regex, а не семантика; личность и авторство не проверяются; SQLite и in-memory rate limit — демо-уровень.
10. **Контекст:** National Founder Cup 2026, Shymkent, кейс 5 «The Experience Gap», команда Merilo Found, соло-разработчик Marat Zholynbek. Финал — 14.11.2026, NIS Karatau. Live demo: https://merilo-nfc.fly.dev.

---

## 1. Идея продукта

### 1.1 Формула

```
короткий рабочий кейс
        ↓
3 шлюза (парсинг → защита от инъекций → оценка по рубрике)
        ↓
подписанная карточка с оценкой, разбивкой и защитой
        ↓
работодатель открывает ссылку и видит проверяемый артефакт
```

Merilo продаёт **не найм, не обучение и не античит**, а **стандарт одного проверяемого образца работы**. Аналогия, которую использует проект: «паспорт одного выполненного задания», а не «медицинская карта разработчика».

### 1.2 Что именно подтверждает карточка

- Этот код прошёл этот конвейер.
- Код получил такую-то оценку по такой-то рубрике и такой-то версии рубрики.
- Запись не менялась после подписания (HMAC + Ed25519-манифест).
- Для новых карточек: кандидат оставил устное/письменное объяснение своего кода (defense), и оно тоже запечатано.

### 1.3 Чего карточка НЕ подтверждает

- Авторство кода (кандидат мог сгенерировать его или списать).
- Личность кандидата (email не верифицируется).
- Уровень инженера в абсолютной шкале (рубрика не калибровалась на живых тимлидах).
- Что кандидат «правильно понял» код в defense (ответы не оцениваются моделью).
- Что Gate 2 ловит все prompt-injection атаки (только известные паттерны).

Эти границы — не мелкий шрифт, а осознанная часть позиционирования. В питче есть отдельный слайд/раздел «Границы».

### 1.4 Почему это может быть нужно

- У джуна нет коммерческого опыта, а резюме и учебные проекты недоказуемы и несравнимы.
- У небольшой продуктовой компании (10–100 человек) нет отдельной функции оценки: тестовое задание готовит и проверяет тот же тимлид, у которого нет на это времени.
- Генеративные модели удешевили «правдоподобный код», поэтому чтение документов и GitHub перестало быть дешёвым фильтром.
- Нет общего формата короткого проверяемого доказательства навыка: резюме, GitHub, сертификат буткемпа и тестовое задание несравнимы между собой.

---

## 2. Проблема, аудитория, рынок

### 2.1 Три сегмента

| Сегмент | Боль | Текущий workaround | Что ломается |
|---|---|---|---|
| Джун (0–2 года) | Нет коммерческого опыта; нечем доказать навык | Массовые отклики, учебные проекты, практические платформы, курсы | Нет обратной связи; отклики не конвертируются |
| IT-рекрутер / HR небольшой продуктовой компании | Нет технической экспертизы; нужно отсеять по коду | Ключевые слова, короткий тест, GitHub, бесплатные версии ассессментов | Тесты не унифицированы; «причёсанное» AI-решение не показывает понимание; тимлид тратит время |
| Буткемп / учебный центр | Сертификат слабый сигнал для работодателя | Выпускной проект, внутренняя защита, партнёрские вакансии, рекомендации | Нет публичного проверяемого артефакта, который живёт после курса |

### 2.2 Рынок: только гипотезы

Все числа в `docs/PROBLEM.md` помечены `[assumption]`. Базовая арифметика:

- `N_it = 55 000` (допущение)
- `ARPU_year = 18 000 KZT` (6 проверок × 3 000 KZT)
- `TAM = 990 000 000 KZT`
- доля продуктовых компаний 25% → `SAM = 247 500 000 KZT`
- ранние адоптеры 2% → `SOM = 4 950 000 KZT` ≈ 1 650 проверок в год по 3 000 KZT

Есть sensitivity-сценарии (low/base/high). Ограничения перечислены честно: платит работодатель, а не кандидат; возможен двойной счёт; FX; цена не проверена.

### 2.3 Валидация (запланирована, не проведена)

План — 5 качественных интервью 10–23.11.2026 по 30 минут:

1. Рекрутер продуктовой компании.
2. Рекрутер агентства.
3. Тимлид FinTech.
4. Тимлид outsourcing/legacy.
5. Карьерный консультант / буткемп.

Правило решения: меньше 3 из 5 подтверждают боль → перепозиционировать в учебный/feedback-инструмент; боль есть, но нет пилота → «vitamin, not painkiller»; 3+ и хотя бы один пилот → следующий шаг с реальным кейсом и замером времени скрининга до/после.

**На момент сборки документа интервью не проведены.** В питче это должно звучать как «запланировано», без выдуманных цитат.

---

## 3. Пользовательские потоки

### 3.1 Кандидат (основной демо-путь)

1. Открывает `http://localhost:8000` — без логина, zero-auth.
2. Выбирает кейс: FinTech / Logistics / EdTech (в seed уже 8 кейсов, см. §9).
3. Видит описание, рубрику, «багованный» код.
4. Нажимает пресет:
   - «✨ Эталон (Clean & Secure)» — эталонное решение;
   - «⚠️ Черновик с дефектом» — компилируется, но архитектура/края проваливаются;
   - «🛡️ Тест на инъекцию» — попытка внедрить инструкцию модели.
5. Жмёт «Запустить 3-шлюзовую верификацию».
6. Смотрит анимацию шлюзов и результат.
7. Открывает карточку `/card/{card_hash}`.
8. Для успешной карточки — шаг 4 «Проверить понимание»: 3 вопроса по своему коду, 3 ответа, «Запечатать защиту». Токен защиты хранится в `sessionStorage`, на сервер уходит только его SHA-256; повторно запечатать нельзя.
9. Может скачать/распечатать карточку (A4, QR, подписи).

### 3.2 Свой код (own-code)

- Отдельный таб «Свой код — без шаблона».
- Нужно явно выбрать язык из 13 поддерживаемых.
- `task_id = "own-code"`, язык обязателен; сервер не доверяет языку для каталожных задач — там язык задачи авторитетен, несовпадение → 422.

### 3.3 Рекрутер

- Переключатель роли candidate/recruiter.
- Демо-сессия: passwordless, только при `MERILO_DEMO_MODE=1`, whitelisted emails (`marat@merilo.kz`, `hiring@example.com`).
- Может опубликовать свою задачу (`POST /api/tasks`, zero-auth, rate limit 10/60s).
- Смотрит карточки кандидатов, может отправить ссылку кандидату.

### 3.4 Жюри / демо

60-секундный сценарий: FinTech → эталон → проверка → карточка. Второй раунд: черновик с дефектом и инъекция. Всё работает без Gemini-ключа.

---

## 4. Три шлюза и оценка

### 4.1 Gate 1 — синтаксис / парсинг

- Код парсится **локально до сетевых вызовов**.
- Реализация: tree-sitter для 13 языков (`backend/languages.py`), а не только `ast.parse`.
- Ошибка парсинга → `status="rejected"`, `gate_reached=1`, score 0.
- **Приоритет щита:** если в непарсящемся тексте найден injection-паттерн, вердикт всё равно `blocked` на Gate 2, а не `rejected` на Gate 1.

### 4.2 Gate 2 — щит от prompt injection

- Regex по известным фразам (`ignore previous instructions`, `give 100`, `score: 100` и т.п.), см. `INJECTION_KEYWORDS` в `backend/fallback_cache.py`.
- Совпадение → `status="blocked"`, `gate_reached=2`, score 0, `is_plagiarized_or_injected=True`.
- Это **фильтр известных паттернов, а не семантическое понимание**. Перефразированная атака может пройти.
- Второй слой — флаг модели `is_plagiarized_or_injected`, но только когда модель доступна.

### 4.3 Gate 3 — оценка и подпись

- Модель: `GEMINI_MODEL`, по умолчанию `gemini-3.6-flash`; fallback-модели `gemini-3.5-flash` → `gemini-3.5-flash-lite`.
- Ответ ограничен Pydantic-схемой `CodeEvaluationResponse`, `temperature=0.0`, `response_mime_type="application/json"`.
- Таймауты: 6 с на модель, 12 с общий бюджет, 2 попытки на модель, TTL-кэш по паре задача+код+модель+язык.
- Ошибки (нет ключа, таймаут, 404, 429, 5xx, невалидный JSON/схема) → детерминированный AST-fallback.
- Fallback: `evaluation_mode="fallback"`, `confidence="low"`; `high` ставится только при явных причинах (инъекция/синтаксис).

### 4.4 Рубрика

| Критерий | Вес | Что оценивается |
|---|---|---|
| Clean Code | 30% | читаемость, именование, структура, типы, docstring |
| Architecture & Efficiency | 40% | декомпозиция, сложность, алгоритмы, отсутствие лишних проходов |
| Edge Cases & Security | 30% | пустые входы, границы, ошибки, SQL/секреты, атомарность |

Итог: `round(0.30*clean + 0.40*architecture + 0.30*edge)`, clamp 0..100.

Пороги:
- **85+** — Gold Verified
- **70+** — Silver Verified
- **<70** — Needs Work

Версия рубрики: `2026-11-v1` (пишется в карточку).

### 4.5 Статусы и поля результата

- `status`: `verified` | `rejected` | `blocked`
- `gate_reached`: 1..3
- `badge_tier`: Gold / Silver / Needs Work
- `evaluation_mode`: `gemini` | `fallback`
- `confidence`: `high` | `low`
- `fallback_reason`: причина, если fallback
- `ai_assisted`: **самодекларация кандидата**, не детекция
- `defense_status`: `pending` | `recorded` | `unavailable`

---

## 5. Доверие: хэши, подписи, манифест

### 5.1 Детерминированный `card_hash`

```
payload = task_id : candidate_name : status : total_score : user_id : sha256(code)
card_hash = первые 12 hex от sha256(payload)
```

- `user_id` детерминирован: `usr_` + первые 16 hex от `sha256(normalized_email)`.
- Один и тот же кандидат + задание + код → одинаковый хэш даже на двух свежих БД (проверено: `8c101d0a2a98`).
- 48 бит — короткий публичный id; коллизии теоретически возможны, на демо-масштабе приемлемо.

### 5.2 HMAC-подпись карточки

- `sign_card(card_hash, user_id, total_score)` = HMAC-SHA256 hex по строке `hash:user:score`.
- Секрет: `MERILO_HMAC_SECRET`. В production отсутствие секрета → падение на старте; в development — эфемерный секрет + warning.
- Проверка: `compare_digest`. Ротация секрета инвалидирует старые подписи; процедуры переиздания нет.

### 5.3 Ed25519-манифест (переносимый)

- `MANIFEST_VERSION = "merilo-card-v1"`, алгоритм `Ed25519`.
- Поля: `version, card_hash, candidate_name, task_id, task_title, language, status, total_score, badge_tier, code_sha256, task_sha256, defense_hash, ai_assisted, created_at, rubric_version, model`.
- `code_sha256` — SHA-256 исходника; `task_sha256` — SHA-256 канонического `{description, rubric}`; **сам код и текст задания в манифест не попадают**.
- Канонический JSON: `sort_keys=True`, компактный.
- `MERILO_ED25519_SEED` — base64url, ровно 32 байта; production fail-fast, dev — эфемерный ключ.
- `verify_manifest` не бросает исключений: проверяет версию, ключ, длину подписи; при любом tamper → `False`.
- `manifest_for_card` переиспользует сохранённый манифест только если все поля совпадают со свежими и подпись валидна; иначе переподписывает при чтении (legacy-карточки).
- Публичный эндпоинт: `GET /api/cards/{hash}/manifest` → `{manifest, ed25519_signature, public_key, valid}`.
- `GET /.well-known/merilo.json` отдаёт алгоритм, публичный ключ, версию манифеста, список языков, шаблон verify URL.

### 5.4 Бейдж и QR

- `GET /badge/{card_hash}.svg` — 320×120, бумага `#f6f1e7`, графит `#242424`, vermilion `#e0502e`, олива `#6f7f3f`, Georgia, XML-экранирование, accessibility-title, штамп VERIFIED/UNVERIFIED.
- `GET /card/{card_hash}/qr.svg` — QR через `segno` (lazy import), error level M, ведёт на публичную карточку.
- Базовый URL: `MERILO_PUBLIC_BASE_URL`, по умолчанию `https://merilo-nfc.fly.dev`.

### 5.5 Live Code Defense

- 3 вопроса генерируются детерминированно из AST (функции, ветки, края); если не получилось — 3 общих вопроса.
- Только для `status="verified"`.
- Одноразовый токен: 32 байта `secrets.token_urlsafe`; в БД только SHA-256.
- `POST /api/cards/{hash}/defense` требует заголовок `X-Defense-Token`; ответы строго 3, по 20–1200 символов.
- `defense_hash = sha256(canonical{card_hash, questions, answers})`.
- `defense_signature = HMAC-SHA256(secret, defense_hash:user_id:score)` — **отдельная** подпись, чтобы старые карточки оставались валидными.
- Запечатывание атомарное: `UPDATE ... WHERE card_hash=? AND defended_at IS NULL AND defense_token_hash=?`; rowcount решает, кто выиграл гонку.
- Повторная попытка → 409; нет токена → 401; карточка не verified → 409; legacy без challenge → 409.
- Публичная проекция отдаёт вопросы/ответы/хэш/подпись/дату, но не токен.
- Ответы не оцениваются и не отправляются в модель. В логах — только количества и длины.

---

## 6. Архитектура и карта кода

### 6.1 Общая схема

```
Браузер (vanilla JS + Tailwind CDN)
   │
   ├── GET /                     → static/index.html
   ├── GET /card/{hash}          → static/card.html
   ├── GET /static/*             → статика
   │
   └── FastAPI (один процесс, порт 8000)
         ├── backend/main.py        HTTP, middleware, auth, rate limit, static
         ├── backend/verifier.py    шлюзы, модель, рубрика, card_hash, defense issue
         ├── backend/fallback_cache.py  AST-эвристика, injection regex, TTL-кэш
         ├── backend/languages.py   13 языковых профилей + tree-sitter
         ├── backend/seed_data.py   8 кейсов и пресеты
         ├── backend/db.py          SQLite, миграции, HMAC, scrypt, public projection
         ├── backend/signing.py     Ed25519-манифест, badge, QR
         ├── backend/defense.py     одноразовая token-bound защита
         └── backend/schemas.py     Pydantic v2 контракты
```

### 6.2 Файловая карта (актуальные размеры)

| Файл | Строк | Роль |
|---|---:|---|
| `backend/main.py` | ~937 | HTTP-слой, CORS, CSP, JSON-ошибки, auth, rate limit, все роуты, статика |
| `backend/verifier.py` | ~994 | Оркестрация шлюзов, Gemini, fallback, рубрика, финализация, defense challenge |
| `backend/db.py` | ~926 | SQLite, WAL, scrypt, HMAC, миграции, публичная проекция карточки |
| `backend/signing.py` | ~509 | Ed25519-манифесты, badge SVG, QR, публичный base URL |
| `backend/defense.py` | ~400 | Одноразовая защита, хэширование, атомарное запечатывание |
| `backend/schemas.py` | ~360 | Pydantic-контракты запросов/ответов |
| `backend/languages.py` | ~787 | `SUPPORTED_LANGUAGES`, профили, tree-sitter, эвристики по языкам |
| `backend/fallback_cache.py` | ~1107 | `INJECTION_KEYWORDS`, AST-эвристика Python, generic-эвристика, кэш |
| `backend/seed_data.py` | ~972 | 8 кейсов, пресеты ideal/vulnerable/injection |
| `static/index.html` | ~1172 | Рабочее место кандидата/рекрутера |
| `static/card.html` | ~1461 | Публичная карточка-сертификат, печать A4 |
| `static/app.js` | ~2174 | Вся клиентская логика, i18n, auth, verify, defense |
| `static/i18n.js` | ~828 | RU/KZ/EN, словари и переключатель |
| `tests/` | 18 модулей | 337 собранных тестов |
| `sql/supabase_schema.sql` | — | Blueprint PostgreSQL: 5 таблиц, индексы, RLS (в демо не активен) |

### 6.3 Поток `POST /api/submissions/verify`

1. Middleware: request-id, лимит тела, security headers.
2. Rate limit 20/60s на IP.
3. Валидация: непустой код, UTF-8, ≤64 KB; для own-code — поддерживаемый язык; для каталожной задачи язык берётся из задачи, несовпадение → 422.
4. Идентичность: Bearer-токен → `payload.user_id` → seeded demo user (`marat@merilo.kz` или первый пользователь).
5. Gate 1: tree-sitter-парсинг.
6. Gate 2: injection regex; приоритет над syntax error.
7. Gate 3: модель или fallback.
8. Взвешенная оценка, badge tier.
9. `_finalize_response`: `card_hash`, `verify_url`, HMAC, сохранение, выдача defense challenge.
10. `Cache-Control: no-store` (в ответе одноразовый defense token).
11. Лог: request_id, task, gate, latency, status; код не логируется.

### 6.4 Middleware и безопасность HTTP

- `X-Request-ID` (12 hex), `X-Response-Time`.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`.
- CSP для HTML: Tailwind CDN, jsdelivr, Google Fonts; inline scripts/styles разрешены.
- `Cache-Control: no-cache, must-revalidate` для `/`, `.html`, `.js`, `.css`.
- JSON-ошибки: `HTTPException` → `{error: {code, message}}`; `RequestValidationError` → 422 с деталями полей без эха payload; необработанное → opaque 500, traceback только на сервере.
- Defense-тело >16 KB → 413 **до** парсинга.
- CORS: `allow_origins=["*"]`, credentials/methods/headers — всё открыто (демо-режим).

---

## 7. API-контракт

| Метод | Путь | Авторизация | Лимит | Назначение |
|---|---|---|---|---|
| GET | `/api/health` | — | — | Статус, режим, версия, модель, БД; Gemini не вызывает |
| GET | `/api/ready` | — | — | Готовность: БД + конфиг; 503 только если БД недоступна |
| GET | `/.well-known/merilo.json` | — | — | Публичный ключ Ed25519, версия манифеста, языки, verify URL |
| POST | `/api/auth/register` | — | — | email, password ≥6, full_name, role candidate/recruiter |
| POST | `/api/auth/login` | — | — | Bearer-токен |
| POST | `/api/demo/session` | — | — | Passwordless demo, только `MERILO_DEMO_MODE=1`, whitelist |
| GET | `/api/auth/me` | Bearer | — | Текущий профиль; 401 без fallback |
| GET | `/api/users` | — | — | Все профили |
| GET | `/api/tasks` | — | — | Каталог задач |
| GET | `/api/tasks/{task_id}` | — | — | Одна задача, 404 |
| POST | `/api/tasks` | — | 10/60s | Публикация задачи, 201, parameterized SQL |
| POST | `/api/submissions/verify` | опц. Bearer | 20/60s | Основная верификация |
| GET | `/api/cards/{card_hash}` | — | — | Публичная карточка, 404 |
| GET | `/api/cards/{card_hash}/manifest` | — | — | Ed25519-манифест + подпись + `valid` |
| POST | `/api/cards/{card_hash}/defense` | `X-Defense-Token` | 5/min | Запечатать защиту |
| GET | `/badge/{card_hash}.svg` | — | — | SVG-бейдж 320×120 |
| GET | `/card/{card_hash}/qr.svg` | — | — | SVG QR на публичную карточку |
| GET | `/` | — | — | `static/index.html` |
| GET | `/card/{card_hash}` | — | — | `static/card.html` |
| GET | `/static/*` | — | — | Статика |

Коды ошибок: 400 (пустой код / невалидный UTF-8), 401 (нет/неверный токен), 403 (нельзя защитить чужую карточку), 404 (задача/карточка), 409 (защита уже запечатана / карточка не eligible / legacy), 413 (>64 KB verify, >16 KB defense), 422 (валидация), 429 (rate limit).

### 7.1 Пример ответа verify (сокращённо)

```json
{
  "status": "verified",
  "gate_reached": 3,
  "total_score": 90,
  "badge_tier": "Gold Verified",
  "card_hash": "8c101d0a2a98",
  "verify_url": "/card/8c101d0a2a98",
  "evaluation": {
    "clean_code": 92,
    "architecture": 90,
    "edge_cases": 88,
    "is_plagiarized_or_injected": false,
    "executive_summary": "…",
    "evaluation_mode": "fallback",
    "confidence": "low",
    "fallback_reason": "GEMINI_API_KEY is not set"
  },
  "signature": "…",
  "is_signature_valid": true,
  "evaluation_mode": "fallback",
  "confidence": "low",
  "language": "python",
  "ai_assisted": false,
  "duration_ms": 70,
  "rubric_version": "2026-11-v1",
  "model": "deterministic-ast",
  "defense_questions": ["…", "…", "…"],
  "defense_token": "…",
  "defense_url": "/api/cards/8c101d0a2a98/defense",
  "defense_status": "pending",
  "profile_url": "/p/usr_…"
}
```

> Замечание для аудита: `profile_url` формируется, но отдельного роута `/p/{user_id}` в `backend/main.py` не обнаружено. Это потенциальная несостыковка «портфолио-платформы» и текущей реализации; проверить перед публичным позиционированием.

---

## 8. Модель данных

SQLite, файл `backend/merilo.db` (override `MERILO_DB_PATH`). Соединение на операцию, WAL, `busy_timeout=5000`, `synchronous=NORMAL`, `foreign_keys=ON`. Схема и seed создаются в lifespan.

### 8.1 `users`

`id` (PK), `email` (unique), `password_hash`, `salt`, `full_name`, `role` (`candidate`|`recruiter`), `created_at`.

- `id` = `usr_` + 16 hex от `sha256(normalized_email)`; детерминированно.
- Пароли: scrypt `N=2^14, r=8, p=1, dklen=32`, префикс `scrypt$`; legacy PBKDF2-HMAC-SHA256 100k поддерживается.
- Сессия: `user_id:timestamp:HMAC` — stateless; срок действия **не проверяется**.

### 8.2 `micro_tasks`

`id` (PK), `title`, `company_name`, `stack`, `difficulty`, `description`, `rubric` (JSON text), `buggy_code`, `preset_ideal`, `preset_vulnerable`, `preset_injection` (+ нейтральные имена), `language` (default python), `created_at`.

### 8.3 `skill_cards`

Ключевые поля:

- Идентификация: `card_hash` (PK), `candidate_name`, `task_id`, `task_title`, `company_name`, `user_id`.
- Результат: `total_score`, `badge_tier`, `status`, `gate_reached`, `clean_code`, `architecture`, `edge_cases`, `executive_summary`, `evaluation_json`.
- Код: `submitted_code` (приватно), `language`, `ai_assisted`, `duration_ms`, `rubric_version`, `model`.
- Подписи: `signature`, `manifest_json`, `ed25519_signature`.
- Защита: `defense_questions_json`, `defense_answers_json`, `defense_hash`, `defense_signature`, `defense_token_hash`, `defended_at`.
- Служебное: `verify_url`, `created_at`.

Миграции — через `PRAGMA table_info` + `ALTER TABLE`; backfill `rubric_version`/`model` только если пусто. Индексы: `users.email`, `skill_cards.task_id`, `skill_cards.created_at`, `skill_cards.user_id`.

`save_skill_card` делает `ON CONFLICT DO UPDATE` только по колонкам, которыми владеет верификатор, и **сохраняет шесть defense-колонок**; манифест собирается с уже существующим `defense_hash`. Ошибка подписи манифеста не ломает сохранение (пишется `NULL`).

### 8.4 Публичная проекция

`PUBLIC_CARD_FIELDS` — белый список:

`card_hash, candidate_name, task_id, task_title, company_name, language, status, gate_reached, total_score, badge_tier, verify_url, created_at, evaluation, signature, is_signature_valid, evaluation_mode, ai_assisted, duration_ms, rubric_version, model, defense_questions, defense_answers, defense_hash, defense_signature, defended_at, defense_status`.

**Не отдаются:** `submitted_code`, `user_id`, `evaluation_json`, `defense_token_hash`.

### 8.5 PostgreSQL blueprint

`sql/supabase_schema.sql`: 5 таблиц, индексы, RLS-политики. В демо RLS не активен (SQLite его игнорирует); это декларация production-намерения, а не работающая защита.

---

## 9. Языки и кейсы

### 9.1 Поддерживаемые языки (13)

`python`, `javascript`, `typescript`, `java`, `go`, `csharp`, `cpp`, `c`, `rust`, `ruby`, `php`, `kotlin`, `swift`.

- У каждого — `LanguageProfile` в `backend/languages.py`: расширение, tree-sitter-грамматика, ключевые слова, эвристики.
- Парсинг tree-sitter; для неподдерживаемого языка — 422.

### 9.2 Seed-кейсы (8)

| ID | Название | Компания | Язык |
|---|---|---|---|
| `task-fintech-01` | FinTech — Kaspi-style Transfer API | NeoBank Kaspi Ecosystem | Python |
| `task-logistics-02` | Highload Logistics — Deduplicate Orders Stream | FastTrack Delivery Logistics | Python |
| `task-edtech-03` | EdTech Grading — Average Score Calculator | BilimTech Platform | Python |
| `task-web-04` | Web Platform — Notification Delivery with Retries | Northwind Systems | JavaScript |
| `task-api-05` | API Gateway — Typed User Report Contract | Atlas Integrations | TypeScript |
| `task-service-06` | Billing Service — Invoice Creation Validation | Ledgerline | Java |
| `task-cli-07` | Developer CLI — Line Counter Error Handling | Toolsmith Labs | Go |
| `task-enterprise-08` | Enterprise Reporting — CSV Reader Resource Safety | Bluepeak Data | C# |

У каждого кейса три пресета: ideal / vulnerable / injection.

### 9.3 Fallback-эвристика

`backend/fallback_cache.py` — не «заглушка на рандоме», а набор AST-проверок:

- docstring, type hints, `from __future__ import annotations`;
- bare `except`, try/with/raise, количество функций/классов, логических узлов;
- mutable defaults, `None`-defaults, isinstance-проверки, finite-guard, генераторы;
- аннотированные контейнеры, Optional-параметры, мутация параметров;
- guard’ы деления, SQL-сигналы, пустые guard’ы, валидация положительной суммы;
- ordered dedupe, опасные вызовы, stub-детекция, атомарность, login/secret-паттерны.

Для не-Python языков — `_generic_heuristic_evaluate` (лексические/структурные сигналы). Это честно называется эвристикой, а не AST-анализом в строгом смысле.

---

## 10. Frontend

### 10.1 `static/index.html` — рабочее место

- Тёмная тема, Tailwind CDN, vanilla JS, без сборки.
- Переключатель ролей candidate/recruiter, виджет пользователя, auth-модалка (login/register, quick demo login).
- Колонка задачи: табы задач, селектор языка (13), описание, рубрика, «багованный» код, копирование.
- Колонка workbench: stepper из 4 шагов, имя кандидата, own-code-панель, пресеты, редактор, чекбокс «AI помогал», ссылка кандидату, кнопка верификации.
- Панель трёх шлюзов (pending/running/pass/fail), результат, defense-блок, рекрутерский вид.
- Deep link `/?task=<id>`; неизвестный id → первая задача, без ошибки.

### 10.2 `static/card.html` — карточка-сертификат

- Загрузка/ошибка/404/blocked-состояния.
- Печать: A4, одна страница, QR и defense видимы, компактная типографика.
- Секции: печать/VERIFIED, имя, задание/компания/дата/язык/AI-декларация, балл, badge tier, метаданные (score, rubric, model, duration), критерии с полосами, executive summary, политика «код не публикуется», defense Q/A + hash + signature, portable verification (manifest, Ed25519, QR, badge), подпись/HMAC.
- Кнопки копирования ссылки/хэша, скачивания badge/QR, печати.

### 10.3 `static/app.js` и `static/i18n.js`

- `app.js`: константы (`OWN_CODE_TASK_ID`, `DEFENSE_STORAGE_PREFIX`, demo emails), `DEFAULT_TASKS` (fallback, если API недоступен), `OWN_CODE_TASK`, DOM-ссылки, auth, загрузка задач, выбор языка, пресеты, verify, анимация шлюзов, рендер результата, defense (3 поля, sessionStorage, POST с `X-Defense-Token`), рекрутерский вид, i18n-хуки.
- `i18n.js`: RU/KZ/EN, `translate(key, params)`, переключатель, `data-i18n`-атрибуты.

### 10.4 Текущее состояние дизайна

На момент сборки документа в `static/index.html` и `static/card.html` всё ещё **тёмная палитра с фиолетовым акцентом** (`#7C5CFF`, `#9B85FF`, `#161B22`, `#0D1117` и т.п.). Это значит, что запланированный в `.design/2026-11-12-final-sprint.md` визуальный сдвиг к «измерительной лаборатории» (бумага `#F3EFE6`, графит `#191816`, vermilion `#B33A2B`, олива `#59624E`, без градиентов и теней, Georgia + mono) **ещё не выполнен** в рабочем дереве. Незакоммиченные изменения в `static/*` — это, судя по диффу, многоязычный поток/defense/portable actions, а не новая палитра. Для агента по дизайну это главная точка приложения усилий.

---

## 11. Тесты, метрики, качество

- **337 тестов** собирается сейчас (`pytest --collect-only`), 18 модулей:
  - `test_defense.py` 42, `test_signing.py` 43, `test_languages.py` 60, `test_injection_shield.py` 38, `test_multilang_api.py` 28, `test_static_contract.py` 18, `test_defense_api.py` 16, `test_fallback.py` 15, `test_badge.py` 13, `test_api_contract.py` 12, `test_secrets.py` 10, `test_gemini_mock.py` 9, `test_card_hash.py` 7, `test_db.py` 7, `test_demo_session.py` 6, `test_ast_gate.py` 5, `test_health.py` 4, `test_rate_limit.py` 4.
- **Coverage:** в README зафиксировано 84.29% при пороге 70% (на 2026-11-09). После добавления signing/defense/languages актуальный процент не перемерялся; перед финалом нужно пересчитать.
- **Линт/сборка:** README фиксирует `compileall` exit 0, `ruff` all checks, `node --check app.js` exit 0.
- **Latency (историческое, без Gemini):** health p50 8.0 ms / p95 9.1 ms; verify через HTTP p50 70.0 / p95 81.7 ms; in-process fallback p50 13.4 / p95 14.3 ms; n=10, порт 8017, временная SQLite.
- **Live Gemini latency не измерялась.** Нельзя заявлять «быстро» для живого модели.
- **Preset-наблюдения (исторические хэши):** ideal 90 Gold `d897bc535170`; vulnerable 52 Needs Work `13a9f361a692`; injection blocked Gate 2 score 0 `f01dcd4bbf22`. На свежей БД ideal даёт `8c101d0a2a98`.
- **Нет:** нагрузочного теста, конкурентного теста записи SQLite, security-аудита, A/B, пользовательских метрик.

---

## 12. Запуск, конфигурация, деплой

### 12.1 Локально

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts/run_demo.py
```

Опции: `--host`, `--port` (по умолчанию 8000 / `PORT`), `--no-browser`, `--reload`.

- Без `GEMINI_API_KEY` работает fallback.
- `.env` — только памятка; приложение читает `os.getenv`, `python-dotenv` не подключён. Переменные нужно задавать в окружении.
- `/api/ready` → `{ready, db, gemini_key, model, mode}`; `/api/health` → статус/режим/версия/модель/БД.

### 12.2 Переменные окружения

| Переменная | Назначение | Поведение |
|---|---|---|
| `MERILO_ENV` | `development` / `production` | production без секретов падает на старте |
| `MERILO_HMAC_SECRET` | HMAC карточек/сессий | dev — эфемерный + warning; production обязателен |
| `MERILO_ED25519_SEED` | base64url 32 байта | dev — эфемерный ключ; production обязателен |
| `MERILO_DEMO_MODE` | `1` включает passwordless demo | иначе `/api/demo/session` недоступен |
| `MERILO_DEMO_PASSWORD` | пароль демо-аккаунта | если нет — случайный; в dev печатается один раз |
| `GEMINI_API_KEY` / `LLM_API_KEY` | ключ модели | Gemini имеет приоритет |
| `GEMINI_MODEL` | модель | default `gemini-3.6-flash` |
| `MERILO_DB_PATH` | путь к SQLite | default `backend/merilo.db` |
| `RATE_LIMIT_MAX_REQUESTS` | лимит | default 20 |
| `RATE_LIMIT_WINDOW_SECONDS` | окно | default 60 |
| `MERILO_PUBLIC_BASE_URL` | база для QR/verify URL | default `https://merilo-nfc.fly.dev` |

Устаревшие имена `MARYM_*` поддерживаются как fallback (историческое имя проекта).

### 12.3 Ветки и деплой

- `final-sprint` — текущая работа, код + доки + незакоммиченные UI-изменения.
- `main` — по README, только то, что нужно для локального запуска/проверки; финальная submission-ветка по плану спринта.
- `deploy` — Dockerfile, `.dockerignore`, `fly.toml`, `render.yaml`, `.github/workflows/ci.yml`, скриншоты, `presentation.html`, `Merilo_NFC_Pitch.pptx`.
- Live: Fly.io, `https://merilo-nfc.fly.dev`.
- По плану спринта: до 13.11.2026 16:00 окно репозитория закрыто; пушить всю историю 13.11 до 15:00; перед пушем перенести презентационные артефакты в `main`.

---

## 13. Документация: карта и расхождения

| Документ | Состояние | Что внутри |
|---|---|---|
| `README.md` | **Частично устарел** | Продукт, быстрый старт, архитектура, метрики на 09.11; всё ещё говорит про `ast.parse`, «только Python», 109 тестов, публичную выдачу кода |
| `DESIGN.md` | Легаси/референс | Разбор Linear-стиля: тёмный canvas, lavender, surface ladder, Inter. Не соответствует новому замыслу «бумажный сертификат» |
| `docs/PROBLEM.md` | Актуален как гипотеза | Проблема, 3 сегмента, TAM/SAM/SOM `[assumption]`, pain→feature→evidence, план 5 интервью, ограничения |
| `docs/PITCH.md` | Актуален | 3-минутный сценарий, 30-секундная версия, 10 вопросов жюри, backup-слайды, «что не говорить» |
| `docs/COMPETITORS.md` | Актуален | Категории конкурентов, таблица, дифференциация, честные пробелы, «почему не скопируют за неделю» |
| `docs/DEMO.md` | Не прочитан детально | Сценарий демо (23 KB) |
| `docs/JURY_QA.md` | Не прочитан детально | Ответы жюри (12.5 KB) |
| `docs/READINESS.md` | Не прочитан детально | Готовность (21.8 KB) |
| `docs/FINAL_REPORT.md` | Не прочитан детально | Финальный отчёт (27.8 KB) |
| `docs/SUBMISSION.md`, `docs/SUBMISSION_TEXT.md` | Не прочитаны детально | Тексты заявки |
| `docs/UI_NOTES.md` | Актуален, есть незакоммиченные правки | Гайд по кандидатскому workflow и карточке |
| `docs/decisions/ADR-001..006` | Актуальны | Моноширинный порт, 3 шлюза, SQLite/Postgres, card hash + HMAC, fallback, demo access/branches |
| `.design/2026-11-12-final-sprint.md` | Локальный план, не коммитится | Спринт до финала 14.11: W1 defense, W2 визуал, W3 экономика, W4 deck/video, W5 JS, W6 аудит |
| `docs/EVIDENCE.md`, `docs/PILOT.md`, `docs/INTERVIEWS.md`, `docs/FINAL_AUDIT.md`, `docs/offline-demo.html` | **Ещё не созданы** | Артефакты W3/W6 из плана спринта |
| `docs/Отбор NFC Shymkent 2026.html` | Untracked | Материалы отбора NFC |

**Канонический источник правды по коду — сам код и этот документ.** README перед финалом нужно синхронизировать: 13 языков, tree-sitter, 337 тестов, Ed25519, defense, auth, badge/QR, отсутствие кода в публичной карточке.

---

## 14. Рынок и экономика (гипотезы, не факты)

### 14.1 Позиционирование против конкурентов

- **A. Assessment-платформы** (Codility, HackerRank, TestGorilla, CodeSignal): банк задач, автотесты, отчёты, ATS, античит, бренд. Merilo уже, но с прозрачной рубрикой и переносимой карточкой.
- **B. Практика** (LeetCode, Exercism): тренировка, не доказательство для работодателя.
- **C. Сертификаты** (Credly, Accredible): инфраструктура бейджей, но нет оценки работы.
- **D. LLM-обёртки**: один вызов модели, без шлюзов, подписи и воспроизводимости.
- **E. Status quo** (резюме, GitHub, тестовое): главный конкурент — бесплатный, привычный, но несравнимый.

### 14.2 Дифференциация

1. Три шлюза вместо одного вызова модели.
2. Офлайн-воспроизводимость (fallback + манифест).
3. Публичная проверка через HMAC/Ed25519.
4. Прозрачная рубрика 30/40/30 и пороги 85/70.
5. Zero-auth локальный однопортовый запуск для демо.
6. Кэш ответов модели, без SaaS-банка задач.

### 14.3 Честный пробел

У платформ больше ATS-интеграций, банк задач, античит и бренд. Merilo — узкий одношаговый инструмент. Технический барьер низкий: повторение за дни. Ров (moat) — доверие эмитента, сетевой эффект карточек, калибровка рубрики, операционная дисциплина и дистрибуция; **сейчас рва нет**.

### 14.4 Цены (из плана спринта, не проверены рынком)

- Кандидат — 0 ₸.
- Компания — 3 000 ₸ за проверенную карточку или 29 000 ₸/месяц (12 карточек).
- Буткемп — 149 000 ₸/семестр.

Юнит-экономика: один вызов модели на уникальный код + TTL-кэш; инфраструктура, платежи, поддержка. Маржа и точка безубыточности не посчитаны до конца; все входы должны быть либо со ссылкой, либо `[assumption]`.

---

## 15. Границы и риски

### 15.1 Продуктовые

- Нет подтверждённой боли: 0 интервью, 0 пилотов, 0 клиентов, 0 выручки.
- Неясно, кто платит и сколько: работодатель, буткемп или кандидат.
- Одна карточка может быть слишком слабым сигналом для найма.
- Нет сети/бренда; карточка ценна только если работодатель ей доверяет.

### 15.2 Доверие и безопасность

- HMAC доверяет серверу; компрометация секрета → подделка; ротация ломает старые карточки.
- Ed25519 seed — критичный секрет; эфемерный dev-ключ означает, что старые манифесты не проверить после рестарта.
- Публичная карточка отдаёт defense-ответы — кандидат должен понимать, что это публично.
- `ai_assisted` — самодекларация, не детекция.
- Личность и авторство не проверяются; нет античита/прокторинга.
- Gate 2 — regex; обход перефразированием.
- Открытый CORS, zero-auth verify/tasks, in-memory rate limit — демо-режим.
- Нет security-аудита и юридической проверки (GDPR/персональные данные).

### 15.3 Технические

- Один процесс, SQLite, in-memory кэш и лимиты; нет горизонтального масштабирования.
- Нет конкурентного теста записи; WAL помогает, но не решает multi-instance.
- 48-битный `card_hash`; теоретические коллизии.
- Нет ATS-интеграций, античита, банка задач уровня платформ.
- README/доки расходятся с кодом — риск для жюри и для агентов.
- Frontend всё ещё на Tailwind CDN и внешних шрифтах — офлайн-демо зависит от сети (план W2 требует вендорить).
- `/p/{user_id}` в ответе есть, роута не найдено.

### 15.4 Спринтовые

- Дедлайн финала 14.11.2026; материалы к 12.11 23:59.
- Незакоммиченные изменения в `static/*` и `tests/test_static_contract.py` — риск потерять/сломать.
- W2 (визуал), W3 (EVIDENCE/PILOT/INTERVIEWS), W4 (deck/video), W6 (FINAL_AUDIT) ещё не завершены.
- Интервью не проведены — нельзя выдумывать цитаты и «клиентов».
- Видео 90 с с голосом пользователя — подтверждено, но ещё не записано.
- Пуш всей истории до 13.11 15:00; окно репозитория закрывается 13.11 16:00.

---

## 16. Открытые вопросы для анализа (передать агентам)

### 16.1 Продуктовый критик

- Достаточно ли одной карточки, чтобы изменить решение о собеседовании?
- Кто реальный покупатель: HR, тимлид, буткемп? Кто бюджет?
- Не является ли «проверка кода» уже решённой проблемой для компаний 10–100?
- Что должно быть на карточке, чтобы её переслали коллеге?
- Как выглядит успех через 90 дней в измеримых числах?

### 16.2 Tech / security due diligence

- Проверить HMAC/Ed25519 цепочку на подделку и replay.
- Проверить атомарность `seal_card_defense` под конкурентными запросами.
- Проверить, не утекает ли `submitted_code`/`user_id`/токен через публичные проекции, manifest, логи, ошибки.
- Проверить CSP/CORS/rate limit/размеры тел.
- Оценить, что будет при ротации секретов и рестарте с эфемерным ключом.
- Проверить `/p/{user_id}` и другие битые ссылки.
- Оценить стоимость и latency live Gemini; поведение при 429/5xx.

### 16.3 Экономист

- Пересчитать TAM/SAM/SOM без двойного счёта; проверить 55k, 18k KZT, 25%, 2%.
- Посчитать unit economics: токены, инфраструктура, платежи, поддержка, CAC.
- Сравнить цену 3 000 ₸/карточка и 29 000 ₸/мес с альтернативами (Codility и т.п.).
- Проверить, платит ли буткемп 149 000 ₸/семестр.
- Определить break-even и минимальный пилот.

### 16.4 Дизайнер / UX

- Довести «измерительную лабораторию»: бумага/графит/vermilion/олива, без градиентов/теней/фиолетового.
- Проверить 320/768/1024/1440, отсутствие горизонтального скролла.
- AA-контраст, focus-visible, prefers-reduced-motion, Lighthouse accessibility ≥95.
- A4-печать: карточка на одну страницу, QR и defense видны.
- Убрать эмодзи-иконки, лишние чипы, rounded-lg/shadow.
- Офлайн: вендорить Tailwind, убрать внешние шрифты.

### 16.5 Питч-коуч

- 12 слайдов RU: титул, проблема, почему сейчас, решение, демо, техника, defense vs конкуренты, доказательства, границы, рынок/экономика, пилот/90 дней, команда/ask.
- Каждый слайд: один тезис + одно доказательство + сноска.
- Не заявлять: клиентов, пилотов, выручку, «доказанное авторство», «семантический щит», «измеренную latency Gemini».
- Подготовить ответы на 10 вопросов жюри из `docs/PITCH.md`.
- Видео 90 с: hook → demo → evidence/limits → ask; 1080p, голос пользователя, RU SRT.

### 16.6 Документационный аудит

- Синхронизировать README с кодом (13 языков, tree-sitter, 337 тестов, Ed25519, defense, auth, badge/QR, приватность кода).
- Создать `docs/EVIDENCE.md` (claim → source → date → what it proves → confidence).
- Создать `docs/PILOT.md` (0 / 3 000 / 29 000 / 149 000, 30/60/90, метрики).
- Создать `docs/INTERVIEWS.md` (20-мин скрипт; интервью не проведены).
- Создать `docs/FINAL_AUDIT.md` (PASS/WARN/FAIL с командами).
- Проверить, что `DESIGN.md` не вводит в заблуждение (он про старый стиль).

---

## 17. Глоссарий

| Термин | Значение |
|---|---|
| **Verified Skill Card** | Публичная подписанная карточка результата проверки |
| **Gate 1 / 2 / 3** | Парсинг → injection-щит → оценка модели/fallback |
| **Rubric 30/40/30** | Clean Code 30%, Architecture & Efficiency 40%, Edge Cases & Security 30% |
| **Gold / Silver / Needs Work** | Порог 85+ / 70+ / ниже 70 |
| **`card_hash`** | Первые 12 hex SHA-256 от task_id, имени, статуса, score, user_id и SHA-256 кода |
| **`user_id`** | `usr_` + 16 hex SHA-256 нормализованного email |
| **HMAC-подпись** | Серверная подпись `hash:user:score` |
| **Ed25519-манифест** | Переносимый подписанный набор метаданных + SHA-256 кода/задания |
| **Defense** | 3 вопроса по коду и 3 ответа, запечатанные в карточку |
| **`defense_token`** | Одноразовый токен, в БД только SHA-256 |
| **Fallback** | Детерминированная AST/лексическая эвристика без модели |
| **Own-code** | Режим загрузки своего кода вместо каталожного кейса |
| **Zero-auth** | Демо-режим без логина для жюри |
| **MARYM** | Историческое имя проекта, осталось в legacy env-переменных |

---

## 18. Быстрая проверка (для агента с доступом к репозиторию)

```powershell
# 1. Состояние
git status --short
git branch -vv

# 2. Тесты (сейчас 337)
python -m pytest --collect-only -q -p no:warnings
python -m pytest -q

# 3. Покрытие (порог 70%)
python -m pytest --cov=backend --cov-report=term-missing

# 4. Линт/сборка
python -m compileall backend
ruff check .
node --check static/app.js

# 5. Запуск демо
python scripts/run_demo.py --no-browser
# http://localhost:8000

# 6. Проверка API
curl http://localhost:8000/api/health
curl http://localhost:8000/api/ready
curl http://localhost:8000/.well-known/merilo.json

# 7. Проверка подписи карточки (если есть скрипт)
python scripts/verify_card.py --help
```

**Что считать доказательством, а что нет:**

- Зелёные тесты доказывают поведение кода, а не качество продукта.
- HMAC/Ed25519 доказывают целостность записи, а не авторство кода.
- Fallback доказывает работоспособность без сети, а не качество оценки.
- 84.29% coverage — историческая цифра; перед финалом перемерить.
- Живая latency Gemini не измерена; не заявлять.

---

## 19. Резюме в одном абзаце

Merilo — это соло-проект для NFC 2026, который пытается превратить одно короткое задание по коду в переносимый проверяемый артефакт: три шлюза отсекают синтаксический мусор и известные prompt-injection атаки, модель или детерминированная эвристика ставят оценку по прозрачной рубрике, а карточка связывает код, оценку, задание и (опционально) защиту криптографическими подписями. Сильная сторона — честная инженерия и ясные границы; слабая — отсутствие подтверждённой боли, клиентов и рва, а также незавершённый финальный спринт по дизайну, экономике и презентации. Для другого агента главная задача — не пересказать README, а проверить: выдерживает ли эта идея контакт с реальным покупателем, доверием и экономикой.
