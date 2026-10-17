"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const I = require("../dist/imaging.js");
const reference = require("./reference.json");

function near(actual, expected, tolerance = 1e-6) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < expected.length; i++)
    assert(
      Math.abs(actual[i] - expected[i]) <= tolerance,
      `пиксель ${i}: ${actual[i]} != ${expected[i]}`,
    );
}
// Изображение из строк вида "0 0 9 / 0 9 0", удобно для ручных примеров.
function grid(rows) {
  const data = rows.map((r) => r.trim().split(/\s+/).map(Number));
  return I.image(data[0].length, data.length, Float64Array.from(data.flat()));
}
function blank(w, h, value = 0) {
  return I.image(w, h, new Float64Array(w * h).fill(value));
}
const at = (img, x, y) => img.data[y * img.width + x];
const count = (mask) => mask.reduce((n, v) => n + (v === 255), 0);

// ---------- Сверка с OpenCV и scikit-image ----------

reference.forEach((ref, n) => {
  const img = I.image(ref.width, ref.height, Float64Array.from(ref.data));
  const name = `${ref.width}×${ref.height}`;

  for (const size of [3, 7]) {
    // В skimage знак другой: T = m − k·s, поэтому k = 0.2 соответствует нашему −0.2.
    test(`Ниблэк, окно ${size}, ${name}: как skimage`, () =>
      near(I.niblackThreshold(img, size, -0.2), ref.niblack[size]));
    test(`Саувола, окно ${size}, ${name}: как skimage`, () =>
      near(I.sauvolaThreshold(img, size, 0.3, 128), ref.sauvola[size]));
  }
  for (const sigma of ["0.8", "1.5"])
    test(`Гаусс σ=${sigma}, ${name}: как cv2.GaussianBlur`, () =>
      near(I.gaussianBlur(img, Number(sigma)).data, ref.gauss[sigma]));
  for (const mask of Object.keys(ref.filter2D))
    test(`маска ${mask}, ${name}: как cv2.filter2D`, () =>
      near(I.correlate(img, I.MASKS[mask], Math.sqrt(I.MASKS[mask].length)).data, ref.filter2D[mask]));
  test(`градиент |Gx| + |Gy|, ${name}: как numpy`, () => near(I.gradient(img), ref.gradient));
  if (n === 0)
    test("бинаризация по Ниблэку совпадает с порогом skimage", () => {
      const T = ref.niblack[7];
      const mask = I.binarize(img, I.niblackThreshold(img, 7, -0.2));
      mask.forEach((v, i) => assert.equal(v, ref.data[i] > T[i] ? 255 : 0));
    });
});

// ---------- Ручные проверки ----------

test("reflect: зеркальное продолжение без повтора края", () => {
  assert.deepEqual(
    [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6].map((i) => I.reflect(i, 4)),
    [3, 2, 1, 0, 1, 2, 3, 2, 1, 0],
  );
  assert.equal(I.reflect(-5, 1), 0);
});

test("перевод в полутона по BT.601", () => {
  const rgba = [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255];
  assert.deepEqual(Array.from(I.fromRGBA(rgba, 4, 1).data), [76, 150, 29, 255]);
});

test("ядро Гаусса нормировано и симметрично", () => {
  const k = I.gaussianKernel(1.2);
  assert.equal(k.length, 2 * Math.ceil(3.6) + 1);
  assert(Math.abs(k.reduce((a, b) => a + b) - 1) < 1e-12);
  k.forEach((v, i) => assert(Math.abs(v - k[k.length - 1 - i]) < 1e-15));
});

test("локальные среднее и СКО в однородной области", () => {
  const { mean, std } = I.localMeanStd(blank(6, 5, 40), 3);
  mean.forEach((m) => assert(Math.abs(m - 40) < 1e-9));
  std.forEach((s) => assert(Math.abs(s) < 1e-6));
});

