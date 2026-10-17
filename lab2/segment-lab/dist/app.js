"use strict";
const I = Imaging;
const MAX_SIDE = 640; // большие файлы уменьшаются, чтобы обработка шла без задержек

// ---------- Методы и их параметры ----------

const num = (key, label, min, max, step, value, hint) => ({ key, label, min, max, step, value, hint });
const choice = (key, label, options, value) => ({ key, label, options, value });

const METHODS = {
  niblack: {
    name: "Ниблэк — локальный порог",
    group: "threshold",
    info: "T(x, y) = m + k·s, где m и s — среднее и СКО яркости в окне вокруг пикселя. Обычно k = −0.2. На пустом фоне s мало, и шум становится «объектом».",
    params: [
      num("size", "Окно, пикс.", 3, 101, 2, 25, "Нечётное. Должно накрывать несколько штрихов объекта."),
      num("k", "k", -1.5, 0.5, 0.05, -0.2, "Чем меньше k, тем ниже порог и меньше «объекта»."),
    ],
  },
  sauvola: {
    name: "Саувола — локальный порог",
    group: "threshold",
    info: "T(x, y) = m·(1 + k·(s/R − 1)). При малом СКО порог опускается до m·(1 − k), поэтому фон остаётся чистым, но бледный текст тоже может пропасть.",
    params: [
      num("size", "Окно, пикс.", 3, 101, 2, 25, "Нечётное. Должно накрывать несколько штрихов объекта."),
      num("k", "k", 0, 1, 0.02, 0.2, "Чем больше k, тем сильнее порог опускается на фоне."),
      num("R", "R", 8, 255, 1, 128, "Динамический диапазон СКО; для 8 бит обычно 128."),
    ],
  },
  points: {
    name: "Обнаружение точек",
    group: "segment",
    info: "Отклик R лапласовской маски [−1 −1 −1; −1 8 −1; −1 −1 −1]. Точка — где |R| ≥ T, T задаётся долей от max|R|.",
    params: [num("frac", "Порог, доля от max|R|", 0.05, 1, 0.01, 0.6, "Отклик светлой точки +100 равен 800, тёмной −70 — 560.")],
  },
  lines: {
    name: "Обнаружение линий",
    group: "segment",
    info: "Четыре маски с весом 2 вдоль направления и −1 по сторонам. Лучше всего находят линии толщиной в один пиксель.",
    params: [
      choice(
        "direction",
        "Направление",
        [
          ["all", "Все (максимум откликов)"],
          ["h", "Горизонтальные"],
          ["v", "Вертикальные"],
          ["p45", "+45°"],
          ["m45", "−45°"],
        ],
        "all",
      ),
      choice(
        "bright",
        "Линии",
        [
          [true, "Светлые на тёмном"],
          [false, "Тёмные на светлом"],
        ],
        true,
      ),
      num("frac", "Порог, доля от max R", 0.05, 1, 0.01, 0.55, "Линия с контрастом Δ даёт 6Δ, край широкой полосы — 3Δ."),
    ],
  },
  edges: {
    name: "Перепады яркости: градиент",
    group: "segment",
    info: "Gx = f(x+1, y) − f(x, y), Gy = f(x, y+1) − f(x, y); модуль градиента приближённо |Gx| + |Gy|. Граница — где он не меньше T = доля·max.",
    params: [num("frac", "Порог, доля от max|∇f|", 0.02, 1, 0.01, 0.25)],
  },
  log: {
    name: "Перепады яркости: лапласиан гауссиана (LoG)",
    group: "segment",
    info: "Свёртка с маской LoG 5×5 (16 в центре). На перепаде отклик меняет знак: граница — переход через ноль, у которого разность соседей больше T.",
    params: [
      num("frac", "Порог, доля от max|LoG|", 0, 0.5, 0.005, 0.1, "При 0 контуры находятся везде, где отклик меняет знак, в том числе на шуме."),
    ],
  },
};

const defaults = (id) => Object.fromEntries(METHODS[id].params.map((p) => [p.key, p.value]));
const values = Object.fromEntries(Object.keys(METHODS).map((id) => [id, defaults(id)]));

const state = { method: "sauvola", blur: 0, overlay: false, item: null, gray: null, truth: null };

