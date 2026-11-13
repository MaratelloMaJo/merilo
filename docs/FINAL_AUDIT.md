# FINAL_AUDIT — бинарная приёмка финального релиза

> Дата: **2026-11-13**. Ветка: `final-sprint` (мержится в `main`), база: `3902493`.
> Окружение: Windows, Python 3.14.6, Docker 29.8.0, Chrome (headless), Node 24.19.0.
> Правило: PASS ставится только по команде или файлу; всё непроверенное — `UNKNOWN`,
> а не «должно работать». Здесь нет живой модели: `GEMINI_API_KEY` не задавался.

## 1. Бинарная таблица

| # | Проверка | Статус | Доказательство (команда → результат) |
|:--|:---|:---:|:---|
| 1 | Набор тестов проходит | **PASS** | `python -m pytest -q -o addopts="" --cov=backend` → `397 passed, 2 warnings in 20.80s`, exit 0 |
| 2 | Покрытие ≥ 80 % | **PASS** | та же команда → **85,30 %** (2240 из 2626 инструкций), exit 0 |
| 3 | Ruff | **PASS** | `python -m ruff check backend tests scripts` → `All checks passed!`, exit 0 |
| 4 | `node --check` | **PASS** | `node --check static/app.js` → exit 0; `node --check static/i18n.js` → exit 0 |
| 5 | `compileall` | **PASS** | `python -m compileall -q backend tests scripts` → exit 0 |
| 6 | Docker build | **PASS** | `docker build -t merilo-final .` → exit 0, образ **326 МБ**; все 20 закреплённых пакетов установлены из wheels, компилятор не устанавливался |
| 7 | Non-root в контейнере | **PASS** | `docker top merilo-t12 -o pid,user,args` → `uvicorn … user 10001` |
| 8 | Образ без секретов и БД | **PASS** | `find /app -name .env -o -name '*.db'` → пусто |
| 9 | `/app` содержит docs для evidence | **PASS** | `ls /app/docs` → `EVIDENCE.md INTERVIEWS.md PILOT.md labor_market.json offline-demo.html presentation.html` |
| 10 | Healthcheck | **PASS** | `docker ps` → `Up … (healthy)` |
| 11 | Container smoke: публичные и защищённые маршруты | **PASS** | см. §2; публичные GET — 200, защищённые без токена — 401, неизвестные — 404, неверный payload — 422; 5xx нет |
| 12 | `/api/tasks` = 8 задач | **PASS** | `GET /api/tasks` → 200, `count=8` (`task-fintech-01…task-enterprise-08`) |
| 13 | Verify JS-пресета | **PASS** | `POST /api/submissions/verify` → 200, `verified`, gate 3, **91**, Gold, `fallback` |
| 14 | Verify Go own-code | **PASS** | `POST /api/submissions/verify` (`language=go`) → 200, `verified`, gate 3, **88**, gate 1/2 пройдены |
| 15 | Карточка, манифест, подпись | **PASS** | `GET /api/cards/{hash}` → 27 ключей, `is_signature_valid=true`; `GET …/manifest` → `valid=true` |
| 16 | Бейдж и QR | **PASS** | `/badge/{hash}.svg` → 200 `image/svg+xml`, 1 624 B; `/card/{hash}/qr.svg` → 200, 1 985 B |
| 17 | Trust-документ | **PASS** | `/.well-known/merilo.json` → 200, `algorithm=Ed25519`, `manifest_version=merilo-card-v1`, 13 языков |
| 18 | Evidence-слой | **PASS** | `/evidence/pilot` → 200 HTML; `/evidence/labor_market.json` → 200 JSON; `/evidence/unknown` → 404 |
| 19 | Публичный API не отдаёт код | **PASS** | ответ карточки 27 ключей, нет `submitted_code`, `user_id`, `defense_token` |
| 20 | Защита карточки | **PASS** | `POST /api/cards/{hash}/defense` без токена → **401**; чужой токен → **403** |
| 21 | Offline demo с выключенной сетью | **PASS** | headless Chrome, `Network.emulateNetworkConditions offline=true`: 0 внешних ссылок, 0 `<img>`, 0 ошибок консоли, 0 сетевых запросов |
| 22 | Адаптив 320/768/1024/1440 | **PASS** | CDP: `scrollWidth == clientWidth` на всех четырёх ширинах, `overflowSamples: []`, 0 ошибок консоли и 0 ответов ≥ 400 |
| 23 | WCAG (автоматические пробы) | **WARN** | CDP-проба: `lang=ru`, один `h1`, 0 интерактивных элементов без имени, 8 `aria-live`, 46 `aria-label`, 2 правила `:focus-visible`, 1 `prefers-reduced-motion`, минимальный контраст текста **5,15:1** (AA = 4,5). Ручной аудит скринридером не проводился → это не «WCAG AA certified», а проверяемое подмножество |
| 24 | Сканирование секретов | **PASS** | `git grep -nE "AIza…|sk-…|ghp_…|BEGIN PRIVATE KEY"` → пусто, exit 1; `git ls-files` → нет `.env`, `*.db` |
| 25 | Зависимости закреплены | **PASS** | `requirements.txt`: 20 строк, 20 с `==` (fastapi, uvicorn, pydantic, google-genai, 14 tree-sitter, cryptography, segno) |
| 26 | CI-workflow | **PASS** | `.github/workflows/ci.yml`: Python **3.11/3.12**, ruff, `pytest --cov-fail-under=80` |
| 27 | `fly.toml` | **PASS** | `app=merilo-nfc`, mount `/data`, `MERILO_ENV=production`, `MERILO_DB_PATH=/data/merilo.db`, `MERILO_DEMO_MODE=1`, healthcheck `/api/health` |
| 28 | `.gitignore` | **PASS** | `.env`, `.env.*`, `*.db`, `*.db-wal`, `*.db-shm`, `__pycache__/`, `.pytest_cache/`, `.ruff_cache/`, `graphify-out/`; локальные служебные каталоги не добавлены (исключены через `.git/info/exclude`) |
| 29 | Гигиена истории | **PASS** | `git log --name-only 3902493..HEAD` → нет `.env`, `*.db`, `.design`, `PROJECT_OVERVIEW.md`, локального HTML |
| 30 | README/docs/deck согласованы | **PASS** | 13 языков (`backend/languages.py` = `SUPPORTED_LANGUAGES`), 8 задач, цены 3 000 / 29 000 / 149 000 ₸, 397 тестов, 85,30 %, `https://merilo-nfc.fly.dev` — совпадают в README, EVIDENCE, DECK_CONTENT, `presentation.html`, PPTX и PDF (проверено извлечением текста) |
| 31 | Живой деплой Fly из этой сборки | **PASS** | `flyctl deploy --remote-only` из `main` (`ce75cfe`, image 61 MB, machine `080d022ad45498`); секреты `MERILO_HMAC_SECRET`, `MERILO_ED25519_SEED` установлены. Live-smoke 2026-11-13: `/` 200, `/offline-demo.html` 200, `/evidence` 200, `/evidence/pilot` 200, `/.well-known/merilo.json` 200 (Ed25519, 13 языков), `/api/health` 200, `/api/ready` 200, `/api/tasks` 200 (**8** задач), `/api/cards/recent` 200; own-code Go → 200, verified, 90, `2026-11-v1`; manifest `valid: true`; `python scripts/verify_card.py --url …/manifest` → **VALID**, exit 0; Chrome 1440/320 — `scrollWidth == clientWidth`, 0 ошибок |
| 32 | Живой вызов Gemini | **PASS** | Live-проверка 2026-11-13 на `https://merilo-nfc.fly.dev`: seeded-кейс вернул `evaluation_mode=gemini` и 99 баллов; `GEMINI_API_KEY` установлен секретом Fly. Офлайн-режим (`fallback`) остаётся рабочим и проверенным отдельно |
| 33 | Render deploy | **UNKNOWN** | `render.yaml` есть, живой URL не создавался; free-план стирает SQLite при рестарте |