test("локальные среднее и СКО на шахматке 0/100", () => {
  const img = I.image(8, 8, Float64Array.from({ length: 64 }, (_, i) => ((i % 8) + (i >> 3)) % 2 ? 100 : 0));
  const { mean, std } = I.localMeanStd(img, 3);
  // Окно 3×3 вокруг чёрной клетки: 4 белых из 9.
  assert(Math.abs(mean[9] - 400 / 9) < 1e-9);
  assert(Math.abs(std[9] - Math.sqrt(4 / 9 - 16 / 81) * 100) < 1e-9);
});

test("Саувола в однородной области: T = m(1 − k)", () => {
  const T = I.sauvolaThreshold(blank(5, 5, 200), 3, 0.2, 128);
  T.forEach((t) => assert(Math.abs(t - 160) < 1e-6));
});

test("Ниблэк и Саувола отделяют тёмный текст при неравномерном освещении", () => {
  // Фон светлеет слева направо от 60 до 230, «штрихи» на 45 единиц темнее фона.
  const w = 120,
    h = 30,
    img = blank(w, h);
  const truth = new Uint8Array(w * h).fill(255);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const stroke = x % 12 < 2 && y > 5 && y < 25;
      img.data[y * w + x] = 60 + (170 * x) / w - (stroke ? 45 : 0);
      if (stroke) truth[y * w + x] = 0;
    }
  // Один порог на всё изображение — середина диапазона яркостей.
  const global = I.compareMasks(I.binarize(img, new Float64Array(w * h).fill(145)), truth);
  const sauvola = I.compareMasks(I.binarize(img, I.sauvolaThreshold(img, 15, 0.2, 128)), truth);
  const niblack = I.compareMasks(I.binarize(img, I.niblackThreshold(img, 15, -0.2)), truth);
  assert(global.f1 < 0.6, "глобальный порог должен ошибаться");
  assert(sauvola.f1 > 0.9 && niblack.f1 > 0.9);
});

test("binarize: строго больше порога — фон", () => {
  const img = grid(["9 10 11"]);
  assert.deepEqual(Array.from(I.binarize(img, [10, 10, 10])), [0, 0, 255]);
  assert.deepEqual(Array.from(I.binarize(img, [8, 10, 12])), [255, 0, 0]);
});

test("корреляция не переворачивает ядро", () => {
  const img = blank(5, 5);
  img.data[2 * 5 + 2] = 1;
  const k = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const r = I.correlate(img, k, 3);
  // Для пикселя (1,1) единица стоит со смещением (+1,+1) → k[8].
  assert.equal(at(r, 1, 1), 9);
  assert.equal(at(r, 3, 3), 1);
  assert.equal(at(r, 2, 1), 8);
});

test("точка: изолированный пиксель найден, однородный градиент — нет", () => {
  const img = blank(11, 11);
  for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) img.data[y * 11 + x] = 10 * x;
  img.data[5 * 11 + 5] += 80;
  const { mask, response } = I.detectPoints(img, 0.9);
  assert.equal(count(mask), 1);
  assert.equal(mask[5 * 11 + 5], 255);
  assert.equal(response[5 * 11 + 5], 640);
  // На линейном градиенте вдали от точки и границы отклик маски равен нулю.
  assert.equal(response[2 * 11 + 2], 0);
});