// ---------- Выполнение метода ----------

function run(method, img, p) {
  switch (method) {
    case "niblack":
    case "sauvola": {
      const T =
        method === "niblack"
          ? I.niblackThreshold(img, p.size, p.k)
          : I.sauvolaThreshold(img, p.size, p.k, p.R);
      return { mask: I.binarize(img, T), threshold: T, mid: T, midKind: "threshold" };
    }
    case "points":
      return withT(I.detectPoints(img, p.frac));
    case "lines":
      return withT(I.detectLines(img, p.direction, p.frac, p.bright));
    case "edges":
      return withT(I.detectEdges(img, p.frac));
    case "log":
      return withT(I.detectLogEdges(img, p.frac));
  }
}
function withT(r) {
  return { ...r, mid: r.response, midKind: "response", label: `T = ${fmt(r.T)}` };
}

const fmt = (n) => String(Math.round(n * 100) / 100);
const pct = (x) => (100 * x).toFixed(1) + "%";

// Результат бинаризации: объект — 0 (чёрный), фон — 255.
// Результат сегментации: найденные пиксели — 255 (белые) на чёрном.
function isObject(method, v) {
  return METHODS[method].group === "threshold" ? v === 0 : v === 255;
}

// ---------- Вывод на холсты ----------

function drawGray(canvas, width, height, gray) {
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const im = ctx.createImageData(width, height);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i];
    im.data.set([v, v, v, 255], 4 * i);
  }
  ctx.putImageData(im, 0, 0);
}

function drawOverlay(canvas, img, mask, method) {
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  const im = ctx.createImageData(img.width, img.height);
  for (let i = 0; i < mask.length; i++) {
    const v = Math.round(img.data[i]) * 0.6 + 40;
    im.data.set(isObject(method, mask[i]) ? [235, 40, 70, 255] : [v, v, v, 255], 4 * i);
  }
  ctx.putImageData(im, 0, 0);
}

// ---------- Обработка ----------

const $ = (id) => document.getElementById(id);
let current = null;

function prepared() {
  return state.blur > 0 ? I.gaussianBlur(state.gray, state.blur) : state.gray;
}

function process() {
  if (!state.gray) return;
  const img = prepared();
  const method = state.method;
  const r = run(method, img, values[method]);
  current = { img, r, method };

  drawGray($("cvSrc"), img.width, img.height, Uint8Array.from(img.data, Math.round));

  const mid = $("cvMid");
  if (r.midKind === "threshold") {
    $("midCaption").textContent = "Карта порога T(x, y)";
    drawGray(mid, img.width, img.height, Uint8Array.from(r.mid, (v) => Math.max(0, Math.min(255, Math.round(v)))));
  } else {
    $("midCaption").textContent = method === "log" ? "|LoG| (нормирован)" : "Модуль отклика (нормирован)";
    drawGray(mid, img.width, img.height, I.normalize(r.mid));
  }

  if (state.overlay) drawOverlay($("cvOut"), img, r.mask, method);
  else drawGray($("cvOut"), img.width, img.height, r.mask);

  const objects = r.mask.reduce((n, v) => n + isObject(method, v), 0);
  const parts = [];
  if (r.label) parts.push(r.label);
  parts.push(
    (METHODS[method].group === "threshold" ? "объект (чёрное): " : "найдено пикселей: ") +
      (METHODS[method].group === "threshold" ? pct(objects / r.mask.length) : objects),
  );
  if (state.truth && METHODS[method].group === "threshold") {
    const q = I.compareMasks(r.mask, state.truth);
    parts.push(`F1 = ${pct(q.f1)} (точность ${pct(q.precision)}, полнота ${pct(q.recall)})`);
  }
  $("stats").textContent = parts.join(" · ");
  compare(img);
}

