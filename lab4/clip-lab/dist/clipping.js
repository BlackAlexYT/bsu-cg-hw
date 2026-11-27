(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ClipLab = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EPS = 1e-9;

  function normalizeRect(rect) {
    const xmin = Math.min(rect.xmin, rect.xmax);
    const xmax = Math.max(rect.xmin, rect.xmax);
    const ymin = Math.min(rect.ymin, rect.ymax);
    const ymax = Math.max(rect.ymin, rect.ymax);
    return { xmin, ymin, xmax, ymax };
  }

  /**
   * Алгоритм Лианга — Барски (параметрическое отсечение отрезка прямоугольным окном).
   * Возвращает видимый отрезок (или null), параметры t0, t1 и таблицу шагов по 4 границам.
   */
  function liangBarsky(seg, rawRect) {
    const rect = normalizeRect(rawRect);
    const x0 = seg.x1;
    const y0 = seg.y1;
    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;

    const bounds = [
      { name: "Левая (x ≥ xmin)", p: -dx, q: x0 - rect.xmin },
      { name: "Правая (x ≤ xmax)", p: dx, q: rect.xmax - x0 },
      { name: "Нижняя (y ≥ ymin)", p: -dy, q: y0 - rect.ymin },
      { name: "Верхняя (y ≤ ymax)", p: dy, q: rect.ymax - y0 },
    ];

    let t0 = 0;
    let t1 = 1;
    let rejected = false;
    let rejectReason = "";
    const steps = [];

    for (let i = 0; i < bounds.length; i++) {
      const { name, p, q } = bounds[i];
      let role = "parallel";
      let r = null;
      let action = "";

      if (Math.abs(p) <= EPS) {
        if (q < -EPS) {
          rejected = true;
          rejectReason = `${name}: параллелен и вне окна (q < 0)`;
          action = "Отвергнут (q < 0)";
        } else {
          action = "Пропуск (q ≥ 0)";
        }
      } else {
        r = q / p;
        if (p < 0) {
          role = "enter";
          if (r > t0) {
            t0 = r;
            action = `t0 = ${r.toFixed(4)}`;
          } else {
            action = `t0 без изм. (${t0.toFixed(4)})`;
          }
        } else {
          role = "leave";
          if (r < t1) {
            t1 = r;
            action = `t1 = ${r.toFixed(4)}`;
          } else {
            action = `t1 без изм. (${t1.toFixed(4)})`;
          }
        }
      }

      steps.push({ index: i + 1, name, p, q, r, role, action, t0, t1 });
      if (rejected) break;
    }

    if (!rejected && t0 > t1 + EPS) {
      rejected = true;
      rejectReason = `t0 (${t0.toFixed(4)}) > t1 (${t1.toFixed(4)})`;
    }

    if (rejected) {
      return {
        visible: false,
        t0,
        t1,
        clipped: null,
        steps,
        reason: rejectReason,
      };
    }

    const ct0 = Math.max(0, Math.min(1, t0));
    const ct1 = Math.max(0, Math.min(1, t1));
    return {
      visible: true,
      t0: ct0,
      t1: ct1,
      clipped: {
        x1: x0 + ct0 * dx,
        y1: y0 + ct0 * dy,
        x2: x0 + ct1 * dx,
        y2: y0 + ct1 * dy,
      },
      steps,
      reason: "Принят",
    };
  }

  function polygonSignedArea(vertices) {
    let sum = 0;
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % vertices.length];
      sum += a.x * b.y - b.x * a.y;
    }
    return 0.5 * sum;
  }

  /**
   * Проверка многоугольника на невырожденность и выпуклость.
   * Возвращает { valid, convex, area, orientation, reason }.
   */
  function analyzePolygon(vertices) {
    if (!Array.isArray(vertices) || vertices.length < 3) {
      return { valid: false, convex: false, area: 0, orientation: 0, reason: "Нужно минимум 3 вершины" };
    }
    const area = polygonSignedArea(vertices);
    if (Math.abs(area) <= EPS) {
      return { valid: false, convex: false, area: 0, orientation: 0, reason: "Вырожденный многоугольник (площадь ≈ 0)" };
    }

    let sign = 0;
    const n = vertices.length;
    for (let i = 0; i < n; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const c = vertices[(i + 2) % n];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(cross) > EPS) {
        const s = cross > 0 ? 1 : -1;
        if (sign === 0) sign = s;
        else if (sign !== s) {
          return {
            valid: true,
            convex: false,
            area,
            orientation: area > 0 ? 1 : -1,
            reason: "Многоугольник невыпуклый",
          };
        }
      }
    }

    if (sign === 0) {
      return { valid: false, convex: false, area: 0, orientation: 0, reason: "Все вершины коллинеарны" };
    }

    return {
      valid: true,
      convex: true,
      area,
      orientation: area > 0 ? 1 : -1,
      reason: area > 0 ? "Выпуклый (CCW)" : "Выпуклый (CW)",
    };
  }

  /**
   * Внутренние нормали к рёбрам выпуклого многоугольника.
   * Для CCW (orientation > 0) внутренняя нормаль к (ex, ey) равна (-ey, ex);
   * для CW (orientation < 0) равна (ey, -ex).
   */
  function computeInwardNormals(vertices, orientation) {
    const n = vertices.length;
    const edges = [];
    for (let i = 0; i < n; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % n];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      const nx = orientation > 0 ? -ey : ey;
      const ny = orientation > 0 ? ex : -ex;
      edges.push({ index: i + 1, a, b, nx, ny });
    }
    return edges;
  }

  /**
   * Алгоритм Кируса — Бека (отсечение отрезка выпуклым многоугольником).
   */
  function cyrusBeck(seg, vertices) {
    const info = analyzePolygon(vertices);
    if (!info.valid || !info.convex) {
      return {
        visible: false,
        t0: 0,
        t1: 0,
        clipped: null,
        steps: [],
        reason: info.reason,
        invalidPolygon: true,
      };
    }

    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const edges = computeInwardNormals(vertices, info.orientation);

    let t0 = 0;
    let t1 = 1;
    let rejected = false;
    let rejectReason = "";
    const steps = [];

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const wx = seg.x1 - e.a.x;
      const wy = seg.y1 - e.a.y;
      const d = e.nx * dx + e.ny * dy;
      const w = e.nx * wx + e.ny * wy;

      let role = "parallel";
      let tHit = null;
      let action = "";

      if (Math.abs(d) <= EPS) {
        if (w < -EPS) {
          rejected = true;
          rejectReason = `Ребро ${e.index}: параллелен и снаружи (w < 0)`;
          action = "Отвергнут (w < 0)";
        } else {
          action = "Пропуск (w ≥ 0)";
        }
      } else {
        tHit = -w / d;
        if (d > 0) {
          role = "enter";
          if (tHit > t0) {
            t0 = tHit;
            action = `t0 = ${tHit.toFixed(4)}`;
          } else {
            action = `t0 без изм. (${t0.toFixed(4)})`;
          }
        } else {
          role = "leave";
          if (tHit < t1) {
            t1 = tHit;
            action = `t1 = ${tHit.toFixed(4)}`;
          } else {
            action = `t1 без изм. (${t1.toFixed(4)})`;
          }
        }
      }

      steps.push({
        index: e.index,
        nx: e.nx,
        ny: e.ny,
        w,
        d,
        t: tHit,
        role,
        action,
        t0,
        t1,
      });

      if (rejected) break;
    }

    if (!rejected && t0 > t1 + EPS) {
      rejected = true;
      rejectReason = `t0 (${t0.toFixed(4)}) > t1 (${t1.toFixed(4)})`;
    }

    if (rejected) {
      return {
        visible: false,
        t0,
        t1,
        clipped: null,
        steps,
        reason: rejectReason,
      };
    }

    const ct0 = Math.max(0, Math.min(1, t0));
    const ct1 = Math.max(0, Math.min(1, t1));
    return {
      visible: true,
      t0: ct0,
      t1: ct1,
      clipped: {
        x1: seg.x1 + ct0 * dx,
        y1: seg.y1 + ct0 * dy,
        x2: seg.x1 + ct1 * dx,
        y2: seg.y1 + ct1 * dy,
      },
      steps,
      reason: "Принят",
    };
  }

  /**
   * Парсер входного файла формата задания:
   * n
   * x1 y1 x2 y2  (n строк)
   * xmin ymin xmax ymax  (для прямоугольника)
   * ИЛИ для многоугольника:
   * m
   * vx1 vy1 ... vxm vym  (или пары в последней части)
   */
  function parseInputText(text, mode) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/#.*$/, "").trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      throw new Error("Слишком мало строк во входных данных.");
    }

    const nums = (line) => {
      const arr = line.split(/[\s,;]+/).map(Number);
      if (arr.some((v) => !Number.isFinite(v))) {
        throw new Error(`Некорректное число в строке: "${line}"`);
      }
      return arr;
    };

    const first = nums(lines[0]);
    if (first.length !== 1 || !Number.isInteger(first[0]) || first[0] < 0) {
      throw new Error("Первая строка должна содержать целое число отрезков n ≥ 0.");
    }
    const n = first[0];
    if (lines.length < 1 + n + 1) {
      throw new Error(`Ожидалось минимум ${1 + n + 1} непустых строк, получено ${lines.length}.`);
    }

    const segments = [];
    for (let i = 1; i <= n; i++) {
      const c = nums(lines[i]);
      if (c.length !== 4) {
        throw new Error(`Строка ${i + 1}: ожидались 4 координаты (x1 y1 x2 y2).`);
      }
      segments.push({ x1: c[0], y1: c[1], x2: c[2], y2: c[3] });
    }

    if (mode === "liang-barsky") {
      const w = nums(lines[1 + n]);
      if (w.length !== 4) {
        throw new Error("Последняя строка для окна должна содержать 4 числа: xmin ymin xmax ymax.");
      }
      return {
        segments,
        rect: normalizeRect({ xmin: w[0], ymin: w[1], xmax: w[2], ymax: w[3] }),
      };
    }

    // Режим выпуклого многоугольника: допускаем либо m на отдельной строке + m вершин,
    // либо сразу вершины (по 2 числа в строке, или все подряд).
    const restLines = lines.slice(1 + n);
    let vertices = [];
    const restFirst = nums(restLines[0]);
    if (restFirst.length === 1 && Number.isInteger(restFirst[0]) && restFirst[0] >= 3) {
      const m = restFirst[0];
      const flat = [];
      for (let i = 1; i < restLines.length; i++) flat.push(...nums(restLines[i]));
      if (flat.length < 2 * m) {
        throw new Error(`Ожидалось ${m} вершин (${2 * m} чисел), получено ${flat.length}.`);
      }
      for (let i = 0; i < 2 * m; i += 2) {
        vertices.push({ x: flat[i], y: flat[i + 1] });
      }
    } else {
      const flat = [];
      for (const l of restLines) flat.push(...nums(l));
      if (flat.length < 6 || flat.length % 2 !== 0) {
        throw new Error("Для многоугольника требуется чётное число координат (минимум 3 вершины).");
      }
      for (let i = 0; i < flat.length; i += 2) {
        vertices.push({ x: flat[i], y: flat[i + 1] });
      }
    }

    return { segments, polygon: vertices };
  }

  return {
    EPS,
    normalizeRect,
    liangBarsky,
    polygonSignedArea,
    analyzePolygon,
    computeInwardNormals,
    cyrusBeck,
    parseInputText,
  };
});
