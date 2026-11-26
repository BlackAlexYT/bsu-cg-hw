(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Raster = api;
})(globalThis, function () {
  "use strict";

  // Пиксель (x, y) — клетка 1×1 с центром в целой точке (x, y); её границы —
  // прямые x ± 0.5 и y ± 0.5. Все алгоритмы получают целые координаты и
  // вызывают plot(x, y) (у Ву — plot(x, y, яркость)) для каждого пикселя.
  // Необязательный массив trace заполняется промежуточными вычислениями —
  // по ним интерфейс строит таблицу шагов. Возвращаемый объект — параметры
  // алгоритма (k, b, приращения и т. п.) для пояснений.

  // Округление к ближайшему, половина — вверх: 2.5 → 3, −2.5 → −2.
  const round = (v) => Math.floor(v + 0.5);

  // ---------- Пошаговый алгоритм ----------
  // y = kx + b; шаг по оси, вдоль которой отрезок длиннее, вторая
  // координата вычисляется по уравнению прямой и округляется.
  function stepByStep(x0, y0, x1, y1, plot, trace) {
    const dx = x1 - x0,
      dy = y1 - y0;
    if (dx === 0 && dy === 0) {
      plot(x0, y0);
      if (trace) trace.push({ i: 0, x: x0, y: y0, px: x0, py: y0 });
      return { steep: false, k: 0, b: y0 };
    }
    const steep = Math.abs(dy) > Math.abs(dx);
    // Для крутого отрезка уравнение x = y/k − b/k; храним k и b как у прямой y = kx + b.
    const k = dx === 0 ? Infinity : dy / dx,
      b = dx === 0 ? NaN : y0 - k * x0;
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= n; i++) {
      let x, y;
      // Вместо kx + b считаем y0 + Δy·(x − x0)/Δx: значение то же, но
      // частное двух целых не несёт ошибки вычисления b.
      if (steep) {
        y = y0 + Math.sign(dy) * i;
        x = x0 + (dx * (y - y0)) / dy;
      } else {
        x = x0 + Math.sign(dx) * i;
        y = y0 + (dy * (x - x0)) / dx;
      }
      const px = round(x),
        py = round(y);
      plot(px, py);
      if (trace) trace.push({ i, x, y, px, py });
    }
    return { steep, k, b };
  }

  // ---------- ЦДА ----------
  // L = max(|Δx|, |Δy|) шагов; на каждом к x и y прибавляются Δx/L и Δy/L.
  function dda(x0, y0, x1, y1, plot, trace) {
    const dx = x1 - x0,
      dy = y1 - y0;
    const L = Math.max(Math.abs(dx), Math.abs(dy));
    const xInc = L ? dx / L : 0,
      yInc = L ? dy / L : 0;
    let x = x0,
      y = y0;
    for (let i = 0; i <= L; i++) {
      const px = round(x),
        py = round(y);
      plot(px, py);
      if (trace) trace.push({ i, x, y, px, py });
      x += xInc;
      y += yInc;
    }
    return { L, xInc, yInc };
  }

  // ---------- Брезенхем, отрезок ----------
  // Только целые числа. Вдоль главной оси шаг всегда, вдоль второй — когда
  // ошибка e = 2Δx·(y_точн − y − 0.5) неотрицательна (прямая выше середины
  // между двумя пикселями-кандидатами).
  function bresenham(x0, y0, x1, y1, plot, trace) {
    let dx = Math.abs(x1 - x0),
      dy = Math.abs(y1 - y0);
    const sx = Math.sign(x1 - x0),
      sy = Math.sign(y1 - y0);
    const steep = dy > dx;
    if (steep) [dx, dy] = [dy, dx];
    let e = 2 * dy - dx;
    const e0 = e;
    let x = x0,
      y = y0;
    for (let i = 0; i <= dx; i++) {
      plot(x, y);
      if (i === dx) {
        if (trace) trace.push({ i, x, y, e: null });
        break;
      }
      const px = x,
        py = y,
        eBefore = e,
        minor = e >= 0;
      if (minor) {
        if (steep) x += sx;
        else y += sy;
        e -= 2 * dx;
      }
      if (steep) y += sy;
      else x += sx;
      e += 2 * dy;
      if (trace) trace.push({ i, x: px, y: py, e: eBefore, minor, eNext: e });
    }
    return { steep, dx, dy, sx, sy, e0 };
  }

  // ---------- Брезенхем, окружность ----------
  // Строится четверть от (0, R) до (R, 0), остальное — симметрией (±x, ±y).
  // Δ = (x+1)² + (y−1)² − R² — ошибка диагонального пикселя. Ходы:
  // H (x+1), D (x+1, y−1), V (y−1).
  function bresenhamCircle(xc, yc, r, plot, trace) {
    if (r <= 0) {
      plot(xc, yc);
      if (trace) trace.push({ i: 0, x: 0, y: 0, delta: null, d: null, move: "" });
      return { r: 0, delta0: 0 };
    }
    let x = 0,
      y = r,
      delta = 2 * (1 - r);
    const delta0 = delta;
    for (let i = 0; ; i++) {
      // Точки на осях отражаются в себя — их не рисуем дважды.
      plot(xc + x, yc + y);
      if (x) plot(xc - x, yc + y);
      if (y) plot(xc + x, yc - y);
      if (x && y) plot(xc - x, yc - y);
      if (y <= 0) {
        if (trace) trace.push({ i, x, y, delta, d: null, move: "" });
        break;
      }
      let move, d = null;
      if (delta < 0) {
        d = 2 * delta + 2 * y - 1; // δ: сравнение H и D
        move = d <= 0 ? "H" : "D";
      } else if (delta > 0) {
        d = 2 * delta - 2 * x - 1; // δ': сравнение D и V
        move = d <= 0 ? "D" : "V";
      } else move = "D";
      if (trace) trace.push({ i, x, y, delta, d, kind: delta < 0 ? "δ" : delta > 0 ? "δ'" : "", move });
      if (move === "H") {
        x++;
        delta += 2 * x + 1;
      } else if (move === "D") {
        x++;
        y--;
        delta += 2 * x - 2 * y + 2;
      } else {
        y--;
        delta += -2 * y + 1;
      }
    }
    return { r, delta0 };
  }

  // ---------- Кастл — Питвей ----------
  // Для 0 ≤ b ≤ a строится строка ходов длины a: s — шаг по главной оси,
  // d — диагональный. Ходов d ровно b. Порядок находится как в алгоритме
  // Евклида на паре (a − b, b).
  const reverse = (s) => s.split("").reverse().join("");

  function castleMoves(a, b, trace) {
    if (b === 0) return "s".repeat(a);
    if (b === a) return "d".repeat(a);
    let x = a - b,
      y = b,
      m1 = "s",
      m2 = "d";
    if (trace) trace.push({ x, y, m1, m2, op: "начало" });
    while (x !== y) {
      if (x > y) {
        x -= y;
        m2 = m1 + reverse(m2);
        if (trace) trace.push({ x, y, m1, m2, op: "x > y: x −= y, m2 = m1 + m2ᴿ" });
      } else {
        y -= x;
        m1 = m2 + reverse(m1);
        if (trace) trace.push({ x, y, m1, m2, op: "x < y: y −= x, m1 = m2 + m1ᴿ" });
      }
    }
    return (m2 + reverse(m1)).repeat(x);
  }

  function castlePitteway(x0, y0, x1, y1, plot, trace) {
    const sx = Math.sign(x1 - x0),
      sy = Math.sign(y1 - y0);
    const adx = Math.abs(x1 - x0),
      ady = Math.abs(y1 - y0);
    const steep = ady > adx;
    const a = steep ? ady : adx,
      b = steep ? adx : ady;
    const moves = castleMoves(a, b, trace);
    let x = x0,
      y = y0;
    plot(x, y);
    for (const m of moves) {
      if (steep) {
        y += sy;
        if (m === "d") x += sx;
      } else {
        x += sx;
        if (m === "d") y += sy;
      }
      plot(x, y);
    }
    return { steep, a, b, moves };
  }

  // ---------- Сглаженная линия, алгоритм Ву ----------
  // На каждом шаге по главной оси закрашиваются два соседних пикселя
  // поперёк неё; яркость каждого — 1 минус расстояние от его центра до
  // идеальной прямой (вдоль второй оси).
  function wu(x0, y0, x1, y1, plot, trace) {
    const steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
    // В «пологих» координатах (u — главная ось, v — вторая).
    let u0 = steep ? y0 : x0,
      v0 = steep ? x0 : y0,
      u1 = steep ? y1 : x1,
      v1 = steep ? x1 : y1;
    if (u0 > u1) [u0, v0, u1, v1] = [u1, v1, u0, v0];
    const du = u1 - u0,
      dv = v1 - v0;
    const gradient = du === 0 ? 0 : dv / du;
    const put = (u, v, c) => (steep ? plot(v, u, c) : plot(u, v, c));
    for (let u = u0; u <= u1; u++) {
      const v = du ? v0 + (dv * (u - u0)) / du : v0;
      const vi = Math.floor(v),
        f = v - vi;
      put(u, vi, 1 - f);
      if (f > 0) put(u, vi + 1, f);
      if (trace) trace.push({ u, v, vi, f, steep });
    }
    return { steep, gradient };
  }

  const LINES = { step: stepByStep, dda, bresenham, castle: castlePitteway, wu };

  // ---------- Замер времени ----------
  // Генератор псевдослучайных чисел (mulberry32): одинаковые наборы
  // отрезков в браузере и в Node.js.
  function rng(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Для каждого алгоритма — лучшее из runs прогонов по одному и тому же
  // набору фигур. plot только суммирует координаты, чтобы JIT не выкинул
  // вычисления, и стоит для всех алгоритмов одинаково.
  function benchmark(opts = {}) {
    const count = opts.count || 20000,
      maxCoord = opts.maxCoord || 500,
      runs = opts.runs || 7,
      now = opts.now || (() => performance.now());
    const random = rng(opts.seed || 12345);
    const int = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1));
    const segs = new Int32Array(count * 4);
    for (let i = 0; i < segs.length; i++) segs[i] = int(-maxCoord, maxCoord);
    const circles = new Int32Array(count * 3);
    for (let i = 0; i < count; i++) {
      circles[3 * i] = int(-maxCoord, maxCoord);
      circles[3 * i + 1] = int(-maxCoord, maxCoord);
      circles[3 * i + 2] = int(1, maxCoord);
    }
    let sink = 0,
      pixels = 0;
    const plot = (x, y) => {
      sink = (sink + x + y) | 0;
      pixels++;
    };
    const tasks = [
      ["step", () => { for (let i = 0; i < count; i++) stepByStep(segs[4 * i], segs[4 * i + 1], segs[4 * i + 2], segs[4 * i + 3], plot); }],
      ["dda", () => { for (let i = 0; i < count; i++) dda(segs[4 * i], segs[4 * i + 1], segs[4 * i + 2], segs[4 * i + 3], plot); }],
      ["bresenham", () => { for (let i = 0; i < count; i++) bresenham(segs[4 * i], segs[4 * i + 1], segs[4 * i + 2], segs[4 * i + 3], plot); }],
      ["castle", () => { for (let i = 0; i < count; i++) castlePitteway(segs[4 * i], segs[4 * i + 1], segs[4 * i + 2], segs[4 * i + 3], plot); }],
      ["wu", () => { for (let i = 0; i < count; i++) wu(segs[4 * i], segs[4 * i + 1], segs[4 * i + 2], segs[4 * i + 3], plot); }],
      ["circle", () => { for (let i = 0; i < count; i++) bresenhamCircle(circles[3 * i], circles[3 * i + 1], circles[3 * i + 2], plot); }],
    ];
    const result = [];
    for (const [key, run] of tasks) {
      run(); // прогрев JIT
      let best = Infinity;
      for (let r = 0; r < runs; r++) {
        pixels = 0;
        const t = now();
        run();
        best = Math.min(best, now() - t);
      }
      result.push({ key, ms: best, figures: count, pixels, usPerFigure: (best * 1000) / count, nsPerPixel: (best * 1e6) / pixels });
    }
    result.sink = sink;
    return result;
  }

  return { round, stepByStep, dda, bresenham, bresenhamCircle, castleMoves, castlePitteway, wu, LINES, rng, benchmark };
});
