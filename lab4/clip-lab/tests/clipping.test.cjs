"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  liangBarsky,
  cyrusBeck,
  analyzePolygon,
  parseInputText,
} = require("../dist/clipping.js");

function assertClose(actual, expected, eps = 1e-6) {
  assert.ok(
    Math.abs(actual - expected) <= eps,
    `expected ${expected}, got ${actual}`,
  );
}

test("Liang-Barsky: сквозной пример (-2, 1)-(10, 7) в окне [1, 7] x [2, 6]", () => {
  const res = liangBarsky(
    { x1: -2, y1: 1, x2: 10, y2: 7 },
    { xmin: 1, ymin: 2, xmax: 7, ymax: 6 },
  );
  assert.equal(res.visible, true);
  assertClose(res.t0, 0.25);
  assertClose(res.t1, 0.75);
  assertClose(res.clipped.x1, 1);
  assertClose(res.clipped.y1, 2.5);
  assertClose(res.clipped.x2, 7);
  assertClose(res.clipped.y2, 5.5);
});

test("Liang-Barsky: полностью внутри, полностью снаружи, на границе", () => {
  const rect = { xmin: 0, ymin: 0, xmax: 10, ymax: 10 };

  const inside = liangBarsky({ x1: 2, y1: 3, x2: 8, y2: 7 }, rect);
  assert.equal(inside.visible, true);
  assertClose(inside.t0, 0);
  assertClose(inside.t1, 1);

  const outsideParallel = liangBarsky({ x1: -5, y1: 2, x2: -5, y2: 8 }, rect);
  assert.equal(outsideParallel.visible, false);

  const outsideDiagonal = liangBarsky({ x1: 9, y1: 12, x2: 12, y2: 9 }, rect);
  assert.equal(outsideDiagonal.visible, false);

  const onEdge = liangBarsky({ x1: -2, y1: 0, x2: 5, y2: 0 }, rect);
  assert.equal(onEdge.visible, true);
  assertClose(onEdge.clipped.x1, 0);
  assertClose(onEdge.clipped.y1, 0);
  assertClose(onEdge.clipped.x2, 5);
  assertClose(onEdge.clipped.y2, 0);
});

test("Liang-Barsky: вырожденный отрезок (точка)", () => {
  const rect = { xmin: 0, ymin: 0, xmax: 5, ymax: 5 };
  assert.equal(liangBarsky({ x1: 2, y1: 2, x2: 2, y2: 2 }, rect).visible, true);
  assert.equal(liangBarsky({ x1: 6, y1: 2, x2: 6, y2: 2 }, rect).visible, false);
});

test("Cyrus-Beck: сквозной пример с пятиугольником", () => {
  const poly = [
    { x: 1, y: 1 },
    { x: 6, y: 1 },
    { x: 8, y: 4 },
    { x: 5, y: 7 },
    { x: 1, y: 5 },
  ];
  const res = cyrusBeck({ x1: -1, y1: 1, x2: 9, y2: 6 }, poly);
  assert.equal(res.visible, true);
  assertClose(res.t0, 0.2);
  assertClose(res.t1, 0.8);
  assertClose(res.clipped.x1, 1);
  assertClose(res.clipped.y1, 2);
  assertClose(res.clipped.x2, 7);
  assertClose(res.clipped.y2, 5);
});

test("Cyrus-Beck: не зависит от порядка вершин (CCW vs CW)", () => {
  const ccw = [
    { x: 0, y: 0 },
    { x: 6, y: 0 },
    { x: 8, y: 4 },
    { x: 3, y: 7 },
    { x: -1, y: 4 },
  ];
  const cw = [...ccw].reverse();
  const seg = { x1: -3, y1: 1, x2: 9, y2: 6 };
  const r1 = cyrusBeck(seg, ccw);
  const r2 = cyrusBeck(seg, cw);
  assert.equal(r1.visible, r2.visible);
  assertClose(r1.t0, r2.t0);
  assertClose(r1.t1, r2.t1);
  assertClose(r1.clipped.x1, r2.clipped.x1);
  assertClose(r1.clipped.y1, r2.clipped.y1);
  assertClose(r1.clipped.x2, r2.clipped.x2);
  assertClose(r1.clipped.y2, r2.clipped.y2);
});

test("Cyrus-Beck на прямоугольнике совпадает с Liang-Barsky на 500 случайных отрезках", () => {
  const rect = { xmin: -3, ymin: -2, xmax: 7, ymax: 5 };
  const poly = [
    { x: rect.xmin, y: rect.ymin },
    { x: rect.xmax, y: rect.ymin },
    { x: rect.xmax, y: rect.ymax },
    { x: rect.xmin, y: rect.ymax },
  ];
  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 20 - 10;
  };
  for (let i = 0; i < 500; i++) {
    const seg = { x1: rand(), y1: rand(), x2: rand(), y2: rand() };
    const lb = liangBarsky(seg, rect);
    const cb = cyrusBeck(seg, poly);
    assert.equal(lb.visible, cb.visible);
    if (lb.visible) {
      assertClose(lb.clipped.x1, cb.clipped.x1, 1e-7);
      assertClose(lb.clipped.y1, cb.clipped.y1, 1e-7);
      assertClose(lb.clipped.x2, cb.clipped.x2, 1e-7);
      assertClose(lb.clipped.y2, cb.clipped.y2, 1e-7);
    }
  }
});

test("analyzePolygon: проверка выпуклости и вырожденности", () => {
  assert.equal(
    analyzePolygon([
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 2, y: 1 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
    ]).convex,
    false,
  );
  assert.equal(
    analyzePolygon([
      { x: 0, y: 0 },
      { x: 2, y: 2 },
      { x: 4, y: 4 },
    ]).valid,
    false,
  );
});

test("parseInputText: парсинг формата входного файла", () => {
  const lbText = `
    2
    -2 1 10 7
    0 0 8 8
    1 2 7 6
  `;
  const lb = parseInputText(lbText, "liang-barsky");
  assert.equal(lb.segments.length, 2);
  assert.deepEqual(lb.rect, { xmin: 1, ymin: 2, xmax: 7, ymax: 6 });

  const cbText = `
    1
    -1 2 9 6
    5
    1 1
    6 1
    8 4
    5 7
    1 5
  `;
  const cb = parseInputText(cbText, "cyrus-beck");
  assert.equal(cb.segments.length, 1);
  assert.equal(cb.polygon.length, 5);
});
