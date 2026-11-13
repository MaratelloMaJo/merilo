/**
 * Merilo — NFC 2026 final deck (14 slides, 16:9)
 *
 * Separate from scripts/generate_pitch.mjs so the existing 12-slide deck and
 * its renders are never touched.
 *
 *   node scripts/generate_pitch_final.mjs
 *
 * Output: docs/Merilo_NFC_Final.pptx
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pptxgen from "./node_modules/pptxgenjs/dist/pptxgen.es.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.join(ROOT, "docs", "assets", "pitch_final");
const OUT = path.join(ROOT, "docs", "Merilo_NFC_Final.pptx");

/* ---------------------------------------------------------------- palette */
const C = {
  white: "FFFFFF",
  lilac: "C9C0FF",
  muted: "9A91C2",
  dim: "6E668F",
  violet: "4B3F8E",
  deep: "3B3367",
  hair: "2A2447",
  panel: "0C0A18",
  ink: "000000",
};

const F = "Arial";
const M = "Courier New";
const TOTAL = 14;
const L = 0.8;
const R = 12.53;
const W = R - L;

/* ---------------------------------------------------------------- helpers */
const pptx = new pptxgen();
pptx.layout = "LAYOUT_WIDE";
pptx.author = "Merilo Found";
pptx.company = "Merilo";
pptx.title = "Merilo — проверяемая запись о навыке";
pptx.subject = "National Founder Cup 2026 · Case 5 · The Experience Gap";

let pageNo = 0;

function page(bg, opts = {}) {
  const s = pptx.addSlide();
  s.background = { path: path.join(ASSETS, bg) };
  pageNo += 1;

  if (opts.eyebrow) {
    s.addText(opts.eyebrow, {
      x: L, y: 0.38, w: 8.4, h: 0.3,
      fontFace: M, fontSize: 10, color: opts.eyebrowColor || C.lilac,
      charSpacing: 2.2, valign: "middle", margin: 0,
    });
  }
  if (opts.eyebrowRight) {
    s.addText(opts.eyebrowRight, {
      x: R - 4.4, y: 0.38, w: 4.4, h: 0.3,
      fontFace: M, fontSize: 9.5, color: C.muted, align: "right",
      charSpacing: 1.6, valign: "middle", margin: 0,
    });
  }
  if (opts.hair !== false) {
    s.addShape(pptx.ShapeType.line, {
      x: L, y: 0.76, w: W, h: 0,
      line: { color: C.hair, width: 0.75 },
    });
  }
  if (opts.num !== false) {
    s.addText(`${String(pageNo).padStart(2, "0")} / ${TOTAL}`, {
      x: R - 1.4, y: 6.98, w: 1.4, h: 0.26,
      fontFace: M, fontSize: 8.5, color: C.dim, align: "right", margin: 0,
    });
  }
  return s;
}

function title(s, text, opts = {}) {
  s.addText(text, {
    x: L, y: opts.y ?? 1.06, w: opts.w ?? W, h: opts.h ?? 0.9,
    fontFace: F, fontSize: opts.size ?? 38, bold: true,
    color: opts.color ?? C.white, valign: "top", margin: 0,
    lineSpacingMultiple: 0.96, charSpacing: -0.4,
  });
}

function sub(s, text, opts = {}) {
  s.addText(text, {
    x: opts.x ?? L, y: opts.y ?? 1.92, w: opts.w ?? 9.4, h: opts.h ?? 0.6,
    fontFace: F, fontSize: opts.size ?? 15.5, color: opts.color ?? C.muted,
    valign: "top", margin: 0, lineSpacingMultiple: 1.15,
  });
}

function src(s, text) {
  s.addText(text, {
    x: L, y: 6.94, w: 10.4, h: 0.3,
    fontFace: M, fontSize: 8, color: C.dim, margin: 0,
    charSpacing: 0.4, valign: "middle",
  });
}

function pill(s, text, x, y, w, opts = {}) {
  s.addShape(pptx.ShapeType.rect, {
    x, y, w, h: opts.h ?? 0.34,
    fill: { color: opts.fill ?? C.violet },
    line: { color: opts.line ?? opts.fill ?? C.violet, width: opts.line ? 0.9 : 0 },
  });
  s.addText(text, {
    x, y, w, h: opts.h ?? 0.34,
    fontFace: M, fontSize: opts.size ?? 9, bold: true,
    color: opts.color ?? C.white, align: "center", valign: "middle",
    charSpacing: 1.6, margin: 0,
  });
}

function hairline(s, x, y, w, color = C.hair) {
  s.addShape(pptx.ShapeType.line, { x, y, w, h: 0, line: { color, width: 0.75 } });
}

function panel(s, x, y, w, h, opts = {}) {
  s.addShape(pptx.ShapeType.rect, {
    x, y, w, h,
    fill: { color: opts.fill ?? C.panel, transparency: opts.transparency ?? 18 },
    line: { color: opts.line ?? C.hair, width: 0.75 },
  });
}

function mono(s, text, x, y, w, opts = {}) {
  s.addText(text, {
    x, y, w, h: opts.h ?? 0.26,
    fontFace: M, fontSize: opts.size ?? 9.5, color: opts.color ?? C.muted,
    charSpacing: opts.tracking ?? 1.2, align: opts.align ?? "left",
    margin: 0, valign: opts.valign ?? "middle",
  });
}

/* -------------------------------------------------------------- 01 · hook */
{
  const s = page("bg_hero.png", {
    eyebrow: "NATIONAL FOUNDER CUP 2026  ·  CASE 5",
    eyebrowRight: "ШЫМКЕНТ  ·  14.11.2026",
    hair: false, num: false,
  });

  s.addText("68%", {
    x: 0.55, y: 1.15, w: 5.9, h: 3.5,
    fontFace: F, fontSize: 200, bold: true, color: C.white,
    margin: 0, valign: "middle", charSpacing: -6,
  });

  s.addText(
    [
      { text: "нанимающих менеджеров\n", options: { color: C.white } },
      { text: "говорят, что ИИ-фрод опережает проверку", options: { color: C.lilac } },
    ],
    {
      x: 6.35, y: 1.72, w: 6.1, h: 1.9,
      fontFace: F, fontSize: 25, bold: true, margin: 0,
      lineSpacingMultiple: 1.08, valign: "top",
    },
  );
  mono(s, "CHECKR · 2026 · 3 000 МЕНЕДЖЕРОВ ПО НАЙМУ", 6.38, 3.72, 5.8, { size: 8.5, color: C.dim });

  hairline(s, L, 5.02, W);

  s.addText("MERILO", {
    x: L, y: 5.18, w: 3.2, h: 0.7,
    fontFace: F, fontSize: 44, bold: true, color: C.white,
    margin: 0, charSpacing: -1,
  });
  s.addText("проверяемая запись о том,\nчто кандидат действительно умеет", {
    x: 3.72, y: 5.22, w: 5.4, h: 0.9,
    fontFace: F, fontSize: 15, color: C.lilac, margin: 0, lineSpacingMultiple: 1.1,
  });

  pill(s, "LIVE", 11.55, 5.34, 0.92, { fill: C.violet });
  s.addText("merilo-nfc.fly.dev", {
    x: 9.05, y: 5.34, w: 2.35, h: 0.34,
    fontFace: M, fontSize: 10, color: C.muted, align: "right", valign: "middle", margin: 0,
  });

  s.addText("Мы не просим поверить. Мы просим проверить.", {
    x: L, y: 6.52, w: W, h: 0.4,
    fontFace: F, fontSize: 13, italic: true, color: C.dim, margin: 0,
  });

  s.addNotes(
    "Старт: 68% нанимающих менеджеров в США говорят, что ИИ-фрод опережает детекцию. Это Checkr, 2026, три тысячи респондентов. " +
    "Дальше не рассказываю о себе — показываю, что мы построили и что измерили. Всё, что будет на слайдах, проверяемо: открытые источники для рынка, команды из репозитория для продукта.",
  );
}

