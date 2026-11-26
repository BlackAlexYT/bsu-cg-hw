"use strict";
// Рисунки для отчёта в виде TikZ (../report/fig/*.tex): пиксели считаются
// теми же функциями, что и в интерфейсе. Запуск: node scripts/report-figures.cjs
const fs = require("node:fs"),
  path = require("node:path");
const R = require("../dist/raster.js");
const out = path.resolve(__dirname, "../../report/fig");
fs.mkdirSync(out, { recursive: true });

// Пиксель (x, y) — квадрат [x − ½, x + ½] × [y − ½, y + ½].
function figure(name, { xmin, xmax, ymin, ymax, pixels, ideal, marks = [], labels = false, unit = 0.5, tick = 1 }) {
  const t = [];
  t.push(`\\begin{tikzpicture}[x=${unit}cm,y=${unit}cm]`);
  for (const { x, y, c } of pixels) {
    const color = c === undefined ? "pix" : `black!${Math.round(c * 100)}`;
    t.push(`\\fill[${color}] (${x - 0.5},${y - 0.5}) rectangle +(1,1);`);
    if (labels && c !== undefined) t.push(`\\node[font=\\tiny,text=${c > 0.5 ? "white" : "black"}] at (${x},${y}) {${c.toFixed(2).replace(/^0/, "")}};`);
  }
  t.push(`\\draw[gridc,very thin] (${xmin - 0.5},${ymin - 0.5}) grid[shift={(0.5,0.5)}] (${xmax + 0.5},${ymax + 0.5});`);
  for (let x = xmin; x <= xmax; x++) for (let y = ymin; y <= ymax; y++) t.push(`\\fill[gray] (${x},${y}) circle[radius=0.05];`);
  t.push(`\\draw[->,thick] (${xmin - 0.5},0) -- (${xmax + 0.9},0) node[right] {$x$};`);
  t.push(`\\draw[->,thick] (0,${ymin - 0.5}) -- (0,${ymax + 0.9}) node[above] {$y$};`);
  for (let x = xmin; x <= xmax; x++) if (x && x % tick === 0) t.push(`\\node[font=\\scriptsize,below,fill=white,inner sep=1pt] at (${x},-0.15) {$${x}$};`);
  for (let y = ymin; y <= ymax; y++) if (y && y % tick === 0) t.push(`\\node[font=\\scriptsize,left,fill=white,inner sep=1pt] at (-0.15,${y}) {$${y}$};`);
  t.push(`\\node[font=\\scriptsize,below left] at (0,0) {$0$};`);
  if (ideal) t.push(`\\draw[idealc,thick] ${ideal};`);
  for (const [x, y] of marks) t.push(`\\fill[idealc] (${x},${y}) circle[radius=0.15];`);
  t.push("\\end{tikzpicture}");
  fs.writeFileSync(path.join(out, name + ".tex"), t.join("\n") + "\n");
  console.log("fig/" + name + ".tex");
}

function pixels(fn, ...args) {
  const map = new Map();
  fn(...args, (x, y, c) => {
    const k = x + "," + y;
    if (!map.has(k) || (c ?? 1) > (map.get(k).c ?? 1)) map.set(k, { x, y, c });
  });
  return [...map.values()];
}

const line = [1, 1, 8, 4];
figure("line", {
  xmin: 0, xmax: 9, ymin: 0, ymax: 5,
  pixels: pixels(R.bresenham, ...line),
  ideal: "(1,1) -- (8,4)",
  marks: [[1, 1], [8, 4]],
});
figure("wu", {
  xmin: 0, xmax: 9, ymin: 0, ymax: 5,
  pixels: pixels(R.wu, ...line),
  ideal: "(1,1) -- (8,4)",
  labels: true,
});
figure("circle", {
  xmin: -6, xmax: 6, ymin: -6, ymax: 6,
  pixels: pixels(R.bresenhamCircle, 0, 0, 5),
  ideal: "(0,0) circle[radius=5]",
  marks: [[0, 0]],
  unit: 0.42,
  tick: 2,
});
