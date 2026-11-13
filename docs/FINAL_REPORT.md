# Итоговый отчёт о проверке — Merilo, NFC 2026, кейс 5 «The Experience Gap»

> Дата измерений: 2026-11-09. Окружение: локальная Windows-машина, Python 3.14.6;
> контейнерные проверки — `python:3.12-slim`. Если не указано иное, все числа ниже
> получены в этот день, а не взяты из прогноза. Отчёт описывает то, что реально
> запускалось; всё непроверенное перечислено в §10.
>
> **Это исторический срез P4 (2026-11-09).** Актуальные числа и бинарная приёмка
> релиза — [`docs/FINAL_AUDIT.md`](FINAL_AUDIT.md) (2026-11-13: 397 тестов,
> 85,30 %, образ 326 МБ).

## 1. Статус

**Демо работает целиком: 9/9 пресетов, публичная карточка, подпись, Docker, CI.**
Локальные проверки зелёные: 109 тестов, покрытие 84%, `ruff` и `compileall` без
замечаний. Живой вызов Gemini подтверждён один раз и зафиксирован в §6.

Осознанно **не заявляется**:

- «оценка ИИ откалибрована на людях» — рубрика не сверялась с оценками тимлидов;
- «бизнес-метрика измерена» — пилота не было, есть только техническая латентность;
- «спрос подтверждён» — интервью не проводились, все числа боли помечены `[assumption]`;
- «production-ready» — открытый CORS, zero-auth, rate limit в памяти и SQLite
  являются демо-решениями и прямо описаны как таковые.

Дисквалифицирующих признаков нет: в HEAD нет секретов, нет заглушек, выдаваемых за
рабочие функции, нет захардкоженных баллов; инъекция блокируется, тесты проходят.
Остаточный риск — старый литерал секрета в истории коммитов (§10, п. 3).

## 2. Чем это проверено

| # | Проверка | Условие | Результат |
|:--|:---|:---|:---|
| 1 | Чистое окружение | новый venv вне репозитория, Python 3.14.6, `pip install -r requirements.txt -r requirements-dev.txt` | все пины установлены (fastapi 0.162.0, uvicorn 0.54.0, pydantic 2.13.5, google-genai 2.24.0, pytest 9.2.0, pytest-cov 7.1.0, ruff 0.17.4, httpx 0.28.1), exit 0 |
| 2 | Запуск без ключа и без `.env` | `uvicorn backend.main:app --port 8123`; `GEMINI_API_KEY`/`LLM_API_KEY` удалены; `MERILO_DB_PATH` во временном каталоге | `.env` приложением не читается: `load_dotenv`/`python-dotenv` не встречается ни в одном `*.py`; при ключе в `.env` `/api/ready` вернул `gemini_key:false`, `mode:"fallback"` |
| 3 | API-матрица | 3 задачи × 3 пресета, детерминизм, карточка, 400/413/404/429, HTML-страницы | §3 |
| 4 | Локальные проверки | `compileall`, `ruff`, `pytest --cov`, `node --check` | §7 |
| 5 | Browser QA | реальный Chrome, 1440×900, 390×844, 360×800, три пресета, error/retry/429 | §8 |
| 6 | Живой Gemini | один `POST /api/submissions/verify` при ключе в окружении | §6; ключ нигде не напечатан |
| 7 | Docker | `docker build` + `docker run` без ключа и без `.env`, две независимые свежие volumes | §7 |

## 3. API-матрица (без ключа, fallback)

| Задача | Пресет | status | gate | score | badge | card_hash |
|:---|:---|:---|:---|:---|:---|:---|
| task-fintech-01 | ideal | verified | 3 | 90 | Gold Verified | 2e92ff456cf0 |
| task-fintech-01 | vulnerable | verified | 3 | 52 | Needs Work | c56d4a970d1a |
| task-fintech-01 | injection | blocked | 2 | 0 | Rejected | f67d1d716edc |
| task-logistics-02 | ideal | verified | 3 | 89 | Gold Verified | d27bcfaa2535 |
| task-logistics-02 | vulnerable | verified | 3 | 42 | Needs Work | bf9b81b4b9ca |
| task-logistics-02 | injection | blocked | 2 | 0 | Rejected | 4b265cf98d00 |
| task-edtech-03 | ideal | verified | 3 | 91 | Gold Verified | 8404362f3b57 |
| task-edtech-03 | vulnerable | verified | 3 | 53 | Needs Work | 7c71e614cbe1 |
| task-edtech-03 | injection | blocked | 2 | 0 | Rejected | ba332e9b1e20 |

