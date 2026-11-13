# API Merilo

> **RU-заметки, EN-код.** Базовый URL локального демо: `http://127.0.0.1:8000`. Интерактивная схема — **`/docs`** (Swagger UI), машинная — `/openapi.json`. Все примеры ниже проверены на сборке 2026-11-13; ответы сокращены, чтобы не занимать страницу.
>
> Демо работает без аутентификации: `/api/tasks` и `/api/submissions/verify` открыты намеренно. В production это заменяется, а не «уже настроено».

## 1. `GET /api/tasks` — каталог кейсов

```bash
curl -s http://127.0.0.1:8000/api/tasks
```

Ответ — массив микро-задач. У каждой есть `id`, `language`, `title`, `description`, `rubric` и три пресета: `preset_ideal`, `preset_vulnerable`, `preset_injection`. Один кейс:

```bash
curl -s http://127.0.0.1:8000/api/tasks/task-fintech-01
```

## 2. `POST /api/submissions/verify` — seeded task

```bash
# 1. Сохранить эталонный пресет в файл (jq или python — что установлено).
curl -s http://127.0.0.1:8000/api/tasks/task-fintech-01 \
  | python -c "import json,sys; sys.stdout.write(json.load(sys.stdin)['preset_ideal'])" > /tmp/ideal.py

# 2. Собрать payload и отправить.
python - <<'PY'
import json, pathlib
code = pathlib.Path("/tmp/ideal.py").read_text(encoding="utf-8")
payload = {
    "task_id": "task-fintech-01",
    "candidate_name": "Evidence Check",
    "submitted_code": code,
    "ai_assisted": False,
}
pathlib.Path("/tmp/verify.json").write_text(json.dumps(payload), encoding="utf-8")
PY

curl -s -X POST http://127.0.0.1:8000/api/submissions/verify \
  -H 'Content-Type: application/json' \
  --data-binary @/tmp/verify.json
```

Windows PowerShell: замените `/tmp/...` на `$env:TEMP\...`, а `curl` — на `curl.exe`.

Ключевые поля ответа:

```json
{
  "status": "verified",
  "gate_reached": 3,
  "total_score": 90,
  "badge_tier": "Gold Verified",
  "card_hash": "c43265a13d32",
  "verify_url": "/card/c43265a13d32",
  "evaluation_mode": "fallback",
  "confidence": "low",
  "is_signature_valid": true,
  "defense_status": "pending",
  "defense_token": "…"
}
```

`defense_token` возвращается **только при выдаче защиты** и только один раз. Он нужен для `POST /api/cards/{hash}/defense`; в публичную карточку и манифест он не попадает.

`card_hash` — первые 12 hex-символов SHA-256 от строки `task_id:candidate_name:status:total_score:user_id:sha256(submitted_code)`. Для примера выше (`task-fintech-01`, `candidate_name="Evidence Check"`, `preset_ideal`, seeded-аккаунт `marat@merilo.kz`) он равен `c43265a13d32`. Другое имя кандидата или другой аккаунт дают другой хэш: `"Demo Candidate"` дал бы иное значение.

## 3. `POST /api/submissions/verify` — свой код (`own-code`)

```bash
curl -s -X POST http://127.0.0.1:8000/api/submissions/verify \
  -H 'Content-Type: application/json' \
  -d '{
    "task_id": "own-code",
    "language": "go",
    "candidate_name": "Evidence Check",
    "submitted_code": "package main\n\nfunc Add(a, b int) int {\n\treturn a + b\n}\n"
  }'
```

Правила:

- `task_id` ровно `own-code`; `language` обязателен и должен быть одним из 13 ключей (`python`, `javascript`, `typescript`, `java`, `go`, `csharp`, `cpp`, `c`, `rust`, `ruby`, `php`, `kotlin`, `swift`).
- Для seeded task `language` можно не передавать; если передать чужой язык — **422**.
- `submitted_code` не пустой, валидный UTF-8, не больше 64 KB.

## 4. `GET /api/cards/{hash}` — публичная карточка

```bash
curl -s http://127.0.0.1:8000/api/cards/c43265a13d32
```

Ответ — 27 ключей: `card_hash`, `candidate_name`, `task_id`, `task_title`, `company_name`, `language`, `status`, `gate_reached`, `total_score`, `badge_tier`, `verify_url`, `created_at`, `profile_url`, `evaluation`, `signature`, `is_signature_valid`, `evaluation_mode`, `ai_assisted`, `duration_ms`, `rubric_version`, `model`, `defense_questions`, `defense_answers`, `defense_hash`, `defense_signature`, `defended_at`, `defense_status`.

**Чего в публичном ответе нет:** `submitted_code`, `user_id`, `defense_token` и хэшей токенов. Это белый список `PUBLIC_CARD_FIELDS` в `backend/db.py`, а не фильтрация «на глаз».

## 5. `POST /api/cards/{hash}/defense` — запись защиты

Заголовок `X-Defense-Token` обязателен. Ровно три ответа, каждый 20–1200 символов после `strip()`.