// Полоса сравнения: те же данные, несколько методов с их текущими параметрами.
function compare(img) {
  const group = METHODS[state.method].group;
  const box = $("compare");
  box.innerHTML = "";
  let list;
  if (group === "threshold") {
    list = ["niblack", "sauvola"].map((m) => ({ method: m, title: METHODS[m].name.split(" — ")[0], p: values[m] }));
    $("compareTitle").textContent = "Сравнение методов Ниблэка и Сауволы";
    $("compareHint").textContent = state.truth
      ? "F1 считается по эталонной маске текста. Параметры — текущие для каждого метода."
      : "Для своего изображения эталона нет — сравнивайте на глаз.";
  } else {
    list = [
      { method: "edges", title: "Градиент", p: values.edges },
      { method: "log", title: "LoG", p: values.log },
    ];
    $("compareTitle").textContent = "Сравнение: градиент и лапласиан гауссиана";
    $("compareHint").textContent = "Текущие пороги каждого метода. Сглаживание σ слева применяется к обоим.";
  }
  for (const item of list) {
    const r = run(item.method, img, item.p);
    const fig = document.createElement("figure");
    const c = document.createElement("canvas");
    drawGray(c, img.width, img.height, r.mask);
    let caption = `<b>${item.title}</b>`;
    if (group === "threshold" && state.truth) caption += ` · F1 ${pct(I.compareMasks(r.mask, state.truth).f1)}`;
    fig.innerHTML = `<div>${caption}</div>`;
    fig.prepend(c);
    box.appendChild(fig);
  }
  if (group === "threshold" && state.truth) {
    const fig = document.createElement("figure");
    const c = document.createElement("canvas");
    drawGray(c, img.width, img.height, state.truth);
    fig.append(c);
    fig.insertAdjacentHTML("beforeend", "<div><b>Эталон</b></div>");
    box.appendChild(fig);
  }
}

// Значения под курсором: координаты, яркость, порог или отклик, результат.
function probe(e) {
  if (!current) return;
  const canvas = e.currentTarget;
  const { img, r, method } = current;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((e.clientX - rect.left) / rect.width) * img.width);
  const y = Math.floor(((e.clientY - rect.top) / rect.height) * img.height);
  if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
  const i = y * img.width + x;
  let text = `(${x}, ${y})  I = ${fmt(img.data[i])}`;
  if (r.midKind === "threshold") text += `  T = ${fmt(r.mid[i])}`;
  else if (r.mid) text += `  R = ${fmt(r.mid[i])}`;
  text += isObject(method, r.mask[i]) ? "  → объект" : "  → фон";
  $("probe").textContent = text;
}

// ---------- Загрузка изображений ----------

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("Не удалось прочитать изображение"));
    im.src = src;
  });
}

