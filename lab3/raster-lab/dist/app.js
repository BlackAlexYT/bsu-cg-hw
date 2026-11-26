"use strict";
const R = Raster;
const $ = (id) => document.getElementById(id);
const LIMIT = 1000; // координаты ограничены ±1000, чтобы таблица и рисование не тормозили

// ---------- Форматирование ----------

const fmt = (v, digits = 3) => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (!Number.isFinite(v)) return "∞";
  const s = Number.isInteger(v) ? String(v) : (+v.toFixed(digits)).toString();
  return s.replace("-", "−");
};
const pt = (x, y) => `(${fmt(x)}, ${fmt(y)})`;
const pkey = (x, y) => x + "," + y;

// ---------- Алгоритмы: описание, запуск и таблица шагов ----------

const ALGOS = {
  step: {
    name: "Пошаговый",
    kind: "line",
    info: "y = kx + b. Идём с шагом 1 вдоль оси, по которой отрезок длиннее, вторую координату считаем по уравнению прямой и округляем. На каждом шаге умножение и вещественные числа.",
    run: (p, plot, tr) => R.stepByStep(p.x0, p.y0, p.x1, p.y1, plot, tr),
    explain: (r, p) =>
      r.steep
        ? `|Δy| > |Δx| — шаг по y, x = (y − b)/k. k = Δy/Δx = ${fmt(r.k)}, b = ${fmt(r.b)}.`
        : `Шаг по x. k = Δy/Δx = ${p.y1 - p.y0}/${p.x1 - p.x0} = ${fmt(r.k)}, b = y₀ − k·x₀ = ${fmt(r.b)}; y = ${fmt(r.k)}·x + ${fmt(r.b)}.`,
    columns: [
      ["Шаг", (t) => t.i],
      ["x", (t) => fmt(t.x)],
      ["y", (t) => fmt(t.y)],
      ["Пиксель (округление)", (t) => pt(t.px, t.py)],
    ],
    pixels: (t) => [pkey(t.px, t.py)],
  },
  dda: {
    name: "ЦДА",
    kind: "line",
    info: "L = max(|Δx|, |Δy|) шагов. На каждом шаге к x прибавляется Δx/L, к y — Δy/L (одно из приращений ±1), результат округляется. Умножений нет, но арифметика вещественная.",
    run: (p, plot, tr) => R.dda(p.x0, p.y0, p.x1, p.y1, plot, tr),
    explain: (r) => `L = ${r.L}; приращения: dx = Δx/L = ${fmt(r.xInc, 4)}, dy = Δy/L = ${fmt(r.yInc, 4)}.`,
    columns: [
      ["Шаг", (t) => t.i],
      ["x", (t) => fmt(t.x, 4)],
      ["y", (t) => fmt(t.y, 4)],
      ["Пиксель (округление)", (t) => pt(t.px, t.py)],
    ],
    pixels: (t) => [pkey(t.px, t.py)],
  },
  bresenham: {
    name: "Брезенхем (отрезок)",
    kind: "line",
    info: "Только целые числа. Шаг по главной оси всегда; по второй — если ошибка e ≥ 0, т. е. прямая проходит дальше середины между двумя пикселями-кандидатами. e₀ = 2Δy − Δx; при шаге по второй оси e −= 2Δx; на каждом шаге e += 2Δy.",
    run: (p, plot, tr) => R.bresenham(p.x0, p.y0, p.x1, p.y1, plot, tr),
    explain: (r) => {
      const [major, minor] = r.steep ? ["y", "x"] : ["x", "y"];
      return `Главная ось ${major} (|Δ${major}| = ${r.dx}, |Δ${minor}| = ${r.dy}). e₀ = 2·${r.dy} − ${r.dx} = ${fmt(r.e0)}; 2|Δ${minor}| = ${2 * r.dy}, 2|Δ${major}| = ${2 * r.dx}.`;
    },
    columns: [
      ["Шаг", (t) => t.i],
      ["Пиксель", (t) => pt(t.x, t.y)],
      ["e", (t) => fmt(t.e)],
      ["Решение", (t, r) => {
        if (t.e === null) return "конец";
        const [major, minor] = r.steep ? ["y", "x"] : ["x", "y"];
        const sgn = (d) => (d > 0 ? "+" : "−");
        const mj = `${major} ${sgn(r.steep ? r.sy : r.sx)}= 1`,
          mn = `${minor} ${sgn(r.steep ? r.sx : r.sy)}= 1`;
        return t.minor ? `e ≥ 0: ${mj}, ${mn}; e = e − ${2 * r.dx} + ${2 * r.dy}` : `e < 0: ${mj}; e = e + ${2 * r.dy}`;
      }, "text"],
      ["e следующее", (t) => fmt(t.eNext)],
    ],
    pixels: (t) => [pkey(t.x, t.y)],
  },
  circle: {
    name: "Брезенхем (окружность)",
    kind: "circle",
    info: "Строится четверть от (0, R) до (R, 0), остальные — симметрией (±x, ±y). Δ = (x+1)² + (y−1)² − R² — ошибка диагонального пикселя. Δ < 0: выбор H или D по δ = 2Δ + 2y − 1; Δ > 0: выбор D или V по δ' = 2Δ − 2x − 1; Δ = 0: D.",
    run: (p, plot, tr) => R.bresenhamCircle(p.xc, p.yc, p.r, plot, tr),
    explain: (r, p) =>
      `Δ₀ = 2(1 − R) = ${fmt(r.delta0)}. Пересчёт Δ: H: Δ += 2x + 1; D: Δ += 2x − 2y + 2; V: Δ += −2y + 1 (x, y — новые). Пиксели экрана — (x_c ± x, y_c ± y), центр ${pt(p.xc, p.yc)}.`,
    columns: [
      ["Шаг", (t) => t.i],
      ["(x, y) четверти", (t) => pt(t.x, t.y)],
      ["Δ", (t) => fmt(t.delta)],
      ["δ или δ'", (t) => (t.d === null ? "—" : `${t.kind} = ${fmt(t.d)}`)],
      ["Ход", (t) => ({ H: "H (x+1)", D: "D (x+1, y−1)", V: "V (y−1)" })[t.move] || "конец", "text"],
    ],
    pixels: (t, p) => [pkey(p.xc + t.x, p.yc + t.y), pkey(p.xc - t.x, p.yc + t.y), pkey(p.xc + t.x, p.yc - t.y), pkey(p.xc - t.x, p.yc - t.y)],
  },
  castle: {
    name: "Кастл — Питвей",
    kind: "line",
    extra: true,
    info: "Отрезок — последовательность ходов s (шаг по главной оси) и d (диагональ); при |Δx| ≥ |Δy| ходов |Δx|, из них d — |Δy|. Порядок ходов строится как алгоритм Евклида: x = a − b, y = b, m₁ = s, m₂ = d; пока x ≠ y: если x > y, то x −= y, m₂ = m₁ + m₂ᴿ, иначе y −= x, m₁ = m₂ + m₁ᴿ. Ответ — (m₂ + m₁ᴿ), повторённое x раз (ᴿ — строка задом наперёд). Даёт те же пиксели, что Брезенхем.",
    run: (p, plot, tr) => R.castlePitteway(p.x0, p.y0, p.x1, p.y1, plot, tr),
    explain: (r) => {
      const moves = r.moves.length > 120 ? r.moves.slice(0, 120) + "…" : r.moves;
      return `a = ${r.a} (главная ось ${r.steep ? "y" : "x"}), b = ${r.b}. Ходы: ${moves || "нет (точка)"}.`;
    },
    columns: [
      ["x", (t) => t.x],
      ["y", (t) => t.y],
      ["m₁", (t) => t.m1, "moves"],
      ["m₂", (t) => t.m2, "moves"],
      ["Действие", (t) => t.op, "text"],
    ],
    pixels: () => [],
  },
  wu: {
    name: "Ву (сглаживание)",
    kind: "line",
    extra: true,
    aa: true,
    info: "Сглаженная линия. На каждом шаге по главной оси закрашиваются два соседних пикселя поперёк неё: ⌊y⌋ с яркостью 1 − {y} и ⌊y⌋ + 1 с яркостью {y}, где {y} — дробная часть. Чем ближе центр пикселя к прямой, тем он ярче; сумма яркостей в столбце равна 1, поэтому «лесенка» не видна.",
    run: (p, plot, tr) => R.wu(p.x0, p.y0, p.x1, p.y1, plot, tr),
    explain: (r) => `Главная ось ${r.steep ? "y" : "x"}, наклон ${fmt(r.gradient, 4)}. В клетках при крупном масштабе подписана яркость.`,
    columns: [
      ["Главная ось", (t) => t.u],
      ["Точная коорд.", (t) => fmt(t.v, 4)],
      ["Дробная часть", (t) => fmt(t.f, 4)],
      ["Пиксель 1 · яркость", (t) => `${t.steep ? pt(t.vi, t.u) : pt(t.u, t.vi)} · ${fmt(1 - t.f)}`],
      ["Пиксель 2 · яркость", (t) => (t.f > 0 ? `${t.steep ? pt(t.vi + 1, t.u) : pt(t.u, t.vi + 1)} · ${fmt(t.f)}` : "—")],
    ],
    pixels: (t) => (t.steep ? [pkey(t.vi, t.u), pkey(t.vi + 1, t.u)] : [pkey(t.u, t.vi), pkey(t.u, t.vi + 1)]),
  },
};

