/**
 * Merilo — final jury deck (NFC 2026, case 5).
 *
 * Generates:
 *   docs/Merilo_NFC_Pitch.pptx  12 slides, 16:9, Russian
 *   docs/presentation.html      same 12 slides, offline, printable
 *
 * Sources of every number: docs/EVIDENCE.md, docs/labor_market.json,
 * docs/PILOT.md, README.md. Run: node scripts/generate_pitch.mjs
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pptxgen = require('./node_modules/pptxgenjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(process.cwd());
const DOCS = path.join(ROOT, 'docs');
const SHOTS = path.join(ROOT, 'screenshots');

const P = {
  paper: 'F3EFE6',
  graphite: '191816',
  panel: 'FAF7F0',
  ink: '191816',
  light: 'FAF7F0',
  accent: 'B33A2B',
  verified: '59624E',
  rule: 'CFC7B8',
  muted: '5E5A52',
  darkRule: '3B3731',
  darkMuted: 'A69E90',
};

const SERIF = 'Cambria';
const SANS = 'Calibri';
const MONO = 'Courier New';
const M = 0.9;            // left/right margin, inches
const W = 13.333;
const CH = 7.5;

const LANGS = [
  { code: 'C', name: 'C', count: 2447 },
  { code: 'PY', name: 'Python', count: 1638 },
  { code: 'JS', name: 'JavaScript', count: 1123 },
  { code: 'C++', name: 'C++', count: 926 },
  { code: 'JV', name: 'Java', count: 686 },
  { code: 'TS', name: 'TypeScript', count: 558 },
  { code: 'GO', name: 'Go', count: 409 },
  { code: 'C#', name: 'C#', count: 395 },
  { code: 'PHP', name: 'PHP', count: 390 },
  { code: 'KT', name: 'Kotlin', count: 176 },
  { code: 'SW', name: 'Swift', count: 78 },
  { code: 'RS', name: 'Rust', count: 52 },
  { code: 'RB', name: 'Ruby', count: 30 },
];

const PRICES = [
  { price: '0 ₸', label: 'диагностический пилот', note: '5 карточек' },
  { price: '3 000 ₸', label: 'за карточку', note: 'одна проверка' },
  { price: '29 000 ₸', label: 'в месяц', note: '12 карточек' },
  { price: '149 000 ₸', label: 'семестр буткемпа', note: 'до 60 карточек' },
];

const NOTES = [
  'Открываю не рассказом о себе, а продуктом: Merilo проверяет код, подписывает оценку и записывает ответы кандидата. Три элемента — микро-кейс, три шлюза и карточка. Дальше — почему это нужно, как работает и что именно измерено. Сразу оговорюсь: пилотов и клиентов нет, и в деке нет ни одной выдуманной цифры.',
  'У кандидата три документа: резюме, GitHub и сертификат. Они отвечают на разные вопросы и не сравниваются между собой. Ни один не показывает, что человек сделал сам и как он думает. Компания платит за это временем тимлида, а не деньгами. Замеров боли у нас нет: пять интервью только запланированы, и я не буду выдавать гипотезу за факт. Главный вопрос слайда: какой из трёх сигналов можно проверить, не веря на слово?',
  'Генеративные модели удешевили производство правдоподобного кода. Читать портфолио стало дороже, чем писать его. При этом Merilo не детектирует AI-авторство: поле ai_assisted — декларация кандидата. Мы фиксируем прогон и его неизменность, а не происхождение кода. Это граница, которую я не прячу: если жюри спросит про детектор AI, ответ — его нет и он не заявляется.',
  'Решение — один короткий прогон. Кандидат выбирает рабочий кейс, проходит три шлюза, отвечает на три вопроса защиты и получает карточку. Карточка — не резюме: это артефакт с баллом, разбором по трём критериям, хэшем и подписью. Его можно приложить к отклику, а работодатель может проверить его без нашего сервера. Ключевая мысль: мы продаём не оценку человека, а проверяемую запись о конкретной работе.',
  'Демо занимает четыре действия: выбрать FinTech-кейс, взять эталонный пресет, запустить проверку и открыть карточку. На экране видны три шлюза и результат. Если Wi-Fi упадёт, есть офлайн-страница с теми же вердиктами. Пресеты дают 90, 52 и 0 с блокировкой на втором шлюзе — это наблюдение на текущей сборке, не гарантия для другого кода. Со сцены называйте тир и статус, а не обещание балла.',
  'Тринадцать языков проходят tree-sitter и защитный шлюз. Семантическая рубрика откалибрована сначала на Python и JavaScript; для остальных качество оценки не измерено, и production-grade мы не заявляем. Отдельно есть режим «свой код»: можно отправить собственное решение без условия задачи, язык выбирается вручную. Это важно для кандидатов, у которых нет доступа к нашим кейсам, но есть свой код.',
  'Три шлюза стоят по возрастанию стоимости. tree-sitter работает локально и отсекает синтаксис до сети. Regex-щит ловит известные формулировки инъекций — это не семантика, перефразированная атака может пройти. Модель ограничена схемой и temperature 0.0. Если ключа или сети нет, включается детерминированный fallback. Карточка получает SHA-256, HMAC и Ed25519-манифест. Ни один из этих шагов не является вторым ИИ.',
  'Это единственный слайд, где я прошу верить не словам, а командам. 397 тестов, покрытие 85,30 процента, fallback p50 15,66 миллисекунды, verify p50 82,97, живой health 200. CI-конфиг лежит в репозитории: matrix 3.11 и 3.12, ruff и порог покрытия 80. Живой вызов Gemini не измерялся — все задержки получены без ключа, и я не переношу их на прод.',
  'Что карточка действительно подтверждает: прогон, балл, неизменность записи и наличие защиты. Чего не подтверждает: авторство, личность, уровень инженера и полноту regex-щита. Манифест проверяется офлайн: реальный даёт VALID, изменённый — INVALID и exit 1. Защита на API отвечает 401, 403, 200 и 409. Слайд существует, чтобы жюри не приписывало карточке больше, чем она доказывает.',
  'Рынок я показываю снимком, а не прогнозом. 1 638 вакансий по запросу «Python разработчик» на hh.kz — это спрос на язык, не наш рынок. Цены 3 000, 29 000 и 149 000 тенге — гипотеза оффера; ни один покупатель её не подтверждал. Юнит-экономика даёт около 3,5 тенге переменных издержек и 80 процентов маржи до налогов, но это расчёт по допущениям. Запрос «C» шумный и оставлен как есть.',
  'Следующие 90 дней — валидация. Пять интервью, один бесплатный пилот, baseline времени тимлида. Потом три компании по 29 000 и калибровка рубрики на 20 решениях. В конце — буткемп и решение go или no-go. Если меньше трёх интервью из пяти подтвердят боль, мы не продаём, а перепозиционируем продукт в учебный инструмент. Пилота пока нет — это план, а не отчёт.',
  'Прошу не деньги, а доступ к реальному процессу: 3–5 компаний на диагностический пилот и 5 интервью. Демо открыто без регистрации. Всё, что я показал, лежит в репозитории с командами проверки. Спасибо — готов к вопросам.',
];

// ---------------------------------------------------------------------------
// PPTX helpers
// ---------------------------------------------------------------------------

const pptx = new pptxgen();
pptx.layout = 'LAYOUT_WIDE';
pptx.author = 'Merilo Found';
pptx.company = 'Merilo Found';
pptx.subject = 'Merilo — финальная защита NFC 2026, кейс 5';
pptx.title = 'Merilo — код проверен, оценка подписана';
pptx.lang = 'ru-RU';
pptx.theme = { headFontFace: SERIF, bodyFontFace: SANS, lang: 'ru-RU' };

function slide(dark = false) {
  const s = pptx.addSlide();
  s.background = { color: dark ? P.graphite : P.paper };
  return s;
}

function text(s, str, o) {
  s.addText(str, Object.assign({
    x: M, y: 1, w: 5, h: 0.3,
    fontFace: SANS, fontSize: 14, color: P.ink,
    margin: 0, align: 'left', valign: 'top',
    lineSpacingMultiple: 1.08,
  }, o));
}

function hair(s, x, y, w, color = P.rule, width = 0.75) {
  s.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width } });
}

function vhair(s, x, y, h, color = P.rule, width = 0.75) {
  s.addShape(pptx.ShapeType.line, { x, y, w: 0, h, line: { color, width } });
}

function box(s, x, y, w, h, o = {}) {
  s.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: o.fill || P.paper },
    line: o.line === null ? { color: P.paper, width: 0 } : { color: o.line || P.rule, width: o.lw || 0.75, dashType: o.dash || 'solid' },
  });
}

function head(s, eyebrow, title, dark = false) {
  text(s, eyebrow, {
    x: M, y: 0.4, w: 11.4, h: 0.22,
    fontFace: MONO, fontSize: 9.5, charSpacing: 1.6,
    color: dark ? P.darkMuted : P.muted,
  });
  text(s, title, {
    x: M, y: 0.68, w: 11.6, h: 0.72,
    fontFace: SERIF, fontSize: 36, bold: true,
    color: dark ? P.light : P.ink,
    lineSpacingMultiple: 0.94,
  });
}

function lead(s, str, dark = false) {
  text(s, str, {
    x: M, y: 1.5, w: 9.4, h: 0.78,
    fontSize: 15.5, color: dark ? P.darkMuted : P.muted,
    lineSpacingMultiple: 1.2,
  });
}

function foot(s, str, n, dark = false) {
  text(s, str, {
    x: M, y: 6.93, w: 11.0, h: 0.4,
    fontFace: MONO, fontSize: 9, color: dark ? P.darkMuted : P.muted,
    lineSpacingMultiple: 1.1,
  });
  text(s, `${String(n).padStart(2, '0')} / 12`, {
    x: 11.95, y: 7.02, w: 0.95, h: 0.2,
    fontFace: MONO, fontSize: 8.5, color: dark ? P.darkMuted : P.muted,
    align: 'right',
  });
}

function ruler(s, x, y, w, n, dark = false, accentIndex = -1) {
  const color = dark ? P.darkRule : P.rule;
  hair(s, x, y, w, color, dark ? 1 : 0.75);
  const step = w / (n - 1);
  for (let i = 0; i < n; i++) {
    const tall = i % 4 === 0 || i === accentIndex;
    const h = tall ? 0.2 : 0.11;
    const c = i === accentIndex ? P.accent : color;
    vhair(s, x + i * step, y - h, h, c, i === accentIndex ? 2 : 0.75);
  }
}

// ---------------------------------------------------------------------------
// 1 — Title
// ---------------------------------------------------------------------------

{
  const s = slide(true);
  text(s, 'MERILO · NATIONAL FOUNDER CUP 2026 · КЕЙС 5', {
    x: M, y: 0.55, w: 11.2, h: 0.24, fontFace: MONO, fontSize: 9.5,
    charSpacing: 1.8, color: P.darkMuted,
  });
  text(s, 'Код проверен.\nОценка подписана.\nОтветы записаны.', {
    x: M, y: 1.18, w: 10.6, h: 2.5, fontFace: SERIF, fontSize: 44, bold: true,
    color: P.light, lineSpacingMultiple: 0.92,
  });
  text(s, 'Merilo — микро-кейс, три шлюза и публичная карточка инженерной проверки.\nНе рейтинг разработчика, а измерение конкретной работы.', {
    x: M, y: 3.98, w: 8.2, h: 0.95, fontSize: 16, color: P.rule,
    lineSpacingMultiple: 1.25,
  });

  hair(s, M, 5.42, 11.55, P.darkRule, 1);
  text(s, 'MERILO FOUND · ШЫМКЕНТ', {
    x: M, y: 5.6, w: 4.4, h: 0.2, fontFace: MONO, fontSize: 9.5,
    charSpacing: 1.4, color: P.darkMuted,
  });
  text(s, '14 НОЯБРЯ 2026 · NIS КАРАТАУ', {
    x: M, y: 5.86, w: 5.2, h: 0.22, fontFace: MONO, fontSize: 9.5,
    color: P.rule,
  });
  text(s, 'merilo-nfc.fly.dev', {
    x: 8.7, y: 5.6, w: 3.75, h: 0.25, fontFace: MONO, fontSize: 11,
    color: P.light, align: 'right',
  });
  text(s, 'демо без регистрации', {
    x: 8.7, y: 5.88, w: 3.75, h: 0.22, fontFace: MONO, fontSize: 9,
    color: P.darkMuted, align: 'right',
  });

  ruler(s, M, 6.62, 11.55, 13, true, 1);
  foot(s, 'Тезис — docs/PITCH.md; продукт — README.md. Статус на 2026-11-13: пилотов, клиентов и выручки нет. Числа — со сносками.', 1, true);
}

// ---------------------------------------------------------------------------
// 2 — Problem: three incomparable signals
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '01 · ПРОБЛЕМА', 'Три сигнала, которые нельзя сравнить');
  lead(s, 'Кандидат прикладывает резюме, GitHub и сертификат. Компания получает три документа с разными правилами и ни одного ответа на главный вопрос.');

  const cols = [
    { x: M, w: 2.05, label: 'СИГНАЛ' },
    { x: 3.05, w: 3.15, label: 'ЧТО ПОКАЗЫВАЕТ' },
    { x: 6.35, w: 3.25, label: 'ЧЕГО НЕ ПОКАЗЫВАЕТ' },
    { x: 9.85, w: 2.65, label: 'ЦЕНА ПРОВЕРКИ' },
  ];
  const rows = [
    ['Резюме', 'Роли, стек, годы опыта', 'Что человек написал сам', 'Минуты чтения, без замера'],
    ['GitHub', 'Публичные репозитории и коммиты', 'Доля собственного кода', 'Чтение диффов тимлидом'],
    ['Сертификат', 'Пройденную программу курса', 'Работу под ограничениями', 'Доверие к платформе'],
  ];

  hair(s, M, 2.52, 11.55, P.ink, 1);
  cols.forEach((c) => text(s, c.label, {
    x: c.x, y: 2.64, w: c.w, h: 0.22, fontFace: MONO, fontSize: 9.5,
    charSpacing: 1.2, color: P.muted,
  }));

  rows.forEach((r, i) => {
    const y = 3.02 + i * 0.92;
    hair(s, M, y, 11.55, P.rule, 0.75);
    text(s, r[0], {
      x: M, y: y + 0.16, w: 2.0, h: 0.34, fontFace: SERIF, fontSize: 18,
      bold: true, color: P.ink,
    });
    text(s, r[1], { x: 3.05, y: y + 0.15, w: 3.05, h: 0.6, fontSize: 14, color: P.ink });
    text(s, r[2], { x: 6.35, y: y + 0.15, w: 3.2, h: 0.6, fontSize: 14, color: P.ink });
    text(s, r[3], { x: 9.85, y: y + 0.15, w: 2.6, h: 0.6, fontSize: 14, color: P.muted });
  });
  hair(s, M, 5.78, 11.55, P.ink, 1);

  text(s, 'ВЫВОД', {
    x: M, y: 5.98, w: 1.2, h: 0.2, fontFace: MONO, fontSize: 9.5,
    charSpacing: 1.4, color: P.accent,
  });
  text(s, 'Проверка стоит времени тимлида, у которого нет отдельной функции оценки. Ни один из трёх сигналов не подписан и не воспроизводим.', {
    x: 2.05, y: 5.9, w: 10.35, h: 0.66, fontFace: SERIF, fontSize: 17,
    color: P.ink, lineSpacingMultiple: 1.12,
  });

  foot(s, 'Источник: docs/PROBLEM.md §2. Количественных замеров боли нет: 5 интервью только запланированы — docs/INTERVIEWS.md, 2026-11-13.', 2);
  s.addNotes(NOTES[1]);
}

// ---------------------------------------------------------------------------
// 3 — Why now
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '02 · ПОЧЕМУ СЕЙЧАС', 'Генерация удешевила код, а не проверку');
  lead(s, 'Правдоподобное решение теперь стоит минуты. Отличить его от собственной работы по документу нельзя, а ручное чтение не масштабируется.');

  const rows = [
    ['01', 'АВТОРСТВО', 'Код больше не доказывает, что его написал кандидат.'],
    ['02', 'ДОВЕРИЕ', 'Резюме и портфолио описывают результат, а не процесс.'],
    ['03', 'ВРЕМЯ', 'Тимлид читает код вместо того, чтобы принимать решение.'],
  ];
  rows.forEach((r, i) => {
    const y = 2.48 + i * 1.28;
    hair(s, M, y, 7.35, P.rule, 0.75);
    text(s, r[0], {
      x: M, y: y + 0.16, w: 0.6, h: 0.2, fontFace: MONO, fontSize: 9.5,
      color: P.accent,
    });
    text(s, r[1], {
      x: 1.55, y: y + 0.12, w: 2.2, h: 0.22, fontFace: MONO, fontSize: 9.5,
      charSpacing: 1.2, color: P.muted,
    });
    text(s, r[2], {
      x: 1.55, y: y + 0.4, w: 6.45, h: 0.66, fontFace: SERIF, fontSize: 21,
      color: P.ink, lineSpacingMultiple: 1.08,
    });
  });
  hair(s, M, 6.32, 7.35, P.ink, 1);

  box(s, 8.75, 2.42, 3.7, 3.16, { fill: P.panel, line: P.rule });
  text(s, 'ЧЕСТНАЯ ГРАНИЦА', {
    x: 9.05, y: 2.64, w: 3.1, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.2, color: P.muted,
  });
  text(s, 'Merilo не детектирует AI-авторство.', {
    x: 9.05, y: 2.96, w: 3.1, h: 0.72, fontFace: SERIF, fontSize: 17,
    bold: true, color: P.ink, lineSpacingMultiple: 1.1,
  });
  text(s, 'Поле ai_assisted — декларация кандидата. Карточка фиксирует прогон, вердикт и подпись, а не происхождение кода.', {
    x: 9.05, y: 3.78, w: 3.1, h: 1.5, fontSize: 13.5, color: P.muted,
    lineSpacingMultiple: 1.25,
  });

  text(s, 'Что можно проверить: сам прогон, условия и неизменность записи.', {
    x: 8.75, y: 5.82, w: 3.7, h: 0.5, fontSize: 13, color: P.verified,
    lineSpacingMultiple: 1.2,
  });

  foot(s, 'Источник: docs/PROBLEM.md §2; docs/EVIDENCE.md §5 (2026-11-13). AI-детекция не заявляется: ai_assisted — декларация, не вывод системы.', 3);
  s.addNotes(NOTES[2]);
}

// ---------------------------------------------------------------------------
// 4 — Solution: four steps
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '03 · РЕШЕНИЕ', 'Микро-кейс, три шлюза, подписанная карточка');
  lead(s, 'Один короткий прогон вместо чтения портфолио: кандидат решает рабочую задачу, система фиксирует, что получилось.');

  const steps = [
    ['01', 'Микро-кейс', 'FinTech, Logistics или EdTech. Одна рабочая задача, один экран.'],
    ['02', 'Три шлюза', 'tree-sitter, regex-щит, рубрика 30/40/30. Каждый дешевле следующего.'],
    ['03', 'Защита', 'Три вопроса и одноразовый токен. Ответы входят в карточку.'],
    ['04', 'Подписанная карточка', 'Балл, разбор, SHA-256, HMAC и переносимый Ed25519-манифест.'],
  ];
  const bw = 2.64;
  const gap = 0.32;
  steps.forEach((st, i) => {
    const x = M + i * (bw + gap);
    box(s, x, 2.5, bw, 2.86, { fill: P.panel, line: P.rule });
    text(s, st[0], {
      x: x + 0.22, y: 2.68, w: 0.5, h: 0.2, fontFace: MONO, fontSize: 9.5,
      color: P.accent,
    });
    text(s, st[1], {
      x: x + 0.22, y: 2.96, w: bw - 0.44, h: 0.62, fontFace: SERIF, fontSize: 17,
      bold: true, color: P.ink, lineSpacingMultiple: 1.02,
    });
    text(s, st[2], {
      x: x + 0.22, y: 3.62, w: bw - 0.44, h: 1.2, fontSize: 13, color: P.muted,
      lineSpacingMultiple: 1.22,
    });
    hair(s, x + 0.22, 5.06, bw - 0.44, P.rule, 0.75);
    text(s, ['ВХОД', 'РАЗБОР', 'ЗАПИСЬ', 'АРТЕФАКТ'][i], {
      x: x + 0.22, y: 5.14, w: bw - 0.44, h: 0.18, fontFace: MONO, fontSize: 8,
      charSpacing: 1, color: P.muted,
    });
    if (i < 3) {
      text(s, '→', {
        x: x + bw + 0.045, y: 3.75, w: 0.24, h: 0.3, fontFace: SERIF, fontSize: 15,
        color: P.accent, align: 'center',
      });
    }
  });

  hair(s, M, 5.85, 11.55, P.ink, 1);
  text(s, 'ИТОГ', {
    x: M, y: 6.04, w: 1.2, h: 0.2, fontFace: MONO, fontSize: 9.5,
    charSpacing: 1.4, color: P.muted,
  });
  text(s, 'Артефакт, который прикладывают к отклику и проверяют без Merilo.', {
    x: 2.05, y: 5.98, w: 10.3, h: 0.35, fontFace: SERIF, fontSize: 17, color: P.ink,
  });

  foot(s, 'Код: backend/verifier.py (Gate 1–3, card_hash), backend/signing.py (Ed25519-манифест). README.md, «Что делает Merilo» (2026-11-13).', 4);
  s.addNotes(NOTES[3]);
}

// ---------------------------------------------------------------------------
// 5 — Demo path with screenshot
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '04 · ДЕМО', 'Один прогон — четыре экрана');
  lead(s, 'Путь на сцене: кейс, пресет, проверка, карточка. Если сеть упала — docs/offline-demo.html показывает те же вердикты.', false);

  const shotH = 5.35 * 756 / 1024;
  box(s, M, 2.3, 5.35, shotH, { fill: P.paper, line: P.rule, lw: 0.75 });
  s.addImage({ path: path.join(SHOTS, 'deck-workbench.png'), x: M, y: 2.3, w: 5.35, h: shotH });

  const steps = [
    ['01', 'Выбрать кейс', 'FinTech — Kaspi-style Transfer API'],
    ['02', 'Взять пресет', '«Эталон (Clean & Secure)»'],
    ['03', 'Запустить', 'Три шлюза загораются по очереди'],
    ['04', 'Открыть карточку', '/card/{hash}: балл, тир, подпись'],
  ];
  steps.forEach((st, i) => {
    const y = 2.3 + i * 0.8;
    text(s, st[0], {
      x: 6.6, y: y + 0.02, w: 0.45, h: 0.2, fontFace: MONO, fontSize: 9.5,
      color: P.accent,
    });
    text(s, st[1], {
      x: 7.12, y: y, w: 5.25, h: 0.26, fontFace: SERIF, fontSize: 16.5,
      bold: true, color: P.ink,
    });
    text(s, st[2], {
      x: 7.12, y: y + 0.28, w: 5.25, h: 0.26, fontSize: 13, color: P.muted,
    });
    if (i < 3) hair(s, 6.6, y + 0.72, 5.78, P.rule, 0.75);
  });

  hair(s, 6.6, 5.62, 5.78, P.ink, 1);
  text(s, 'Пресеты FinTech', {
    x: 6.6, y: 5.78, w: 2.4, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.2, color: P.muted,
  });
  text(s, '90 Gold  ·  52 Needs Work  ·  0 blocked', {
    x: 6.6, y: 6.02, w: 5.8, h: 0.32, fontFace: SERIF, fontSize: 18, color: P.ink,
  });
  text(s, 'Инъекция останавливается на Gate 2, до вызова модели.', {
    x: 6.6, y: 6.34, w: 5.7, h: 0.28, fontSize: 12.5, color: P.muted,
  });

  foot(s, 'Прогон 2026-11-13 без ключа: ideal 90 / vulnerable 52 / injection blocked на Gate 2. README.md, «Тесты и метрики»; docs/DEMO.md.', 5);
  s.addNotes(NOTES[4]);
}

// ---------------------------------------------------------------------------
// 6 — Languages and own code
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '05 · ЯЗЫКИ И СВОЙ КОД', '13 языков разбираются. Два откалиброваны');
  lead(s, 'tree-sitter проверяет синтаксис на всех тринадцати. Семантическая рубрика откалибрована сначала на Python и JavaScript — для остальных качество оценки не измерено.');

  const stats = [
    ['13', 'языков в SUPPORTED_LANGUAGES'],
    ['2', 'рубрика откалибрована первой'],
    ['1', 'режим «свой код» без задачи'],
  ];
  stats.forEach((st, i) => {
    const x = M + i * 3.9;
    if (i > 0) vhair(s, x - 0.28, 2.42, 0.95, P.rule, 0.75);
    text(s, st[0], {
      x, y: 2.36, w: 1.4, h: 0.6, fontFace: SERIF, fontSize: 34, bold: true, color: P.ink,
    });
    text(s, st[1], {
      x: x + 1.02, y: 2.5, w: 2.55, h: 0.7, fontSize: 12.5, color: P.muted,
      lineSpacingMultiple: 1.15,
    });
  });

  // language ruler
  const rx = M;
  const rw = 11.55;
  const baseY = 4.62;
  hair(s, rx, baseY, rw, P.rule, 1);
  const step = rw / (LANGS.length - 1);
  const calibrated = new Set(['PY', 'JS']);
  LANGS.forEach((l, i) => {
    const x = rx + i * step;
    const on = calibrated.has(l.code);
    vhair(s, x, baseY - (on ? 0.34 : 0.2), on ? 0.34 : 0.2, on ? P.verified : P.rule, on ? 2 : 1);
    if (on) {
      s.addShape(pptx.ShapeType.rect, {
        x: x - 0.06, y: baseY - 0.45, w: 0.12, h: 0.12,
        fill: { color: P.verified }, line: { color: P.verified, width: 0 },
      });
    }
    text(s, l.code, {
      x: x - 0.3, y: baseY + 0.08, w: 0.6, h: 0.22, fontFace: MONO, fontSize: 10,
      color: on ? P.verified : P.muted, align: 'center',
    });
  });

  text(s, '13 РАЗБОРОВ · TREE-SITTER', {
    x: M, y: 3.84, w: 6.0, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.2, color: P.muted,
  });
  s.addShape(pptx.ShapeType.rect, {
    x: 9.62, y: 3.88, w: 0.11, h: 0.11,
    fill: { color: P.verified }, line: { color: P.verified, width: 0 },
  });
  text(s, 'РУБРИКА ОТКАЛИБРОВАНА', {
    x: 9.82, y: 3.84, w: 2.6, h: 0.2, fontFace: MONO, fontSize: 8.5,
    charSpacing: 0.8, color: P.verified,
  });

  hair(s, M, 5.55, 11.55, P.rule, 0.75);
  text(s, '«Свой код» — свободная отправка без условия задачи: язык выбирается вручную, задача помечается own-code.', {
    x: M, y: 5.72, w: 7.5, h: 0.6, fontSize: 14, color: P.ink, lineSpacingMultiple: 1.2,
  });
  text(s, 'Разбор есть везде.\nКачество оценки измерено не везде.', {
    x: 8.65, y: 5.66, w: 3.8, h: 0.72, fontFace: SERIF, fontSize: 14,
    color: P.muted, align: 'right', lineSpacingMultiple: 1.15,
  });

  foot(s, 'Источник: backend/languages.py:167; состав закреплён tests/test_languages.py и tests/test_static_contract.py (2026-11-13).', 6);
  s.addNotes(NOTES[5]);
}

// ---------------------------------------------------------------------------
// 7 — Architecture
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '06 · КАК УСТРОЕНО', 'Три шлюза по возрастанию стоимости');
  lead(s, 'Два дешёвых шлюза до модели. При её отказе — детерминированный fallback.');

  const gx = M;
  const gw = 3.45;
  const gates = [
    ['GATE 1 · TREE-SITTER', 'Разбор локально, до сети. Синтаксис не прошёл — дальше не идём.'],
    ['GATE 2 · REGEX-ЩИТ', 'Известные формулировки инъекций. Это фильтр паттернов, не семантика.'],
    ['GATE 3 · РУБРИКА 30/40/30', 'temp 0.0 · строгая JSON-схема · 85 Gold, 70 Silver.'],
  ];
  gates.forEach((g, i) => {
    const y = 2.04 + i * 1.26;
    box(s, gx, y, gw, 1.0, { fill: P.panel, line: P.rule });
    text(s, g[0], {
      x: gx + 0.2, y: y + 0.12, w: gw - 0.4, h: 0.2, fontFace: MONO, fontSize: 9,
      charSpacing: 1, color: P.ink,
    });
    text(s, g[1], {
      x: gx + 0.2, y: y + 0.38, w: gw - 0.4, h: 0.5, fontSize: 12, color: P.muted,
      lineSpacingMultiple: 1.12,
    });
    if (i < 2) {
      text(s, '↓', {
        x: gx + gw / 2 - 0.15, y: y + 1.0, w: 0.3, h: 0.24, fontFace: SERIF,
        fontSize: 12, color: P.muted, align: 'center',
      });
    }
  });

  // fallback branch
  const fx = gx + gw + 0.55;
  box(s, fx, 4.56, 3.4, 1.0, { fill: P.panel, line: P.muted, dash: 'dash' });
  text(s, 'FALLBACK · БЕЗ СЕТИ', {
    x: fx + 0.2, y: 4.68, w: 3.0, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1, color: P.ink,
  });
  text(s, 'Нет ключа, таймаут, 404/429 — структурная эвристика без сети.', {
    x: fx + 0.2, y: 4.94, w: 3.0, h: 0.5, fontSize: 12, color: P.muted,
    lineSpacingMultiple: 1.12,
  });
  hair(s, gx + gw, 5.06, 0.55, P.muted, 0.75);
  text(s, '→', {
    x: gx + gw + 0.14, y: 4.93, w: 0.3, h: 0.22, fontFace: SERIF, fontSize: 11,
    color: P.muted, align: 'center',
  });
  vhair(s, fx + 1.7, 5.56, 0.38, P.muted, 0.75);

  // card output
  box(s, M, 5.94, 7.0, 0.72, { fill: P.ink, line: P.ink });
  text(s, 'CARD', {
    x: M + 0.22, y: 6.05, w: 0.6, h: 0.2, fontFace: MONO, fontSize: 9,
    color: P.paper, charSpacing: 1,
  });
  text(s, 'SHA-256 (12 hex)  →  HMAC-SHA256  →  Ed25519-манифест', {
    x: 2.05, y: 6.02, w: 5.7, h: 0.3, fontFace: MONO, fontSize: 12.5, color: P.paper,
  });
  text(s, '↓', {
    x: gx + gw / 2 - 0.15, y: 5.56, w: 0.3, h: 0.3, fontFace: SERIF, fontSize: 12,
    color: P.muted, align: 'center',
  });

  // right column
  text(s, 'Почему не один вызов модели', {
    x: 8.85, y: 2.04, w: 3.6, h: 0.5, fontFace: SERIF, fontSize: 17, bold: true,
    color: P.ink, lineSpacingMultiple: 1.05,
  });
  const notes = [
    'tree-sitter отсекает синтаксис до сетевых вызовов',
    'щит отсекает известные атаки до оплаты токенов',
    'рубрика возвращает структуру, а не абзац текста',
    'fallback даёт тот же балл на тот же вход',
    'Ed25519 проверяется офлайн, без доверия серверу',
  ];
  notes.forEach((n, i) => {
    const y = 2.66 + i * 0.78;
    hair(s, 8.85, y, 3.6, P.rule, 0.75);
    text(s, '—', {
      x: 8.85, y: y + 0.12, w: 0.2, h: 0.2, fontSize: 11, color: P.accent,
    });
    text(s, n, {
      x: 9.15, y: y + 0.1, w: 3.3, h: 0.62, fontSize: 12.5, color: P.ink,
      lineSpacingMultiple: 1.16,
    });
  });

  foot(s, 'Код: backend/verifier.py, backend/fallback_cache.py, backend/signing.py; манифест — scripts/verify_card.py.', 7);
  s.addNotes(NOTES[6]);
}

// ---------------------------------------------------------------------------
// 8 — Evidence grid
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '07 · ДОКАЗАТЕЛЬСТВА', 'Что измерено, а не обещано');
  lead(s, 'Все числа ниже воспроизводятся командами из репозитория. Живой вызов модели в этой сессии не измерялся.');

  const stats = [
    ['397', 'тестов в наборе · 2 warnings', 'PYTEST'],
    ['85,30 %', 'покрытие backend · 2240 из 2626', 'PYTEST --COV'],
    ['15,66 мс', 'p50 fallback, in-process · p95 16,87', 'SCRIPTS/BENCH.PY'],
    ['82,97 мс', 'p50 POST verify, fallback · p95 89,23', 'SCRIPTS/BENCH.PY'],
    ['200', 'GET /api/health · version 1.2.0', 'MERILO-NFC.FLY.DEV'],
    ['27', 'публичных ключей карточки', 'GET /API/CARDS'],
  ];
  const cw = 3.69;
  const ch = 1.42;
  stats.forEach((st, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (cw + 0.235);
    const y = 2.3 + row * (ch + 0.2);
    hair(s, x, y, cw, P.ink, 1);
    text(s, st[0], {
      x, y: y + 0.14, w: cw, h: 0.55, fontFace: SERIF, fontSize: 30, bold: true,
      color: i === 4 ? P.verified : P.ink,
    });
    text(s, st[1], {
      x, y: y + 0.74, w: cw - 0.1, h: 0.3, fontSize: 12, color: P.muted,
    });
    text(s, st[2], {
      x, y: y + 1.12, w: cw, h: 0.2, fontFace: MONO, fontSize: 8,
      charSpacing: 0.8, color: P.muted,
    });
  });

  box(s, M, 5.82, 11.55, 0.82, { fill: P.panel, line: P.rule });
  text(s, 'CI', {
    x: M + 0.22, y: 5.96, w: 0.4, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.2, color: P.accent,
  });
  text(s, 'GitHub Actions · Python 3.11 / 3.12 · ruff · pytest --cov-fail-under=80', {
    x: 1.6, y: 5.92, w: 10.7, h: 0.26, fontSize: 13, color: P.ink,
  });
  text(s, 'Конфиг — .github/workflows/ci.yml, тот же прогон пройден локально · живая задержка Gemini — UNKNOWN.', {
    x: 1.6, y: 6.24, w: 10.7, h: 0.24, fontSize: 11.5, color: P.muted,
  });

  foot(s, 'Замеры 2026-11-13: Windows, Python 3.14.6, без ключа, n=20, временная SQLite. Команды: pytest --cov=backend; scripts/bench.py --mode all.', 8);
  s.addNotes(NOTES[7]);
}

// ---------------------------------------------------------------------------
// 9 — Trust and limits
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '08 · ГРАНИЦЫ ДОВЕРИЯ', 'Подпись подтверждает запись, не человека');
  lead(s, 'Карточка доказывает, что этот код прошёл этот конвейер и запись не менялась. Она не доказывает авторство и уровень инженера.');

  text(s, 'ПОДТВЕРЖДАЕТ', {
    x: M, y: 2.4, w: 3.0, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.4, color: P.verified,
  });
  const yes = [
    'Прогон: задача, язык, вердикт, балл',
    'Неизменность: SHA-256 и HMAC-подпись',
    'Защиту: три ответа и одноразовый токен',
    'Переносимость: Ed25519, SVG-бейдж, QR',
  ];
  yes.forEach((t, i) => {
    const y = 2.68 + i * 0.4;
    text(s, '✓', { x: M, y: y - 0.01, w: 0.22, h: 0.22, fontSize: 11, color: P.verified });
    text(s, t, { x: M + 0.28, y, w: 6.35, h: 0.24, fontSize: 13, color: P.ink });
  });

  text(s, 'НЕ ПОДТВЕРЖДАЕТ', {
    x: M, y: 4.46, w: 3.0, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.4, color: P.accent,
  });
  const no = [
    'Авторство кода и личность кандидата',
    'Уровень инженера: рубрика не сверена с тимлидами',
    'Полноту regex-щита: перефразированная атака пройдёт',
    'Античит и прокторинг: их нет',
  ];
  no.forEach((t, i) => {
    const y = 4.74 + i * 0.4;
    text(s, '—', { x: M, y: y - 0.02, w: 0.22, h: 0.22, fontSize: 10, color: P.accent });
    text(s, t, { x: M + 0.28, y, w: 6.4, h: 0.24, fontSize: 13, color: P.ink });
  });

  const sealH = 4.3 * 260 / 318;
  box(s, 8.2, 2.2, 4.3, sealH, { fill: P.paper, line: P.rule, lw: 0.75 });
  s.addImage({ path: path.join(SHOTS, 'deck-card-seal.png'), x: 8.2, y: 2.2, w: 4.3, h: sealH });
  text(s, 'ФРАГМЕНТ РЕАЛЬНОЙ КАРТОЧКИ · 90 / GOLD VERIFIED', {
    x: 8.2, y: 5.8, w: 4.3, h: 0.2, fontFace: MONO, fontSize: 8, charSpacing: 0.6,
    color: P.muted,
  });
  text(s, 'manifest: VALID → изменённый score → INVALID (exit 1)', {
    x: 8.2, y: 6.06, w: 4.3, h: 0.44, fontFace: MONO, fontSize: 9, color: P.ink,
    lineSpacingMultiple: 1.15,
  });
  text(s, 'defense API: 401 / 403 / 200 / 409', {
    x: 8.2, y: 6.54, w: 4.3, h: 0.22, fontFace: MONO, fontSize: 9, color: P.muted,
  });

  foot(s, 'Проверено 2026-11-13: scripts/verify_card.py (VALID / INVALID), defense 401/403/200/409, 27 публичных ключей. docs/EVIDENCE.md §1.', 9);
  s.addNotes(NOTES[8]);
}

// ---------------------------------------------------------------------------
// 10 — Market and price
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '09 · РЫНОК И ЦЕНА', 'Спрос, цена и экономика проверки');
  lead(s, '1 638 вакансий по запросу «Python разработчик» на hh.kz — спрос на язык, а не размер рынка Merilo.');

  text(s, 'HH.KZ · «ЯЗЫК РАЗРАБОТЧИК» · 2026-11-13', {
    x: M, y: 2.32, w: 6.9, h: 0.2, fontFace: MONO, fontSize: 8.5,
    charSpacing: 0.8, color: P.muted,
  });
  text(s, 'ВАКАНСИЙ', {
    x: 6.2, y: 2.32, w: 1.5, h: 0.2, fontFace: MONO, fontSize: 8.5,
    charSpacing: 0.8, color: P.muted, align: 'right',
  });
  hair(s, M, 2.58, 7.1, P.ink, 1);

  const max = LANGS[0].count;
  LANGS.forEach((l, i) => {
    const y = 2.7 + i * 0.255;
    const bw = 3.95 * (l.count / max);
    text(s, l.code, {
      x: M, y: y - 0.005, w: 0.85, h: 0.2, fontFace: MONO, fontSize: 8.5,
      color: l.name === 'Python' ? P.accent : P.muted,
    });
    s.addShape(pptx.ShapeType.rect, {
      x: 1.72, y: y + 0.03, w: Math.max(bw, 0.02), h: 0.12,
      fill: { color: l.name === 'Python' ? P.accent : P.ink },
      line: { color: l.name === 'Python' ? P.accent : P.ink, width: 0 },
    });
    text(s, l.count.toLocaleString('ru-RU').replace(/\u00a0/g, ' '), {
      x: 6.15, y: y - 0.005, w: 1.55, h: 0.2, fontFace: MONO, fontSize: 8.5,
      color: l.name === 'Python' ? P.accent : P.ink, align: 'right',
    });
  });

  // prices
  text(s, 'ОФФЕР · ГИПОТЕЗА, НЕ ПРОВЕРЕНО', {
    x: 8.55, y: 2.32, w: 3.9, h: 0.2, fontFace: MONO, fontSize: 8.5,
    charSpacing: 0.8, color: P.muted,
  });
  PRICES.forEach((p, i) => {
    const y = 2.64 + i * 0.56;
    hair(s, 8.55, y, 3.9, P.rule, 0.75);
    text(s, p.price, {
      x: 8.55, y: y + 0.1, w: 1.75, h: 0.3, fontFace: SERIF, fontSize: 17,
      bold: true, color: P.ink,
    });
    text(s, p.label, {
      x: 10.3, y: y + 0.1, w: 2.15, h: 0.2, fontSize: 11, color: P.ink,
    });
    text(s, p.note, {
      x: 10.3, y: y + 0.3, w: 2.15, h: 0.18, fontFace: MONO, fontSize: 8,
      color: P.muted,
    });
  });
  hair(s, 8.55, 4.88, 3.9, P.ink, 1);

  const ue = [
    ['~3,5 ₸', 'переменных издержек на карточку'],
    ['~80 %', 'валовой маржи до налогов'],
    ['0', 'покупателей подтвердили цену'],
  ];
  ue.forEach((u, i) => {
    const y = 5.06 + i * 0.5;
    text(s, u[0], {
      x: 8.55, y, w: 1.2, h: 0.28, fontFace: SERIF,
      fontSize: 15, bold: true, color: i === 2 ? P.accent : P.ink,
    });
    text(s, u[1], {
      x: 9.85, y: y + 0.05, w: 2.6, h: 0.24, fontSize: 10.5, color: P.muted,
    });
  });

  foot(s, 'hh.kz, снимок 2026-11-13, запрос «язык + разработчик», без фильтров; запрос «C» шумный (docs/EVIDENCE.md §2, docs/labor_market.json). Цены и маржа — docs/PILOT.md §1, §4; гипотеза.', 10);
  s.addNotes(NOTES[9]);
}

// ---------------------------------------------------------------------------
// 11 — Pilot / 90 days
// ---------------------------------------------------------------------------

{
  const s = slide();
  head(s, '10 · ПИЛОТ', '90 дней на проверку боли');
  lead(s, 'Пилот — это план, а не отчёт. Пилотов, клиентов и выручки нет; 5 интервью запланированы.');

  const cols = [
    ['ДНИ 0–30', 'Интервью и один пилот', [
      '5 интервью: 2 рекрутера, 2 тимлида, буткемп',
      'Один диагностический пилот за 0 ₸',
      'Baseline: минуты тимлида до Merilo',
    ]],
    ['ДНИ 31–60', 'Три платных пилота', [
      '29 000 ₸ трём компаниям из интервью',
      'Цель — один оплаченный месяц, не три обещания',
      'Калибровка рубрики на 20 решениях',
    ]],
    ['ДНИ 61–90', 'Буткемп и решение', [
      '149 000 ₸ одному буткемпу на семестр',
      'Поток до 60 карточек',
      'Go / no-go по продлению и defense ≥ 50 %',
    ]],
  ];
  const cw = 3.6;
  cols.forEach((c, i) => {
    const x = M + i * (cw + 0.375);
    vhair(s, x, 2.32, 0.3, P.ink, 1.5);
    text(s, c[0], {
      x: x + 0.14, y: 2.34, w: 2.4, h: 0.2, fontFace: MONO, fontSize: 9,
      charSpacing: 1.2, color: P.muted,
    });
    text(s, c[1], {
      x, y: 2.64, w: cw - 0.15, h: 0.62, fontFace: SERIF, fontSize: 18, bold: true,
      color: P.ink, lineSpacingMultiple: 1.02,
    });
    c[2].forEach((t, j) => {
      const y = 3.42 + j * 0.74;
      hair(s, x, y, cw - 0.15, P.rule, 0.75);
      text(s, t, {
        x, y: y + 0.12, w: cw - 0.2, h: 0.56, fontSize: 12.5, color: P.ink,
        lineSpacingMultiple: 1.16,
      });
    });
  });

  box(s, M, 5.82, 11.55, 0.68, { fill: P.panel, line: P.rule });
  text(s, 'СТОП-ПРАВИЛО', {
    x: M + 0.22, y: 6.06, w: 1.7, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.2, color: P.accent,
  });
  text(s, 'Если меньше 3 из 5 интервью подтверждают боль, не продаём 29 000 ₸, а перепозиционируем продукт в учебный инструмент.', {
    x: 2.3, y: 6.0, w: 9.9, h: 0.32, fontSize: 13, color: P.ink,
  });

  foot(s, 'Источник: docs/PILOT.md §3; docs/INTERVIEWS.md — интервью не проведены, 5 запланированы; baseline не измерен (2026-11-13).', 11);
  s.addNotes(NOTES[10]);
}

// ---------------------------------------------------------------------------
// 12 — Team / ask / contact
// ---------------------------------------------------------------------------

{
  const s = slide(true);
  head(s, '11 · ЗАПРОС', 'Нужны не деньги, а проверка', true);
  text(s, '3–5 компаний на диагностический пилот и 5 интервью: два рекрутера, два тимлида, буткемп.', {
    x: M, y: 1.52, w: 8.6, h: 0.82, fontSize: 16, color: P.rule,
    lineSpacingMultiple: 1.22,
  });

  const asks = [
    ['ПИЛОТ', '3–5 компаний', '0 ₸ за диагностику: 5 карточек и созвон до и после'],
    ['ИНТЕРВЬЮ', '5 × 20 минут', 'Скрипты готовы; нужен доступ к реальному процессу'],
    ['КОНТАКТ', 'merilo-nfc.fly.dev', 'Демо без регистрации; исходники и доказательства — в README.md'],
  ];
  asks.forEach((a, i) => {
    const x = M + i * 3.95;
    hair(s, x, 2.75, 3.6, P.darkRule, 1);
    text(s, a[0], {
      x, y: 2.9, w: 3.4, h: 0.2, fontFace: MONO, fontSize: 9,
      charSpacing: 1.4, color: P.darkMuted,
    });
    text(s, a[1], {
      x, y: 3.18, w: 3.55, h: 0.36, fontFace: SERIF, fontSize: 20, bold: true,
      color: P.light,
    });
    text(s, a[2], {
      x, y: 3.62, w: 3.5, h: 0.62, fontSize: 12.5, color: P.darkMuted,
      lineSpacingMultiple: 1.18,
    });
  });

  hair(s, M, 4.98, 11.55, P.darkRule, 1);
  text(s, 'MERILO FOUND', {
    x: M, y: 5.16, w: 2.4, h: 0.2, fontFace: MONO, fontSize: 9,
    charSpacing: 1.2, color: P.darkMuted,
  });
  text(s, 'Marat Zholynbek, solo developer', {
    x: M, y: 5.44, w: 6.8, h: 0.3, fontFace: SERIF, fontSize: 17, color: P.light,
  });
  text(s, 'Шымкент · NIS Каратау · 14 ноября 2026', {
    x: M, y: 5.78, w: 6.2, h: 0.22, fontSize: 12, color: P.darkMuted,
  });

  text(s, 'Нет пилотов, клиентов и выручки.', {
    x: 8.3, y: 5.12, w: 4.15, h: 0.24, fontFace: MONO, fontSize: 8.5,
    color: P.darkMuted, align: 'right',
  });
  text(s, 'Это запрос на проверку, а не отчёт о продажах.', {
    x: 8.3, y: 5.4, w: 4.15, h: 0.24, fontSize: 12, color: P.rule, align: 'right',
  });

  ruler(s, M, 6.5, 11.55, 13, true, 1);
  foot(s, 'Статус 2026-11-13: пилотов, клиентов и выручки нет; 5 интервью запланированы. Цены — docs/PILOT.md §1; доказательства — docs/EVIDENCE.md.', 12, true);
  s.addNotes(NOTES[11]);
}

// ---------------------------------------------------------------------------
// HTML deck — same content and palette, 1280x720 px = 13.333x7.5 in
// ---------------------------------------------------------------------------

const PX = (v) => `${(v * 96).toFixed(1)}px`;
const H = (cls, x, y, w, h, inner = '', extra = '') =>
  `<div class="b ${cls}" style="left:${PX(x)};top:${PX(y)};width:${PX(w)};height:${PX(h)};${extra}">${inner}</div>`;
const HR = (x, y, w, dark = false) =>
  `<div class="hr${dark ? ' d' : ''}" style="left:${PX(x)};top:${PX(y)};width:${PX(w)}"></div>`;
const HRI = (x, y, w) =>
  `<div class="hr ink" style="left:${PX(x)};top:${PX(y)};width:${PX(w)}"></div>`;
const VR = (x, y, h, dark = false, accent = false) =>
  `<div class="vr${dark ? ' d' : ''}${accent ? ' a' : ''}" style="left:${PX(x)};top:${PX(y)};height:${PX(h)}"></div>`;
const PAGENUM = (n, dark = false) =>
  `<div class="b pagenum${dark ? ' d' : ''}" style="left:${PX(11.95)};top:${PX(7.02)};width:${PX(0.95)};height:${PX(0.2)}">${String(n).padStart(2, '0')} / 12</div>`;
const FOOT = (n, text, dark = false) =>
  H(`foot${dark ? ' d' : ''}`, M, 6.93, 11.0, 0.4, text) + PAGENUM(n, dark);

const FOOTNOTES = [
  'Тезис — docs/PITCH.md; продукт — README.md. Статус на 2026-11-13: пилотов, клиентов и выручки нет. Числа — со сносками.',
  'Источник: docs/PROBLEM.md §2. Количественных замеров боли нет: 5 интервью только запланированы — docs/INTERVIEWS.md, 2026-11-13.',
  'Источник: docs/PROBLEM.md §2; docs/EVIDENCE.md §5 (2026-11-13). AI-детекция не заявляется: ai_assisted — декларация, не вывод системы.',
  'Код: backend/verifier.py (Gate 1–3, card_hash), backend/signing.py (Ed25519-манифест). README.md, «Что делает Merilo» (2026-11-13).',
  'Прогон 2026-11-13 без ключа: ideal 90 / vulnerable 52 / injection blocked на Gate 2. README.md, «Тесты и метрики»; docs/DEMO.md.',
  'Источник: backend/languages.py:167; состав закреплён tests/test_languages.py и tests/test_static_contract.py (2026-11-13).',
  'Код: backend/verifier.py, backend/fallback_cache.py, backend/signing.py; манифест — scripts/verify_card.py.',
  'Замеры 2026-11-13: Windows, Python 3.14.6, без ключа, n=20, временная SQLite. Команды: pytest --cov=backend; scripts/bench.py --mode all.',
  'Проверено 2026-11-13: scripts/verify_card.py (VALID / INVALID), defense 401/403/200/409, 27 публичных ключей. docs/EVIDENCE.md §1.',
  'hh.kz, снимок 2026-11-13, запрос «язык + разработчик», без фильтров; запрос «C» шумный (docs/EVIDENCE.md §2, docs/labor_market.json). Цены и маржа — docs/PILOT.md §1, §4; гипотеза.',
  'Источник: docs/PILOT.md §3; docs/INTERVIEWS.md — интервью не проведены, 5 запланированы; baseline не измерен (2026-11-13).',
  'Статус 2026-11-13: пилотов, клиентов и выручки нет; 5 интервью запланированы. Цены — docs/PILOT.md §1; доказательства — docs/EVIDENCE.md.',
];

function shell(n, dark, body) {
  return `<section class="slide${dark ? ' dark' : ''}" id="s${n}">${body}${FOOT(n, FOOTNOTES[n - 1], dark)}</section>`;
}

function headH(eyebrow, title, dark = false) {
  return H(`eb${dark ? ' d' : ''}`, M, 0.4, 11.4, 0.22, eyebrow)
    + H(`h1${dark ? ' d' : ''}`, M, 0.68, 11.6, 0.72, title);
}

function htmlRuler(x, y, w, n, dark = false, accentIndex = -1) {
  let out = HR(x, y, w, dark);
  const step = w / (n - 1);
  for (let i = 0; i < n; i++) {
    const tall = i % 4 === 0 || i === accentIndex;
    const h = tall ? 0.2 : 0.11;
    out += `<div class="vr${dark ? ' d' : ''}${i === accentIndex ? ' a' : ''}" style="left:${PX(x + i * step)};top:${PX(y - h)};height:${PX(h)};${i === accentIndex ? 'width:2px' : ''}"></div>`;
  }
  return out;
}

const slidesHtml = [];

// 1 — title
{
  const b = H('eb d', M, 0.55, 11.2, 0.24, 'MERILO · NATIONAL FOUNDER CUP 2026 · КЕЙС 5')
    + `<div class="b h1 title" style="left:${PX(M)};top:${PX(1.18)};width:${PX(10.6)};height:${PX(2.5)}">Код проверен.<br>Оценка подписана.<br>Ответы записаны.</div>`
    + H('lead d', M, 3.98, 8.2, 0.95, 'Merilo — микро-кейс, три шлюза и публичная карточка инженерной проверки.<br>Не рейтинг разработчика, а измерение конкретной работы.')
    + HR(M, 5.42, 11.55, true)
    + H('eb d', M, 5.6, 4.4, 0.2, 'MERILO FOUND · ШЫМКЕНТ')
    + H('mono d', M, 5.86, 5.2, 0.22, '14 НОЯБРЯ 2026 · NIS КАРАТАУ')
    + H('mono light', 8.7, 5.6, 3.75, 0.25, 'merilo-nfc.fly.dev', 'text-align:right')
    + H('eb d', 8.7, 5.88, 3.75, 0.22, 'демо без регистрации', 'text-align:right')
    + htmlRuler(M, 6.62, 11.55, 13, true, 1);
  slidesHtml.push(shell(1, true, b));
}

// 2 — problem table
{
  let b = headH('01 · ПРОБЛЕМА', 'Три сигнала, которые нельзя сравнить')
    + H('lead', M, 1.5, 9.6, 0.78, 'Кандидат прикладывает резюме, GitHub и сертификат. Компания получает три документа с разными правилами и ни одного ответа на главный вопрос.');
  const cols = [
    { x: M, w: 2.05, label: 'СИГНАЛ' },
    { x: 3.05, w: 3.15, label: 'ЧТО ПОКАЗЫВАЕТ' },
    { x: 6.35, w: 3.25, label: 'ЧЕГО НЕ ПОКАЗЫВАЕТ' },
    { x: 9.85, w: 2.65, label: 'ЦЕНА ПРОВЕРКИ' },
  ];
  b += HR(M, 2.52, 11.55);
  cols.forEach((c) => { b += H('eb', c.x, 2.64, c.w, 0.22, c.label); });
  const rows = [
    ['Резюме', 'Роли, стек, годы опыта', 'Что человек написал сам', 'Минуты чтения, без замера'],
    ['GitHub', 'Публичные репозитории и коммиты', 'Доля собственного кода', 'Чтение диффов тимлидом'],
    ['Сертификат', 'Пройденную программу курса', 'Работу под ограничениями', 'Доверие к платформе'],
  ];
  rows.forEach((r, i) => {
    const y = 3.02 + i * 0.92;
    b += HR(M, y, 11.55);
    b += H('h2', M, y + 0.16, 2.0, 0.34, r[0]);
    b += H('b14', 3.05, y + 0.15, 3.05, 0.6, r[1]);
    b += H('b14', 6.35, y + 0.15, 3.2, 0.6, r[2]);
    b += H('b14 mut', 9.85, y + 0.15, 2.6, 0.6, r[3]);
  });
  b += HRI(M, 5.78, 11.55)
    + H('eb acc', M, 5.98, 1.2, 0.2, 'ВЫВОД')
    + H('h3r', 2.05, 5.9, 10.35, 0.66, 'Проверка стоит времени тимлида, у которого нет отдельной функции оценки. Ни один из трёх сигналов не подписан и не воспроизводим.');
  slidesHtml.push(shell(2, false, b));
}

// 3 — why now
{
  let b = headH('02 · ПОЧЕМУ СЕЙЧАС', 'Генерация удешевила код, а не проверку')
    + H('lead', M, 1.5, 9.6, 0.78, 'Правдоподобное решение теперь стоит минуты. Отличить его от собственной работы по документу нельзя, а ручное чтение не масштабируется.');
  const rows = [
    ['01', 'АВТОРСТВО', 'Код больше не доказывает, что его написал кандидат.'],
    ['02', 'ДОВЕРИЕ', 'Резюме и портфолио описывают результат, а не процесс.'],
    ['03', 'ВРЕМЯ', 'Тимлид читает код вместо того, чтобы принимать решение.'],
  ];
  rows.forEach((r, i) => {
    const y = 2.48 + i * 1.28;
    b += HR(M, y, 7.35);
    b += H('mono acc tiny', M, y + 0.16, 0.6, 0.2, r[0]);
    b += H('eb', 1.55, y + 0.12, 2.2, 0.22, r[1]);
    b += H('h2r', 1.55, y + 0.4, 6.45, 0.66, r[2]);
  });
  b += HRI(M, 6.32, 7.35)
    + `<div class="box panel" style="left:${PX(8.75)};top:${PX(2.42)};width:${PX(3.7)};height:${PX(3.16)}"></div>`
    + H('eb', 9.05, 2.64, 3.1, 0.2, 'ЧЕСТНАЯ ГРАНИЦА')
    + H('h3', 9.05, 2.96, 3.1, 0.72, 'Merilo не детектирует AI-авторство.')
    + H('b13 mut', 9.05, 3.78, 3.1, 1.5, 'Поле ai_assisted — декларация кандидата. Карточка фиксирует прогон, вердикт и подпись, а не происхождение кода.')
    + H('b13 ver', 8.75, 5.82, 3.7, 0.5, 'Что можно проверить: сам прогон, условия и неизменность записи.');
  slidesHtml.push(shell(3, false, b));
}

// 4 — solution steps
{
  let b = headH('03 · РЕШЕНИЕ', 'Микро-кейс, три шлюза, подписанная карточка')
    + H('lead', M, 1.5, 9.6, 0.78, 'Один короткий прогон вместо чтения портфолио: кандидат решает рабочую задачу, система фиксирует, что получилось.');
  const steps = [
    ['01', 'Микро-кейс', 'FinTech, Logistics или EdTech. Одна рабочая задача, один экран.', 'ВХОД'],
    ['02', 'Три шлюза', 'tree-sitter, regex-щит, рубрика 30/40/30. Каждый дешевле следующего.', 'РАЗБОР'],
    ['03', 'Защита', 'Три вопроса и одноразовый токен. Ответы входят в карточку.', 'ЗАПИСЬ'],
    ['04', 'Подписанная карточка', 'Балл, разбор, SHA-256, HMAC и переносимый Ed25519-манифест.', 'АРТЕФАКТ'],
  ];
  const bw = 2.64;
  const gap = 0.32;
  steps.forEach((st, i) => {
    const x = M + i * (bw + gap);
    b += `<div class="box panel" style="left:${PX(x)};top:${PX(2.5)};width:${PX(bw)};height:${PX(2.86)}"></div>`;
    b += H('mono acc tiny', x + 0.22, 2.68, 0.5, 0.2, st[0]);
    b += H('h3', x + 0.22, 2.96, bw - 0.44, 0.62, st[1]);
    b += H('b13 mut', x + 0.22, 3.62, bw - 0.44, 1.2, st[2]);
    b += HR(x + 0.22, 5.06, bw - 0.44);
    b += H('mono mut tiny', x + 0.22, 5.14, bw - 0.44, 0.18, st[3]);
    if (i < 3) b += H('arrow', x + bw + 0.045, 3.75, 0.24, 0.3, '→');
  });
  b += HRI(M, 5.85, 11.55)
    + H('eb', M, 6.04, 1.2, 0.2, 'ИТОГ')
    + H('h3r', 2.05, 5.98, 10.3, 0.35, 'Артефакт, который прикладывают к отклику и проверяют без Merilo.');
  slidesHtml.push(shell(4, false, b));
}

// 5 — demo
{
  let b = headH('04 · ДЕМО', 'Один прогон — четыре экрана')
    + H('lead', M, 1.5, 11.0, 0.78, 'Путь на сцене: кейс, пресет, проверка, карточка. Если сеть упала — docs/offline-demo.html показывает те же вердикты.');
  const shotH = 5.35 * 756 / 1024;
  b += `<img class="shot" src="../screenshots/deck-workbench.png" alt="Рабочий стол кандидата Merilo" style="left:${PX(M)};top:${PX(2.3)};width:${PX(5.35)};height:${PX(shotH)}">`;
  const steps = [
    ['01', 'Выбрать кейс', 'FinTech — Kaspi-style Transfer API'],
    ['02', 'Взять пресет', '«Эталон (Clean & Secure)»'],
    ['03', 'Запустить', 'Три шлюза загораются по очереди'],
    ['04', 'Открыть карточку', '/card/{hash}: балл, тир, подпись'],
  ];
  steps.forEach((st, i) => {
    const y = 2.3 + i * 0.8;
    b += H('mono acc tiny', 6.6, y + 0.02, 0.45, 0.2, st[0]);
    b += H('h3', 7.12, y, 5.25, 0.26, st[1]);
    b += H('b13 mut', 7.12, y + 0.28, 5.25, 0.26, st[2]);
    if (i < 3) b += HR(6.6, y + 0.72, 5.78);
  });
  b += HRI(6.6, 5.62, 5.78)
    + H('eb', 6.6, 5.78, 2.4, 0.2, 'Пресеты FinTech')
    + H('h18r', 6.6, 6.02, 5.8, 0.32, '90 Gold  ·  52 Needs Work  ·  0 blocked')
    + H('b12 mut', 6.6, 6.34, 5.7, 0.28, 'Инъекция останавливается на Gate 2, до вызова модели.');
  slidesHtml.push(shell(5, false, b));
}

// 6 — languages
{
  let b = headH('05 · ЯЗЫКИ И СВОЙ КОД', '13 языков разбираются. Два откалиброваны')
    + H('lead', M, 1.5, 9.7, 0.78, 'tree-sitter проверяет синтаксис на всех тринадцати. Семантическая рубрика откалибрована сначала на Python и JavaScript — для остальных качество оценки не измерено.');
  const stats = [
    ['13', 'языков в SUPPORTED_LANGUAGES'],
    ['2', 'рубрика откалибрована первой'],
    ['1', 'режим «свой код» без задачи'],
  ];
  stats.forEach((st, i) => {
    const x = M + i * 3.9;
    if (i > 0) b += VR(x - 0.28, 2.42, 0.95);
    b += H('big', x, 2.36, 1.4, 0.6, st[0]);
    b += H('b12 mut', x + 1.02, 2.5, 2.55, 0.7, st[1]);
  });
  b += H('eb', M, 3.84, 6.0, 0.2, '13 РАЗБОРОВ · TREE-SITTER')
    + `<div class="sq ver" style="left:${PX(9.62)};top:${PX(3.88)};width:${PX(0.11)};height:${PX(0.11)}"></div>`
    + H('mono ver tiny', 9.82, 3.84, 2.6, 0.2, 'РУБРИКА ОТКАЛИБРОВАНА');
  const baseY = 4.62;
  b += HR(M, baseY, 11.55);
  const step = 11.55 / (LANGS.length - 1);
  const calibrated = new Set(['PY', 'JS']);
  LANGS.forEach((l, i) => {
    const x = M + i * step;
    const on = calibrated.has(l.code);
    b += `<div class="vr${on ? ' v' : ''}" style="left:${PX(x)};top:${PX(baseY - (on ? 0.34 : 0.2))};height:${PX(on ? 0.34 : 0.2)};${on ? 'width:2px' : ''}"></div>`;
    if (on) b += `<div class="sq ver" style="left:${PX(x - 0.06)};top:${PX(baseY - 0.45)};width:${PX(0.12)};height:${PX(0.12)}"></div>`;
    b += H(`mono tick${on ? ' ver' : ' mut'}`, x - 0.3, baseY + 0.08, 0.6, 0.22, l.code, 'text-align:center');
  });
  b += HR(M, 5.55, 11.55)
    + H('b14', M, 5.72, 7.5, 0.6, '«Свой код» — свободная отправка без условия задачи: язык выбирается вручную, задача помечается own-code.')
    + H('h4r mut', 8.65, 5.66, 3.8, 0.72, 'Разбор есть везде.<br>Качество оценки измерено не везде.', 'text-align:right');
  slidesHtml.push(shell(6, false, b));
}

// 7 — architecture
{
  let b = headH('06 · КАК УСТРОЕНО', 'Три шлюза по возрастанию стоимости')
    + H('lead', M, 1.5, 9.5, 0.78, 'Два дешёвых шлюза до модели. При её отказе — детерминированный fallback.');
  const gx = M;
  const gw = 3.45;
  const gates = [
    ['GATE 1 · TREE-SITTER', 'Разбор локально, до сети. Синтаксис не прошёл — дальше не идём.'],
    ['GATE 2 · REGEX-ЩИТ', 'Известные формулировки инъекций. Это фильтр паттернов, не семантика.'],
    ['GATE 3 · РУБРИКА 30/40/30', 'temp 0.0 · строгая JSON-схема · 85 Gold, 70 Silver.'],
  ];
  gates.forEach((g, i) => {
    const y = 2.04 + i * 1.26;
    b += `<div class="box panel" style="left:${PX(gx)};top:${PX(y)};width:${PX(gw)};height:${PX(1.0)}"></div>`;
    b += H('mono tiny', gx + 0.2, y + 0.12, gw - 0.4, 0.2, g[0]);
    b += H('b12 mut', gx + 0.2, y + 0.38, gw - 0.4, 0.5, g[1]);
    if (i < 2) b += H('arrow', gx + gw / 2 - 0.15, y + 1.0, 0.3, 0.24, '↓');
  });
  const fx = gx + gw + 0.55;
  b += `<div class="box dashed" style="left:${PX(fx)};top:${PX(4.56)};width:${PX(3.4)};height:${PX(1.0)}"></div>`;
  b += H('mono tiny', fx + 0.2, 4.68, 3.0, 0.2, 'FALLBACK · БЕЗ СЕТИ');
  b += H('b12 mut', fx + 0.2, 4.94, 3.0, 0.5, 'Нет ключа, таймаут, 404/429 — структурная эвристика без сети.');
  b += HR(gx + gw, 5.06, 0.55) + H('arrow', gx + gw + 0.14, 4.93, 0.3, 0.22, '→')
    + VR(fx + 1.7, 5.56, 0.38)
    + H('arrow', gx + gw / 2 - 0.15, 5.56, 0.3, 0.3, '↓');
  b += `<div class="cardbar" style="left:${PX(M)};top:${PX(5.94)};width:${PX(7.0)};height:${PX(0.72)}"></div>`
    + H('mono paper tiny', M + 0.22, 6.05, 0.6, 0.2, 'CARD')
    + H('mono paper b12', 2.05, 6.02, 5.7, 0.3, 'SHA-256 (12 hex)  →  HMAC-SHA256  →  Ed25519-манифест');
  b += H('h3', 8.85, 2.04, 3.6, 0.5, 'Почему не один вызов модели');
  const notes = [
    'tree-sitter отсекает синтаксис до сетевых вызовов',
    'щит отсекает известные атаки до оплаты токенов',
    'рубрика возвращает структуру, а не абзац текста',
    'fallback даёт тот же балл на тот же вход',
    'Ed25519 проверяется офлайн, без доверия серверу',
  ];
  notes.forEach((n, i) => {
    const y = 2.66 + i * 0.78;
    b += HR(8.85, y, 3.6)
      + H('b12 acc', 8.85, y + 0.12, 0.2, 0.2, '—')
      + H('b12', 9.15, y + 0.1, 3.3, 0.62, n);
  });
  slidesHtml.push(shell(7, false, b));
}

// 8 — evidence
{
  let b = headH('07 · ДОКАЗАТЕЛЬСТВА', 'Что измерено, а не обещано')
    + H('lead', M, 1.5, 9.6, 0.78, 'Все числа ниже воспроизводятся командами из репозитория. Живой вызов модели в этой сессии не измерялся.');
  const stats = [
    ['397', 'тестов в наборе · 2 warnings', 'PYTEST'],
    ['85,30 %', 'покрытие backend · 2240 из 2626', 'PYTEST --COV'],
    ['15,66 мс', 'p50 fallback, in-process · p95 16,87', 'SCRIPTS/BENCH.PY'],
    ['82,97 мс', 'p50 POST verify, fallback · p95 89,23', 'SCRIPTS/BENCH.PY'],
    ['200', 'GET /api/health · version 1.2.0', 'MERILO-NFC.FLY.DEV'],
    ['27', 'публичных ключей карточки', 'GET /API/CARDS'],
  ];
  const cw = 3.69;
  const ch = 1.42;
  stats.forEach((st, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = M + col * (cw + 0.235);
    const y = 2.3 + row * (ch + 0.2);
    b += HR(x, y, cw, false, 1)
      + H(`stat${i === 4 ? ' ver' : ''}`, x, y + 0.14, cw, 0.55, st[0])
      + H('b12 mut', x, y + 0.74, cw - 0.1, 0.3, st[1])
      + H('mono mut tiny', x, y + 1.12, cw, 0.2, st[2]);
  });
  b += `<div class="box panel" style="left:${PX(M)};top:${PX(5.82)};width:${PX(11.55)};height:${PX(0.82)}"></div>`
    + H('mono acc tiny', M + 0.22, 5.96, 0.4, 0.2, 'CI')
    + H('b13', 1.6, 5.92, 10.7, 0.26, 'GitHub Actions · Python 3.11 / 3.12 · ruff · pytest --cov-fail-under=80')
    + H('b11 mut', 1.6, 6.24, 10.7, 0.24, 'Конфиг — .github/workflows/ci.yml, тот же прогон пройден локально · живая задержка Gemini — UNKNOWN.');
  slidesHtml.push(shell(8, false, b));
}

// 9 — trust
{
  let b = headH('08 · ГРАНИЦЫ ДОВЕРИЯ', 'Подпись подтверждает запись, не человека')
    + H('lead', M, 1.5, 9.6, 0.78, 'Карточка доказывает, что этот код прошёл этот конвейер и запись не менялась. Она не доказывает авторство и уровень инженера.')
    + H('eb ver', M, 2.4, 3.0, 0.2, 'ПОДТВЕРЖДАЕТ');
  const yes = [
    'Прогон: задача, язык, вердикт, балл',
    'Неизменность: SHA-256 и HMAC-подпись',
    'Защиту: три ответа и одноразовый токен',
    'Переносимость: Ed25519, SVG-бейдж, QR',
  ];
  yes.forEach((t, i) => {
    const y = 2.68 + i * 0.4;
    b += H('b11 ver', M, y - 0.01, 0.22, 0.22, '✓') + H('b13', M + 0.28, y, 6.35, 0.24, t);
  });
  b += H('eb acc', M, 4.46, 3.0, 0.2, 'НЕ ПОДТВЕРЖДАЕТ');
  const no = [
    'Авторство кода и личность кандидата',
    'Уровень инженера: рубрика не сверена с тимлидами',
    'Полноту regex-щита: перефразированная атака пройдёт',
    'Античит и прокторинг: их нет',
  ];
  no.forEach((t, i) => {
    const y = 4.74 + i * 0.4;
    b += H('b11 acc', M, y - 0.02, 0.22, 0.22, '—') + H('b13', M + 0.28, y, 6.4, 0.24, t);
  });
  const sealH = 4.3 * 260 / 318;
  b += `<img class="shot" src="../screenshots/deck-card-seal.png" alt="Фрагмент подписанной карточки Merilo" style="left:${PX(8.2)};top:${PX(2.2)};width:${PX(4.3)};height:${PX(sealH)}">`;
  b += H('mono mut tiny', 8.2, 5.8, 4.3, 0.2, 'ФРАГМЕНТ РЕАЛЬНОЙ КАРТОЧКИ · 90 / GOLD VERIFIED')
    + H('mono tiny', 8.2, 6.06, 4.3, 0.44, 'manifest: VALID → изменённый score → INVALID (exit 1)')
    + H('mono mut tiny', 8.2, 6.54, 4.3, 0.22, 'defense API: 401 / 403 / 200 / 409');
  slidesHtml.push(shell(9, false, b));
}

// 10 — market
{
  let b = headH('09 · РЫНОК И ЦЕНА', 'Спрос, цена и экономика проверки')
    + H('lead', M, 1.5, 9.6, 0.78, '1 638 вакансий по запросу «Python разработчик» на hh.kz — спрос на язык, а не размер рынка Merilo.')
    + H('eb', M, 2.32, 6.9, 0.2, 'HH.KZ · «ЯЗЫК РАЗРАБОТЧИК» · 2026-11-13')
    + H('eb', 6.2, 2.32, 1.5, 0.2, 'ВАКАНСИЙ', 'text-align:right')
    + HR(M, 2.58, 7.1, false, 1);
  const max = LANGS[0].count;
  LANGS.forEach((l, i) => {
    const y = 2.7 + i * 0.255;
    const bw = 3.95 * (l.count / max);
    b += H(`mono tiny${l.name === 'Python' ? ' acc' : ' mut'}`, M, y - 0.005, 0.85, 0.2, l.code);
    b += `<div class="bar${l.name === 'Python' ? ' acc' : ''}" style="left:${PX(1.72)};top:${PX(y + 0.03)};width:${PX(Math.max(bw, 0.02))};height:${PX(0.12)}"></div>`;
    b += H(`mono tiny${l.name === 'Python' ? ' acc' : ''}`, 6.15, y - 0.005, 1.55, 0.2, String(l.count).replace(/\B(?=(\d{3})+(?!\d))/g, ' '), 'text-align:right');
  });
  b += H('eb', 8.55, 2.32, 3.9, 0.2, 'ОФФЕР · ГИПОТЕЗА, НЕ ПРОВЕРЕНО');
  PRICES.forEach((p, i) => {
    const y = 2.64 + i * 0.56;
    b += HR(8.55, y, 3.9)
      + H('h3', 8.55, y + 0.1, 1.75, 0.3, p.price)
      + H('b11', 10.3, y + 0.1, 2.15, 0.2, p.label)
      + H('mono mut tiny', 10.3, y + 0.3, 2.15, 0.18, p.note);
  });
  b += HR(8.55, 4.88, 3.9, false, 1);
  const ue = [
    ['~3,5 ₸', 'переменных издержек на карточку'],
    ['~80 %', 'валовой маржи до налогов'],
    ['0', 'покупателей подтвердили цену'],
  ];
  ue.forEach((u, i) => {
    const y = 5.06 + i * 0.5;
    b += H(`h4${i === 2 ? ' acc' : ''}`, 8.55, y, 1.2, 0.28, u[0])
      + H('b10 mut', 9.85, y + 0.05, 2.6, 0.24, u[1]);
  });
  slidesHtml.push(shell(10, false, b));
}

// 11 — pilot
{
  let b = headH('10 · ПИЛОТ', '90 дней на проверку боли')
    + H('lead', M, 1.5, 9.6, 0.78, 'Пилот — это план, а не отчёт. Пилотов, клиентов и выручки нет; 5 интервью запланированы.');
  const cols = [
    ['ДНИ 0–30', 'Интервью и один пилот', [
      '5 интервью: 2 рекрутера, 2 тимлида, буткемп',
      'Один диагностический пилот за 0 ₸',
      'Baseline: минуты тимлида до Merilo',
    ]],
    ['ДНИ 31–60', 'Три платных пилота', [
      '29 000 ₸ трём компаниям из интервью',
      'Цель — один оплаченный месяц, не три обещания',
      'Калибровка рубрики на 20 решениях',
    ]],
    ['ДНИ 61–90', 'Буткемп и решение', [
      '149 000 ₸ одному буткемпу на семестр',
      'Поток до 60 карточек',
      'Go / no-go по продлению и defense ≥ 50 %',
    ]],
  ];
  const cw = 3.6;
  cols.forEach((c, i) => {
    const x = M + i * (cw + 0.375);
    b += `<div class="vr" style="left:${PX(x)};top:${PX(2.32)};height:${PX(0.3)};width:1.5px;background:var(--ink)"></div>`
      + H('eb', x + 0.14, 2.34, 2.4, 0.2, c[0])
      + H('h3', x, 2.64, cw - 0.15, 0.62, c[1]);
    c[2].forEach((t, j) => {
      const y = 3.42 + j * 0.74;
      b += HR(x, y, cw - 0.15) + H('b12', x, y + 0.12, cw - 0.2, 0.56, t);
    });
  });
  b += `<div class="box panel" style="left:${PX(M)};top:${PX(5.82)};width:${PX(11.55)};height:${PX(0.68)}"></div>`
    + H('mono acc tiny', M + 0.22, 6.06, 1.7, 0.2, 'СТОП-ПРАВИЛО')
    + H('b13', 2.3, 6.0, 9.9, 0.32, 'Если меньше 3 из 5 интервью подтверждают боль, не продаём 29 000 ₸, а перепозиционируем продукт в учебный инструмент.');
  slidesHtml.push(shell(11, false, b));
}

// 12 — ask
{
  let b = H('eb d', M, 0.4, 11.4, 0.22, '11 · ЗАПРОС')
    + `<div class="b h1 darktitle" style="left:${PX(M)};top:${PX(0.68)};width:${PX(11.6)};height:${PX(0.72)}">Нужны не деньги, а проверка</div>`
    + H('lead d', M, 1.52, 8.6, 0.82, '3–5 компаний на диагностический пилот и 5 интервью: два рекрутера, два тимлида, буткемп.');
  const asks = [
    ['ПИЛОТ', '3–5 компаний', '0 ₸ за диагностику: 5 карточек и созвон до и после'],
    ['ИНТЕРВЬЮ', '5 × 20 минут', 'Скрипты готовы; нужен доступ к реальному процессу'],
    ['КОНТАКТ', 'merilo-nfc.fly.dev', 'Демо без регистрации; исходники и доказательства — в README.md'],
  ];
  asks.forEach((a, i) => {
    const x = M + i * 3.95;
    b += `<div class="hr d" style="left:${PX(x)};top:${PX(2.75)};width:${PX(3.6)}"></div>`
      + H('eb d', x, 2.9, 3.4, 0.2, a[0])
      + H('ask', x, 3.18, 3.55, 0.36, a[1])
      + H('b12 darkmuted', x, 3.62, 3.5, 0.62, a[2]);
  });
  b += `<div class="hr d" style="left:${PX(M)};top:${PX(4.98)};width:${PX(11.55)}"></div>`
    + H('eb d', M, 5.16, 2.4, 0.2, 'MERILO FOUND')
    + H('h3r light', M, 5.44, 6.8, 0.3, 'Marat Zholynbek, solo developer')
    + H('b12 darkmuted', M, 5.78, 6.2, 0.22, 'Шымкент · NIS Каратау · 14 ноября 2026')
    + H('mono darkmuted tiny', 8.3, 5.12, 4.15, 0.24, 'Нет пилотов, клиентов и выручки.', 'text-align:right')
    + H('b12 light', 8.3, 5.4, 4.15, 0.24, 'Это запрос на проверку, а не отчёт о продажах.', 'text-align:right')
    + htmlRuler(M, 6.5, 11.55, 13, true, 1);
  slidesHtml.push(shell(12, true, b));
}

const HTML = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Merilo — финальная защита NFC 2026</title>
<style>
  :root{
    --paper:#F3EFE6; --graphite:#191816; --panel:#FAF7F0;
    --ink:#191816; --light:#FAF7F0; --accent:#B33A2B; --verified:#59624E;
    --rule:#CFC7B8; --muted:#5E5A52; --darkmuted:#A69E90; --darkrule:#3B3731;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0}
  body{background:#0E0D0C;font-family:Calibri,"Segoe UI",sans-serif;color:var(--ink);-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .deck{display:flex;flex-direction:column;align-items:center;gap:28px;padding:28px 0}
  .slide{position:relative;width:1280px;height:720px;flex:none;overflow:hidden;background:var(--paper)}
  .slide.dark{background:var(--graphite)}
  .b{position:absolute;margin:0}
  .eb{font-family:"Courier New",monospace;font-size:9.5pt;line-height:1.15;letter-spacing:1.6pt;text-transform:uppercase;color:var(--muted)}
  .eb.d{color:var(--darkmuted)}
  .h1{font-family:Cambria,Georgia,serif;font-weight:700;font-size:36pt;line-height:.95;color:var(--ink)}
  .h1.d,.darktitle{color:var(--light)}
  .h1.title{font-size:44pt;line-height:.92;color:var(--light)}
  .lead{font-size:15.5pt;line-height:1.2;color:var(--muted)}
  .lead.d{color:var(--rule)}
  .foot{font-family:"Courier New",monospace;font-size:9pt;line-height:1.12;color:var(--muted)}
  .foot.d{color:var(--darkmuted)}
  .pagenum{font-family:"Courier New",monospace;font-size:8.5pt;color:var(--muted);text-align:right}
  .pagenum.d{color:var(--darkmuted)}
  .h2{font-family:Cambria,Georgia,serif;font-weight:700;font-size:18pt;line-height:1.1;color:var(--ink)}
  .h3{font-family:Cambria,Georgia,serif;font-weight:700;font-size:17pt;line-height:1.1;color:var(--ink)}
  .h4{font-family:Cambria,Georgia,serif;font-weight:700;font-size:14pt;line-height:1.1;color:var(--ink)}
  .h2r{font-family:Cambria,Georgia,serif;font-weight:400;font-size:21pt;line-height:1.08;color:var(--ink)}
  .h18r{font-family:Cambria,Georgia,serif;font-weight:400;font-size:18pt;line-height:1.1;color:var(--ink)}
  .h3r{font-family:Cambria,Georgia,serif;font-weight:400;font-size:17pt;line-height:1.12;color:var(--ink)}
  .h4r{font-family:Cambria,Georgia,serif;font-weight:400;font-size:14pt;line-height:1.15;color:var(--ink)}
  .ask{font-family:Cambria,Georgia,serif;font-weight:700;font-size:20pt;line-height:1.05;color:var(--light)}
  .big{font-family:Cambria,Georgia,serif;font-weight:700;font-size:34pt;line-height:.95;color:var(--ink)}
  .stat{font-family:Cambria,Georgia,serif;font-weight:700;font-size:30pt;line-height:.95;color:var(--ink)}
  .b10{font-size:10pt;line-height:1.2}
  .b11{font-size:11pt;line-height:1.2}
  .b12{font-size:12pt;line-height:1.18}
  .b13{font-size:13pt;line-height:1.2}
  .b14{font-size:14pt;line-height:1.22}
  .mono{font-family:"Courier New",monospace;font-size:10pt;line-height:1.15}
  .mono.d{color:var(--rule)}
  .tiny{font-size:8.5pt;letter-spacing:.4pt}
  .mut{color:var(--muted)}
  .acc{color:var(--accent)}
  .ver{color:var(--verified)}
  .paper{color:var(--paper)}
  .light{color:var(--light)}
  .darkmuted{color:var(--darkmuted)}
  .hr{position:absolute;height:1px;background:var(--rule)}
  .hr.ink{background:var(--ink);height:1.5px}
  .hr.d{background:var(--darkrule)}
  .vr{position:absolute;width:1px;background:var(--rule)}
  .vr.d{background:var(--darkrule)}
  .vr.v{background:var(--verified)}
  .vr.a{background:var(--accent)}
  .sq{position:absolute}
  .sq.ver{background:var(--verified)}
  .box{position:absolute;border:0.75pt solid var(--rule);background:var(--panel)}
  .box.dashed{border-style:dashed;border-color:var(--muted);background:var(--panel)}
  .box.panel{background:var(--panel)}
  .arrow{font-family:Cambria,Georgia,serif;font-size:15pt;color:var(--accent);text-align:center;line-height:1}
  .shot{position:absolute;display:block;border:0.75pt solid var(--rule);object-fit:cover}
  .bar{position:absolute;background:var(--ink)}
  .bar.acc{background:var(--accent)}
  .cardbar{position:absolute;background:var(--ink)}
  @media screen and (max-width:1320px){ .deck{padding:16px 0} }
  @media print{
    @page{size:13.333in 7.5in;margin:0}
    html,body{background:#fff}
    .deck{display:block;padding:0;margin:0}
    .slide{break-after:page;page-break-after:always;margin:0}
    .slide:last-child{break-after:auto;page-break-after:auto}
  }
</style>
</head>
<body class="deck">
${slidesHtml.join('\n')}
<script>
(function(){
  var q=new URLSearchParams(location.search);
  var only=q.get('slide');
  if(only){
    document.body.classList.add('shot');
    var slides=document.querySelectorAll('.slide');
    slides.forEach(function(s,i){ if(i+1!==Number(only)) s.parentNode.removeChild(s); });
    document.body.style.background='#F3EFE6';
    document.body.style.display='block';
    document.body.style.padding='0';
  } else if(!q.get('print') && window.innerWidth<1320){
    document.body.style.zoom=Math.min(1,(window.innerWidth-32)/1280);
  }
})();
</script>
</body>
</html>`;

fs.writeFileSync(path.join(DOCS, 'presentation.html'), HTML, 'utf8');
console.log(`HTML: ${path.join(DOCS, 'presentation.html')} (${slidesHtml.length} slides)`);

// ---------------------------------------------------------------------------
// Write PPTX
// ---------------------------------------------------------------------------

const pptxPath = path.join(DOCS, 'Merilo_NFC_Pitch.pptx');
pptx.writeFile({ fileName: pptxPath }).then(() => {
  console.log(`PPTX: ${pptxPath} (${pptx._slides.length} slides)`);
}).catch((err) => {
  console.error('PPTX failed:', err);
  process.exitCode = 1;
});
