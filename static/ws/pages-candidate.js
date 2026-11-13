/* Merilo Workspace — candidate pages.
   The same shell, a different job: the candidate sees their own cards,
   the catalog of open tasks, and the profile settings that add the HR role. */
(function () {
  "use strict";

  const { esc, icon, ui, api } = M;

  const self = () => (window.MeriloDemo && MeriloDemo.candidateSelf) || {
    name: M.user?.full_name || "Кандидат",
    headline: "Кандидат Merilo",
    city: "—",
    skills: [],
    languages: {},
    profile_slug: M.user?.profile_slug || "",
    demo: true,
  };

  const cards = () => (window.MeriloDemo && MeriloDemo.candidateCards) || [];
  const catalog = () => (window.MeriloDemo && MeriloDemo.candidateTasks) || [];

  const firstName = (name) => String(name || "кандидат").split(/\s+/)[0];
  const scoreClass = (score) => (score >= 80 ? "ok" : score >= 60 ? "warn" : "bad");
  const initials = (name) => M.initials(name || "M");

  async function loadCards() {
    if (M.user && !M.user.demo && M.user.profile_slug) {
      try {
        const res = await fetch(
          `/api/users/${encodeURIComponent(M.user.profile_slug)}/cards`,
          { credentials: "same-origin" }
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) return data;
        }
      } catch (e) { /* fall through to the clearly-labelled demo cards */ }
    }
    return cards();
  }

  function cardRow(card) {
    const state = card.defense_status || card.defense;
    const defense = state === "recorded"
      ? '<span class="chip ok">Защита записана</span>'
      : '<span class="chip warn">Защита не записана</span>';
    return `<a class="list-row link" href="/card/${encodeURIComponent(card.card_hash)}" target="_blank" rel="noopener">
      <span class="avatar">${esc(initials(card.task_title))}</span>
      <span style="flex:1;min-width:0">
        <span style="display:block;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(card.task_title)}</span>
        <span class="faint" style="font-size:12px">${esc(card.company_name || "Merilo")} · ${esc(M.date(card.created_at))}</span>
      </span>
      ${defense}
      <span class="chip ${scoreClass(card.total_score)}">${Number(card.total_score) || 0}</span>
      <span class="chip">${esc(card.badge_tier || "Verified")}</span>
      ${icon("chevR", "sm faint")}
    </a>`;
  }

  function taskCard(task) {
    return `<div class="card">
      <div class="card-body" style="display:grid;gap:10px">
        <div class="row" style="justify-content:space-between">
          <span class="chip">${esc(task.difficulty || "Middle")}</span>
          <span class="faint mono" style="font-size:11px">${esc(task.language || "python")}</span>
        </div>
        <div>
          <div class="h3">${esc(task.title)}</div>
          <div class="muted" style="font-size:12.5px;margin-top:4px">${esc(task.description || "")}</div>
        </div>
        <div class="row wrap" style="gap:6px">${ui.chips(String(task.stack || "").split("·").map((s) => s.trim()).filter(Boolean))}</div>
        <a class="btn primary sm" href="/#workbench" style="justify-self:start">Открыть стенд ${icon("arrowR", "sm")}</a>
      </div>
    </div>`;
  }

  function profileRow(label, value) {
    return `<div class="list-row"><span class="muted" style="flex:1">${esc(label)}</span><span>${value}</span></div>`;
  }

  M.pages.candidateDashboard = async (main) => {
    const me = self();
    const list = await loadCards();
    const avg = list.length ? Math.round(list.reduce((sum, c) => sum + (Number(c.total_score) || 0), 0) / list.length) : 0;
    const recorded = list.filter((c) => c.defense === "recorded").length;
    const openTasks = catalog();

    main.innerHTML = `<div class="page">
      <div class="page-head">
        <div>
          <h1 class="h1">Привет, ${esc(firstName(me.name))}</h1>
          <p class="lead">${M.user?.demo
            ? "Это демо-пространство кандидата: данные вымышлены и помечены DEMO. После входа здесь появятся ваши реальные карточки."
            : "Ваши проверенные карточки, открытые задания и профиль — в одном месте."}</p>
        </div>
        <div class="actions">
          <a class="btn primary" href="/#workbench">${icon("play", "sm")} Проверить код</a>
        </div>
      </div>

      <div class="grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="card kpi"><span class="k">Проверенные карточки</span><span class="v">${list.length}</span><span class="d">подписаны и доступны по ссылке</span></div>
        <div class="card kpi"><span class="k">Средний балл</span><span class="v">${avg || "—"}</span><span class="d">по взвешенной рубрике</span></div>
        <div class="card kpi"><span class="k">Защита записана</span><span class="v">${recorded}</span><span class="d">из ${list.length || 0} карточек</span></div>
        <div class="card kpi"><span class="k">Открытых заданий</span><span class="v">${openTasks.length}</span><span class="d">из каталога Merilo</span></div>
      </div>

      <div class="grid" style="grid-template-columns:1.35fr 1fr;margin-top:16px">
        <section class="card">
          <div class="card-head"><span class="h3">Последние карточки</span><a class="btn ghost sm" href="#/my-cards" style="margin-left:auto">Все карточки ${icon("arrowR", "sm")}</a></div>
          <div class="list">${list.length ? list.slice(0, 4).map(cardRow).join("") : ui.empty("badge", "Пока нет карточек", "Пройдите первую проверку на стенде — карточка появится здесь.", '<a class="btn primary sm" href="/#workbench">Открыть стенд</a>')}</div>
        </section>

        <section class="card">
          <div class="card-head"><span class="h3">Что дальше</span></div>
          <div class="card-body" style="display:grid;gap:12px">
            <div class="row" style="align-items:flex-start;gap:10px">${icon("play", "sm")}<div><div style="font-weight:500">Проверьте ещё одно решение</div><div class="muted" style="font-size:12.5px">Стенд открыт без регистрации, результат подписывается сразу.</div></div></div>
            <div class="row" style="align-items:flex-start;gap:10px">${icon("badge", "sm")}<div><div style="font-weight:500">Добавьте карточку в профиль</div><div class="muted" style="font-size:12.5px">Публичный профиль показывает только проверенные карточки.</div></div></div>
            <div class="row" style="align-items:flex-start;gap:10px">${icon("users", "sm")}<div><div style="font-weight:500">Нужна роль HR?</div><div class="muted" style="font-size:12.5px">Добавьте вторую роль в профиле — один аккаунт для обеих сторон.</div></div></div>
            <a class="btn sm" href="#/profile" style="justify-self:start">Настроить профиль</a>
          </div>
        </section>
      </div>

      <section style="margin-top:24px">
        <div class="page-head" style="margin-bottom:12px"><div><h2 class="h2">Задания из каталога</h2><p class="lead">Короткие инженерные кейсы с понятной рубрикой.</p></div><a class="btn ghost sm" href="#/tasks">Все задания ${icon("arrowR", "sm")}</a></div>
        <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${openTasks.slice(0, 3).map(taskCard).join("")}</div>
      </section>
    </div>`;
  };

  M.pages.candidateCards = async (main) => {
    const list = await loadCards();
    main.innerHTML = `<div class="page">
      <div class="page-head">
        <div><h1 class="h1">Мои карточки</h1><p class="lead">Каждая карточка подписана и открывается по публичной ссылке. Защита записывается отдельно.</p></div>
        <div class="actions"><a class="btn primary" href="/#workbench">${icon("plus", "sm")} Новая проверка</a></div>
      </div>
      <div class="card">
        <div class="list">${list.length ? list.map(cardRow).join("") : ui.empty("badge", "Карточек пока нет", "Пройдите проверку на стенде — результат появится здесь.", '<a class="btn primary sm" href="/#workbench">Открыть стенд</a>')}</div>
      </div>
    </div>`;
  };

  M.pages.candidateTasks = (main) => {
    const list = catalog();
    main.innerHTML = `<div class="page">
      <div class="page-head">
        <div><h1 class="h1">Задания</h1><p class="lead">Выберите кейс и откройте его на стенде. Проверка занимает несколько минут.</p></div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr))">${list.map(taskCard).join("")}</div>
    </div>`;

    // Real catalog first when the API is reachable; the demo cards remain as a
    // clearly-labelled fallback so the page never looks broken offline.
    api.tasks().then((tasks) => {
      if (!Array.isArray(tasks) || !tasks.length) return;
      const grid = main.querySelector(".grid");
      if (grid) grid.innerHTML = tasks.slice(0, 12).map(taskCard).join("");
    }).catch(() => {});
  };

  M.pages.candidateProfile = (main) => {
    const me = self();
    const user = M.user || {};
    const primary = user.role === "recruiter" || user.role === "owner" ? "рекрутер" : "кандидат";
    const secondary = user.secondary_role
      ? (user.secondary_role === "recruiter" ? "рекрутер" : "кандидат")
      : null;
    const canAddRole = !user.demo;
    const skills = (me.skills || []).map((s) => `<span class="chip">${esc(s)}</span>`).join("");
    const langs = Object.entries(me.languages || {}).map(([k, v]) => `<span class="chip">${esc(k)} · ${esc(v)}</span>`).join("");

    main.innerHTML = `<div class="page">
      <div class="page-head">
        <div><h1 class="h1">Профиль</h1><p class="lead">Основная роль задаётся при регистрации. Вторую роль можно добавить здесь — аккаунт останется один.</p></div>
      </div>

      <div class="grid" style="grid-template-columns:1.15fr 0.85fr">
        <section class="card">
          <div class="card-body" style="display:flex;gap:14px;align-items:flex-start">
            <span class="avatar xl">${esc(initials(me.name))}</span>
            <div style="min-width:0">
              <div class="h1" style="font-size:18px">${esc(me.name || "Кандидат")}</div>
              <div class="muted">${esc(me.headline || "Кандидат Merilo")}</div>
              <div class="faint" style="font-size:12px;margin-top:4px">${esc(user.email || "demo@merilo.local")}${me.city ? " · " + esc(me.city) : ""}</div>
              <div class="row wrap" style="gap:6px;margin-top:10px">${skills || '<span class="faint">Навыки появятся после проверки</span>'}</div>
              ${langs ? `<div class="row wrap" style="gap:6px;margin-top:8px">${langs}</div>` : ""}
            </div>
          </div>
          ${me.profile_slug ? `<div class="card-body" style="border-top:1px solid var(--border-soft)"><a class="btn sm" href="/p/${encodeURIComponent(me.profile_slug)}" target="_blank" rel="noopener">${icon("ext", "sm")} Публичный профиль</a></div>` : ""}
        </section>

        <section class="card">
          <div class="card-head"><span class="h3">Роли аккаунта</span></div>
          <div class="list">
            ${profileRow("Основная роль", `<span class="chip accent">${esc(primary)}</span>`)}
            ${profileRow("Вторая роль", secondary ? `<span class="chip ok">${esc(secondary)}</span>` : '<span class="faint">не добавлена</span>')}
          </div>
          <div class="card-body" style="display:grid;gap:10px">
            ${secondary
              ? `<div class="muted" style="font-size:12.5px">Переключение между ролями доступно в меню пользователя.</div>
                 <button class="btn sm" id="switch-workspace-role">${icon("users", "sm")} Переключиться на ${user.role === "candidate" ? "HR" : "кандидата"}</button>`
              : canAddRole
                ? `<div class="muted" style="font-size:12.5px">Добавьте вторую роль, чтобы открыть HR-портал или сторону кандидата в этом же аккаунте.</div>
                   <button class="btn primary sm" id="add-secondary-role">${icon("plus", "sm")} Добавить роль ${user.role === "candidate" ? "HR" : "кандидата"}</button>`
                : `<div class="muted" style="font-size:12.5px">Это демо-аккаунт. Зарегистрируйтесь на главной, чтобы добавить вторую роль.</div>
                   <a class="btn sm" href="/?auth=1">Войти или зарегистрироваться</a>`}
          </div>
        </section>
      </div>
    </div>`;

    const add = main.querySelector("#add-secondary-role");
    if (add) add.onclick = async () => {
      const role = user.role === "candidate" ? "recruiter" : "candidate";
      add.disabled = true;
      try {
        const res = await fetch("/api/auth/roles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ role }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.detail || "Не удалось добавить роль");
        M.user = data.user;
        M.toast("Вторая роль добавлена", { icon: "check" });
        M.rerender();
      } catch (err) {
        add.disabled = false;
        M.toast(err.message, { icon: "alert" });
      }
    };

    const swap = main.querySelector("#switch-workspace-role");
    if (swap) swap.onclick = () => M.setRole(M.role === "candidate" ? "recruiter" : "candidate");
  };
})();
