(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Imaging = api;
})(globalThis, function () {
  "use strict";

  // Изображение в полутонах: { width, height, data }, data — яркости 0..255
  // построчно. Результаты бинаризации — Uint8Array из 0 и 255.

  // Продолжение за границу зеркально без повтора крайнего пикселя:
  // ...d c b | a b c d | c b a... (BORDER_REFLECT_101 в OpenCV).
  function reflect(i, n) {
    if (n === 1) return 0;
    const period = 2 * n - 2;
    i = ((i % period) + period) % period;
    return i < n ? i : period - i;
  }

  function image(width, height, data) {
    return { width, height, data: data || new Float64Array(width * height) };
  }

  // Яркость по ITU-R BT.601, округлённая до целого, как в 8-битном изображении.
  function fromRGBA(rgba, width, height) {
    const data = new Float64Array(width * height);
    for (let i = 0, j = 0; i < data.length; i++, j += 4)
      data[i] = Math.round(0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]);
    return image(width, height, data);
  }

  // ---------- Свёртка ----------

  // Корреляция с ядром kw×kh (как cv2.filter2D), центр ядра — (kw>>1, kh>>1).
  function correlate(img, kernel, kw, kh = kw) {
    const { width: w, height: h, data } = img;
    const out = new Float64Array(w * h);
    const cx = kw >> 1,
      cy = kh >> 1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let j = 0; j < kh; j++) {
          const row = reflect(y + j - cy, h) * w;
          for (let i = 0; i < kw; i++) sum += kernel[j * kw + i] * data[row + reflect(x + i - cx, w)];
        }
        out[y * w + x] = sum;
      }
    return image(w, h, out);
  }

  function gaussianKernel(sigma) {
    const r = Math.ceil(3 * sigma);
    const k = [];
    let sum = 0;
    for (let i = -r; i <= r; i++) {
      const v = Math.exp(-(i * i) / (2 * sigma * sigma));
      k.push(v);
      sum += v;
    }
    return k.map((v) => v / sum);
  }

  // Гауссово сглаживание: ядро 2·⌈3σ⌉+1, разделяется на проход по строкам и по столбцам.
  function gaussianBlur(img, sigma) {
    if (!(sigma > 0)) return image(img.width, img.height, Float64Array.from(img.data));
    const k = gaussianKernel(sigma);
    return correlate(correlate(img, k, k.length, 1), k, 1, k.length);
  }

  // ---------- Пороговая обработка ----------

  // Локальные среднее и СКО в окне size×size через интегральные изображения.
  // СКО — по всей совокупности окна (делим на n, а не n−1).
  function localMeanStd(img, size) {
    const { width: w, height: h, data } = img;
    const r = size >> 1,
      pw = w + 2 * r,
      ph = h + 2 * r,
      sw = pw + 1;
    const S = new Float64Array(sw * (ph + 1)),
      Q = new Float64Array(sw * (ph + 1));
    for (let y = 0; y < ph; y++) {
      const row = reflect(y - r, h) * w;
      let s = 0,
        q = 0;
      for (let x = 0; x < pw; x++) {
        const v = data[row + reflect(x - r, w)];
        s += v;
        q += v * v;
        S[(y + 1) * sw + x + 1] = S[y * sw + x + 1] + s;
        Q[(y + 1) * sw + x + 1] = Q[y * sw + x + 1] + q;
      }
    }
    const n = size * size;
    const mean = new Float64Array(w * h),
      std = new Float64Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const a = y * sw + x,
          b = a + size,
          c = (y + size) * sw + x,
          d = c + size;
        const m = (S[d] - S[b] - S[c] + S[a]) / n;
        const v = (Q[d] - Q[b] - Q[c] + Q[a]) / n - m * m;
        mean[y * w + x] = m;
        std[y * w + x] = Math.sqrt(Math.max(v, 0));
      }
    return { mean, std };
  }

  // Ниблэк: T = m + k·s, обычно k = −0.2.
  function niblackThreshold(img, size = 25, k = -0.2) {
    const { mean, std } = localMeanStd(img, size);
    return mean.map((m, i) => m + k * std[i]);
  }

  // Саувола: T = m·(1 + k·(s/R − 1)), обычно k = 0.2…0.5, R = 128.
  function sauvolaThreshold(img, size = 25, k = 0.2, R = 128) {
    const { mean, std } = localMeanStd(img, size);
    return mean.map((m, i) => m * (1 + k * (std[i] / R - 1)));
  }

  // Пиксели ярче порога → 255 (фон), остальные → 0 (объект, например текст).
  function binarize(img, threshold) {
    const out = new Uint8Array(img.data.length);
    for (let i = 0; i < out.length; i++) out[i] = img.data[i] > threshold[i] ? 255 : 0;
    return out;
  }

  // ---------- Сегментация ----------

  const MASKS = {
    point: [-1, -1, -1, -1, 8, -1, -1, -1, -1],
    lineH: [-1, -1, -1, 2, 2, 2, -1, -1, -1],
    lineP45: [-1, -1, 2, -1, 2, -1, 2, -1, -1],
    lineV: [-1, 2, -1, -1, 2, -1, -1, 2, -1],
    lineM45: [2, -1, -1, -1, 2, -1, -1, -1, 2],
    // Лапласиан гауссиана 5×5 из лекции (знак: положительный центр).
    log5: [0, 0, -1, 0, 0, 0, -1, -2, -1, 0, -1, -2, 16, -2, -1, 0, -1, -2, -1, 0, 0, 0, -1, 0, 0],
  };

  function maxOf(arr) {
    let m = 0;
    for (const v of arr) if (v > m) m = v;
    return m;
  }

  // Порог задаётся долей от максимального отклика: T = frac·max.
  function thresholdResponse(response, frac) {
    const T = frac * maxOf(response);
    const mask = new Uint8Array(response.length);
    for (let i = 0; i < mask.length; i++) mask[i] = response[i] > 0 && response[i] >= T ? 255 : 0;
    return { response, mask, T };
  }

  // Изолированные точки: R — отклик лапласовской маски, точка там, где |R| ≥ T.
  function detectPoints(img, frac = 0.6) {
    const R = correlate(img, MASKS.point, 3).data;
    return thresholdResponse(R.map(Math.abs), frac);
  }

  const LINE_DIRECTIONS = { h: "lineH", p45: "lineP45", v: "lineV", m45: "lineM45" };

  // Линии толщиной в один пиксель. direction: h, p45, v, m45 или all
  // (максимум по четырём маскам). bright = false ищет тёмные линии на светлом фоне.
  function detectLines(img, direction = "all", frac = 0.55, bright = true) {
    const keys = direction === "all" ? Object.keys(LINE_DIRECTIONS) : [direction];
    const sign = bright ? 1 : -1;
    const R = new Float64Array(img.data.length).fill(-Infinity);
    for (const key of keys) {
      const r = correlate(img, MASKS[LINE_DIRECTIONS[key]], 3).data;
      for (let i = 0; i < R.length; i++) R[i] = Math.max(R[i], sign * r[i]);
    }
    return thresholdResponse(R, frac);
  }

  // Градиент по разностям из лекции: Gx = f(x+1, y) − f(x, y), Gy = f(x, y+1) − f(x, y).
  // Вместо √(Gx² + Gy²) для простоты вычислений берётся |Gx| + |Gy|.
  function gradient(img) {
    const { width: w, height: h, data } = img;
    const out = new Float64Array(w * h);
    for (let y = 0; y < h; y++) {
      const y1 = reflect(y + 1, h);
      for (let x = 0; x < w; x++) {
        const f = data[y * w + x];
        out[y * w + x] = Math.abs(data[y * w + reflect(x + 1, w)] - f) + Math.abs(data[y1 * w + x] - f);
      }
    }
    return out;
  }

  // Перепады яркости по градиенту: граница там, где |Gx| + |Gy| ≥ T = frac·max.
  function detectEdges(img, frac = 0.25) {
    return thresholdResponse(gradient(img), frac);
  }

  // Перепады по лапласиану гауссиана (маска 5×5 из лекции). На перепаде
  // отклик меняет знак: граница — переход через ноль, у которого разность
  // противоположных соседей больше T = frac·max|LoG|.
  function detectLogEdges(img, frac = 0.1) {
    const { width: w, height: h } = img;
    const L = correlate(img, MASKS.log5, 5).data;
    const T = frac * maxOf(L.map(Math.abs));
    const mask = new Uint8Array(w * h);
    const pairs = [
      [-1, 0, 1, 0],
      [0, -1, 0, 1],
      [-1, -1, 1, 1],
      [1, -1, -1, 1],
    ];
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (const [ax, ay, bx, by] of pairs) {
          const a = L[reflect(y + ay, h) * w + reflect(x + ax, w)];
          const b = L[reflect(y + by, h) * w + reflect(x + bx, w)];
          if (a * b < 0 && Math.abs(a - b) > T) {
            mask[y * w + x] = 255;
            break;
          }
        }
    return { response: L.map(Math.abs), mask, T };
  }

  // ---------- Оценка ----------

  // Сравнение бинарного результата с эталоном: объект — значение 0 в обоих.
  function compareMasks(result, truth) {
    let tp = 0,
      fp = 0,
      fn = 0,
      tn = 0;
    for (let i = 0; i < truth.length; i++) {
      const r = result[i] === 0,
        t = truth[i] === 0;
      if (r && t) tp++;
      else if (r) fp++;
      else if (t) fn++;
      else tn++;
    }
    const precision = tp / (tp + fp) || 0,
      recall = tp / (tp + fn) || 0;
    const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
    return { precision, recall, f1, accuracy: (tp + tn) / truth.length };
  }

  // Растяжение модуля отклика на 0..255 для вывода на экран.
  function normalize(values) {
    const m = maxOf(values) || 1;
    return Uint8Array.from(values, (v) => Math.round((255 * Math.max(v, 0)) / m));
  }

  return {
    reflect,
    image,
    fromRGBA,
    correlate,
    gaussianKernel,
    gaussianBlur,
    localMeanStd,
    niblackThreshold,
    sauvolaThreshold,
    binarize,
    MASKS,
    detectPoints,
    detectLines,
    gradient,
    detectEdges,
    detectLogEdges,
    compareMasks,
    normalize,
  };
});
