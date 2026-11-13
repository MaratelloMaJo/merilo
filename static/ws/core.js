/* Merilo Workspace — core: store, API adapters, router, shell, command palette, Copilot. */
(function () {
  "use strict";
  const M = (window.M = { pages: {}, ctx: {} });

  /* ---------- DOM helpers ---------- */
  const esc = (M.esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
  M.$ = (sel, root = document) => root.querySelector(sel);
  M.$$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  M.h = (html) => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  M.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  M.uid = (p = "id") => p + "_" + Math.random().toString(36).slice(2, 9);
  M.initials = (n) => String(n || "?").replace(/\(.*?\)/g, "").trim().split(/[\s-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  M.ago = (ts) => {
    if (!ts) return "—";
    const t = typeof ts === "number" ? (ts < 1e12 ? ts * 1000 : ts) : Date.parse(ts);
    const d = (Date.now() - t) / 1000;
    if (d < 60) return "только что";
    if (d < 3600) return Math.floor(d / 60) + " мин назад";
    if (d < 86400) return Math.floor(d / 3600) + " ч назад";
    if (d < 86400 * 30) return Math.floor(d / 86400) + " дн назад";
    return new Date(t).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
  };
  M.date = (ts) => new Date(typeof ts === "number" && ts < 1e12 ? ts * 1000 : ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });

  /* ---------- Icons (Lucide geometry, 24px grid) ---------- */
  const I = {
    home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
    radar: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 19 5"/><circle cx="12" cy="12" r="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M2 13h20"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    git: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="8" r="3"/><path d="M6 9v6M18 11c0 4-6 3-9.5 5.5"/>',
    columns: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/>',
    chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
    sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4M5 17v4M3 19h4"/>',
    puzzle: '<path d="M19.4 14.9c.3-.3.6-.4 1-.4a2 2 0 1 0 0-4c-.4 0-.7-.1-1-.4L18 8.7V6a2 2 0 0 0-2-2h-2.7l-1.4-1.4a1.4 1.4 0 0 0-2 0L8.5 4H6a2 2 0 0 0-2 2v2.5l-1.4 1.4a1.4 1.4 0 0 0 0 2L4 13.3V16a2 2 0 0 0 2 2h2.7l1.4 1.4a2 2 0 1 0 3.2 0L14.7 18H16a2 2 0 0 0 2-2v-.3z"/>',
    badge: '<path d="M12 2 4 5v6c0 5 3.4 9.3 8 11 4.6-1.7 8-6 8-11V5z"/><path d="m9 12 2 2 4-4"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    plug: '<path d="M12 22v-5M9 8V2M15 8V2M18 8v5a6 6 0 0 1-12 0V8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
    panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>',
    chevR: '<path d="m9 18 6-6-6-6"/>', chevD: '<path d="m6 9 6 6 6-6"/>', chevUD: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>', arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
    ext: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    bookmark: '<path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>', terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    play: '<path d="m6 3 14 9-14 9z"/>', clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9"/>', copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    trash: '<path d="M3 6h18M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/>', lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12"/><circle cx="12" cy="12" r="3"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>', more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>', link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>', keyboard: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 15h10"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  };
  M.icon = (n, cls = "") => `<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${I[n] || I.info}</svg>`;

  /* ---------- Store (localStorage, versioned) ---------- */
  const KEY = "merilo.ws.v1";
  const defaults = () => ({
    demo: true, theme: null, collapsed: false, activeJob: "demo-job-fe",
    candidates: {}, jobs: {}, searches: {}, notes: {}, review: {}, hidden: {},
    events: [], chat: [], savedSearches: [], recent: [], split: {},
    notifications: [{ id: "n1", text: "Добро пожаловать в рабочее пространство Merilo", ts: Date.now(), read: false }],
  });
  let S;
  try { S = Object.assign(defaults(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch { S = defaults(); }
  M.S = S;
  M.save = M.debounce(() => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* quota/private */ } }, 150);
  M.track = (type, data = {}) => { S.events.push({ type, ts: Date.now(), ...data }); if (S.events.length > 2000) S.events.splice(0, 500); M.save(); };
  M.resetData = () => { localStorage.removeItem(KEY); location.reload(); };

  /* Candidates/jobs: real (stored) + demo (when demo mode on). Demo overrides live in S.review/S.notes. */
  M.allCandidates = () => {
    const real = Object.values(S.candidates);
    const demo = S.demo ? MeriloDemo.candidates.filter((c) => !S.hidden[c.id]) : [];
    return [...real, ...demo].map((c) => ({ ...c, review: S.review[c.id] || c.review || "new" }));
  };
  M.candidate = (id) => M.allCandidates().find((c) => c.id === id) || (S.demo ? null : MeriloDemo.candidates.find((c) => c.id === id));
  M.allJobs = () => [...Object.values(S.jobs), ...(S.demo ? MeriloDemo.jobs : [])];
  M.job = (id) => M.allJobs().find((j) => j.id === id);
  M.activeJob = () => M.job(S.activeJob) || M.allJobs()[0] || null;

  /* ---------- API layer (typed-ish adapters; production endpoints only) ---------- */
  async function req(method, url, body) {
    const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    let data = null;
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
      const detail = data && (typeof data.detail === "string" ? data.detail : data.detail?.[0]?.msg || data.error || data.message);
      const err = new Error(detail || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  M.api = {
    health: () => req("GET", "/api/health"),
    integrations: () => req("GET", "/api/integrations/status"),
    tasks: () => req("GET", "/api/tasks"),
    task: (id) => req("GET", `/api/tasks/${encodeURIComponent(id)}`),
    createTask: (p) => req("POST", "/api/tasks", p),
    recentCards: (n = 50) => req("GET", `/api/cards/recent?limit=${n}`),
    card: (h) => req("GET", `/api/cards/${encodeURIComponent(h)}`),
    manifest: (h) => req("GET", `/api/cards/${encodeURIComponent(h)}/manifest`),
    verify: (p) => req("POST", "/api/submissions/verify", p),
    parseQuery: (q, fast) => req("POST", "/api/ai/parse-query", { query: q, fast: !!fast }),
    dna: (login) => req("GET", `/api/github/users/${encodeURIComponent(login)}/dna`),
    adaptive: (p) => req("POST", "/api/ai/adaptive-challenge", p),
    putMeta: (id, p) => req("PUT", `/api/challenges/${encodeURIComponent(id)}/meta`, p),
    getMeta: (id) => req("GET", `/api/challenges/${encodeURIComponent(id)}/meta`),
    review: (p) => req("POST", "/api/ai/challenge-review", p),
    getReview: (hash) => req("GET", `/api/challenges/review/${encodeURIComponent(hash)}`),
    putActiveJob: (p) => req("PUT", "/api/workspace/active-job", p),
    inbox: () => req("GET", "/api/extension/inbox"),
    inboxRemove: (id) => req("DELETE", `/api/extension/inbox/${encodeURIComponent(id)}`),
    async agentStream(payload, onEvent) {
      const res = await fetch("/api/agent/talent-search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok || !res.body) { let d = null; try { d = await res.json(); } catch {} const e = new Error((d && d.detail) || `HTTP ${res.status}`); e.status = res.status; throw e; }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) { const line = p.trim(); if (line.startsWith("data:")) onEvent(JSON.parse(line.slice(5))); }
      }
    },
    copilot: (p) => req("POST", "/api/ai/copilot", p),
    challengeDraft: (p) => req("POST", "/api/ai/challenge-draft", p),
    ghUser: (login) => (login.startsWith("demo-") ? Promise.resolve(MeriloDemo.githubFixture(login) || Promise.reject(Object.assign(new Error("Демо-профиль не найден"), { status: 404 }))) : req("GET", `/api/github/users/${encodeURIComponent(login)}`)),
    ghRepo: (owner, repo) => req("GET", `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`),
    ghProofs: (owner, repo) => req("GET", `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/proofs`),
    ghFile: (owner, repo, path, ref) => req("GET", `/api/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/file?path=${encodeURIComponent(path)}${ref ? "&ref=" + encodeURIComponent(ref) : ""}`),
    aiUsage: () => req("GET", "/api/ai/usage"),
    async copilotStream(payload, onDelta) {
      const res = await fetch("/api/ai/copilot/stream", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok || !res.body) { const e = new Error(`HTTP ${res.status}`); e.status = res.status; throw e; }
      const reader = res.body.getReader(), dec = new TextDecoder();
      let buf = "", text = "", model = null;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop();
        for (const p of parts) {
          const line = p.trim();
          if (!line.startsWith("data:")) continue;
          const msg = JSON.parse(line.slice(5));
          if (msg.error) throw new Error(msg.error);
          if (msg.model) model = msg.model;
          if (msg.delta) { text += msg.delta; onDelta(text); }
        }
      }
      return { text, model };
    },
    talentSearch: (p) => req("POST", "/api/github/talent-search", p),
  };
  M.cache = {};
  M.cached = async (key, fn, ttl = 60000) => {
    const c = M.cache[key];
    if (c && Date.now() - c.t < ttl) return c.v;
    const v = await fn();
    M.cache[key] = { t: Date.now(), v };
    return v;
  };

  /* ---------- Theme ---------- */
  M.applyTheme = () => {
    const forced = new URLSearchParams(location.search).get("theme");
    const t = forced === "dark" || forced === "light"
      ? forced
      : (S.theme || (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"));
    document.documentElement.dataset.theme = t;
  };
  M.toggleTheme = () => { S.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; M.save(); M.applyTheme(); M.rerender(); };
  M.applyTheme();

  /* ---------- Toasts / dialogs / menus / tooltips ---------- */
  M.toast = (text, opts = {}) => {
    let box = M.$(".toasts");
    if (!box) { box = M.h('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(box); }
    const el = M.h(`<div class="toast">${M.icon(opts.icon || (opts.error ? "alert" : "check"), "sm")}<span>${esc(text)}</span></div>`);
    if (opts.error) el.querySelector("svg").style.color = "var(--danger)";
    else el.querySelector("svg").style.color = "var(--success)";
    if (opts.action) {
      const b = M.h(`<button class="btn sm">${esc(opts.action.label)}</button>`);
      b.onclick = () => { opts.action.run(); el.remove(); };
      el.appendChild(b);
    }
    box.appendChild(el);
    setTimeout(() => el.remove(), opts.ms || 4200);
  };

  let lastFocus = null;
  M.dialog = ({ title, body, actions = [], wide = false, onMount }) => {
    lastFocus = document.activeElement;
    const scrim = M.h('<div class="scrim"></div>');
    const dlg = M.h(`<div class="dialog ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="dialog-head row"><h2 class="h2">${esc(title)}</h2><span class="spacer"></span><button class="icon-btn" data-close aria-label="Закрыть">${M.icon("x")}</button></div>
      <div class="dialog-body"></div><div class="dialog-foot"></div></div>`);
    const bodyEl = dlg.querySelector(".dialog-body");
    if (typeof body === "string") bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
    const close = () => { scrim.remove(); dlg.remove(); document.removeEventListener("keydown", onKey, true); lastFocus?.focus?.(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); close(); }
      if (e.key === "Tab") {
        const f = M.$$("button, input, textarea, select, a[href]", dlg).filter((x) => !x.disabled);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    actions.forEach((a) => {
      const b = M.h(`<button class="btn ${a.primary ? "primary" : ""} ${a.danger ? "danger" : ""}">${esc(a.label)}</button>`);
      b.onclick = async () => { if ((await a.run?.(dlg)) !== false) close(); };
      dlg.querySelector(".dialog-foot").appendChild(b);
    });
    if (!actions.length) dlg.querySelector(".dialog-foot").remove();
    scrim.onclick = close;
    dlg.querySelector("[data-close]").onclick = close;
    document.addEventListener("keydown", onKey, true);
    document.body.append(scrim, dlg);
    onMount?.(dlg, close);
    (dlg.querySelector("input, textarea, select") || dlg.querySelector(".dialog-foot .primary") || dlg.querySelector("[data-close]"))?.focus();
    return { el: dlg, close };
  };
  M.confirm = (title, text, label = "Подтвердить", danger = false) =>
    new Promise((resolve) => {
      let ok = false;
      const d = M.dialog({ title, body: `<p class="muted" style="margin:0">${text}</p>`, actions: [{ label: "Отмена" }, { label, primary: !danger, danger, run: () => { ok = true; } }] });
      const obs = new MutationObserver(() => { if (!d.el.isConnected) { obs.disconnect(); resolve(ok); } });
      obs.observe(document.body, { childList: true });
    });

  M.menu = (x, y, items) => {
    M.$(".menu")?.remove();
    const m = M.h('<div class="menu" role="menu"></div>');
    items.forEach((it) => {
      if (it === "-") return m.appendChild(M.h('<div class="sep"></div>'));
      const b = M.h(`<button role="menuitem">${M.icon(it.icon || "arrowR", "sm")}${esc(it.label)}</button>`);
      if (it.danger) b.style.color = "var(--danger)";
      b.onclick = () => { m.remove(); it.run(); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    const r = m.getBoundingClientRect();
    m.style.left = Math.min(x, innerWidth - r.width - 8) + "px";
    m.style.top = Math.min(y, innerHeight - r.height - 8) + "px";
    m.querySelector("button")?.focus();
    m.addEventListener("keydown", (e) => {
      const bs = M.$$("button", m), i = bs.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
      if (e.key === "Escape") m.remove();
    });
    setTimeout(() => document.addEventListener("click", () => m.remove(), { once: true }), 0);
  };

  let tipEl;
  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest?.("[data-tip]");
    if (!t) return;
    const app = M.$(".app");
    if (t.closest(".sidebar") && !app?.classList.contains("collapsed")) return;
    tipEl?.remove();
    tipEl = M.h(`<div class="tooltip">${esc(t.dataset.tip)}</div>`);
    document.body.appendChild(tipEl);
    const r = t.getBoundingClientRect(), tr = tipEl.getBoundingClientRect();
    const side = t.closest(".sidebar");
    tipEl.style.left = (side ? r.right + 8 : Math.min(Math.max(8, r.left + r.width / 2 - tr.width / 2), innerWidth - tr.width - 8)) + "px";
    tipEl.style.top = (side ? r.top + r.height / 2 - tr.height / 2 : r.bottom + 6) + "px";
    t.addEventListener("mouseleave", () => tipEl?.remove(), { once: true });
  });

  /* ---------- Shared UI pieces ---------- */
  M.ui = {
    demoBadge: (on = true) => (on ? '<span class="badge-demo" title="Вымышленные демонстрационные данные">Demo</span>' : ""),
    liveBadge: (txt = "Live") => `<span class="badge-live">${esc(txt)}</span>`,
    avatar: (c, cls = "") => (c?.avatar ? `<img class="avatar ${cls}" src="${esc(c.avatar)}" alt="">` : `<span class="avatar ${cls}">${esc(M.initials(c?.name || c?.login))}</span>`),
    empty: (icon, title, text, action = "") => `<div class="empty"><div class="ic">${M.icon(icon)}</div><h3>${esc(title)}</h3><p>${text}</p>${action}</div>`,
    loading: (rows = 4) => `<div class="stack" style="padding:16px">${Array.from({ length: rows }, (_, i) => `<div class="skel" style="height:14px;width:${90 - i * 12}%"></div>`).join("")}</div>`,
    error: (err, retry) => `<div class="banner bad">${M.icon("alert")}<div><b>Не удалось загрузить данные.</b> <span class="muted">${esc(err?.message || err)}</span>${retry ? ` <button class="btn sm" data-retry style="margin-left:6px">Повторить</button>` : ""}</div></div>`,
    review: (r) => ({ new: '<span class="status"><i></i>Новый</span>', shortlisted: '<span class="status accent"><i></i>Шорт-лист</span>', "on-hold": '<span class="status warn"><i></i>На паузе</span>', "not-now": '<span class="status bad"><i></i>Не сейчас</span>', invited: '<span class="status ok"><i></i>Приглашён</span>' }[r] || '<span class="status"><i></i>Новый</span>'),
    assess: (a) => {
      const s = a?.status || "none";
      if (s === "completed") return `<span class="status ok"><i></i>${a.score != null ? `<span class="num">${a.score}</span>` : "Готово"}${a.demo ? " · demo" : ""}</span>`;
      return { none: '<span class="faint">—</span>', invited: '<span class="status"><i></i>Приглашён</span>', "in-progress": '<span class="status warn"><i></i>Выполняет</span>' }[s] || esc(s);
    },
    chips: (arr, cls = "") => (arr || []).map((s) => `<span class="chip ${cls}">${esc(s)}</span>`).join(""),
  };
  M.REVIEW = [["new", "Новый"], ["shortlisted", "Шорт-лист"], ["on-hold", "На паузе"], ["not-now", "Не сейчас"]];
  M.setReview = (ids, status) => {
    const prev = ids.map((id) => [id, S.review[id]]);
    ids.forEach((id) => (S.review[id] = status));
    M.save(); M.track("review", { status, n: ids.length });
    M.toast(`Статус обновлён: ${ids.length}`, { action: { label: "Отменить", run: () => { prev.forEach(([id, v]) => (v ? (S.review[id] = v) : delete S.review[id])); M.save(); M.rerender(); } } });
    M.rerender();
  };
  M.saveCandidate = (c) => {
    const id = c.id || "gh-" + c.login;
    S.candidates[id] = { ...c, id, addedAt: c.addedAt || Date.now() };
    M.save(); M.track("candidate_saved", { id });
    return id;
  };
  M.removeCandidates = (ids) => {
    const backup = ids.map((id) => [id, S.candidates[id], S.hidden[id]]);
    ids.forEach((id) => { if (S.candidates[id]) delete S.candidates[id]; else S.hidden[id] = true; });
    M.save(); M.rerender();
    M.toast(`Удалено из рабочего пространства: ${ids.length}`, { action: { label: "Отменить", run: () => { backup.forEach(([id, c, h]) => { if (c) S.candidates[id] = c; if (!h) delete S.hidden[id]; }); M.save(); M.rerender(); } } });
  };

  /* ---------- Navigation model ---------- */
  M.NAV_RECRUITER = [
    ["Рабочее пространство", [["dashboard", "Обзор", "home"], ["talent-hunter", "Talent Hunter", "radar"], ["candidates", "Кандидаты", "users"], ["jobs", "Вакансии", "briefcase"], ["assessments", "Задания", "clipboard"]]],
    ["Аналитика кода", [["github", "GitHub Intelligence", "git"], ["matching", "Matching Lab", "columns"], ["analytics", "Аналитика", "chart"]]],
    ["Инструменты", [["copilot", "AI Copilot", "sparkles"], ["extension", "Расширение", "puzzle"], ["verified", "Verified Skills", "badge"]]],
    ["Система", [["settings", "Настройки", "settings"], ["integrations", "Интеграции", "plug"]]],
  ];
  M.NAV_CANDIDATE = [
    ["Моё пространство", [["dashboard", "Обзор", "home"], ["my-cards", "Мои карточки", "badge"], ["tasks", "Задания", "clipboard"], ["profile", "Профиль", "users"]]],
    ["Инструменты", [["copilot", "AI Copilot", "sparkles"]]],
    ["Система", [["settings", "Настройки", "settings"]]],
  ];
  M.NAV = M.NAV_RECRUITER;
  M.TITLES = Object.fromEntries(M.NAV.flatMap(([, items]) => items.map(([k, t]) => [k, t])));
  M.go = (path) => { if (location.hash === "#/" + path) M.render(); else location.hash = "#/" + path; };

  /* ---------- Identity & role ---------- */
  M.user = null;
  M.role = "candidate";

  M.loadUser = async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "same-origin" });
      if (res.ok) {
        M.user = await res.json();
      }
    } catch (e) { /* offline / static preview */ }

    if (!M.user) {
      M.user = {
        id: "demo-candidate",
        full_name: "Демо-кандидат",
        email: "demo@merilo.local",
        role: "candidate",
        secondary_role: null,
        demo: true,
      };
    }

    const primary = M.user.role === "recruiter" || M.user.role === "owner" ? "recruiter" : "candidate";
    const allowed = [primary, M.user.secondary_role].filter(Boolean);
    let desired = null;
    try { desired = localStorage.getItem("merilo.ws.role"); } catch (e) {}
    M.role = allowed.includes(desired) ? desired : primary;
    return M.user;
  };

  M.applyRole = () => {
    M.NAV = M.role === "candidate" ? M.NAV_CANDIDATE : M.NAV_RECRUITER;
    M.TITLES = Object.fromEntries(M.NAV.flatMap(([, items]) => items.map(([k, t]) => [k, t])));
  };

  M.setRole = (role) => {
    const allowed = [M.user?.role, M.user?.secondary_role].filter(Boolean);
    if (!allowed.includes(role)) return;
    M.role = role;
    try { localStorage.setItem("merilo.ws.role", role); } catch (e) {}
    M.applyRole();
    shell();
    M.go("dashboard");
  };

  M.canSwitchRole = () => Boolean(M.user?.secondary_role && M.user.secondary_role !== M.user.role);

  /* ---------- Shell ---------- */
  function shell() {
    const nav = M.NAV.map(([group, items]) => `<div class="nav-group"><div class="nav-group-title">${group}</div>${items
      .map(([k, t, ic]) => `<a class="nav-item" href="#/${k}" data-nav="${k}" data-tip="${t}">${M.icon(ic)}<span class="nav-label">${t}</span><span class="count" data-count="${k}"></span></a>`).join("")}</div>`).join("");
    document.body.innerHTML = `
    <a href="#main" class="sr-only">К содержимому</a>
    <div class="app ${S.collapsed ? "collapsed" : ""}">
      <aside class="sidebar" aria-label="Навигация">
        <div class="org">
          <button class="org-btn" id="orgBtn" aria-haspopup="menu"><span class="logo">M</span><span class="org-name">Merilo · ${M.role === "candidate" ? "Кандидат" : "Рекрутинг"}</span>${M.icon("chevUD", "sm chev faint")}</button>
          <button class="icon-btn hide-sm" id="collapseBtn" data-tip="Свернуть  [" aria-label="Свернуть боковую панель">${M.icon("panel")}</button>
        </div>
        <nav class="nav">${nav}</nav>
        <div class="side-foot"><a class="nav-item" href="/" data-tip="Публичная страница Merilo">${M.icon("ext")}<span class="nav-label">Публичный сайт</span></a></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <button class="icon-btn mobile-only" id="mnav" aria-label="Меню">${M.icon("menu")}</button>
          <div class="crumbs" id="crumbs"></div>
          <div class="top-actions">
            <span id="modeBadge"></span>
            <button class="search-trigger" id="cmdBtn" aria-label="Командная палитра">${M.icon("search", "sm")}<span class="lbl">Поиск и команды</span><kbd>Ctrl K</kbd></button>
            <button class="icon-btn" id="quickBtn" data-tip="Быстрое действие" aria-label="Быстрое действие">${M.icon("plus")}</button>
            <button class="icon-btn" id="notifBtn" data-tip="Уведомления" aria-label="Уведомления">${M.icon("bell")}<span class="pip" hidden></span></button>
            <button class="icon-btn" id="copilotBtn" data-tip="AI Copilot  ." aria-label="Открыть Copilot">${M.icon("sparkles")}</button>
            <button class="icon-btn" id="userBtn" aria-label="Меню пользователя"><span class="avatar" style="width:22px;height:22px;font-size:10px">${esc(M.initials(M.user?.full_name || "Merilo"))}</span></button>
          </div>
        </header>
        <main class="content" id="main" tabindex="-1"></main>
      </div>
      <aside class="copilot" aria-label="AI Copilot"><div class="copilot-inner" id="copilot"></div></aside>
    </div>`;
    M.$("#collapseBtn").onclick = () => { S.collapsed = !S.collapsed; M.save(); M.$(".app").classList.toggle("collapsed", S.collapsed); };
    M.$("#mnav").onclick = () => M.$(".app").classList.toggle("nav-open");
    M.$(".nav").addEventListener("click", () => M.$(".app").classList.remove("nav-open"));
    M.$("#cmdBtn").onclick = () => M.palette();
    M.$("#copilotBtn").onclick = () => M.copilot.toggle();
    M.$("#quickBtn").onclick = (e) => { const r = e.currentTarget.getBoundingClientRect(); M.menu(r.left - 150, r.bottom + 6, quickActions()); };
    M.$("#notifBtn").onclick = (e) => notifications(e.currentTarget);
    M.$("#userBtn").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const items = [
        { label: `${M.user?.full_name || "Гость"} · ${M.user?.email || ""}`, icon: "users", run: () => {} },
        { label: document.documentElement.dataset.theme === "dark" ? "Светлая тема" : "Тёмная тема", icon: "sun", run: M.toggleTheme },
        { label: S.demo ? "Выключить демо-данные" : "Включить демо-данные", icon: "eye", run: () => M.setDemo(!S.demo) },
        { label: "Горячие клавиши", icon: "keyboard", run: shortcuts },
        { label: "Настройки", icon: "settings", run: () => M.go("settings") },
      ];
      if (M.canSwitchRole()) {
        items.splice(1, 0, {
          label: M.role === "candidate" ? "Переключиться на HR" : "Переключиться на кандидата",
          icon: "users",
          run: () => M.setRole(M.role === "candidate" ? "recruiter" : "candidate"),
        });
      }
      if (M.role === "candidate" && !M.user?.demo) {
        items.push({ label: "Мой публичный профиль", icon: "ext", run: () => window.open("/p/" + (M.user.profile_slug || ""), "_blank") });
      }
      if (!M.user?.demo) {
        items.push({
          label: "Выйти",
          icon: "logout",
          run: async () => {
            try { await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }); } catch (err) {}
            try { localStorage.removeItem("merilo_auth_token"); } catch (err) {}
            location.href = "/";
          },
        });
      }
      M.menu(r.right - 220, r.bottom + 6, items);
    };
    M.$("#orgBtn").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      M.menu(r.left, r.bottom + 4, [
        { label: "Merilo · Рекрутинг (текущее)", icon: "check", run: () => {} },
        { label: "Создать рабочее пространство…", icon: "plus", run: () => M.toast("Несколько организаций требуют серверных аккаунтов — пока доступно одно локальное пространство", { icon: "info" }) },
      ]);
    };
    M.copilot.mount();
  }
  const quickActions = () => [
    { label: "Новый поиск талантов", icon: "radar", run: () => M.go("talent-hunter") },
    { label: "Разобрать GitHub-профиль", icon: "git", run: () => M.go("github") },
    { label: "Создать Skill Challenge", icon: "clipboard", run: () => M.go("assessments/new") },
    { label: "Новая вакансия", icon: "briefcase", run: () => M.pages.jobs.create() },
  ];
  function notifications(btn) {
    const r = btn.getBoundingClientRect();
    S.notifications.forEach((n) => (n.read = true));
    M.save(); updateBadges();
    const items = S.notifications.slice(-6).reverse().map((n) => ({ label: `${n.text} · ${M.ago(n.ts)}`, icon: "bell", run: () => n.href && M.go(n.href) }));
    M.menu(r.right - 320, r.bottom + 6, items.length ? items : [{ label: "Нет уведомлений", icon: "check", run: () => {} }]);
  }
  M.notify = (text, href) => { S.notifications.push({ id: M.uid("n"), text, href, ts: Date.now(), read: false }); M.save(); updateBadges(); };
  function updateBadges() {
    const pip = M.$("#notifBtn .pip");
    if (pip) pip.hidden = !S.notifications.some((n) => !n.read);
    const counts = { candidates: M.allCandidates().length, jobs: M.allJobs().length };
    M.$$("[data-count]").forEach((el) => (el.textContent = counts[el.dataset.count] || ""));
    const mb = M.$("#modeBadge");
    if (mb) mb.innerHTML = S.demo ? `<button class="badge-demo hide-sm" style="border:0;cursor:pointer" data-tip="Показаны вымышленные демо-данные. Нажмите, чтобы выключить">Demo Mode</button>` : "";
    mb?.querySelector("button")?.addEventListener("click", () => M.setDemo(false));
  }
  M.setDemo = (on) => { S.demo = on; M.save(); M.toast(on ? "Демо-данные включены — они помечены DEMO" : "Демо-данные скрыты: показываются только реальные данные", { icon: "info" }); M.rerender(); };

  /* ---------- Router ---------- */
  const ROUTES = [
    [/^dashboard$/, "dashboard"], [/^my-cards$/, "my-cards"], [/^tasks$/, "tasks"], [/^profile$/, "profile"],
    [/^talent-hunter$/, "hunter"], [/^talent-hunter\/searches\/([\w-]+)$/, "search"],
    [/^candidates$/, "candidates"], [/^candidates\/([\w.-]+)$/, "candidate"], [/^jobs$/, "jobs"], [/^jobs\/([\w-]+)$/, "job"],
    [/^dna\/([\w-]+)$/, "dna"], [/^github$/, "github"], [/^github\/([\w-]+)$/, "github"], [/^github\/([\w-]+)\/([\w.-]+)$/, "repo"],
    [/^matching$/, "matching"], [/^assessments$/, "assessments"], [/^assessments\/new$/, "challengeNew"], [/^assessments\/([\w-]+)$/, "assessment"],
    [/^challenge\/([\w-]+)$/, "challenge"], [/^verified$/, "verifiedList"], [/^verified\/([\w-]+)$/, "verified"],
    [/^analytics$/, "analytics"], [/^extension$/, "extension"], [/^settings$/, "settings"], [/^integrations$/, "integrations"], [/^copilot$/, "copilotPage"],
  ];
  M.query = () => Object.fromEntries(new URLSearchParams(location.hash.split("?")[1] || ""));
  M.crumbs = (parts) => {
    M.$("#crumbs").innerHTML = parts.map((p, i) => (i < parts.length - 1 ? `<a href="#/${p[1]}">${esc(p[0])}</a><span class="sep">/</span>` : `<span class="cur">${esc(p[0])}</span>`)).join("");
    document.title = parts[parts.length - 1][0] + " · Merilo";
  };
  M.render = () => {
    const path = (location.hash.replace(/^#\/?/, "").split("?")[0] || "dashboard").replace(/\/$/, "");
    let page = null, args = [];
    for (const [rx, name] of ROUTES) { const m = path.match(rx); if (m) { page = name; args = m.slice(1); break; } }
    // The same route names resolve to different pages by role: the candidate
    // side never sees recruiter screens and vice versa.
    if (M.role === "candidate") {
      const candidatePages = {
        dashboard: "candidateDashboard",
        "my-cards": "candidateCards",
        tasks: "candidateTasks",
        profile: "candidateProfile",
      };
      if (candidatePages[page]) page = candidatePages[page];
    }
    const main = M.$("#main");
    M.ctx = { page: page || "404", path };
    M.$$(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.nav === path.split("/")[0] || (a.dataset.nav === "verified" && path.startsWith("verified"))));
    if (page === "copilotPage") { M.copilot.open(); history.replaceState(null, "", "#/dashboard"); return M.render(); }
    main.innerHTML = "";
    main.scrollTop = 0;
    const fn = M.pages[page];
    if (!fn) {
      M.crumbs([["Не найдено", path]]);
      main.innerHTML = `<div class="page">${M.ui.empty("alert", "Страница не найдена", "Такого раздела нет.", '<a class="btn" href="#/dashboard">На обзор</a>')}</div>`;
      return;
    }
    try { (fn.render || fn)(main, ...args); } catch (err) { console.error(err); main.innerHTML = `<div class="page">${M.ui.error(err)}</div>`; }
    updateBadges();
    M.copilot.refreshContext();
  };
  M.rerender = () => M.render();
  window.addEventListener("hashchange", () => { M.$(".menu")?.remove(); M.render(); });

  /* ---------- Command palette ---------- */
  M.palette = () => {
    if (M.$(".palette")) return;
    const scrim = M.h('<div class="scrim" style="background:var(--scrim)"></div>');
    const pal = M.h('<div class="palette" role="dialog" aria-label="Командная палитра"><input placeholder="Перейти, найти кандидата, выполнить действие…" aria-label="Команда" role="combobox" aria-expanded="true" aria-controls="palList"><div class="pal-list" id="palList" role="listbox"></div></div>');
    document.body.append(scrim, pal);
    const input = pal.querySelector("input"), list = pal.querySelector(".pal-list");
    const close = () => { scrim.remove(); pal.remove(); };
    scrim.onclick = close;
    const base = () => [
      ...M.NAV.flatMap(([, items]) => items.map(([k, t, ic]) => ({ g: "Навигация", label: t, icon: ic, run: () => (k === "copilot" ? M.copilot.open() : M.go(k)) }))),
      ...quickActions().map((a) => ({ ...a, g: "Действия" })),
      { g: "Действия", label: "Переключить тему", icon: "sun", run: M.toggleTheme, hint: "" },
      { g: "Действия", label: S.demo ? "Скрыть демо-данные" : "Показать демо-данные", icon: "eye", run: () => M.setDemo(!S.demo) },
      { g: "Действия", label: "Горячие клавиши", icon: "keyboard", run: shortcuts, hint: "?" },
      ...M.allCandidates().map((c) => ({ g: "Кандидаты", label: c.name || c.login, sub: (c.skills || c.matched || []).slice(0, 3).join(", "), icon: "users", run: () => M.go("candidates/" + c.id), demo: c.demo })),
      ...M.allJobs().map((j) => ({ g: "Вакансии", label: j.title, icon: "briefcase", run: () => M.go("jobs/" + j.id), demo: j.demo })),
      ...Object.values(S.searches).slice(-8).map((s) => ({ g: "Поиски", label: s.query.slice(0, 70), icon: "radar", run: () => M.go("talent-hunter/searches/" + s.id) })),
    ];
    let items = [], idx = 0;
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      items = base().filter((it) => !q || (it.label + " " + (it.sub || "") + " " + it.g).toLowerCase().includes(q));
      if (q.length > 1 && /^[a-z0-9-]{2,39}$/i.test(q)) items.push({ g: "GitHub", label: `Разобрать GitHub-профиль «${q}»`, icon: "git", run: () => M.go("github/" + q) });
      if (q.length > 3) items.push({ g: "AI", label: `Спросить Copilot: «${input.value.trim()}»`, icon: "sparkles", run: () => { M.copilot.open(); M.copilot.ask(input.value.trim()); } });
      idx = Math.min(idx, Math.max(0, items.length - 1));
      let g = "";
      list.innerHTML = items.slice(0, 60).map((it, i) => {
        const head = it.g !== g ? `<div class="pal-group">${(g = it.g)}</div>` : "";
        return `${head}<div class="pal-item ${i === idx ? "on" : ""}" role="option" aria-selected="${i === idx}" data-i="${i}">${M.icon(it.icon, "sm")}<span>${esc(it.label)}</span>${it.sub ? `<span class="faint small">${esc(it.sub)}</span>` : ""}${it.demo ? M.ui.demoBadge() : ""}<span class="hint">${it.hint || ""}</span></div>`;
      }).join("") || `<div class="empty" style="padding:24px">Ничего не найдено</div>`;
      list.querySelector(".on")?.scrollIntoView({ block: "nearest" });
    };
    list.onclick = (e) => { const el = e.target.closest(".pal-item"); if (el) { close(); items[+el.dataset.i].run(); } };
    list.onmousemove = (e) => { const el = e.target.closest(".pal-item"); if (el && +el.dataset.i !== idx) { idx = +el.dataset.i; draw(); } };
    input.oninput = () => { idx = 0; draw(); };
    input.onkeydown = (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); draw(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); idx = Math.max(0, idx - 1); draw(); }
      else if (e.key === "Enter") { e.preventDefault(); const it = items[idx]; close(); it?.run(); }
      else if (e.key === "Escape") close();
    };
    draw();
    input.focus();
  };

  function shortcuts() {
    const rows = [["Ctrl/⌘ K", "Командная палитра"], [".", "Открыть/закрыть Copilot"], ["[", "Свернуть боковую панель"], ["g → o / h / c / j / a / i / m", "Обзор / Hunter / Кандидаты / Вакансии / Задания / GitHub / Matching"], ["j / k", "Следующая / предыдущая строка в таблицах"], ["x", "Выбрать строку"], ["Enter", "Открыть строку"], ["/", "Фокус на фильтре"], ["?", "Эта справка"]];
    M.dialog({ title: "Горячие клавиши", body: `<div class="stack tight">${rows.map(([k, v]) => `<div class="row"><span class="muted">${v}</span><span class="spacer"></span><kbd>${k}</kbd></div>`).join("")}</div>` });
  }

  /* ---------- Global keyboard ---------- */
  let gPending = false;
  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); M.palette(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || M.$(".dialog, .palette")) return;
    if (gPending) {
      gPending = false;
      const map = { o: "dashboard", h: "talent-hunter", c: "candidates", j: "jobs", a: "assessments", i: "github", m: "matching", n: "analytics", s: "settings" };
      if (map[e.key]) { e.preventDefault(); M.go(map[e.key]); }
      return;
    }
    if (e.key === "g") { gPending = true; setTimeout(() => (gPending = false), 900); return; }
    if (e.key === ".") { e.preventDefault(); M.copilot.toggle(); }
    if (e.key === "[") { e.preventDefault(); M.$("#collapseBtn").click(); }
    if (e.key === "?") { e.preventDefault(); shortcuts(); }
    if (e.key === "/") { const f = M.$("[data-filter]"); if (f) { e.preventDefault(); f.focus(); } }
    M.keyHandler?.(e);
  });

  /* ---------- Minimal, safe markdown for Copilot replies ---------- */
  M.md = (src) => {
    const lines = esc(src).split("\n");
    let html = "", list = null;
    const inline = (s) => s
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|#\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/(^|\s)(https:\/\/github\.com\/[\w.\/-]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>')
      .replace(/(^|\s)@(demo-[\w-]+|[A-Za-z0-9][\w-]{1,38})\b/g, '$1<a href="#/github/$2">@$2</a>');
    for (const raw of lines) {
      const l = raw.trimEnd();
      const ul = l.match(/^\s*[-*•]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        const tag = ul ? "ul" : "ol";
        if (list !== tag) { if (list) html += `</${list}>`; html += `<${tag}>`; list = tag; }
        html += `<li>${inline((ul || ol)[1])}</li>`;
        continue;
      }
      if (list) { html += `</${list}>`; list = null; }
      if (/^#{1,4}\s/.test(l)) html += `<p><strong>${inline(l.replace(/^#+\s/, ""))}</strong></p>`;
      else if (l.trim()) html += `<p>${inline(l)}</p>`;
    }
    if (list) html += `</${list}>`;
    return html;
  };

  /* ---------- Copilot panel ---------- */
  const SUGGEST = {
    dashboard: ["Что требует моего внимания сегодня?", "Какие навыки чаще всего не подтверждены?"],
    hunter: ["Как сформулировать запрос точнее?", "Какие источники доказательств самые надёжные?"],
    search: ["Кратко сравни найденных кандидатов", "У кого сильнее доказательства по TypeScript?"],
    candidates: ["Кого из шорт-листа стоит пригласить на задачу?", "Какие доказательства чаще всего отсутствуют?"],
    candidate: ["Кратко опиши публичные репозитории кандидата", "Каких доказательств не хватает?", "Составь черновик приглашения на задачу"],
    github: ["Что можно и нельзя заключить из этого профиля?", "Какие навыки подтверждены кодом?"],
    repo: ["Оцени инженерные практики в репозитории", "Какую задачу дать, чтобы закрыть пробелы?"],
    matching: ["Сравни кандидатов по каждому критерию", "Где больше всего пробелов в доказательствах?"],
    assessment: ["Объясни результаты по рубрике", "Сравни результаты кандидатов"],
    challengeNew: ["Предложи задачу для проверки навыков бэкенд-API"],
    analytics: ["Где воронка теряет больше всего кандидатов?"],
    job: ["Каких доказательств требовать для этой вакансии?", "Найди разработчиков под эту вакансию"],
  };
  M.copilot = {
    mount() { this.el = M.$("#copilot"); this.draw(); },
    isOpen: () => M.$(".app")?.classList.contains("copilot-open"),
    open() { M.$(".app").classList.add("copilot-open"); M.$("#copilotBtn").classList.add("on"); setTimeout(() => M.$("#cpText")?.focus(), 200); },
    close() { M.$(".app").classList.remove("copilot-open"); M.$("#copilotBtn").classList.remove("on"); },
    toggle() { this.isOpen() ? this.close() : this.open(); },
    busy: false,
    draw() {
      this.el.innerHTML = `
        <div class="cp-head">${M.icon("sparkles")}<b>Copilot</b><span class="spacer"></span>
          <button class="icon-btn" id="cpClear" data-tip="Очистить историю" aria-label="Очистить историю">${M.icon("trash", "sm")}</button>
          <button class="icon-btn" id="cpClose" aria-label="Закрыть Copilot">${M.icon("x")}</button></div>
        <div class="cp-ctx" id="cpCtx"></div>
        <div class="cp-log" id="cpLog" aria-live="polite"></div>
        <div class="cp-suggest" id="cpSuggest"></div>
        <div class="cp-input"><div class="box"><textarea id="cpText" rows="1" placeholder="Спросите о кандидате, вакансии или доказательствах…" aria-label="Сообщение Copilot"></textarea>
          <div class="bar"><span class="faint xs">Видит только контекст текущей страницы</span><span class="spacer"></span><button class="btn sm primary icon" id="cpSend" aria-label="Отправить">${M.icon("arrowUp", "sm")}</button></div></div></div>`;
      M.$("#cpClose").onclick = () => this.close();
      M.$("#cpClear").onclick = () => { S.chat = []; M.save(); this.drawLog(); };
      const ta = M.$("#cpText");
      ta.oninput = () => { ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; };
      ta.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.ask(ta.value); } if (e.key === "Escape") this.close(); };
      M.$("#cpSend").onclick = () => this.ask(ta.value);
      this.drawLog();
    },
    refreshContext() {
      const c = M.$("#cpCtx");
      if (!c) return;
      const label = M.ctx.label || M.TITLES[M.ctx.path?.split("/")[0]] || "Обзор";
      c.innerHTML = `${M.icon("eye", "xs")} Контекст: <span class="chip">${esc(label)}</span>${M.ctx.demo ? M.ui.demoBadge() : ""}`;
      const sug = SUGGEST[M.ctx.page] || SUGGEST.dashboard;
      M.$("#cpSuggest").innerHTML = sug.map((s) => `<button type="button">${esc(s)}</button>`).join("");
      M.$$("#cpSuggest button").forEach((b) => (b.onclick = () => this.ask(b.textContent)));
    },
    drawLog() {
      const log = M.$("#cpLog");
      if (!S.chat.length) {
        log.innerHTML = `<div class="empty" style="padding:24px 8px"><div class="ic">${M.icon("sparkles")}</div><h3>Copilot рекрутера</h3><p class="small">Отвечает на основе данных открытой страницы, ссылается на источники и не выполняет действия без вашего подтверждения.</p></div>`;
        return;
      }
      log.innerHTML = S.chat.map((m) => (m.role === "user"
        ? `<div class="msg user"><div class="bubble">${esc(m.content)}</div></div>`
        : (() => {
            const follow = [];
            const body = m.error ? "" : m.content.split("\n").filter((l) => { const f = l.match(/^\s*→\s*(.+)/); if (f) { follow.push(f[1].trim()); return false; } return true; }).join("\n");
            return `<div class="msg ai"><div class="who">${M.icon("sparkles", "xs")} Copilot ${m.mode === "openai" ? `· ${esc(m.model || "OpenAI")}` : ""}${m.ctx ? ` · ${esc(m.ctx)}` : ""}</div><div class="body">${m.error ? `<div class="banner ${m.mode === "unavailable" ? "warn" : "bad"}">${M.icon("alert")}<span>${esc(m.content)}</span></div>` : M.md(body)}</div>
              ${follow.length ? `<div class="row wrap">${follow.slice(0, 2).map((f) => `<button class="btn sm" data-follow="${esc(f)}">${M.icon("arrowR", "xs")}${esc(f.slice(0, 70))}</button>`).join("")}</div>` : ""}</div>`;
          })())).join("");
      log.querySelectorAll("[data-follow]").forEach((b) => (b.onclick = () => this.ask(b.dataset.follow)));
      log.scrollTop = log.scrollHeight;
    },
    async ask(text) {
      text = (text || "").trim();
      if (!text || this.busy) return;
      this.open();
      const ta = M.$("#cpText");
      ta.value = ""; ta.style.height = "auto";
      const history = S.chat.filter((m) => !m.error).slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 5000) }));
      S.chat.push({ role: "user", content: text });
      this.drawLog();
      this.busy = true;
      const log = M.$("#cpLog");
      const status = M.h(`<div class="tool-status"><span class="spin"></span>Читаю контекст страницы «${esc(M.ctx.label || M.ctx.page)}» → запрос к OpenAI…</div>`);
      log.appendChild(status);
      log.scrollTop = log.scrollHeight;
      const context = { page: M.ctx.page, label: M.ctx.label, demo_data_on_page: !!M.ctx.demo, data: M.ctx.data || null, active_job: M.activeJob() && { title: M.activeJob().title, required: M.activeJob().required, preferred: M.activeJob().preferred } };
      try {
        let live = null;
        const out = await M.api.copilotStream({ message: text, context, history }, (partial) => {
          if (!live) { status.remove(); live = M.h(`<div class="msg ai"><div class="who">${M.icon("sparkles", "xs")} Copilot · печатает…</div><div class="body"></div></div>`); log.appendChild(live); }
          live.querySelector(".body").innerHTML = M.md(partial);
          log.scrollTop = log.scrollHeight;
        });
        S.chat.push({ role: "assistant", content: out.text || "(пустой ответ)", mode: "openai", model: out.model, ctx: M.ctx.label });
        M.track("copilot_ask");
      } catch (err) {
        S.chat.push({ role: "assistant", content: `Copilot не ответил: ${err.message}. Ничего не было выполнено.`, error: true });
      } finally {
        this.busy = false;
        if (S.chat.length > 60) S.chat.splice(0, S.chat.length - 60);
        M.save();
        this.drawLog();
      }
    },
  };

  /* ---------- Boot ---------- */
  M.boot = async () => {
    await M.loadUser();
    M.applyRole();
    shell();
    if (!location.hash) history.replaceState(null, "", "#/dashboard");
    M.render();
  };
})();
