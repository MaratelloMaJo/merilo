/* Merilo side panel. Everything here is user-initiated: the panel reads the active tab's
   address, and asks the Merilo server (not third parties) for evidence only after a click. */
"use strict";
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const EXT = typeof chrome !== "undefined" && !!(chrome.tabs && chrome.storage);
const DEFAULT_WS = "http://127.0.0.1:8000";
const RESERVED = new Set(["orgs", "settings", "marketplace", "explore", "topics", "features", "login", "notifications", "pulls", "issues", "search", "sponsors", "about", "pricing", "enterprise", "collections", "trending", "new", "codespaces", "apps", "organizations"]);
const TECH = ["TypeScript", "JavaScript", "React", "Next.js", "Vue", "Angular", "Svelte", "Node.js", "Python", "FastAPI", "Django", "Flask", "Go", "Rust", "Java", "Kotlin", "Spring", "C#", ".NET", "PHP", "Laravel", "Ruby", "Rails", "Swift", "PostgreSQL", "MongoDB", "Redis", "Docker", "Kubernetes", "GraphQL", "Tailwind", "AWS", "Terraform"];
const SYN = { testing: ["pytest", "jest / vitest"], "ci/cd": ["ci/cd"], "node.js": ["node.js / express"], postgres: ["postgresql"] };

const state = { ws: DEFAULT_WS, tab: null, kind: "none", login: null, repo: null, job: null, result: null, seq: 0 };

/* ---------- environment (extension, or a plain page with ?url= for development) ---------- */
const store = {
  async get(keys) { return EXT ? chrome.storage.local.get(keys) : Object.fromEntries(keys.map((k) => [k, localStorage.getItem("merilo." + k)])); },
  async set(obj) { if (EXT) return chrome.storage.local.set(obj); Object.entries(obj).forEach(([k, v]) => localStorage.setItem("merilo." + k, v)); },
};
async function activeTab() {
  if (EXT) { const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }); return tab || null; }
  const url = new URLSearchParams(location.search).get("url");
  return url ? { id: 0, url, title: url.replace(/^https?:\/\//, "") } : null;
}
function openUrl(url, sameTab) {
  if (!EXT) return window.open(url, "_blank", "noopener");
  if (sameTab && state.tab) return chrome.tabs.update(state.tab.id, { url });
  return chrome.tabs.create({ url });
}

async function api(path, opts = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeout || 60000);
  try {
    const res = await fetch(state.ws + path, { method: opts.method || "GET", headers: opts.body ? { "Content-Type": "application/json" } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, signal: ctrl.signal, cache: "no-store" });
    let data = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) throw new Error((data && typeof data.detail === "string" && data.detail) || `Сервер Merilo ответил ${res.status}`);
    return data;
  } catch (err) {
    throw err.name === "AbortError" ? new Error("Сервер Merilo не ответил вовремя") : err instanceof TypeError ? new Error("Нет связи с сервером Merilo") : err;
  } finally { clearTimeout(timer); }
}

function classify(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "github.com") {
      const [login, repo] = u.pathname.split("/").filter(Boolean);
      if (login && !RESERVED.has(login.toLowerCase())) return { kind: repo ? "repo" : "profile", login, repo: repo || null };
      return { kind: "none" };
    }
    if (/(^|\.)linkedin\.com$/.test(u.hostname)) return { kind: "linkedin" };
    if (u.protocol === "https:" || u.protocol === "http:") return { kind: "page" };
  } catch { /* not a URL */ }
  return { kind: "none" };
}

const KIND = {
  repo: { label: "GitHub · репозиторий", action: "Найти доказательства в коде", hint: "Merilo прочитает ключевые файлы репозитория и покажет навыки со ссылками на строки." },
  profile: { label: "GitHub · профиль", action: "Построить Developer DNA", hint: "Коммиты, тесты, архитектура и командная работа — по публичным данным профиля." },
  linkedin: { label: "LinkedIn · только адрес", action: "Подготовить к сохранению", hint: "Содержимое LinkedIn не читается. В Merilo попадёт только адрес профиля." },
  page: { label: "Сайт или портфолио", action: "Прочитать страницу", hint: "Будут прочитаны заголовок, упомянутые технологии и ссылки на GitHub." },
  none: { label: "Нет страницы для анализа", action: "Анализировать", hint: "Откройте профиль или репозиторий на GitHub. На других сайтах нажмите значок Merilo на нужной вкладке, чтобы панель её увидела." },
};

