"use strict";
// Рисунки для отчёта: несколько результатов в одну строку, через белый промежуток.
// Все результаты получены модулем dist/imaging.js. Запуск: node scripts/report-figures.cjs
const fs = require("node:fs"),
  path = require("node:path");
const I = require("../dist/imaging.js");
const { readPng, writePng } = require("./png.cjs");

const root = path.resolve(__dirname, "..");
const outDir = path.resolve(root, "../report/fig");
fs.mkdirSync(outDir, { recursive: true });
const load = (name) => readPng(path.join(root, "images", name + ".png"));
const gray = (img) => img.data;
const resp = (r) => I.normalize(r.response);

function row(file, img, panels, gap = 8) {
  const w = img.width,
    h = img.height,
    W = panels.length * w + (panels.length - 1) * gap;
  const data = new Uint8Array(W * h).fill(255);
  panels.forEach((p, k) => {
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) data[y * W + k * (w + gap) + x] = p[y * w + x];
  });
  writePng(path.join(outDir, file + ".png"), { width: W, height: h, data });
  console.log(file);
}

let img = load("doc-shadow");
row("doc-shadow", img, [
  gray(img),
  I.binarize(img, I.niblackThreshold(img, 25, -0.2)),
  I.binarize(img, I.sauvolaThreshold(img, 25, 0.2, 128)),
]);

img = load("doc-noisy-margins");
row("doc-noisy-margins", img, [
  gray(img),
  I.binarize(img, I.niblackThreshold(img, 25, -0.2)),
  I.binarize(img, I.sauvolaThreshold(img, 25, 0.2, 128)),
]);

img = load("doc-faded");
row("doc-faded", img, [
  gray(img),
  I.binarize(img, I.niblackThreshold(img, 61, -0.8)),
  I.binarize(img, I.sauvolaThreshold(img, 25, 0.2, 128)),
]);

img = load("blobs-uneven");
row("blobs-uneven", img, [
  gray(img),
  I.binarize(img, I.sauvolaThreshold(img, 15, 0.2, 128)),
  I.binarize(img, I.sauvolaThreshold(img, 61, 0.2, 128)),
]);

img = load("points-noisy");
row("points", img, [gray(img), resp(I.detectPoints(img, 0.6)), I.detectPoints(img, 0.6).mask, I.detectPoints(img, 0.4).mask]);

img = load("lines");
row("lines", img, [gray(img), resp(I.detectLines(img, "all")), I.detectLines(img, "all", 0.5).mask, I.detectLines(img, "all", 0.55).mask, I.detectLines(img, "h", 0.55).mask]);

img = load("wires-dark");
row("wires", img, [gray(img), I.detectLines(img, "h", 0.55, true).mask, I.detectLines(img, "h", 0.55, false).mask]);

img = load("shapes");
row("edges-clean", img, [gray(img), I.detectEdges(img, 0.25).mask, I.detectLogEdges(img, 0.1).mask]);

img = load("shapes-noisy");
row("edges-noisy", img, [
  gray(img),
  I.detectEdges(img, 0.25).mask,
  I.detectEdges(I.gaussianBlur(img, 1.5), 0.25).mask,
  I.detectLogEdges(img, 0.1).mask,
  I.detectLogEdges(I.gaussianBlur(img, 3), 0.2).mask,
]);

img = load("shapes-blurred");
row("edges-blurred", img, [
  gray(img),
  resp({ response: I.gradient(img) }),
  I.detectEdges(img, 0.25).mask,
  I.detectLogEdges(I.gaussianBlur(img, 1.5), 0.1).mask,
]);