test("линии: каждая маска сильнее всего реагирует на своё направление", () => {
  const n = 15,
    c = 7;
  const lines = {
    h: (x, y) => y === c,
    v: (x, y) => x === c,
    p45: (x, y) => x + y === 2 * c,
    m45: (x, y) => x === y,
  };
  for (const [dir, on] of Object.entries(lines)) {
    const img = blank(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (on(x, y)) img.data[y * n + x] = 100;
    const scores = Object.fromEntries(
      Object.keys(lines).map((d) => [d, I.detectLines(img, d, 1).T]),
    );
    const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
    assert.equal(best, dir, JSON.stringify(scores));
    assert.equal(scores[dir], 600);
  }
});

test("линии: тёмная линия ищется с bright = false", () => {
  const img = blank(9, 9, 200);
  for (let x = 0; x < 9; x++) img.data[4 * 9 + x] = 50;
  // Светлые линии ищутся по краям тёмной, но не на ней самой.
  const brightMask = I.detectLines(img, "h", 0.9, true).mask;
  for (let x = 0; x < 9; x++) assert.equal(brightMask[4 * 9 + x], 0);
  const dark = I.detectLines(img, "h", 0.9, false);
  assert.equal(count(dark.mask), 9);
  for (let x = 0; x < 9; x++) assert.equal(dark.mask[4 * 9 + x], 255);
});

test("линии: режим all = максимум по направлениям", () => {
  const img = blank(9, 9);
  for (let y = 0; y < 9; y++) img.data[y * 9 + 4] = 50;
  for (let x = 0; x < 9; x++) img.data[2 * 9 + x] = 50;
  const all = I.detectLines(img, "all", 0.99).mask;
  assert.equal(all[6 * 9 + 4], 255);
  assert.equal(all[2 * 9 + 7], 255);
});

test("градиент на ступеньке: |Gx| + |Gy| = Δ только перед перепадом", () => {
  const img = grid(["0 0 10 10", "0 0 10 10", "0 0 10 10"]);
  const g = I.gradient(img);
  assert.deepEqual(Array.from(g.slice(4, 8)), [0, 10, 0, 0]);
  // Диагональная ступенька: обе разности ненулевые.
  const d = grid(["0 0 0", "0 0 9", "0 9 9"]);
  assert.equal(I.gradient(d)[4], 18);
});

test("маска LoG 5×5: сумма 0, симметрична", () => {
  const k = I.MASKS.log5;
  assert.equal(k.reduce((a, b) => a + b), 0);
  k.forEach((v, i) => assert.equal(v, k[24 - i]));
  assert.equal(I.correlate(blank(7, 7, 123), k, 5).data[24], 0);
});

test("перепады по градиенту: граница квадрата найдена, внутри пусто", () => {
  const img = blank(20, 20, 30);
  for (let y = 5; y < 15; y++) for (let x = 5; x < 15; x++) img.data[y * 20 + x] = 200;
  const { mask } = I.detectEdges(img, 0.3);
  assert.equal(mask[10 * 20 + 10], 0);
  assert.equal(mask[0], 0);
  assert.equal(mask[10 * 20 + 4], 255);
  assert.equal(mask[10 * 20 + 14], 255);
});

test("LoG: замкнутый контур круга, внутри и снаружи пусто", () => {
  const n = 41,
    img = blank(n, n, 40);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if ((x - 20) ** 2 + (y - 20) ** 2 <= 100) img.data[y * n + x] = 210;
  const { mask } = I.detectLogEdges(img, 0.1);
  assert.equal(mask[20 * n + 20], 0);
  assert.equal(mask[2 * n + 2], 0);
  // На каждом луче из центра есть хотя бы один пиксель контура около r = 10.
  for (let a = 0; a < 360; a += 15) {
    let hit = false;
    for (let r = 8; r <= 12; r += 0.5) {
      const x = Math.round(20 + r * Math.cos((a * Math.PI) / 180));
      const y = Math.round(20 + r * Math.sin((a * Math.PI) / 180));
      if (mask[y * n + x] === 255) hit = true;
    }
    assert(hit, `луч ${a}°`);
  }
});

test("compareMasks: точность, полнота, F1", () => {
  const truth = Uint8Array.from([0, 0, 255, 255]);
  const r = I.compareMasks(Uint8Array.from([0, 255, 0, 255]), truth);
  assert.equal(r.precision, 0.5);
  assert.equal(r.recall, 0.5);
  assert.equal(r.f1, 0.5);
  assert.equal(r.accuracy, 0.5);
});

test("normalize растягивает максимум до 255", () => {
  assert.deepEqual(Array.from(I.normalize([0, 5, 10, -3])), [0, 128, 255, 0]);
  assert.deepEqual(Array.from(I.normalize([0, 0])), [0, 0]);
});