/* ---------- rendering ---------- */
async function init() {
  const seq = ++state.seq;
  const stored = await store.get(["ws"]);
  state.ws = (stored.ws || DEFAULT_WS).replace(/\/$/, "");
  $("wsUrl").value = state.ws;
  state.tab = await activeTab();
  Object.assign(state, { login: null, repo: null, result: null }, classify((state.tab && state.tab.url) || ""));
  if (seq !== state.seq) return;
  const k = KIND[state.kind];
  $("kind").textContent = k.label;
  $("pageTitle").textContent = state.kind === "repo" ? `${state.login}/${state.repo}` : state.kind === "profile" ? "@" + state.login : (state.tab && state.tab.title) || "—";
  $("pageUrl").textContent = (state.tab && state.tab.url) || "";
  $("analyze").textContent = k.action;
  $("analyze").disabled = state.kind === "none" || (state.kind === "page" && !EXT);
  $("hint").textContent = k.hint;
  $("out").innerHTML = "";
  $("after").hidden = true;
  $("saveState").textContent = "";
  connect(seq);
}

async function connect(seq) {
  const el = $("conn");
  try {
    await api("/api/health", { timeout: 4000 });
    if (seq !== state.seq) return;
    el.className = "conn ok"; el.lastChild.textContent = "Подключено";
    state.job = await api("/api/workspace/active-job", { timeout: 4000 }).catch(() => null);
  } catch {
    if (seq !== state.seq) return;
    el.className = "conn bad"; el.lastChild.textContent = "Нет связи";
    state.job = null;
  }
  drawJob();
}

function drawJob(found) {
  const j = state.job, box = $("jobBox");
  if (!j || !j.title) { box.hidden = true; return; }
  box.hidden = false;
  $("jobTitle").textContent = j.title;
  $("jobLink").href = state.ws + "/app#/jobs";
  const reqs = [...(j.required || []), ...(j.preferred || [])];
  $("jobReqs").innerHTML = reqs.map((r) => `<span class="chip ${found ? (found.has(r) ? "ok" : "") : ""}">${esc(r)}</span>`).join("");
  $("jobSummary").textContent = found ? `Подтверждено кодом: ${reqs.filter((r) => found.has(r)).length} из ${reqs.length}. Остальное можно проверить заданием в Merilo.` : "";
}

function matchReqs(skills) {
  const j = state.job;
  if (!j || !j.title) return null;
  const have = skills.map((s) => s.toLowerCase());
  const hit = (req) => { const r = req.toLowerCase(), alts = [r, ...(SYN[r] || [])]; return have.some((s) => alts.includes(s) || s.split(/[ /]+/).includes(r)); };
  return new Set([...(j.required || []), ...(j.preferred || [])].filter(hit));
}

function busy(text) { $("out").innerHTML = `<div class="sec"><div><span class="spin"></span>${esc(text)}</div></div>`; }
function fail(err) { $("out").innerHTML = `<div class="sec"><div class="err">${esc(err.message || err)}</div><div class="muted">Проверьте, что сервер Merilo запущен, и повторите.</div></div>`; }

