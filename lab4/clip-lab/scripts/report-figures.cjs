"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { liangBarsky, cyrusBeck } = require("../dist/clipping.js");

const figDir = path.resolve(__dirname, "../../report/fig");
fs.mkdirSync(figDir, { recursive: true });

function f(x) {
  return Number(x.toFixed(3));
}

// 1. Рисунок для Лианга — Барски
{
  const rect = { xmin: 1, ymin: 2, xmax: 7, ymax: 6 };
  const segs = [
    { x1: -2, y1: 1, x2: 10, y2: 7, tag: "P_0", tag2: "P_1" },
    { x1: 2, y1: 3, x2: 5, y2: 5 },
    { x1: 4, y1: 0, x2: 9, y2: 4 },
    { x1: 0, y1: 7, x2: 8, y2: 7 },
    { x1: 7.5, y1: 1, x2: 10, y2: 5 },
  ];

  const lines = [
    "\\begin{tikzpicture}[scale=0.48]",
    "  \\draw[step=1,gridc!55,very thin] (-2.5,-0.5) grid (10.5,7.5);",
    "  \\draw[->,black!60] (-2.5,0) -- (10.7,0) node[right]{\\scriptsize $x$};",
    "  \\draw[->,black!60] (0,-0.5) -- (0,7.7) node[above]{\\scriptsize $y$};",
    `  \\fill[winc,opacity=0.10] (${rect.xmin},${rect.ymin}) rectangle (${rect.xmax},${rect.ymax});`,
    `  \\draw[winc,thick] (${rect.xmin},${rect.ymin}) rectangle (${rect.xmax},${rect.ymax});`,
  ];

  for (const s of segs) {
    const res = liangBarsky(s, rect);
    const origColor = res.visible ? "origc" : "rejc";
    lines.push(
      `  \\draw[${origColor},dashed,thick] (${s.x1},${s.y1}) -- (${s.x2},${s.y2});`,
    );
    if (res.visible && res.clipped) {
      const c = res.clipped;
      lines.push(
        `  \\draw[visc,ultra thick] (${f(c.x1)},${f(c.y1)}) -- (${f(c.x2)},${f(c.y2)});`,
        `  \\fill[visc] (${f(c.x1)},${f(c.y1)}) circle (3.2pt);`,
        `  \\fill[visc] (${f(c.x2)},${f(c.y2)}) circle (3.2pt);`,
      );
    }
    if (s.tag) {
      lines.push(
        `  \\fill[black!70] (${s.x1},${s.y1}) circle (2.5pt) node[below left]{\\scriptsize $${s.tag}$};`,
        `  \\fill[black!70] (${s.x2},${s.y2}) circle (2.5pt) node[above right]{\\scriptsize $${s.tag2}$};`,
      );
    }
  }
  lines.push("\\end{tikzpicture}");
  fs.writeFileSync(path.join(figDir, "liang_barsky.tex"), lines.join("\n") + "\n");
}

// 2. Рисунок для Кируса — Бека (выпуклый пятиугольник)
{
  const poly = [
    { x: 1, y: 1 },
    { x: 6, y: 1 },
    { x: 8, y: 4 },
    { x: 5, y: 7 },
    { x: 1, y: 5 },
  ];
  const segs = [
    { x1: -1, y1: 1, x2: 9, y2: 6, tag: "P_0", tag2: "P_1" },
    { x1: 2, y1: 2, x2: 5, y2: 5 },
    { x1: 0, y1: 6.5, x2: 8, y2: 6.5 },
    { x1: 3, y1: 0, x2: 8, y2: 2 },
  ];

  const polyPath = poly.map((p) => `(${p.x},${p.y})`).join(" -- ") + " -- cycle";
  const lines = [
    "\\begin{tikzpicture}[scale=0.48]",
    "  \\draw[step=1,gridc!55,very thin] (-1.5,-0.5) grid (9.5,7.5);",
    "  \\draw[->,black!60] (-1.5,0) -- (9.7,0) node[right]{\\scriptsize $x$};",
    "  \\draw[->,black!60] (0,-0.5) -- (0,7.7) node[above]{\\scriptsize $y$};",
    `  \\fill[winc,opacity=0.10] ${polyPath};`,
    `  \\draw[winc,thick] ${polyPath};`,
  ];

  // Внутренние нормали на серединах рёбер
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const len = Math.hypot(ex, ey);
    const nx = (-ey / len) * 0.75;
    const ny = (ex / len) * 0.75;
    lines.push(
      `  \\draw[->,winc!80,thin] (${f(mx)},${f(my)}) -- (${f(mx + nx)},${f(my + ny)});`,
    );
  }

  for (const s of segs) {
    const res = cyrusBeck(s, poly);
    const origColor = res.visible ? "origc" : "rejc";
    lines.push(
      `  \\draw[${origColor},dashed,thick] (${s.x1},${s.y1}) -- (${s.x2},${s.y2});`,
    );
    if (res.visible && res.clipped) {
      const c = res.clipped;
      lines.push(
        `  \\draw[visc,ultra thick] (${f(c.x1)},${f(c.y1)}) -- (${f(c.x2)},${f(c.y2)});`,
        `  \\fill[visc] (${f(c.x1)},${f(c.y1)}) circle (3.2pt);`,
        `  \\fill[visc] (${f(c.x2)},${f(c.y2)}) circle (3.2pt);`,
      );
    }
    if (s.tag) {
      lines.push(
        `  \\fill[black!70] (${s.x1},${s.y1}) circle (2.5pt) node[below left]{\\scriptsize $${s.tag}$};`,
        `  \\fill[black!70] (${s.x2},${s.y2}) circle (2.5pt) node[above right]{\\scriptsize $${s.tag2}$};`,
      );
    }
  }
  lines.push("\\end{tikzpicture}");
  fs.writeFileSync(path.join(figDir, "cyrus_beck.tex"), lines.join("\n") + "\n");
}

console.log("Figures written to", figDir);