/* ----------------------------------------------------------- 02 · problem */
{
  const s = page("bg_base.png", { eyebrow: "02  ·  ПРОБЛЕМА", eyebrowRight: "ТРИ СИГНАЛА" });
  title(s, "Трём сигналам нельзя верить.");
  sub(s, "Резюме, GitHub и сертификат отвечают на разные вопросы — и не складываются в одно решение о человеке.");

  const cards = [
    { n: "44%", t: "соискателей признаются, что лгали в процессе найма", d: "Resume Builder · 2025 · n = 2 000" },
    { n: "×2", t: "рост читерства на технических тестах за год: 16% → 35%", d: "Aiseptor · 2026" },
    { n: "1 / 4", t: "профилей кандидатов будут фейковыми к 2028 году", d: "Gartner · 2025 · n = 3 000" },
  ];
  const cw = 3.72;
  cards.forEach((c, i) => {
    const x = L + i * (cw + 0.28);
    panel(s, x, 2.72, cw, 3.15, { transparency: 42 });
    s.addText(c.n, {
      x: x + 0.32, y: 2.94, w: cw - 0.64, h: 1.05,
      fontFace: F, fontSize: 54, bold: true, color: C.white, margin: 0, valign: "middle",
    });
    s.addText(c.t, {
      x: x + 0.32, y: 4.03, w: cw - 0.64, h: 1.15,
      fontFace: F, fontSize: 13.5, color: C.lilac, margin: 0, lineSpacingMultiple: 1.16,
    });
    mono(s, c.d, x + 0.32, 5.45, cw - 0.64, { size: 8, color: C.dim });
  });

  s.addText("Компания платит за проверку временем тимлида. Это не масштабируется.", {
    x: L, y: 6.18, w: W, h: 0.4,
    fontFace: F, fontSize: 15, bold: true, color: C.white, margin: 0,
  });

  src(s, "Источники: Resume Builder (янв 2025) · Aiseptor 2026 · Gartner Q2 2025. Все цифры — внешние, со ссылкой на первичный отчёт.");
  s.addNotes(
    "Три сигнала. Резюме говорит, что человек написал о себе. GitHub — что он закоммитил, но не что написал сам. Сертификат — что он прошёл курс. " +
    "44% признаются, что лгали. Читерство на техтестах выросло вдвое за год. Gartner обещает каждый четвёртый фейковый профиль к 2028. " +
    "Мы не продаём паранойю: мы продаём дешёвую проверку конкретной работы.",
  );
}

/* ---------------------------------------------------------- 03 · why now */
{
  const s = page("bg_base.png", { eyebrow: "03  ·  ПОЧЕМУ СЕЙЧАС", eyebrowRight: "ЭКОНОМИКА ДОВЕРИЯ" });
  title(s, "Код подешевел.\nДоверие — нет.", { h: 1.5, size: 40 });
  sub(s, "Генерация сделала правдоподобный код дешёвым. Читать портфолио стало дороже, чем писать его.", { y: 2.42, w: 8.6 });

  const rows = [
    { big: "38,5%", t: "AI-интервью с признаками ИИ-читерства. В технических ролях — 48%.", d: "Fabric · 19 368 интервью" },
    { big: "73 → 3", t: "отклика на вакансию доходят до собеседования. 38 дней на найм.", d: "SmartRecruiters · 89 млн заявок" },
    { big: "50–200%", t: "годовой зарплаты — цена одного плохого найма.", d: "SHRM · DOL: минимум 30%" },
  ];
  rows.forEach((r, i) => {
    const y = 3.55 + i * 1.02;
    s.addText(r.big, {
      x: L, y, w: 2.55, h: 0.72,
      fontFace: F, fontSize: 34, bold: true, color: C.lilac, margin: 0, valign: "middle",
    });
    s.addText(r.t, {
      x: 3.5, y: y + 0.02, w: 5.0, h: 0.68,
      fontFace: F, fontSize: 13, color: C.white, margin: 0, lineSpacingMultiple: 1.1, valign: "middle",
    });
    mono(s, r.d, 8.55, y + 0.18, 3.65, { size: 7.4, color: C.dim, align: "right", tracking: 0.6 });
    if (i < 2) hairline(s, L, y + 0.92, W);
  });

  s.addText("Проверка должна стать артефактом, а не разговором.", {
    x: L, y: 6.62, w: W, h: 0.35,
    fontFace: F, fontSize: 15, bold: true, color: C.white, margin: 0,
  });

  src(s, "Источники: Fabric / Forbes (17.08.2026) · SmartRecruiters Recruitment Benchmarks 2025 · SHRM cost-of-bad-hire.");
  s.addNotes(
    "Три следствия. Первое: ИИ-читерство стало нормой в технических интервью — 38,5% из почти двадцати тысяч. Второе: воронка не выдерживает — 73 отклика, 3 собеседования, 38 дней. " +
    "Третье: ошибка стоит от половины до двух годовых зарплат. Вывод: проверять надо не слова, а выполненную работу, и проверка должна быть дешёвой настолько, чтобы её нельзя было обойти.",
  );
}