- `/api/health` → `200 {"status":"ok","mode":"demo_active","version":"1.2.0","model":"gemini-3.6-flash","db":"ok"}`.
- `/api/ready` → `200 {"ready":true,"db":"ok","gemini_key":false,"model":"gemini-3.6-flash","mode":"fallback"}`.
- `/api/tasks` → `count=3`, ids `["task-fintech-01","task-logistics-02","task-edtech-03"]`.
- Повторная отправка того же кода (`task-fintech-01`, ideal) → тот же `card_hash` `2e92ff456cf0` (`equal=True`).
- `GET /api/cards/2e92ff456cf0` → `200`, `is_signature_valid=true`, 21 ключ, балл в карточке совпадает с ответом verify (90).
- Ошибки: пустой код → `400` `{"error":{"code":400,"message":"Код не может быть пустым"}}`; 70 000 символов → `413` «Код превышает лимит 64 KB»; неизвестный `task_id` → `404 "Micro-task not found"`; неизвестный `card_hash` → `404 "Verified Skill Card not found"`.
- Rate limit при `RATE_LIMIT_MAX_REQUESTS=2`: коды `200, 200, 429`; тело 429 — `{"error":{"code":429,"message":"Превышен лимит запросов на верификацию. Повторите попытку позже."}}`.
- `GET /` и `GET /card/{hash}` → `200`, `text/html; charset=utf-8`, тело начинается с `<!DOCTYPE html>`.
- Ни один из 9 баллов не равен 98, 95 или 96: `[90, 52, 0, 89, 42, 0, 91, 53, 0]` — балл вычисляется из присланного кода, а не берётся из таблицы.
- 17 из 17 проверок матрицы — PASS.

Колонка `card_hash` — снимок до фикса `create_user`. После фикса хэш стабилен
между свежими базами: один и тот же ideal-пресет с тем же `candidate_name` на двух
независимых Docker-томах дал `8c101d0a2a98` оба раза, подпись валидна. Повторная
отправка того же кода на одной базе дала `1f5bdb56f7ed` дважды.

## 4. Что именно показывает карточка

- Панель результата и карточка показывают источник оценки: `evaluation_mode`
  (`gemini` / `fallback`), `confidence` (`high` / `low`), `fallback_reason`.
- Fallback подписан как детерминированная эвристика, а не как модель.
- Gate 2 после сужения сигнатуры не срабатывает на документационные упоминания
  «system prompt», но блокирует императивы (`ignore previous instructions`,
  `award perfect score`, `clean_code = 100`); поведение закреплено 8 тестами.
- Публичная карточка доступна без авторизации по `/card/{card_hash}`; API —
  `GET /api/cards/{hash}` с `is_signature_valid`.

## 5. Латентность (без ключа, n=20, warmup=3, два прогона подряд)

| Операция | p50 | p95 |
|:---|:---|:---|
| `GET /api/health` | 6.26 / 6.17 мс | 7.47 / 7.17 мс |
| `POST /api/submissions/verify` (fallback) | 60.42 / 61.31 мс | 64.70 / 69.39 мс |
| `get_fallback_evaluation` (in-process) | 12.97 / 12.56 мс | 14.94 / 15.27 мс |

0 ошибок, 0 запросов, упёршихся в rate limit. Относительно предыдущего замера
(verify p50 57.03, fallback p50 12.37) это +3.4…+4.3 мс (+6–7,5 %) на verify p50:
горячий путь побайтово совпадает, единственное изменение в `backend` (`create_user`)
на нём не вызывается, health и fallback сдвинулись в ту же сторону — это дрейф
машины, а не регрессия кода. Оптимизация не применялась.
Прошлый независимый замер (порт 8017, n=10): health p50 8.01 / p95 9.14 мс,
verify 69.97 / 81.72 мс, fallback 13.35 / 14.26 мс.