async function analyzeRepo() {
  busy("Читаю ключевые файлы репозитория…");
  const d = await api(`/api/github/repos/${encodeURIComponent(state.login)}/${encodeURIComponent(state.repo)}/proofs`, { timeout: 90000 });
  const skills = [...d.proofs.map((p) => p.skill), ...(d.languages || [])];
  $("out").innerHTML = `${d.notice ? `<div class="sec"><div class="err">${esc(d.notice)}</div></div>` : ""}<div class="sec"><div class="sec-h">Доказательства в коде<span>${d.proofs.length} навыков · ${d.files_analyzed.length} из ${d.files_total} файлов</span></div>
      ${d.proofs.map((p) => `<div class="proof"><div class="proof-h">${esc(p.skill)}<span class="lvl" title="${esc(p.confidence.reason)}">уверенность: ${p.confidence.level === "medium" ? "средняя" : "низкая"}</span></div>
        ${p.sources.slice(0, 2).map((s) => `<button class="src" data-url="${esc(s.url)}" title="Открыть строку на GitHub"><b>${esc(s.path)}:${s.line}</b><code>${esc(s.snippet)}</code></button>`).join("")}</div>`).join("") || '<div class="muted">В изученных файлах известных паттернов не найдено.</div>'}</div>
    ${d.not_found.length ? `<div class="sec"><div class="sec-h">Недостаточно данных</div><div class="chips">${d.not_found.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div><div class="muted">Это не отрицательный вывод о разработчике — только отсутствие доказательства в изученных файлах.</div></div>` : ""}`;
  document.querySelectorAll(".src").forEach((b) => (b.onclick = () => openUrl(b.dataset.url, true)));
  drawJob(matchReqs(skills));
  state.result = { login: state.login, url: `https://github.com/${state.login}`, title: state.login, source: "github", skills: [...new Set(skills)].slice(0, 12), job: state.job && state.job.title,
    evidence: d.proofs.slice(0, 12).map((p) => ({ skill: p.skill, detail: `${p.sources[0].path}:${p.sources[0].line} — ${p.sources[0].snippet}`, url: p.sources[0].url, repo: d.repo })) };
  state.openPath = `/app#/github/${state.login}/${state.repo}`;
}

async function analyzeProfile() {
  busy("Собираю Developer DNA: репозитории, коммиты, pull request'ы…");
  const d = await api(`/api/github/users/${encodeURIComponent(state.login)}/dna`, { timeout: 90000 });
  const langs = Object.keys(d.languages || {});
  $("out").innerHTML = `<div class="sec"><div class="sec-h">Developer DNA<span>${d.commit_sample} коммитов в выборке</span></div>
      ${d.dimensions.map((x) => `<div class="dim"><b>${esc(x.title)}</b><span class="lv">${esc(x.level_label)}</span><span class="bar"><i data-w="${x.value}" style="width:0"></i></span>${x.facts[0] ? `<span class="fact">${esc(x.facts[0].text)}</span>` : x.missing ? `<span class="fact">${esc(x.missing)}</span>` : ""}</div>`).join("")}
      <div class="muted">Сила публичных сигналов, а не оценка человека. Модель не вызывалась.</div></div>
    ${langs.length ? `<div class="sec"><div class="sec-h">Языки<span>по числу репозиториев</span></div><div class="chips">${Object.entries(d.languages).slice(0, 8).map(([l, n]) => `<span class="chip">${esc(l)} ${n}</span>`).join("")}</div></div>` : ""}`;
  requestAnimationFrame(() => document.querySelectorAll(".bar i").forEach((b) => (b.style.width = b.dataset.w + "%")));
  const extra = [];
  const dim = (k) => d.dimensions.find((x) => x.key === k) || { level: 0, facts: [] };
  if (dim("testing").level > 0) extra.push("Testing");
  drawJob(matchReqs([...langs, ...extra]));
  state.result = { login: state.login, url: d.profile.url || `https://github.com/${state.login}`, title: d.profile.name || state.login, source: "github", skills: langs.slice(0, 8), job: state.job && state.job.title,
    evidence: d.dimensions.flatMap((x) => x.facts.filter((f) => f.url).slice(0, 1).map((f) => ({ skill: x.title, detail: f.text, url: f.url }))) };
  state.openPath = `/app#/dna/${state.login}`;
}

async function analyzePage() {
  busy("Читаю страницу…");
  const [{ result }] = await chrome.scripting.executeScript({
    target: { tabId: state.tab.id },
    func: (tech) => {
      const text = (document.body ? document.body.innerText : "").slice(0, 60000);
      const found = tech.filter((t) => new RegExp("(^|[^A-Za-z])" + t.replace(/[.+#]/g, "\\$&") + "([^A-Za-z]|$)", "i").test(text));
      const gh = [...document.querySelectorAll('a[href*="github.com/"]')].map((a) => a.href).filter((h) => /^https:\/\/github\.com\/[\w-]+\/?$/.test(h));
      return { title: document.title, tech: found, github: [...new Set(gh)].slice(0, 3) };
    },
    args: [TECH],
  });
  const login = result.github[0] ? result.github[0].split("/")[3] : null;
  $("out").innerHTML = `<div class="sec"><div class="sec-h">Упомянутые технологии</div><div class="chips">${result.tech.map((t) => `<span class="chip">${esc(t)}</span>`).join("") || '<span class="muted">Не найдено</span>'}</div>
    <div class="muted">Упоминание на сайте — не доказательство. ${login ? `Найден GitHub @${esc(login)} — в Merilo можно построить его Developer DNA.` : "Ссылки на GitHub-профиль нет."}</div></div>`;
  state.result = { login, url: state.tab.url, title: result.title, source: "page", skills: result.tech.slice(0, 12), evidence: [], job: state.job && state.job.title };
  state.openPath = login ? `/app#/dna/${login}` : "/app#/candidates";
}

function analyzeLinkedin() {
  $("out").innerHTML = `<div class="sec"><div class="sec-h">LinkedIn</div><div class="muted">Merilo не читает содержимое LinkedIn и не делает выводов о профиле. В рабочее пространство будет сохранён только адрес с пометкой источника.</div></div>`;
  state.result = { login: null, url: state.tab.url.split("?")[0], title: state.tab.title || "LinkedIn", source: "linkedin", skills: [], evidence: [] };
  state.openPath = "/app#/candidates";
}

async function analyze() {
  const seq = state.seq;
  $("analyze").disabled = true;
  try {
    if (state.kind === "repo") await analyzeRepo();
    else if (state.kind === "profile") await analyzeProfile();
    else if (state.kind === "linkedin") analyzeLinkedin();
    else if (state.kind === "page") await analyzePage();
    if (seq !== state.seq) return;
    $("after").hidden = false;
    $("save").disabled = false;
  } catch (err) { if (seq === state.seq) fail(err); }
  if (seq === state.seq) $("analyze").disabled = false;
}

async function ensureHost() {
  if (!EXT || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(state.ws)) return true;
  return chrome.permissions.request({ origins: [new URL(state.ws).origin + "/*"] });
}

$("analyze").onclick = analyze;
$("save").onclick = async () => {
  if (!state.result) return;
  $("save").disabled = true;
  try {
    if (!(await ensureHost())) throw new Error("Нет разрешения на адрес рабочего пространства");
    await api("/api/extension/inbox", { method: "POST", body: state.result });
    $("saveState").textContent = "Сохранено. Кандидат появится в открытом рабочем пространстве Merilo через несколько секунд.";
  } catch (err) { $("saveState").textContent = "Не сохранено: " + err.message; $("save").disabled = false; }
};
$("open").onclick = () => openUrl(state.ws + (state.openPath || "/app"));
$("settingsBtn").onclick = () => { const s = $("settings"); s.hidden = !s.hidden; $("settingsBtn").setAttribute("aria-expanded", String(!s.hidden)); };
$("saveSettings").onclick = async () => {
  const v = $("wsUrl").value.trim().replace(/\/$/, "") || DEFAULT_WS;
  try { new URL(v); } catch { return; }
  await store.set({ ws: v });
  $("settings").hidden = true;
  init();
};

// The panel stays open while the recruiter browses: follow the active tab.
if (EXT) {
  chrome.tabs.onActivated.addListener(() => init());
  chrome.tabs.onUpdated.addListener((tabId, info, tab) => { if (info.status === "complete" && tab.active && (!state.tab || tab.url !== state.tab.url)) init(); });
}
init();