/* ---------------------------------------------------------- 04 · solution */
{
  const s = page("bg_panel.png", { eyebrow: "04  ·  РЕШЕНИЕ", eyebrowRight: "LIVE" });
  title(s, "Один прогон. Одна карточка.\nПроверка без нас.", { h: 1.5, size: 38 });
  pill(s, "LIVE", 11.45, 1.12, 1.0, { fill: C.violet });

  const steps = [
    ["01", "МИКРО-КЕЙС", "15 минут · рабочая задача вместо теста на память"],
    ["02", "ТРИ ШЛЮЗА", "синтаксис → инъекции → рубрика"],
    ["03", "ЗАЩИТА", "3 вопроса по собственному коду"],
    ["04", "КАРТОЧКА", "балл, разбор, хэш, подпись"],
  ];
  const sw = 2.72;
  steps.forEach((st, i) => {
    const x = L + i * (sw + 0.32);
    mono(s, st[0], x, 2.62, 0.6, { size: 10, color: C.lilac });
    s.addText(st[1], {
      x, y: 2.92, w: sw, h: 0.3,
      fontFace: F, fontSize: 13, bold: true, color: C.white, margin: 0, charSpacing: 0.6,
    });
    s.addText(st[2], {
      x, y: 3.25, w: sw, h: 0.62,
      fontFace: F, fontSize: 11, color: C.muted, margin: 0, lineSpacingMultiple: 1.1,
    });
    if (i < 3) s.addText("→", { x: x + sw + 0.02, y: 2.9, w: 0.3, h: 0.3, fontFace: F, fontSize: 16, color: C.dim, margin: 0 });
  });
  hairline(s, L, 4.02, W);

  // card mock-up
  panel(s, L, 4.24, 7.5, 2.5, { transparency: 8, fill: "08060F" });
  mono(s, "VERIFIED SKILL CARD", 1.06, 4.42, 3.2, { size: 8.5, color: C.lilac });
  s.addText("90", {
    x: 1.0, y: 4.62, w: 1.55, h: 1.05,
    fontFace: F, fontSize: 58, bold: true, color: C.white, margin: 0, valign: "middle",
  });
  pill(s, "GOLD", 2.48, 4.78, 0.86, { fill: C.violet, h: 0.3, size: 8.5 });
  mono(s, "/ 100  ·  ПОРОГ 85", 3.42, 4.8, 2.2, { size: 8, color: C.dim });

  const bars = [
    ["Чистота кода", 27, 30],
    ["Архитектура", 36, 40],
    ["Краевые случаи", 27, 30],
  ];
  bars.forEach((b, i) => {
    const y = 5.62 + i * 0.36;
    s.addText(b[0], { x: 1.06, y, w: 1.55, h: 0.24, fontFace: F, fontSize: 9, color: C.muted, margin: 0, valign: "middle" });
    s.addShape(pptx.ShapeType.rect, { x: 2.62, y: y + 0.085, w: 3.0, h: 0.07, fill: { color: C.hair }, line: { color: C.hair, width: 0 } });
    s.addShape(pptx.ShapeType.rect, { x: 2.62, y: y + 0.085, w: 3.0 * (b[1] / b[2]), h: 0.07, fill: { color: C.lilac }, line: { color: C.lilac, width: 0 } });
    mono(s, `${b[1]}/${b[2]}`, 5.74, y, 0.7, { size: 8.5, color: C.white });
  });
  mono(s, "sha256 · 7f3a91c4e2b8 · ed25519", 4.55, 4.42, 3.5, { size: 7.6, color: C.dim, align: "right" });

  s.addText("27 публичных полей.\nНи строки кода.", {
    x: 8.75, y: 4.35, w: 3.6, h: 0.9,
    fontFace: F, fontSize: 17, bold: true, color: C.white, margin: 0, lineSpacingMultiple: 1.1,
  });
  s.addText("Карточку можно приложить к отклику и проверить без нашего сервера.", {
    x: 8.75, y: 5.32, w: 3.55, h: 0.9,
    fontFace: F, fontSize: 12, color: C.muted, margin: 0, lineSpacingMultiple: 1.2,
  });

  src(s, "Код: backend/verifier.py, backend/signing.py. Замеры: 2026-11-13, Python 3.14.6, без ключа. 27 публичных полей — tests/test_static_contract.py.");
  s.addNotes(
    "Решение — один короткий прогон. Кандидат берёт рабочую задачу, проходит три шлюза, отвечает на три вопроса защиты и получает карточку. " +
    "Карточка — не резюме: балл, разбор по трём критериям, хэш и подпись. Её можно приложить к отклику, а работодатель проверит её офлайн. " +
    "Мы продаём не оценку человека, а проверяемую запись о конкретной работе.",
  );
}

/* ------------------------------------------------------------- 05 · gates */
{
  const s = page("bg_base.png", { eyebrow: "05  ·  КАК ЭТО РАБОТАЕТ", eyebrowRight: "ТРИ ШЛЮЗА" });
  title(s, "Дешёвые отказы — до модели.", { size: 38 });
  sub(s, "Шлюзы стоят по возрастанию стоимости: локальный парсер, затем защита, и только потом модель.");

  const gates = [
    { n: "GATE 01", t: "Синтаксис", d: "tree-sitter разбирает файл локально, до сети. Невалидный код не доходит до модели.", k: "13", kl: "языков", m: "p50 15,66 мс" },
    { n: "GATE 02", t: "Инъекции", d: "Regex-щит по известным формулировкам промпт-инъекций и попыток вытащить системный промпт.", k: "0", kl: "прошло в пресете", m: "блок до модели" },
    { n: "GATE 03", t: "Рубрика", d: "Gemini 3.6 Flash, temperature 0.0, строгая JSON-схема. При отказе — детерминированный fallback.", k: "30/40/30", kl: "чистота / архитектура / края", m: "p50 82,97 мс" },
  ];
  const gw = 3.72;
  gates.forEach((g, i) => {
    const x = L + i * (gw + 0.28);
    panel(s, x, 2.62, gw, 3.5, { transparency: 46 });
    mono(s, g.n, x + 0.3, 2.8, 2.0, { size: 8.5, color: C.lilac });
    s.addText(g.t, { x: x + 0.3, y: 3.06, w: gw - 0.6, h: 0.44, fontFace: F, fontSize: 22, bold: true, color: C.white, margin: 0 });
    s.addText(g.d, { x: x + 0.3, y: 3.58, w: gw - 0.6, h: 1.15, fontFace: F, fontSize: 11.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.18 });
    s.addText(g.k, { x: x + 0.3, y: 4.78, w: gw - 0.6, h: 0.5, fontFace: F, fontSize: 26, bold: true, color: C.lilac, margin: 0 });
    s.addText(g.kl, { x: x + 0.3, y: 5.28, w: gw - 0.6, h: 0.3, fontFace: F, fontSize: 9.5, color: C.dim, margin: 0 });
    mono(s, g.m, x + 0.3, 5.62, gw - 0.6, { size: 8, color: C.muted });
  });

  s.addText("Честная граница: regex — не семантика. Перефразированная атака может пройти.", {
    x: L, y: 6.34, w: W, h: 0.34,
    fontFace: F, fontSize: 12.5, color: C.muted, margin: 0,
  });

  src(s, "Замеры 2026-11-13, n = 20, без ключа Gemini: fallback p50 15,66 / p95 16,87 мс; verify p50 82,97 / p95 89,23 мс.");
  s.addNotes(
    "Порядок шлюзов — это экономика. tree-sitter работает локально и стоит ноль, он отсекает синтаксис до сети. Regex-щит ловит известные формулировки инъекций — " +
    "и я честно говорю: это не семантика, перефразированная атака может пройти. Только третий шлюз стоит денег: модель с температурой ноль и строгой схемой. " +
    "Если ключа нет — детерминированный fallback, и все задержки в деке измерены именно на нём.",
  );
}