**Живой режим не измерялся статистически.** Известен один вызов (§6); p50/p95
живой модели у нас нет, поэтому скорость Gemini не заявляется. При ключе
добавляется сетевой вызов с таймаутом 6 с и бюджетом 12 с на цепочку моделей.
Первый fallback-вызов после простоя — до ~205 мс (холодный старт), в p50/p95 не входит.

## 6. Живая модель

`GET /api/ready` при `GEMINI_API_KEY`:
`{"ready":true,"db":"ok","gemini_key":true,"model":"gemini-3.6-flash","mode":"live"}`.

Один `POST /api/submissions/verify` (`task-fintech-01`, ideal, 2 597 символов):

| Поле | Значение |
|:---|:---|
| HTTP | 200 |
| `status` / `gate_reached` | `verified` / 3 |
| `total_score` / `badge_tier` | 100 / Gold Verified |
| `card_hash` | `821a151cc9e4` |
| `evaluation_mode` | `gemini` |
| `fallback_reason` | `null` |
| `confidence` | `high` |
| `X-Response-Time` | 3958.0 (мс) |
| wall clock | 4 041 мс |

Фактическая цепочка: `gemini-3.6-flash` → 429 ×2, `gemini-3.5-flash` → 429 ×2,
`gemini-3.5-flash-lite` → 200 OK за 1.67 с. В логах:
`verify_gemini_ok model=gemini-3.5-flash-lite`, `gate=3 latency_ms=3947.8 mode=gemini`;
строки `verify_fallback` нет. `GET /api/cards/821a151cc9e4` → 200, подпись валидна.

**Оговорка:** основная модель была ограничена по частоте в момент вызова, поэтому
оценивала `gemini-3.5-flash-lite`. В JSON-ответе поля `model` нет — модель видна
только в логе. Балл 100 отличается от fallback-оценки 90, потому что оценивала
реальная модель; тир важнее числа.

## 7. Локальные проверки и Docker

| Команда | Результат |
|:---|:---|
| `python -m compileall -q backend tests scripts` | exit 0 |
| `python -m ruff check backend tests scripts` | `All checks passed!`, exit 0 |
| `python -m pytest -q --cov=backend --cov-report=term-missing --cov-fail-under=70` | **109 passed**, 0 failed, 0 skipped, покрытие **84,29 %** (pytest печатает 84 %), порог 70 % пройден |
| `node --check static/app.js` | exit 0 |

Покрытие по модулям: `db.py` 82 %, `main.py` 73 %, `verifier.py` 84 %,
`fallback_cache.py` 88 %, `schemas.py` 95 %, `seed_data.py` 100 %.
Те же `ruff` и `pytest` прогонялись на дереве, из которого собран Docker-образ.

**Docker.** `docker build -t merilo:p4b .` → exit 0, образ **288 МБ**, база
`python:3.12-slim`; процесс работает как `uid=10001(merilo)`; `/app` содержит
`backend data requirements.txt sql static`, внутри нет `.env` и `*.db`;
`HEALTHCHECK` переходит в `healthy` за ~8–12 с.

- 9/9 пресетов внутри контейнера, без ключа и без `.env`: `90/52/0`, `89/42/0`,
  `91/53/0`; все три инъекции — `blocked` на Gate 2, `Rejected`; подпись валидна.
- Детерминизм между volume: та же задача, тот же ideal-пресет и `candidate_name`
  на двух независимых свежих volume → одинаковый `card_hash = 8c101d0a2a98`,
  обе подписи валидны.
- В production-логах нет демо-пароля и токена: только
  `demo login disabled: set MERILO_DEMO_PASSWORD to enable it`.
- **Render не задеплоен**: живого URL нет, проверены только синтаксис и дизайн
  `render.yaml`.

## 8. Browser QA (реальный Chrome, без ключа)

- 1440×900: 3 таба кейсов в один ряд (top=130, left=118/277/435), гейты `pending`,
  пресет заполняет редактор (2 596 символов, 71 строка), `scrollWidth=1434 ≤ 1440`,
  0 ошибок в консоли.
