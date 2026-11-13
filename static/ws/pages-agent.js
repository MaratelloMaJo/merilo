/* Merilo Workspace — Autonomous Talent Agent, Developer DNA, Adaptive Skill Challenge,
   Matching Lab, server-side analytics and the extension bridge. Loaded after pages-intel.js. */
(function () {
  "use strict";
  const { esc, ui, S, api } = M;
  const icon = M.icon;
  const LANGS = [["python", "Python"], ["javascript", "JavaScript"], ["typescript", "TypeScript"], ["java", "Java"], ["go", "Go"], ["csharp", "C#"], ["kotlin", "Kotlin"], ["rust", "Rust"], ["cpp", "C++"], ["php", "PHP"], ["ruby", "Ruby"], ["swift", "Swift"]];
  const langKey = (l) => (LANGS.find(([k, n]) => n.toLowerCase() === String(l || "").toLowerCase() || k === String(l || "").toLowerCase()) || [])[0];
  const num = (n) => Number(n || 0).toLocaleString("ru-RU");
  const plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; return a > 10 && a < 20 ? many : b === 1 ? one : b >= 2 && b <= 4 ? few : many; };

  /* ======================================================================
     Talent Hunter — composer
     ====================================================================== */
  const EXAMPLES = [
    "Найди 5 Python-разработчиков с FastAPI, PostgreSQL и опытом реальных проектов",
    "3 frontend-разработчика: React, TypeScript, тесты и CI в собственных проектах",
    "Go developers with Kubernetes and Docker, production-like services",
  ];

  M.pages.hunter = (main) => {
    M.crumbs([["Talent Hunter", "talent-hunter"]]);
    M.ctx.label = "Talent Hunter";
    const H = M.hunter;
    const q = M.query();
    if (q.q && q.q !== H.query) Object.assign(H, { query: q.q, criteria: null, mode: null, edited: false });
    M.ctx.data = { draft_query: H.query, criteria: H.criteria };
    const runs = Object.values(S.searches).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    main.innerHTML = `<div class="page" style="max-width:940px">
      <div class="page-head"><div><h1 class="h1">Talent Hunter</h1><div class="lead">Опишите, кого ищете. Агент составит поисковые запросы, проверит код найденных разработчиков и объяснит, почему каждый попал в список.</div></div></div>
      <div class="composer">
        <textarea id="hq" placeholder="Например: 5 Python-разработчиков с FastAPI, PostgreSQL и опытом реальных проектов" aria-label="Запрос агенту">${esc(H.query)}</textarea>
        <div id="crit"></div>
        <div class="composer-foot"><span class="faint small" id="parseState"></span><span class="spacer"></span>
          <button class="btn" id="aiParse" data-tip="Один вызов модели: точнее выделит технологии и условия">${icon("sparkles", "sm")}Уточнить с AI</button>
          <button class="btn primary" id="runBtn">${icon("play", "sm")}Запустить агента</button></div>
      </div>
      <p class="faint small" style="margin:10px 2px 0">Источник — публичный GitHub через официальный API. LinkedIn не используется: нет авторизованной интеграции.</p>
      <div style="margin-top:28px" class="grid g2">
        <div><div class="eyebrow" style="margin-bottom:8px">Примеры</div><div class="stack tight">${EXAMPLES.map((e, i) => `<button class="example" data-ex="${i}">${esc(e)}</button>`).join("")}</div></div>
        <div><div class="eyebrow" style="margin-bottom:8px">Недавние запуски</div><div class="card">${runs.length ? runs.map((s) => `<a class="list-row link" href="#/talent-hunter/searches/${s.id}">${icon(S.savedSearches.some((x) => x.id === s.id) ? "bookmark" : "clock", "sm faint")}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.query)}</span><span class="spacer"></span><span class="faint xs">${s.status === "done" ? (s.results || []).length + " в списке" : s.status === "error" ? "ошибка" : "идёт"}</span></a>`).join("") : ui.empty("radar", "Запусков ещё не было", "Результаты и ход работы агента сохраняются здесь.")}</div></div>
      </div></div>`;
    const ta = M.$("#hq"), state = M.$("#parseState");
    const setState = () => {
      state.innerHTML = H.parsing ? "Разбираю запрос…" : !H.criteria ? "Технологии появятся по мере ввода" :
        H.mode === "openai" && H.aiFor === ta.value.trim() ? `${icon("sparkles", "xs")} Уточнено моделью — при запуске новый вызов не нужен` :
        H.edited ? "Критерии изменены вручную — агент использует их без вызова модели" : "Разбор по ключевым словам · модель будет вызвана один раз при запуске";
    };
    const drawCrit = () => {
      const c = H.criteria, box = M.$("#crit");
      if (!c) { box.innerHTML = ""; return setState(); }
      const chips = (key, label) => `<div class="crit-row"><div class="k">${label}</div><div class="v" data-key="${key}">${(c[key] || []).map((v, i) => `<span class="chip ${key === "languages" ? "accent" : ""}">${esc(v)}<button data-rm="${i}" aria-label="Убрать ${esc(v)}">${icon("x", "xs")}</button></span>`).join("")}<input class="chip-add" placeholder="+ добавить" aria-label="Добавить: ${label}"></div></div>`;
      box.innerHTML = `<div class="criteria">${chips("languages", "Языки")}${chips("frameworks", "Технологии")}
        <div class="crit-row"><div class="k">Условия</div><div class="v" style="gap:14px">
          <span class="row" style="gap:8px"><span class="muted small">Кандидатов</span><span class="stepper"><button data-cnt="-1" aria-label="Меньше">−</button><span id="cnt">${c.count || 5}</span><button data-cnt="1" aria-label="Больше">+</button></span></span>
          <label class="check small"><input type="checkbox" id="realP" ${c.real_projects ? "checked" : ""}>Только с признаками реальных проектов</label>
          <input class="input" id="critLoc" style="height:26px;width:170px;font-size:12px" value="${esc(c.location || "")}" placeholder="География — не важно" aria-label="География"></div></div></div>`;
      box.querySelectorAll("[data-key]").forEach((row) => {
        const key = row.dataset.key;
        row.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { c[key].splice(+b.dataset.rm, 1); H.edited = true; drawCrit(); }));
        const inp = row.querySelector(".chip-add");
        inp.onkeydown = (e) => {
          if (e.key === "Enter" && inp.value.trim()) { e.preventDefault(); (c[key] = c[key] || []).push(inp.value.trim()); H.edited = true; drawCrit(); M.$(`#crit [data-key="${key}"] .chip-add`).focus(); }
        };
      });
      box.querySelectorAll("[data-cnt]").forEach((b) => (b.onclick = () => { c.count = Math.max(1, Math.min(10, (c.count || 5) + +b.dataset.cnt)); H.edited = true; M.$("#cnt").textContent = c.count; setState(); }));
      M.$("#realP").onchange = (e) => { c.real_projects = e.target.checked; H.edited = true; setState(); };
      M.$("#critLoc").oninput = (e) => { c.location = e.target.value.trim() || null; H.edited = true; setState(); };
      setState();
    };
    const fastParse = M.debounce(async () => {
      const text = ta.value.trim();
      if (text.length < 6 || H.edited) return;
      try { const res = await api.parseQuery(text, true); if (ta.value.trim() === text && !H.edited && M.ctx.page === "hunter") { H.criteria = res.criteria; H.mode = "heuristic"; drawCrit(); } } catch { /* typing aid only */ }
    }, 300);
    ta.oninput = () => { H.query = ta.value; fastParse(); };
    ta.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); M.$("#runBtn").click(); } };
    M.$$("[data-ex]").forEach((b) => (b.onclick = () => { ta.value = EXAMPLES[+b.dataset.ex]; H.query = ta.value; H.edited = false; ta.focus(); fastParse(); }));
    M.$("#aiParse").onclick = async () => {
      const text = ta.value.trim();
      if (text.length < 6) return M.toast("Сначала опишите, кого ищете", { error: true });
      H.parsing = true; setState();
      try {
        const res = await api.parseQuery(text, false);
        H.criteria = res.criteria; H.mode = res.mode; H.aiFor = text; H.edited = false;
        if (res.mode !== "openai") M.toast(res.notice || "Модель недоступна — оставлен разбор по ключевым словам", { icon: "info" });
      } catch (err) { M.toast(err.message, { error: true }); }
      H.parsing = false; drawCrit();
    };
    M.$("#runBtn").onclick = () => {
      const text = ta.value.trim();
      if (text.length < 6) return M.toast("Опишите, кого ищете", { error: true });
      const own = H.criteria && (H.edited || (H.mode === "openai" && H.aiFor === text));
      const id = M.uid("s");
      const s = (S.searches[id] = { id, query: text, criteria: JSON.parse(JSON.stringify(H.criteria || { languages: [], frameworks: [] })), source: "github", status: "running", createdAt: Date.now(), results: [],
        agent: { steps: [], queries: [], checked: [], sent: own ? JSON.parse(JSON.stringify(H.criteria)) : null } });
      M.track("search_run", { q: text, source: "agent" });
      M.save();
      M.go("talent-hunter/searches/" + id);
      M.agent.run(s);
    };
    drawCrit();
    if (H.query && !H.criteria) fastParse();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };

  /* ======================================================================
     01 · Autonomous Talent Agent — run + live view
     ====================================================================== */
  const STEPS = [["understand", "Понимание запроса"], ["plan", "План поиска"], ["search", "Поиск по источникам"], ["prefilter", "Отбор по метаданным"], ["verify", "Проверка в коде"], ["rank", "Ранжирование и объяснение"]];
  const toCandidate = (r) => ({
    id: "gh-" + r.login, login: r.login, name: r.login, avatar: r.avatar_url, url: r.url, source: "GitHub", fetchedAt: Date.now(),
    matched: r.matched, missing: r.missing, skills: Object.keys(r.statuses).filter((k) => r.statuses[k] === "code"), evidence: r.evidence,
    gaps: Object.entries(r.statuses).filter(([, v]) => v !== "code").map(([k, v]) => (v === "meta" ? `Только упоминание, кода не видели: ${k}` : `Нет данных: ${k}`)),
    reason: r.explanation, statuses: r.statuses, real: r.real, repo: r.repo, repoUrl: r.repo_url, repoDescription: r.repo_description, pushedAt: r.pushed_at,
    rank: r.rank, verifiedInCode: r.verified_in_code, linkedin: null,
  });

  M.agent = {
    active: new Set(),
    async run(s) {
      const A = s.agent;
      this.active.add(s.id);
      const paint = () => { if (M.ctx.page === "search" && location.hash.includes(s.id)) drawRun(s); };
      try {
        await api.agentStream({ query: s.query, criteria: A.sent || undefined, count: (A.sent && A.sent.count) || undefined, use_ai: true }, (ev) => {
          if (ev.type === "step") { const i = A.steps.findIndex((x) => x.id === ev.id); if (i >= 0) A.steps[i] = ev; else A.steps.push(ev); if (ev.criteria) s.criteria = ev.criteria; }
          else if (ev.type === "query") A.queries[ev.index] = ev;
          else if (ev.type === "candidate_checked") A.checked.push(ev);
          else if (ev.type === "done") {
            A.done = { budget: ev.budget, dropped: ev.dropped || [], excluded: ev.excluded || [], skipped: ev.skipped_sources || [], wanted: ev.wanted || [], count: ev.count, found: (A.steps.find((x) => x.id === "search") || {}).detail };
            s.results = (ev.results || []).map(toCandidate);
            s.status = "done";
          } else if (ev.type === "error") { s.status = "error"; s.error = ev.message; }
          paint();
        });
        if (s.status === "running") { s.status = "error"; s.error = "Соединение с агентом прервалось до завершения."; }
      } catch (err) { s.status = "error"; s.error = err.message; }
      this.active.delete(s.id);
      M.save();
      if (s.status === "done") M.notify(`Агент завершил поиск: ${s.results.length} в шорт-листе`, "talent-hunter/searches/" + s.id);
      if (M.ctx.page === "search" && location.hash.includes(s.id)) M.rerender();
    },
  };

  const oldSearch = M.pages.search;
  M.pages.search = (main, id) => {
    const s = S.searches[id];
    if (!s || !s.agent) return oldSearch(main, id);
    M.crumbs([["Talent Hunter", "talent-hunter"], [s.query.slice(0, 60), ""]]);
    M.ctx.label = "Запуск агента";
    M.ctx.data = { query: s.query, criteria: s.criteria, status: s.status, shortlist: (s.results || []).map((r) => ({ login: r.login, repo: r.repo, statuses: r.statuses, real_project_signals: r.real, explanation: r.reason, evidence: (r.evidence || []).slice(0, 5).map((e) => ({ skill: e.skill, detail: e.detail, url: e.url })) })), not_included: s.agent.done && s.agent.done.dropped };
    const saved = S.savedSearches.some((x) => x.id === s.id);
    if (s.status === "running" && !M.agent.active.has(s.id)) { s.status = "error"; s.error = "Запуск был прерван (страница перезагружена)."; }
    main.innerHTML = `<div class="page" style="max-width:1320px">
      <div class="page-head"><div style="min-width:0"><div class="row"><span class="badge-live">Агент · GitHub</span><span class="faint small">${M.ago(s.createdAt)}</span></div>
        <h1 class="h1" style="margin-top:6px;max-width:860px">${esc(s.query)}</h1></div>
        <div class="actions"><button class="btn" id="saveSearch">${icon("bookmark", "sm")}${saved ? "Сохранён" : "Сохранить"}</button><button class="btn" id="editQ">${icon("filter", "sm")}Изменить запрос</button></div></div>
      <div id="budget" style="margin-bottom:16px"></div>
      <div class="agent-grid"><div class="card" style="position:sticky;top:12px"><div class="card-head"><h3 class="h3">Ход работы агента</h3><span class="faint small">каждый шаг — реальный вызов</span></div><div class="card-body" id="tl"></div></div>
        <div id="agentRight"></div></div></div>`;
    M.$("#saveSearch").onclick = () => {
      if (saved) S.savedSearches = S.savedSearches.filter((x) => x.id !== s.id); else S.savedSearches.push({ id: s.id, query: s.query, source: "github" });
      M.save(); M.rerender();
    };
    M.$("#editQ").onclick = () => { Object.assign(M.hunter, { query: s.query, criteria: JSON.parse(JSON.stringify(s.criteria)), mode: "heuristic", edited: true }); M.go("talent-hunter"); };
    drawRun(s);
  };

  function stepBody(s, id, ev) {
    const A = s.agent;
    if (id === "understand" && ev.wanted) return `<div class="row wrap">${ui.chips(ev.wanted, "accent")}<span class="chip">нужно: ${ev.count}</span>${ev.criteria && ev.criteria.real_projects ? '<span class="chip">реальные проекты</span>' : ""}${ev.criteria && ev.criteria.location ? `<span class="chip">${esc(ev.criteria.location)}</span>` : ""}</div>`;
    if (id === "plan" && ev.queries) return ev.queries.map((q) => `<div class="tl-q"><code>${esc(q.q)}</code><div class="meta">${esc(q.why)}</div></div>`).join("");
    if (id === "search" && A.queries.length) return A.queries.filter(Boolean).map((q) => `<div class="tl-q"><code>${esc(q.q)}</code><div class="meta">${q.error ? `<span style="color:var(--danger)">${esc(q.error)}</span>` : `<span>всего <b>${num(q.total)}</b></span><span>получено <b>${q.fetched}</b></span><span>новых авторов <b>${q.new_authors}</b></span>`}</div></div>`).join("");
    if (id === "prefilter" && ev.excluded && ev.excluded.length) return `<div class="faint xs">Исключено</div>` + ev.excluded.map((x) => `<div class="row small"><span class="chip num">${x.count}</span><span class="muted">${esc(x.reason)}</span></div>`).join("");
    if (id === "verify" && A.checked.length) return A.checked.map((c) => `<div class="row small" style="gap:8px"><span class="dots">${Object.values(c.statuses).map((v) => `<i class="${v}"></i>`).join("")}</span><span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">@${esc(c.login)} <span class="faint">· ${esc(c.repo.split("/")[1] || c.repo)}</span></span></div>`).join("");
    if (id === "rank" && ev.rule) return `<div class="small muted">Порядок: ${esc(ev.rule)}.</div>` + ((A.done && A.done.dropped.length) ? `<div class="faint xs" style="margin-top:4px">Не вошли</div>` + A.done.dropped.map((d) => `<div class="small"><span class="muted">@${esc(d.login)}</span> <span class="faint">— ${esc(d.reason)}</span></div>`).join("") : "");
    return "";
  }

  function drawRun(s) {
    const A = s.agent, tl = M.$("#tl"), right = M.$("#agentRight"), bud = M.$("#budget");
    if (!tl) return;
    const failedAt = s.status === "error" ? (A.steps.find((x) => x.status === "running") || {}).id : null;
    tl.innerHTML = `<div class="timeline">${STEPS.map(([id, title]) => {
      const ev = A.steps.find((x) => x.id === id);
      const status = !ev ? "wait" : id === failedAt ? "failed" : ev.status;
      const body = ev ? stepBody(s, id, ev) : "";
      return `<div class="tl-step ${status}"><span class="tl-dot">${status === "done" ? icon("check", "xs") : status === "failed" ? icon("x", "xs") : ""}</span><div style="min-width:0">
        <div class="tl-head"><b>${title}</b>${ev && status !== "running" ? `<span class="tl-time">${(ev.t / 1000).toFixed(1)} с</span>` : ""}</div>
        ${ev && ev.detail ? `<div class="tl-detail">${esc(ev.detail)}</div>` : ""}${body ? `<div class="tl-body">${body}</div>` : ""}</div></div>`;
    }).join("")}</div>`;
    const b = A.done && A.done.budget;
    bud.innerHTML = b ? `<div class="budget"><span>Вызовов модели <b>${b.model_calls}</b>${b.tokens ? ` · <b>${num(b.tokens)}</b> ${plural(b.tokens, "токен", "токена", "токенов")}` : " · 0 токенов"}</span><span>Запросов к GitHub <b>${b.github_calls}</b></span><span>Время <b>${(b.duration_ms / 1000).toFixed(1)} с</b></span><span>Отбор и объяснения — по правилам, без модели</span></div>` : "";
    if (s.status === "error") {
      right.innerHTML = `<div class="banner bad">${icon("alert")}<div><b>Агент остановился.</b> <span class="muted">${esc(s.error || "")}</span><div style="margin-top:8px"><button class="btn sm" id="rerun">${icon("refresh", "sm")}Запустить заново</button></div></div></div>`;
      M.$("#rerun").onclick = () => { Object.assign(s, { status: "running", error: null, results: [], createdAt: Date.now() }); s.agent = { steps: [], queries: [], checked: [], sent: A.sent }; M.rerender(); M.agent.run(s); };
      return;
    }
    if (s.status !== "done") {
      right.innerHTML = `<div class="card"><div class="card-head"><h3 class="h3">Шорт-лист</h3><span class="faint small">появится после проверки кода</span></div><div class="card-body">${A.checked.length ? `<div class="small muted" style="margin-bottom:10px">Проверено профилей: <b class="num">${A.checked.length}</b></div>` : ""}${ui.loading(5)}</div></div>`;
      return;
    }
    const D = A.done, wanted = D.wanted;
    if (!s.results.length) { right.innerHTML = `<div class="card">${ui.empty("search", "Никто не прошёл отбор", "Ослабьте условия: уберите одну технологию или требование реальных проектов.", `<button class="btn" onclick="document.getElementById('editQ').click()">Изменить запрос</button>`)}</div>`; return; }
    right.innerHTML = `<div class="card"><div class="card-head"><h3 class="h3">Шорт-лист</h3><span class="faint small">${s.results.length} из найденных · ${esc(D.found || "")}</span>
        <div class="actions"><button class="btn sm" id="cmpAll">${icon("columns", "sm")}Сравнить всех</button></div></div>
      ${s.results.map((r, i) => `<div class="cand" style="animation-delay:${i * 50}ms" data-login="${esc(r.login)}">
        <div class="cand-top"><span class="rank">#${r.rank}</span>${ui.avatar(r)}<div style="min-width:0"><button class="linkish" data-open style="font-weight:600;color:var(--text);text-align:left">@${esc(r.login)}</button>
          <div class="faint xs" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.repoUrl ? `<a href="${esc(r.repoUrl)}" target="_blank" rel="noopener">${esc(r.repo)}</a>` : esc(r.repo || "")} · обновлён ${M.ago(r.pushedAt)}${r.verifiedInCode ? "" : " · код не проверялся"}</div></div>
          <span class="spacer"></span><button class="btn sm" data-dna>${icon("git", "sm")}Developer DNA</button><button class="btn sm ${S.candidates[r.id] ? "ghost" : ""}" data-save>${S.candidates[r.id] ? icon("check", "sm") + "Сохранён" : icon("bookmark", "sm") + "Сохранить"}</button></div>
        <div class="reqs">${wanted.map((w) => { const st = r.statuses[w]; return st === "code" ? `<span class="req code">${icon("check", "xs")}${esc(w)}</span>` : `<button class="req ${st === "meta" ? "meta" : ""}" data-skill="${esc(w)}" data-tip="Создать задание на этот навык">${esc(w)} · ${st === "meta" ? "только упоминание" : "нет данных"}</button>`; }).join("")}</div>
        ${r.real && r.real.length ? `<div class="small muted">Признаки реального проекта: ${esc(r.real.join(" · "))}</div>` : ""}
        <div>${(r.evidence || []).filter((e) => e.kind !== "repo").slice(0, 5).map((e) => `<div class="evline"><span class="k">${esc(e.skill)}</span>${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.detail)}</a>` : `<span class="muted">${esc(e.detail)}</span>`}</div>`).join("")}</div></div>`).join("")}</div>
      <div class="faint xs" style="margin-top:10px">${D.excluded.map((x) => `${x.count} — ${esc(x.reason)}`).join(" · ")}${D.skipped.length ? ` · ${D.skipped.map((x) => `${esc(x.source)}: ${esc(x.reason)}`).join("; ")}` : ""}. Зелёные требования подтверждены строкой в файле; остальное можно проверить заданием.</div>`;
    const byLogin = (el) => s.results.find((r) => r.login === el.closest(".cand").dataset.login);
    right.querySelectorAll("[data-save]").forEach((b) => (b.onclick = () => { M.saveCandidate(byLogin(b)); b.innerHTML = icon("check", "sm") + "Сохранён"; b.classList.add("ghost"); M.toast("Кандидат сохранён"); }));
    right.querySelectorAll("[data-dna]").forEach((b) => (b.onclick = () => { const r = byLogin(b); M.saveCandidate(r); M.go("dna/" + r.login); }));
    right.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => { const r = byLogin(b); M.saveCandidate(r); M.go("candidates/" + r.id); }));
    right.querySelectorAll("[data-skill]").forEach((b) => (b.onclick = () => { const r = byLogin(b); M.saveCandidate(r); M.adaptive.open({ candidate: M.candidate(r.id), skill: b.dataset.skill }); }));
    M.$("#cmpAll").onclick = () => { s.results.forEach((r) => M.saveCandidate(r)); M.go("matching?ids=" + s.results.map((r) => r.id).join(",")); };
  }

  /* ======================================================================
     02 · Developer DNA
     ====================================================================== */
  const SHORT = { activity: "Коммиты", complexity: "Сложность", testing: "Тесты", architecture: "Архитектура", collaboration: "Команда", evidence: "Подтверждения" };
  const LANG_COLORS = { TypeScript: "#3178c6", JavaScript: "#e3c64a", Python: "#4b8bbe", Go: "#00add8", Java: "#c07a3a", "C#": "#68217a", Rust: "#c4612f", Ruby: "#c0392b", PHP: "#777bb3", Kotlin: "#a97bff", Swift: "#f05138", CSS: "#7c5cbf", HTML: "#e34c26", Shell: "#89e051", "C++": "#f34b7d", C: "#7a8a99", Dockerfile: "#5b8fb9", Vue: "#41b883" };

  function radarSVG(dims) {
    const c = 150, R = 92, n = dims.length;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [c + r * Math.cos(a), c + r * Math.sin(a)]; };
    const rings = [0.33, 0.66, 1].map((k) => `<polygon class="ring" points="${dims.map((_, i) => pt(i, R * k).join(",")).join(" ")}"/>`).join("");
    const axes = dims.map((_, i) => { const [x, y] = pt(i, R); return `<line class="axis" x1="${c}" y1="${c}" x2="${x}" y2="${y}"/>`; }).join("");
    const shape = dims.map((d, i) => pt(i, Math.max(4, (R * d.value) / 100)).join(",")).join(" ");
    const pts = dims.map((d, i) => { const [x, y] = pt(i, Math.max(4, (R * d.value) / 100)); return `<circle class="pt" cx="${x}" cy="${y}" r="3"/>`; }).join("");
    const labels = dims.map((d, i) => { const [x, y] = pt(i, R + 20); const anchor = Math.abs(x - c) < 8 ? "middle" : x < c ? "end" : "start"; return `<text x="${x}" y="${y}" text-anchor="${anchor}">${SHORT[d.key]}</text><text class="v" x="${x}" y="${y + 13}" text-anchor="${anchor}">${d.level_label.replace(" сигнал", "")}</text>`; }).join("");
    return `<svg class="dna-radar" viewBox="-45 0 390 300" role="img" aria-label="Developer DNA: ${dims.map((d) => `${d.title} — ${d.level_label}`).join("; ")}">${rings}${axes}<polygon class="shape" points="${shape}"/>${pts}${labels}</svg>`;
  }

  M.dna = {
    async mount(el, login, opts = {}) {
      el.innerHTML = `<div class="card"><div class="card-body"><div class="tool-status"><span class="spin"></span>Собираю инженерный профиль @${esc(login)}: репозитории, коммиты, pull request'ы…</div>${ui.loading(4)}</div></div>`;
      try {
        const d = await M.cached("dna:" + login, () => api.dna(login), 900000);
        if (!el.isConnected) return;
        this.remember(login, d);
        this.draw(el, d, opts);
      } catch (err) {
        if (!el.isConnected) return;
        el.innerHTML = ui.error(err, true);
        el.querySelector("[data-retry]")?.addEventListener("click", () => { delete M.cache["dna:" + login]; this.mount(el, login, opts); });
      }
    },
    /* DNA facts become observed evidence for Matching (each has a source link). */
    remember(login, d) {
      const proofs = [];
      const add = (skill, key, rx) => { const dim = d.dimensions.find((x) => x.key === key); const f = dim && dim.facts.find((x) => x.url && rx.test(x.text)); if (f) proofs.push({ skill, explanation: f.text, confidence: { level: dim.level >= 2 ? "medium" : "low", reason: dim.level_label }, sources: [{ path: f.text.split(":")[0], line: 0, snippet: f.text, url: f.url }] }); };
      add("Testing", "testing", /тестов/); add("CI/CD", "testing", /CI/); add("Docker", "architecture", /контейнер/); add("Open source", "collaboration", /pull request/);
      S.proofs = S.proofs || {};
      S.proofs[login] = { ...(S.proofs[login] || {}), __dna: { repo: `@${login} · Developer DNA`, url: d.profile.url, checked_at: d.fetched_at, languages: Object.keys(d.languages).slice(0, 5), proofs } };
      M.track("dna_built", { login });
      M.save();
    },
    draw(el, d, opts) {
      const p = d.profile, dims = d.dimensions;
      const maxW = Math.max(1, ...d.weeks);
      const langs = Object.entries(d.languages), totL = langs.reduce((a, [, n]) => a + n, 0) || 1;
      const strong = d.summary.strong, none = d.summary.no_data;
      const cand = M.candidate("gh-" + p.login) || { id: "gh-" + p.login, login: p.login, name: p.name || p.login, avatar: p.avatar_url, url: p.url, source: "GitHub", skills: Object.keys(d.languages).slice(0, 5), evidence: [], gaps: [] };
      const job = M.activeJob();
      const reqs = job ? [...job.required, ...job.preferred] : [];
      const unproven = reqs.filter((r) => ["unknown", "inferred"].includes(M.evidenceFor(cand, r).status));
      M.ctx.demo = false;
      M.ctx.data = { developer_dna: { login: p.login, dimensions: dims.map((x) => ({ title: x.title, signal: x.level_label, facts: x.facts.map((f) => f.text + (f.url ? ` (${f.url})` : "")), missing: x.missing })), commits_by_week_last_26: d.weeks, languages: d.languages, limits: d.limits }, active_job: job && { title: job.title, unproven_requirements: unproven } };
      M.copilot.refreshContext();
      el.innerHTML = `<div class="dna">
        <div class="card"><div class="card-head"><span class="eyebrow">Developer DNA</span><span class="faint small hide-sm">публичные инженерные сигналы · GitHub API · 0 токенов модели · ${M.ago(d.fetched_at)}</span>
            <div class="actions"><button class="btn sm ghost" data-refresh data-tip="Собрать заново">${icon("refresh", "sm")}</button></div></div>
          <div class="dna-hero">${radarSVG(dims)}
            <div class="stack" style="gap:16px;min-width:0">
              ${opts.header ? `<div class="row" style="gap:14px">${ui.avatar({ avatar: p.avatar_url, name: p.name || p.login }, "xl")}<div style="min-width:0"><h2 style="font-size:19px">${esc(p.name || p.login)}</h2><div class="muted"><a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:var(--accent-text)">@${esc(p.login)}</a>${p.location ? ` · ${esc(p.location)}` : ""}${p.company ? ` · ${esc(p.company)}` : ""}</div>${p.bio ? `<div class="small muted" style="margin-top:4px">${esc(p.bio)}</div>` : ""}</div></div>` : ""}
              <div style="line-height:1.55">${strong.length ? `Сильнее всего в публичных данных видны: <b>${esc(strong.join(", ").toLowerCase())}</b>.` : "Выраженных публичных сигналов пока нет."}${none.length ? ` <span class="muted">Нет данных: ${esc(none.join(", ").toLowerCase())}.</span>` : ""}</div>
              <div><div class="row small faint" style="margin-bottom:6px"><span>Коммиты автора по неделям · 26 недель</span><span class="spacer"></span><span><b class="num" style="color:var(--text-2)">${d.commit_sample}</b> в выборке</span></div>
                <div class="heat" role="img" aria-label="Коммиты по неделям: ${d.weeks.join(", ")}">${d.weeks.map((w, i) => `<i class="${w ? "" : "zero"}" style="height:${w ? Math.max(8, (w / maxW) * 100) : 6}%;animation-delay:${i * 18}ms" title="${w} коммитов"></i>`).join("")}</div></div>
              ${langs.length ? `<div><div class="lang-bar">${langs.map(([l, n], i) => `<i style="width:${(n / totL) * 100}%;background:${LANG_COLORS[l] || MeriloCharts.PALETTE[i % 5]}"></i>`).join("")}</div><div class="legend" style="margin-top:7px">${langs.slice(0, 6).map(([l, n], i) => `<span class="row" style="gap:6px"><span class="sw" style="background:${LANG_COLORS[l] || MeriloCharts.PALETTE[i % 5]}"></span>${esc(l)} <span class="faint num">${n}</span></span>`).join("")}</div></div>` : ""}
            </div></div></div>
        <div class="dna-dims">${dims.map((x, i) => `<div class="card dim" style="animation:fadeDown var(--t-slow) var(--ease) both;animation-delay:${i * 45}ms">
          <div class="dim-head"><b>${esc(x.title)}</b><span class="lvl l${x.level}">${esc(x.level_label)}</span></div>
          <div class="meter"><i data-w="${x.value}" style="width:0"></i></div>
          ${x.facts.map((f) => `<div class="fact">${f.url ? `<a href="${esc(f.url)}" target="_blank" rel="noopener">${esc(f.text)}</a>` : `<span>${esc(f.text)}</span>`}</div>`).join("")}
          ${x.missing ? `<div class="faint small">${esc(x.missing)}</div>` : ""}<div class="faint xs">${esc(x.method)}</div></div>`).join("")}</div>
        ${job ? `<div class="card"><div class="card-head"><h3 class="h3">Вакансия «${esc(job.title)}»</h3><span class="faint small">${reqs.length - unproven.length} из ${reqs.length} требований с доказательствами</span><div class="actions"><button class="btn sm" data-match>${icon("columns", "sm")}В Matching Lab</button></div></div>
          ${reqs.map((r) => { const e = M.evidenceFor(cand, r); const open = ["unknown", "inferred"].includes(e.status); return `<div class="list-row"><span style="width:160px;font-weight:500">${esc(r)}</span>${M.evChip(e)}<span class="muted small" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(e.explanation)}</span>${open ? `<button class="btn sm" data-adapt="${esc(r)}">${icon("clipboard", "sm")}Проверить заданием</button>` : ""}</div>`; }).join("")}</div>` : ""}
        <div class="faint xs">${d.limits.map(esc).join(" ")}</div></div>`;
      requestAnimationFrame(() => el.querySelectorAll(".meter > i[data-w]").forEach((m) => (m.style.width = m.dataset.w + "%")));
      el.querySelector("[data-refresh]").onclick = () => { delete M.cache["dna:" + p.login]; this.mount(el, p.login, opts); };
      el.querySelector("[data-match]")?.addEventListener("click", () => { M.saveCandidate(cand); M.go("matching?ids=" + [cand.id, ...(S.matchIds || []).filter((x) => x !== cand.id)].slice(0, 5).join(",")); });
      el.querySelectorAll("[data-adapt]").forEach((b) => (b.onclick = () => { M.saveCandidate(cand); M.adaptive.open({ candidate: M.candidate(cand.id), skill: b.dataset.adapt }); }));
    },
  };

  M.pages.dna = (main, login) => {
    const c = M.candidate("gh-" + login);
    M.crumbs([["Кандидаты", "candidates"], ["@" + login, c ? "candidates/gh-" + login : "github/" + login], ["Developer DNA", ""]]);
    M.ctx.label = "Developer DNA · @" + login;
    main.innerHTML = `<div class="page" style="max-width:1180px"><div class="page-head"><div><h1 class="h1">Developer DNA</h1><div class="lead">Инженерный профиль по публичным данным: каждый вывод опирается на факт со ссылкой. Это сила сигналов, а не оценка человека.</div></div>
      <div class="actions"><button class="btn" onclick="M.go('github/${esc(login)}')">${icon("code", "sm")}Репозитории и код</button>${c ? `<button class="btn" onclick="M.go('candidates/gh-${esc(login)}')">${icon("users", "sm")}Карточка кандидата</button>` : ""}</div></div><div id="dnaBox"></div></div>`;
    if (login.startsWith("demo-")) { M.$("#dnaBox").innerHTML = ui.empty("git", "Демо-профиль", "Developer DNA строится только по реальным GitHub-профилям."); return; }
    M.dna.mount(M.$("#dnaBox"), login, { header: true });
  };

  const oldCandidate = M.pages.candidate;
  M.pages.candidate = (main, id) => {
    oldCandidate(main, id);
    const c = M.candidate(id), head = main.querySelector(".page-head");
    if (!c || c.demo || !c.login || !head) return;
    head.insertAdjacentHTML("afterend", '<div id="dnaBox" style="margin-bottom:16px"></div>');
    M.dna.mount(M.$("#dnaBox"), c.login, {});
  };

  /* ======================================================================
     03 · Adaptive Skill Challenge
     ====================================================================== */
  M.adaptive = {
    open({ candidate, skill, language }) {
      const job = M.activeJob();
      const reqLangs = job ? [...job.required, ...job.preferred].map(langKey).filter(Boolean) : [];
      const candLangs = [...Object.keys((S.proofs || {})[candidate && candidate.login] || {}).flatMap((k) => ((S.proofs[candidate.login][k] || {}).languages || [])), ...((candidate && candidate.skills) || [])].map(langKey).filter(Boolean);
      const lang = language || langKey(skill) || reqLangs[0] || candLangs[0] || "python";
      let variant = 0, draft = null, info = null;
      const dlg = M.dialog({
        title: "Adaptive Skill Challenge", wide: true,
        body: `<div class="stack">
          <div class="banner info">${icon("info")}<div>Навык <b>${esc(skill)}</b>${candidate ? ` у ${esc(candidate.name || candidate.login)}` : ""} не подтверждён публичным кодом. Задание проверит именно его — коротко и на практике.</div></div>
          <div class="form-grid"><div class="field"><label for="adL">Язык</label><select class="select" id="adL">${LANGS.map(([k, n]) => `<option value="${k}" ${k === lang ? "selected" : ""}>${n}</option>`).join("")}</select></div>
            <div class="field"><label for="adLv">Уровень</label><select class="select" id="adLv">${["Junior", "Junior+", "Middle", "Senior"].map((d) => `<option ${d === "Junior+" ? "selected" : ""}>${d}</option>`).join("")}</select></div>
            <div class="field"><label for="adM">Время, мин</label><input class="input" id="adM" type="number" min="10" max="90" value="25"></div></div>
          <div class="row"><button class="btn primary" id="adGen">${icon("sparkles", "sm")}Сгенерировать задание</button><span class="faint small">один вызов модели · повторный запрос берётся из кэша</span></div>
          <div id="adDraft"></div></div>`,
      });
      const el = dlg.el, box = M.$("#adDraft", el);
      const gen = async () => {
        const btn = M.$("#adGen", el); btn.disabled = true;
        box.innerHTML = `<div class="tool-status"><span class="spin"></span>Модель проектирует задание на «${esc(skill)}»…</div>`;
        try {
          const res = await api.adaptive({ skill, language: M.$("#adL", el).value, difficulty: M.$("#adLv", el).value, minutes: +M.$("#adM", el).value || 25, known: ((candidate && candidate.skills) || []).slice(0, 6), job: job ? job.title : null, variant });
          if (res.mode === "unavailable") { box.innerHTML = `<div class="banner warn">${icon("alert")}<span>${esc(res.notice)}</span></div>`; btn.disabled = false; return; }
          draft = res.draft; info = res;
          drawDraft();
        } catch (err) { box.innerHTML = ui.error(err); }
        btn.disabled = false;
      };
      const drawDraft = () => {
        box.innerHTML = `<div class="divider"></div><div class="stack">
          <div class="row"><span class="fact-tag ai">AI-ЧЕРНОВИК</span><span class="faint small">${esc(info.model || "")} · ${info.cached ? "из кэша, 0 токенов" : num(info.tokens) + " " + plural(info.tokens, "токен", "токена", "токенов")}</span><span class="spacer"></span><button class="btn sm ghost" id="adAlt">${icon("refresh", "sm")}Другой вариант</button></div>
          ${draft.why ? `<div class="small muted">${esc(draft.why)}</div>` : ""}
          <div class="field"><label for="adT">Название</label><input class="input" id="adT" maxlength="120" value="${esc(draft.title || "")}"></div>
          <div class="field"><label for="adD">Описание для кандидата</label><textarea class="textarea" id="adD" rows="3">${esc(draft.description || "")}</textarea></div>
          <div class="grid g2"><div><div class="eyebrow" style="margin-bottom:6px">Критерии приёмки</div>${(draft.criteria || []).map((c) => `<div class="fact"><span>${esc(c)}</span></div>`).join("")}</div>
            <div><div class="eyebrow" style="margin-bottom:6px">Заложенные дефекты · видны только вам</div>${(draft.defects || []).map((d) => `<div class="fact"><span>${esc(d.name)}<br><code class="mono xs faint">${esc(d.snippet)}</code></span></div>`).join("") || '<div class="faint small">Модель не указала точные строки — автопроверка дефектов будет пропущена.</div>'}</div></div>
          <div class="field"><label for="adC">Стартовый код</label><textarea class="textarea mono" id="adC" rows="11" spellcheck="false" style="font-size:12px">${esc(draft.starter_code || "")}</textarea></div>
          <div class="field"><label for="adCo">Компания (видна кандидату)</label><input class="input" id="adCo" value="${esc(S.company || "")}" placeholder="Название компании"></div>
          <div class="row"><span class="faint small">После решения: 3 шлюза Merilo, автопроверка дефектов и AI-разбор по критериям. Ссылку кандидату отправляете вы.</span><span class="spacer"></span><button class="btn primary" id="adPub">${icon("send", "sm")}Опубликовать</button></div></div>`;
        M.$("#adAlt", el).onclick = () => { variant += 1; gen(); };
        M.$("#adPub", el).onclick = publish;
      };
      const publish = async () => {
        const company = M.$("#adCo", el).value.trim(), code = M.$("#adC", el).value, language = M.$("#adL", el).value;
        const criteria = (draft.criteria || []).slice(0, 5);
        const description = M.$("#adD", el).value.trim() + (criteria.length ? "\n\nКритерии приёмки:\n" + criteria.map((c) => "- " + c).join("\n") : "");
        const payload = { title: M.$("#adT", el).value.trim(), company_name: company, stack: [skill, (LANGS.find(([k]) => k === language) || [])[1]].filter(Boolean).join(", "), difficulty: M.$("#adLv", el).value, description, buggy_code: code, language,
          rubric: { clean_code: "Читаемость, именование, структура", architecture: `Корректность и применение навыка «${skill}»`, edge_cases: "Граничные случаи и обработка ошибок" } };
        const problems = [payload.title.length < 5 && "название", company.length < 2 && "компания", description.length < 20 && "описание", code.trim().length < 10 && "стартовый код"].filter(Boolean);
        if (problems.length) return M.toast("Заполните: " + problems.join(", "), { error: true });
        const btn = M.$("#adPub", el); btn.disabled = true;
        try {
          S.company = company;
          const t = await api.createTask(payload);
          const lines = new Set(code.split("\n").map((l) => l.trim()));
          await api.putMeta(t.id, { skill, criteria, defects: (draft.defects || []).filter((d) => lines.has(d.snippet)), why: draft.why || "", candidate: candidate ? candidate.id : null });
          delete M.cache.tasks;
          S.taskLinks = S.taskLinks || {};
          if (candidate) {
            if (!candidate.demo && !S.candidates[candidate.id]) M.saveCandidate(candidate);
            S.taskLinks[t.id] = { candidate: candidate.id, skills: [skill] };
            if (S.candidates[candidate.id]) S.candidates[candidate.id].assessment = { status: "invited", taskId: t.id, skills: [skill] };
            M.track("challenge_sent", { candidate: candidate.id });
          }
          M.track("challenge_published", { title: payload.title, adaptive: true });
          M.save();
          const url = `${location.origin}/app#/challenge/${t.id}`;
          try { await navigator.clipboard.writeText(url); M.toast("Задание опубликовано, ссылка скопирована"); } catch { M.toast("Задание опубликовано"); }
          dlg.close();
          M.go("assessments/" + t.id);
        } catch (err) { M.toast(err.message, { error: true }); btn.disabled = false; }
      };
      M.$("#adGen", el).onclick = gen;
    },

    reviewHTML(r) {
      const passed = r.checks.filter((c) => c.pass).length;
      const crit = r.criteria || [];
      const row = (ok, text, sub, line) => `<div class="check-row ${ok ? "pass" : "fail"}"><span class="ic">${icon(ok ? "check" : "x", "xs")}</span><div><div>${esc(text)}${line ? `<button class="lineref" data-line="${line}">стр. ${line}</button>` : ""}</div>${sub ? `<div class="sub">${esc(sub)}</div>` : ""}</div></div>`;
      return `<div class="stack" style="gap:18px">
        <div><div class="row" style="margin-bottom:4px"><b>Автопроверки</b><span class="chip ${passed === r.checks.length ? "ok" : "warn"} num">${passed} / ${r.checks.length}</span><span class="spacer"></span><span class="faint xs">по правилам, код не исполнялся</span></div>${r.checks.map((c) => row(c.pass, c.name, c.detail)).join("")}</div>
        ${r.mode === "openai" ? `<div><div class="row" style="margin-bottom:4px"><b>Критерии приёмки</b><span class="chip ${crit.every((c) => c.pass) ? "ok" : "warn"} num">${crit.filter((c) => c.pass).length} / ${crit.length}</span><span class="spacer"></span><span class="faint xs">AI-ревью · ${esc(r.model || "")}</span></div>${crit.map((c) => row(c.pass, c.text, c.note, c.line)).join("")}</div>
          <div><b>Технический разбор</b>
            ${r.strengths && r.strengths.length ? `<div class="faint xs" style="margin:8px 0 4px">СИЛЬНЫЕ СТОРОНЫ</div>${r.strengths.map((s) => `<div class="fact"><span>${esc(s)}</span></div>`).join("")}` : ""}
            ${r.issues && r.issues.length ? `<div class="faint xs" style="margin:10px 0 4px">ЗАМЕЧАНИЯ</div>${r.issues.map((i) => `<div class="row small" style="align-items:flex-start;padding:4px 0"><span class="sev ${i.severity}">${{ high: "критично", medium: "важно", low: "мелочь" }[i.severity]}</span><span class="muted" style="flex:1">${esc(i.text)}${i.line ? `<button class="lineref" data-line="${i.line}">стр. ${i.line}</button>` : ""}</span></div>`).join("")}` : ""}
            ${r.next_steps && r.next_steps.length ? `<div class="faint xs" style="margin:10px 0 4px">ЧТО УЛУЧШИТЬ</div>${r.next_steps.map((s) => `<div class="fact"><span>${esc(s)}</span></div>`).join("")}` : ""}</div>
          <div class="faint xs">${r.cached ? "Разбор из кэша · 0 токенов" : r.tokens != null ? `Разбор: ${num(r.tokens)} ${plural(r.tokens, "токен", "токена", "токенов")}` : ""}${r.skill ? ` · проверяемый навык: ${esc(r.skill)}` : ""}</div>`
          : `<div class="banner warn small">${icon("alert")}<span>${esc(r.notice || "AI-разбор недоступен.")}</span></div>`}</div>`;
    },

    /* Called by the candidate coding page right after the 3-gate verification. */
    async review(task, code, result) {
      const split = M.$("#chSplit");
      const panel = split && split.querySelector(".panel:last-child");
      if (!panel || result.gate_reached < 3) return;
      split.querySelectorAll(".resizer[hidden]").forEach((rz) => rz.removeAttribute("hidden"));
      split.style.gridTemplateColumns = "330px 5px minmax(0,1fr) 5px 400px";
      panel.style.borderLeft = "1px solid var(--border-soft)";
      panel.innerHTML = `<div class="cp-head">${icon("clipboard", "sm")}<b class="small">Результаты проверки</b></div><div style="padding:14px"><div class="tool-status"><span class="spin"></span>Автопроверки и технический разбор…</div>${ui.loading(5)}</div>`;
      try {
        const r = await api.review({ task_id: task.id, code, card_hash: result.card_hash });
        if (!panel.isConnected) return;
        panel.innerHTML = `<div class="cp-head" style="position:sticky;top:0;background:var(--bg);z-index:1">${icon("clipboard", "sm")}<b class="small">Результаты проверки</b></div><div style="padding:14px">${this.reviewHTML(r)}</div>`;
        panel.querySelectorAll("[data-line]").forEach((b) => (b.onclick = () => {
          const ta = M.$("#code"), n = +b.dataset.line, lines = ta.value.split("\n");
          const start = lines.slice(0, n - 1).join("\n").length + (n > 1 ? 1 : 0);
          ta.focus(); ta.setSelectionRange(start, start + (lines[n - 1] || "").length);
          M.$("#ed").scrollTop = Math.max(0, (n - 4) * 20);
        }));
      } catch (err) { if (panel.isConnected) panel.innerHTML = `<div style="padding:14px">${ui.error(err)}</div>`; }
    },

    /* Recruiter view on the Skill Card page. */
    async mountReview(el, hash) {
      try {
        const r = await api.getReview(hash);
        if (!el.isConnected) return;
        el.innerHTML = `<div class="card" style="max-width:640px;margin:16px auto 0"><div class="card-head"><h3 class="h3">Разбор решения</h3><span class="faint small">${M.ago(r.checked_at)}</span></div><div class="card-body">${this.reviewHTML(r).replace(/<button class="lineref"[^>]*>(.*?)<\/button>/g, '<span class="lineref" style="cursor:default">$1</span>')}</div></div>`;
      } catch { /* no stored review for this card */ }
    },
  };

  /* ======================================================================
     Matching Lab — evidence matrix ranked by proven required criteria
     ====================================================================== */
  M.pages.matching = (main) => {
    M.crumbs([["Matching Lab", "matching"]]);
    M.ctx.label = "Matching Lab";
    const jobs = M.allJobs(), job = M.activeJob(), all = M.allCandidates(), q = M.query();
    if (!job) { main.innerHTML = `<div class="page">${ui.empty("briefcase", "Нужна вакансия", "Matching Lab сравнивает кандидатов по требованиям вакансии.", `<button class="btn primary" onclick="M.pages.jobs.create()">Создать вакансию</button>`)}</div>`; return; }
    const ids = q.ids ? q.ids.split(",") : (S.matchIds || all.filter((c) => c.review === "shortlisted").map((c) => c.id));
    let list = ids.map((id) => M.candidate(id)).filter(Boolean).slice(0, 6);
    if (!list.length) list = all.slice(0, 4);
    S.matchIds = list.map((c) => c.id); M.save();
    const filter = q.f || "all";
    const allCrit = [...job.required.map((r) => [r, true]), ...job.preferred.map((r) => [r, false])];
    const proven = (c, onlyReq) => allCrit.filter(([cr, req]) => (!onlyReq || req) && ["observed", "challenge"].includes(M.evidenceFor(c, cr).status)).length;
    list.sort((a, b) => proven(b, true) - proven(a, true) || proven(b) - proven(a));
    const crit = allCrit.filter(([cr, req]) => filter === "all" || (filter === "req" && req) || (filter === "gaps" && list.some((c) => ["unknown", "inferred"].includes(M.evidenceFor(c, cr).status))));
    M.ctx.demo = list.some((c) => c.demo);
    M.ctx.data = { job: { title: job.title, required: job.required, preferred: job.preferred }, matrix: list.map((c) => ({ candidate: c.name || c.login, proven_required: `${proven(c, true)}/${job.required.length}`, assessment: c.assessment, criteria: Object.fromEntries(allCrit.map(([cr]) => { const e = M.evidenceFor(c, cr); return [cr, { category: e.status, explanation: e.explanation, source: e.source }]; })) })) };
    const href = (extra) => "#/matching?ids=" + list.map((c) => c.id).join(",") + (extra ? "&f=" + extra : "");
    main.innerHTML = `<div class="page" style="max-width:none">
      <div class="page-head"><div><h1 class="h1">Matching Lab</h1><div class="lead">Каждое требование вакансии сопоставлено с доказательством. Итогового «процента совпадения» нет — порядок кандидатов задаётся числом подтверждённых обязательных требований.</div></div>
        <div class="actions"><select class="select" id="jobSel" style="width:auto;height:30px" aria-label="Вакансия">${jobs.map((j) => `<option value="${j.id}" ${j.id === job.id ? "selected" : ""}>${esc(j.title)}${j.demo ? " (демо)" : ""}</option>`).join("")}</select>
          <button class="btn" id="addC">${icon("plus", "sm")}Кандидат</button><button class="btn" id="aiSum">${icon("sparkles", "sm")}Сводка Copilot</button></div></div>
      <div class="row wrap" style="margin-bottom:12px"><div class="seg">${[["all", "Все требования"], ["req", "Обязательные"], ["gaps", "Только пробелы"]].map(([k, l]) => `<button class="${filter === k ? "on" : ""}" data-href="${href(k === "all" ? "" : k)}">${l}</button>`).join("")}</div>
        <span class="spacer"></span><span class="row small muted" style="gap:12px">${[["challenge", "задание"], ["observed", "код"], ["inferred", "вывод без кода"], ["unknown", "нет данных"]].map(([k, l]) => `<span class="row" style="gap:5px"><span class="seg-bar" style="width:14px"><i class="${k}"></i></span>${l}</span>`).join("")}</span></div>
      ${list.length ? `<div class="card" style="overflow:auto"><table class="matrix"><thead><tr><th>Требование</th>${list.map((c) => `<th style="min-width:230px"><div class="row">${ui.avatar(c)}<div style="min-width:0;flex:1"><a href="#/candidates/${c.id}" style="font-weight:600">${esc(c.name || c.login)}</a> ${c.demo ? ui.demoBadge() : ""}
            <div class="faint xs" style="font-weight:400">${proven(c, true)} из ${job.required.length} обязательных подтверждено</div></div><button class="icon-btn" data-rm="${c.id}" aria-label="Убрать из сравнения" style="width:22px;height:22px">${icon("x", "xs")}</button></div>
          <div class="seg-bar" style="margin-top:8px" title="Статус по каждому требованию">${allCrit.map(([cr]) => `<i class="${M.evidenceFor(c, cr).status}"></i>`).join("")}</div>
          ${c.demo ? "" : `<div class="row" style="margin-top:8px;gap:4px"><button class="btn sm" data-dna="${esc(c.login)}">Developer DNA</button><button class="btn sm ghost" data-code="${esc(c.login)}" data-repo="${esc(c.repo || ((c.evidence || []).find((e) => e.repo) || {}).repo || "")}">Код</button></div>`}</th>`).join("")}</tr></thead><tbody>
        ${crit.map(([cr, req]) => `<tr><td><div style="font-weight:500">${esc(cr)}</div><div class="faint xs">${req ? "обязательно" : "желательно"}</div></td>${list.map((c) => { const e = M.evidenceFor(c, cr); const open = ["unknown", "inferred"].includes(e.status); return `<td><div class="mcell" data-c="${c.id}" data-cr="${esc(cr)}" tabindex="0" role="button" aria-label="${esc(cr)}: ${esc(e.explanation)}">${M.evChip(e)}<span class="xs muted" style="line-height:1.45">${esc((e.items[0] && e.items[0].detail) || e.explanation).slice(0, 96)}</span></div>${open ? `<button class="btn sm ghost" data-adapt="${c.id}" data-skill="${esc(cr)}" style="margin-top:6px">${icon("clipboard", "sm")}Проверить заданием</button>` : ""}</td>`; }).join("")}</tr>`).join("") || `<tr><td colspan="${list.length + 1}">${ui.empty("check", "Пробелов нет", "У всех кандидатов есть доказательства по каждому требованию.")}</td></tr>`}
        <tr><td><div style="font-weight:500">Задание Merilo</div><div class="faint xs">3 шлюза + разбор</div></td>${list.map((c) => `<td>${ui.assess(c.assessment)}${c.assessment && c.assessment.cardHash ? ` <a class="faint xs" href="#/verified/${c.assessment.cardHash}?mode=private" style="text-decoration:underline">разбор</a>` : ""}</td>`).join("")}</tr>
        <tr><td><div style="font-weight:500">Решение рекрутера</div><div class="faint xs">принимает человек</div></td>${list.map((c) => `<td><select class="select" data-rv="${c.id}" style="height:28px" aria-label="Статус ${esc(c.name || c.login)}">${M.REVIEW.map(([k, l]) => `<option value="${k}" ${c.review === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>`).join("")}</tr>
        <tr><td><div style="font-weight:500">Заметки</div></td>${list.map((c) => `<td><textarea class="textarea" data-note="${c.id}" rows="2" placeholder="Заметка…" style="font-size:12px" aria-label="Заметка">${esc(S.notes[c.id] || "")}</textarea></td>`).join("")}</tr>
      </tbody></table></div>` : ui.empty("columns", "Добавьте кандидатов", "Выберите их в результатах агента или в списке кандидатов.")}
      <div class="faint xs" style="margin-top:10px">Популярность профиля, возраст, пол и другие нерелевантные характеристики не используются. «Нет данных» — не отрицательный вывод о кандидате.</div></div>`;
    M.$("#jobSel").onchange = (e) => { S.activeJob = e.target.value; M.save(); M.rerender(); };
    M.$$("[data-href]").forEach((b) => (b.onclick = () => { location.hash = b.dataset.href; }));
    M.$("#aiSum").onclick = () => { M.copilot.open(); M.copilot.ask("Сравни кандидатов по матрице: по каждому требованию — у кого доказательство сильнее и почему, где пробелы и что проверить заданием. Без итогового рейтинга."); };
    M.$("#addC").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const rest = all.filter((c) => !list.some((x) => x.id === c.id));
      M.menu(r.left, r.bottom + 4, rest.length ? rest.slice(0, 12).map((c) => ({ label: (c.name || c.login) + (c.demo ? " · demo" : ""), icon: "users", run: () => { location.hash = "#/matching?ids=" + [...list.map((x) => x.id), c.id].slice(-6).join(","); } })) : [{ label: "Других кандидатов нет", run: () => {} }]);
    };
    M.$$("[data-rm]").forEach((b) => (b.onclick = () => { location.hash = "#/matching?ids=" + list.filter((c) => c.id !== b.dataset.rm).map((c) => c.id).join(","); }));
    M.$$("[data-rv]").forEach((sel) => (sel.onchange = () => M.setReview([sel.dataset.rv], sel.value)));
    M.$$("[data-note]").forEach((t) => (t.oninput = M.debounce(() => { S.notes[t.dataset.note] = t.value; M.save(); }, 400)));
    M.$$("[data-dna]").forEach((b) => (b.onclick = () => M.go("dna/" + b.dataset.dna)));
    M.$$("[data-code]").forEach((b) => (b.onclick = () => { const repo = (b.dataset.repo || "").split("/")[1]; M.go(repo ? `github/${b.dataset.code}/${repo}` : `github/${b.dataset.code}`); }));
    M.$$("[data-adapt]").forEach((b) => (b.onclick = () => M.adaptive.open({ candidate: M.candidate(b.dataset.adapt), skill: b.dataset.skill })));
    M.$$(".mcell").forEach((cell) => {
      const open = () => {
        const c = M.candidate(cell.dataset.c), e = M.evidenceFor(c, cell.dataset.cr);
        M.dialog({ title: `${cell.dataset.cr} · ${c.name || c.login}`, body: `<div class="stack"><div class="row">${M.evChip(e)}<span class="muted small">${esc(e.explanation)}</span></div>
          <div>${e.items.map((x) => `<div class="ev" style="margin-bottom:6px"><div class="small">${esc(x.detail)}</div>${M.srcLink(x, c)}</div>`).join("") || '<div class="faint small">Источников нет.</div>'}</div>
          <div class="faint xs">Последняя проверка: ${e.verifiedAt ? M.ago(e.verifiedAt) : "—"}. Наличие кода подтверждает использование технологии, но не глубину владения.</div></div>`,
          actions: [{ label: "Закрыть" }, ...(["unknown", "inferred"].includes(e.status) ? [{ label: "Проверить заданием", primary: true, run: () => { setTimeout(() => M.adaptive.open({ candidate: c, skill: cell.dataset.cr }), 0); } }] : [])] });
      };
      cell.onclick = open; cell.onkeydown = (ev) => ev.key === "Enter" && open();
    });
  };

  /* ======================================================================
     Analytics — real server data + funnel
     ====================================================================== */
  MeriloCharts.flow = (el, opts) => {
    const max = Math.max(1, ...opts.stages.map((s) => s.value));
    el.innerHTML = `<div class="funnel">${opts.stages.map((s, i) => {
      const prev = i ? opts.stages[i - 1].value : null;
      const conv = prev ? Math.round((s.value / Math.max(prev, 1)) * 100) : null;
      return `<div class="funnel-row"><span class="muted">${esc(s.label)}</span><span><i class="funnel-bar" style="display:block;width:${(s.value / max) * 100}%;opacity:${1 - i * 0.14};animation-delay:${i * 60}ms"></i></span><span style="text-align:right"><b class="num">${num(s.value)}</b>${conv != null ? ` <span class="faint">· ${conv}% от пред.</span>` : ""}</span></div>`;
    }).join("")}</div>`;
  };
  const oldAnalytics = M.pages.analytics;
  M.pages.analytics = (main) => {
    oldAnalytics(main);
    if ((M.query().src || "live") !== "live") return;
    const head = main.querySelector(".page-head");
    if (!head) return;
    head.insertAdjacentHTML("afterend", `<div class="card" style="margin-bottom:16px"><div class="card-head"><div><h3 class="h3">Skill Cards на сервере Merilo</h3><div class="faint xs">Источник: GET /api/cards/recent · подписанные результаты проверок</div></div><span class="badge-live">Live</span></div>
      <div class="card-body grid g3" id="srvCards">${ui.loading(3)}</div></div>`);
    api.recentCards(100).then((cards) => {
      const box = M.$("#srvCards");
      if (!box) return;
      if (!cards.length) { box.style.display = "block"; box.innerHTML = ui.empty("badge", "Карточек ещё нет", "Они появятся после первых проверенных решений."); return; }
      const W = 7 * 864e5, now = Date.now(), n = 8;
      const labels = Array.from({ length: n }, (_, i) => { const d = new Date(now - (n - 1 - i) * W); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`; });
      const hi = new Array(n).fill(0), lo = new Array(n).fill(0);
      cards.forEach((c) => { const i = n - 1 - Math.floor((now - Date.parse(c.created_at)) / W); if (i >= 0 && i < n) (c.total_score >= 70 ? hi : lo)[i] += 1; });
      const byLang = {}; cards.forEach((c) => (byLang[c.language] = (byLang[c.language] || 0) + 1));
      const bucket = (a, b) => cards.filter((c) => c.total_score >= a && c.total_score <= b).length;
      box.innerHTML = `<div><div class="small muted" style="margin-bottom:8px">Выпущено по неделям</div><div id="sc1"></div></div><div><div class="small muted" style="margin-bottom:8px">Распределение баллов</div><div id="sc2"></div></div><div><div class="small muted" style="margin-bottom:8px">Языки решений</div><div id="sc3"></div></div>`;
      MeriloCharts.stacked(M.$("#sc1"), { height: 170, labels, series: [{ name: "70 и выше", data: hi, color: "var(--chart-2)" }, { name: "ниже 70", data: lo, color: "var(--chart-3)" }] });
      MeriloCharts.hbar(M.$("#sc2"), { items: [{ label: "85–100 · Gold", value: bucket(85, 100), color: "var(--chart-2)" }, { label: "70–84 · Silver", value: bucket(70, 84), color: "var(--chart-1)" }, { label: "50–69", value: bucket(50, 69), color: "var(--chart-3)" }, { label: "0–49", value: bucket(0, 49), color: "var(--chart-5)" }] });
      MeriloCharts.hbar(M.$("#sc3"), { items: Object.entries(byLang).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value })), color: "var(--chart-4)" });
    }).catch((err) => { const box = M.$("#srvCards"); if (box) { box.style.display = "block"; box.innerHTML = ui.error(err); } });
  };

  /* ======================================================================
     Bridge: active job → server (for the extension), extension inbox → workspace
     ====================================================================== */
  M.bridge = {
    last: "",
    syncJob() {
      const j = M.activeJob();
      if (!j) return;
      const p = { title: j.title, required: j.required || [], preferred: j.preferred || [] }, sig = JSON.stringify(p);
      if (sig === this.last) return;
      this.last = sig;
      api.putActiveJob(p).catch(() => { this.last = ""; });
    },
    async pull() {
      if (document.visibilityState !== "visible") return;
      try {
        const { items } = await api.inbox();
        let lastId = null;
        for (const it of items) {
          lastId = M.saveCandidate({ id: it.login ? "gh-" + it.login : "ext-" + it.id, login: it.login || "", name: it.login || it.title || "Импорт", url: it.url, source: "Расширение · " + (it.source === "github" ? "GitHub" : it.source === "linkedin" ? "LinkedIn (только URL)" : "страница"), fetchedAt: it.ts,
            skills: it.skills || [], evidence: (it.evidence || []).map((e) => ({ skill: e.skill, kind: e.url && /#L\d+/.test(e.url) ? "dependency" : "repo", detail: e.detail, url: e.url, repo: e.repo })),
            gaps: it.source === "github" ? [] : ["Данные страницы не проверены кодом"], linkedin: it.source === "linkedin" ? { url: it.url, source: "сохранено рекрутером через расширение" } : null });
          M.notify(`Импорт из расширения: ${it.login ? "@" + it.login : it.title}`, "candidates/" + lastId);
          await api.inboxRemove(it.id);
        }
        if (items.length) {
          M.toast(`Импортировано из расширения: ${items.length}`, { action: { label: "Открыть", run: () => M.go("candidates/" + lastId) } });
          if (["candidates", "dashboard"].includes(M.ctx.page)) M.rerender();
        }
      } catch { /* server offline: nothing to import */ }
    },
  };
  const baseRender = M.render;
  M.render = () => { baseRender(); M.bridge.syncJob(); };
  window.addEventListener("focus", () => M.bridge.pull());
  setInterval(() => M.bridge.pull(), 15000);
  setTimeout(() => M.bridge.pull(), 600);
})();