/* -------------------------------------------------------- 06 · signature */
{
  const s = page("bg_panel.png", { eyebrow: "06  ·  ДОКАЗАТЕЛЬСТВО", eyebrowRight: "ED25519" });
  title(s, "Подпись подтверждает запись.\nНе человека.", { h: 1.5, size: 38 });

  const chain = [
    ["SHA-256", "card_hash, 12 hex-символов — адрес карточки"],
    ["HMAC-SHA256", "целостность записи на нашей стороне"],
    ["ED25519", "переносимый манифест: проверяется где угодно"],
  ];
  chain.forEach((c, i) => {
    const y = 2.5 + i * 1.05;
    mono(s, c[0], L, y, 2.2, { size: 10, color: C.lilac });
    s.addText(c[1], { x: 2.7, y: y - 0.03, w: 3.9, h: 0.5, fontFace: F, fontSize: 13, color: C.white, margin: 0, valign: "middle", lineSpacingMultiple: 1.1 });
    if (i < 2) s.addText("↓", { x: 1.0, y: y + 0.34, w: 0.4, h: 0.3, fontFace: F, fontSize: 14, color: C.dim, margin: 0 });
    if (i < 2) hairline(s, L, y + 0.86, 5.7);
  });

  panel(s, 6.9, 2.45, 5.55, 2.6, { fill: "05040A", transparency: 4 });
  mono(s, "ТЕРМИНАЛ · БЕЗ НАШЕГО СЕРВЕРА", 7.15, 2.62, 4.9, { size: 8, color: C.dim });
  s.addText(
    [
      { text: "$ python scripts/verify_card.py card.json\n", options: { color: C.muted } },
      { text: "VALID\n\n", options: { color: "FFFFFF", bold: true } },
      { text: "$ verify_card.py card.json --score 91\n", options: { color: C.muted } },
      { text: "INVALID   exit 1", options: { color: "FF8A7A", bold: true } },
    ],
    { x: 7.15, y: 2.95, w: 5.0, h: 1.9, fontFace: M, fontSize: 12, margin: 0, lineSpacingMultiple: 1.25 },
  );

  s.addText("Что карточка не доказывает: авторство, личность и уровень инженера.", {
    x: L, y: 5.72, w: 6.0, h: 0.8,
    fontFace: F, fontSize: 13, color: C.muted, margin: 0, lineSpacingMultiple: 1.2,
  });
  s.addText("Мы фиксируем прогон и его неизменность — не происхождение кода.", {
    x: L, y: 6.5, w: W, h: 0.34,
    fontFace: F, fontSize: 12.5, italic: true, color: C.dim, margin: 0,
  });

  src(s, "Проверено 2026-11-13: scripts/verify_card.py → VALID / INVALID (exit 1); defense API 401 / 403 / 200 / 409; 27 публичных полей.");
  s.addNotes(
    "Карточка подписана трижды. SHA-256 даёт адрес, HMAC защищает запись у нас, Ed25519 делает манифест переносимым. " +
    "Реальный манифест даёт VALID, изменённый балл — INVALID и код возврата 1. Проверка работает офлайн, без нашего сервера. " +
    "И сразу граница: подпись не доказывает авторство, личность или уровень инженера. Она доказывает, что конкретный код прошёл конкретный конвейер и запись не менялась.",
  );
}