- Loading/disabled: при Slow 3G через 456 мс после клика — `disabled=true`,
  `aria-busy=true`, CTA «Проверяем…», gate1 `running`, gate2/3 `pending`,
  карточка результата скрыта.
- Ideal: `ВЕРИФИЦИРОВАНО`, Gold Verified, 89, все три гейта `pass`,
  hash `4166bb11c742`, `✓ HMAC Signed`, provenance fallback.
- `/card/4166bb11c742`: бейдж, 89, бары 83/88/96, hash,
  «Verified — подпись действительна», `is_signature_valid=true`.
- Vulnerable: `verified`, Needs Work, 13, hash `ddcbc3b173a8`.
- Injection: `Score: 0 · Gate 2 · Blocked`, gate2 `fail`, gate3 `skipped`,
  Gold отсутствует в DOM; API отдаёт `status=blocked`, `badge_tier=Rejected`, 0,
  gate 2; 5xx и исключений нет.
- Error/retry: пустой редактор отсекается клиентом до запроса (toast
  «Введите код для верификации!»); реальный `400` (payload U+001C) отрисован как
  `Проверка не выполнена: Код не может быть пустым. Проверьте соединение с сервером
  и повторите.` — серверный текст дошёл до UI, `Uncaught (in promise)` в консоли
  отсутствует; после ошибки кнопка снова активна, повторная отправка ideal дала
  `200`, 89 и hash `90d5ec0216fd`.
- 429: панель `Проверка не выполнена: Превышен лимит запросов на верификацию.
  Повторите попытку позже. Проверьте соединение с сервером и повторите.` —
  одна точка, без стека, страница жива, кнопка активна.
- 390×844: `scrollWidth=390` (нет горизонтального скролла), три таба кейсов
  в столбик (top 193/255/317, left 29, ширина 332, названия не обрезаны),
  карточка читается, перекрытий нет.
- Мобильная CTA: sticky-бар `#mobile-verify-cta` (скрыт при `lg` и выше) виден
  на первом экране при 390×844 (`y775 h69`, кнопка 358×44) и при 360×800
  (`y731 h69`, кнопка 328×44); `scrollWidth` равен вьюпорту в обоих случаях;
  состояние disabled/«Проверяем…» синхронизировано с основной кнопкой;
  в режиме рекрутера бар скрыт.
- `/favicon.ico` 404 устранён inline-иконкой: на `/` и `/card/{hash}` запросов
  favicon больше нет, все same-origin запросы 200.

**Скриншоты** (реальный Chrome, без мокапов), `screenshots/p4/`:

| Файл | Размер снимка | Байт |
|:---|:---|:---|
| `landing-1440.png` | 1434×1021 | 251 373 |
| `landing-390.png` | 1170×7290 (390×2430 CSS @ DPR 3) | 855 919 |
| `card-gold.png` | 1425×1271 | 194 686 |
| `injection-blocked.png` | 1434×1452 | 316 462 |
| `landing-360.png` | 360×800 | 70 801 |
| `card-360.png` | 360×800 | 60 676 |
| `landing-390-cta.png` | 780×1688 (390×844 CSS @ DPR 2) | 188 233 |

Пять ранее закоммиченных PNG проверены как валидные и не перезаписывались:
`landing-1440.png` 1440×1021, `landing-390.png` 390×2306, `card-gold.png`
1280×1271, `injection-blocked.png` 1440×1403, `architecture.png` 3306×3760
(рендер Mermaid из README).

## 9. Соответствие критериям кейса

