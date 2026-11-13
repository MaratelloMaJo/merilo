/* Merilo charts — dependency-free SVG charts in the EvilCharts visual idiom
   (gradient areas, animated tooltips, interactive legends, theme tokens). */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
  let uid = 0;

  function svg(tag, attrs, parent) {
    const el = document.createElementNS(NS, tag);
    for (const k in attrs || {}) el.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(el);
    return el;
  }
  const fmt = (v, unit) => (v == null ? "—" : (Math.round(v * 10) / 10).toLocaleString("ru-RU") + (unit ? " " + unit : ""));
  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return Math.ceil(((n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p) / 4) * 4; // divisible by the 4 grid steps → whole-number ticks
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  function frame(el, height) {
    el.innerHTML = "";
    el.classList.add("chart");
    const width = Math.max(el.clientWidth || 600, 240);
    const root = svg("svg", { viewBox: `0 0 ${width} ${height}`, height, role: "img" }, el);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    el.appendChild(tip);
    return { root, tip, width, height };
  }

  function showTip(tip, el, x, y, title, rows, unit) {
    tip.innerHTML = `<div class="tt-title">${esc(title)}</div>` +
      rows.map((r) => `<div class="tt-row"><span class="sw" style="background:${r.color}"></span>${esc(r.name)}<b>${fmt(r.value, unit)}</b></div>`).join("");
    const w = tip.offsetWidth || 160;
    const left = Math.min(Math.max(x + 14, 0), el.clientWidth - w - 4);
    tip.style.transform = `translate(${x + 14 + w > el.clientWidth ? x - w - 14 : left}px, ${Math.max(y - 20, 0)}px)`;
    tip.classList.add("on");
  }

  function legend(el, series, onToggle) {
    const box = document.createElement("div");
    box.className = "legend";
    series.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.innerHTML = `<span class="sw" style="background:${s.color}"></span>${esc(s.name)}`;
      b.setAttribute("aria-pressed", "true");
      b.onclick = () => { s.hidden = !s.hidden; b.classList.toggle("off", s.hidden); b.setAttribute("aria-pressed", String(!s.hidden)); onToggle(); };
      if (s.hidden) b.classList.add("off");
      box.appendChild(b);
    });
    el.appendChild(box);
  }

  /* ---------- Area / line ---------- */
  function area(el, opts) {
    const series = opts.series.map((s, i) => ({ ...s, color: s.color || PALETTE[i % 5] }));
    const H = opts.height || 220;
    const draw = () => {
      const { root, tip, width } = frame(el, H);
      const pad = { l: 34, r: 8, t: 10, b: 24 };
      const W = width - pad.l - pad.r, h = H - pad.t - pad.b;
      const vis = series.filter((s) => !s.hidden);
      const max = niceMax(Math.max(1, ...vis.flatMap((s) => s.data)));
      const n = opts.labels.length;
      const x = (i) => pad.l + (n === 1 ? W / 2 : (i * W) / (n - 1));
      const y = (v) => pad.t + h - (v / max) * h;
      for (let g = 0; g <= 4; g++) {
        const gy = pad.t + (h * g) / 4;
        svg("line", { x1: pad.l, x2: pad.l + W, y1: gy, y2: gy, class: "grid-line" }, root);
        svg("text", { x: pad.l - 8, y: gy + 3, "text-anchor": "end", class: "axis-text" }, root).textContent = fmt(max - (max * g) / 4);
      }
      const step = Math.ceil(n / Math.max(2, Math.floor(W / 70)));
      opts.labels.forEach((lb, i) => {
        if (i % step === 0 || i === n - 1) svg("text", { x: x(i), y: H - 6, "text-anchor": "middle", class: "axis-text" }, root).textContent = lb;
      });
      const defs = svg("defs", {}, root);
      vis.forEach((s) => {
        const id = "g" + ++uid;
        const lg = svg("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 }, defs);
        svg("stop", { offset: "0%", "stop-color": s.color, "stop-opacity": opts.line ? 0 : 0.32 }, lg);
        svg("stop", { offset: "100%", "stop-color": s.color, "stop-opacity": 0 }, lg);
        const pts = s.data.map((v, i) => [x(i), y(v)]);
        const d = smooth(pts);
        if (!opts.line) svg("path", { d: `${d} L${x(n - 1)},${pad.t + h} L${x(0)},${pad.t + h} Z`, fill: `url(#${id})`, class: "fade-in" }, root);
        const p = svg("path", { d, fill: "none", stroke: s.color, "stroke-width": 1.8, class: "draw", ...(s.dashed ? { "stroke-dasharray": "4 4" } : {}) }, root);
        const len = Math.ceil(p.getTotalLength ? p.getTotalLength() : 2000);
        if (!s.dashed) p.style.setProperty("--len", len);
        else p.classList.remove("draw");
      });
      const cursor = svg("line", { y1: pad.t, y2: pad.t + h, class: "cursor-line", opacity: 0 }, root);
      const dots = vis.map((s) => svg("circle", { r: 3.5, fill: "var(--surface)", stroke: s.color, "stroke-width": 2, opacity: 0 }, root));
      const hit = svg("rect", { x: pad.l, y: pad.t, width: W, height: h, fill: "transparent" }, root);
      hit.addEventListener("mousemove", (e) => {
        const r = root.getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * width;
        const i = Math.max(0, Math.min(n - 1, Math.round(((px - pad.l) / W) * (n - 1))));
        cursor.setAttribute("x1", x(i)); cursor.setAttribute("x2", x(i)); cursor.setAttribute("opacity", 1);
        vis.forEach((s, k) => { dots[k].setAttribute("cx", x(i)); dots[k].setAttribute("cy", y(s.data[i])); dots[k].setAttribute("opacity", 1); });
        showTip(tip, el, (x(i) / width) * el.clientWidth, (y(Math.max(...vis.map((s) => s.data[i]))) / H) * H, opts.labels[i],
          vis.map((s) => ({ name: s.name, value: s.data[i], color: s.color })), opts.unit);
      });
      hit.addEventListener("mouseleave", () => { tip.classList.remove("on"); cursor.setAttribute("opacity", 0); dots.forEach((d) => d.setAttribute("opacity", 0)); });
      root.setAttribute("aria-label", opts.label || "График");
      if (series.length > 1) legend(el, series, draw);
    };
    draw();
    observe(el, draw);
  }

  function smooth(pts) {
    if (pts.length < 2) return `M${pts[0][0]},${pts[0][1]}`;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
      const cx = (x0 + x1) / 2;
      d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`;
    }
    return d;
  }

  /* ---------- Horizontal bar ---------- */
  function hbar(el, opts) {
    el.innerHTML = "";
    el.classList.add("chart");
    const max = niceMax(Math.max(1, ...opts.items.map((d) => d.value)));
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gap = "9px";
    opts.items.forEach((d, i) => {
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:minmax(90px,140px) 1fr 48px;gap:10px;align-items:center;font-size:12px";
      const pct = (d.value / max) * 100;
      const color = d.color || opts.color || PALETTE[0];
      row.innerHTML = `<span class="muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(d.label)}">${esc(d.label)}</span>
        <span style="height:8px;border-radius:4px;background:var(--surface-3);overflow:hidden;position:relative">
          <i class="grow-x" style="position:absolute;inset:0 auto 0 0;width:${pct}%;background:${color};border-radius:4px;animation-delay:${i * 40}ms"></i>
          ${d.secondary != null ? `<i style="position:absolute;inset:0 auto 0 0;width:${(d.secondary / max) * 100}%;border-right:2px solid var(--text)"></i>` : ""}
        </span>
        <b class="num" style="text-align:right;font-weight:600">${fmt(d.value, opts.unit)}</b>`;
      row.title = d.hint || "";
      wrap.appendChild(row);
    });
    el.appendChild(wrap);
  }

  /* ---------- Donut ---------- */
  function donut(el, opts) {
    const items = opts.items.map((d, i) => ({ ...d, color: d.color || PALETTE[i % 5] }));
    const draw = () => {
      const size = 180;
      el.innerHTML = "";
      el.classList.add("chart");
      const box = document.createElement("div");
      box.style.cssText = "display:flex;align-items:center;gap:20px;flex-wrap:wrap";
      el.appendChild(box);
      const holder = document.createElement("div");
      holder.style.cssText = `position:relative;width:${size}px;height:${size}px;flex:none`;
      box.appendChild(holder);
      const root = svg("svg", { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: "img", "aria-label": opts.label || "Распределение" }, holder);
      const vis = items.filter((d) => !d.hidden);
      const total = vis.reduce((a, d) => a + d.value, 0) || 1;
      const R = 74, r = 52, c = size / 2;
      let a0 = -Math.PI / 2;
      const center = document.createElement("div");
      center.style.cssText = "position:absolute;inset:0;display:grid;place-items:center;text-align:center;pointer-events:none";
      const setCenter = (v, k) => (center.innerHTML = `<div><div style="font-size:22px;font-weight:600;font-variant-numeric:tabular-nums">${fmt(v)}</div><div class="faint xs">${esc(k)}</div></div>`);
      setCenter(total, opts.centerLabel || "всего");
      vis.forEach((d, i) => {
        const a1 = a0 + (d.value / total) * Math.PI * 2 - 0.02;
        const large = a1 - a0 > Math.PI ? 1 : 0;
        const p = (rad, ang) => [c + rad * Math.cos(ang), c + rad * Math.sin(ang)];
        const [x0, y0] = p(R, a0), [x1, y1] = p(R, a1), [x2, y2] = p(r, a1), [x3, y3] = p(r, a0);
        const path = svg("path", { d: `M${x0},${y0} A${R},${R} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 ${large} 0 ${x3},${y3} Z`, fill: d.color, class: "fade-in", style: `animation-delay:${i * 60}ms;transition:opacity 120ms;cursor:pointer` }, root);
        path.addEventListener("mouseenter", () => { root.querySelectorAll("path").forEach((q) => q !== path && (q.style.opacity = 0.35)); setCenter(d.value, d.label); });
        path.addEventListener("mouseleave", () => { root.querySelectorAll("path").forEach((q) => (q.style.opacity = 1)); setCenter(total, opts.centerLabel || "всего"); });
        a0 = a1 + 0.02;
      });
      holder.appendChild(center);
      const lg = document.createElement("div");
      lg.className = "legend";
      lg.style.cssText = "display:grid;gap:6px;min-width:150px";
      items.forEach((d) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = d.hidden ? "off" : "";
        b.innerHTML = `<span class="sw" style="background:${d.color}"></span>${esc(d.label)}<b class="num" style="margin-left:auto;padding-left:14px;color:var(--text)">${fmt(d.value)}</b>`;
        b.style.width = "100%";
        b.onclick = () => { d.hidden = !d.hidden; draw(); };
        lg.appendChild(b);
      });
      box.appendChild(lg);
    };
    draw();
  }

  /* ---------- Stacked bar ---------- */
  function stacked(el, opts) {
    const series = opts.series.map((s, i) => ({ ...s, color: s.color || PALETTE[i % 5] }));
    const H = opts.height || 220;
    const draw = () => {
      const { root, tip, width } = frame(el, H);
      const pad = { l: 34, r: 8, t: 10, b: 24 };
      const W = width - pad.l - pad.r, h = H - pad.t - pad.b;
      const vis = series.filter((s) => !s.hidden);
      const n = opts.labels.length;
      const totals = opts.labels.map((_, i) => vis.reduce((a, s) => a + s.data[i], 0));
      const max = niceMax(Math.max(1, ...totals));
      for (let g = 0; g <= 4; g++) {
        const gy = pad.t + (h * g) / 4;
        svg("line", { x1: pad.l, x2: pad.l + W, y1: gy, y2: gy, class: "grid-line" }, root);
        svg("text", { x: pad.l - 8, y: gy + 3, "text-anchor": "end", class: "axis-text" }, root).textContent = fmt(max - (max * g) / 4);
      }
      const bw = Math.min(28, (W / n) * 0.6);
      opts.labels.forEach((lb, i) => {
        const cx = pad.l + (W / n) * (i + 0.5);
        let acc = 0;
        const g = svg("g", { class: "grow", style: `animation-delay:${i * 30}ms` }, root);
        vis.forEach((s, k) => {
          const v = s.data[i];
          const bh = (v / max) * h;
          svg("rect", { x: cx - bw / 2, y: pad.t + h - acc - bh, width: bw, height: Math.max(0, bh - 1), fill: s.color, rx: k === vis.length - 1 ? 3 : 0 }, g);
          acc += bh;
        });
        svg("text", { x: cx, y: H - 6, "text-anchor": "middle", class: "axis-text" }, root).textContent = lb;
        const hit = svg("rect", { x: cx - W / n / 2, y: pad.t, width: W / n, height: h, fill: "transparent" }, root);
        hit.addEventListener("mousemove", () => showTip(tip, el, (cx / width) * el.clientWidth, (pad.t + h - acc) * 1, lb,
          vis.map((s) => ({ name: s.name, value: s.data[i], color: s.color })), opts.unit));
        hit.addEventListener("mouseleave", () => tip.classList.remove("on"));
      });
      if (series.length > 1) legend(el, series, draw);
    };
    draw();
    observe(el, draw);
  }

  /* ---------- Radar (single assessment rubric only) ---------- */
  function radar(el, opts) {
    el.innerHTML = "";
    el.classList.add("chart");
    const size = 220, c = size / 2, R = 80;
    const root = svg("svg", { viewBox: `0 0 ${size} ${size}`, width: "100%", height: size, role: "img", "aria-label": opts.label || "Рубрика" }, el);
    const n = opts.axes.length;
    const ang = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
    for (let ring = 1; ring <= 4; ring++) {
      const pts = opts.axes.map((_, i) => [c + ((R * ring) / 4) * Math.cos(ang(i)), c + ((R * ring) / 4) * Math.sin(ang(i))].join(",")).join(" ");
      svg("polygon", { points: pts, fill: "none", class: "grid-line" }, root);
    }
    opts.axes.forEach((a, i) => {
      svg("line", { x1: c, y1: c, x2: c + R * Math.cos(ang(i)), y2: c + R * Math.sin(ang(i)), class: "grid-line" }, root);
      const t = svg("text", { x: c + (R + 16) * Math.cos(ang(i)), y: c + (R + 16) * Math.sin(ang(i)) + 3, "text-anchor": "middle", class: "axis-text" }, root);
      t.textContent = `${a.label} · ${Math.round(a.value)}`;
    });
    const pts = opts.axes.map((a, i) => [c + (R * a.value) / 100 * Math.cos(ang(i)), c + (R * a.value) / 100 * Math.sin(ang(i))].join(",")).join(" ");
    svg("polygon", { points: pts, fill: "var(--accent-soft)", stroke: "var(--accent)", "stroke-width": 1.8, class: "fade-in" }, root);
  }

  /* ---------- Funnel / Sankey-lite (stage flow) ---------- */
  function flow(el, opts) {
    el.innerHTML = "";
    el.classList.add("chart");
    const max = Math.max(1, ...opts.stages.map((s) => s.value));
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:grid;gap:6px";
    opts.stages.forEach((s, i) => {
      const prev = i ? opts.stages[i - 1].value : null;
      const conv = prev ? Math.round((s.value / Math.max(prev, 1)) * 100) : null;
      const row = document.createElement("div");
      row.style.cssText = "display:grid;grid-template-columns:150px 1fr 90px;gap:12px;align-items:center;font-size:12px";
      row.innerHTML = `<span class="muted">${esc(s.label)}</span>
        <span style="display:flex;justify-content:center;height:22px"><i class="grow-x" style="display:block;width:${(s.value / max) * 100}%;background:color-mix(in srgb, var(--chart-1) ${100 - i * 12}%, var(--surface-3));border-radius:4px;animation-delay:${i * 50}ms"></i></span>
        <span style="text-align:right"><b class="num">${fmt(s.value)}</b> ${conv != null ? `<span class="faint">· ${conv}%</span>` : ""}</span>`;
      wrap.appendChild(row);
    });
    el.appendChild(wrap);
  }

  /* ---------- Data table view ---------- */
  function table(el, labels, series, unit) {
    el.innerHTML = `<div class="table-wrap" style="max-height:260px"><table class="t"><thead><tr><th>Период</th>${series.map((s) => `<th style="text-align:right">${esc(s.name)}</th>`).join("")}</tr></thead><tbody>${labels
      .map((l, i) => `<tr><td>${esc(l)}</td>${series.map((s) => `<td class="num" style="text-align:right">${fmt(s.data[i], unit)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div>`;
  }

  const observers = new WeakMap();
  function observe(el, fn) {
    if (!("ResizeObserver" in window) || observers.has(el)) return;
    let last = el.clientWidth, t;
    const ro = new ResizeObserver(() => {
      if (Math.abs(el.clientWidth - last) < 8) return;
      last = el.clientWidth;
      clearTimeout(t);
      t = setTimeout(() => { if (el.isConnected) fn(); else ro.disconnect(); }, 120);
    });
    ro.observe(el);
    observers.set(el, ro);
  }

  window.MeriloCharts = { area, line: (el, o) => area(el, { ...o, line: true }), hbar, donut, stacked, radar, flow, table, PALETTE };
})();
