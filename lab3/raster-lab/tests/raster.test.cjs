"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const R = require("../dist/raster.js");

function collect(fn, ...args) {
  const pts = [];
  fn(...args, (x, y, c) => pts.push(c === undefined ? [x, y] : [x, y, c]));
  return pts;
}
const key = ([x, y]) => `${x},${y}`;

// Набор отрезков: все октанты, вырожденные случаи, случайные.
const segments = [
  [0, 0, 0, 0],
  [0, 0, 10, 0],
  [0, 0, 0, 10],
  [0, 0, -10, 0],
  [0, 0, 0, -10],
  [0, 0, 7, 7],
  [0, 0, -7, 7],
  [1, 1, 8, 4],
  [3, -2, -9, 5],
  [-4, 6, 2, -13],
  [0, 0, 5, 2],
  [0, 0, 2, 1],
];
const random = R.rng(7);
for (let i = 0; i < 300; i++) segments.push([0, 0, 0, 0].map(() => Math.floor(random() * 81) - 40));

// Есть ли на отрезке «ничья» — точка, где прямая проходит ровно посередине
// между двумя пикселями. Там алгоритмы вправе округлять по-разному.
function hasTie(x0, y0, x1, y1) {
  let a = Math.abs(x1 - x0),
    b = Math.abs(y1 - y0);
  if (b > a) [a, b] = [b, a];
  if (a === 0) return false;
  for (let t = 0; t <= a; t++) if ((2 * b * t) % (2 * a) === a) return true;
  return false;
}

// ---------- Общие свойства растровых отрезков ----------

for (const [name, fn] of [
  ["пошаговый", R.stepByStep],
  ["ЦДА", R.dda],
  ["Брезенхем", R.bresenham],
  ["Кастл — Питвей", R.castlePitteway],
]) {
  test(`${name}: концы, число пикселей, 8-связность, отклонение ≤ 0.5`, () => {
    for (const [x0, y0, x1, y1] of segments) {
      const pts = collect(fn, x0, y0, x1, y1);
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) + 1;
      assert.equal(pts.length, n, `число пикселей для ${[x0, y0, x1, y1]}`);
      assert.deepEqual(pts[0], [x0, y0]);
      assert.deepEqual(pts[n - 1], [x1, y1]);
      assert.equal(new Set(pts.map(key)).size, n, "повторяющиеся пиксели");
      for (let i = 1; i < n; i++) {
        const ddx = Math.abs(pts[i][0] - pts[i - 1][0]),
          ddy = Math.abs(pts[i][1] - pts[i - 1][1]);
        assert(ddx <= 1 && ddy <= 1 && ddx + ddy > 0, `разрыв между пикселями ${i - 1} и ${i}`);
      }
      // Расстояние до прямой вдоль второй оси не больше половины пикселя.
      const dx = x1 - x0,
        dy = y1 - y0;
      for (const [x, y] of pts) {
        const err = Math.abs(dx) >= Math.abs(dy) ? (dx ? y - (y0 + (dy * (x - x0)) / dx) : 0) : x - (x0 + (dx * (y - y0)) / dy);
        assert(Math.abs(err) <= 0.5 + 1e-9, `пиксель (${x}, ${y}) далеко от прямой: ${err}`);
      }
    }
  });
}

test("без «ничьих» все четыре алгоритма отрезка дают одинаковые пиксели", () => {
  let checked = 0;
  for (const s of segments) {
    if (hasTie(...s)) continue;
    const ref = collect(R.bresenham, ...s);
    for (const fn of [R.stepByStep, R.dda, R.castlePitteway]) assert.deepEqual(collect(fn, ...s), ref, `${fn.name} ${s}`);
    checked++;
  }
  assert(checked > 100);
});

test("Кастл — Питвей совпадает с Брезенхемом на всех отрезках, включая «ничьи»", () => {
  for (const s of segments) assert.deepEqual(collect(R.castlePitteway, ...s), collect(R.bresenham, ...s), `${s}`);
});

test("Брезенхем совпадает с округлением точного y до 4000 отрезков в первом октанте", () => {
  const rnd = R.rng(99);
  for (let n = 0; n < 4000; n++) {
    const dx = 1 + Math.floor(rnd() * 200),
      dy = Math.floor(rnd() * (dx + 1));
    const pts = collect(R.bresenham, 0, 0, dx, dy);
    pts.forEach(([x, y]) => assert.equal(y, R.round((dy * x) / dx)));
  }
});

// ---------- Ручные примеры из отчёта ----------