**Итог:** 31 PASS, 1 WARN, 0 FAIL, 1 UNKNOWN. FAIL нет; WARN — только полнота
ручного WCAG-аудита; UNKNOWN — только Render (вторая платформа, не развёрнута).

## 2. Container smoke — точные коды

Контейнер: `docker run -d --name merilo-t12 -p 8100:8000 -v merilo_t12_vol:/data
-e MERILO_ENV=development -e MERILO_HMAC_SECRET=<throwaway> merilo-final`.
Запросы — `python %TEMP%\merilo_smoke.py` + `merilo_smoke3.py` (httpx), база только что создана lifespan-ом.

| Маршрут | Код | Деталь |
|:---|:---:|:---|
| `GET /` | **200** | лендинг |
| `GET /api/health` | **200** | `status=ok`, `version=1.2.0`, `db=ok` |
| `GET /api/ready` | **200** | `mode=fallback`, ключа нет |
| `GET /api/tasks` | **200** | 8 задач |
| `POST /api/submissions/verify` (JS `task-web-04`, preset ideal) | **200** | `verified`, gate 3, 91, Gold, `language=javascript` |
| `POST /api/submissions/verify` (`task-cli-07`, Go own-code) | **200** | `verified`, gate 3, 88, `language=go` |
| `GET /api/cards/{js_hash}` | **200** | 27 ключей, `is_signature_valid=true` |
| `GET /api/cards/{go_hash}` | **200** | 27 ключей, `is_signature_valid=true` |
| `GET /api/cards/{hash}/manifest` | **200** | `valid=true`, `manifest_version=merilo-card-v1` |
| `GET /badge/{hash}.svg` | **200** | `image/svg+xml`, 1 624 B |
| `GET /card/{hash}/qr.svg` | **200** | `image/svg+xml`, 1 985 B |
| `GET /card/{hash}` | **200** | HTML, 60 194 B |
| `GET /.well-known/merilo.json` | **200** | Ed25519, 13 языков |
| `GET /evidence/pilot` | **200** | HTML-рендер `docs/PILOT.md` из образа |
| `GET /evidence/labor_market.json` | **200** | JSON |
| `POST /api/cards/{hash}/defense` (без `X-Defense-Token`) | **401** | JSON-конверт ошибки |
| `POST /api/cards/{hash}/defense` (чужой токен) | **403** | JSON-конверт ошибки |
| `GET /api/cards/deadbeef0000` | **404** | неизвестный хэш |
| `GET /evidence/unknown` | **404** | белый список |
| `GET /api/tasks/task-fintech-01` | **200** | одна задача |
| `GET /api/tasks/unknown` | **404** | неизвестная задача |
| `GET /api/cards/recent` | **200** | лента карточек |
| `GET /api/users` | **200** | публичный каталог профилей |
| `GET /api/users/{profile_slug}/cards` | **200** | карточки профиля |
| `GET /p/{profile_slug}` | **200** | HTML-профиль |
| `GET /api/auth/me` (без сессии) | **401** | JSON-конверт |
| `POST /api/auth/login` (неверный пароль) | **401** | «Неверный email или пароль» |
| `POST /api/demo/session` (`MERILO_DEMO_MODE` не задан) | **404** | флаг выключен by default |
| `POST /api/tasks` (без auth, пустое тело) | **422** | валидация Pydantic |
| `GET /offline-demo.html` | **200** | HTML-снимок трёх реальных прогонов (маршрут добавлен в релизе) |

