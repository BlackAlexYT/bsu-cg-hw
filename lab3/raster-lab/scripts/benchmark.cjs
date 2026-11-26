"use strict";
// Замер времени алгоритмов для отчёта: тот же R.benchmark, что и в
// интерфейсе, на фигурах трёх размеров. Запуск: node scripts/benchmark.cjs
const os = require("node:os");
const R = require("../dist/raster.js");

const NAMES = {
  step: "Пошаговый",
  dda: "ЦДА",
  bresenham: "Брезенхем (отрезок)",
  castle: "Кастл — Питвей",
  wu: "Ву (сглаживание)",
  circle: "Брезенхем (окружность)",
};
console.log(`${os.cpus()[0].model}, Node.js ${process.version}`);
for (const maxCoord of [10, 100, 1000]) {
  const res = R.benchmark({ count: 20000, maxCoord, runs: 15 });
  console.log(`\nКоординаты в квадрате ±${maxCoord}`);
  console.log("Алгоритм".padEnd(24) + "пикселей".padStart(10) + "мкс/фигуру".padStart(12) + "нс/пиксель".padStart(12));
  for (const r of res)
    console.log(
      NAMES[r.key].padEnd(24) +
        String(r.pixels).padStart(10) +
        r.usPerFigure.toFixed(3).padStart(12) +
        r.nsPerPixel.toFixed(2).padStart(12),
    );
}