const EXAMPLES = {
  line: { x0: 1, y0: 1, x1: 8, y1: 4 },
  circle: { xc: 0, yc: 0, r: 5 },
};

// ---------- Состояние ----------

const state = {
  algo: "bresenham",
  x0: 1, y0: 1, x1: 8, y1: 4,
  xc: 0, yc: 0, r: 5,
  view: { cx: 4.5, cy: 2.5, s: 32 },
  phase: 0, // какую точку задаст следующий щелчок
  hover: null, // клетка под курсором
  hoverRow: -1, // строка таблицы под курсором
};
let result = null; // { pixels: Map(key → {x, y, c, n}), trace, info }

function compute() {
  const a = ALGOS[state.algo];
  const pixels = new Map(),
    trace = [];
  let n = 0;
  const info = a.run(state, (x, y, c = 1) => {
    const k = pkey(x, y),
      old = pixels.get(k);
    if (!old || old.c < c) pixels.set(k, { x, y, c, n: old ? old.n : n });
    n++;
  }, trace);
  // Номер шага в клетке: у окружности — шаг четверти, у Ву — шаг по главной оси.
  if (a.kind === "circle" || a.aa)
    trace.forEach((t, i) => a.pixels(t, state).forEach((k) => pixels.has(k) && (pixels.get(k).n = i)));
  result = { pixels, trace, info };
}

