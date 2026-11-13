/* Merilo Workspace — dashboard, Talent Hunter, candidates, jobs. */
(function () {
  "use strict";
  const { esc, icon, ui, S, api } = Object.assign({}, M, { icon: M.icon });

  /* ======================================================================
     Evidence model helpers
     ====================================================================== */
  const ALIASES = { testing: ["testing", "тесты", "tests", "jest", "vitest", "pytest", "playwright"], "ci/cd": ["ci/cd", "ci", "github actions"], "open source": ["open source", "open-source", "opensource"], "node.js": ["node.js", "node", "express"] };
  const norm = (s) => String(s || "").toLowerCase().trim();
  /* Evidence categories (Skill Proof Engine):
     challenge — Verified by Challenge (signed card, AI-reviewed, not fallback)
     observed  — Observed Evidence: file:line found by deterministic detectors (or demo code facts)
     inferred  — Inference: repo name/topics/description match, no code proof
     unknown   — Not enough evidence (never a negative verdict) */
  M.proofsFor = (login) => Object.values((S.proofs || {})[login] || {}).flatMap((r) => [
    ...(r.proofs || []).map((p) => ({ ...p, repo: r.repo, checked_at: r.checked_at })),
    ...(r.languages || []).map((l) => ({ skill: l, repo: r.repo, checked_at: r.checked_at, explanation: `язык кода репозитория ${r.repo} (статистика GitHub)`, confidence: { level: "medium", reason: "Код на этом языке есть в репозитории" }, sources: [{ path: r.repo, line: 0, snippet: `${l} — язык кода в ${r.repo} (статистика GitHub)`, url: r.url || `https://github.com/${r.repo}` }] })),
  ]);
  M.evidenceFor = (c, criterion) => {
    const keys = ALIASES[norm(criterion)] || [norm(criterion)];
    const hit = (s) => { const n = norm(s); return keys.some((k) => n === k || n.split(/[,\s/]+/).includes(k) || n.startsWith(k + " ")); };
    const proofs = M.proofsFor(c.login).filter((p) => hit(p.skill));
    const codeFacts = (c.evidence || []).filter((e) => (hit(e.skill) || keys.some((k) => norm(e.skill).includes(k))) && (c.demo ? e.kind !== "repo" : ["dependency", "config", "tests", "ci", "infra", "code", "docs", "proof"].includes(e.kind)));
    const repoMatches = (c.evidence || []).filter((e) => e.kind === "repo" && (hit(e.skill) || keys.some((k) => norm(e.skill).includes(k))));
    const a = c.assessment || {};
    const challenge = a.status === "completed" && a.verified && (a.skills || []).some(hit);
    const observed = proofs.length ? proofs.flatMap((p) => p.sources.map((s) => ({ skill: p.skill, detail: s.line ? `${s.path}:${s.line} — ${s.snippet}` : s.snippet, url: s.url, kind: "proof", confidence: p.confidence }))) : codeFacts;
    const status = challenge ? "challenge" : observed.length ? "observed" : repoMatches.length || (c.skills || []).some(hit) ? "inferred" : "unknown";
    const items = status === "observed" ? observed : status === "inferred" ? repoMatches : status === "challenge" ? [{ skill: criterion, detail: `Skill Card ${a.cardHash} · ${a.score}/100 · ${a.model || ""}`, url: `#/verified/${a.cardHash}` }] : [];
    return {
      status, items,
      source: items[0]?.url || (items[0]?.repo ? (c.demo ? `DEMO · ${items[0].repo}` : `https://github.com/${items[0].repo}`) : null),
      confidence: proofs[0]?.confidence || null,
      explanation: {
        challenge: "Подтверждено заданием Merilo: решение прошло 3 шлюза, AI-ревью без fallback, карточка подписана.",
        observed: proofs.length ? `Наблюдаемое доказательство в коде (${proofs[0].confidence.level === "medium" ? "несколько файлов" : "единичное совпадение"}): ${proofs[0].explanation}` : `Факт из кода: ${items.map((e) => e.detail).filter(Boolean).slice(0, 2).join("; ")}.`,
        inferred: "Вывод по названию/описанию/темам репозитория — кода, подтверждающего навык, Merilo пока не видел.",
        unknown: "Недостаточно доказательств в изученных источниках. Это не означает отсутствие навыка.",
      }[status],
      verifiedAt: (proofs[0]?.checked_at && proofs[0].checked_at * 1000) || c.fetchedAt || c.addedAt || null,
    };
  };
  const evIcon = { challenge: ["accent", "badge", "Задание"], observed: ["ok", "check", "Код"], inferred: ["warn", "info", "Вывод"], unknown: ["", "x", "Нет данных"] };
  M.evChip = (r) => { const [cls, ic, lb] = evIcon[r.status]; return `<span class="chip ${cls}">${icon(ic, "xs")}${lb}</span>`; };
  const srcLink = (e, c) => {
    if (c?.demo || e.demo) return `<span class="faint small">${icon("file", "xs")} DEMO · ${esc(e.repo)}${e.path ? "/" + esc(e.path) : ""}</span>`;
    const url = e.url || (e.repo ? `https://github.com/${e.repo}` : null);
    return url ? `<a class="src" href="${esc(url)}" target="_blank" rel="noopener">${icon("ext", "xs")}${esc(url.replace("https://github.com/", "github.com/"))}</a>` : "";
  };
  M.srcLink = srcLink;

  /* ======================================================================
     Reusable data table (sort, filter, multi-select, keyboard, expand, menus)
     ====================================================================== */
  M.Table = function (el, cfg) {
    const st = { sort: cfg.sort || null, filter: "", sel: new Set(), focus: -1, open: new Set(), ...(cfg.state || {}) };
    let view = [];
    const rowId = cfg.rowId || ((r) => r.id);
    const draw = () => {
      const q = st.filter.toLowerCase();
      view = cfg.rows().filter((r) => !q || (cfg.filterText ? cfg.filterText(r) : JSON.stringify(r)).toLowerCase().includes(q));
      if (st.sort) {
        const col = cfg.cols.find((c) => c.key === st.sort.key);
        if (col?.sort) view.sort((a, b) => { const x = col.sort(a), y = col.sort(b); return (x > y ? 1 : x < y ? -1 : 0) * st.sort.dir; });
      }
      st.focus = Math.min(st.focus, view.length - 1);
      const ids = new Set(view.map(rowId));
      [...st.sel].forEach((id) => !ids.has(id) && st.sel.delete(id));
      const allSel = view.length && view.every((r) => st.sel.has(rowId(r)));
      el.innerHTML = `
        ${cfg.toolbar !== false ? `<div class="toolbar">${icon("filter", "sm faint")}<input class="input" data-filter placeholder="Фильтр… ( / )" value="${esc(st.filter)}" aria-label="Фильтр таблицы">${cfg.toolbarExtra || ""}<span class="spacer"></span><span class="faint small num">${view.length} ${cfg.noun || "строк"}</span></div>` : ""}
        <div class="table-wrap"><table class="t" role="grid"><thead><tr>
          <th class="w-check"><input type="checkbox" class="check-all" aria-label="Выбрать все" ${allSel ? "checked" : ""} style="accent-color:var(--accent)"></th>
          ${cfg.cols.map((c) => `<th class="${c.sort ? "sortable" : ""} ${st.sort?.key === c.key ? "sorted" : ""}" data-sort="${c.key}" style="${c.width ? `width:${c.width}` : ""}" ${c.sort ? `aria-sort="${st.sort?.key === c.key ? (st.sort.dir > 0 ? "ascending" : "descending") : "none"}"` : ""}>${c.label}${c.sort ? `<span class="arrow">${st.sort?.key === c.key && st.sort.dir < 0 ? "↓" : "↑"}</span>` : ""}</th>`).join("")}
        </tr></thead><tbody class="reveal">${view.map((r, i) => {
          const id = rowId(r);
          return `<tr class="r ${st.sel.has(id) ? "sel" : ""} ${i === st.focus ? "focus" : ""}" data-i="${i}" aria-selected="${st.sel.has(id)}">
            <td class="w-check"><input type="checkbox" class="rc" ${st.sel.has(id) ? "checked" : ""} aria-label="Выбрать" style="accent-color:var(--accent)"></td>
            ${cfg.cols.map((c) => `<td>${c.render(r)}</td>`).join("")}</tr>
            ${cfg.expand && st.open.has(id) ? `<tr class="expand"><td colspan="${cfg.cols.length + 1}"><div class="expand-inner">${cfg.expand(r)}</div></td></tr>` : ""}`;
        }).join("")}</tbody></table>
        ${view.length ? "" : cfg.empty || ui.empty("search", "Ничего не найдено", "Измените фильтр.")}</div>`;
      bulk();
      wire();
      cfg.after?.(el);
    };
    const bulk = () => {
      M.$(".bulkbar")?.remove();
      if (!st.sel.size || !cfg.bulk || !el.isConnected) return;
      const ids = [...st.sel];
      const bar = M.h(`<div class="bulkbar"><span class="small"><b class="num">${ids.length}</b> выбрано</span></div>`);
      cfg.bulk(ids).forEach((a) => {
        const b = M.h(`<button class="btn sm ${a.primary ? "primary" : ""}">${icon(a.icon || "check", "sm")}${esc(a.label)}</button>`);
        b.onclick = (e) => a.run(ids, e, () => { st.sel.clear(); draw(); });
        bar.appendChild(b);
      });
      const x = M.h(`<button class="icon-btn" aria-label="Снять выделение">${icon("x", "sm")}</button>`);
      x.onclick = () => { st.sel.clear(); draw(); };
      bar.appendChild(x);
      document.body.appendChild(bar);
    };
    const wire = () => {
      const f = el.querySelector("[data-filter]");
      if (f) f.oninput = M.debounce(() => { st.filter = f.value; draw(); el.querySelector("[data-filter]").focus(); const v = el.querySelector("[data-filter]"); v.setSelectionRange(v.value.length, v.value.length); }, 160);
      el.querySelectorAll("th[data-sort]").forEach((th) => (th.onclick = () => {
        const col = cfg.cols.find((c) => c.key === th.dataset.sort);
        if (!col?.sort) return;
        st.sort = st.sort?.key === col.key ? { key: col.key, dir: -st.sort.dir } : { key: col.key, dir: col.desc ? -1 : 1 };
        draw();
      }));
      el.querySelector(".check-all").onchange = (e) => { view.forEach((r) => (e.target.checked ? st.sel.add(rowId(r)) : st.sel.delete(rowId(r)))); draw(); };
      el.querySelectorAll("tr.r").forEach((tr) => {
        const r = view[+tr.dataset.i], id = rowId(r);
        tr.querySelector(".rc").onclick = (e) => { e.stopPropagation(); st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); draw(); };
        tr.onclick = (e) => {
          if (e.target.closest("a, button, input, select")) return;
          if (cfg.expand && e.target.closest("[data-expand]")) { st.open.has(id) ? st.open.delete(id) : st.open.add(id); st.focus = +tr.dataset.i; return draw(); }
          cfg.onOpen?.(r);
        };
        tr.oncontextmenu = (e) => { if (!cfg.menu) return; e.preventDefault(); M.menu(e.clientX, e.clientY, cfg.menu(r)); };
      });
    };
    M.keyHandler = (e) => {
      if (!el.isConnected || !view.length) return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); st.focus = Math.min(view.length - 1, st.focus + 1); draw(); el.querySelector("tr.focus")?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); st.focus = Math.max(0, st.focus - 1); draw(); el.querySelector("tr.focus")?.scrollIntoView({ block: "nearest" }); }
      else if (e.key === "x" && st.focus >= 0) { const id = rowId(view[st.focus]); st.sel.has(id) ? st.sel.delete(id) : st.sel.add(id); draw(); }
      else if (e.key === "Enter" && st.focus >= 0) cfg.onOpen?.(view[st.focus]);
      else if (e.key === "e" && st.focus >= 0 && cfg.expand) { const id = rowId(view[st.focus]); st.open.has(id) ? st.open.delete(id) : st.open.add(id); draw(); }
      else if (e.key === "Escape" && st.sel.size) { st.sel.clear(); draw(); }
    };
    draw();
    return { draw, st, selected: () => [...st.sel] };
  };
  window.addEventListener("hashchange", () => M.$(".bulkbar")?.remove());

  /* ======================================================================
     Dashboard
     ====================================================================== */
  M.pages.dashboard = (main) => {
    M.crumbs([["Обзор", "dashboard"]]);
    M.ctx.label = "Обзор";
    const cands = M.allCandidates();
    const short = cands.filter((c) => c.review === "shortlisted");
    const needInvite = short.filter((c) => !c.assessment || c.assessment.status === "none");
    const inProg = cands.filter((c) => ["invited", "in-progress"].includes(c.assessment?.status));
    const job = M.activeJob();
    M.ctx.demo = S.demo;
    M.ctx.data = { candidates_in_workspace: cands.length, shortlisted: short.map((c) => c.name || c.login), awaiting_invite: needInvite.map((c) => c.name || c.login), active_job: job?.title };
    const hour = new Date().getHours();
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1 class="h1">Обзор</h1>
        <div class="lead">${job ? `Активная вакансия: <a href="#/jobs/${job.id}" style="color:var(--text)">${esc(job.title)}</a>` : "Выберите вакансию, чтобы сравнивать кандидатов по требованиям"}${S.demo ? ` · <span class="faint">демо-записи помечены</span> <span class="badge-demo">Demo</span>` : ""}</div></div>
        <div class="actions"><button class="btn" onclick="M.go('github')">${icon("git", "sm")}Разобрать GitHub</button><button class="btn primary" onclick="M.go('talent-hunter')">${icon("radar", "sm")}Запустить агента</button></div></div>
      <div class="grid g4 reveal" style="margin-bottom:16px">
        ${kpi("Кандидатов в пространстве", cands.length, `${Object.keys(S.candidates).length} реальных`, "candidates")}
        ${kpi("В шорт-листе", short.length, needInvite.length ? `${needInvite.length} ждут задания` : "все приглашены", "candidates")}
        ${kpi("Задания в работе", inProg.length, "приглашены или выполняют", "assessments")}
        <div class="card kpi" style="cursor:pointer" onclick="M.go('verified')"><div class="k">Verified Skill Cards</div><div class="v" id="kpiCards"><span class="skel" style="display:inline-block;width:40px;height:22px"></span></div><div class="d">подписаны сервером · live</div></div>
      </div>
      <div class="grid split-2-1">
        <div class="stack">
          <div class="card"><div class="card-head"><h3 class="h3">Требует внимания</h3><span class="faint small">${needInvite.length + inProg.length} задач</span></div>
            <div>${needInvite.map((c) => `<div class="list-row link" onclick="M.go('candidates/${c.id}')">${ui.avatar(c)}<div style="min-width:0"><div>${esc(c.name || c.login)} ${c.demo ? ui.demoBadge() : ""}</div><div class="faint small">В шорт-листе без задания · пробелов: ${(c.gaps || c.missing || []).length}</div></div><span class="spacer"></span><button class="btn sm" onclick="event.stopPropagation();M.go('assessments/new?candidate=${c.id}')">${icon("clipboard", "sm")}Создать задание</button></div>`).join("")}
            ${inProg.map((c) => `<div class="list-row link" onclick="M.go('candidates/${c.id}')">${ui.avatar(c)}<div><div>${esc(c.name || c.login)} ${c.demo ? ui.demoBadge() : ""}</div><div class="faint small">Задание: ${c.assessment.status === "invited" ? "отправлена ссылка" : "выполняется"}</div></div><span class="spacer"></span>${ui.assess(c.assessment)}</div>`).join("")}
            ${!needInvite.length && !inProg.length ? ui.empty("check", "Всё разобрано", "Добавьте кандидатов в шорт-лист через Talent Hunter.") : ""}</div></div>
          <div class="card"><div class="card-head"><h3 class="h3">Недавние Skill Cards</h3>${ui.liveBadge()}<div class="actions"><a class="btn sm ghost" href="#/verified">Все</a></div></div><div id="dashCards">${ui.loading(3)}</div></div>
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3 class="h3">Активная вакансия</h3>${job?.demo ? ui.demoBadge() : ""}<div class="actions"><a class="btn sm ghost" href="#/jobs">Сменить</a></div></div>
            ${job ? `<div class="card-body stack"><a href="#/jobs/${job.id}" style="font-weight:500">${esc(job.title)}</a>
              <div><div class="faint xs" style="margin-bottom:6px">ОБЯЗАТЕЛЬНО</div><div class="row wrap">${ui.chips(job.required, "accent")}</div></div>
              <div><div class="faint xs" style="margin-bottom:6px">ЖЕЛАТЕЛЬНО</div><div class="row wrap">${ui.chips(job.preferred)}</div></div>
              <div class="row"><button class="btn sm" onclick="M.go('matching')">${icon("columns", "sm")}Сравнить кандидатов</button><button class="btn sm ghost" onclick="M.pages.jobs.hunt('${job.id}')">${icon("radar", "sm")}Найти</button></div></div>` : ui.empty("briefcase", "Нет вакансий", "Создайте вакансию, чтобы сравнивать кандидатов по критериям.", `<button class="btn" onclick="M.pages.jobs.create()">Создать</button>`)}</div>
          <div class="card"><div class="card-head"><h3 class="h3">Последние действия</h3></div><div>${activity()}</div></div>
        </div>
      </div></div>`;
    api.recentCards(5).then((cards) => {
      M.$("#kpiCards") && (M.$("#kpiCards").textContent = cards.length >= 5 ? "5+" : cards.length);
      api.recentCards(100).then((all) => M.$("#kpiCards") && (M.$("#kpiCards").textContent = all.length));
      const box = M.$("#dashCards");
      if (!box) return;
      box.innerHTML = cards.length ? cards.map((c) => `<a class="list-row link" href="#/verified/${c.card_hash}"><span class="chip ${c.total_score >= 85 ? "ok" : c.total_score >= 70 ? "accent" : "warn"} num">${c.total_score}</span><div style="min-width:0"><div style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.task_title)}</div><div class="faint small mono">${esc(c.card_hash)} · ${esc(c.language)}</div></div><span class="spacer"></span><span class="faint small">${M.ago(c.created_at)}</span></a>`).join("")
        : ui.empty("badge", "Карточек пока нет", "Они появятся, когда кандидаты пройдут задание.");
    }).catch((err) => { const b = M.$("#dashCards"); if (b) b.innerHTML = `<div class="card-body">${ui.error(err)}</div>`; if (M.$("#kpiCards")) M.$("#kpiCards").textContent = "—"; });
  };
  const kpi = (k, v, d, href) => `<div class="card kpi" style="cursor:pointer" onclick="M.go('${href}')"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`;
  function activity() {
    const map = { search_run: (e) => [`Поиск: «${(e.q || "").slice(0, 48)}»`, "radar"], candidate_saved: () => ["Кандидат сохранён", "bookmark"], review: (e) => [`Статус изменён (${e.n})`, "check"], challenge_published: (e) => [`Опубликовано задание «${e.title || ""}»`, "clipboard"], submission: (e) => [`Проверка решения: ${e.status || ""}`, "code"], copilot_ask: () => ["Вопрос Copilot", "sparkles"], github_view: (e) => [`GitHub-профиль @${e.login}`, "git"] };
    const evs = S.events.filter((e) => map[e.type]).slice(-7).reverse();
    if (!evs.length) return ui.empty("clock", "Пока пусто", "Здесь появятся ваши поиски, проверки и изменения статусов.");
    return evs.map((e) => { const [t, ic] = map[e.type](e); return `<div class="list-row">${icon(ic, "sm faint")}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t)}</span><span class="spacer"></span><span class="faint xs">${M.ago(e.ts)}</span></div>`; }).join("");
  }

  /* ======================================================================
     Talent Hunter — composer + criteria
     ====================================================================== */
  const EXAMPLES = [
    "Find React and TypeScript developers with strong open-source contributions who have worked on production-like applications.",
    "Find Python developers in Kazakhstan who have contributed to FastAPI or Django projects.",
    "Найди перспективных junior-разработчиков с сильными репозиториями на TypeScript, даже без коммерческого опыта.",
  ];
  const CRIT = [["languages", "Языки"], ["frameworks", "Фреймворки и инструменты"], ["required_skills", "Обязательные навыки"], ["preferred_skills", "Желательные навыки"], ["portfolio_evidence", "Доказательства в портфолио"]];
  M.hunter = M.hunter || { query: "", criteria: null, mode: null, notice: null, parsing: false, source: "github" };

  M.pages.hunter = (main) => {
    M.crumbs([["Talent Hunter", "talent-hunter"]]);
    M.ctx.label = "Talent Hunter";
    const H = M.hunter;
    const q = M.query();
    if (q.q && q.q !== H.query) { H.query = q.q; H.criteria = null; }
    M.ctx.data = { draft_query: H.query, criteria: H.criteria };
    const sessions = Object.values(S.searches).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    main.innerHTML = `<div class="page" style="max-width:980px">
      <div class="page-head"><div><h1 class="h1">Talent Hunter</h1><div class="lead">Опишите разработчика обычным языком. Merilo превратит запрос в редактируемые критерии и найдёт людей с подтверждением в публичном коде.</div></div></div>
      <div class="composer">
        <textarea id="hq" placeholder="Например: TypeScript + React разработчик с тестами и CI в своих проектах, можно без коммерческого опыта…" aria-label="Запрос на поиск">${esc(H.query)}</textarea>
        <div class="composer-foot">
          <span class="faint small" id="parseState">${H.parsing ? "Разбираю запрос…" : H.mode ? (H.mode === "openai" ? `${icon("sparkles", "xs")} Критерии извлечены OpenAI` : `${icon("info", "xs")} ${esc(H.notice || "Эвристический разбор")}`) : "Критерии появятся по мере ввода"}</span>
          <span class="spacer"></span>
          <div class="seg" role="radiogroup" aria-label="Источник"><button class="${H.source === "github" ? "on" : ""}" data-src="github" role="radio" aria-checked="${H.source === "github"}">GitHub · live</button><button class="${H.source === "demo" ? "on" : ""}" data-src="demo" role="radio" aria-checked="${H.source === "demo"}">Демо</button></div>
          <button class="btn primary" id="runBtn" ${H.criteria ? "" : "disabled"}>${icon("search", "sm")}Найти <kbd style="background:transparent;border-color:rgba(255,255,255,.3);color:inherit">Ctrl ↵</kbd></button>
        </div>
        <div id="crit">${criteriaHTML()}</div>
      </div>
      ${H.source === "github" ? `<p class="faint small" style="margin:10px 2px 0">${icon("shield", "xs")} Поиск идёт только по публичному GitHub через официальный API. LinkedIn не сканируется: для него нужен авторизованный партнёрский доступ (<a href="#/integrations" style="text-decoration:underline">Интеграции</a>).</p>` : `<p class="small" style="margin:10px 2px 0">${ui.demoBadge()} <span class="muted">Демо-источник: вымышленные кандидаты, этапы поиска симулируются.</span></p>`}
      <div style="margin-top:28px" class="grid g2">
        <div><div class="eyebrow" style="margin-bottom:8px">Примеры запросов</div><div class="stack tight">${EXAMPLES.map((e, i) => `<button class="example" data-ex="${i}">${esc(e)}</button>`).join("")}</div></div>
        <div><div class="eyebrow" style="margin-bottom:8px">Недавние и сохранённые поиски</div><div class="card">${sessions.length || S.savedSearches.length ? [...S.savedSearches.map((s) => ({ ...s, saved: true })), ...sessions.filter((s) => !S.savedSearches.some((x) => x.id === s.id))].slice(0, 7).map((s) => `<a class="list-row link" href="#/talent-hunter/searches/${s.id}">${icon(s.saved ? "bookmark" : "clock", "sm faint")}<span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(s.query)}</span><span class="spacer"></span>${s.source === "demo" ? ui.demoBadge() : ""}<span class="faint xs num">${(s.results || []).length}</span></a>`).join("") : ui.empty("radar", "Поисков ещё не было", "Запустите первый поиск — он сохранится здесь.")}</div></div>
      </div></div>`;
    const ta = M.$("#hq");
    const parse = M.debounce(async () => {
      const text = ta.value.trim();
      if (text.length < 8) return;
      H.parsing = true; M.$("#parseState").innerHTML = `<span class="row" style="gap:6px"><span class="spin" style="width:10px;height:10px;border-radius:50%;border:1.5px solid var(--accent);border-top-color:transparent;animation:spin .8s linear infinite;display:inline-block"></span>Разбираю запрос…</span>`;
      try {
        const res = await api.parseQuery(text);
        if (ta.value.trim() !== text) return;
        H.criteria = res.criteria; H.mode = res.mode; H.notice = res.notice;
      } catch (err) { H.notice = "Ошибка разбора: " + err.message; H.mode = "heuristic"; }
      H.parsing = false;
      if (M.ctx.page === "hunter") { M.$("#crit").innerHTML = criteriaHTML(); wireCrit(); M.$("#runBtn").disabled = !H.criteria; M.$("#parseState").innerHTML = H.mode === "openai" ? `${icon("sparkles", "xs")} Критерии извлечены OpenAI · можно редактировать` : `${icon("info", "xs")} ${esc(H.notice || "Эвристический разбор")}`; M.ctx.data = { draft_query: H.query, criteria: H.criteria }; }
    }, 650);
    ta.oninput = () => { H.query = ta.value; parse(); };
    ta.onkeydown = (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); M.$("#runBtn").click(); } };
    M.$$("[data-ex]").forEach((b) => (b.onclick = () => { ta.value = EXAMPLES[+b.dataset.ex]; H.query = ta.value; ta.focus(); parse(); }));
    M.$$("[data-src]").forEach((b) => (b.onclick = () => { H.source = b.dataset.src; M.rerender(); }));
    M.$("#runBtn").onclick = () => H.criteria && startSearch();
    wireCrit();
    if (H.query && !H.criteria) parse();
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  function criteriaHTML() {
    const c = M.hunter.criteria;
    if (!c) return "";
    const row = (key, label) => `<div class="crit-row"><div class="k">${label}</div><div class="v" data-key="${key}">${(c[key] || []).map((v, i) => `<span class="chip ${key === "required_skills" ? "accent" : ""}">${esc(v)}<button data-rm="${i}" aria-label="Убрать ${esc(v)}">${icon("x", "xs")}</button></span>`).join("")}<input class="chip-add" placeholder="+ добавить" aria-label="Добавить: ${label}"></div></div>`;
    return `<div class="criteria reveal">${c.summary ? `<div class="small muted">${icon("sparkles", "xs")} ${esc(c.summary)}</div>` : ""}
      ${CRIT.map(([k, l]) => row(k, l)).join("")}
      <div class="crit-row"><div class="k">География</div><div class="v"><input class="input" id="critLoc" style="height:24px;width:200px;font-size:12px" value="${esc(c.location || "")}" placeholder="Не важно"><span class="faint xs">только если важно для работы</span></div></div>
      <div class="crit-row"><div class="k">Опыт</div><div class="v"><div class="seg">${[["", "Любой"], ["junior", "Junior"], ["middle", "Middle"], ["senior", "Senior"]].map(([v, l]) => `<button data-exp="${v}" class="${(c.experience || "") === v ? "on" : ""}">${l}</button>`).join("")}</div>
        <label class="check" style="margin-left:12px"><input type="checkbox" id="critOss" ${c.open_source ? "checked" : ""}>Вклад в open source</label></div></div></div>`;
  }
  function wireCrit() {
    const c = M.hunter.criteria;
    if (!c) return;
    M.$$("#crit [data-key]").forEach((box) => {
      const key = box.dataset.key;
      box.querySelectorAll("[data-rm]").forEach((b) => (b.onclick = () => { c[key].splice(+b.dataset.rm, 1); M.$("#crit").innerHTML = criteriaHTML(); wireCrit(); }));
      const inp = box.querySelector(".chip-add");
      inp.onkeydown = (e) => {
        if (e.key === "Enter" && inp.value.trim()) { e.preventDefault(); (c[key] = c[key] || []).push(inp.value.trim()); M.$("#crit").innerHTML = criteriaHTML(); wireCrit(); M.$(`#crit [data-key="${key}"] .chip-add`).focus(); }
        if (e.key === "Backspace" && !inp.value && c[key]?.length) { c[key].pop(); M.$("#crit").innerHTML = criteriaHTML(); wireCrit(); M.$(`#crit [data-key="${key}"] .chip-add`).focus(); }
      };
    });
    M.$("#critLoc").oninput = (e) => (c.location = e.target.value.trim() || null);
    M.$("#critOss").onchange = (e) => (c.open_source = e.target.checked);
    M.$$("#crit [data-exp]").forEach((b) => (b.onclick = () => { c.experience = b.dataset.exp || null; M.$$("#crit [data-exp]").forEach((x) => x.classList.toggle("on", x === b)); }));
  }

  /* ---------- Search sessions ---------- */
  const STAGES = ["Понимание требований", "Поиск профилей", "Изучение репозиториев", "Извлечение доказательств", "Подготовка сравнения", "Сборка результатов"];
  function startSearch() {
    const H = M.hunter;
    const id = M.uid("s");
    const s = (S.searches[id] = { id, query: H.query.trim(), criteria: JSON.parse(JSON.stringify(H.criteria)), source: H.source, status: "running", createdAt: Date.now(), stages: STAGES.map((l) => ({ label: l, state: "wait", detail: "" })), results: [] });
    M.track("search_run", { q: s.query, source: s.source });
    M.save();
    M.go("talent-hunter/searches/" + id);
    run(s);
  }
  async function run(s) {
    const set = (i, state, detail) => { s.stages[i].state = state; if (detail != null) s.stages[i].detail = detail; M.save(); paint(s); };
    const c = s.criteria;
    const wanted = [...new Set([...(c.languages || []), ...(c.frameworks || []), ...(c.required_skills || [])])];
    try {
      set(0, "done", `${wanted.length} критериев${c.location ? " · " + c.location : ""}${c.experience ? " · " + c.experience : ""}`);
      if (s.source === "demo") {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        for (let i = 1; i < STAGES.length; i++) { set(i, "run", "симуляция"); await wait(450 + i * 80); set(i, "done", "демо"); }
        s.results = MeriloDemo.candidates.map((d) => {
          const matched = wanted.filter((w) => M.evidenceFor(d, w).status !== "unknown");
          return { ...d, matched, missing: wanted.filter((w) => !matched.includes(w)) };
        }).filter((r) => r.matched.length).sort((a, b) => b.matched.length - a.matched.length);
      } else {
        set(1, "run", "GitHub Search API");
        const res = await api.talentSearch({ languages: (c.languages || []).slice(0, 2), frameworks: (c.frameworks || []).slice(0, 3), location: c.location || null, pushed_after: new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10) });
        s.trace = res.trace;
        set(1, "done", `${res.total.toLocaleString("ru-RU")} совпадений · запрос: ${res.query}`);
        set(2, "done", `${res.results.reduce((a, r) => a + r.evidence_repos.length, 0)} репозиториев с совпадениями (тот же запрос)`);
        set(3, "run");
        const fetchedAt = Date.now();
        s.results = res.results.map((r) => ({
          id: "gh-" + r.login, login: r.login, name: r.login, avatar: r.avatar_url, url: r.url, source: "GitHub", fetchedAt,
          matched: r.matched, missing: r.missing, skills: r.matched,
          evidence: r.evidence_repos.map((e) => ({ skill: e.matched.join(", "), kind: "repo", detail: `${e.name}${e.description ? " — " + e.description : ""}`, repo: e.name, url: e.url, stars: e.stars, pushed_at: e.pushed_at })),
          repos: r.evidence_repos.map((e) => e.name), gaps: r.missing.map((m) => `Нет публичного подтверждения: ${m}`), linkedin: null, reason: r.reason, origin: r.origin,
        }));
        set(3, "done", `${s.results.reduce((a, r) => a + r.evidence.length, 0)} фактов из репозиториев`);
        set(4, "done", "сортировка по числу подтверждённых критериев");
        set(5, "done", `${s.results.length} кандидатов`);
      }
      s.status = "done";
      M.notify(`Поиск завершён: ${s.results.length} кандидатов`, "talent-hunter/searches/" + s.id);
    } catch (err) {
      const i = s.stages.findIndex((x) => x.state === "run");
      if (i >= 0) set(i, "fail", err.message);
      s.status = "error"; s.error = err.message;
    }
    M.save();
    if (location.hash.includes(s.id)) M.rerender();
  }
  function paint(s) {
    const box = M.$("#stages");
    if (!box || !location.hash.includes(s.id)) return;
    box.innerHTML = stagesHTML(s);
  }
  const stagesHTML = (s) => {
    const done = s.stages.filter((x) => x.state === "done").length;
    return `<div class="progress-line" style="margin-bottom:10px"><i style="width:${(done / s.stages.length) * 100}%"></i></div><div class="stages">${s.stages.map((st, i) => `<div class="stage ${st.state}"><span class="ic">${st.state === "done" ? icon("check", "xs") : st.state === "fail" ? icon("x", "xs") : ""}</span><span>${i + 1}. ${esc(st.label)}</span><span class="detail">${esc(st.detail)}</span></div>`).join("")}</div>`;
  };

  M.pages.search = (main, id) => {
    const s = S.searches[id];
    if (!s) { M.crumbs([["Talent Hunter", "talent-hunter"], ["Не найдено", ""]]); main.innerHTML = `<div class="page">${ui.empty("radar", "Сессия не найдена", "Возможно, данные браузера были очищены.", '<a class="btn" href="#/talent-hunter">Новый поиск</a>')}</div>`; return; }
    M.crumbs([["Talent Hunter", "talent-hunter"], [s.query.slice(0, 60), ""]]);
    M.ctx.label = "Результаты поиска";
    M.ctx.demo = s.source === "demo";
    M.ctx.data = { query: s.query, source: s.source, results: s.results.slice(0, 12).map((r) => ({ login: r.login, matched: r.matched, missing: r.missing, evidence: (r.evidence || []).slice(0, 4).map((e) => ({ skill: e.skill, detail: e.detail, url: e.url || null })) })) };
    const view = M.query().view || "list";
    const saved = S.savedSearches.some((x) => x.id === s.id);
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="row">${s.source === "demo" ? ui.demoBadge() : ui.liveBadge("GitHub live")}<span class="faint small">${M.ago(s.createdAt)}</span></div><h1 class="h1" style="margin-top:6px;max-width:820px">${esc(s.query)}</h1>
        <div class="row wrap" style="margin-top:8px">${ui.chips([...(s.criteria.languages || []), ...(s.criteria.frameworks || [])], "accent")}${s.criteria.location ? `<span class="chip">${icon("info", "xs")}${esc(s.criteria.location)}</span>` : ""}</div></div>
        <div class="actions"><button class="btn" id="saveSearch">${icon("bookmark", "sm")}${saved ? "Сохранён" : "Сохранить поиск"}</button><button class="btn" onclick="M.hunter.query=${esc(JSON.stringify(s.query))};M.hunter.criteria=${esc(JSON.stringify(s.criteria))};M.go('talent-hunter')">${icon("filter", "sm")}Уточнить</button></div></div>
      ${s.status !== "done" ? `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3 class="h3">Ход поиска</h3>${s.source === "demo" ? `<span class="faint small">Демо-режим: этапы симулируются, обращений к GitHub нет</span>` : `<span class="faint small">Этапы привязаны к реальным запросам</span>`}</div><div class="card-body" id="stages">${stagesHTML(s)}</div></div>` : ""}
      ${s.status === "error" ? ui.error(s.error) : ""}
      ${s.status === "done" ? `<details class="card" style="margin-bottom:16px"><summary class="card-head" style="cursor:pointer;list-style:none">${icon("check", "sm")}<span class="h3">Поиск выполнен</span><span class="faint small">${s.stages.map((x) => x.detail).filter(Boolean).slice(1, 3).join(" · ")}</span></summary><div class="card-body">${stagesHTML(s)}</div></details>
      <div class="row" style="margin-bottom:10px"><div class="seg"><button class="${view === "list" ? "on" : ""}" onclick="location.hash='#/talent-hunter/searches/${s.id}'">Список</button><button class="${view === "compare" ? "on" : ""}" onclick="location.hash='#/talent-hunter/searches/${s.id}?view=compare'">Сравнение</button>${s.trace ? `<button class="${view === "trace" ? "on" : ""}" onclick="location.hash='#/talent-hunter/searches/${s.id}?view=trace'">Search Trace</button>` : ""}</div><span class="faint small" style="margin-left:8px">j/k — навигация · x — выбрать · e — раскрыть · Enter — открыть</span></div>
      <div class="card" id="res"></div>` : ""}
    </div>`;
    M.$("#saveSearch").onclick = () => {
      if (saved) S.savedSearches = S.savedSearches.filter((x) => x.id !== s.id);
      else S.savedSearches.push({ id: s.id, query: s.query, source: s.source, results: s.results.map((r) => r.id) });
      M.save(); M.rerender();
    };
    if (s.status !== "done") return;
    if (!s.results.length) { M.$("#res").innerHTML = ui.empty("search", "Никого не нашли", "Сократите число критериев или уберите географию. Поиск GitHub ищет по названиям, описаниям и темам репозиториев."); return; }
    if (view === "compare") return compareView(M.$("#res"), s.results.slice(0, 4));
    if (view === "trace" && s.trace) {
      const T = s.trace;
      M.$("#res").innerHTML = `<div class="card-body stack">
        <div class="row wrap small faint">${icon("clock", "xs")} ${new Date(T.started_at * 1000).toLocaleString("ru-RU")} · ${T.duration_ms} мс · все шаги — реальные вызовы GitHub API на сервере Merilo</div>
        <div><div class="eyebrow" style="margin-bottom:6px">Критерии</div><div class="row wrap">${ui.chips([...(s.criteria.languages || []), ...(s.criteria.frameworks || [])], "accent")}${s.criteria.location ? `<span class="chip">${esc(s.criteria.location)}</span>` : ""}</div></div>
        <div><div class="eyebrow" style="margin-bottom:6px">Источники</div><div class="table-wrap"><table class="t"><thead><tr><th>Источник</th><th>Запрос</th><th style="text-align:right">Всего</th><th style="text-align:right">Получено</th></tr></thead><tbody>${T.sources.map((x) => `<tr><td>${esc(x.source)}</td><td class="mono small">${x.skipped ? `<span class="faint">${esc(x.skipped)}</span>` : esc(x.query)}</td><td class="num" style="text-align:right">${x.total == null ? "—" : x.total.toLocaleString("ru-RU")}</td><td class="num" style="text-align:right">${x.fetched}</td></tr>`).join("")}</tbody></table></div></div>
        <div><div class="eyebrow" style="margin-bottom:6px">Шаги</div>${T.steps.map((x, i) => `<div class="trace-step"><span class="chip num">${i + 1}</span><div><b style="font-weight:500">${esc(x.step)}</b> <span class="muted">— ${esc(x.detail)}</span></div></div>`).join("")}</div>
        <div><div class="eyebrow" style="margin-bottom:6px">Исключено</div>${T.excluded.length ? T.excluded.map((x) => `<div class="row small"><span class="chip num">${x.count}</span><span class="muted">${esc(x.reason)}</span></div>`).join("") : '<span class="faint small">Ничего</span>'}</div>
        <div><div class="eyebrow" style="margin-bottom:6px">Почему в шорт-листе</div>${s.results.slice(0, 10).map((r) => `<div class="row small" style="padding:3px 0"><a href="#/github/${esc(r.login)}" style="font-weight:500;width:160px">@${esc(r.login)}</a><span class="muted">${esc(r.reason || "")}</span><span class="spacer"></span><span class="faint xs">${esc(r.origin || "")}</span></div>`).join("")}</div></div>`;
      return;
    }
    M.Table(M.$("#res"), {
      rows: () => s.results, noun: "кандидатов", sort: { key: "match", dir: -1 },
      filterText: (r) => [r.login, r.name, ...(r.matched || []), ...(r.evidence || []).map((e) => e.detail)].join(" "),
      cols: [
        { key: "name", label: "Кандидат", sort: (r) => r.login, render: (r) => `<div class="cell-main"><button class="icon-btn" data-expand style="width:22px;height:22px" aria-label="Раскрыть">${icon("chevR", "xs")}</button>${ui.avatar(r)}<div><div class="nm">${esc(r.name || r.login)} ${r.demo ? ui.demoBadge() : ""}</div><div class="faint xs">${esc(r.source)}${r.location ? " · " + esc(r.location) : ""}</div></div></div>` },
        { key: "match", label: "Подтверждено", sort: (r) => r.matched.length, desc: true, render: (r) => `<div class="tags">${ui.chips(r.matched, "ok")}</div>` },
        { key: "miss", label: "Нет доказательств", sort: (r) => r.missing.length, render: (r) => `<div class="tags">${r.missing.length ? ui.chips(r.missing.slice(0, 3), "warn") : '<span class="faint">—</span>'}</div>` },
        { key: "repos", label: "Репозитории", sort: (r) => (r.evidence || []).length, render: (r) => `<span class="num">${(r.evidence || []).length}</span>` },
        { key: "as", label: "Задание", render: (r) => ui.assess(M.candidate(r.id)?.assessment || r.assessment) },
        { key: "act", label: "", width: "120px", render: (r) => `<button class="btn sm ${S.candidates[r.id] || r.demo ? "ghost" : ""}" data-save="${r.id}">${S.candidates[r.id] || r.demo ? icon("check", "sm") + "В пространстве" : icon("bookmark", "sm") + "Сохранить"}</button>` },
      ],
      expand: (r) => `<div class="stack tight"><div class="ev-k">${icon("eye", "xs")}<span class="fact-tag obs">НАБЛЮДЕНИЕ</span> Доказательства</div>${(r.evidence || []).map((e) => `<div class="ev"><div class="small">${esc(e.detail)}</div><div class="row wrap">${e.skill ? `<span class="chip ok">${esc(e.skill)}</span>` : ""}${e.stars != null ? `<span class="faint xs">★ ${e.stars}</span>` : ""}${e.pushed_at ? `<span class="faint xs">обновлён ${M.ago(e.pushed_at)}</span>` : ""}</div>${srcLink(e, r)}</div>`).join("") || '<span class="faint">Нет</span>'}</div>
        <div class="stack tight"><div class="ev-k"><span class="fact-tag gap">ПРОБЕЛ</span> Чего не видно</div>${(r.gaps || r.missing.map((m) => "Нет подтверждения: " + m)).map((g) => `<div class="small muted">• ${esc(g)}</div>`).join("") || '<span class="faint">—</span>'}
          <div class="small muted">• Коммерческий опыт и работа в команде из публичного кода не устанавливаются</div>
          <div class="row" style="margin-top:6px"><button class="btn sm" onclick="M.go('github/${esc(r.login)}')">${icon("git", "sm")}GitHub Intelligence</button><button class="btn sm" data-save-open="${r.id}">${icon("clipboard", "sm")}Задание</button></div>
          <div class="faint xs">LinkedIn: ${r.linkedin ? `<a class="src" href="${esc(r.linkedin.url)}">${esc(r.linkedin.url)}</a> (источник: ${esc(r.linkedin.source)})` : "не искали — нет авторизованного провайдера"}</div></div>`,
      onOpen: (r) => { if (!r.demo) M.saveCandidate(r); M.go("candidates/" + r.id); },
      menu: (r) => [{ label: "Открыть", icon: "arrowR", run: () => { if (!r.demo) M.saveCandidate(r); M.go("candidates/" + r.id); } }, { label: "GitHub Intelligence", icon: "git", run: () => M.go("github/" + r.login) }, { label: "Сохранить в пространство", icon: "bookmark", run: () => { if (!r.demo) M.saveCandidate(r); M.toast("Сохранено"); M.rerender(); } }],
      bulk: (ids) => [
        { label: "Сохранить", icon: "bookmark", run: (ids, e, clear) => { ids.forEach((id) => { const r = s.results.find((x) => x.id === id); if (r && !r.demo) M.saveCandidate(r); }); M.toast(`Сохранено: ${ids.length}`); clear(); } },
        { label: "Сравнить", icon: "columns", primary: true, run: (ids) => { ids.forEach((id) => { const r = s.results.find((x) => x.id === id); if (r && !r.demo) M.saveCandidate(r); }); M.go("matching?ids=" + ids.join(",")); } },
      ],
      after: (el) => {
        el.querySelectorAll("[data-save]").forEach((b) => (b.onclick = () => { const r = s.results.find((x) => x.id === b.dataset.save); if (r.demo) return M.toast("Демо-кандидаты уже в пространстве", { icon: "info" }); M.saveCandidate(r); M.toast("Кандидат сохранён в пространство"); b.innerHTML = icon("check", "sm") + "В пространстве"; b.classList.add("ghost"); }));
        el.querySelectorAll("[data-save-open]").forEach((b) => (b.onclick = () => { const r = s.results.find((x) => x.id === b.dataset.saveOpen); if (!r.demo) M.saveCandidate(r); M.go("assessments/new?candidate=" + r.id); }));
      },
    });
  };

  function compareView(el, list) {
    const job = M.activeJob();
    const crit = [...new Set([...(job?.required || []), ...list.flatMap((r) => r.matched || [])])].slice(0, 8);
    el.innerHTML = `<div class="grid" style="grid-template-columns:repeat(${list.length},minmax(220px,1fr));gap:0;overflow:auto">${list.map((r) => `<div style="border-right:1px solid var(--border-soft);padding:16px" class="stack">
      <div class="row">${ui.avatar(r, "lg")}<div><div style="font-weight:600">${esc(r.name || r.login)}</div><div class="faint xs">${esc(r.source)} ${r.demo ? ui.demoBadge() : ""}</div></div></div>
      <div class="stack tight">${crit.map((cr) => { const ev = M.evidenceFor(r, cr); return `<div class="row" title="${esc(ev.explanation)}"><span class="small" style="flex:1">${esc(cr)}</span>${M.evChip(ev)}</div>`; }).join("")}</div>
      <div class="divider"></div><div class="faint xs">Репозиториев с совпадениями: <b class="num">${(r.evidence || []).length}</b></div>
      <button class="btn sm" onclick="${r.demo ? "" : `M.saveCandidate(M.S.searches[location.hash.split('/')[3].split('?')[0]].results.find(x=>x.id==='${r.id}'));`}M.go('candidates/${r.id}')">Открыть</button></div>`).join("")}</div>
      <div class="faint xs" style="padding:10px 16px;border-top:1px solid var(--border-soft)">Критерии: ${job ? `вакансия «${esc(job.title)}» + ` : ""}совпадения поиска. Это сравнение доказательств, а не рейтинг людей.</div>`;
  }

  /* ======================================================================
     Candidates
     ====================================================================== */
  M.pages.candidates = (main) => {
    M.crumbs([["Кандидаты", "candidates"]]);
    M.ctx.label = "Кандидаты";
    const filter = M.query().status || "all";
    const rows = () => M.allCandidates().filter((c) => filter === "all" || c.review === filter);
    M.ctx.demo = S.demo;
    M.ctx.data = { candidates: rows().slice(0, 20).map((c) => ({ id: c.id, name: c.name || c.login, review: c.review, skills: c.skills || c.matched, gaps: c.gaps || c.missing, assessment: c.assessment?.status })) };
    const counts = Object.fromEntries(M.REVIEW.map(([k]) => [k, M.allCandidates().filter((c) => c.review === k).length]));
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1 class="h1">Кандидаты</h1><div class="lead">Все сохранённые разработчики, их доказательства и статус проверки. ПКМ по строке — действия.</div></div>
        <div class="actions"><button class="btn primary" onclick="M.go('talent-hunter')">${icon("radar", "sm")}Найти ещё</button></div></div>
      <div class="row" style="margin-bottom:10px"><div class="seg">${[["all", `Все · ${M.allCandidates().length}`], ...M.REVIEW.map(([k, l]) => [k, `${l} · ${counts[k]}`])].map(([k, l]) => `<button class="${filter === k ? "on" : ""}" onclick="location.hash='#/candidates${k === "all" ? "" : "?status=" + k}'">${l}</button>`).join("")}</div></div>
      <div class="card" id="ct"></div></div>`;
    if (!M.allCandidates().length) { M.$("#ct").innerHTML = ui.empty("users", "Кандидатов пока нет", "Найдите разработчиков в Talent Hunter или включите демо-данные в настройках.", '<a class="btn primary" href="#/talent-hunter">Открыть Talent Hunter</a>'); return; }
    M.Table(M.$("#ct"), {
      rows, noun: "кандидатов", sort: { key: "added", dir: -1 },
      filterText: (c) => [c.name, c.login, c.location, ...(c.skills || []), ...(c.matched || [])].join(" "),
      cols: [
        { key: "name", label: "Кандидат", sort: (c) => (c.name || c.login).toLowerCase(), render: (c) => `<div class="cell-main">${ui.avatar(c)}<div><div class="nm">${esc(c.name || c.login)} ${c.demo ? ui.demoBadge() : ""}</div><div class="faint xs">${esc(c.headline || c.source || "")}</div></div></div>` },
        { key: "skills", label: "Подтверждённые навыки", render: (c) => `<div class="tags">${ui.chips((c.skills || c.matched || []).slice(0, 4))}</div>` },
        { key: "gaps", label: "Пробелы", sort: (c) => (c.gaps || c.missing || []).length, render: (c) => { const n = (c.gaps || c.missing || []).length; return n ? `<span class="chip warn num">${n}</span>` : '<span class="faint">—</span>'; } },
        { key: "review", label: "Статус", sort: (c) => c.review, render: (c) => ui.review(c.review) },
        { key: "as", label: "Задание", sort: (c) => c.assessment?.score ?? -1, desc: true, render: (c) => ui.assess(c.assessment) },
        { key: "added", label: "Добавлен", sort: (c) => c.addedAt || 0, desc: true, render: (c) => `<span class="faint small">${M.ago(c.addedAt)}</span>` },
      ],
      onOpen: (c) => M.go("candidates/" + c.id),
      menu: (c) => [
        { label: "Открыть", icon: "arrowR", run: () => M.go("candidates/" + c.id) },
        ...M.REVIEW.map(([k, l]) => ({ label: "Статус: " + l, icon: "check", run: () => M.setReview([c.id], k) })),
        "-", { label: "Создать задание", icon: "clipboard", run: () => M.go("assessments/new?candidate=" + c.id) },
        { label: "Удалить из пространства", icon: "trash", danger: true, run: () => M.removeCandidates([c.id]) },
      ],
      bulk: () => [
        { label: "В шорт-лист", icon: "star", run: (ids, e, clear) => { M.setReview(ids, "shortlisted"); clear(); } },
        { label: "Статус…", icon: "check", run: (ids, e, clear) => M.menu(e.clientX, e.clientY - 180, M.REVIEW.map(([k, l]) => ({ label: l, run: () => { M.setReview(ids, k); clear(); } }))) },
        { label: "Сравнить", icon: "columns", primary: true, run: (ids) => M.go("matching?ids=" + ids.join(",")) },
        { label: "Удалить", icon: "trash", run: (ids, e, clear) => { M.removeCandidates(ids); clear(); } },
      ],
    });
  };

  M.pages.candidate = (main, id) => {
    const c = M.candidate(id);
    if (!c) { M.crumbs([["Кандидаты", "candidates"], ["Не найден", ""]]); main.innerHTML = `<div class="page">${ui.empty("users", "Кандидат не найден", S.demo ? "Возможно, он был удалён." : "Если это демо-кандидат — включите демо-данные.", '<a class="btn" href="#/candidates">К списку</a>')}</div>`; return; }
    M.crumbs([["Кандидаты", "candidates"], [c.name || c.login, ""]]);
    M.ctx.label = c.name || c.login;
    M.ctx.demo = !!c.demo;
    M.ctx.data = { candidate: { name: c.name || c.login, github: c.url || (c.demo ? "DEMO" : null), location: c.location, headline: c.headline, skills: c.skills || c.matched, evidence: (c.evidence || []).map((e) => ({ skill: e.skill, detail: e.detail, source: e.url || e.repo })), gaps: c.gaps || c.missing, review_status: c.review, assessment: c.assessment, recruiter_notes: S.notes[c.id] || "" } };
    const job = M.activeJob();
    main.innerHTML = `<div class="page">
      <div class="page-head" style="align-items:center">${ui.avatar(c, "xl")}<div><div class="row"><h1 class="h1">${esc(c.name || c.login)}</h1>${c.demo ? ui.demoBadge() : ui.liveBadge(c.source || "GitHub")}</div>
        <div class="muted" style="margin-top:2px">${esc(c.headline || "")}${c.location ? ` · ${esc(c.location)}` : ""}</div>
        <div class="row wrap small" style="margin-top:6px">${c.url ? `<a class="src" style="color:var(--accent-text)" href="${esc(c.url)}" target="_blank" rel="noopener">${icon("git", "xs")} ${esc(c.url.replace("https://", ""))}</a>` : `<span class="faint">${icon("git", "xs")} ${c.demo ? "демо-профиль, внешних ссылок нет" : "—"}</span>`}<span class="faint">·</span><span class="faint" title="Merilo не скрапит LinkedIn">LinkedIn: ${c.linkedin ? `<a href="${esc(c.linkedin.url)}">${esc(c.linkedin.url)}</a>` : "не найден"}</span></div></div>
        <div class="actions"><button class="btn" onclick="M.go('github/${esc(c.login)}')">${icon("git", "sm")}GitHub Intelligence</button><button class="btn" onclick="M.copilot.open();M.copilot.ask('Кратко опиши публичные доказательства и пробелы этого кандидата')">${icon("sparkles", "sm")}Спросить Copilot</button><button class="btn primary" onclick="M.go('assessments/new?candidate=${c.id}')">${icon("clipboard", "sm")}Создать Skill Challenge</button></div></div>
      <div class="grid split-2-1">
        <div class="stack">
          <div class="card"><div class="card-head"><span class="fact-tag obs">НАБЛЮДЕНИЕ</span><h3 class="h3">Технические доказательства</h3><span class="faint small">${(c.evidence || []).length} фактов</span></div>
            <div class="card-body stack tight reveal">${(c.evidence || []).map((e) => `<div class="ev"><div class="row"><span class="chip ok">${esc(e.skill || "Код")}</span><span class="small">${esc(e.detail)}</span></div>${srcLink(e, c)}</div>`).join("") || ui.empty("file", "Нет доказательств", "Откройте GitHub Intelligence, чтобы изучить репозитории.")}</div></div>
          <div class="card"><div class="card-head"><span class="fact-tag gap">ПРОБЕЛЫ</span><h3 class="h3">Что не установлено</h3></div>
            <div class="card-body stack tight">${[...(c.gaps || (c.missing || []).map((m) => "Нет публичного подтверждения: " + m)), "Коммерческий опыт и командная работа не видны в публичном коде"].map((g) => `<div class="row small"><span class="muted" style="flex:1">${esc(g)}</span></div>`).join("")}
              <button class="btn sm" style="justify-self:start;margin-top:4px" onclick="M.go('assessments/new?candidate=${c.id}')">${icon("clipboard", "sm")}Закрыть пробелы заданием</button></div></div>
          ${job ? `<div class="card"><div class="card-head"><h3 class="h3">Соответствие вакансии</h3><a class="faint small" href="#/jobs/${job.id}">${esc(job.title)}</a></div><div>${[...job.required.map((r) => [r, true]), ...job.preferred.map((r) => [r, false])].map(([cr, req]) => { const ev = M.evidenceFor(c, cr); return `<div class="list-row"><span style="flex:1">${esc(cr)} ${req ? '<span class="faint xs">обязательно</span>' : ""}</span><span class="faint small" style="max-width:50%;text-align:right">${esc(ev.explanation)}</span>${M.evChip(ev)}</div>`; }).join("")}</div></div>` : ""}
        </div>
        <div class="stack">
          <div class="card"><div class="card-head"><h3 class="h3">Решение рекрутера</h3></div><div class="card-body stack">
            <div class="field"><label for="rv">Статус</label><select class="select" id="rv">${M.REVIEW.map(([k, l]) => `<option value="${k}" ${c.review === k ? "selected" : ""}>${l}</option>`).join("")}</select></div>
            <div class="field"><label for="nt">Заметки (видны только вам)</label><textarea class="textarea" id="nt" rows="5" placeholder="Наблюдения, вопросы для интервью…">${esc(S.notes[c.id] || "")}</textarea><span class="faint xs" id="ntSaved"></span></div>
            <div class="banner info small">${icon("shield")}<span>AI помогает собрать доказательства, но решение о найме принимает человек. Merilo не делает выводов о защищённых характеристиках.</span></div></div></div>
          <div class="card"><div class="card-head"><h3 class="h3">Задание</h3></div><div class="card-body stack tight">${ui.assess(c.assessment)}${c.assessment?.tier ? `<div class="small muted">${esc(c.assessment.tier)}</div>` : ""}${c.assessment?.cardHash ? `<a class="btn sm" href="#/verified/${c.assessment.cardHash}">${icon("badge", "sm")}Skill Card</a>` : ""}${c.assessment?.demo ? '<div class="faint xs">Демо-результат — не является выданной карточкой.</div>' : ""}</div></div>
          <div class="card"><div class="card-head"><h3 class="h3">Данные и приватность</h3></div><div class="card-body stack tight small muted">
            <div>Источник: ${esc(c.demo ? "демо-набор" : c.source || "GitHub")} · получено ${M.ago(c.fetchedAt || c.addedAt)}</div><div>Хранится только в этом браузере.</div>
            <button class="btn sm danger" style="justify-self:start" id="delC">${icon("trash", "sm")}Удалить данные кандидата</button></div></div>
        </div></div></div>`;
    M.$("#rv").onchange = (e) => M.setReview([c.id], e.target.value);
    M.$("#nt").oninput = M.debounce((e) => { S.notes[c.id] = M.$("#nt").value; M.save(); M.$("#ntSaved").textContent = "Сохранено"; }, 400);
    M.$("#delC").onclick = async () => { if (await M.confirm("Удалить кандидата?", "Данные, заметки и статус удалятся из этого браузера. Действие можно отменить в течение нескольких секунд.", "Удалить", true)) { delete S.notes[c.id]; M.removeCandidates([c.id]); M.go("candidates"); } };
  };

  /* ======================================================================
     Jobs
     ====================================================================== */
  M.pages.jobs = (main) => {
    M.crumbs([["Вакансии", "jobs"]]);
    M.ctx.label = "Вакансии";
    const jobs = M.allJobs();
    M.ctx.data = { jobs: jobs.map((j) => ({ title: j.title, required: j.required, preferred: j.preferred })) };
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1 class="h1">Вакансии</h1><div class="lead">Вакансия — это набор критериев, по которым Merilo ищет доказательства. Активная вакансия используется в Matching Lab и Copilot.</div></div>
        <div class="actions"><button class="btn primary" onclick="M.pages.jobs.create()">${icon("plus", "sm")}Новая вакансия</button></div></div>
      <div class="card">${jobs.length ? jobs.map((j) => {
        const cands = M.allCandidates();
        const covered = cands.filter((c) => j.required.every((r) => M.evidenceFor(c, r).status !== "unknown")).length;
        return `<div class="list-row link" onclick="M.go('jobs/${j.id}')" style="padding:14px 16px">${icon("briefcase", "faint")}<div style="min-width:0;flex:1"><div class="row"><b style="font-weight:500">${esc(j.title)}</b>${j.demo ? ui.demoBadge() : ""}${S.activeJob === j.id ? '<span class="chip accent">Активная</span>' : ""}</div><div class="row wrap" style="margin-top:6px">${ui.chips(j.required, "accent")}${ui.chips(j.preferred)}</div></div>
          <div style="text-align:right" class="hide-sm"><div class="num" style="font-weight:600">${covered}/${cands.length}</div><div class="faint xs">с доказательствами по всем обязательным</div></div></div>`;
      }).join("") : ui.empty("briefcase", "Вакансий нет", "Создайте первую вакансию.", `<button class="btn primary" onclick="M.pages.jobs.create()">Создать</button>`)}</div></div>`;
  };
  M.pages.jobs.create = (existing) => {
    const j = existing || { title: "", team: "", required: [], preferred: [], notes: "" };
    M.dialog({
      title: existing ? "Редактировать вакансию" : "Новая вакансия",
      body: `<div class="stack"><div class="field"><label>Название</label><input class="input" id="jt" value="${esc(j.title)}" placeholder="Frontend-разработчик (React)"></div>
        <div class="field"><label>Команда</label><input class="input" id="jteam" value="${esc(j.team)}"></div>
        <div class="field"><label>Обязательные навыки (через запятую)</label><input class="input" id="jr" value="${esc(j.required.join(", "))}" placeholder="TypeScript, React, Testing"></div>
        <div class="field"><label>Желательные навыки</label><input class="input" id="jp" value="${esc(j.preferred.join(", "))}" placeholder="Next.js, CI/CD"></div>
        <div class="field"><label>Заметки</label><textarea class="textarea" id="jn" rows="3">${esc(j.notes)}</textarea></div>
        <div class="faint xs">Не указывайте возраст, пол, национальность и другие защищённые характеристики — Merilo их не использует.</div></div>`,
      actions: [{ label: "Отмена" }, { label: existing ? "Сохранить" : "Создать", primary: true, run: (dlg) => {
        const title = M.$("#jt", dlg).value.trim();
        if (title.length < 3) { M.toast("Укажите название", { error: true }); return false; }
        const split = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);
        const id = existing && !existing.demo ? existing.id : M.uid("job");
        S.jobs[id] = { id, title, team: M.$("#jteam", dlg).value.trim(), required: split(M.$("#jr", dlg).value), preferred: split(M.$("#jp", dlg).value), notes: M.$("#jn", dlg).value, status: "open", createdAt: Date.now() };
        S.activeJob = id; M.save(); M.go("jobs/" + id);
      } }],
    });
  };
  M.pages.jobs.hunt = (id) => {
    const j = M.job(id);
    M.hunter.query = `${j.title}. Обязательно: ${j.required.join(", ")}. Желательно: ${j.preferred.join(", ")}.`;
    M.hunter.criteria = null;
    M.go("talent-hunter");
  };
  M.pages.job = (main, id) => {
    const j = M.job(id);
    if (!j) { M.crumbs([["Вакансии", "jobs"], ["Не найдена", ""]]); main.innerHTML = `<div class="page">${ui.empty("briefcase", "Вакансия не найдена", "", '<a class="btn" href="#/jobs">К списку</a>')}</div>`; return; }
    M.crumbs([["Вакансии", "jobs"], [j.title, ""]]);
    M.ctx.label = j.title; M.ctx.demo = !!j.demo;
    M.ctx.data = { job: j };
    const crit = [...j.required.map((r) => [r, true]), ...j.preferred.map((r) => [r, false])];
    const cands = M.allCandidates();
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><div class="row"><h1 class="h1">${esc(j.title)}</h1>${j.demo ? ui.demoBadge() : ""}</div><div class="lead">${esc(j.team || "")}${j.notes ? " · " + esc(j.notes) : ""}</div></div>
        <div class="actions">${S.activeJob === j.id ? '<span class="chip accent">Активная вакансия</span>' : `<button class="btn" id="mkActive">Сделать активной</button>`}<button class="btn" id="editJob">Редактировать</button><button class="btn" onclick="M.go('matching')">${icon("columns", "sm")}Matching Lab</button><button class="btn primary" onclick="M.pages.jobs.hunt('${j.id}')">${icon("radar", "sm")}Найти кандидатов</button></div></div>
      <div class="card"><div class="card-head"><h3 class="h3">Покрытие критериев доказательствами</h3><span class="faint small">${cands.length} кандидатов в пространстве</span></div>
        <div class="table-wrap"><table class="t"><thead><tr><th>Критерий</th><th>Тип</th><th>С доказательствами</th><th style="width:40%">Покрытие</th></tr></thead><tbody>${crit.map(([cr, req]) => {
          const n = cands.filter((c) => ["observed", "challenge"].includes(M.evidenceFor(c, cr).status)).length;
          const pct = cands.length ? Math.round((n / cands.length) * 100) : 0;
          return `<tr><td>${esc(cr)}</td><td>${req ? '<span class="chip accent">обязательно</span>' : '<span class="chip">желательно</span>'}</td><td class="num">${n} / ${cands.length}</td><td><div class="row"><div class="meter" style="flex:1"><i style="width:${pct}%"></i></div><span class="num faint small" style="width:36px;text-align:right">${pct}%</span></div></td></tr>`;
        }).join("")}</tbody></table></div></div></div>`;
    M.$("#mkActive")?.addEventListener("click", () => { S.activeJob = j.id; M.save(); M.rerender(); });
    M.$("#editJob").onclick = () => M.pages.jobs.create(j);
  };
})();
