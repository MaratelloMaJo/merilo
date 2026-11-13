/* Merilo DEMO dataset — fictional people, repositories and events.
   Every record carries demo:true and the UI labels it "DEMO". Logins use the
   "demo-" prefix so they can never collide with real GitHub accounts, and no
   demo record links to an external profile. */
(function () {
  "use strict";
  // Deterministic PRNG so the dataset is identical on every load.
  let seed = 20261113;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const DAY = 86400000;
  const NOW = Date.UTC(2026, 10, 13);

  const ev = (skill, kind, detail, repo, file) => ({ skill, kind, detail, repo, path: file || null, demo: true });

  const candidates = [
    { id: "demo-aruzhan", login: "demo-aruzhan", name: "Аружан Т. (демо)", location: "Алматы", headline: "Frontend, 2 года пет-проектов, без коммерческого опыта",
      languages: { TypeScript: 9, JavaScript: 4, CSS: 2 }, skills: ["TypeScript", "React", "Next.js", "Vitest", "Tailwind CSS"],
      evidence: [ev("React", "dependency", "react@19 в package.json", "demo-aruzhan/budget-board", "package.json"), ev("TypeScript", "config", "strict: true в tsconfig.json", "demo-aruzhan/budget-board", "tsconfig.json"), ev("Testing", "tests", "42 файла *.test.tsx", "demo-aruzhan/budget-board", "src/__tests__"), ev("CI/CD", "ci", "GitHub Actions: lint + test", "demo-aruzhan/budget-board", ".github/workflows/ci.yml")],
      gaps: ["Работа с бэкенд-API в продакшене не подтверждена", "Нет данных о работе в команде (code review)"], oss: false },
    { id: "demo-timur", login: "demo-timur", name: "Тимур Б. (демо)", location: "Астана", headline: "Fullstack, контрибьютор open-source",
      languages: { TypeScript: 12, Go: 3, Shell: 1 }, skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "Docker", "Playwright"],
      evidence: [ev("React", "dependency", "react@18 + @tanstack/react-query", "demo-timur/fleet-tracker", "package.json"), ev("Open source", "contribution", "7 смёрженных PR в demo-org/ui-kit", "demo-org/ui-kit"), ev("Testing", "tests", "Playwright e2e: 18 сценариев", "demo-timur/fleet-tracker", "e2e/"), ev("Docker", "infra", "docker-compose с Postgres", "demo-timur/fleet-tracker", "docker-compose.yml")],
      gaps: ["Производительность под нагрузкой не проверялась"], oss: true },
    { id: "demo-dana", login: "demo-dana", name: "Дана К. (демо)", location: "Шымкент", headline: "Junior, учебные проекты + хакатоны",
      languages: { JavaScript: 6, Python: 3, HTML: 3 }, skills: ["JavaScript", "React", "Python", "Flask"],
      evidence: [ev("React", "code", "Функциональные компоненты и хуки", "demo-dana/hackathon-queue", "src/components"), ev("Python", "dependency", "flask в requirements.txt", "demo-dana/queue-api", "requirements.txt")],
      gaps: ["Нет тестов в публичных проектах", "TypeScript не обнаружен", "Нет CI"], oss: false },
    { id: "demo-yerlan", login: "demo-yerlan", name: "Ерлан С. (демо)", location: "Алматы", headline: "Backend на Python, FastAPI",
      languages: { Python: 14, Dockerfile: 2 }, skills: ["Python", "FastAPI", "pytest", "SQLAlchemy", "Docker"],
      evidence: [ev("FastAPI", "dependency", "fastapi в pyproject.toml", "demo-yerlan/clinic-api", "pyproject.toml"), ev("Testing", "tests", "pytest, 120 тестов, coverage в CI", "demo-yerlan/clinic-api", "tests/"), ev("Open source", "contribution", "2 PR в demo-org/fastapi-utils", "demo-org/fastapi-utils")],
      gaps: ["Фронтенд-навыки не подтверждены", "Миграции БД без отката"], oss: true },
    { id: "demo-madina", login: "demo-madina", name: "Мадина Ж. (демо)", location: "Караганда", headline: "Frontend, дизайн-системы",
      languages: { TypeScript: 7, CSS: 5, MDX: 2 }, skills: ["TypeScript", "React", "Storybook", "CSS"],
      evidence: [ev("React", "code", "Библиотека из 34 компонентов", "demo-madina/kit", "packages/ui"), ev("TypeScript", "config", "tsconfig + d.ts экспорт", "demo-madina/kit", "tsconfig.json"), ev("Documentation", "docs", "Storybook + README с примерами", "demo-madina/kit", "README.md")],
      gaps: ["Тесты покрывают только утилиты", "Нет опыта с серверным рендерингом"], oss: false },
    { id: "demo-arman", login: "demo-arman", name: "Арман Н. (демо)", location: "Удалённо", headline: "Go / Kubernetes",
      languages: { Go: 10, Shell: 3, HCL: 2 }, skills: ["Go", "Kubernetes", "Docker", "Terraform"],
      evidence: [ev("Go", "code", "gRPC-сервис с graceful shutdown", "demo-arman/ledger-svc", "cmd/server"), ev("CI/CD", "ci", "GitHub Actions + golangci-lint", "demo-arman/ledger-svc", ".github/workflows")],
      gaps: ["React/TypeScript не обнаружены"], oss: true },
  ];
  candidates.forEach((c, i) => Object.assign(c, {
    demo: true, source: "DEMO", avatar: null, url: null, linkedin: null,
    repos: [...new Set(c.evidence.map((e) => e.repo))],
    addedAt: NOW - (i * 3 + 2) * DAY,
    review: ["shortlisted", "shortlisted", "new", "new", "on-hold", "new"][i],
    assessment: i === 0 ? { status: "completed", score: 86, tier: "Gold Verified", demo: true } : i === 2 ? { status: "invited" } : i === 1 ? { status: "in-progress" } : { status: "none" },
  }));

  const jobs = [
    { id: "demo-job-fe", title: "Frontend-разработчик (React + TypeScript)", team: "Продукт · Платёжный кабинет", status: "open", demo: true,
      required: ["TypeScript", "React", "Testing"], preferred: ["Next.js", "CI/CD", "Open source"], createdAt: NOW - 20 * DAY,
      notes: "Готовы рассматривать кандидатов без коммерческого опыта при сильных публичных проектах." },
    { id: "demo-job-be", title: "Python Backend (FastAPI)", team: "Платформа", status: "open", demo: true,
      required: ["Python", "FastAPI", "Testing"], preferred: ["Docker", "SQLAlchemy"], createdAt: NOW - 35 * DAY, notes: "" },
  ];

  // Weekly recruiting activity for 12 weeks (fictional).
  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const d = new Date(NOW - w * 7 * DAY);
    weeks.push(`${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const trend = (base, growth, noise) => weeks.map((_, i) => Math.max(0, Math.round(base + growth * i + (rnd() - 0.5) * noise)));
  const analytics = {
    demo: true,
    weeks,
    sessions: trend(6, 1.1, 5),
    reviewed: trend(24, 3.2, 12),
    invited: trend(3, 0.7, 3),
    assessmentsSent: trend(3, 0.6, 3),
    assessmentsDone: trend(2, 0.45, 2),
    requestedTech: [
      { label: "TypeScript", value: 34 }, { label: "React", value: 31 }, { label: "Python", value: 22 },
      { label: "FastAPI", value: 12 }, { label: "Go", value: 9 }, { label: "Kubernetes", value: 6 }],
    coverage: [
      { label: "TypeScript", value: 72, hint: "Доля кандидатов в шорт-листе с подтверждением в коде" },
      { label: "React", value: 81 }, { label: "Тестирование", value: 46 }, { label: "CI/CD", value: 38 },
      { label: "Работа с API", value: 29 }, { label: "Безопасность", value: 17 }],
    assessmentStatus: [
      { label: "Завершено", value: 18 }, { label: "В процессе", value: 6 }, { label: "Приглашены", value: 9 }, { label: "Истекло", value: 4 }],
    pipeline: [
      { label: "Найдено", value: 412 }, { label: "Просмотрено", value: 236 }, { label: "Шорт-лист", value: 61 },
      { label: "Приглашены на задачу", value: 37 }, { label: "Задача выполнена", value: 18 }, { label: "Интервью", value: 9 }],
    efficiency: {
      reviewMinutes: trend(14, -0.5, 3).map((v) => Math.max(5, v)),
      discoveryToInviteDays: trend(9, -0.35, 2).map((v) => Math.max(2, v)),
      turnaroundHours: trend(52, -1.8, 10).map((v) => Math.max(12, v)),
    },
  };

  const githubFixture = (login) => {
    const c = candidates.find((x) => x.login === login);
    if (!c) return null;
    return {
      source: "demo", demo: true, fetched_at: Math.floor(NOW / 1000),
      profile: { login: c.login, name: c.name, avatar_url: null, url: null, bio: c.headline, location: c.location, public_repos: c.repos.length + 4, followers: 12 + c.repos.length * 3, created_at: "2023-02-11T00:00:00Z" },
      languages: c.languages,
      repo_count: { own: c.repos.length + 4, forks: 3 },
      repos: c.repos.filter((r) => r.startsWith(c.login)).map((r, i) => ({
        name: r.split("/")[1], full_name: r, url: null, description: c.evidence.find((e) => e.repo === r)?.detail || "",
        language: Object.keys(c.languages)[0], topics: c.skills.slice(0, 3).map((s) => s.toLowerCase()), stars: 3 + i * 4, forks: i,
        size_kb: 840, pushed_at: new Date(NOW - (i + 1) * 9 * DAY).toISOString(), inspected: true,
        signals: { readme: true, license: i === 0, tests: c.evidence.some((e) => e.skill === "Testing" && e.repo === r), ci: c.evidence.some((e) => e.skill === "CI/CD"), docker: c.skills.includes("Docker"), typescript: c.skills.includes("TypeScript"), lint: i === 0, manifest: true },
      })),
      limits: ["DEMO: вымышленный профиль — данные не получены из GitHub."],
    };
  };

  // The candidate side of the demo: one believable profile, a couple of
  // already-verified cards, and the catalog the workbench opens.
  const candidateSelf = {
    ...candidates[0],
    id: "demo-self",
    profile_slug: "demo-aruzhan",
    email: "aruzhan@example.com",
    headline: "Frontend-разработчик · React + TypeScript",
    demo: true,
  };

  const candidateCards = [
    {
      card_hash: "demo-aruzhan-2026",
      task_title: "Frontend-разработчик (React + TypeScript)",
      company_name: "Merilo Demo",
      total_score: 86,
      badge_tier: "Gold Verified",
      status: "verified",
      language: "typescript",
      created_at: new Date(NOW - 3 * DAY).toISOString(),
      defense: "recorded",
      demo: true,
    },
    {
      card_hash: "demo-aruzhan-2026-2",
      task_title: "Собственный код: React-компонент",
      company_name: "Merilo Demo",
      total_score: 74,
      badge_tier: "Silver Verified",
      status: "verified",
      language: "typescript",
      created_at: new Date(NOW - 12 * DAY).toISOString(),
      defense: "pending",
      demo: true,
    },
  ];

  const candidateTasks = [
    {
      id: "demo-task-fe",
      title: "Корзина интернет-магазина",
      company_name: "Merilo Demo",
      stack: "React · TypeScript",
      difficulty: "Middle",
      language: "typescript",
      description: "Почините пересчёт скидок и покройте крайние случаи тестами.",
      demo: true,
    },
    {
      id: "demo-task-py",
      title: "Идемпотентный платёжный вебхук",
      company_name: "Merilo Demo",
      stack: "Python · FastAPI",
      difficulty: "Senior",
      language: "python",
      description: "Защитите обработчик от повторных доставок и гонок.",
      demo: true,
    },
    {
      id: "demo-task-js",
      title: "Дебаунс поиска",
      company_name: "Merilo Demo",
      stack: "JavaScript",
      difficulty: "Junior",
      language: "javascript",
      description: "Реализуйте отмену устаревших запросов и очистку таймеров.",
      demo: true,
    },
  ];

  window.MeriloDemo = {
    candidates, jobs, analytics, githubFixture, NOW,
    candidateSelf, candidateCards, candidateTasks,
  };
})();