| ID | Утверждение | Доказательство | Статус |
|:---|:---|:---|:---|
| A1 | Аудитория названа (junior 0–2 года; HR/рекрутер продуктовой компании 10–100 человек; учебный центр), но боль количественно не измерена | числа помечены `[assumption]` в таблице гипотез, `docs/PROBLEM.md` §2–3 | частично |
| A2 | Боль → фича → доказательство, поток пройден end-to-end | таблица из 10 строк; живой journey в Chrome, §8 | подтверждено |
| A3 | Внешнего подтверждения спроса нет | интервью, пилотов и листа ожидания нет; конкуренты названы, но это не подтверждение спроса | не подтверждено (честно) |
| B1 | Ядро — 3-шлюзовый конвейер, не CRUD; есть сравнение с ближайшими аналогами | `ast.parse` → regex-щит → рубрика → hash → HMAC; `docs/COMPETITORS.md` §2–3 | подтверждено |
| B2 | Новизна в коде | офлайн AST-эвристика без сети, воспроизводимый `card_hash`, HMAC | подтверждено |
| B3 | Конкуренты названы, отличие конкретное; moat отсутствует | подписанная публичная карточка + детерминированный офлайн-путь; прямая фраза «moat сейчас нет» | подтверждено с оговоркой |
| C1 | Чистый checkout запускается по документированным командам | venv + `pip install` → uvicorn → `/api/health` 200; тот же путь в `python:3.12-slim` | подтверждено |
| C2 | Основной сценарий работает end-to-end | 9/9 пресетов, карточка, детерминизм; 9/9 повторено в контейнере | подтверждено |
| C3 | Модульность и контракты | `main` / `verifier` / `fallback_cache` / `db` / `schemas`; Pydantic v2 на границе LLM и API | подтверждено |
| C4 | Автотесты одной командой | 109 passed, 0 failed, покрытие 84,29 % при пороге 70 % | подтверждено |
| D1 | Пошаговый journey со скриншотами и командами | 60-секундный сценарий; 7 свежих PNG в `screenshots/p4/` | подтверждено |
| D2 | Готовность к запуску | `.env.example` с пустыми значениями, `requirements.lock`, `/api/health`, `/api/ready`, `docs/DEPLOY.md`; образ 288 МБ, `uid=10001`, `healthy` за 8–12 с | подтверждено, кроме Render |
| D3 | Измеренная бизнес-метрика | на реальных пользователях не измерялась; есть определённая метрика экономии, техническая латентность и TAM/SAM/SOM-допущения | не подтверждено (честно) |
| E1 | UI-поток понятен без обучения, скриншоты реальные | Chrome 1440×900 и 390×844, три пресета, 0 ошибок в консоли после фиксов | подтверждено |
| E2 | Адаптив и базовая доступность | 360×800 и 390×844: `scrollWidth` равен вьюпорту; sticky CTA на первом экране; `focus-visible` / aria / reduced-motion | подтверждено |
| N1 | Заглушек, выдаваемых за рабочие функции, нет | `PRESET_EVALUATIONS` удалён; fallback помечен `evaluation_mode="fallback"`, `confidence="low"`, `fallback_reason` непустой | подтверждено |
| N2 | Секретов в HEAD нет | секрет только из env, fail-fast в production, 10 тестов; `.env` в `.gitignore`; старый литерал остался в истории `ba02d14` | подтверждено с оговоркой |
| N3 | Баллы вычисляются, а не захардкожены | 9 разных баллов на 9 отправок, ни одного 98/95/96 | подтверждено |
| N4 | Тесты есть и проходят | 109 тестов, 0 skipped/xfail | подтверждено |
| N5 | Внешний I/O обрабатывается | bare `except` отсутствует; 400/413/404/422/429 в JSON-конверте; структурные логи `request_id/task_id/gate/latency_ms` | подтверждено |
| N6 | Не тонкая обёртка над API | AST-парсер, regex-щит, рубрика, HMAC, SQLite — в своём коде | подтверждено |
| N7 | README не противоречит коду | модель из `GEMINI_MODEL` (по умолчанию 3.6-flash), пороги 85/70, лимиты и коды ошибок сверены | подтверждено |
| N8 | Демо-путь не эксплуатируется тривиально | инъекция → `blocked`, gate 2, 0; SQL параметризован; текст в UI через `textContent` | подтверждено с оговоркой |

## 10. Что осталось не проверенным и почему

1. **A3 — внешнее подтверждение спроса.** Интервью не проведены, пилотов и листа
   ожидания нет. План — `docs/PROBLEM.md` §6 (5 интервью). Кодом не закрывается.
2. **D3 — измеренная бизнес-метрика.** Есть определённая метрика экономии времени,
   но не измеренная на реальных пользователях. Нужен пилот и замер времени
   скрининга до/после.