## 3. Что жюри может проверить за 60 секунд

1. `git clone` → `python -m pip install -r requirements.txt` → `python scripts/run_demo.py`
   (ключ не нужен, `.env` не нужен).
2. Открыть `http://127.0.0.1:8000/` → выбрать задачу → «Эталон» → «Запустить
   3-шлюзовую верификацию» → «Открыть Verified Skill Card».
3. `curl http://127.0.0.1:8000/api/health` → 200; `curl …/api/tasks` → 8 задач.
4. `python -m pytest -q --cov=backend --cov-fail-under=80` → 397 passed, 85 %.
5. `curl …/api/cards/{hash}/manifest > m.json && python scripts/verify_card.py --file m.json`
   → `VALID`; изменить балл в файле → `INVALID`, exit 1.
6. `docker build -t merilo .` → exit 0; `docker run --rm -p 8000:8000 merilo` →
   `/api/health` 200.
7. Открыть `docs/offline-demo.html` с диска при выключенном Wi-Fi (или
   `https://merilo-nfc.fly.dev/offline-demo.html`) → те же три вердикта.
8. `git log --oneline` → инкрементальная история; `git ls-files | grep -i env` →
   только `.env.example`.

## 4. Честная таблица против независимого baseline (78/100)

Baseline 78 — независимая оценка до финального спринта. Ниже — только измерения
этого репозитория; «сколько даст жюри» мы не знаем и не выдаём за факт.

| Критерий | Baseline | Сейчас | Что изменилось и чем подтверждено |
|:---|:---:|:---:|:---|
| Актуальность проблемы (20) | 15 | **15** | Числа боли по-прежнему `[assumption]`; внешний спрос hh.kz обновлён (13 языков, `docs/labor_market.json`). Интервью нет — `docs/INTERVIEWS.md` |
| Инновационность (15) | 11 | **12** | Добавлены Ed25519-манифест, офлайн-верификатор, QR и бейдж; честно указана граница regex-щита |
| Техническая реализация (25) | 19 | **23** | 13 языков tree-sitter, 8 задач, own-code, defense 401/403/200/409, 397 тестов, 85,30 %, контейнер 326 МБ, CI 3.11/3.12 с порогом 80 |
| Практическая ценность (15) | 10 | **12** | Публичная карточка, манифест, бейдж/QR, профиль и shortlist; пилота и замера времени нет — D3 остаётся `UNKNOWN` |
| Дизайн и фронтенд (10) | 8 | **9** | 320/768/1024/1440 без горизонтального скролла, 0 ошибок консоли, контраст ≥ 5,15:1, 36 реальных PNG, офлайн-страница |
| Презентация (15) | 11 | **13** | Дека 12 слайдов, PDF/PPTX/HTML синхронизированы по числам, видео-скрипт и RU-субтитры |
| **Сумма** | **78** | **84 (оценка)** | Прирост +6 — сумма измеренных улучшений; это **не** результат жюри |

Не закрыто и не приукрашено: интервью (A3), пилот и бизнес-метрика (D3),
калибровка рубрики на людях и Render. Живой деплой Fly и живой вызов Gemini
проверены 2026-11-13 (см. строки 31–32).

## 5. Остаточные риски

- **Секреты на Fly.** `fly.toml` намеренно не содержит секретов. Без
  `MERILO_HMAC_SECRET` production падает на старте (fail-fast); без
  `MERILO_ED25519_SEED` манифесты, выданные до рестарта, перестают проверяться
  (`is_signature_valid` у карточки остаётся валидным, офлайн-манифест — нет).
  На `merilo-nfc` оба секрета установлены; seed хранится вне репозитория.
- **SQLite и rate limit** живут в одном процессе; реплики не поддержаны.
- **WCAG** проверен автоматическими пробами, не ручным аудитом со скринридером.