test("пример (1,1)–(8,4): пиксели и ошибки Брезенхема", () => {
  const trace = [];
  const pts = [];
  R.bresenham(1, 1, 8, 4, (x, y) => pts.push([x, y]), trace);
  assert.deepEqual(pts, [[1, 1], [2, 1], [3, 2], [4, 2], [5, 3], [6, 3], [7, 4], [8, 4]]);
  assert.deepEqual(trace.slice(0, -1).map((r) => r.e), [-1, 5, -3, 3, -5, 1, -7]);
});

test("пример (1,1)–(8,4): строка ходов Кастла — Питвея", () => {
  assert.equal(R.castleMoves(7, 3), "sdsdsds");
  assert.equal(R.castleMoves(5, 2), "sdsds");
  assert.equal(R.castleMoves(6, 2), R.castleMoves(3, 1).repeat(2)); // НОД = 2 — блок повторяется
  assert.equal(R.castleMoves(4, 0), "ssss");
  assert.equal(R.castleMoves(4, 4), "dddd");
});

test("пример R = 5: четверть окружности, Δ и ходы", () => {
  const trace = [];
  R.bresenhamCircle(0, 0, 5, () => {}, trace);
  assert.deepEqual(trace.map((r) => [r.x, r.y]), [[0, 5], [1, 5], [2, 5], [3, 4], [4, 3], [5, 2], [5, 1], [5, 0]]);
  assert.deepEqual(trace.map((r) => r.delta), [-8, -5, 0, 0, 4, 12, 11, 12]);
  assert.equal(trace.map((r) => r.move).join(""), "HHDDDVV");
});

// ---------- Окружность ----------

test("окружность: симметрия, без повторов, ближайший y для каждого x", () => {
  for (let r = 0; r <= 60; r++) {
    const pts = collect(R.bresenhamCircle, 3, -2, r);
    const set = new Set(pts.map(key));
    assert.equal(set.size, pts.length, `повторы при R = ${r}`);
    for (const [x, y] of pts) {
      const u = x - 3,
        v = y + 2;
      for (const [a, b] of [[-u, v], [u, -v], [v, u]]) assert(set.has(`${a + 3},${b - 2}`), `нет симметричной точки для (${u}, ${v}), R = ${r}`);
    }
    // В октанте 0 ≤ x ≤ y выбранный y минимизирует |x² + y² − R²|.
    for (const [x, y] of pts) {
      const u = x - 3,
        v = y + 2;
      if (u < 0 || u > v) continue;
      const err = (yy) => Math.abs(u * u + yy * yy - r * r);
      assert(err(v) <= err(v - 1) && err(v) <= err(v + 1), `R = ${r}, (${u}, ${v})`);
    }
  }
});

test("окружность: 8-связная замкнутая кривая", () => {
  for (const r of [1, 2, 7, 33, 100]) {
    const trace = [];
    R.bresenhamCircle(0, 0, r, () => {}, trace);
    for (let i = 1; i < trace.length; i++) {
      const ddx = trace[i].x - trace[i - 1].x,
        ddy = trace[i - 1].y - trace[i].y;
      assert(ddx >= 0 && ddx <= 1 && ddy >= 0 && ddy <= 1 && ddx + ddy > 0);
    }
    assert.deepEqual([trace[0].x, trace[0].y], [0, r]);
    assert.deepEqual([trace.at(-1).x, trace.at(-1).y], [r, 0]);
  }
});

// ---------- Ву ----------

test("Ву: в каждом столбце сумма яркостей 1 и центр масс на прямой", () => {
  for (const [x0, y0, x1, y1] of segments) {
    const pts = collect(R.wu, x0, y0, x1, y1);
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    const cols = new Map();
    for (const [x, y, c] of pts) {
      assert(c > 0 && c <= 1);
      const u = steep ? y : x,
        v = steep ? x : y;
      const s = cols.get(u) || [0, 0];
      cols.set(u, [s[0] + c, s[1] + c * v]);
    }
    for (const [u, [mass, moment]] of cols) {
      assert(Math.abs(mass - 1) < 1e-9);
      const exact = steep ? (x1 === x0 && y1 === y0 ? x0 : x0 + ((x1 - x0) * (u - y0)) / (y1 - y0)) : x1 === x0 ? y0 : y0 + ((y1 - y0) * (u - x0)) / (x1 - x0);
      assert(Math.abs(moment - exact) < 1e-9, `${[x0, y0, x1, y1]} столбец ${u}`);
    }
  }
});

test("замер времени возвращает все шесть алгоритмов", () => {
  const res = R.benchmark({ count: 200, runs: 1 });
  assert.deepEqual(res.map((r) => r.key), ["step", "dda", "bresenham", "castle", "wu", "circle"]);
  for (const r of res) assert(r.pixels > 0 && r.ms >= 0);
});
