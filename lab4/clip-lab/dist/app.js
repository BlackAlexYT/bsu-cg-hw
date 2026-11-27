(function () {
  "use strict";

  const { liangBarsky, cyrusBeck, analyzePolygon, normalizeRect, parseInputText } =
    window.ClipLab;

  const ALGOS = [
    {
      id: "liang-barsky",
      title: "Лианг — Барски (прямоугольное окно)",
      info: "Параметрическое задание отрезка P(t) = P₀ + t(P₁ − P₀), t ∈ [0, 1]; 4 неравенства pₖt ≤ qₖ.",
    },
    {
      id: "cyrus-beck",
      title: "Кирус — Бек (выпуклый многоугольник)",
      info: "Отсечение отрезка выпуклым многоугольником с использованием внутренних нормалей к рёбрам.",
    },
  ];

  const EXAMPLES = {
    "liang-barsky": {
      rect: { xmin: 1, ymin: 2, xmax: 7, ymax: 6 },
      segments: [
        { x1: -2, y1: 1, x2: 10, y2: 7 },
        { x1: 2, y1: 3, x2: 5, y2: 5 },
        { x1: 0, y1: 7, x2: 8, y2: 7 },
        { x1: 4, y1: 0, x2: 9, y2: 4 },
        { x1: 7.5, y1: 1, x2: 10, y2: 5 },
      ],
    },
    "cyrus-beck": {
      polygon: [
        { x: 1, y: 1 },
        { x: 6, y: 1 },
        { x: 8, y: 4 },
        { x: 5, y: 7 },
        { x: 1, y: 5 },
      ],
      segments: [
        { x1: -1, y1: 1, x2: 9, y2: 6 },
        { x1: 2, y1: 2, x2: 5, y2: 5 },
        { x1: 0, y1: 6.5, x2: 8, y2: 6.5 },
        { x1: 3, y1: 0, x2: 8, y2: 2 },
        { x1: -1, y1: 3, x2: 4, y2: 8 },
      ],
    },
  };

  const state = {
    mode: "liang-barsky",
    rect: { ...EXAMPLES["liang-barsky"].rect },
    polygon: EXAMPLES["cyrus-beck"].polygon.map((p) => ({ ...p })),
    segments: EXAMPLES["liang-barsky"].segments.map((s) => ({ ...s })),
    selectedIndex: 0,
    scale: 42,
    panX: 0,
    panY: 0,
    pendingStart: null,
    dragging: false,
    dragMoved: false,
    lastMouse: { x: 0, y: 0 },
  };

  const el = {
    algos: document.getElementById("algos"),
    algoInfo: document.getElementById("algoInfo"),
    clipperTitle: document.getElementById("clipperTitle"),
    rectInputs: document.getElementById("rectInputs"),
    xmin: document.getElementById("xmin"),
    ymin: document.getElementById("ymin"),
    xmax: document.getElementById("xmax"),
    ymax: document.getElementById("ymax"),
    polyInputs: document.getElementById("polyInputs"),
    polyText: document.getElementById("polyText"),
    polyStatus: document.getElementById("polyStatus"),
    fileInput: document.getElementById("fileInput"),
    applyText: document.getElementById("applyText"),
    rawInput: document.getElementById("rawInput"),
    parseError: document.getElementById("parseError"),
    example: document.getElementById("example"),
    random: document.getElementById("random"),
    drawMode: document.getElementById("drawMode"),
    showLabels: document.getElementById("showLabels"),
    fit: document.getElementById("fit"),
    clearSegs: document.getElementById("clearSegs"),
    cv: document.getElementById("cv"),
    summary: document.getElementById("summary"),
    benchBtn: document.getElementById("benchBtn"),
    benchOut: document.getElementById("benchOut"),
    segbar: document.getElementById("segbar"),
    traceTitle: document.getElementById("traceTitle"),
    traceSub: document.getElementById("traceSub"),
    traceTable: document.getElementById("traceTable"),
  };

  const ctx = el.cv.getContext("2d");

  function fmt(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    const r = Math.round(v * 1000) / 1000;
    return Number.isInteger(r) ? String(r) : r.toFixed(3).replace(/\.?0+$/, "");
  }

  function serializeState() {
    const lines = [String(state.segments.length)];
    for (const s of state.segments) {
      lines.push(`${fmt(s.x1)} ${fmt(s.y1)} ${fmt(s.x2)} ${fmt(s.y2)}`);
    }
    if (state.mode === "liang-barsky") {
      const r = normalizeRect(state.rect);
      lines.push(`${fmt(r.xmin)} ${fmt(r.ymin)} ${fmt(r.xmax)} ${fmt(r.ymax)}`);
    } else {
      lines.push(String(state.polygon.length));
      for (const v of state.polygon) {
        lines.push(`${fmt(v.x)} ${fmt(v.y)}`);
      }
    }
    el.rawInput.value = lines.join("\n");
  }

  function syncInputsFromState() {
    const r = normalizeRect(state.rect);
    el.xmin.value = r.xmin;
    el.ymin.value = r.ymin;
    el.xmax.value = r.xmax;
    el.ymax.value = r.ymax;
    el.polyText.value = state.polygon.map((v) => `${fmt(v.x)} ${fmt(v.y)}`).join("\n");
    const info = analyzePolygon(state.polygon);
    el.polyStatus.textContent = info.reason;
    el.polyStatus.style.color = info.convex ? "#15803d" : "#b91c1c";
    serializeState();
  }

  function renderAlgoButtons() {
    el.algos.innerHTML = "";
    for (const a of ALGOS) {
      const b = document.createElement("button");
      b.textContent = a.title;
      if (a.id === state.mode) b.className = "active";
      b.onclick = () => {
        if (state.mode === a.id) return;
        state.mode = a.id;
        loadExample();
      };
      el.algos.appendChild(b);
    }
    const cur = ALGOS.find((a) => a.id === state.mode);
    el.algoInfo.textContent = cur.info;
    const isLB = state.mode === "liang-barsky";
    el.clipperTitle.textContent = isLB ? "Отсекающее окно" : "Выпуклый многоугольник";
    el.rectInputs.hidden = !isLB;
    el.polyInputs.hidden = isLB;
  }

  function loadExample() {
    const ex = EXAMPLES[state.mode];
    if (state.mode === "liang-barsky") {
      state.rect = { ...ex.rect };
    } else {
      state.polygon = ex.polygon.map((p) => ({ ...p }));
    }
    state.segments = ex.segments.map((s) => ({ ...s }));
    state.selectedIndex = 0;
    state.pendingStart = null;
    el.parseError.hidden = true;
    renderAlgoButtons();
    syncInputsFromState();
    fitToView();
    render();
  }

  function worldToScreen(wx, wy) {
    const w = el.cv.clientWidth;
    const h = el.cv.clientHeight;
    return {
      x: w / 2 + state.panX + wx * state.scale,
      y: h / 2 + state.panY - wy * state.scale,
    };
  }

  function screenToWorld(sx, sy) {
    const w = el.cv.clientWidth;
    const h = el.cv.clientHeight;
    return {
      x: (sx - w / 2 - state.panX) / state.scale,
      y: -(sy - h / 2 - state.panY) / state.scale,
    };
  }

  function fitToView() {
    const pts = [];
    for (const s of state.segments) {
      pts.push({ x: s.x1, y: s.y1 }, { x: s.x2, y: s.y2 });
    }
    if (state.mode === "liang-barsky") {
      const r = normalizeRect(state.rect);
      pts.push({ x: r.xmin, y: r.ymin }, { x: r.xmax, y: r.ymax });
    } else {
      for (const v of state.polygon) pts.push(v);
    }
    if (pts.length === 0) return;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    const spanX = Math.max(2, maxX - minX);
    const spanY = Math.max(2, maxY - minY);
    const w = el.cv.clientWidth || 800;
    const h = el.cv.clientHeight || 500;
    state.scale = Math.max(2, Math.min((w * 0.72) / spanX, (h * 0.72) / spanY));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    state.panX = -cx * state.scale;
    state.panY = cy * state.scale;
  }

  function niceStep(pxPerUnit) {
    const targetPx = 64;
    const raw = targetPx / pxPerUnit;
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / pow;
    if (norm < 1.5) return 1 * pow;
    if (norm < 3.5) return 2 * pow;
    if (norm < 7.5) return 5 * pow;
    return 10 * pow;
  }

  function drawGridAndAxes(w, h) {
    const topLeft = screenToWorld(0, 0);
    const botRight = screenToWorld(w, h);
    const step = niceStep(state.scale);

    ctx.lineWidth = 1;
    ctx.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";

    const xStart = Math.floor(topLeft.x / step) * step;
    const yStart = Math.floor(botRight.y / step) * step;

    ctx.strokeStyle = "#edf0f7";
    for (let x = xStart; x <= botRight.x + step; x += step) {
      const sx = worldToScreen(x, 0).x;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, h);
      ctx.stroke();
    }
    for (let y = yStart; y <= topLeft.y + step; y += step) {
      const sy = worldToScreen(0, y).y;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(w, sy);
      ctx.stroke();
    }

    const origin = worldToScreen(0, 0);
    ctx.strokeStyle = "#94a3b8";
    ctx.lineWidth = 1.4;
    if (origin.y >= 0 && origin.y <= h) {
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(w, origin.y);
      ctx.stroke();
    }
    if (origin.x >= 0 && origin.x <= w) {
      ctx.beginPath();
      ctx.moveTo(origin.x, 0);
      ctx.lineTo(origin.x, h);
      ctx.stroke();
    }

    ctx.fillStyle = "#64748b";
    const axisY = Math.min(Math.max(origin.y + 14, 14), h - 6);
    for (let x = xStart; x <= botRight.x + step; x += step) {
      if (Math.abs(x) < 1e-9) continue;
      const sx = worldToScreen(x, 0).x;
      if (sx > 20 && sx < w - 20) ctx.fillText(fmt(x), sx + 3, axisY);
    }
    const axisX = Math.min(Math.max(origin.x + 5, 6), w - 36);
    for (let y = yStart; y <= topLeft.y + step; y += step) {
      if (Math.abs(y) < 1e-9) continue;
      const sy = worldToScreen(0, y).y;
      if (sy > 14 && sy < h - 10) ctx.fillText(fmt(y), axisX, sy - 4);
    }
  }

  function runClip(seg) {
    if (state.mode === "liang-barsky") return liangBarsky(seg, state.rect);
    return cyrusBeck(seg, state.polygon);
  }

  function drawClipper() {
    ctx.save();
    ctx.strokeStyle = "#2563eb";
    ctx.fillStyle = "rgba(37, 99, 235, 0.08)";
    ctx.lineWidth = 2;

    if (state.mode === "liang-barsky") {
      const r = normalizeRect(state.rect);
      const p1 = worldToScreen(r.xmin, r.ymax);
      const p2 = worldToScreen(r.xmax, r.ymin);
      ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    } else if (state.polygon.length >= 2) {
      ctx.beginPath();
      state.polygon.forEach((v, idx) => {
        const p = worldToScreen(v.x, v.y);
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      for (let i = 0; i < state.polygon.length; i++) {
        const p = worldToScreen(state.polygon[i].x, state.polygon[i].y);
        ctx.fillStyle = "#2563eb";
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  function drawPoint(wx, wy, color, label) {
    const p = worldToScreen(wx, wy);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (label && el.showLabels.checked) {
      ctx.font = "11.5px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.fillStyle = "#1e293b";
      ctx.fillText(label, p.x + 6, p.y - 6);
    }
  }

  function render() {
    const dpr = window.devicePixelRatio || 1;
    const w = el.cv.clientWidth;
    const h = el.cv.clientHeight;
    if (el.cv.width !== Math.floor(w * dpr) || el.cv.height !== Math.floor(h * dpr)) {
      el.cv.width = Math.floor(w * dpr);
      el.cv.height = Math.floor(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawGridAndAxes(w, h);
    drawClipper();

    const results = state.segments.map((seg) => runClip(seg));

    results.forEach((res, idx) => {
      const seg = state.segments[idx];
      const isSel = idx === state.selectedIndex;
      const a = worldToScreen(seg.x1, seg.y1);
      const b = worldToScreen(seg.x2, seg.y2);

      // Исходный отрезок
      ctx.save();
      ctx.strokeStyle = res.visible ? "#94a3b8" : "#e5484d";
      ctx.lineWidth = isSel ? 2 : 1.3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();

      // Видимая часть
      if (res.visible && res.clipped) {
        const ca = worldToScreen(res.clipped.x1, res.clipped.y1);
        const cb = worldToScreen(res.clipped.x2, res.clipped.y2);
        ctx.save();
        ctx.strokeStyle = "#16a34a";
        ctx.lineWidth = isSel ? 3.8 : 2.6;
        ctx.beginPath();
        ctx.moveTo(ca.x, ca.y);
        ctx.lineTo(cb.x, cb.y);
        ctx.stroke();
        ctx.restore();

        drawPoint(
          res.clipped.x1,
          res.clipped.y1,
          "#16a34a",
          isSel ? `(${fmt(res.clipped.x1)}, ${fmt(res.clipped.y1)})` : "",
        );
        drawPoint(
          res.clipped.x2,
          res.clipped.y2,
          "#16a34a",
          isSel ? `(${fmt(res.clipped.x2)}, ${fmt(res.clipped.y2)})` : "",
        );
      }

      if (isSel) {
        drawPoint(seg.x1, seg.y1, "#64748b", `P₀`);
        drawPoint(seg.x2, seg.y2, "#64748b", `P₁`);
      }
    });

    if (state.pendingStart) {
      drawPoint(state.pendingStart.x, state.pendingStart.y, "#5849d4", "Начало");
    }

    const visCount = results.filter((r) => r.visible).length;
    el.summary.textContent = `Отрезков: ${state.segments.length}, видимых: ${visCount}, отвергнуто: ${
      state.segments.length - visCount
    }`;

    renderSegbar(results);
    renderTrace(results[state.selectedIndex]);
  }

  function renderSegbar(results) {
    el.segbar.innerHTML = "";
    state.segments.forEach((s, idx) => {
      const btn = document.createElement("button");
      const r = results[idx];
      btn.textContent = `#${idx + 1}: (${fmt(s.x1)},${fmt(s.y1)})–(${fmt(s.x2)},${fmt(s.y2)}) ${
        r.visible ? "✓" : "✕"
      }`;
      if (idx === state.selectedIndex) btn.className = "active";
      btn.onclick = () => {
        state.selectedIndex = idx;
        render();
      };
      el.segbar.appendChild(btn);
    });
  }

  function renderTrace(res) {
    if (!res || state.segments.length === 0) {
      el.traceTitle.textContent = "Промежуточные вычисления";
      el.traceSub.textContent = "Нет выбранного отрезка.";
      el.traceTable.innerHTML = "";
      return;
    }

    const seg = state.segments[state.selectedIndex];
    el.traceTitle.textContent = `Промежуточные вычисления · Отрезок #${state.selectedIndex + 1}`;
    if (res.visible) {
      el.traceSub.textContent =
        `P₀(${fmt(seg.x1)}, ${fmt(seg.y1)}) → P₁(${fmt(seg.x2)}, ${fmt(seg.y2)}) · ` +
        `Итог: [${fmt(res.t0)}, ${fmt(res.t1)}], видимая часть (${fmt(res.clipped.x1)}, ${fmt(
          res.clipped.y1,
        )}) — (${fmt(res.clipped.x2)}, ${fmt(res.clipped.y2)})`;
    } else {
      el.traceSub.textContent = `P₀(${fmt(seg.x1)}, ${fmt(seg.y1)}) → P₁(${fmt(
        seg.x2,
      )}, ${fmt(seg.y2)}) · Отвергнут: ${res.reason}`;
    }

    if (state.mode === "liang-barsky") {
      const head =
        "<tr><th>k</th><th>Граница</th><th>pₖ</th><th>qₖ</th><th>rₖ = qₖ/pₖ</th><th>Действие</th><th>t₀</th><th>t₁</th></tr>";
      const rows = res.steps
        .map(
          (st) =>
            `<tr><td>${st.index}</td><td>${st.name}</td><td class="mono">${fmt(
              st.p,
            )}</td><td class="mono">${fmt(st.q)}</td><td class="mono">${fmt(
              st.r,
            )}</td><td>${st.action}</td><td class="mono">${fmt(
              st.t0,
            )}</td><td class="mono">${fmt(st.t1)}</td></tr>`,
        )
        .join("");
      el.traceTable.innerHTML = head + rows;
    } else {
      const head =
        "<tr><th>Ребро</th><th>Нормаль nᵢ</th><th>wᵢ = nᵢ·(P₀−Vᵢ)</th><th>dᵢ = nᵢ·D</th><th>tᵢ = −wᵢ/dᵢ</th><th>Действие</th><th>t₀</th><th>t₁</th></tr>";
      const rows = res.steps
        .map(
          (st) =>
            `<tr><td>${st.index}</td><td class="mono">(${fmt(st.nx)}, ${fmt(
              st.ny,
            )})</td><td class="mono">${fmt(st.w)}</td><td class="mono">${fmt(
              st.d,
            )}</td><td class="mono">${fmt(st.t)}</td><td>${st.action}</td><td class="mono">${fmt(
              st.t0,
            )}</td><td class="mono">${fmt(st.t1)}</td></tr>`,
        )
        .join("");
      el.traceTable.innerHTML = head + rows;
    }
  }

  function applyRectInputs() {
    const xmin = Number(el.xmin.value);
    const ymin = Number(el.ymin.value);
    const xmax = Number(el.xmax.value);
    const ymax = Number(el.ymax.value);
    if ([xmin, ymin, xmax, ymax].every(Number.isFinite)) {
      state.rect = normalizeRect({ xmin, ymin, xmax, ymax });
      serializeState();
      render();
    }
  }

  [el.xmin, el.ymin, el.xmax, el.ymax].forEach((inp) =>
    inp.addEventListener("input", applyRectInputs),
  );

  el.polyText.addEventListener("input", () => {
    const lines = el.polyText.value
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const verts = [];
    for (const l of lines) {
      const p = l.split(/[\s,;]+/).map(Number);
      if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) {
        verts.push({ x: p[0], y: p[1] });
      }
    }
    if (verts.length >= 3) {
      state.polygon = verts;
      const info = analyzePolygon(verts);
      el.polyStatus.textContent = info.reason;
      el.polyStatus.style.color = info.convex ? "#15803d" : "#b91c1c";
      serializeState();
      render();
    }
  });

  el.applyText.onclick = () => {
    try {
      const parsed = parseInputText(el.rawInput.value, state.mode);
      state.segments = parsed.segments;
      if (state.mode === "liang-barsky") state.rect = parsed.rect;
      else state.polygon = parsed.polygon;
      state.selectedIndex = 0;
      el.parseError.hidden = true;
      syncInputsFromState();
      fitToView();
      render();
    } catch (err) {
      el.parseError.textContent = err.message;
      el.parseError.hidden = false;
    }
  };

  el.fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    el.rawInput.value = await file.text();
    el.applyText.click();
    el.fileInput.value = "";
  };

  el.example.onclick = loadExample;

  el.random.onclick = () => {
    const r = (min, max) => Math.round((min + Math.random() * (max - min)) * 10) / 10;
    const segs = [];
    for (let i = 0; i < 8; i++) {
      segs.push({ x1: r(-4, 12), y1: r(-3, 10), x2: r(-4, 12), y2: r(-3, 10) });
    }
    state.segments = segs;
    state.selectedIndex = 0;
    syncInputsFromState();
    fitToView();
    render();
  };

  el.fit.onclick = () => {
    fitToView();
    render();
  };

  el.clearSegs.onclick = () => {
    state.segments = [];
    state.selectedIndex = 0;
    state.pendingStart = null;
    syncInputsFromState();
    render();
  };

  el.drawMode.onchange = () => {
    state.pendingStart = null;
    el.cv.classList.toggle("drawing", el.drawMode.checked);
    render();
  };

  el.showLabels.onchange = render;

  el.benchBtn.onclick = () => {
    if (state.segments.length === 0) return;
    const rounds = 5000;
    const t0 = performance.now();
    let acc = 0;
    for (let k = 0; k < rounds; k++) {
      for (let i = 0; i < state.segments.length; i++) {
        const r = runClip(state.segments[i]);
        if (r.visible) acc += r.t0 + r.t1;
      }
    }
    const dtMs = performance.now() - t0;
    const perSegUs = (dtMs * 1000) / (rounds * state.segments.length);
    el.benchOut.textContent = `${perSegUs.toFixed(3)} мкс/отр. (chk=${acc.toFixed(1)})`;
  };

  el.cv.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = el.cv.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const before = screenToWorld(mx, my);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    state.scale = Math.max(1, Math.min(300, state.scale * factor));
    const after = worldToScreen(before.x, before.y);
    state.panX += mx - after.x;
    state.panY += my - after.y;
    render();
  });

  el.cv.addEventListener("mousedown", (e) => {
    state.dragging = true;
    state.dragMoved = false;
    state.lastMouse = { x: e.clientX, y: e.clientY };
  });

  window.addEventListener("mousemove", (e) => {
    if (!state.dragging) return;
    const dx = e.clientX - state.lastMouse.x;
    const dy = e.clientY - state.lastMouse.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) state.dragMoved = true;
    state.panX += dx;
    state.panY += dy;
    state.lastMouse = { x: e.clientX, y: e.clientY };
    render();
  });

  window.addEventListener("mouseup", (e) => {
    if (!state.dragging) return;
    state.dragging = false;
    if (state.dragMoved) return;

    const rect = el.cv.getBoundingClientRect();
    if (
      e.clientX < rect.left ||
      e.clientX > rect.right ||
      e.clientY < rect.top ||
      e.clientY > rect.bottom
    ) {
      return;
    }

    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const wpt = screenToWorld(sx, sy);

    if (el.drawMode.checked) {
      const pt = {
        x: Math.round(wpt.x * 2) / 2,
        y: Math.round(wpt.y * 2) / 2,
      };
      if (!state.pendingStart) {
        state.pendingStart = pt;
      } else {
        state.segments.push({
          x1: state.pendingStart.x,
          y1: state.pendingStart.y,
          x2: pt.x,
          y2: pt.y,
        });
        state.pendingStart = null;
        state.selectedIndex = state.segments.length - 1;
        syncInputsFromState();
      }
      render();
      return;
    }

    // Выбор ближайшего отрезка кликом
    let bestIdx = -1;
    let bestDist = 14;
    state.segments.forEach((s, idx) => {
      const a = worldToScreen(s.x1, s.y1);
      const b = worldToScreen(s.x2, s.y2);
      const vx = b.x - a.x;
      const vy = b.y - a.y;
      const len2 = vx * vx + vy * vy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((sx - a.x) * vx + (sy - a.y) * vy) / len2)) : 0;
      const px = a.x + t * vx;
      const py = a.y + t * vy;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = idx;
      }
    });
    if (bestIdx !== -1) {
      state.selectedIndex = bestIdx;
      render();
    }
  });

  window.addEventListener("resize", render);

  loadExample();
})();