// ---------- Рисование ----------

const cv = $("cv"),
  ctx = cv.getContext("2d");

function size() {
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth,
    h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [w, h];
}

function niceStep(s) {
  for (const k of [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]) if (k * s >= 34) return k;
  return 2000;
}

function draw() {
  const [W, H] = size();
  const { cx, cy, s } = state.view;
  const X = (x) => W / 2 + (x - cx) * s,
    Y = (y) => H / 2 - (y - cy) * s;
  const xmin = Math.floor(cx - W / 2 / s) - 1,
    xmax = Math.ceil(cx + W / 2 / s) + 1,
    ymin = Math.floor(cy - H / 2 / s) - 1,
    ymax = Math.ceil(cy + H / 2 / s) + 1;
  const a = ALGOS[state.algo];
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  // Пиксели — клетки [x − ½, x + ½] × [y − ½, y + ½].
  const hlRow = state.hoverRow >= 0 ? new Set(a.pixels(result.trace[state.hoverRow], state)) : null;
  for (const p of result.pixels.values()) {
    if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) continue;
    ctx.fillStyle = a.aa ? `rgba(32, 35, 50, ${p.c})` : "#6a5ce0";
    ctx.fillRect(X(p.x - 0.5), Y(p.y + 0.5), s, s);
    if (hlRow && hlRow.has(pkey(p.x, p.y))) {
      ctx.strokeStyle = "#f0a000";
      ctx.lineWidth = 3;
      ctx.strokeRect(X(p.x - 0.5) + 1.5, Y(p.y + 0.5) + 1.5, s - 3, s - 3);
    }
  }

  // Сетка по полуцелым координатам — границы клеток.
  if (s >= 5) {
    ctx.strokeStyle = s >= 14 ? "#d5d9e6" : "#e7e9f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = xmin; x <= xmax; x++) {
      const px = Math.round(X(x - 0.5)) + 0.5;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, H);
    }
    for (let y = ymin; y <= ymax; y++) {
      const py = Math.round(Y(y - 0.5)) + 0.5;
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
    }
    ctx.stroke();
  }

  // Центры пикселей — целые точки.
  const labels = s >= 26 && ($("showOrder").checked || a.aa);
  if ($("showCenters").checked && s >= 12) {
    for (let x = xmin; x <= xmax; x++)
      for (let y = ymin; y <= ymax; y++) {
        const p = result.pixels.get(pkey(x, y));
        if (p && labels) continue; // в клетке подпись — точка мешала бы
        ctx.fillStyle = p && (!a.aa || p.c > 0.5) ? "#fff" : "#9aa0b4";
        ctx.fillRect(X(x) - 1.5, Y(y) - 1.5, 3, 3);
      }
  }

  // Оси проходят через центры клеток x = 0 и y = 0.
  const ax = Math.min(Math.max(X(0), 0), W),
    ay = Math.min(Math.max(Y(0), 0), H);
  ctx.strokeStyle = "#202332";
  ctx.fillStyle = "#202332";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, ay);
  ctx.lineTo(W, ay);
  ctx.moveTo(ax, H);
  ctx.lineTo(ax, 0);
  ctx.stroke();
  ctx.beginPath(); // стрелки
  ctx.moveTo(W, ay);
  ctx.lineTo(W - 10, ay - 4);
  ctx.lineTo(W - 10, ay + 4);
  ctx.moveTo(ax, 0);
  ctx.lineTo(ax - 4, 10);
  ctx.lineTo(ax + 4, 10);
  ctx.fill();
  ctx.font = "italic 600 14px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("x", W - 6, ay > H - 24 ? ay - 8 : ay + 20);
  ctx.textAlign = "left";
  ctx.fillText("y", ax < W - 24 ? ax + 8 : ax - 18, 14);

  // Деления и подписи.
  const step = niceStep(s);
  ctx.font = "11px monospace";
  ctx.lineWidth = 1;
  const labelBg = (text, x, y) => {
    const w = ctx.measureText(text).width;
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    const left = ctx.textAlign === "center" ? x - w / 2 : ctx.textAlign === "right" ? x - w : x;
    ctx.fillRect(left - 2, y - 7, w + 4, 14);
    ctx.fillStyle = "#3a3f52";
    ctx.fillText(text, x, y);
  };
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const ly = ay > H - 20 ? ay - 11 : ay + 12;
  for (let x = Math.ceil(xmin / step) * step; x <= xmax; x += step) {
    if (x === 0 || X(x) > W - 26) continue;
    ctx.beginPath();
    ctx.moveTo(X(x), ay - 4);
    ctx.lineTo(X(x), ay + 4);
    ctx.stroke();
    labelBg(fmt(x), X(x), ly);
  }
  const leftSide = ax < 36;
  ctx.textAlign = leftSide ? "left" : "right";
  for (let y = Math.ceil(ymin / step) * step; y <= ymax; y += step) {
    if (y === 0 || Y(y) < 24) continue;
    ctx.beginPath();
    ctx.moveTo(ax - 4, Y(y));
    ctx.lineTo(ax + 4, Y(y));
    ctx.stroke();
    labelBg(fmt(y), leftSide ? ax + 7 : ax - 7, Y(y));
  }
  ctx.textAlign = "right";
  if (X(0) >= 0 && X(0) <= W && Y(0) >= 0 && Y(0) <= H) labelBg("0", X(0) - 5, Y(0) + 11);

  // Номера шагов или яркости в клетках.
  if (labels) {
    ctx.font = `${Math.min(13, s / 3)}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const p of result.pixels.values()) {
      if (p.x < xmin || p.x > xmax || p.y < ymin || p.y > ymax) continue;
      const text = $("showOrder").checked ? String(p.n) : fmt(p.c, 2).replace(/^0\./, ".");
      ctx.fillStyle = a.aa && p.c < 0.5 ? "#202332" : "#fff";
      ctx.fillText(text, X(p.x), Y(p.y));
    }
  }

  // Идеальная фигура.
  if ($("showIdeal").checked) {
    ctx.strokeStyle = "#e5484d";
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (a.kind === "circle") ctx.arc(X(state.xc), Y(state.yc), state.r * s, 0, 2 * Math.PI);
    else {
      ctx.moveTo(X(state.x0), Y(state.y0));
      ctx.lineTo(X(state.x1), Y(state.y1));
    }
    ctx.stroke();
  }
  // Заданные точки.
  const marks = a.kind === "circle" ? [[state.xc, state.yc, "C"]] : [[state.x0, state.y0, "P₀"], [state.x1, state.y1, "P₁"]];
  ctx.font = "600 13px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  for (const [x, y, label] of marks) {
    ctx.beginPath();
    ctx.arc(X(x), Y(y), 5, 0, 2 * Math.PI);
    ctx.fillStyle = "#e5484d";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#c22f35";
    ctx.fillText(label, X(x) + 7, Y(y) - 4);
  }

  // Клетка под курсором.
  if (state.hover) {
    ctx.strokeStyle = "#f0a000";
    ctx.lineWidth = 2;
    ctx.strokeRect(X(state.hover[0] - 0.5), Y(state.hover[1] + 0.5), s, s);
  }
}

// ---------- Таблица вычислений ----------

function renderTable() {
  const a = ALGOS[state.algo];
  $("calcInfo").textContent = a.explain(result.info, state);
  const MAX = 400;
  const rows = result.trace.slice(0, MAX);
  const head = "<tr>" + a.columns.map(([h, , cls]) => `<th class="${cls || ""}">${h}</th>`).join("") + "</tr>";
  const body = rows
    .map((t, i) => `<tr data-i="${i}">` + a.columns.map(([, f, cls]) => `<td class="${cls || ""}">${f(t, result.info)}</td>`).join("") + "</tr>")
    .join("");
  let tail = "";
  if (state.algo === "castle")
    tail = `<tr><td colspan="2" class="text"><b>Итог</b></td><td colspan="3" class="moves">${result.info.moves || "—"}</td></tr>`;
  if (result.trace.length > MAX) tail += `<tr><td colspan="${a.columns.length}" class="text">… ещё ${result.trace.length - MAX} строк</td></tr>`;
  $("calc").innerHTML = head + body + tail;
}

function highlightRows() {
  const a = ALGOS[state.algo];
  const key = state.hover && pkey(...state.hover);
  for (const tr of $("calc").querySelectorAll("tr[data-i]")) {
    const t = result.trace[+tr.dataset.i];
    tr.classList.toggle("hl", !!key && a.pixels(t, state).includes(key));
  }
}

// ---------- Ввод ----------

const lineFields = ["x0", "y0", "x1", "y1"],
  circleFields = ["xc", "yc", "r"];

function syncInputs() {
  for (const f of [...lineFields, ...circleFields]) $(f).value = state[f];
  const a = ALGOS[state.algo];
  const circle = a.kind === "circle";
  $("lineInputs").hidden = circle;
  $("circleInputs").hidden = !circle;
  $("figTitle").textContent = circle ? "Окружность" : "Отрезок";
  $("algoInfo").textContent = a.info;
  $("clickHint").textContent = circle
    ? `Щелчок по сетке задаёт ${state.phase ? "радиус (точку на окружности)" : "центр C"}.`
    : `Щелчок по сетке задаёт ${state.phase ? "конец P₁" : "начало P₀"}.`;
  $("zoom").value = state.view.s;
  $("zoomVal").textContent = state.view.s;
}

function update() {
  compute();
  syncInputs();
  renderTable();
  const a = ALGOS[state.algo];
  const n = a.aa ? `${result.trace.length} шагов, ${result.pixels.size} пикселей с яркостью > 0` : `${result.pixels.size} пикселей`;
  $("stats").textContent = `${a.name}: ${n}`;
  draw();
}

function fit() {
  const a = ALGOS[state.algo];
  const [W, H] = [cv.clientWidth, cv.clientHeight];
  let x0, x1, y0, y1;
  if (a.kind === "circle") [x0, x1, y0, y1] = [state.xc - state.r, state.xc + state.r, state.yc - state.r, state.yc + state.r];
  else [x0, x1, y0, y1] = [Math.min(state.x0, state.x1), Math.max(state.x0, state.x1), Math.min(state.y0, state.y1), Math.max(state.y0, state.y1)];
  // Начало координат тоже стараемся показать, если фигура рядом с ним.
  if (Math.max(Math.abs(x0), Math.abs(x1), Math.abs(y0), Math.abs(y1)) < 40) {
    [x0, x1, y0, y1] = [Math.min(x0, 0), Math.max(x1, 0), Math.min(y0, 0), Math.max(y1, 0)];
  }
  const s = Math.floor(Math.min(W / (x1 - x0 + 4), H / (y1 - y0 + 4)));
  state.view = { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: Math.max(4, Math.min(80, s)) };
}

function clampInt(v) {
  v = Math.round(+v);
  return Number.isFinite(v) ? Math.max(-LIMIT, Math.min(LIMIT, v)) : 0;
}

function init() {
  const box = $("algos");
  for (const [key, a] of Object.entries(ALGOS)) {
    const label = document.createElement("label");
    label.innerHTML = `<input type="radio" name="algo" value="${key}"> ${a.name}` + (a.extra ? '<span class="extra">доп.</span>' : "");
    label.querySelector("input").checked = key === state.algo;
    label.querySelector("input").onchange = () => {
      const was = ALGOS[state.algo].kind;
      state.algo = key;
      state.phase = 0;
      state.hoverRow = -1;
      if (was !== a.kind) fit();
      update();
    };
    box.append(label);
  }
  for (const f of [...lineFields, ...circleFields])
    $(f).addEventListener("change", () => {
      state[f] = f === "r" ? Math.max(0, clampInt($(f).value)) : clampInt($(f).value);
      update();
    });
  $("example").onclick = () => {
    Object.assign(state, EXAMPLES.line, EXAMPLES.circle);
    fit();
    update();
  };
  $("random").onclick = () => {
    const r = (n) => Math.floor(Math.random() * (2 * n + 1)) - n;
    Object.assign(state, { x0: r(15), y0: r(10), x1: r(15), y1: r(10), xc: r(5), yc: r(5), r: 2 + Math.floor(Math.random() * 12) });
    fit();
    update();
  };
  $("fit").onclick = () => {
    fit();
    update();
  };
  $("zoom").oninput = () => {
    state.view.s = +$("zoom").value;
    syncInputs();
    draw();
  };
  for (const id of ["showIdeal", "showCenters", "showOrder"]) $(id).onchange = draw;

  // Мышь: колесо — масштаб относительно курсора, перетаскивание — сдвиг, щелчок — точка.
  const world = (e) => {
    const rect = cv.getBoundingClientRect();
    const { cx, cy, s } = state.view;
    return [cx + (e.clientX - rect.left - rect.width / 2) / s, cy - (e.clientY - rect.top - rect.height / 2) / s];
  };
  cv.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const [wx, wy] = world(e);
      const v = state.view;
      const s = Math.max(4, Math.min(80, Math.round(v.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
      v.cx = wx - (wx - v.cx) * (v.s / s);
      v.cy = wy - (wy - v.cy) * (v.s / s);
      v.s = s;
      syncInputs();
      draw();
    },
    { passive: false },
  );
  let drag = null;
  cv.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, y: e.clientY, cx: state.view.cx, cy: state.view.cy, moved: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener("pointermove", (e) => {
    const [wx, wy] = world(e);
    const cell = [Math.round(wx), Math.round(wy)];
    if (drag) {
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        cv.classList.add("dragging");
        state.view.cx = drag.cx - dx / state.view.s;
        state.view.cy = drag.cy + dy / state.view.s;
      }
    }
    if (!state.hover || state.hover[0] !== cell[0] || state.hover[1] !== cell[1] || drag) {
      state.hover = cell;
      const p = result.pixels.get(pkey(...cell));
      const a = ALGOS[state.algo];
      $("probe").textContent =
        `клетка ${pt(...cell)}: x ∈ [${fmt(cell[0] - 0.5)}; ${fmt(cell[0] + 0.5)}], y ∈ [${fmt(cell[1] - 0.5)}; ${fmt(cell[1] + 0.5)}]` +
        (p ? (a.aa ? ` — яркость ${fmt(p.c)}` : ` — закрашена, шаг ${p.n}`) : "");
      highlightRows();
      draw();
    }
  });
  cv.addEventListener("pointerup", (e) => {
    const wasDrag = drag && drag.moved;
    drag = null;
    cv.classList.remove("dragging");
    if (wasDrag) return;
    const [wx, wy] = world(e);
    const x = clampInt(wx),
      y = clampInt(wy);
    if (ALGOS[state.algo].kind === "circle") {
      if (state.phase === 0) Object.assign(state, { xc: x, yc: y });
      else state.r = Math.min(LIMIT, Math.round(Math.hypot(x - state.xc, y - state.yc)));
    } else if (state.phase === 0) Object.assign(state, { x0: x, y0: y });
    else Object.assign(state, { x1: x, y1: y });
    state.phase ^= 1;
    update();
  });
  cv.addEventListener("pointerleave", () => {
    state.hover = null;
    $("probe").textContent = "Наведите курсор на сетку";
    highlightRows();
    draw();
  });

  // Наведение на строку таблицы подсвечивает её пиксели.
  $("calc").addEventListener("mouseover", (e) => {
    const tr = e.target.closest("tr[data-i]");
    const i = tr ? +tr.dataset.i : -1;
    if (i !== state.hoverRow) {
      state.hoverRow = i;
      draw();
    }
  });
  $("calc").addEventListener("mouseleave", () => {
    state.hoverRow = -1;
    draw();
  });

  // Замер времени.
  const NAMES = { step: "Пошаговый", dda: "ЦДА", bresenham: "Брезенхем (отрезок)", castle: "Кастл — Питвей", wu: "Ву (сглаживание)", circle: "Брезенхем (окружность)" };
  $("bench").onclick = () => {
    $("benchStatus").textContent = "Идёт замер…";
    $("bench").disabled = true;
    setTimeout(() => {
      const res = R.benchmark();
      const lines = res.filter((r) => r.key !== "circle");
      const best = Math.min(...lines.map((r) => r.nsPerPixel));
      $("benchTable").innerHTML =
        "<tr><th class='text'>Алгоритм</th><th>Фигур</th><th>Пикселей</th><th>Всего, мс</th><th>На фигуру, мкс</th><th>На пиксель, нс</th></tr>" +
        res
          .map(
            (r) =>
              `<tr><td class="text">${NAMES[r.key]}</td><td>${r.figures}</td><td>${r.pixels}</td><td>${fmt(r.ms, 2)}</td><td>${fmt(r.usPerFigure, 3)}</td>` +
              `<td class="${r.key !== "circle" && r.nsPerPixel === best ? "best" : ""}">${fmt(r.nsPerPixel, 2)}</td></tr>`,
          )
          .join("");
      $("benchStatus").textContent = `Готово. ${navigator.userAgent.match(/(Firefox|Chrome|Safari)\/[\d.]+/)?.[0] || ""}`;
      $("bench").disabled = false;
    }, 30);
  };

  window.addEventListener("resize", draw);
  fit();
  update();
}

init();