function pixels(im) {
  const scale = Math.min(1, MAX_SIDE / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(1, Math.round(im.naturalWidth * scale)),
    h = Math.max(1, Math.round(im.naturalHeight * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.drawImage(im, 0, 0, w, h);
  return I.fromRGBA(ctx.getImageData(0, 0, w, h).data, w, h);
}

async function openGallery(item) {
  const img = pixels(await loadImage(item.src));
  state.truth = item.truth ? Uint8Array.from(pixels(await loadImage(item.truth)).data, (v) => (v < 128 ? 0 : 255)) : null;
  state.gray = img;
  state.item = item;
  // Каждое изображение базы открывается со своими начальными параметрами.
  values[item.method] = { ...defaults(item.method), ...item.params };
  setMethod(item.method);
  $("note").textContent = item.title + ". " + item.note;
  document.querySelectorAll(".thumbs button").forEach((b) => b.classList.toggle("active", b.dataset.file === item.file));
}

async function openFile(file) {
  if (!file || !file.type.startsWith("image/")) return;
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImage(url);
    state.gray = pixels(im);
    state.truth = null;
    state.item = null;
    const scaled = im.naturalWidth > MAX_SIDE || im.naturalHeight > MAX_SIDE;
    $("note").textContent =
      `${file.name}: ${state.gray.width}×${state.gray.height}` +
      (scaled ? ` (уменьшено с ${im.naturalWidth}×${im.naturalHeight})` : "") +
      ". Цветное изображение переводится в полутона: Y = 0.299R + 0.587G + 0.114B.";
    document.querySelectorAll(".thumbs button").forEach((b) => b.classList.remove("active"));
    process();
  } catch (err) {
    $("note").textContent = err.message;
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------- Интерфейс ----------

function buildGallery() {
  const box = $("gallery");
  const groups = { threshold: "Бинаризация (есть эталон)", segment: "Точки, линии, перепады" };
  for (const [g, title] of Object.entries(groups)) {
    box.insertAdjacentHTML("beforeend", `<div class="group">${title}</div>`);
    const row = document.createElement("div");
    row.className = "thumbs";
    for (const item of GALLERY.filter((x) => x.group === g)) {
      const b = document.createElement("button");
      b.dataset.file = item.file;
      b.title = item.title;
      b.innerHTML = `<img src="${item.src}" alt="${item.title}">`;
      b.addEventListener("click", () => openGallery(item));
      row.appendChild(b);
    }
    box.appendChild(row);
  }
}

function buildParams() {
  const m = METHODS[state.method];
  $("methodInfo").textContent = m.info;
  const box = $("params");
  box.innerHTML = "";
  for (const p of m.params) {
    const wrap = document.createElement("div");
    wrap.className = "param";
    const id = `p-${p.key}`;
    const v = values[state.method][p.key];
    if (p.options) {
      wrap.innerHTML = `<div class="fieldtop"><label for="${id}">${p.label}</label></div><select id="${id}">${p.options
        .map(([val, text]) => `<option value="${val}"${val === v ? " selected" : ""}>${text}</option>`)
        .join("")}</select>`;
      wrap.querySelector("select").addEventListener("change", (e) => {
        const opt = p.options.find(([val]) => String(val) === e.target.value);
        values[state.method][p.key] = opt[0];
        process();
      });
    } else {
      wrap.innerHTML = `<div class="fieldtop"><label for="${id}">${p.label}</label><input id="${id}" type="number" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}"></div><input type="range" min="${p.min}" max="${p.max}" step="${p.step}" value="${v}" aria-label="${p.label}">${p.hint ? `<p class="hint">${p.hint}</p>` : ""}`;
      bindNumber(wrap.querySelector("input[type=number]"), wrap.querySelector("input[type=range]"), p, (x) => {
        values[state.method][p.key] = x;
        process();
      });
    }
    box.appendChild(wrap);
  }
}

// Число и ползунок синхронизированы; некорректный ввод не применяется.
function bindNumber(numEl, rangeEl, p, apply) {
  const set = (raw, from) => {
    let x = Number(raw);
    if (raw === "" || !Number.isFinite(x)) return;
    x = Math.min(p.max, Math.max(p.min, x));
    if (p.key === "size" && x % 2 === 0) x += x < p.max ? 1 : -1;
    if (from !== numEl) numEl.value = x;
    if (from !== rangeEl) rangeEl.value = x;
    apply(x);
  };
  rangeEl.addEventListener("input", () => set(rangeEl.value, rangeEl));
  numEl.addEventListener("change", () => set(numEl.value, null));
}

function setMethod(id) {
  state.method = id;
  $("method").value = id;
  buildParams();
  process();
}

function init() {
  const sel = $("method");
  sel.innerHTML =
    `<optgroup label="Пороговая обработка">` +
    ["niblack", "sauvola"].map((id) => `<option value="${id}">${METHODS[id].name}</option>`).join("") +
    `</optgroup><optgroup label="Точки, линии, перепады">` +
    ["points", "lines", "edges", "log"].map((id) => `<option value="${id}">${METHODS[id].name}</option>`).join("") +
    `</optgroup>`;
  sel.addEventListener("change", () => setMethod(sel.value));

  bindNumber($("blur-num"), $("blur-range"), { key: "blur", min: 0, max: 5 }, (x) => {
    state.blur = x;
    process();
  });
  $("overlay").addEventListener("change", (e) => {
    state.overlay = e.target.checked;
    process();
  });
  $("file").addEventListener("change", (e) => openFile(e.target.files[0]));
  const drop = $("drop");
  drop.addEventListener("dragover", (e) => {
    e.preventDefault();
    drop.classList.add("over");
  });
  drop.addEventListener("dragleave", () => drop.classList.remove("over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("over");
    openFile(e.dataTransfer.files[0]);
  });
  for (const id of ["cvSrc", "cvMid", "cvOut"]) $(id).addEventListener("mousemove", probe);
  $("save").addEventListener("click", () => {
    const a = document.createElement("a");
    a.download = `${state.item ? state.item.file : "image"}-${state.method}.png`;
    a.href = $("cvOut").toDataURL("image/png");
    a.click();
  });

  buildGallery();
  openGallery(GALLERY[0]);
}

init();
