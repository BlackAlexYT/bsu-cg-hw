"use strict";
// Встраивает images/*.png в dist/gallery.js как data-URI, чтобы index.html
// открывался из файла без сервера (canvas не «загрязняется» чужим источником).
// Запуск: node scripts/build-gallery.cjs
const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, "..");

// group: threshold — бинаризация, segment — точки, линии, перепады.
// method и params — с чего удобно начать; в интерфейсе всё можно поменять.
const items = [
  {
    file: "doc-shadow",
    group: "threshold",
    title: "Документ с тенью",
    note: "Свет падает слева сверху, справа внизу тень: один порог на всё изображение здесь не подходит. Оба локальных метода выделяют текст, но Ниблэк добавляет шум между строками.",
    method: "sauvola",
  },
  {
    file: "doc-noisy-margins",
    group: "threshold",
    title: "Шум и пустые поля",
    note: "Ровный фон с шумом и большими полями без текста. В пустых окнах s мало, и Ниблэк превращает шум в «текст»; Саувола оставляет фон чистым.",
    method: "niblack",
  },
  {
    file: "doc-faded",
    group: "threshold",
    title: "Выцветший документ",
    note: "Светлый фон, текст темнее всего на ~22 уровня. Порог Сауволы опускается до ~0.8·m и оказывается ниже букв — текст пропадает. Ниблэк здесь лучше.",
    method: "sauvola",
  },
  {
    file: "blobs-uneven",
    group: "threshold",
    title: "Пятна на неровном фоне",
    note: "Не текст: тёмные «клетки» на фоне с перепадом освещённости. Окно должно быть больше объекта — попробуйте 15 и 61.",
    method: "sauvola",
    params: { size: 61 },
  },
  {
    file: "points",
    group: "segment",
    title: "Точки",
    note: "10 светлых (+100) и 6 тёмных (−70) точек на плавном фоне с двумя фигурами. При пороге 60% находятся все 16 и ничего лишнего, при 90% — только светлые, ниже 40% добавляются углы и края фигур.",
    method: "points",
  },
  {
    file: "points-noisy",
    group: "segment",
    title: "Точки с шумом",
    note: "То же с гауссовым шумом σ = 6. При 60% — 15 точек из 16 без ложных, при 30–40% — сотни пикселей шума. Сглаживание здесь вредит: оно размывает и сами точки.",
    method: "points",
  },
  {
    file: "lines",
    group: "segment",
    title: "Линии в 1 пиксель",
    note: "Горизонталь, вертикаль, ±45°, бледная линия сверху и толстая полоса. Внутри полосы отклик 0, на краях 3Δ — ровно половина отклика линии 6Δ: при пороге 50% остаётся контур полосы, при 55% — нет.",
    method: "lines",
  },
  {
    file: "wires-dark",
    group: "segment",
    title: "Тёмная «проводка»",
    note: "Тёмные линии на светлом фоне: нужен режим «тёмные линии». Наклонные линии не совпадают с ±45° и находятся хуже.",
    method: "lines",
    params: { bright: false, direction: "h" },
  },
  {
    file: "shapes",
    group: "segment",
    title: "Фигуры",
    note: "Чистые границы разной высоты перепада. Порог градиента 25% от максимума теряет почти всю границу эллипса (перепад 50 против 170 у треугольника), остаются только наклонные участки. LoG находит все контуры.",
    method: "edges",
  },
  {
    file: "shapes-noisy",
    group: "segment",
    title: "Фигуры с шумом",
    note: "Шум σ = 18. Градиент даёт много ложных точек, LoG (вторая производная) — ещё больше. Включите сглаживание слева: градиенту хватает σ = 1.5, LoG нужно σ ≈ 3 и порог 20%.",
    method: "edges",
  },
  {
    file: "shapes-blurred",
    group: "segment",
    title: "Размытые фигуры",
    note: "Размытие Гаусса σ = 3. Перепад растянут на несколько пикселей, и градиент даёт толстые границы. LoG со сглаживанием σ = 1.5 даёт тонкий контур в середине перепада, по переходу через ноль.",
    method: "log",
  },
  {
    file: "steps-gradient",
    group: "segment",
    title: "Ступени и засветка",
    note: "Ступени разной высоты на линейном градиенте. Порог от максимума отсекает слабые перепады; плавный градиент даёт ровный небольшой отклик.",
    method: "edges",
  },
];

const read = (name) =>
  "data:image/png;base64," + fs.readFileSync(path.join(root, "images", name + ".png")).toString("base64");
const gallery = items.map((item) => {
  const entry = { ...item, src: read(item.file) };
  if (fs.existsSync(path.join(root, "images", item.file + "-truth.png"))) entry.truth = read(item.file + "-truth");
  return entry;
});
const out = path.join(root, "dist", "gallery.js");
fs.writeFileSync(
  out,
  "// Сгенерировано scripts/build-gallery.cjs из папки images — не редактировать вручную.\n" +
    "globalThis.GALLERY = " +
    JSON.stringify(gallery, null, 1) +
    ";\n",
);
console.log(out + ": " + gallery.length + " изображений");
