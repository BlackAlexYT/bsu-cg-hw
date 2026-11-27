"use strict";

const { liangBarsky, cyrusBeck } = require("../dist/clipping.js");

function makePRNG(seed = 123456789) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeRegularPolygon(m, radius = 5, cx = 5, cy = 5) {
  const verts = [];
  for (let i = 0; i < m; i++) {
    const a = (2 * Math.PI * i) / m;
    verts.push({
      x: cx + radius * Math.cos(a),
      y: cy + radius * Math.sin(a),
    });
  }
  return verts;
}

const N = 50000;
const rand = makePRNG(42);
const segments = [];
for (let i = 0; i < N; i++) {
  segments.push({
    x1: rand() * 20 - 5,
    y1: rand() * 20 - 5,
    x2: rand() * 20 - 5,
    y2: rand() * 20 - 5,
  });
}

const rect = { xmin: 1, ymin: 2, xmax: 7, ymax: 6 };
const rectPoly = [
  { x: rect.xmin, y: rect.ymin },
  { x: rect.xmax, y: rect.ymin },
  { x: rect.xmax, y: rect.ymax },
  { x: rect.xmin, y: rect.ymax },
];

// Статистика категорий отрезков на прямоугольнике
let fullyInside = 0;
let clipped = 0;
let rejected = 0;
let mismatches = 0;

for (const s of segments) {
  const lb = liangBarsky(s, rect);
  const cb = cyrusBeck(s, rectPoly);
  if (lb.visible !== cb.visible) mismatches++;
  if (!lb.visible) rejected++;
  else if (lb.t0 === 0 && lb.t1 === 1) fullyInside++;
  else clipped++;
}

console.log(`N = ${N}`);
console.log(
  `Прямоугольник: полностью внутри=${fullyInside} (${((100 * fullyInside) / N).toFixed(1)}%), ` +
    `отсечено=${clipped} (${((100 * clipped) / N).toFixed(1)}%), ` +
    `отвергнуто=${rejected} (${((100 * rejected) / N).toFixed(1)}%), ` +
    `расхождений LB vs CB=${mismatches}`,
);

function bench(name, fn) {
  // Прогрев JIT
  for (let r = 0; r < 3; r++) {
    let acc = 0;
    for (let i = 0; i < N; i++) acc += fn(segments[i]);
    if (acc === -1) console.log(acc);
  }
  let bestNs = Infinity;
  let sink = 0;
  for (let r = 0; r < 12; r++) {
    const t0 = process.hrtime.bigint();
    let acc = 0;
    for (let i = 0; i < N; i++) acc += fn(segments[i]);
    const dt = Number(process.hrtime.bigint() - t0);
    sink += acc;
    if (dt < bestNs) bestNs = dt;
  }
  const nsPerSeg = bestNs / N;
  console.log(`${name.padEnd(28)}: ${nsPerSeg.toFixed(1)} нс/отр. (sink=${sink.toFixed(0)})`);
}

bench("Лианг — Барски (rect)", (s) => {
  const r = liangBarsky(s, rect);
  return r.visible ? r.t0 + r.t1 : 0;
});

for (const m of [4, 8, 16, 32]) {
  const poly = m === 4 ? rectPoly : makeRegularPolygon(m);
  const label = m === 4 ? "Кирус — Бек (m=4, rect)" : `Кирус — Бек (m=${m})`;
  bench(label, (s) => {
    const r = cyrusBeck(s, poly);
    return r.visible ? r.t0 + r.t1 : 0;
  });
}