3. **История git.** Литерал из `ba02d14` остаётся в истории; HEAD чистый. Значение
   считается скомпрометированным и ротировано; переписывание истории требует
   явного решения владельца и не выполнялось.
4. **Render не задеплоен.** Живого URL нет; проверены только синтаксис и дизайн
   `render.yaml`.
5. **`X-Response-Time` — голый float в миллисекундах**, без единицы измерения:
   на защите это нужно проговаривать.
6. **В ответе verify нет поля `model`.** Видно только `evaluation_mode`; какая
   именно модель оценивала (в живом прогоне — `gemini-3.5-flash-lite`), можно
   узнать лишь из лога.

## 11. Как воспроизвести

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt -r requirements-dev.txt
$env:MERILO_ENV="development"
$env:MERILO_DB_PATH="$env:TEMP\merilo-verify.db"
Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:LLM_API_KEY -ErrorAction SilentlyContinue
python -m uvicorn backend.main:app --port 8123
```

```powershell
python -m compileall -q backend tests scripts
python -m ruff check backend tests scripts
python -m pytest -q --cov=backend --cov-report=term-missing --cov-fail-under=70
node --check static/app.js
python scripts/bench.py --base-url http://127.0.0.1:8123 --mode http --requests 20
python scripts/bench.py --mode fallback --requests 20
```

Docker (без ключа и без `.env`; приложение читает только окружение):

```powershell
docker build -t merilo .
docker run --rm -d --name merilo-demo -p 8010:8000 merilo
docker inspect --format "{{.State.Health.Status}}" merilo-demo   # healthy через 8–12 с
docker run --rm merilo id -u                                     # 10001
# детерминизм между двумя независимыми свежими volume
docker run --rm -d --name merilo-a -p 8011:8000 -v merilo-a:/app/data merilo
docker run --rm -d --name merilo-b -p 8012:8000 -v merilo-b:/app/data merilo
# тот же ideal-пресет и candidate_name на обоих портах → card_hash 8c101d0a2a98
```

Живой путь Gemini (ключ задаёт оператор в своём окружении; в файлы и вывод не пишется):

```powershell
Invoke-RestMethod http://127.0.0.1:8123/api/ready
$t = Invoke-RestMethod http://127.0.0.1:8123/api/tasks | Where-Object id -eq 'task-fintech-01'
$body = @{ task_id = $t.id; submitted_code = $t.preset_ideal; candidate_name = 'Live Check' } | ConvertTo-Json
$r = Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8123/api/submissions/verify `
     -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body))
$r | Select-Object status, gate_reached, total_score, badge_tier, card_hash, evaluation_mode, fallback_reason
Invoke-RestMethod "http://127.0.0.1:8123/api/cards/$($r.card_hash)"
```

Признак живого пути: `evaluation_mode="gemini"`, `fallback_reason=null`; модель,
которая фактически ответила, видна только в логе (`verify_gemini_ok model=...`).
Все блоки выше, кроме живого вызова, не требуют ключа; `.env` приложением не читается.

## 12. Что изменилось в этом проходе

- `backend/db.py` — `create_user`: `user_id` = `usr_` + первые 16 hex SHA-256 от
  нормализованного email; `card_hash` перестал зависеть от автоинкремента.
- `backend/seed_data.py` — в `MERILO_ENV=production` демо-пароль генерируется молча,
  в stdout попадает только строка-подсказка.
- `static/index.html`, `static/app.js` — sticky-бар `#mobile-verify-cta`,
  disabled/«Проверяем…», скрытие в режиме рекрутера; конверт ошибок
  `{"error":{"message","details"}}` в login/register/task publish; снятие
  `Uncaught (in promise)`; табы кейсов `grid-cols-1 sm:grid-cols-3`; inline favicon.
- `static/card.html` — inline favicon.
- `tests/test_card_hash.py` — +3 теста; `tests/test_secrets.py` — +1 тест; итог 105 → 109.
- `screenshots/p4/landing-360.png`, `card-360.png`, `landing-390-cta.png`.
- `README.md` — формула hash, факты Docker, статус D2/E2, доказательство 360 px.
- `docs/READINESS.md` — статус P0–P4 с фактами; этот отчёт; `docs/decisions/` — ADR.
