"use strict";
// Количественное сравнение методов на базе изображений. Запуск: node scripts/evaluate.cjs
// 1) бинаризация — по эталонам images/*-truth.png;
// 2) точки — по координатам из images/points.json;
// 3) перепады — по контуру чистого images/shapes.png с допуском 2 пикселя.
const fs = require("node:fs"),
  path = require("node:path");
const I = require("../dist/imaging.js");
const { readPng } = require("./png.cjs");

const dir = path.resolve(__dirname, "../images");
const load = (name) => readPng(path.join(dir, name + ".png"));
const pct = (x) => (100 * x).toFixed(1).padStart(6);

// ---------- 1. Бинаризация ----------

const methods = {
  "Ниблэк 25, k=−0.2": (img) => I.binarize(img, I.niblackThreshold(img, 25, -0.2)),
  "Саувола 25, k=0.2": (img) => I.binarize(img, I.sauvolaThreshold(img, 25, 0.2, 128)),
};

// Лучшие параметры по сетке: размер окна и k.
const windows = [15, 25, 41, 61];
function best(img, truth, thresholdOf, ks) {
  let top = { f1: -1 };
  for (const size of windows)
    for (const k of ks) {
      const r = I.compareMasks(I.binarize(img, thresholdOf(img, size, k)), truth);
      if (r.f1 > top.f1) top = { ...r, size, k };
    }
  return top;
}

console.log("=== Бинаризация: точность / полнота / F1 по эталону ===");
for (const file of fs.readdirSync(dir).filter((f) => f.endsWith("-truth.png")).sort()) {
  const name = file.replace("-truth.png", "");
  const img = load(name);
  const truth = Uint8Array.from(load(name + "-truth").data);
  console.log(`\n${name}             точность  полнота      F1`);
  for (const [label, run] of Object.entries(methods)) {
    const r = I.compareMasks(run(img), truth);
    console.log(`  ${label.padEnd(20)} ${pct(r.precision)}%  ${pct(r.recall)}%  ${pct(r.f1)}%`);
  }
  const n = best(img, truth, (im, size, k) => I.niblackThreshold(im, size, k), [-0.2, -0.5, -0.8]);
  const s = best(img, truth, (im, size, k) => I.sauvolaThreshold(im, size, k, 128), [0.1, 0.2, 0.34, 0.5]);
  console.log(`  лучший Ниблэк: окно ${n.size}, k=${n.k}, F1 ${pct(n.f1)}%`);
  console.log(`  лучшая Саувола: окно ${s.size}, k=${s.k}, F1 ${pct(s.f1)}%`);
}

// ---------- 2. Точки ----------

console.log("\n=== Точки: найдено пикселей / из них настоящих точек ===");
const spots = JSON.parse(fs.readFileSync(path.join(dir, "points.json"), "utf8"));
for (const name of ["points", "points-noisy"]) {
  const img = load(name);
  const truth = new Set(spots.map(([x, y]) => y * img.width + x));
  const row = [0.3, 0.4, 0.5, 0.6, 0.7, 0.9].map((f) => {
    let found = 0,
      hits = 0;
    I.detectPoints(img, f).mask.forEach((v, i) => {
      if (v) {
        found++;
        if (truth.has(i)) hits++;
      }
    });
    return `${Math.round(f * 100)}%: ${found}/${hits}`;
  });
  console.log(`  ${name.padEnd(13)} ${row.join("   ")}   (всего точек ${spots.length})`);
}

// ---------- 3. Перепады ----------

// Пиксель засчитывается, если в пределах 2 пикселей есть пиксель другого контура.
function contourScore(mask, ref, w, h) {
  const near = (m, x, y) => {
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const X = x + dx,
          Y = y + dy;
        if (X >= 0 && Y >= 0 && X < w && Y < h && m[Y * w + X]) return true;
      }
    return false;
  };
  let found = 0,
    good = 0,
    total = 0,
    covered = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask[i]) {
        found++;
        if (near(ref, x, y)) good++;
      }
      if (ref[i]) {
        total++;
        if (near(mask, x, y)) covered++;
      }
    }
  const p = good / found || 0,
    r = covered / total || 0;
  return { p, r, f1: p + r ? (2 * p * r) / (p + r) : 0, found };
}

console.log("\n=== Перепады: точность / полнота / F1 относительно контура чистых фигур (±2 пикс.) ===");
const clean = load("shapes");
const ref = I.detectEdges(clean, 0.1).mask;
const detectors = {
  "градиент 25%": (img) => I.detectEdges(img, 0.25),
  "градиент 25% + Гаусс 1.5": (img) => I.detectEdges(I.gaussianBlur(img, 1.5), 0.25),
  "LoG 10%": (img) => I.detectLogEdges(img, 0.1),
  "LoG 10% + Гаусс 1.5": (img) => I.detectLogEdges(I.gaussianBlur(img, 1.5), 0.1),
  "LoG 20% + Гаусс 3": (img) => I.detectLogEdges(I.gaussianBlur(img, 3), 0.2),
};
for (const name of ["shapes", "shapes-noisy", "shapes-blurred"]) {
  const img = load(name);
  console.log(`\n${name}                  точность  полнота      F1   пикселей`);
  for (const [label, run] of Object.entries(detectors)) {
    const q = contourScore(run(img).mask, ref, img.width, img.height);
    console.log(`  ${label.padEnd(24)} ${pct(q.p)}%  ${pct(q.r)}%  ${pct(q.f1)}%   ${q.found}`);
  }
}
