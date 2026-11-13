/* Merilo Workspace — GitHub Intelligence, Matching, Assessments, Challenge, Verified, Analytics, Extension, Settings. */
(function () {
  "use strict";
  const { esc, ui, S, api } = M;
  const icon = M.icon;
  const LANG_COLORS = { TypeScript: "#3178c6", JavaScript: "#e3c64a", Python: "#4b8bbe", Go: "#00add8", Java: "#c07a3a", "C#": "#68217a", Rust: "#c4612f", Ruby: "#c0392b", PHP: "#777bb3", Kotlin: "#a97bff", Swift: "#f05138", CSS: "#7c5cbf", HTML: "#e34c26", Shell: "#89e051", "C++": "#f34b7d", C: "#7a8a99" };
  const langColor = (l, i) => LANG_COLORS[l] || MeriloCharts.PALETTE[i % 5];
  const LANGS = [["python", "Python"], ["javascript", "JavaScript"], ["typescript", "TypeScript"], ["java", "Java"], ["go", "Go"], ["csharp", "C#"], ["kotlin", "Kotlin"], ["rust", "Rust"], ["cpp", "C++"], ["php", "PHP"], ["ruby", "Ruby"], ["swift", "Swift"]];
  const langKey = (l) => (LANGS.find(([k, n]) => n.toLowerCase() === String(l || "").toLowerCase() || k === String(l || "").toLowerCase()) || [])[0];
  const SIG = [["tests", "Тесты"], ["ci", "CI/CD"], ["readme", "README"], ["lint", "Линтер"], ["docker", "Docker"], ["typescript", "Типизация TS"], ["license", "Лицензия"]];

  /* ======================================================================
     GitHub Intelligence — profile
     ====================================================================== */
  M.pages.github = (main, login) => {
    M.crumbs(login ? [["GitHub Intelligence", "github"], ["@" + login, ""]] : [["GitHub Intelligence", "github"]]);
    M.ctx.label = login ? "@" + login : "GitHub Intelligence";
    const recent = (S.recent || []).slice(0, 8);
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1 class="h1">GitHub Intelligence</h1><div class="lead">Разбор публичного портфолио: факты из репозиториев отдельно, интерпретации отдельно. Звёзды и число коммитов не считаются доказательством компетенции.</div></div></div>
      <form class="row" id="ghForm" style="margin-bottom:18px;max-width:560px"><div class="row" style="flex:1;position:relative">${icon("git", "sm faint")}<input class="input" id="ghLogin" placeholder="GitHub login, например torvalds" value="${esc(login || "")}" aria-label="GitHub login" autocomplete="off"></div><button class="btn primary">Разобрать</button></form>
      ${!login ? `<div class="grid g2"><div class="card"><div class="card-head"><h3 class="h3">Недавно просмотренные</h3></div>${recent.length ? recent.map((l) => `<a class="list-row link" href="#/github/${esc(l)}">${icon("git", "sm faint")}@${esc(l)}</a>`).join("") : ui.empty("git", "Пусто", "Введите login, чтобы начать.")}</div>
        <div class="card"><div class="card-head"><h3 class="h3">Как читать анализ</h3></div><div class="card-body stack tight small muted">
          <div><span class="fact-tag obs">НАБЛЮДЕНИЕ</span> — факт из API GitHub со ссылкой на источник.</div>
          <div><span class="fact-tag ai">AI</span> — интерпретация модели, всегда помечена и требует проверки.</div>
          <div><span class="fact-tag gap">ПРОБЕЛ</span> — то, что нельзя установить по публичному коду.</div>
          ${S.demo ? `<div class="divider"></div><div>Демо-профили: ${MeriloDemo.candidates.map((c) => `<a href="#/github/${c.login}" style="color:var(--accent-text)">${c.login}</a>`).join(", ")}</div>` : ""}</div></div></div>` : `<div id="ghBody">${ui.loading(6)}</div>`}</div>`;
    M.$("#ghForm").onsubmit = (e) => { e.preventDefault(); const v = M.$("#ghLogin").value.trim().replace(/^@|^https?:\/\/github\.com\//g, "").split("/")[0]; if (v) M.go("github/" + v); };
    if (!login) return M.$("#ghLogin").focus();
    api.ghUser(login).then((d) => renderProfile(d, login)).catch((err) => { const b = M.$("#ghBody"); if (b) { b.innerHTML = ui.error(err, true); b.querySelector("[data-retry]")?.addEventListener("click", () => M.rerender()); } });
  };

  function renderProfile(d, login) {
    const box = M.$("#ghBody");
    if (!box) return;
    S.recent = [login, ...(S.recent || []).filter((l) => l !== login)].slice(0, 12);
    M.track("github_view", { login });
    const p = d.profile, demo = !!d.demo;
    const inspected = d.repos.filter((r) => r.inspected);
    const sigCount = (k) => inspected.filter((r) => r.signals?.[k]).length;
    const langs = Object.entries(d.languages).sort((a, b) => b[1] - a[1]);
    const totalL = langs.reduce((a, [, n]) => a + n, 0) || 1;
    const skills = [...langs.map(([l]) => ({ skill: l, kind: "language", repos: d.repos.filter((r) => r.language === l) })),
      ...SIG.filter(([k]) => sigCount(k)).map(([k, l]) => ({ skill: l, kind: "practice", repos: inspected.filter((r) => r.signals?.[k]) }))];
    const gaps = [
      ...SIG.filter(([k]) => ["tests", "ci"].includes(k) && !sigCount(k)).map(([, l]) => `${l}: не найдено в ${inspected.length} изученных репозиториях`),
      "Продакшен-опыт и нагрузка не устанавливаются по публичному коду",
      "Код-ревью и командная работа не видны без истории PR в чужих проектах",
      "Авторство кода не подтверждено (возможны шаблоны, курсы, AI-генерация)",
    ];
    M.ctx.demo = demo;
    M.ctx.data = { github_profile: { login: p.login, name: p.name, bio: p.bio, location: p.location, public_repos: p.public_repos, created_at: p.created_at }, languages_by_repo_count: d.languages, observed_signals: Object.fromEntries(SIG.map(([k, l]) => [l, `${sigCount(k)}/${inspected.length}`])), repos: d.repos.slice(0, 15).map((r) => ({ name: r.name, url: r.url, language: r.language, description: r.description, topics: r.topics, pushed_at: r.pushed_at, signals: r.signals })), limits: d.limits };
    M.copilot.refreshContext();
    const cand = { id: demo ? login : "gh-" + login, login, name: p.name || login, avatar: p.avatar_url, url: p.url, location: p.location, headline: p.bio, source: "GitHub", fetchedAt: Date.now(),
      skills: skills.map((s) => s.skill).slice(0, 8), evidence: skills.slice(0, 10).map((s) => ({ skill: s.skill, kind: s.kind, detail: `${s.repos.length} репоз.: ${s.repos.slice(0, 3).map((r) => r.name).join(", ")}`, repo: s.repos[0]?.full_name, url: s.repos[0]?.url })), gaps, matched: [], missing: [] };
    box.innerHTML = `
      <div class="card" style="margin-bottom:16px"><div class="card-body row wrap" style="gap:16px;align-items:flex-start">
        ${ui.avatar({ avatar: p.avatar_url, name: p.name || p.login }, "xl")}
        <div style="flex:1;min-width:240px"><div class="row"><h2 style="font-size:18px">${esc(p.name || p.login)}</h2>${demo ? ui.demoBadge() : ui.liveBadge("GitHub API")}</div>
          <div class="muted">${p.url ? `<a href="${esc(p.url)}" target="_blank" rel="noopener" style="color:var(--accent-text)">@${esc(p.login)}</a>` : "@" + esc(p.login)}${p.location ? ` · ${esc(p.location)}` : ""}${p.company ? ` · ${esc(p.company)}` : ""}</div>
          ${p.bio ? `<div class="small" style="margin-top:6px">${esc(p.bio)}</div>` : ""}
          <div class="faint xs" style="margin-top:6px">На GitHub с ${p.created_at ? M.date(p.created_at) : "—"} · данные получены ${M.ago(d.fetched_at)}</div></div>
        <div class="row">${demo ? "" : `<button class="btn" onclick="M.go('dna/${esc(login)}')">${icon("git", "sm")}Developer DNA</button>`}<button class="btn" id="saveGh">${icon("bookmark", "sm")}${S.candidates["gh-" + login] || demo ? "В пространстве" : "Сохранить кандидата"}</button><button class="btn primary" id="mkCh">${icon("clipboard", "sm")}Create Skill Challenge</button></div></div>
        <div style="padding:0 16px 14px"><div class="lang-bar">${langs.map(([l, n], i) => `<i style="width:${(n / totalL) * 100}%;background:${langColor(l, i)}" title="${esc(l)}: ${n}"></i>`).join("")}</div>
          <div class="legend" style="margin-top:8px">${langs.slice(0, 8).map(([l, n], i) => `<span class="row" style="gap:6px"><span class="sw" style="background:${langColor(l, i)}"></span>${esc(l)} <span class="faint num">${n}</span></span>`).join("")}<span class="faint">— языки по числу собственных репозиториев</span></div></div></div>
      <div class="grid g4 reveal" style="margin-bottom:16px">
        <div class="card kpi"><div class="k">Собственные репозитории</div><div class="v">${d.repo_count.own}</div><div class="d">+ ${d.repo_count.forks} форков (не учитываются)</div></div>
        <div class="card kpi"><div class="k">С тестами</div><div class="v">${sigCount("tests")}<span class="faint" style="font-size:14px"> / ${inspected.length}</span></div><div class="d">из изученных репозиториев</div></div>
        <div class="card kpi"><div class="k">С CI/CD</div><div class="v">${sigCount("ci")}<span class="faint" style="font-size:14px"> / ${inspected.length}</span></div><div class="d">workflows в корне</div></div>
        <div class="card kpi"><div class="k">С README</div><div class="v">${sigCount("readme")}<span class="faint" style="font-size:14px"> / ${inspected.length}</span></div><div class="d">документация проекта</div></div></div>
      <div class="grid split-2-1" style="margin-bottom:16px">
        <div class="card"><div class="card-head"><span class="fact-tag obs">НАБЛЮДЕНИЕ</span><h3 class="h3">Навыки с доказательствами</h3><span class="faint small">нажмите на навык, чтобы увидеть источники</span></div>
          <div class="card-body row wrap">${skills.map((s, i) => `<button class="chip ${s.kind === "practice" ? "ok" : "accent"}" style="cursor:pointer;height:26px" data-skill="${i}">${esc(s.skill)} <span class="num" style="opacity:.7">${s.repos.length}</span></button>`).join("") || '<span class="faint">Нет данных</span>'}</div></div>
        <div class="card"><div class="card-head"><span class="fact-tag gap">ПРОБЕЛЫ</span><h3 class="h3">Что нельзя установить</h3></div><div class="card-body stack tight small muted">${gaps.map((g) => `<div>• ${esc(g)}</div>`).join("")}</div></div></div>
      <div class="card" style="margin-bottom:16px"><div class="card-head"><span class="fact-tag ai">AI</span><h3 class="h3">Интерпретация</h3><span class="faint small">OpenAI · на основе только фактов выше</span><div class="actions"><button class="btn sm" id="aiInt">${icon("sparkles", "sm")}Интерпретировать</button></div></div><div class="card-body" id="aiOut"><span class="faint small">Модель не вызывалась. Нажмите «Интерпретировать», чтобы получить сводку с указанием неопределённостей.</span></div></div>
      <div class="card"><div class="card-head"><h3 class="h3">Репозитории</h3><span class="faint small">сигналы проверены в первых ${inspected.length}</span></div><div id="repoT"></div></div>
      <div class="faint xs" style="margin-top:10px">${d.limits.map(esc).join(" · ")}</div>`;
    M.$$("[data-skill]").forEach((b) => (b.onclick = () => inspector(skills[+b.dataset.skill], demo)));
    M.$("#saveGh").onclick = () => { if (demo) return M.go("candidates/" + login); M.saveCandidate(cand); M.toast("Кандидат сохранён"); M.$("#saveGh").innerHTML = icon("check", "sm") + "В пространстве"; };
    M.$("#mkCh").onclick = () => { if (!demo) M.saveCandidate(cand); M.go(`assessments/new?candidate=${cand.id}&lang=${langKey(langs[0]?.[0]) || "python"}`); };
    M.$("#aiInt").onclick = () => aiInterpret("#aiOut", "Сделай техническую сводку по публичному GitHub-профилю: 1) что подтверждено фактами (со ссылками на репозитории), 2) осторожные интерпретации, 3) что не установлено и как проверить заданием. Не оценивай человека, только доказательства.");
    M.Table(M.$("#repoT"), {
      rows: () => d.repos, rowId: (r) => r.name, noun: "репозиториев", sort: { key: "pushed", dir: -1 },
      filterText: (r) => [r.name, r.description, r.language, ...(r.topics || [])].join(" "),
      cols: [
        { key: "name", label: "Репозиторий", sort: (r) => r.name.toLowerCase(), render: (r) => `<div><div class="nm" style="font-weight:500">${esc(r.name)}</div><div class="faint xs" style="max-width:380px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.description || "")}</div></div>` },
        { key: "lang", label: "Язык", sort: (r) => r.language || "", render: (r) => r.language ? `<span class="row" style="gap:6px"><span class="sw" style="background:${langColor(r.language, 0)};border-radius:50%"></span>${esc(r.language)}</span>` : '<span class="faint">—</span>' },
        { key: "sig", label: "Сигналы", render: (r) => r.signals ? `<div class="tags">${SIG.slice(0, 4).map(([k, l]) => `<span class="chip ${r.signals[k] ? "ok" : ""}" style="${r.signals[k] ? "" : "opacity:.45"}" title="${l}: ${r.signals[k] ? "есть" : "нет"}">${l}</span>`).join("")}</div>` : '<span class="faint xs">не изучен</span>' },
        { key: "stars", label: "★", sort: (r) => r.stars, desc: true, render: (r) => `<span class="num faint">${r.stars}</span>` },
        { key: "pushed", label: "Обновлён", sort: (r) => r.pushed_at || "", desc: true, render: (r) => `<span class="faint small">${M.ago(r.pushed_at)}</span>` },
      ],
      onOpen: (r) => (demo ? M.toast("Глубокий разбор недоступен для демо-профиля", { icon: "info" }) : M.go(`github/${login}/${r.name}`)),
      menu: (r) => [{ label: "Глубокий разбор", icon: "code", run: () => M.go(`github/${login}/${r.name}`) }, ...(r.url ? [{ label: "Открыть на GitHub", icon: "ext", run: () => window.open(r.url, "_blank", "noopener") }] : [])],
    });
  }

  function inspector(s, demo) {
    M.$(".drawer")?.remove(); M.$(".scrim")?.remove();
    const scrim = M.h('<div class="scrim"></div>');
    const dr = M.h(`<aside class="drawer" role="dialog" aria-label="Evidence Inspector"><div class="cp-head"><span class="fact-tag obs">EVIDENCE</span><b>${esc(s.skill)}</b><span class="spacer"></span><button class="icon-btn" aria-label="Закрыть">${icon("x")}</button></div>
      <div class="drawer-body">
        <div class="banner info">${icon("info")}<div><b>Уверенность:</b> ${s.kind === "language" ? `код на ${esc(s.skill)} есть в ${s.repos.length} публичных репозиториях. Продакшен-опыт этим не установлен.` : `практика «${esc(s.skill)}» найдена в структуре ${s.repos.length} репозиториев. Качество её применения не оценивалось.`}</div></div>
        ${s.repos.map((r) => `<div class="ev"><div class="row"><b style="font-weight:500">${esc(r.name)}</b><span class="spacer"></span><span class="faint xs">${M.ago(r.pushed_at)}</span></div><div class="small muted">${esc(r.description || "Без описания")}</div>${r.url ? `<a class="src" href="${esc(r.url)}" target="_blank" rel="noopener">${icon("ext", "xs")}${esc(r.url.replace("https://", ""))}</a>` : `<span class="faint xs">${demo ? "DEMO — внешней ссылки нет" : ""}</span>`}</div>`).join("")}
        <button class="btn" onclick="M.go('assessments/new?skills=${encodeURIComponent(s.skill)}')">${icon("clipboard", "sm")}Проверить навык заданием</button></div></aside>`);
    const close = () => { scrim.remove(); dr.remove(); };
    scrim.onclick = close; dr.querySelector(".icon-btn").onclick = close;
    dr.addEventListener("keydown", (e) => e.key === "Escape" && close());
    document.body.append(scrim, dr);
    dr.querySelector(".icon-btn").focus();
  }

  async function aiInterpret(sel, prompt) {
    const out = M.$(sel);
    out.innerHTML = `<div class="tool-status"><span class="spin"></span>Отправляю факты страницы в OpenAI…</div>`;
    try {
      const res = await api.copilot({ message: prompt, context: { page: M.ctx.page, data: M.ctx.data, demo_data: !!M.ctx.demo }, history: [] });
      if (!M.$(sel)) return;
      out.innerHTML = res.mode === "unavailable" ? `<div class="banner warn">${icon("alert")}<span>${esc(res.notice)}</span></div>` : `<div class="msg ai"><div class="body">${M.md(res.reply)}</div><div class="faint xs">${icon("sparkles", "xs")} AI-интерпретация · ${M.ctx.demo ? "по демо-данным · " : ""}проверьте по источникам</div></div>`;
    } catch (err) { if (M.$(sel)) out.innerHTML = ui.error(err); }
  }
  M.aiInterpret = aiInterpret;

  /* ======================================================================
     Repository deep dive — Repository Explorer · Code Intelligence · Skill Proof
     ====================================================================== */
  const KW = new Set("def class return if else elif for while import from as async await try except finally with raise const let var function export default interface type new package func public private protected static void None null undefined true false True False self this in of yield lambda struct defer select where extends implements enum match case break continue pass not and or is".split(" "));
  const TOKEN = /(#.*$|\/\/.*$|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|[A-Za-z_]\w*(?=\s*\()|[A-Za-z_]\w*)/g;
  M.highlight = (line, path) => {
    const hashComments = /\.(py|rb|sh|ya?ml|toml|dockerfile)$|dockerfile$/i.test(path || "");
    let out = "", last = 0, m;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(line))) {
      const t = m[0];
      out += esc(line.slice(last, m.index));
      let cls = "";
      if (t.startsWith("//") || (t.startsWith("#") && hashComments)) cls = "tk-c";
      else if (t.startsWith("#")) { out += esc(t[0]); last = m.index + 1; TOKEN.lastIndex = m.index + 1; continue; }
      else if (/^["'`]/.test(t)) cls = "tk-s";
      else if (/^\d/.test(t)) cls = "tk-n";
      else if (KW.has(t)) cls = "tk-k";
      else if (/^\s*\(/.test(line.slice(m.index + t.length))) cls = "tk-f";
      out += cls ? `<span class="${cls}">${esc(t)}</span>` : esc(t);
      last = m.index + t.length;
    }
    return out + esc(line.slice(last));
  };

  M.pages.repo = (main, owner, repo) => {
    M.crumbs([["GitHub Intelligence", "github"], ["@" + owner, "github/" + owner], [repo, ""]]);
    M.ctx.label = `${owner}/${repo}`;
    const st = (M.repoState = { owner, repo, file: null, line: null, proofs: null, data: null, tab: "proofs" });
    main.innerHTML = `<div class="page full"><div class="split" id="split" style="grid-template-columns:${S.split.repo2 || "250px 5px 1fr 5px 380px"}">
      <div class="panel" id="pLeft">${ui.loading(10)}</div><div class="resizer" data-r="0" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Изменить ширину"></div>
      <div class="panel" id="pMain" style="display:flex;flex-direction:column;min-height:0">${ui.loading(8)}</div><div class="resizer" data-r="1" role="separator" aria-orientation="vertical" tabindex="0" aria-label="Изменить ширину"></div>
      <div class="panel" id="pAi" style="background:var(--sidebar)">${ui.loading(8)}</div></div></div>`;
    resizers(M.$("#split"), "repo2");
    Promise.all([api.ghRepo(owner, repo), M.cached("ghuser:" + owner, () => api.ghUser(owner), 600000).catch(() => null)])
      .then(([d, user]) => { st.data = d; st.user = user; drawLeft(); drawCenter(); loadProofs(); })
      .catch((err) => { M.$("#pMain").innerHTML = `<div class="page">${ui.error(err, true)}</div>`; M.$("#pLeft").innerHTML = ""; M.$("#pAi").innerHTML = ""; M.$("[data-retry]")?.addEventListener("click", () => M.rerender()); });
  };
  function resizers(split, key) {
    split.querySelectorAll(".resizer").forEach((rz) => {
      const idx = +rz.dataset.r;
      const apply = (delta) => {
        const cols = getComputedStyle(split).gridTemplateColumns.split(" ").map(parseFloat);
        if (idx === 0) cols[0] = Math.max(180, Math.min(480, cols[0] + delta));
        else cols[4] = Math.max(260, Math.min(620, cols[4] - delta));
        split.style.gridTemplateColumns = `${cols[0]}px 5px 1fr 5px ${cols[4]}px`;
        S.split[key] = split.style.gridTemplateColumns; M.save();
      };
      rz.onpointerdown = (e) => {
        rz.classList.add("drag"); rz.setPointerCapture(e.pointerId);
        let x = e.clientX;
        rz.onpointermove = (ev) => { apply(ev.clientX - x); x = ev.clientX; };
        rz.onpointerup = () => { rz.classList.remove("drag"); rz.onpointermove = null; };
      };
      rz.onkeydown = (e) => { if (e.key === "ArrowLeft") apply(-16); if (e.key === "ArrowRight") apply(16); };
    });
  }
  const proofLines = (path) => {
    const st = M.repoState, set = new Map();
    (st.proofs?.proofs || []).forEach((p) => p.sources.forEach((s) => { if (s.path === path) set.set(s.line, p.skill); }));
    return set;
  };

  function drawLeft() {
    const st = M.repoState, d = st.data;
    const repos = (st.user?.repos || []).slice(0, 30);
    const root = {};
    d.tree.forEach((path) => { let n = root; path.split("/").forEach((part, i, arr) => { n[part] = n[part] || (i === arr.length - 1 ? null : {}); if (n[part]) n = n[part]; }); });
    const evFiles = new Set((st.proofs?.proofs || []).flatMap((p) => p.sources.map((s) => s.path)));
    const nodeHTML = (n, prefix, depth) => Object.keys(n).sort((a, b) => (n[b] ? 1 : 0) - (n[a] ? 1 : 0) || a.localeCompare(b)).map((k) => {
      const path = prefix + k;
      if (n[k]) { const open = st.file?.startsWith(path + "/"); return `<div><div class="tree-item ${open ? "open" : ""}" data-dir style="padding-left:${6 + depth * 12}px">${icon("chevR", "xs chev")}${icon("folder", "sm faint")}${esc(k)}</div><div ${open ? "" : "hidden"}>${nodeHTML(n[k], path + "/", depth + 1)}</div></div>`; }
      return `<div class="tree-item ${evFiles.has(path) ? "hl" : ""} ${st.file === path ? "sel" : ""}" data-file="${esc(path)}" style="padding-left:${18 + depth * 12}px" title="${esc(path)}">${icon("file", "sm faint")}<span style="overflow:hidden;text-overflow:ellipsis">${esc(k)}</span>${evFiles.has(path) ? `<span class="dotm" title="Есть доказательства"></span>` : ""}</div>`;
    }).join("");
    M.$("#pLeft").innerHTML = `
      ${repos.length ? `<div class="cp-head" style="position:sticky;top:0;background:var(--bg);z-index:2">${icon("git", "sm")}<b class="small">Репозитории</b><span class="faint xs num">${repos.length}</span></div>
      <div style="max-height:34vh;overflow:auto;border-bottom:1px solid var(--border-soft);padding:4px 6px">${repos.map((r) => `<a class="tree-item ${r.name === st.repo ? "sel" : ""}" href="#/github/${esc(st.owner)}/${esc(r.name)}" style="height:auto;padding:5px 8px;display:block"><div class="row" style="gap:6px"><span style="font-weight:500;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</span><span class="spacer"></span>${(M.S.proofs?.[st.owner]?.[r.name]) ? `<span class="dotm" title="Проанализирован"></span>` : ""}</div><div class="faint xs">${esc(r.language || "—")} · ${M.ago(r.pushed_at)}</div></a>`).join("")}</div>` : ""}
      <div class="cp-head" style="position:sticky;top:0;background:var(--bg);z-index:1">${icon("folder", "sm")}<b class="small">Файлы</b><span class="faint xs num">${d.file_count}${d.tree_truncated ? "+" : ""}</span></div>
      <div class="tree">${nodeHTML(root, "", 0)}</div>`;
    M.$$("#pLeft [data-dir]").forEach((el) => (el.onclick = () => { el.classList.toggle("open"); el.nextElementSibling.hidden = !el.classList.contains("open"); }));
    M.$$("#pLeft [data-file]").forEach((el) => (el.onclick = () => openFile(el.dataset.file)));
  }

  function drawCenter() {
    const st = M.repoState, d = st.data, r = d.repo;
    const lb = Object.entries(d.languages_bytes).sort((a, b) => b[1] - a[1]);
    const tot = lb.reduce((a, [, n]) => a + n, 0) || 1;
    M.$("#pMain").innerHTML = `
      <div class="toolbar" style="border-bottom:1px solid var(--border-soft);flex:none">
        <b>${esc(r.full_name)}</b>${ui.liveBadge("GitHub API")}${r.fork ? '<span class="chip warn">форк</span>' : ""}<span class="faint small hide-sm">★ ${r.stars} · ${esc(r.license || "без лицензии")} · ${M.ago(r.pushed_at)}</span><span class="spacer"></span>
        <div class="seg"><button data-ctab="overview" class="${st.file ? "" : "on"}">Обзор</button><button data-ctab="code" class="${st.file ? "on" : ""}">Код</button></div>
        <a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">${icon("ext", "sm")}GitHub</a></div>
      <div id="cBody" style="flex:1;min-height:0;overflow:auto"></div>`;
    M.$$("[data-ctab]").forEach((b) => (b.onclick = () => (b.dataset.ctab === "code" ? openFile(st.file || pickDefaultFile()) : (st.file = null, drawCenter()))));
    if (st.file) return openFile(st.file, st.line);
    M.$("#cBody").innerHTML = `<div class="page" style="max-width:none">
      <div class="muted" style="margin-bottom:12px">${esc(r.description || "Без описания")}</div>
      <div class="lang-bar" style="margin-bottom:6px">${lb.map(([l, n], i) => `<i style="width:${(n / tot) * 100}%;background:${langColor(l, i)}"></i>`).join("")}</div>
      <div class="legend" style="margin-bottom:18px">${lb.slice(0, 6).map(([l, n], i) => `<span class="row" style="gap:6px"><span class="sw" style="background:${langColor(l, i)}"></span>${esc(l)} <span class="faint num">${((n / tot) * 100).toFixed(1)}%</span></span>`).join("")}</div>
      <div class="card" style="margin-bottom:14px"><div class="card-head"><span class="fact-tag obs">НАБЛЮДЕНИЕ</span><h3 class="h3">Инженерные практики</h3><span class="faint small">по дереву файлов</span></div>
        ${d.practices.map((p) => `<div class="list-row"><span class="chip ${p.present ? "ok" : ""}" style="${p.present ? "" : "opacity:.5"}">${icon(p.present ? "check" : "x", "xs")}</span><span style="width:170px">${esc(p.practice)}</span>${p.present ? `<span class="faint xs num">${p.count} файл.</span><button class="src small linkish" data-open="${esc(p.example)}" style="margin-left:auto;max-width:55%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.example)}</button>` : '<span class="faint small">не найдено</span>'}</div>`).join("")}</div>
      ${d.readme_excerpt ? `<div class="card"><div class="card-head"><h3 class="h3">README</h3><a class="faint small" href="${esc(d.readme_url)}" target="_blank" rel="noopener">источник</a></div><pre class="code" style="border:0;border-radius:0 0 12px 12px;white-space:pre-wrap">${esc(d.readme_excerpt)}</pre></div>` : ""}</div>`;
    M.$$("#cBody [data-open]").forEach((b) => (b.onclick = () => openFile(b.dataset.open)));
  }
  const pickDefaultFile = () => {
    const st = M.repoState;
    return st.proofs?.proofs?.[0]?.sources?.[0]?.path || st.data.tree.find((p) => /(^|\/)(main|app|index|server)\.\w+$/.test(p)) || st.data.tree[0];
  };

  async function openFile(path, line) {
    const st = M.repoState;
    if (!path) return;
    st.file = path; st.line = line || null;
    M.$$("[data-ctab]").forEach((b) => b.classList.toggle("on", b.dataset.ctab === "code"));
    M.$$("#pLeft [data-file]").forEach((el) => el.classList.toggle("sel", el.dataset.file === path));
    const body = M.$("#cBody");
    if (!body) return;
    body.innerHTML = ui.loading(10);
    try {
      const f = await M.cached(`file:${st.owner}/${st.repo}/${path}`, () => api.ghFile(st.owner, st.repo, path, st.data.repo.default_branch), 600000);
      if (M.repoState !== st || st.file !== path) return;
      const marks = proofLines(path);
      const lines = f.content.split("\n");
      const tooBig = lines.length > 4000;
      body.innerHTML = `<div class="toolbar" style="position:sticky;top:0;background:var(--surface);z-index:2;border-bottom:1px solid var(--border-soft)">${icon("file", "sm faint")}<span class="mono small">${esc(path)}</span><span class="faint xs num">${f.lines} строк</span>${marks.size ? `<span class="chip ok">${marks.size} строк-доказательств</span>` : ""}<span class="spacer"></span><a class="btn sm ghost" href="${esc(f.url)}" target="_blank" rel="noopener">${icon("ext", "sm")}Открыть на GitHub</a></div>
        ${f.content ? `<div class="codeview" role="region" aria-label="Код ${esc(path)}">${(tooBig ? lines.slice(0, 4000) : lines).map((l, i) => { const n = i + 1, mk = marks.get(n); return `<div class="cl ${mk ? "ev" : ""} ${n === st.line ? "focus" : ""}" id="L${n}"><a class="ln" href="${esc(f.url)}#L${n}" target="_blank" rel="noopener">${n}</a><span class="lc">${M.highlight(l, path) || " "}</span>${mk ? `<span class="evtag">${esc(mk)}</span>` : ""}</div>`; }).join("")}</div>${tooBig ? '<div class="faint small" style="padding:12px">Показаны первые 4000 строк.</div>' : ""}` : ui.empty("file", "Файл пуст или бинарный", "Откройте его на GitHub.")}`;
      const target = body.querySelector(`#L${st.line || [...marks.keys()][0] || 1}`);
      if (st.line || marks.size) target?.scrollIntoView({ block: "center" });
    } catch (err) { body.innerHTML = `<div class="page">${ui.error(err)}</div>`; }
  }

  async function loadProofs(force) {
    const st = M.repoState;
    const panel = M.$("#pAi");
    if (force) delete M.cache[`proofs:${st.owner}/${st.repo}`];
    panel.innerHTML = `<div class="cp-head" style="background:var(--sidebar)">${icon("shield", "sm")}<b class="small">Skill Proof Engine</b></div><div style="padding:14px" class="stack"><div class="tool-status"><span class="spin"></span>Читаю ключевые файлы репозитория и ищу доказательства…</div>${ui.loading(6)}</div>`;
    try {
      st.proofs = await M.cached(`proofs:${st.owner}/${st.repo}`, () => api.ghProofs(st.owner, st.repo), 600000);
    } catch (err) {
      if (M.repoState !== st) return;
      panel.innerHTML = `<div style="padding:14px">${ui.error(err, true)}</div>`;
      panel.querySelector("[data-retry]")?.addEventListener("click", () => loadProofs(true));
      return;
    }
    if (M.repoState !== st) return;
    S.proofs = S.proofs || {};
    S.proofs[st.owner] = { ...(S.proofs[st.owner] || {}), [st.repo]: { repo: st.proofs.repo, checked_at: st.proofs.checked_at, languages: Object.keys(st.data.languages_bytes || {}), url: st.data.repo.url, proofs: st.proofs.proofs.map((p) => ({ ...p, sources: p.sources.slice(0, 4) })) } };
    if (S.candidates["gh-" + st.owner]) S.candidates["gh-" + st.owner].fetchedAt = Date.now();
    M.track("repo_analyzed", { login: st.owner, n: st.proofs.proofs.length });
    M.save();
    drawLeft();
    if (!st.file && st.proofs.proofs[0]) st.file = null;
    drawProofs();
  }

  function drawProofs() {
    const st = M.repoState, P = st.proofs, job = M.activeJob();
    const SYN = { testing: ["pytest", "jest / vitest"], "ci/cd": ["ci/cd"], "node.js": ["node.js / express"], postgres: ["postgresql"] };
    const langs = Object.keys(st.data.languages_bytes || {}).map((l) => l.toLowerCase());
    const has = (req) => {
      const r = req.toLowerCase(), alts = [r, ...(SYN[r] || [])];
      return P.proofs.find((p) => { const s = p.skill.toLowerCase(); return alts.includes(s) || s.split(/[ /]+/).includes(r); }) || (langs.includes(r) ? { skill: req } : null);
    };
    const reqs = job ? [...job.required, ...job.preferred] : [];
    const gaps = reqs.filter((r) => !has(r));
    M.ctx.data = { repository: `${st.owner}/${st.repo}`, skill_proofs: P.proofs.map((p) => ({ skill: p.skill, confidence: p.confidence, sources: p.sources.slice(0, 3).map((s) => `${s.url} :: ${s.snippet}`) })), not_enough_evidence: P.not_found, files_analyzed: P.files_analyzed, active_job: job && { title: job.title, requirements: reqs, unproven: gaps } };
    M.copilot.refreshContext();
    M.$("#pAi").innerHTML = `
      <div class="cp-head" style="background:var(--sidebar);position:sticky;top:0;z-index:2">${icon("shield", "sm")}<b class="small">Skill Proof Engine</b><span class="spacer"></span><button class="btn sm ghost" id="reAn" data-tip="Повторить анализ">${icon("refresh", "sm")}</button></div>
      <div style="padding:12px 14px" class="stack">
        ${P.notice ? `<div class="banner warn small">${icon("alert")}<span>${esc(P.notice)}</span></div>` : ""}
        <div class="faint xs">${esc(P.method)} Изучено файлов: <b class="num">${P.files_analyzed.length}</b> из ${P.files_total} · проверено ${M.ago(P.checked_at)}</div>
        ${P.proofs.map((p, i) => `<div class="ev proof">
          <div class="row"><b style="font-weight:600">${esc(p.skill)}</b><span class="chip ok">${icon("check", "xs")}Evidence found</span><span class="spacer"></span><span class="chip ${p.confidence.level === "medium" ? "accent" : ""}" title="${esc(p.confidence.reason)}">уверенность: ${p.confidence.level === "medium" ? "средняя" : "низкая"}</span></div>
          <div class="small muted">${esc(p.explanation)}</div>
          ${p.sources.slice(0, 3).map((s) => `<button class="srcline" data-path="${esc(s.path)}" data-line="${s.line}"><span class="mono">${esc(s.path)}:${s.line}</span><code>${esc(s.snippet)}</code></button>`).join("")}
          <div class="faint xs">${esc(p.confidence.reason)}. ${esc(p.limits)}</div></div>`).join("") || ui.empty("search", "Доказательств не найдено", "В изученных файлах не найдено известных паттернов.")}
        ${P.not_found.length ? `<div><div class="ev-k" style="margin-bottom:6px"><span class="fact-tag gap">NOT ENOUGH EVIDENCE</span></div><div class="row wrap">${P.not_found.map((s) => `<span class="chip">${esc(s)}</span>`).join("")}</div><div class="faint xs" style="margin-top:6px">Отсутствие в изученных файлах — не отрицательный вывод о кандидате.</div></div>` : ""}
        ${job ? `<div class="divider"></div><div><div class="ev-k" style="margin-bottom:6px">Соответствие вакансии · ${esc(job.title)}</div><div class="stack tight">${reqs.map((r) => `<div class="row small"><span style="flex:1">${esc(r)}</span>${has(r) ? `<span class="chip ok">${icon("check", "xs")}Код</span>` : '<span class="chip">Нет данных</span>'}</div>`).join("")}</div></div>` : ""}
        <div class="divider"></div>
        <div class="ev-k"><span class="fact-tag ai">AI</span> Сводка по доказательствам</div>
        <div id="repoAi"><span class="faint small">Модель видит только найденные доказательства выше.</span></div>
        <button class="btn" id="repoAiBtn">${icon("sparkles", "sm")}Объяснить с AI</button>
        <button class="btn primary" id="r2r">${icon("clipboard", "sm")}Generate Skill Challenge${gaps.length ? ` · ${gaps.length} пробел.` : ""}</button>
        <div class="faint xs">Repo-to-Reality: задание строится по навыкам вакансии, для которых в коде нет доказательств.</div></div>`;
    M.$("#reAn").onclick = () => loadProofs(true);
    M.$$(".srcline").forEach((b) => (b.onclick = () => openFile(b.dataset.path, +b.dataset.line)));
    M.$("#repoAiBtn").onclick = () => aiInterpret("#repoAi", "Объясни найденные доказательства навыков в этом репозитории. Формат: Подтверждено кодом (со ссылками file:line), Возможные архитектурные особенности (помечай как вывод), Неопределённость, Что проверить заданием. Не делай выводов о человеке.");
    M.$("#r2r").onclick = () => repoToReality(gaps);
  }

  async function repoToReality(gaps) {
    const st = M.repoState, P = st.proofs, job = M.activeJob();
    const lb = Object.entries(st.data.languages_bytes).sort((a, b) => b[1] - a[1]);
    const jobLang = job && [...job.required, ...job.preferred].map(langKey).find(Boolean);
    const lang = jobLang || langKey(lb[0]?.[0]) || "python";
    const btn = M.$("#r2r"); btn.disabled = true; btn.innerHTML = `<span class="spin" style="width:12px;height:12px;border-radius:50%;border:1.5px solid currentColor;border-top-color:transparent;animation:spin .8s linear infinite;display:inline-block"></span> Генерирую задание…`;
    const cid = "gh-" + st.owner;
    if (!S.candidates[cid]) M.saveCandidate({ id: cid, login: st.owner, name: st.user?.profile?.name || st.owner, avatar: st.user?.profile?.avatar_url, url: `https://github.com/${st.owner}`, source: "GitHub", skills: P.proofs.map((p) => p.skill), evidence: [], gaps: gaps.map((g) => "Нет доказательств в коде: " + g), fetchedAt: Date.now() });
    try {
      const res = await api.challengeDraft({ language: lang, technology: gaps[0] || "", difficulty: "Junior+", minutes: 30, skills: gaps.slice(0, 4), gaps: (gaps.length ? gaps : P.not_found.slice(0, 3)).slice(0, 8),
        evidence: P.proofs.slice(0, 8).map((p) => ({ skill: p.skill, source: p.sources[0]?.path + ":" + p.sources[0]?.line })), job_requirements: job ? [...job.required, ...job.preferred] : [] });
      if (res.mode === "unavailable") { M.toast(res.notice, { error: true }); btn.disabled = false; return; }
      M.draftPrefill = { draft: res.draft, model: res.model, language: lang, skills: gaps.slice(0, 4), source: `${st.owner}/${st.repo}`, candidate: cid };
      M.go(`assessments/new?candidate=${cid}&lang=${lang}&prefill=1`);
    } catch (err) { M.toast(err.message, { error: true }); btn.disabled = false; btn.innerHTML = icon("clipboard", "sm") + "Generate Skill Challenge"; }
  }

  /* ======================================================================
     Matching Lab
     ====================================================================== */
  M.pages.matching = (main) => {
    M.crumbs([["Matching Lab", "matching"]]);
    M.ctx.label = "Matching Lab";
    const jobs = M.allJobs();
    const job = M.activeJob();
    const all = M.allCandidates();
    const q = M.query();
    let ids = q.ids ? q.ids.split(",") : (S.matchIds || all.filter((c) => c.review === "shortlisted").map((c) => c.id));
    let list = ids.map((id) => M.candidate(id)).filter(Boolean).slice(0, 6);
    if (!list.length) list = all.slice(0, 4);
    S.matchIds = list.map((c) => c.id); M.save();
    if (!job) { main.innerHTML = `<div class="page">${ui.empty("briefcase", "Нужна вакансия", "Matching Lab сравнивает кандидатов по критериям вакансии.", `<button class="btn primary" onclick="M.pages.jobs.create()">Создать вакансию</button>`)}</div>`; return; }
    const crit = [...job.required.map((r) => [r, true]), ...job.preferred.map((r) => [r, false])];
    M.ctx.demo = list.some((c) => c.demo);
    M.ctx.data = { job: { title: job.title, required: job.required, preferred: job.preferred }, matrix: list.map((c) => ({ candidate: c.name || c.login, review: c.review, assessment: c.assessment, criteria: Object.fromEntries(crit.map(([cr]) => { const e = M.evidenceFor(c, cr); return [cr, { status: e.status, explanation: e.explanation, source: e.source }]; })) })) };
    main.innerHTML = `<div class="page" style="max-width:none">
      <div class="page-head"><div><h1 class="h1">Matching Lab</h1><div class="lead">Прозрачная матрица доказательств по каждому критерию. Без итогового «балла пригодности»: решение принимает рекрутер.</div></div>
        <div class="actions"><select class="select" id="jobSel" style="width:auto;height:30px">${jobs.map((j) => `<option value="${j.id}" ${j.id === job.id ? "selected" : ""}>${esc(j.title)}${j.demo ? " (демо)" : ""}</option>`).join("")}</select>
        <button class="btn" id="addC">${icon("plus", "sm")}Кандидат</button><button class="btn primary" onclick="M.copilot.open();M.copilot.ask('Сравни кандидатов в матрице по каждому критерию: где доказательства сильнее, где пробелы и что проверить заданием. Без итогового рейтинга.')">${icon("sparkles", "sm")}AI-сводка</button></div></div>
      ${list.length ? `<div class="card" style="overflow:auto"><table class="matrix"><thead><tr><th>Критерий</th>${list.map((c) => `<th><div class="row">${ui.avatar(c)}<div style="min-width:0"><a href="#/candidates/${c.id}" style="font-weight:500">${esc(c.name || c.login)}</a> ${c.demo ? ui.demoBadge() : ""}<div class="faint xs">${esc(c.source || "")}</div></div><span class="spacer"></span><button class="icon-btn" data-rm="${c.id}" aria-label="Убрать из сравнения" style="width:22px;height:22px">${icon("x", "xs")}</button></div>
          <div class="row" style="margin-top:6px;gap:4px">${c.demo ? "" : `<button class="btn sm" data-analyze="${esc(c.login)}" data-repo="${esc((c.evidence || []).find((e) => e.repo)?.repo || "")}" data-tip="Skill Proof Engine по коду">${icon("code", "sm")}Проверить код</button>`}<button class="btn sm" data-gen="${c.id}" data-tip="Задание по неподтверждённым требованиям">${icon("clipboard", "sm")}Задание</button></div></th>`).join("")}</tr></thead><tbody>
        ${crit.map(([cr, req]) => `<tr><td><div style="font-weight:500">${esc(cr)}</div><div class="faint xs">${req ? "обязательно" : "желательно"}</div></td>${list.map((c) => { const e = M.evidenceFor(c, cr); return `<td><div class="mcell" data-c="${c.id}" data-cr="${esc(cr)}" tabindex="0" role="button" aria-label="${esc(cr)}: ${esc(e.status)}">${M.evChip(e)}<span class="xs muted" style="line-height:1.4">${esc(e.items[0]?.detail || e.explanation).slice(0, 90)}</span>${e.verifiedAt ? `<span class="faint xs">проверено ${M.ago(e.verifiedAt)}</span>` : ""}</div></td>`; }).join("")}</tr>`).join("")}
        <tr><td><div style="font-weight:500">Техническое задание</div><div class="faint xs">Merilo Skill Challenge</div></td>${list.map((c) => `<td>${ui.assess(c.assessment)}</td>`).join("")}</tr>
        <tr><td><div style="font-weight:500">Решение рекрутера</div><div class="faint xs">человек, не AI</div></td>${list.map((c) => `<td><select class="select" data-rv="${c.id}" style="height:28px">${M.REVIEW.map(([k, l]) => `<option value="${k}" ${c.review === k ? "selected" : ""}>${l}</option>`).join("")}</select></td>`).join("")}</tr>
        <tr><td><div style="font-weight:500">Заметки</div></td>${list.map((c) => `<td><textarea class="textarea" data-note="${c.id}" rows="2" placeholder="Заметка…" style="font-size:12px">${esc(S.notes[c.id] || "")}</textarea></td>`).join("")}</tr>
      </tbody></table></div>` : ui.empty("columns", "Добавьте кандидатов", "Выберите кандидатов в списке или результатах поиска.")}
      <div class="row wrap small" style="margin-top:10px;gap:14px"><span class="row" style="gap:6px">${M.evChip({ status: "challenge" })}Verified by Challenge — подписанная карточка, AI-ревью</span><span class="row" style="gap:6px">${M.evChip({ status: "observed" })}Observed Evidence — файл:строка в коде</span><span class="row" style="gap:6px">${M.evChip({ status: "inferred" })}Inference — по описанию/темам, без кода</span><span class="row" style="gap:6px">${M.evChip({ status: "unknown" })}Unknown — недостаточно доказательств</span></div>
      <div class="faint xs" style="margin-top:8px">${M.icon("shield", "xs")} Популярность профиля, возраст, пол, национальность и другие нерелевантные характеристики не используются. Отсутствие доказательства ≠ отсутствие навыка.</div></div>`;
    M.$$("[data-analyze]").forEach((b) => (b.onclick = () => { const repo = (b.dataset.repo || "").split("/")[1]; M.go(repo ? `github/${b.dataset.analyze}/${repo}` : `github/${b.dataset.analyze}`); }));
    M.$$("[data-gen]").forEach((b) => (b.onclick = () => { const c = M.candidate(b.dataset.gen); const gaps = crit.map(([cr]) => cr).filter((cr) => ["unknown", "inferred"].includes(M.evidenceFor(c, cr).status)); M.go(`assessments/new?candidate=${c.id}&skills=${encodeURIComponent(gaps.slice(0, 4).join(","))}`); }));
    M.$("#jobSel").onchange = (e) => { S.activeJob = e.target.value; M.save(); M.rerender(); };
    M.$("#addC").onclick = (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const rest = all.filter((c) => !list.some((x) => x.id === c.id));
      M.menu(r.left, r.bottom + 4, rest.length ? rest.slice(0, 12).map((c) => ({ label: (c.name || c.login) + (c.demo ? " · demo" : ""), icon: "users", run: () => { S.matchIds = [...list.map((x) => x.id), c.id].slice(-6); M.save(); location.hash = "#/matching?ids=" + S.matchIds.join(","); } })) : [{ label: "Нет других кандидатов", run: () => {} }]);
    };
    M.$$("[data-rm]").forEach((b) => (b.onclick = () => { location.hash = "#/matching?ids=" + list.filter((c) => c.id !== b.dataset.rm).map((c) => c.id).join(","); }));
    M.$$("[data-rv]").forEach((s) => (s.onchange = () => M.setReview([s.dataset.rv], s.value)));
    M.$$("[data-note]").forEach((t) => (t.oninput = M.debounce(() => { S.notes[t.dataset.note] = t.value; M.save(); }, 400)));
    M.$$(".mcell").forEach((cell) => {
      const open = () => {
        const c = M.candidate(cell.dataset.c), e = M.evidenceFor(c, cell.dataset.cr);
        M.dialog({ title: `${cell.dataset.cr} · ${c.name || c.login}`, body: `<div class="stack">
          <div class="row">${M.evChip(e)}<span class="muted small">${esc(e.explanation)}</span></div>
          <div><div class="ev-k" style="margin-bottom:6px"><span class="fact-tag obs">ЕСТЬ</span> Доказательства</div>${e.items.map((x) => `<div class="ev" style="margin-bottom:6px"><div class="small">${esc(x.detail)}</div>${M.srcLink(x, c)}</div>`).join("") || '<div class="faint small">Нет</div>'}</div>
          <div><div class="ev-k" style="margin-bottom:6px"><span class="fact-tag gap">НЕТ</span> Чего не хватает</div><div class="small muted">${e.status === "observed" || e.status === "challenge" ? "Продакшен-контекст использования не подтверждён." : "Нет публичного артефакта, подтверждающего навык."}</div></div>
          <div class="faint xs">Источник: ${esc(e.source || "—")} · последняя проверка: ${e.verifiedAt ? M.ago(e.verifiedAt) : "—"}</div></div>`,
          actions: [{ label: "Закрыть" }, { label: "Создать задание", primary: true, run: () => M.go(`assessments/new?candidate=${c.id}&skills=${encodeURIComponent(cell.dataset.cr)}`) }] });
      };
      cell.onclick = open; cell.onkeydown = (ev) => ev.key === "Enter" && open();
    });
  };

  /* ======================================================================
     Assessments
     ====================================================================== */
  M.pages.assessments = (main) => {
    M.crumbs([["Задания", "assessments"]]);
    M.ctx.label = "Задания";
    const tab = M.query().tab || "tasks";
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1 class="h1">Задания</h1><div class="lead">Короткие практические задачи, закрывающие пробелы в доказательствах. Решения проходят 3-шлюзовую проверку Merilo и получают подписанную Skill Card.</div></div>
        <div class="actions"><button class="btn primary" onclick="M.go('assessments/new')">${icon("plus", "sm")}Новое задание</button></div></div>
      <div class="tabs" role="tablist"><button role="tab" class="${tab === "tasks" ? "on" : ""}" onclick="location.hash='#/assessments'">Каталог заданий</button><button role="tab" class="${tab === "results" ? "on" : ""}" onclick="location.hash='#/assessments?tab=results'">Результаты</button></div>
      <div class="card" id="asBody">${ui.loading(6)}</div></div>`;
    Promise.all([M.cached("tasks", api.tasks), api.recentCards(100)]).then(([tasks, cards]) => {
      M.ctx.data = { tasks: tasks.map((t) => ({ id: t.id, title: t.title, language: t.language, difficulty: t.difficulty })), recent_results: cards.slice(0, 15).map((c) => ({ task: c.task_title, score: c.total_score, tier: c.badge_tier, hash: c.card_hash })) };
      const box = M.$("#asBody");
      if (!box) return;
      if (tab === "results") {
        return M.Table(box, {
          rows: () => cards, rowId: (c) => c.card_hash, noun: "карточек", sort: { key: "date", dir: -1 },
          cols: [
            { key: "task", label: "Задание", sort: (c) => c.task_title, render: (c) => `<div class="nm" style="font-weight:500">${esc(c.task_title)}</div>` },
            { key: "lang", label: "Язык", sort: (c) => c.language, render: (c) => `<span class="chip">${esc(c.language)}</span>` },
            { key: "score", label: "Балл", sort: (c) => c.total_score, desc: true, render: (c) => `<b class="num">${c.total_score}</b>` },
            { key: "tier", label: "Уровень", sort: (c) => c.badge_tier, render: (c) => `<span class="chip ${c.total_score >= 85 ? "ok" : c.total_score >= 70 ? "accent" : "warn"}">${esc(c.badge_tier)}</span>` },
            { key: "hash", label: "ID", render: (c) => `<span class="mono faint small">${esc(c.card_hash)}</span>` },
            { key: "date", label: "Дата", sort: (c) => c.created_at, desc: true, render: (c) => `<span class="faint small">${M.ago(c.created_at)}</span>` },
          ],
          onOpen: (c) => M.go("verified/" + c.card_hash),
          empty: ui.empty("badge", "Результатов нет", "Карточки появятся после первых решений."),
        });
      }
      const byTitle = cards.reduce((a, c) => ((a[c.task_title] = (a[c.task_title] || 0) + 1), a), {});
      M.Table(box, {
        rows: () => tasks, noun: "заданий",
        cols: [
          { key: "title", label: "Задание", sort: (t) => t.title, render: (t) => `<div><div class="nm" style="font-weight:500">${esc(t.title)}</div><div class="faint xs">${esc(t.company_name)} · ${esc(t.stack)}</div></div>` },
          { key: "lang", label: "Язык", sort: (t) => t.language, render: (t) => `<span class="chip">${esc(t.language)}</span>` },
          { key: "diff", label: "Уровень", sort: (t) => t.difficulty, render: (t) => `<span class="muted small">${esc(t.difficulty)}</span>` },
          { key: "res", label: "Результаты", sort: (t) => byTitle[t.title] || 0, desc: true, render: (t) => `<span class="num">${byTitle[t.title] || 0}</span>` },
          { key: "date", label: "Создано", sort: (t) => t.created_at, desc: true, render: (t) => `<span class="faint small">${M.ago(t.created_at)}</span>` },
        ],
        onOpen: (t) => M.go("assessments/" + t.id),
        menu: (t) => [{ label: "Открыть", icon: "arrowR", run: () => M.go("assessments/" + t.id) }, { label: "Пройти как кандидат", icon: "code", run: () => M.go("challenge/" + t.id) }, { label: "Скопировать ссылку для кандидата", icon: "copy", run: () => copyLink(t.id) }],
      });
    }).catch((err) => { const b = M.$("#asBody"); if (b) b.innerHTML = `<div class="card-body">${ui.error(err)}</div>`; });
  };
  const copyLink = (id) => { const url = `${location.origin}/app#/challenge/${id}`; navigator.clipboard?.writeText(url).then(() => M.toast("Ссылка скопирована. Отправьте её кандидату сами — Merilo не рассылает сообщения."), () => M.toast(url, { icon: "link", ms: 8000 })); };

  M.pages.challengeNew = (main) => {
    M.crumbs([["Задания", "assessments"], ["Новое задание", ""]]);
    M.ctx.label = "Конструктор задания";
    const q = M.query();
    const c = q.candidate ? M.candidate(q.candidate) : null;
    const gaps = [...new Set([...(q.skills ? q.skills.split(",") : []), ...((c?.missing || []).slice(0, 3))])].filter(Boolean);
    const lang = q.lang || langKey(Object.keys(c?.languages || {})[0] || (c?.skills || [])[0]) || "typescript";
    const draft = (M.draft = M.draft || null);
    M.ctx.data = { candidate: c && { name: c.name || c.login, gaps: c.gaps || c.missing, skills: c.skills }, requested_skills: gaps };
    main.innerHTML = `<div class="page" style="max-width:1080px">
      <div class="page-head"><div><h1 class="h1">Новый Skill Challenge</h1><div class="lead">${c ? `Для кандидата <b>${esc(c.name || c.login)}</b> ${c.demo ? ui.demoBadge() : ""} — задание закрывает пробелы в доказательствах.` : "AI предлагает реалистичную задачу; вы проверяете и публикуете её."}</div></div></div>
      <div class="grid split-2-1">
        <div class="card"><div class="card-head"><h3 class="h3">1 · Параметры</h3></div><div class="card-body stack">
          <div class="form-grid">
            <div class="field"><label for="cl">Язык</label><select class="select" id="cl">${LANGS.map(([k, n]) => `<option value="${k}" ${k === lang ? "selected" : ""}>${n}</option>`).join("")}</select></div>
            <div class="field"><label for="ct">Технология</label><input class="input" id="ct" value="${esc(q.tech || (c?.skills || []).find((s) => /react|fastapi|django|node|next|spring/i.test(s)) || "")}" placeholder="React, FastAPI…"></div>
            <div class="field"><label for="cd">Сложность</label><select class="select" id="cd">${["Junior", "Junior+", "Middle", "Senior"].map((d) => `<option>${d}</option>`).join("")}</select></div>
            <div class="field"><label for="cm">Время, мин</label><input class="input" id="cm" type="number" min="10" max="180" value="30"></div></div>
          <div class="field"><label>Навыки для проверки</label><div class="row wrap" id="skillBox">${gaps.map((g) => `<span class="chip warn">${esc(g)}<button aria-label="Убрать">${icon("x", "xs")}</button></span>`).join("")}<input class="chip-add" id="skAdd" placeholder="+ навык"></div></div>
          <div class="field"><label for="cco">Компания (видна кандидату)</label><input class="input" id="cco" value="${esc(S.company || "")}" placeholder="Название компании"></div>
          <div class="row"><button class="btn primary" id="genBtn">${icon("sparkles", "sm")}Сгенерировать черновик</button><button class="btn ghost" id="manualBtn">Заполнить вручную</button></div></div></div>
        <div class="card"><div class="card-head"><h3 class="h3">Как это работает</h3></div><div class="card-body stack tight small muted">
          <div>1. AI предлагает задачу (OpenAI). Ничего не публикуется автоматически.</div><div>2. Вы правите текст и стартовый код.</div><div>3. «Опубликовать» создаёт задание в каталоге Merilo (POST /api/tasks).</div><div>4. Вы сами отправляете ссылку кандидату.</div><div>5. Решение проходит 3 шлюза: tree-sitter → защита от prompt-инъекций → AI-оценка по рубрике 30/40/30.</div>
          <div class="banner warn" style="margin-top:6px">${icon("info")}<span>Merilo не исполняет код кандидата — ни в браузере, ни на сервере. Оценка — статический разбор + AI-ревью.</span></div></div></div></div>
      <div id="draftBox" style="margin-top:16px"></div></div>`;
    const skills = [...gaps];
    const drawSkills = () => {
      M.$("#skillBox").innerHTML = skills.map((g, i) => `<span class="chip warn">${esc(g)}<button data-i="${i}" aria-label="Убрать">${icon("x", "xs")}</button></span>`).join("") + '<input class="chip-add" id="skAdd" placeholder="+ навык">';
      M.$$("#skillBox [data-i]").forEach((b) => (b.onclick = () => { skills.splice(+b.dataset.i, 1); drawSkills(); }));
      M.$("#skAdd").onkeydown = (e) => { if (e.key === "Enter" && e.target.value.trim()) { e.preventDefault(); skills.push(e.target.value.trim()); drawSkills(); M.$("#skAdd").focus(); } };
    };
    drawSkills();
    const params = () => ({ language: M.$("#cl").value, technology: M.$("#ct").value.trim(), difficulty: M.$("#cd").value, minutes: +M.$("#cm").value || 30, skills: skills.slice(0, 6), gaps: (c?.gaps || []).slice(0, 6) });
    M.$("#genBtn").onclick = async () => {
      const b = M.$("#genBtn"); b.disabled = true;
      M.$("#draftBox").innerHTML = `<div class="card"><div class="card-body"><div class="tool-status"><span class="spin"></span>OpenAI готовит черновик задания…</div>${ui.loading(5)}</div></div>`;
      try {
        const res = await api.challengeDraft(params());
        if (res.mode === "unavailable") { M.$("#draftBox").innerHTML = `<div class="banner warn">${icon("alert")}<span>${esc(res.notice)}</span></div>`; editor({}, params()); }
        else editor(res.draft, params(), true);
      } catch (err) { M.$("#draftBox").innerHTML = ui.error(err); }
      b.disabled = false;
    };
    M.$("#manualBtn").onclick = () => editor({}, params());
    const pre = q.prefill && M.draftPrefill;
    if (pre) { pre.skills.forEach((s) => !skills.includes(s) && skills.push(s)); drawSkills(); editor(pre.draft, params(), true); M.draftPrefill = null; }
    function editor(d, p, ai) {
      const box = M.$("#draftBox");
      box.innerHTML = (box.querySelector(".banner")?.outerHTML || "") + `<div class="card reveal"><div class="card-head"><h3 class="h3">2 · Проверка черновика</h3>${ai ? `<span class="fact-tag ai">AI-ЧЕРНОВИК</span><span class="faint small">${esc(pre?.model || "OpenAI")} · проверьте перед публикацией</span>` : ""}</div><div class="card-body stack">
        ${d.rationale ? `<div class="banner info">${icon("info")}<div><b>Repo-to-Reality${pre?.source ? ` · ${esc(pre.source)}` : ""}:</b> ${esc(d.rationale)}</div></div>` : ""}
        <div class="field"><label for="dt">Название</label><input class="input" id="dt" maxlength="120" value="${esc(d.title || "")}"></div>
        <div class="field"><label for="dd">Описание и критерии приёмки</label><textarea class="textarea" id="dd" rows="7">${esc((d.description || "") + (d.acceptance?.length ? "\n\nКритерии приёмки:\n" + d.acceptance.map((a) => "- " + a).join("\n") : ""))}</textarea></div>
        <div class="field"><label for="dc">Стартовый код (${esc(p.language)})</label><textarea class="textarea mono" id="dc" rows="14" spellcheck="false" style="font-size:12.5px">${esc(d.buggy_code || "")}</textarea></div>
        <div class="row"><span class="faint small">Рубрика Merilo: Clean Code 30% · Architecture 40% · Edge Cases & Security 30%</span><span class="spacer"></span><button class="btn primary" id="pubBtn">${icon("send", "sm")}Опубликовать задание</button></div></div></div>`;
      M.$("#pubBtn").onclick = async () => {
        const company = M.$("#cco").value.trim();
        const payload = { title: M.$("#dt").value.trim(), company_name: company, stack: [p.technology, LANGS.find(([k]) => k === p.language)?.[1]].filter(Boolean).join(", ") || p.language, difficulty: p.difficulty, description: M.$("#dd").value.trim(), buggy_code: M.$("#dc").value, language: p.language, rubric: { clean_code: "Читаемость, именование, структура", architecture: "Декомпозиция, корректность, сложность", edge_cases: (p.skills.join(", ") || "Граничные случаи") + "; обработка ошибок" } };
        const problems = [payload.title.length < 5 && "название ≥ 5 символов", company.length < 2 && "компания ≥ 2 символов", payload.description.length < 20 && "описание ≥ 20 символов", payload.buggy_code.trim().length < 10 && "стартовый код ≥ 10 символов"].filter(Boolean);
        if (problems.length) return M.toast("Заполните: " + problems.join(", "), { error: true });
        if (!(await M.confirm("Опубликовать задание?", `«${esc(payload.title)}» появится в общем каталоге заданий Merilo. Ссылку кандидату вы отправите сами.`, "Опубликовать"))) return;
        try {
          S.company = company; M.save();
          const t = await api.createTask(payload);
          delete M.cache.tasks;
          M.track("challenge_published", { title: payload.title });
          S.taskLinks = S.taskLinks || {};
          if (c) { S.taskLinks[t.id] = { candidate: c.id, skills: p.skills }; if (S.candidates[c.id]) S.candidates[c.id].assessment = { status: "invited", taskId: t.id, skills: p.skills }; M.track("challenge_sent", { candidate: c.id }); }
          M.save();
          M.notify(`Задание опубликовано: ${payload.title}`, "assessments/" + t.id);
          M.go("assessments/" + t.id);
        } catch (err) { M.toast(err.message, { error: true }); }
      };
    }
  };

  M.pages.assessment = (main, id) => {
    M.crumbs([["Задания", "assessments"], ["…", ""]]);
    main.innerHTML = `<div class="page">${ui.loading(8)}</div>`;
    Promise.all([api.task(id), api.recentCards(100)]).then(([t, cards]) => {
      M.crumbs([["Задания", "assessments"], [t.title, ""]]);
      M.ctx.label = t.title;
      const res = cards.filter((c) => c.task_title === t.title);
      M.ctx.data = { task: { title: t.title, language: t.language, difficulty: t.difficulty, rubric: t.rubric }, results: res.map((c) => ({ score: c.total_score, tier: c.badge_tier, hash: c.card_hash })) };
      M.copilot.refreshContext();
      main.innerHTML = `<div class="page">
        <div class="page-head"><div><div class="row"><span class="chip">${esc(t.language)}</span><span class="chip">${esc(t.difficulty)}</span><span class="faint small">${esc(t.company_name)}</span></div><h1 class="h1" style="margin-top:6px">${esc(t.title)}</h1><div class="lead">${esc(t.stack)}</div></div>
          <div class="actions"><button class="btn" id="cpLink">${icon("copy", "sm")}Ссылка для кандидата</button><button class="btn primary" onclick="M.go('challenge/${t.id}')">${icon("code", "sm")}Открыть как кандидат</button></div></div>
        <div class="grid split-2-1"><div class="stack">
          <div class="card"><div class="card-head"><h3 class="h3">Описание</h3></div><div class="card-body prose">${esc(t.description)}</div></div>
          <div class="card"><div class="card-head"><h3 class="h3">Стартовый код</h3></div><pre class="code" style="border:0;border-radius:0 0 12px 12px">${esc(t.buggy_code)}</pre></div></div>
          <div class="stack"><div class="card"><div class="card-head"><h3 class="h3">Рубрика</h3></div>${Object.entries(t.rubric || {}).map(([k, v]) => `<div class="list-row" style="align-items:flex-start"><span class="chip accent">${{ clean_code: "Clean Code 30%", architecture: "Architecture 40%", edge_cases: "Edge Cases 30%" }[k] || esc(k)}</span><span class="small muted">${esc(v)}</span></div>`).join("")}</div>
          <div class="card"><div class="card-head"><h3 class="h3">Результаты</h3>${ui.liveBadge()}<span class="faint small num">${res.length}</span></div>${res.length ? res.map((c) => `<a class="list-row link" href="#/verified/${c.card_hash}"><b class="num">${c.total_score}</b><span class="chip ${c.total_score >= 85 ? "ok" : c.total_score >= 70 ? "accent" : "warn"}">${esc(c.badge_tier)}</span><span class="spacer"></span><span class="mono faint xs">${c.card_hash}</span></a>`).join("") : ui.empty("clock", "Пока нет решений", "Отправьте ссылку кандидату.")}</div></div></div></div>`;
      M.$("#cpLink").onclick = () => copyLink(t.id);
    }).catch((err) => (main.innerHTML = `<div class="page">${ui.error(err)}</div>`));
  };

  /* ======================================================================
     Candidate coding interface
     ====================================================================== */
  M.pages.challenge = (main, id) => {
    M.crumbs([["Задания", "assessments"], ["Решение", ""]]);
    M.ctx.label = "Решение задания";
    main.innerHTML = `<div class="page">${ui.loading(8)}</div>`;
    api.task(id).then((t) => {
      M.crumbs([["Задания", "assessments"], [t.title, "assessments/" + t.id], ["Решение", ""]]);
      M.ctx.data = { task: { title: t.title, language: t.language, description: t.description.slice(0, 1500) } };
      M.copilot.refreshContext();
      const key = "merilo.draft." + id;
      let code; try { code = localStorage.getItem(key); } catch { code = null; }
      main.innerHTML = `<div class="page full"><div class="split" id="chSplit" style="grid-template-columns:${S.split.ch || "380px 5px 1fr 5px 0px"};height:100%">
        <div class="panel" style="padding:18px"><div class="row"><span class="chip">${esc(t.language)}</span><span class="chip">${esc(t.difficulty)}</span></div><h1 class="h1" style="margin:10px 0 4px">${esc(t.title)}</h1><div class="faint small" style="margin-bottom:14px">${esc(t.company_name)} · ${esc(t.stack)}</div>
          <div class="prose small">${esc(t.description)}</div><div class="divider"></div>
          <div class="eyebrow" style="margin-bottom:8px">Рубрика</div>${Object.entries(t.rubric || {}).map(([k, v]) => `<div class="small" style="margin-bottom:6px"><b style="font-weight:500">${{ clean_code: "Clean Code · 30%", architecture: "Architecture · 40%", edge_cases: "Edge Cases & Security · 30%" }[k] || esc(k)}</b><div class="muted">${esc(v)}</div></div>`).join("")}
          <div class="banner small" style="margin-top:12px">${icon("lock")}<span>Код не исполняется. Проверка: синтаксис (tree-sitter) → защита от инъекций → AI-ревью. Черновик сохраняется только в этом браузере.</span></div></div>
        <div class="resizer" data-r="0" role="separator" tabindex="0" aria-label="Изменить ширину"></div>
        <div class="panel" style="display:grid;grid-template-rows:auto 1fr auto;min-height:0">
          <div class="toolbar" style="border-bottom:1px solid var(--border-soft)">${icon("file", "sm faint")}<span class="mono small">solution.${{ python: "py", javascript: "js", typescript: "ts", java: "java", go: "go", csharp: "cs", kotlin: "kt", rust: "rs", cpp: "cpp", php: "php", ruby: "rb", swift: "swift" }[t.language] || "txt"}</span><span class="spacer"></span>
            <span class="status" id="timer" role="timer" aria-live="off">${icon("clock", "xs")}<span class="num">00:00</span></span>
            <input class="input" id="cname" placeholder="Ваше имя" style="width:160px;height:28px" value="${esc(S.candName || "")}" aria-label="Имя кандидата">
            <label class="check small"><input type="checkbox" id="aiA">Использовал AI</label>
            <button class="btn sm ghost" id="resetCode">Сбросить</button><button class="btn sm primary" id="submit">${icon("play", "sm")}Отправить на проверку</button></div>
          <div class="editor" id="ed"><div class="gutter" id="gut"></div><textarea id="code" spellcheck="false" aria-label="Редактор кода" wrap="off"></textarea></div>
          <div style="border-top:1px solid var(--border-soft)"><div class="toolbar" style="padding:6px 12px">${icon("terminal", "sm faint")}<span class="small">Вывод проверки</span></div><div class="terminal" id="term" style="height:200px" aria-live="polite"><span class="faint">Нажмите «Отправить на проверку», когда будете готовы.</span></div></div></div>
        <div class="resizer" data-r="1" hidden></div><div class="panel"></div></div></div>`;
      const ta = M.$("#code"), gut = M.$("#gut");
      ta.value = code || t.buggy_code;
      const lines = () => { const n = ta.value.split("\n").length; gut.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n"); ta.rows = n + 2; ta.style.width = Math.max(600, ...ta.value.split("\n").map((l) => l.length * 7.9 + 40)) + "px"; };
      lines();
      let started = null, tick;
      const startTimer = () => { if (started) return; started = Date.now(); tick = setInterval(() => { const s = Math.floor((Date.now() - started) / 1000); const el = M.$("#timer .num"); if (!el) return clearInterval(tick); el.textContent = `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`; }, 1000); };
      const persist = M.debounce(() => { try { localStorage.setItem(key, ta.value); } catch {} }, 400);
      ta.oninput = () => { lines(); startTimer(); persist(); };
      ta.onkeydown = (e) => {
        if (e.key === "Tab") { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText("    ", s, ta.selectionEnd, "end"); ta.oninput(); }
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); M.$("#submit").click(); }
      };
      M.$("#resetCode").onclick = async () => { if (await M.confirm("Сбросить код?", "Ваш черновик заменится стартовым кодом.", "Сбросить", true)) { ta.value = t.buggy_code; lines(); persist(); } };
      resizers(M.$("#chSplit"), "ch");
      M.$("#submit").onclick = async () => {
        const term = M.$("#term"), btn = M.$("#submit");
        const name = M.$("#cname").value.trim();
        S.candName = name; M.save();
        btn.disabled = true;
        const line = (cls, txt) => term.insertAdjacentHTML("beforeend", `<div class="${cls}">${txt}</div>`);
        term.innerHTML = "";
        line("acc", `$ merilo verify --task ${esc(t.id)} --lang ${esc(t.language)}`);
        line("faint", "→ отправка решения на сервер Merilo…");
        try {
          const r = await api.verify({ task_id: t.id, submitted_code: ta.value, candidate_name: name || "Anonymous Candidate", language: t.language, ai_assisted: M.$("#aiA").checked });
          const aiReviewed = r.evaluation_mode !== "fallback";
          M.track("submission", { status: r.status, verified: r.status === "verified" && aiReviewed && r.total_score >= 70 });
          const link = (S.taskLinks || {})[t.id];
          if (link && S.candidates[link.candidate]) {
            S.candidates[link.candidate].assessment = { status: "completed", taskId: t.id, score: r.total_score, tier: r.badge_tier, cardHash: r.card_hash, skills: link.skills, verified: r.status === "verified" && aiReviewed && r.total_score >= 70, mode: r.evaluation_mode, model: r.model };
            M.notify(`Результат задания: ${S.candidates[link.candidate].name || link.candidate} — ${r.total_score}/100`, "candidates/" + link.candidate);
          }
          M.save();
          const g = r.gate_reached;
          line(g >= 1 && r.status !== "rejected" ? "ok" : g === 1 ? "bad" : "ok", `${g === 1 && r.status === "rejected" ? "✗" : "✓"} Gate 1 · Статическая валидация (tree-sitter, ${esc(r.language)})`);
          if (g >= 2) line(r.status === "blocked" ? "bad" : "ok", `${r.status === "blocked" ? "✗ Gate 2 · обнаружена попытка prompt-инъекции — решение заблокировано" : "✓ Gate 2 · Защита от prompt-инъекций пройдена"}`);
          if (g >= 3) {
            const e = r.evaluation || {};
            line(aiReviewed ? "ok" : "warn", aiReviewed ? `✓ Gate 3 · AI code review (${esc(r.model)})` : "⚠ Gate 3 · ОГРАНИЧЕННО: AI недоступен, оценка детерминированной эвристикой (не AI-ревью)");
            line("", `  Clean Code ............ <b>${e.clean_code}</b> × 0.30`);
            line("", `  Architecture .......... <b>${e.architecture}</b> × 0.40`);
            line("", `  Edge Cases & Security . <b>${e.edge_cases}</b> × 0.30`);
            line(r.total_score >= 70 ? "ok" : "warn", `  Итог: <b>${r.total_score}</b>/100 · ${esc(r.badge_tier)} · уверенность ${esc(r.confidence)}`);
            if (r.fallback_reason) line("warn", `  ⚠ ${esc(r.fallback_reason)}`);
            if (e.executive_summary) line("faint", "  " + esc(e.executive_summary));
          }
          line(r.is_signature_valid ? "ok" : "warn", `${r.is_signature_valid ? "✓" : "⚠"} Подпись записи HMAC-SHA256: ${r.is_signature_valid ? "валидна" : "не подтверждена"} · ${esc(r.card_hash)} · ${r.duration_ms} мс`);
          if (r.status === "verified") term.insertAdjacentHTML("beforeend", `<div style="margin-top:8px"><a class="btn sm primary" href="#/verified/${esc(r.card_hash)}">${icon("badge", "sm")}Открыть Verified Skill Card</a></div>`);
          clearInterval(tick);
          if (M.adaptive) M.adaptive.review(t, ta.value, r);
        } catch (err) { line("bad", `✗ ${esc(err.message)}`); line("faint", "Решение не оценено. Карточка не выпущена."); }
        btn.disabled = false;
        term.scrollTop = term.scrollHeight;
      };
    }).catch((err) => (main.innerHTML = `<div class="page">${ui.error(err)}</div>`));
  };

  /* ======================================================================
     Verified Skill Cards
     ====================================================================== */
  M.pages.verifiedList = (main) => {
    M.crumbs([["Verified Skills", "verified"]]);
    M.ctx.label = "Verified Skills";
    main.innerHTML = `<div class="page"><div class="page-head"><div><h1 class="h1">Verified Skills</h1><div class="lead">Подписанные сервером карточки результатов. Подпись подтверждает целостность записи — не авторство кода.</div></div></div><div id="vl" class="grid g3">${ui.loading(4)}</div></div>`;
    api.recentCards(60).then((cards) => {
      const box = M.$("#vl"); if (!box) return;
      M.ctx.data = { cards: cards.map((c) => ({ task: c.task_title, score: c.total_score, tier: c.badge_tier, hash: c.card_hash })) };
      box.classList.add("reveal");
      box.innerHTML = cards.length ? cards.map((c) => `<a class="card" href="#/verified/${c.card_hash}" style="display:block;transition:border-color var(--t-fast)" onmouseover="this.style.borderColor='var(--border-strong)'" onmouseout="this.style.borderColor=''"><div class="sc-stripe" style="border-radius:12px 12px 0 0"></div><div class="card-body stack tight"><div class="row"><span class="chip">${esc(c.language)}</span><span class="spacer"></span><span class="mono faint xs">${c.card_hash}</span></div><div style="font-weight:500">${esc(c.task_title)}</div><div class="row"><span style="font-size:24px;font-weight:600" class="num">${c.total_score}</span><span class="chip ${c.total_score >= 85 ? "ok" : c.total_score >= 70 ? "accent" : "warn"}">${esc(c.badge_tier)}</span><span class="spacer"></span><span class="faint xs">${M.ago(c.created_at)}</span></div></div></a>`).join("") : `<div style="grid-column:1/-1">${ui.empty("badge", "Карточек нет", "Они появятся после первого проверенного решения.")}</div>`;
    }).catch((err) => (M.$("#vl").innerHTML = ui.error(err)));
  };
  M.pages.verified = (main, hash) => {
    M.crumbs([["Verified Skills", "verified"], [hash, ""]]);
    M.ctx.label = "Skill Card " + hash;
    const mode = M.query().mode || "public";
    main.innerHTML = `<div class="page">${ui.loading(8)}</div>`;
    api.card(hash).then((c) => {
      const ev = c.evaluation || c;
      const share = `${location.origin}/card/${c.card_hash}`;
      M.ctx.data = { card: { task: c.task_title, score: c.total_score, tier: c.badge_tier, language: c.language, clean_code: ev.clean_code, architecture: ev.architecture, edge_cases: ev.edge_cases, signature_valid: c.is_signature_valid, created_at: c.created_at, summary: ev.executive_summary } };
      M.copilot.refreshContext();
      const rows = [["Clean Code", ev.clean_code, 30], ["Architecture & Efficiency", ev.architecture, 40], ["Edge Cases & Security", ev.edge_cases, 30]];
      const evMode = String(c.evaluation_mode || ev.evaluation_mode || "").toLowerCase();
      const fullyVerified = c.status === "verified" && evMode && evMode !== "fallback" && c.total_score >= 70;
      const gate = c.gate_reached || (c.status === "verified" ? 3 : null);
      const gates = [
        ["Gate 1 · Статическая валидация", "tree-sitter: синтаксис и структура", gate >= 1 ? (c.status === "rejected" && gate === 1 ? "bad" : "ok") : "none"],
        ["Gate 2 · Защита от инъекций", "шаблоны подмены инструкций грейдеру", gate >= 2 ? (c.status === "blocked" ? "bad" : "ok") : "none"],
        ["Gate 3 · AI code review", evMode === "fallback" ? "ограниченно: детерминированная эвристика (AI недоступен)" : `${esc(c.model || evMode || "AI")} · рубрика 30/40/30`, gate >= 3 ? (evMode === "fallback" ? "warn" : "ok") : "none"],
      ];
      main.innerHTML = `<div class="page" style="max-width:860px">
        <div class="row" style="margin-bottom:16px"><div class="seg"><button class="${mode === "public" ? "on" : ""}" onclick="location.hash='#/verified/${hash}'">Публичный вид</button><button class="${mode === "private" ? "on" : ""}" onclick="location.hash='#/verified/${hash}?mode=private'">Для рекрутера</button></div><span class="spacer"></span><a class="btn sm" href="/card/${esc(c.card_hash)}" target="_blank">${icon("ext", "sm")}Публичная страница</a></div>
        <article class="skill-card reveal"><div class="sc-stripe"></div>
          <div class="sc-top"><div class="row"><span class="logo" style="width:20px;height:20px;font-size:11px">M</span><span class="eyebrow">Merilo · ${fullyVerified ? "Verified Skill Card" : "Skill Card · проверено ограниченно"}</span><span class="spacer"></span><span class="status ${c.is_signature_valid ? "ok" : "bad"}"><i></i>${c.is_signature_valid ? "Подпись валидна" : "Подпись не подтверждена"}</span></div>
            ${fullyVerified ? "" : `<div class="banner warn small">${icon("alert")}<span>${c.status !== "verified" ? "Решение не прошло все шлюзы — карточка не является подтверждением навыка." : evMode === "fallback" ? "Gate 3 выполнен без AI-модели (fallback). Оценка ориентировочная; статус Verified не присваивается." : "Балл ниже порога 70 (Needs Work) — запись подписана, но навык не считается подтверждённым."}</span></div>`}
            <div><div class="muted small">${esc(c.candidate_name || "Кандидат")}</div><h2 style="font-size:20px;margin-top:2px">${esc(c.task_title)}</h2></div>
            <div class="row" style="align-items:flex-end;gap:16px"><span class="sc-score">${c.total_score}</span><div style="padding-bottom:4px"><span class="chip ${c.total_score >= 85 ? "ok" : c.total_score >= 70 ? "accent" : "warn"}">${esc(c.badge_tier)}</span><div class="faint xs" style="margin-top:4px">из 100 · ${esc(c.language)} · рубрика ${esc(c.rubric_version || "2026-11-v1")}</div></div></div></div>
          <div class="sc-rows">${gates.map(([t, d, s]) => `<div class="sc-row"><div><div class="small">${t}</div><div class="faint xs">${d}</div></div><span class="chip ${s === "ok" ? "ok" : s === "warn" ? "warn" : s === "bad" ? "bad" : ""}">${s === "ok" ? "пройден" : s === "warn" ? "ограниченно" : s === "bad" ? "не пройден" : "не выполнялся"}</span></div>`).join("")}${rows.map(([l, v, w]) => `<div class="sc-row"><div><div class="small">${l} <span class="faint">· вес ${w}%</span></div><div class="meter" style="margin-top:6px;max-width:320px"><i style="width:${v ?? 0}%"></i></div></div><b class="num" style="font-size:16px">${v ?? "—"}</b></div>`).join("")}
            ${mode === "private" ? `<div class="sc-row" style="grid-template-columns:1fr"><div class="small muted">${esc(ev.executive_summary || "Сводка недоступна")}</div><div class="faint xs">Режим оценки: ${esc(c.evaluation_mode || ev.evaluation_mode || "—")} · уверенность ${esc(c.confidence || ev.confidence || "—")}${c.ai_assisted ? " · кандидат отметил использование AI" : ""}</div></div>` : ""}</div>
          <div class="sc-foot"><span>ID <span class="mono">${esc(c.card_hash)}</span></span><span>·</span><span>${M.date(c.created_at)}</span><span>·</span><span>Код не исполнялся: статический разбор + AI-ревью</span><span class="spacer"></span>
            <img src="/card/${esc(c.card_hash)}/qr.svg" alt="QR-код для проверки карточки" width="64" height="64" style="background:#fff;border-radius:6px;padding:3px">
            <button class="btn sm no-print" id="cpShare">${icon("link", "sm")}Скопировать ссылку</button><button class="btn sm no-print" onclick="window.print()">${icon("file", "sm")}PDF</button><button class="btn sm" id="vManifest">${icon("shield", "sm")}Проверить манифест</button></div></article>
        <div id="mfOut" style="max-width:640px;margin:12px auto 0"></div><div id="revBox"></div>
        <div style="max-width:640px;margin:16px auto 0" class="row wrap"><img src="/badge/${esc(c.card_hash)}.svg" alt="Бейдж карточки" height="60" style="border-radius:8px"><span class="faint small">Бейдж для README: <span class="mono">/badge/${esc(c.card_hash)}.svg</span></span></div>
        <p class="faint xs" style="text-align:center;margin-top:16px">Подпись гарантирует, что запись не менялась после выдачи. Она не подтверждает авторство решения или личность кандидата.</p></div>`;
      M.$("#cpShare").onclick = () => navigator.clipboard?.writeText(share).then(() => M.toast("Ссылка скопирована"));
      if (mode === "private" && M.adaptive) M.adaptive.mountReview(M.$("#revBox"), hash);
      M.$("#vManifest").onclick = async () => {
        M.$("#mfOut").innerHTML = `<div class="tool-status"><span class="spin"></span>Запрашиваю подписанный манифест…</div>`;
        try { const m = await api.manifest(hash); M.$("#mfOut").innerHTML = `<div class="banner ${m.valid ? "info" : "bad"}">${icon(m.valid ? "check" : "alert")}<div><b>Ed25519: ${m.valid ? "подпись манифеста валидна" : "подпись невалидна"}</b><div class="faint xs mono" style="word-break:break-all;margin-top:4px">${esc((m.ed25519_signature || "").slice(0, 64))}…</div><div class="faint xs">Офлайн-проверка: <span class="mono">python scripts/verify_card.py</span> по ключу из /.well-known/merilo.json</div></div></div>`; }
        catch (err) { M.$("#mfOut").innerHTML = ui.error(err); }
      };
    }).catch((err) => (main.innerHTML = `<div class="page">${err.status === 404 ? ui.empty("badge", "Карточка не найдена", "Проверьте идентификатор.") : ui.error(err)}</div>`));
  };

  /* ======================================================================
     Analytics
     ====================================================================== */
  M.pages.analytics = (main) => {
    M.crumbs([["Аналитика", "analytics"]]);
    M.ctx.label = "Аналитика";
    const q = M.query();
    const range = +(q.w || 12);
    const src = q.src || "live";
    const D = src === "demo" ? demoData(range) : liveData(range);
    M.ctx.demo = src === "demo";
    M.ctx.data = { source: src, weeks: D.weeks, discovery_sessions: D.sessions, reviewed: D.reviewed, invited: D.invited, pipeline: D.pipeline, requested_tech: D.requestedTech, evidence_coverage: D.coverage };
    main.innerHTML = `<div class="page">
      <div class="page-head"><div><h1 class="h1">Аналитика</h1><div class="lead">Активность рекрутинга, покрытие навыков доказательствами и скорость процесса.</div></div>
        <div class="actions"><div class="seg">${[["live", "Мои данные"], ["demo", "Демо"]].map(([k, l]) => `<button class="${src === k ? "on" : ""}" onclick="location.hash='#/analytics?src=${k}&w=${range}'">${l}</button>`).join("")}</div>
        <div class="seg">${[4, 8, 12].map((w) => `<button class="${range === w ? "on" : ""}" onclick="location.hash='#/analytics?src=${src}&w=${w}'">${w} нед</button>`).join("")}</div></div></div>
      ${src === "demo" ? `<div class="banner warn" style="margin-bottom:16px">${icon("info")}<span>Показан <b>вымышленный демо-набор</b> — согласованный, но не реальный. Переключитесь на «Мои данные», чтобы видеть события этого пространства.</span></div>` : `<div class="banner" style="margin-bottom:16px">${icon("info")}<span>Метрики считаются по событиям этого браузера (поиски, сохранения, статусы, задания) и данным Merilo. Где событий мало — показано пустое состояние.</span></div>`}
      <div class="grid g4 reveal" style="margin-bottom:16px">
        <div class="card kpi"><div class="k">Сессии поиска</div><div class="v">${sum(D.sessions)}</div><div class="d">за ${range} нед</div></div>
        <div class="card kpi"><div class="k">Просмотрено кандидатов</div><div class="v">${sum(D.reviewed)}</div><div class="d">сохранено / изменён статус</div></div>
        <div class="card kpi"><div class="k">Приглашены на задание</div><div class="v">${sum(D.invited)}</div><div class="d">${sum(D.reviewed) ? Math.round((sum(D.invited) / sum(D.reviewed)) * 100) + "% от просмотренных" : "—"}</div></div>
        <div class="card kpi"><div class="k">Завершённые задания</div><div class="v">${sum(D.done)}</div><div class="d">${sum(D.sent) && sum(D.done) <= sum(D.sent) ? Math.round((sum(D.done) / sum(D.sent)) * 100) + "% от отправленных" : "проверок решений"}</div></div></div>
      <div class="grid g2" style="margin-bottom:16px">
        ${chartCard("act", "Активность рекрутинга", "Сессии поиска, просмотры и приглашения по неделям", true)}
        ${chartCard("asg", "Задания: отправлено и завершено", "По неделям", true)}</div>
      <div class="grid g3" style="margin-bottom:16px">
        ${chartCard("tech", "Запрашиваемые технологии", "Из критериев поисков")}
        ${chartCard("cov", "Покрытие навыков доказательствами", "% кандидатов с подтверждением в коде")}
        ${chartCard("st", "Статус заданий", "Распределение")}</div>
      <div class="grid g2">
        ${chartCard("flow", "Воронка Merilo", src === "demo" ? "Демо-набор" : "Discovered → Analyzed → Matched → Challenged → Verified · из данных пространства")}
        ${chartCard("eff", "Эффективность", "Медианы по неделям", true)}</div></div>`;
    if (src === "live") {
      main.querySelector(".grid.g4")?.insertAdjacentHTML("afterend", `<div class="card" style="margin-bottom:16px"><div class="card-head"><h3 class="h3">API Usage</h3><span class="faint small">OpenAI · сервер Merilo · сегодня</span></div><div class="card-body" id="apiUse">${ui.loading(2)}</div></div>`);
      api.aiUsage().then((u) => { const el = M.$("#apiUse"); if (!el) return; const pct = Math.min(100, Math.round((u.tokens / Math.max(1, u.budget)) * 100)); el.innerHTML = `<div class="row wrap" style="gap:24px"><div><div class="faint xs">Модель</div><b class="mono">${esc(u.model)}</b></div><div><div class="faint xs">Вызовов</div><b class="num">${u.calls}</b></div><div><div class="faint xs">Токенов</div><b class="num">${u.tokens.toLocaleString("ru-RU")}</b> <span class="faint small">/ ${u.budget.toLocaleString("ru-RU")}</span></div><div style="flex:1;min-width:160px"><div class="faint xs">Дневной лимит</div><div class="meter" style="margin-top:6px"><i style="width:${pct}%"></i></div></div></div><div class="faint xs" style="margin-top:8px">Счётчик процесса сервера с последнего запуска (${esc(u.day)}).</div>`; }).catch((e) => { const el = M.$("#apiUse"); if (el) el.innerHTML = ui.error(e); });
    }
    const C = MeriloCharts;
    const has = (arr) => arr && arr.some((v) => v > 0);
    const draw = (id, ok, fn, emptyText) => { const el = M.$("#ch-" + id); if (!el) return; if (!ok) { el.innerHTML = ui.empty("chart", "Недостаточно данных", emptyText); return; } fn(el); };
    const seriesAct = [{ name: "Сессии поиска", data: D.sessions }, { name: "Просмотрено", data: D.reviewed }, { name: "Приглашено", data: D.invited }];
    draw("act", has(D.sessions) || has(D.reviewed), (el) => C.area(el, { labels: D.weeks, series: seriesAct, label: "Активность" }), "Запустите поиски и сохраните кандидатов — график появится автоматически.");
    draw("asg", has(D.sent), (el) => C.stacked(el, { labels: D.weeks, series: [{ name: "Завершено", data: D.done, color: "var(--chart-2)" }, { name: "Ожидают", data: D.sent.map((v, i) => Math.max(0, v - D.done[i])), color: "var(--chart-1)" }] }), "Опубликуйте задание и проверьте решение.");
    draw("tech", D.requestedTech.length, (el) => C.hbar(el, { items: D.requestedTech }), "Нет сохранённых поисков с критериями.");
    draw("cov", D.coverage.length, (el) => C.hbar(el, { items: D.coverage, unit: "%", color: "var(--chart-2)" }), "Нужны кандидаты и активная вакансия.");
    draw("st", D.assessStatus.some((d) => d.value), (el) => C.donut(el, { items: D.assessStatus, centerLabel: "заданий" }), "Нет кандидатов со статусом задания.");
    draw("flow", D.pipeline[0]?.value, (el) => C.flow(el, { stages: D.pipeline }), "Нет данных по воронке.");
    draw("eff", D.eff, (el) => C.line(el, { labels: D.weeks, series: [{ name: "Ревью кандидата, мин", data: D.eff.reviewMinutes }, { name: "От находки до приглашения, дн", data: D.eff.discoveryToInviteDays, color: "var(--chart-3)" }, { name: "Выполнение задания, ч/10", data: D.eff.turnaroundHours.map((v) => v / 10), color: "var(--chart-4)", dashed: true }] }), "Медианы времени требуют событий с метками времени для каждого этапа (просмотр → приглашение → решение). Пока их недостаточно.");
    M.$$("[data-view]").forEach((b) => (b.onclick = () => {
      const id = b.dataset.view, el = M.$("#ch-" + id);
      const tableMode = b.dataset.mode !== "table";
      b.dataset.mode = tableMode ? "table" : "chart";
      b.innerHTML = tableMode ? icon("chart", "sm") : icon("menu", "sm");
      if (id === "act") tableMode ? C.table(el, D.weeks, seriesAct) : C.area(el, { labels: D.weeks, series: seriesAct });
      if (id === "asg") tableMode ? C.table(el, D.weeks, [{ name: "Отправлено", data: D.sent }, { name: "Завершено", data: D.done }]) : M.rerender();
      if (id === "eff" && D.eff) tableMode ? C.table(el, D.weeks, [{ name: "Ревью, мин", data: D.eff.reviewMinutes }, { name: "До приглашения, дн", data: D.eff.discoveryToInviteDays }, { name: "Выполнение, ч", data: D.eff.turnaroundHours }]) : M.rerender();
    }));
  };
  const sum = (a) => (a || []).reduce((x, y) => x + y, 0);
  const chartCard = (id, title, sub, toggle) => `<div class="card"><div class="card-head"><div><h3 class="h3">${title}</h3><div class="faint xs">${sub}</div></div>${toggle ? `<div class="actions"><button class="icon-btn" data-view="${id}" data-tip="Таблица / график" aria-label="Переключить таблицу">${icon("menu", "sm")}</button></div>` : ""}</div><div class="card-body"><div id="ch-${id}" style="min-height:120px"></div></div></div>`;
  function demoData(w) {
    const A = MeriloDemo.analytics, cut = (a) => a.slice(-w);
    return { weeks: cut(A.weeks), sessions: cut(A.sessions), reviewed: cut(A.reviewed), invited: cut(A.invited), sent: cut(A.assessmentsSent), done: cut(A.assessmentsDone), requestedTech: A.requestedTech, coverage: A.coverage, assessStatus: A.assessmentStatus, pipeline: A.pipeline,
      eff: { reviewMinutes: cut(A.efficiency.reviewMinutes), discoveryToInviteDays: cut(A.efficiency.discoveryToInviteDays), turnaroundHours: cut(A.efficiency.turnaroundHours) } };
  }
  function liveData(w) {
    const WEEK = 7 * 864e5, now = Date.now();
    const weeks = Array.from({ length: w }, (_, i) => { const d = new Date(now - (w - 1 - i) * WEEK); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`; });
    const bucket = (types) => { const arr = new Array(w).fill(0); S.events.filter((e) => types.includes(e.type)).forEach((e) => { const i = w - 1 - Math.floor((now - e.ts) / WEEK); if (i >= 0 && i < w) arr[i] += e.n || 1; }); return arr; };
    const tech = {};
    Object.values(S.searches).forEach((s) => [...(s.criteria.languages || []), ...(s.criteria.frameworks || [])].forEach((t) => (tech[t] = (tech[t] || 0) + 1)));
    const cands = M.allCandidates().filter((c) => !c.demo);
    const job = M.activeJob();
    const coverage = job && cands.length ? [...job.required, ...job.preferred].map((cr) => ({ label: cr, value: Math.round((cands.filter((c) => ["observed", "challenge"].includes(M.evidenceFor(c, cr).status)).length / cands.length) * 100) })) : [];
    const st = (s) => cands.filter((c) => c.assessment?.status === s).length;
    const found = Object.values(S.searches).filter((s) => s.source !== "demo").reduce((a, s) => a + s.results.length, 0);
    return { weeks, sessions: bucket(["search_run"]), reviewed: bucket(["candidate_saved", "review"]), invited: bucket(["challenge_published"]), sent: bucket(["challenge_published"]), done: bucket(["submission"]),
      requestedTech: Object.entries(tech).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value })), coverage,
      assessStatus: [{ label: "Завершено", value: st("completed") }, { label: "Выполняет", value: st("in-progress") }, { label: "Приглашён", value: st("invited") }],
      pipeline: [
        { label: "Discovered · найдено", value: found },
        { label: "Analyzed · код изучен", value: Object.keys(S.proofs || {}).length },
        { label: "Matched · есть доказательства", value: cands.filter((c) => M.proofsFor(c.login).length).length },
        { label: "Challenged · задание", value: st("invited") + st("in-progress") + st("completed") },
        { label: "Verified · карточка", value: cands.filter((c) => c.assessment?.verified).length }],
      eff: null };
  }

  /* ======================================================================
     Extension onboarding (+ import from extension)
     ====================================================================== */
  M.pages.extension = (main) => {
    M.crumbs([["Расширение", "extension"]]);
    M.ctx.label = "Chromium-расширение";
    const q = M.query();
    let imported = null;
    if (q.import) { try { imported = JSON.parse(decodeURIComponent(escape(atob(q.import)))); } catch { imported = null; } }
    main.innerHTML = `<div class="page" style="max-width:980px">
      <div class="page-head"><div><h1 class="h1">Merilo для Chromium</h1><div class="lead">Боковая панель рядом с GitHub: доказательства навыков в коде, Developer DNA и требования активной вакансии. Сохранённый кандидат сразу появляется здесь.</div></div></div>
      ${imported ? `<div class="card" style="margin-bottom:16px;border-color:color-mix(in srgb,var(--accent) 40%,var(--border))"><div class="card-head">${icon("puzzle")}<h3 class="h3">Импорт из расширения</h3></div><div class="card-body stack">
        <div class="row">${ui.avatar({ avatar: null, name: imported.login || imported.title })}<div><b>${esc(imported.login ? "@" + imported.login : imported.title || "Страница")}</b><div class="faint small">${esc(imported.url || "")}</div></div></div>
        <div class="row wrap">${ui.chips(imported.skills || [], "ok")}</div>
        <div class="faint small">Источник: ${esc(imported.source || "страница")} · собрано по нажатию в расширении ${M.ago(imported.ts)}</div>
        <div class="row"><button class="btn primary" id="impOk">${icon("bookmark", "sm")}Сохранить в пространство</button>${imported.login ? `<button class="btn" onclick="M.go('github/${esc(imported.login)}')">Полный анализ GitHub</button>` : ""}<button class="btn ghost" onclick="location.hash='#/extension'">Отклонить</button></div></div></div>` : ""}
      <div class="grid g2">
        <div class="card"><div class="card-head"><h3 class="h3">Установка</h3><span class="faint small">≈ 1 минута</span></div><div class="card-body stack small">
          ${["Откройте <span class='mono'>chrome://extensions</span> (или edge://extensions).", "Включите «Режим разработчика».", "Нажмите «Загрузить распакованное» и выберите папку <span class='mono'>extension/</span> в репозитории Merilo.", `Нажмите значок Merilo — откроется боковая панель. В её настройках адрес рабочего пространства: <span class="mono">${esc(location.origin)}</span>`].map((s, i) => `<div class="row" style="align-items:flex-start"><span class="chip num">${i + 1}</span><span class="muted">${s}</span></div>`).join("")}
          <button class="btn" id="cpOrigin" style="justify-self:start">${icon("copy", "sm")}Скопировать адрес</button></div></div>
        <div class="card"><div class="card-head"><h3 class="h3">Подключение</h3></div><div class="card-body stack small" id="extConn">${ui.loading(2)}</div></div>
        <div class="card"><div class="card-head"><h3 class="h3">Разрешения</h3><span class="faint small">минимальные</span></div><div>
          ${[["activeTab", "Доступ к открытой вкладке только после клика по иконке"], ["scripting", "Однократное чтение страницы по кнопке «Анализировать»"], ["sidePanel", "Боковая панель рядом со страницей"], ["storage", "Адрес вашего рабочего пространства"], ["host: github.com", "Видеть адрес открытой страницы GitHub; данные запрашивает сервер Merilo"]].map(([p, d]) => `<div class="list-row"><span class="mono small" style="width:160px">${p}</span><span class="muted small">${d}</span></div>`).join("")}
          <div class="list-row"><span class="chip bad">нет</span><span class="muted small">Фоновых скриптов на всех сайтах, &lt;all_urls&gt;, чтения cookies, автоматических действий</span></div></div></div>
        <div class="card"><div class="card-head"><h3 class="h3">Поддерживаемые страницы</h3></div><div>
          <div class="list-row"><span class="chip ok">GitHub</span><span class="muted small">Профиль и репозиторий: login, языки, публичные репозитории через API</span></div>
          <div class="list-row"><span class="chip ok">Портфолио</span><span class="muted small">Заголовок, ссылки на GitHub и упомянутые технологии — по клику</span></div>
          <div class="list-row"><span class="chip warn">LinkedIn</span><span class="muted small">Только сохранение URL. Никакого чтения страницы, оверлеев и автоматизации</span></div></div></div></div></div>`;
    M.$("#cpOrigin").onclick = () => navigator.clipboard?.writeText(location.origin).then(() => M.toast("Адрес скопирован"));
    M.$("#impOk")?.addEventListener("click", () => {
      const id = M.saveCandidate({ id: imported.login ? "gh-" + imported.login : M.uid("ext"), login: imported.login || "", name: imported.login || imported.title, url: imported.url, source: "Расширение · " + (imported.source || "страница"), skills: imported.skills || [], evidence: (imported.skills || []).map((s) => ({ skill: s, kind: "page", detail: "Упомянуто на странице " + (imported.title || ""), url: imported.url })), gaps: ["Данные со страницы не проверены кодом — откройте GitHub Intelligence"], linkedin: imported.source === "linkedin" ? { url: imported.url, source: "сохранено рекрутером вручную" } : null, fetchedAt: imported.ts });
      M.toast("Сохранено из расширения"); M.go("candidates/" + id);
    });
    api.health().then((h) => { const el = M.$("#extConn"); if (el) el.innerHTML = `<div class="status ok"><i></i>Сервер Merilo доступен (${esc(h.status || "ok")})</div><div class="muted">Расширение обращается к <span class="mono">${esc(location.origin)}/api/health</span> и открывает это пространство для импорта. Данные передаются только после вашего подтверждения здесь.</div>`; })
      .catch(() => { const el = M.$("#extConn"); if (el) el.innerHTML = `<div class="status bad"><i></i>Сервер недоступен</div>`; });
  };

  /* ======================================================================
     Settings & Integrations
     ====================================================================== */
  M.pages.settings = (main) => {
    M.crumbs([["Настройки", "settings"]]);
    M.ctx.label = "Настройки";
    const theme = document.documentElement.dataset.theme;
    main.innerHTML = `<div class="page" style="max-width:860px">
      <div class="page-head"><div><h1 class="h1">Настройки</h1><div class="lead">Пространство, данные и приватность.</div></div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><h3 class="h3">Внешний вид</h3></div>
          <div class="list-row"><span style="flex:1">Тема</span><div class="seg">${[["dark", "Тёмная"], ["light", "Светлая"]].map(([k, l]) => `<button class="${theme === k ? "on" : ""}" data-theme-set="${k}">${l}</button>`).join("")}</div></div>
          <div class="list-row"><span style="flex:1">Анимации<div class="faint xs">Учитывается системная настройка «уменьшить движение»</div></span><span class="faint small">${matchMedia("(prefers-reduced-motion: reduce)").matches ? "уменьшены системой" : "включены"}</span></div></div>
        <div class="card"><div class="card-head"><h3 class="h3">Демо-режим</h3></div>
          <div class="list-row"><span style="flex:1">Показывать демо-данные<div class="faint xs">Вымышленные кандидаты, вакансии и аналитика. Всегда помечены DEMO и никогда не смешиваются с реальными Skill Cards.</div></span><button class="switch" role="switch" aria-checked="${S.demo}" id="demoSw" aria-label="Демо-данные"></button></div></div>
        <div class="card"><div class="card-head"><h3 class="h3">Данные и хранение</h3></div>
          <div class="list-row"><span style="flex:1">Автоудаление кандидатов<div class="faint xs">Сохранённые профили старше срока удаляются при открытии пространства</div></span><select class="select" id="ret" style="width:auto">${[[0, "Никогда"], [30, "30 дней"], [90, "90 дней"], [180, "180 дней"]].map(([v, l]) => `<option value="${v}" ${+(S.retention || 0) === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
          <div class="list-row"><span style="flex:1">Экспорт данных пространства<div class="faint xs">JSON: кандидаты, вакансии, заметки, поиски</div></span><button class="btn sm" id="exp">${icon("arrowR", "sm")}Экспорт</button></div>
          <div class="list-row"><span style="flex:1">Удалить все локальные данные<div class="faint xs">Кандидаты, заметки, поиски, история Copilot. Опубликованные задания и Skill Cards на сервере не затрагиваются.</div></span><button class="btn sm danger" id="wipe">${icon("trash", "sm")}Удалить</button></div></div>
        <div class="card"><div class="card-head"><h3 class="h3">Принципы</h3></div><div class="card-body stack tight small muted">
          ${["Каждый вывод AI помечен и ссылается на источник или явно называет неопределённость.", "AI не принимает решений о найме и не отклоняет кандидатов автоматически.", "Защищённые характеристики не используются и не выводятся.", "LinkedIn не скрапится; без авторизованной интеграции хранится только URL.", "Merilo не отправляет сообщения кандидатам — это делает рекрутер.", "Код кандидата не исполняется ни во фронтенде, ни на сервере приложения."].map((p) => `<div class="row" style="align-items:flex-start">${icon("check", "sm")}<span>${p}</span></div>`).join("")}</div></div></div></div>`;
    M.$$("[data-theme-set]").forEach((b) => (b.onclick = () => { S.theme = b.dataset.themeSet; M.save(); M.applyTheme(); M.rerender(); }));
    M.$("#demoSw").onclick = () => M.setDemo(!S.demo);
    M.$("#ret").onchange = (e) => { S.retention = +e.target.value; M.save(); applyRetention(); M.toast("Срок хранения обновлён"); };
    M.$("#exp").onclick = () => { const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), candidates: S.candidates, jobs: S.jobs, notes: S.notes, review: S.review, searches: S.searches }, null, 2)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "merilo-workspace.json"; a.click(); URL.revokeObjectURL(a.href); };
    M.$("#wipe").onclick = async () => { if (await M.confirm("Удалить все локальные данные?", "Это нельзя отменить. Данные на сервере Merilo не затрагиваются.", "Удалить всё", true)) M.resetData(); };
  };
  M.pages.integrations = (main) => {
    M.crumbs([["Интеграции", "integrations"]]);
    M.ctx.label = "Интеграции";
    main.innerHTML = `<div class="page" style="max-width:860px"><div class="page-head"><div><h1 class="h1">Интеграции</h1><div class="lead">Подключённые сервисы и их права. Ключи хранятся на сервере в <span class="mono">.env</span> и никогда не попадают в браузер.</div></div></div><div class="card" id="intg">${ui.loading(5)}</div></div>`;
    api.integrations().then((s) => {
      const row = (ic, name, ok, desc, extra = "") => `<div class="list-row" style="padding:14px 16px;align-items:flex-start">${icon(ic)}<div style="flex:1"><div class="row"><b style="font-weight:500">${name}</b><span class="status ${ok === true ? "ok" : ok === false ? "bad" : "warn"}"><i></i>${ok === true ? "Подключено" : ok === false ? "Не подключено" : "Ограничено"}</span></div><div class="muted small" style="margin-top:3px">${desc}</div>${extra}</div></div>`;
      M.$("#intg").innerHTML =
        row("sparkles", "OpenAI", s.openai.configured, `Copilot, разбор запросов, черновики заданий. Модель: <span class="mono">${esc(s.openai.model)}</span>.`, `<div class="faint xs" style="margin-top:4px">Отозвать доступ: удалите <span class="mono">OPENAI_API_KEY</span> из .env и перезапустите сервер.</div>`) +
        row("git", "GitHub (публичный API)", s.github.authenticated ? true : null, esc(s.github.note) + (s.github.authenticated ? " · токен задан" : ""), `<div class="faint xs" style="margin-top:4px">Для лимита 5000/ч добавьте <span class="mono">GITHUB_TOKEN</span> (без scope, только публичные данные).</div>`) +
        row("link", "LinkedIn", false, esc(s.linkedin.note), `<div class="faint xs" style="margin-top:4px">Поддерживается: сохранение URL, который рекрутер открыл сам (через расширение). Анализ профиля не выполняется.</div>`) +
        row("shield", "Проверка решений Merilo", s.evaluation.configured, esc(s.evaluation.note) + ". AI-оценка Gate 3 использует Gemini (GEMINI_API_KEY) или детерминированный fallback.") +
        row("puzzle", "Chromium-расширение", null, `Локальное подключение по адресу пространства. <a href="#/extension" style="color:var(--accent-text)">Настроить</a>`);
    }).catch((err) => (M.$("#intg").innerHTML = `<div class="card-body">${ui.error(err)}</div>`));
  };

  /* ---------- Retention policy ---------- */
  function applyRetention() {
    const days = +(S.retention || 0);
    if (!days) return;
    const cutoff = Date.now() - days * 864e5;
    let n = 0;
    Object.values(S.candidates).forEach((c) => { if ((c.addedAt || 0) < cutoff) { delete S.candidates[c.id]; delete S.notes[c.id]; n++; } });
    if (n) { M.save(); M.notify(`Автоудаление: удалено профилей — ${n}`); }
  }
  applyRetention();
})();