/* ------------------------------------------------------------- 07 · demo */
{
  const s = page("bg_hero.png", { eyebrow: "07  ·  LIVE DEMO", eyebrowRight: "200 OK  ·  v1.2.0" });
  title(s, "Проверьте сами.\nСейчас.", { h: 1.5, size: 40 });

  const steps = [
    ["01", "Выберите FinTech-кейс"],
    ["02", "Возьмите пресет «Эталон»"],
    ["03", "Запустите проверку"],
    ["04", "Откройте /card/{hash}"],
  ];
  steps.forEach((st, i) => {
    const y = 2.6 + i * 0.62;
    mono(s, st[0], L, y, 0.5, { size: 9, color: C.lilac });
    s.addText(st[1], { x: 1.42, y: y - 0.04, w: 5.4, h: 0.34, fontFace: F, fontSize: 14, color: C.white, margin: 0, valign: "middle" });
    if (i < 3) hairline(s, L, y + 0.46, 6.0);
  });

  s.addText(
    [
      { text: "90", options: { color: C.white, bold: true } },
      { text: " GOLD    ", options: { color: C.lilac, bold: true } },
      { text: "52", options: { color: C.white, bold: true } },
      { text: " NEEDS WORK    ", options: { color: C.lilac, bold: true } },
      { text: "0", options: { color: C.white, bold: true } },
      { text: " BLOCKED", options: { color: C.lilac, bold: true } },
    ],
    { x: L, y: 5.42, w: 6.4, h: 0.4, fontFace: M, fontSize: 13, margin: 0, charSpacing: 0.6 },
  );
  s.addText("Три реальных прогона текущей сборки — не обещание балла.", {
    x: L, y: 5.82, w: 6.0, h: 0.3, fontFace: F, fontSize: 10.5, color: C.dim, margin: 0,
  });

  // QR tile
  s.addShape(pptx.ShapeType.rect, { x: 9.05, y: 2.2, w: 2.75, h: 2.75, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
  s.addImage({ path: path.join(ASSETS, "qr_demo.png"), x: 9.14, y: 2.29, w: 2.57, h: 2.57 });
  mono(s, "merilo-nfc.fly.dev", 8.6, 5.06, 3.65, { size: 11, color: C.white, align: "center" });
  mono(s, "наведите камеру · без регистрации", 8.3, 5.34, 4.25, { size: 7.8, color: C.dim, align: "center" });

  s.addText("Если Wi-Fi упадёт — docs/offline-demo.html с теми же тремя прогонами.", {
    x: L, y: 6.55, w: W, h: 0.3, fontFace: F, fontSize: 10.5, color: C.dim, margin: 0,
  });

  src(s, "Демо: https://merilo-nfc.fly.dev · health 200, version 1.2.0 · офлайн-снимок генерируется scripts/generate_offline_demo.py.");
  s.addNotes(
    "Демо — четыре действия. Выбрать FinTech-кейс, взять эталонный пресет, запустить, открыть карточку. " +
    "На экране три шлюза и результат. Пресеты дают 90 Gold, 52 Needs Work и ноль с блокировкой на втором шлюзе — это наблюдение на текущей сборке, не гарантия. " +
    "QR ведёт на живой сервис, регистрация не нужна. Если сеть упадёт, есть офлайн-снимок с теми же прогонами.",
  );
}

/* ------------------------------------------------------------- 08 · next */
{
  const s = page("bg_section.png", { eyebrow: "08  ·  NEXT 90 ДНЕЙ", eyebrowRight: "ПРОЕКТИРОВАНИЕ", eyebrowColor: C.white });
  title(s, "Карточка приходит\nк рекрутеру сама.", { h: 1.5, size: 40 });
  pill(s, "NEXT  ·  90 ДНЕЙ", 10.55, 1.14, 1.95, { fill: "120E22", color: C.lilac, line: C.lilac, h: 0.36 });

  const items = [
    ["01", "Chrome-расширение", "Верифицированный бейдж прямо в hh.kz и LinkedIn: балл, тир и подпись видны в карточке кандидата."],
    ["02", "AI-матчинг", "27 публичных полей против требований вакансии — сопоставление по доказанным навыкам, а не по ключевым словам."],
    ["03", "Shortlist за минуту", "Рекрутер видит 5 проверенных кандидатов вместо 73 непроверенных откликов."],
  ];
  items.forEach((it, i) => {
    const y = 2.55 + i * 1.18;
    mono(s, it[0], L, y + 0.02, 0.5, { size: 9, color: C.white });
    s.addText(it[1], { x: 1.42, y: y - 0.06, w: 4.6, h: 0.34, fontFace: F, fontSize: 16, bold: true, color: C.white, margin: 0 });
    s.addText(it[2], { x: 1.42, y: y + 0.28, w: 5.2, h: 0.66, fontFace: F, fontSize: 11.5, color: "DDD6FF", margin: 0, lineSpacingMultiple: 1.16 });
  });

  // extension mock-up
  panel(s, 7.35, 2.35, 4.95, 3.75, { fill: "0A0815", transparency: 8 });
  s.addShape(pptx.ShapeType.rect, { x: 7.35, y: 2.35, w: 4.95, h: 0.34, fill: { color: "161228" }, line: { color: "161228", width: 0 } });
  ["E74C3C", "F1C40F", "2ECC71"].forEach((col, i) => {
    s.addShape(pptx.ShapeType.ellipse, { x: 7.52 + i * 0.19, y: 2.45, w: 0.09, h: 0.09, fill: { color: col }, line: { color: col, width: 0 } });
  });
  mono(s, "hh.kz/vacancy/118608890", 7.95, 2.4, 3.6, { size: 7.4, color: C.dim });
  s.addText("Python-разработчик · Junior", { x: 7.55, y: 2.84, w: 3.0, h: 0.3, fontFace: F, fontSize: 11, bold: true, color: C.white, margin: 0 });
  s.addText("73 отклика", { x: 7.55, y: 3.14, w: 1.6, h: 0.24, fontFace: F, fontSize: 9, color: C.dim, margin: 0 });

  hairline(s, 7.55, 3.46, 4.55, "2A2447");
  s.addShape(pptx.ShapeType.rect, { x: 7.55, y: 3.6, w: 4.55, h: 2.05, fill: { color: "120E22" }, line: { color: "3B3367", width: 1 } });

  s.addText("● VERIFIED", { x: 7.72, y: 3.72, w: 1.3, h: 0.24, fontFace: M, fontSize: 7.5, color: C.lilac, margin: 0, bold: true });
  s.addText("90", { x: 7.7, y: 3.95, w: 0.9, h: 0.62, fontFace: F, fontSize: 30, bold: true, color: C.white, margin: 0, valign: "middle" });
  s.addText("GOLD", { x: 8.62, y: 4.12, w: 0.8, h: 0.24, fontFace: M, fontSize: 8, color: C.lilac, margin: 0 });
  s.addText("Python · FastAPI · SQL", { x: 8.62, y: 4.36, w: 2.4, h: 0.26, fontFace: F, fontSize: 8.5, color: C.muted, margin: 0 });
  s.addText("совпадение с вакансией", { x: 10.28, y: 3.72, w: 1.7, h: 0.24, fontFace: F, fontSize: 7.5, color: C.dim, align: "right", margin: 0 });
  s.addText("94%", { x: 10.3, y: 3.92, w: 1.68, h: 0.36, fontFace: F, fontSize: 17, bold: true, color: C.white, align: "right", margin: 0 });

  hairline(s, 7.72, 4.74, 4.2, "2A2447");
  s.addText("88", { x: 7.72, y: 4.9, w: 0.6, h: 0.24, fontFace: F, fontSize: 10, bold: true, color: "9A91C2", margin: 0 });
  mono(s, "SILVER · TypeScript · React", 8.4, 4.92, 2.5, { size: 7, color: C.dim });
  s.addText("91%", { x: 11.4, y: 4.9, w: 0.6, h: 0.24, fontFace: F, fontSize: 9, color: "9A91C2", align: "right", margin: 0 });

  mono(s, "ed25519 · verified 14.11.2026", 7.72, 5.32, 4.2, { size: 7, color: C.dim });

  s.addText("Статус: проектирование. Прототип расширения — первый результат 90 дней.", {
    x: L, y: 6.5, w: W, h: 0.32, fontFace: F, fontSize: 11, italic: true, color: "D8D1FF", margin: 0,
  });

  src(s, "План из docs/PILOT.md §3. На 2026-11-13 расширения и AI-матчинга в продукте нет — это NEXT, не LIVE.");
  s.addNotes(
    "Это следующий шаг, и я называю его честно: NEXT, девяносто дней. Расширение встраивает проверенный бейдж в hh.kz и LinkedIn. " +
    "AI-матчинг сравнивает 27 публичных полей с требованиями вакансии — не ключевые слова, а доказанные навыки. " +
    "Рекрутер получает пять проверенных кандидатов вместо семидесяти трёх откликов. Сегодня этого нет в проде, поэтому на слайде статус «проектирование».",
  );
}

/* ----------------------------------------------------------- 09 · market */
{
  const s = page("bg_base.png", { eyebrow: "09  ·  РЫНОК", eyebrowRight: "СНИМОК 13.11.2026" });
  title(s, "Рынок уже здесь.\nПроверки — нет.", { h: 1.5, size: 38 });

  panel(s, L, 2.5, 4.5, 3.5, { transparency: 40 });
  mono(s, "TAM  ·  МИР", 1.05, 2.68, 3.4, { size: 8.5, color: C.lilac });
  s.addText("$6,8 млрд", { x: 1.02, y: 2.95, w: 3.8, h: 0.7, fontFace: F, fontSize: 32, bold: true, color: C.white, margin: 0, valign: "middle" });
  s.addText("рынок платформ технической оценки, 2025", { x: 1.05, y: 3.68, w: 3.7, h: 0.6, fontFace: F, fontSize: 11, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
  hairline(s, 1.05, 4.36, 3.9);
  s.addText("$18,4 млрд к 2034", { x: 1.05, y: 4.5, w: 3.7, h: 0.36, fontFace: F, fontSize: 16, bold: true, color: C.lilac, margin: 0 });
  s.addText("CAGR 11,7%", { x: 1.05, y: 4.9, w: 3.7, h: 0.3, fontFace: M, fontSize: 9, color: C.dim, margin: 0 });
  s.addText("Dataintelo, 2025", { x: 1.05, y: 5.55, w: 3.7, h: 0.3, fontFace: M, fontSize: 7.6, color: C.dim, margin: 0 });

  // KZ funnel
  mono(s, "СЕГМЕНТ  ·  КАЗАХСТАН", 5.75, 2.5, 3.4, { size: 8.5, color: C.lilac });
  const funnel = [
    { v: "18 683", l: "IT-компании в Казахстане", d: "+16% за 3 года · МЦРИАП", w: 6.3, c: "2A2447" },
    { v: "4 500", l: "нанимают разработчиков регулярно", d: "допущение: 24% рынка", w: 5.1, c: "3B3367" },
    { v: "30", l: "клиентов за 12 месяцев", d: "0,7% сегмента · план", w: 3.9, c: "4B3F8E" },
  ];
  funnel.forEach((f, i) => {
    const y = 2.82 + i * 1.16;
    s.addShape(pptx.ShapeType.rect, { x: 5.75, y, w: f.w, h: 0.82, fill: { color: f.c }, line: { color: f.c, width: 0 } });
    s.addText(f.v, { x: 5.95, y: y + 0.05, w: 1.7, h: 0.42, fontFace: F, fontSize: 22, bold: true, color: C.white, margin: 0, valign: "middle" });
    s.addText(f.l, { x: 7.62, y: y + 0.06, w: 3.2, h: 0.3, fontFace: F, fontSize: 10.5, color: C.white, margin: 0 });
    mono(s, f.d, 7.62, y + 0.38, 3.3, { size: 7.4, color: C.lilac });
  });

  s.addText("SAM 6,5 млрд ₸/год   ·   SOM 10,4 млн ₸ ARR", {
    x: 5.75, y: 6.28, w: 6.6, h: 0.34, fontFace: F, fontSize: 13, bold: true, color: C.white, margin: 0,
  });

  src(s, "18 683 IT-компании и 673 000 ₸ средняя зарплата — itk.kz / МЦРИАП, 2025. 1 638 вакансий Python — hh.kz, 13.11.2026. TAM — Dataintelo 2025. SAM/SOM — наш расчёт.");
  s.addNotes(
    "Мировой рынок технической оценки — 6,8 миллиарда долларов, к 2034 восемнадцать и четыре. Но нам не нужен весь мир: в Казахстане 18 683 IT-компании, плюс 16% за три года. " +
    "Если 24% из них регулярно нанимают разработчиков, это 4 500 компаний и 6,5 миллиарда тенге в год. Наш план на первый год — 30 клиентов, это 0,7% сегмента и 10,4 миллиона тенге ARR. " +
    "Все допущения подписаны, ни одна цифра не выдаётся за факт.",
  );
}

/* ------------------------------------------------------- 10 · unit economics */
{
  const s = page("bg_base.png", { eyebrow: "10  ·  ЭКОНОМИКА", eyebrowRight: "ПРОГНОЗ, НЕ ФАКТ" });
  title(s, "От 0 ₸ до 10,4 млн ₸ ARR\nза 12 месяцев.", { h: 1.5, size: 38 });

  const prices = [
    ["0 ₸", "кандидат"],
    ["3 000 ₸", "карточка"],
    ["29 000 ₸", "компания / мес"],
    ["149 000 ₸", "буткемп / семестр"],
  ];
  prices.forEach((p, i) => {
    const x = L + i * 1.98;
    s.addText(p[0], { x, y: 2.38, w: 1.8, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.white, margin: 0 });
    s.addText(p[1], { x, y: 2.78, w: 1.8, h: 0.28, fontFace: M, fontSize: 8, color: C.dim, margin: 0, charSpacing: 0.8 });
  });
  hairline(s, L, 3.16, 7.9);

  // custom bar chart
  const baseY = 6.02;
  const maxH = 2.28;
  const vals = [145, 348, 638, 870];
  const labels = ["Q1", "Q2", "Q3", "Q4"];
  const bx = [1.35, 3.05, 4.75, 6.45];
  hairline(s, L, baseY, 7.95);
  vals.forEach((v, i) => {
    const h = (v / 870) * maxH;
    s.addShape(pptx.ShapeType.rect, { x: bx[i], y: baseY - h, w: 1.18, h, fill: { color: i === 3 ? C.violet : "332B5C" }, line: { color: i === 3 ? C.violet : "332B5C", width: 0 } });
    s.addText(`${v}K`, { x: bx[i], y: baseY - h - 0.34, w: 1.18, h: 0.28, fontFace: M, fontSize: 9, color: i === 3 ? C.white : C.muted, align: "center", margin: 0 });
    s.addText(labels[i], { x: bx[i], y: baseY + 0.08, w: 1.18, h: 0.26, fontFace: M, fontSize: 8.5, color: C.dim, align: "center", margin: 0 });
  });
  mono(s, "MRR, ₸ / месяц", L, 6.42, 3.0, { size: 8, color: C.dim });

  // forecast table
  const rows = [
    ["ГОД 1", "30", "10,4 млн ₸"],
    ["ГОД 2", "120", "41,8 млн ₸"],
    ["ГОД 3", "400", "139,2 млн ₸"],
  ];
  s.addText("КЛИЕНТЫ", { x: 9.05, y: 3.4, w: 1.5, h: 0.26, fontFace: M, fontSize: 7.5, color: C.dim, margin: 0, charSpacing: 1 });
  s.addText("ARR", { x: 11.0, y: 3.4, w: 1.4, h: 0.26, fontFace: M, fontSize: 7.5, color: C.dim, margin: 0, charSpacing: 1, align: "right" });
  hairline(s, 9.05, 3.7, 3.36);
  rows.forEach((r, i) => {
    const y = 3.82 + i * 0.82;
    mono(s, r[0], 9.05, y, 1.5, { size: 8, color: C.lilac });
    s.addText(r[1], { x: 10.0, y: y - 0.05, w: 0.9, h: 0.32, fontFace: F, fontSize: 15, bold: true, color: C.white, margin: 0 });
    s.addText(r[2], { x: 10.95, y: y - 0.05, w: 1.5, h: 0.32, fontFace: F, fontSize: 13, bold: true, color: C.white, align: "right", margin: 0 });
    hairline(s, 9.05, y + 0.5, 3.36);
  });
  s.addText("ПРОГНОЗ", { x: 9.05, y: 6.3, w: 1.4, h: 0.24, fontFace: M, fontSize: 8, color: C.lilac, margin: 0, charSpacing: 1.4 });
  s.addText("0,7% → 2,6% → 8,9% проникновения в сегмент 4 500 компаний; ARPU 29 000 ₸; отток 3%/мес.", {
    x: 9.05, y: 6.54, w: 3.45, h: 0.5, fontFace: F, fontSize: 7.6, color: C.dim, margin: 0, lineSpacingMultiple: 1.15,
  });

  src(s, "Цены и маржа — гипотеза оффера (docs/PILOT.md §1, §4): ~3,5 ₸ переменных издержек, ~80% валовой маржи до налогов. Прогноз — модель, не факт: клиентов и выручки на 13.11.2026 нет.");
  s.addNotes(
    "Экономика простая. Кандидат платит ноль. Карточка — три тысячи тенге. Компания — двадцать девять тысяч в месяц. Буткемп — сто сорок девять тысяч за семестр. " +
    "Переменные издержки — около трёх с половиной тенге на карточку, маржа до налогов около восьмидесяти процентов. " +
    "Прогноз: тридцать клиентов и 10,4 миллиона ARR за первый год, сто двадцать и 41,8 за второй, четыреста и 139 за третий. Это модель с подписанными допущениями, а не отчёт о выручке.",
  );
}

/* --------------------------------------------------------- 11 · competitors */
{
  const s = page("bg_base.png", { eyebrow: "11  ·  КОНКУРЕНТЫ", eyebrowRight: "СЛОЙ ДОВЕРИЯ" });
  title(s, "Мы не заменяем ATS.\nМы — слой доверия.", { h: 1.5, size: 38 });

  const cols = ["", "MERILO", "HACKERRANK", "CODILITY", "TESTGORILLA"];
  const xs = [L, 4.35, 6.55, 8.75, 10.85];
  const widths = [3.5, 2.15, 2.15, 2.05, 1.65];
  cols.forEach((c, i) => {
    s.addText(c, { x: xs[i], y: 2.5, w: widths[i], h: 0.3, fontFace: M, fontSize: 8, color: i === 1 ? C.lilac : C.dim, align: i === 0 ? "left" : "center", margin: 0, charSpacing: 1.2 });
  });
  hairline(s, L, 2.86, W);

  const rows = [
    ["Криптоподпись (Ed25519)", "●", "—", "—", "—"],
    ["Проверка офлайн, без аккаунта", "●", "—", "—", "—"],
    ["Один файл вместо платформы", "●", "—", "—", "—"],
    ["27 публичных полей, 0 строк кода", "●", "—", "—", "—"],
    ["Цена без enterprise-контракта", "●", "—", "—", "—"],
    ["AI-матчинг по навыкам", "NEXT", "●", "—", "●"],
  ];
  rows.forEach((r, i) => {
    const y = 3.0 + i * 0.56;
    s.addText(r[0], { x: xs[0], y, w: widths[0], h: 0.42, fontFace: F, fontSize: 12, color: C.white, margin: 0, valign: "middle" });
    for (let j = 1; j < 5; j++) {
      const isNext = r[j] === "NEXT";
      s.addText(r[j], {
        x: xs[j], y, w: widths[j], h: 0.42,
        fontFace: isNext ? M : F, fontSize: isNext ? 8 : 14,
        bold: j === 1 && !isNext, color: j === 1 ? C.lilac : C.dim,
        align: "center", margin: 0, valign: "middle", charSpacing: isNext ? 1 : 0,
      });
    }
    hairline(s, L, y + 0.46, W, "221D3A");
  });

  s.addText("Наши настоящие конкуренты — резюме и созвон. Они бесплатны, поэтому мы обязаны быть быстрее доверия.", {
    x: L, y: 6.42, w: W, h: 0.32, fontFace: F, fontSize: 12, color: C.muted, margin: 0,
  });

  src(s, "Сравнение по публичным продуктовым страницам конкурентов на 13.11.2026. «—» — функция не заявлена в базовом продукте; enterprise-надстройки не учитывались.");
  s.addNotes(
    "Мы не конкурируем с HackerRank за бюджет на ассессменты. Наши конкуренты — резюме и созвон, потому что они бесплатны. " +
    "Наше отличие не в вопросах и не в античите, а в том, что результат — подписанный переносимый файл. Его нельзя подделать, его можно проверить офлайн, " +
    "и он живёт у кандидата, а не в нашем аккаунте. AI-матчинг у нас в статусе NEXT — я это не прячу.",
  );
}

/* ----------------------------------------------------------- 12 · traction */
{
  const s = page("bg_hero.png", { eyebrow: "12  ·  ТРЕКШН", eyebrowRight: "ВОСПРОИЗВОДИМО" });
  title(s, "1 место. 397 тестов.\n0 выдуманных цифр.", { h: 1.5, size: 40 });

  s.addText("1", { x: L, y: 2.5, w: 0.95, h: 1.4, fontFace: F, fontSize: 104, bold: true, color: C.white, margin: 0, valign: "middle" });
  s.addText("место · Case 5 · NFC Shymkent 2026", { x: 1.86, y: 2.85, w: 4.9, h: 0.34, fontFace: F, fontSize: 15.5, bold: true, color: C.lilac, margin: 0 });
  s.addText("Региональный этап. Соло, без команды.", { x: 1.86, y: 3.21, w: 4.6, h: 0.3, fontFace: F, fontSize: 11, color: C.muted, margin: 0 });

  const stats = [
    ["397", "тестов · 22 файла"],
    ["85,30%", "покрытие · 2240 / 2626"],
    ["13", "языков · 2 откалиброваны"],
    ["27", "публичных полей карточки"],
    ["82,97", "мс p50 · verify"],
    ["1.2.0", "health 200 · live"],
  ];
  stats.forEach((st, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const x = 6.9 + col * 1.93;
    const y = 2.55 + row * 1.72;
    s.addText(st[0], { x, y, w: 1.8, h: 0.62, fontFace: F, fontSize: 30, bold: true, color: C.white, margin: 0, valign: "middle" });
    s.addText(st[1], { x, y: y + 0.64, w: 1.8, h: 0.5, fontFace: F, fontSize: 9, color: C.muted, margin: 0, lineSpacingMultiple: 1.1 });
  });

  hairline(s, 6.9, 6.02, 5.6);
  s.addText("Всё воспроизводится: pytest --cov=backend · scripts/bench.py --mode all", {
    x: 6.9, y: 6.14, w: 5.6, h: 0.3, fontFace: M, fontSize: 8, color: C.dim, margin: 0,
  });

  s.addText("Пилоты и выручка — впереди. Поэтому они в разделе «план», а не здесь.", {
    x: L, y: 6.55, w: 6.2, h: 0.5, fontFace: F, fontSize: 10.5, italic: true, color: C.dim, margin: 0, lineSpacingMultiple: 1.15,
  });

  src(s, "Замеры 2026-11-13: pytest --cov=backend · scripts/bench.py --mode all · GET /api/health. CI: Python 3.11 / 3.12, ruff, порог покрытия 80%.");
  s.addNotes(
    "Единственный слайд, где я прошу верить не словам, а командам. Первое место в кейсе на региональном этапе — соло. " +
    "397 тестов, покрытие 85,3%, 13 языков, 27 публичных полей, verify 82,97 миллисекунды, живой health 200 версии 1.2.0. " +
    "Пилотов и выручки пока нет — поэтому они на слайде плана, а не здесь. Это принципиально: трекшн — только то, что можно перепроверить.",
  );
}

/* ------------------------------------------------------------ 13 · roadmap */
{
  const s = page("bg_section.png", { eyebrow: "13  ·  РОАДМАП", eyebrowRight: "GO / NO-GO", eyebrowColor: C.white });
  title(s, "90 дней. 6 месяцев.\n12 месяцев.", { h: 1.5, size: 40 });

  const cols = [
    { h: "90 ДНЕЙ", items: ["5 интервью по 20 минут", "1 бесплатный пилот + baseline", "Chrome-расширение: alpha", "3 платящих клиента"] },
    { h: "6 МЕСЯЦЕВ", items: ["30 клиентов · 870K ₸ MRR", "AI-матчинг: beta", "Интеграция с hh.kz", "500 карточек в месяц"] },
    { h: "12 МЕСЯЦЕВ", items: ["120 клиентов · 3,5 млн ₸ MRR", "Буткемпы: 8 за семестр", "Публичный API карточки", "Выход на UZ и KG"] },
  ];
  cols.forEach((c, i) => {
    const x = L + i * 4.02;
    s.addShape(pptx.ShapeType.ellipse, { x, y: 2.72, w: 0.14, h: 0.14, fill: { color: C.white }, line: { color: C.white, width: 0 } });
    hairline(s, x + 0.18, 2.79, 3.55, "8A7FC4");
    s.addText(c.h, { x, y: 2.98, w: 3.6, h: 0.4, fontFace: M, fontSize: 11, color: C.white, margin: 0, charSpacing: 2 });
    c.items.forEach((it, j) => {
      s.addText(`—  ${it}`, { x, y: 3.52 + j * 0.6, w: 3.55, h: 0.5, fontFace: F, fontSize: 12.5, color: "E6E1FF", margin: 0, lineSpacingMultiple: 1.1 });
    });
  });

  panel(s, L, 6.02, W, 0.72, { fill: "000000", transparency: 55 });
  s.addText("GO / NO-GO: если меньше 3 из 5 интервью подтвердят боль — перепозиционируем продукт в учебный инструмент.", {
    x: L + 0.22, y: 6.02, w: W - 0.44, h: 0.72, fontFace: F, fontSize: 11.5, color: C.white, margin: 0, valign: "middle",
  });

  src(s, "Источник: docs/PILOT.md §3, docs/INTERVIEWS.md. На 13.11.2026 интервью не проведены, пилотов нет — это план.");
  s.addNotes(
    "Роадмап честный. Девяносто дней — валидация: пять интервью, один бесплатный пилот, альфа расширения и три платящих клиента. " +
    "Шесть месяцев — тридцать клиентов, бета AI-матчинга и интеграция с hh.kz. Двенадцать — сто двадцать клиентов, буткемпы, API и выход на Узбекистан и Кыргызстан. " +
    "И стоп-правило: если меньше трёх интервью из пяти подтвердят боль, мы не продаём, а перепозиционируем продукт в учебный инструмент. Это записано заранее, чтобы потом не придумывать оправдания.",
  );
}

/* --------------------------------------------------------- 14 · team + ask */
{
  const s = page("bg_hero.png", { eyebrow: "14  ·  КОМАНДА", eyebrowRight: "MERILO FOUND" });
  title(s, "Двое.\nОдин уже выиграл этот кейс.", { h: 1.5, size: 38 });

  const team = [
    ["МАРАТ", "Product & Backend", "1 место, Case 5, NFC Shymkent 2026 — соло. Backend, криптография, тесты."],
    ["РАХА", "Product, Frontend & UX", "Свой продукт fibo-web. Продуктовая стратегия, интерфейс, расширение."],
  ];
  team.forEach((t, i) => {
    const y = 2.62 + i * 1.45;
    mono(s, t[0], L, y, 2.0, { size: 9, color: C.lilac });
    s.addText(t[1], { x: L, y: y + 0.24, w: 3.5, h: 0.32, fontFace: F, fontSize: 15, bold: true, color: C.white, margin: 0 });
    s.addText(t[2], { x: L, y: y + 0.58, w: 5.0, h: 0.66, fontFace: F, fontSize: 10.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.15 });
  });

  panel(s, 6.75, 2.45, 5.7, 3.6, { transparency: 30, fill: "0A0814" });
  mono(s, "ЗАПРОС", 7.0, 2.62, 2.0, { size: 8.5, color: C.lilac });
  s.addText("3–5 пилотов", { x: 7.0, y: 2.85, w: 5.0, h: 0.44, fontFace: F, fontSize: 24, bold: true, color: C.white, margin: 0 });
  s.addText("5 интервью по 20 минут · доступ к реальному найму", { x: 7.0, y: 3.3, w: 5.1, h: 0.3, fontFace: F, fontSize: 11, color: C.muted, margin: 0 });
  hairline(s, 7.0, 3.72, 5.1);
  s.addText("Не деньги. Проверка.", { x: 7.0, y: 3.86, w: 4.4, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.lilac, margin: 0 });
  s.addText("Пилот бесплатный: 5 карточек и созвон до и после. Нам нужен baseline времени тимлида.", {
    x: 7.0, y: 4.32, w: 5.1, h: 0.62, fontFace: F, fontSize: 10.5, color: C.muted, margin: 0, lineSpacingMultiple: 1.15,
  });

  s.addShape(pptx.ShapeType.rect, { x: 11.17, y: 4.8, w: 1.1, h: 1.1, fill: { color: "FFFFFF" }, line: { color: "FFFFFF", width: 0 } });
  s.addImage({ path: path.join(ASSETS, "qr_demo.png"), x: 11.22, y: 4.85, w: 1.0, h: 1.0 });
  mono(s, "merilo-nfc.fly.dev", 7.0, 5.2, 3.4, { size: 11, color: C.white });
  mono(s, "наведите камеру · демо без регистрации", 7.0, 5.52, 3.6, { size: 7.2, color: C.dim });

  s.addText("Мы не просим поверить. Мы просим проверить.", {
    x: L, y: 6.42, w: W, h: 0.4, fontFace: F, fontSize: 17, bold: true, color: C.white, margin: 0,
  });

  src(s, "Статус 2026-11-13: пилотов, клиентов и выручки нет; 5 интервью запланированы. Цены — docs/PILOT.md §1. Доказательства — docs/EVIDENCE.md.");
  s.addNotes(
    "Нас двое. Я отвечаю за продукт, бэкенд и криптографию, и я выиграл этот кейс на региональном этапе соло. Раха — продукт, фронтенд и UX, у него свой продукт fibo-web. " +
    "Просим не деньги, а доступ к реальному найму: три-пять компаний на бесплатный пилот и пять интервью по двадцать минут. Пилот — пять карточек и созвон до и после, нам нужен baseline времени тимлида. " +
    "Демо открыто без регистрации. Всё, что вы видели, лежит в репозитории с командами проверки. Готов к вопросам.",
  );
}

/* ------------------------------------------------------------------ write */
const meta = pptx.writeFile({ fileName: OUT });
console.log("wrote", OUT);
await meta;