```bash
curl -s -X POST http://127.0.0.1:8000/api/cards/c43265a13d32/defense \
  -H 'Content-Type: application/json' \
  -H 'X-Defense-Token: ВАШ_ОДНОРАЗОВЫЙ_ТОКЕН' \
  -d '{
    "answers": [
      "Сумма проверяется до записи в базу, поэтому отрицательный перевод не проходит.",
      "Транзакция параметризована, SQL-инъекция через идентификатор счёта невозможна.",
      "Пустой счёт и недостаток средств обрабатываются отдельными ветками без исключения."
    ]
  }'
```

Успех — **200**:

```json
{
  "defense_hash": "e653abc71373337d…",
  "defense_signature": "4c76d1bd3986ab25…",
  "answered_count": 3,
  "defended_at": "2026-11-13T00:00:00+00:00"
}
```

Защита записывается один раз. Повторная попытка — **409**; неверный токен — **403**; отсутствие заголовка — **401**.

## 6. `GET /api/cards/{hash}/manifest` — переносимый манифест

```bash
curl -s http://127.0.0.1:8000/api/cards/c43265a13d32/manifest
```

Ответ: `{manifest, ed25519_signature, public_key, valid}`. В манифесте только публичные метаданные и SHA-256-дайджесты; исходного кода, текста задачи, ответов защиты и токенов там нет. Проверка офлайн:

```bash
curl -s http://127.0.0.1:8000/api/cards/c43265a13d32/manifest > manifest.json
python scripts/verify_card.py --file manifest.json
# VALID
```

Для строгого режима закрепите ключ отдельно:

```bash
curl -s http://127.0.0.1:8000/.well-known/merilo.json > merilo.json
python scripts/verify_card.py --file manifest.json --public-key merilo.json
```

## 7. `GET /.well-known/merilo.json` — публичный trust-документ

```bash
curl -s http://127.0.0.1:8000/.well-known/merilo.json
```

```json
{
  "algorithm": "Ed25519",
  "public_key": "6hBBu8x2JhkNXts6…",
  "manifest_version": "merilo-card-v1",
  "supported_languages": ["c", "cpp", "csharp", "go", "java", "javascript", "kotlin", "php", "python", "ruby", "rust", "swift", "typescript"],
  "verify_url": "https://merilo-nfc.fly.dev/api/cards/{hash}/manifest"
}
```

Ключ меняется только при ротации; документ кэшируется на 300 секунд.

## 8. `GET /badge/{hash}.svg` — SVG-бейдж

```bash
curl -s http://127.0.0.1:8000/badge/c43265a13d32.svg -o badge.svg
```

Ответ — `200`, `image/svg+xml`, 320×120. Неизвестный хэш — честный **404**, а не серая заглушка. Бейдж в Markdown:

```markdown
[![Merilo Verified](http://127.0.0.1:8000/badge/c43265a13d32.svg)](http://127.0.0.1:8000/card/c43265a13d32)
```

## 9. Коды ошибок

| Код | Когда | Пример тела |
|:---|:---|:---|
| **400** | пустой код; невалидный UTF-8; неизвестный демо-аккаунт | `{"error":{"code":400,"message":"Код не может быть пустым"}}` |
| **401** | нет `X-Defense-Token`; нет авторизации на защищённом маршруте | `{"error":{"code":401,"message":"Требуется заголовок X-Defense-Token"}}` |
| **403** | токен защиты не совпадает | `{"error":{"code":403,"message":"Неверный токен защиты"}}` |
| **404** | неизвестный `task_id` или `card_hash` | `{"error":{"code":404,"message":"Micro-task not found"}}` |
| **409** | защита уже записана; карточка уже защищена | `{"error":{"code":409,"message":"Защита уже записана для этой карточки"}}` |
| **413** | тело больше 64 KB (код) или 16 KB (защита) | `{"error":{"code":413,"message":"Код превышает лимит 64 KB"}}` |
| **422** | ошибка валидации Pydantic; для `own-code` не указан/неизвестен язык; язык не совпал с задачей | `{"error":{"code":422,"message":"…"}}` |
| **429** | превышен per-IP лимит (verify — 20 запросов / 60 с по умолчанию) | `{"error":{"code":429,"message":"Превышен лимит запросов на верификацию…"}}` |
| **500** | непредвиденное исключение; тело не раскрывает трейс | `{"error":{"code":500,"message":"Internal server error"}}` |

Все ошибки приходят в одном конверте `{"error": {"code", "message"}}`. Ограничения демо: CORS открыт, rate limit хранится в памяти процесса, SQLite — один процесс.

## 10. Что стоит помнить

- Публичная карточка **не содержит исходный код**, но содержит ответы защиты после записи — это осознанный компромисс проверяемости.
- `is_signature_valid` проверяет HMAC-SHA256 сервера; `manifest.valid` и `scripts/verify_card.py` — Ed25519, который можно проверить без доступа к серверу.
- `evaluation_mode=fallback` и `confidence=low` означают, что модель не вызывалась; это честная метка, а не ошибка.
- Балл — структурированное мнение, не измерение уровня инженера. Подробности — `docs/EVIDENCE.md`, раздел «Что мы не утверждаем».
