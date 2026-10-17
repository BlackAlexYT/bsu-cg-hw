"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  cmykToRgb,
  rgbToCmyk,
  hsvToRgb,
  rgbToHsv,
  rgbToHex,
  hexToRgb,
  angle,
  clamp,
} = require("../dist/colors.js");
const reference = require("./reference.json");
function near(actual, expected, tolerance = 1e-9) {
  assert.equal(actual.length, expected.length);
  actual.forEach((n, i) => {
    assert(Number.isFinite(n));
    assert(Math.abs(n - expected[i]) <= tolerance, `канал ${i}: ${n} != ${expected[i]}`);
  });
}
const colors = [
  ["чёрный", [0, 0, 0], [0, 0, 0, 100], [0, 0, 0]],
  ["белый", [255, 255, 255], [0, 0, 0, 0], [0, 0, 100]],
  ["красный", [255, 0, 0], [0, 100, 100, 0], [0, 100, 100]],
  ["жёлтый", [255, 255, 0], [0, 0, 100, 0], [60, 100, 100]],
  ["зелёный", [0, 255, 0], [100, 0, 100, 0], [120, 100, 100]],
  ["голубой", [0, 255, 255], [100, 0, 0, 0], [180, 100, 100]],
  ["синий", [0, 0, 255], [100, 100, 0, 0], [240, 100, 100]],
  ["пурпурный", [255, 0, 255], [0, 100, 0, 0], [300, 100, 100]],
  [
    "оранжевый",
    [255, 128, 0],
    [0, (127 / 255) * 100, 100, 0],
    [(128 / 255) * 60, 100, 100],
  ],
];
for (const [name, rgb, cmyk, hsv] of colors) {
  test(`RGB ↔ CMYK: ${name}`, () => {
    near(rgbToCmyk(rgb), cmyk);
    near(cmykToRgb(cmyk), rgb);
  });
  test(`RGB ↔ HSV: ${name}`, () => {
    near(rgbToHsv(rgb), hsv);
    near(hsvToRgb(hsv), rgb);
  });
}
test("Все 256 целых серых оттенков: S=0, сохранение H, канонический CMYK", () => {
  for (let n = 0; n <= 255; n++) {
    near(rgbToHsv([n, n, n], 227), [227, 0, (n / 255) * 100]);
    near(rgbToCmyk([n, n, n]), [0, 0, 0, (1 - n / 255) * 100]);
  }
});
test("Чёрный не вызывает деления на ноль", () => {
  assert.deepEqual(rgbToCmyk([0, 0, 0]), [0, 0, 0, 100]);
  assert.deepEqual(rgbToHsv([0, 0, 0]), [0, 0, 0]);
});
test("Регрессия: почти чёрный красный не становится ахроматическим CMYK", () => {
  const result = rgbToCmyk([1e-11, 0, 0]);
  near(result.slice(0, 3), [0, 100, 100]);
  assert(result[3] < 100);
  near(cmykToRgb(result), [1e-11, 0, 0], 1e-13);
});
test("Регрессия: почти серый цвет получает правильный H", () => {
  const result = rgbToHsv([128, 128 + 1e-11, 128], 240);
  assert.equal(result[0], 120);
  assert(result[1] > 0);
});
test("У K=100% результат чёрный независимо от C/M/Y", () => {
  for (const c of [0, 25, 100])
    for (const m of [0, 50, 100])
      for (const y of [0, 75, 100]) near(cmykToRgb([c, m, y, 100]), [0, 0, 0]);
});
test("CMYK неоднозначен: разные координаты могут давать одинаковый RGB", () => {
  near(cmykToRgb([0, 0, 0, 50]), cmykToRgb([50, 50, 50, 0]));
  near(rgbToCmyk(cmykToRgb([50, 50, 50, 0])), [0, 0, 0, 50]);
});
test("HSV: V=0 всегда чёрный, S=0 всегда серый", () => {
  for (const h of [0, 30, 120, 270, 360]) {
    near(hsvToRgb([h, 83, 0]), [0, 0, 0]);
    near(hsvToRgb([h, 0, 40]), [102, 102, 102]);
  }
});
test("HSV: V=100 не означает белый", () => {
  near(hsvToRgb([240, 100, 100]), [0, 0, 255]);
});
test("H замыкается: 0°, 360°, 720°, −360° совпадают", () => {
  for (const h of [0, 360, 720, -360]) near(hsvToRgb([h, 100, 100]), [255, 0, 0]);
  assert.equal(angle(-60), 300);
});
test("Промежуточные точки всех шести секторов H", () => {
  [
    [30, [255, 127.5, 0]],
    [90, [127.5, 255, 0]],
    [150, [0, 255, 127.5]],
    [210, [0, 127.5, 255]],
    [270, [127.5, 0, 255]],
    [330, [255, 0, 127.5]],
  ].forEach(([h, rgb]) => {
    near(hsvToRgb([h, 100, 100]), rgb);
    near(rgbToHsv(rgb), [h, 100, 100]);
  });
});
test("HSV: обе стороны границ секторов непрерывны", () => {
  for (const h of [0, 60, 120, 180, 240, 300, 360])
    near(hsvToRgb([h - 1e-7, 70, 80]), hsvToRgb([h + 1e-7, 70, 80]), 1e-6);
});
test("Дробные координаты сохраняются до вывода HEX", () => {
  near(hsvToRgb([30, 100, 100]), [255, 127.5, 0]);
  assert.equal(rgbToHex(hsvToRgb([30, 100, 100])), "#FF8000");
});
test("HEX: ведущие нули, регистр, округление и ограничения", () => {
  assert.equal(rgbToHex([0, 1, 15]), "#00010F");
  assert.deepEqual(hexToRgb("#aBcDeF"), [171, 205, 239]);
  assert.equal(rgbToHex([-1, 127.5, 300]), "#0080FF");
});
test("HEX: неверный формат возвращает null", () => {
  for (const value of [
    null,
    undefined,
    123,
    {},
    [],
    true,
    "",
    "#FFF",
    "FFFFFF",
    "#GG0000",
    "#FFFFFF00",
    " #FFFFFF",
    "#FFFFFF\n",
  ])
    assert.equal(hexToRgb(value), null);
});
test("HEX ↔ RGB: все 256 уровней каждого канала", () => {
  for (let n = 0; n <= 255; n++)
    for (const rgb of [
      [n, 0, 0],
      [0, n, 0],
      [0, 0, n],
      [n, n, n],
    ])
      assert.deepEqual(hexToRgb(rgbToHex(rgb)), rgb);
});
test("clamp ограничивает координаты поля палитры", () => {
  assert.equal(clamp(-1, 0, 1), 0);
  assert.equal(clamp(2, 0, 1), 1);
  assert.equal(clamp(0.4, 0, 1), 0.4);
});
test("Независимые эталоны Python colorsys: RGB → HSV", () => {
  for (const { input, expected } of reference.rgb_to_hsv) near(rgbToHsv(input), expected);
});
test("Независимые эталоны Python colorsys: HSV → RGB", () => {
  for (const { input, expected } of reference.hsv_to_rgb) near(hsvToRgb(input), expected);
});
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
test("10 000 воспроизводимых RGB: обратимость CMYK и HSV, допустимые диапазоны", () => {
  const rng = random(20261008);
  for (let i = 0; i < 10000; i++) {
    const rgb = Array.from({ length: 3 }, () => rng() * 255),
      cmyk = rgbToCmyk(rgb),
      hsv = rgbToHsv(rgb);
    near(cmykToRgb(cmyk), rgb);
    near(hsvToRgb(hsv), rgb);
    cmyk.forEach((x) => assert(x >= 0 && x <= 100));
    assert(hsv[0] >= 0 && hsv[0] < 360);
    assert(hsv[1] >= 0 && hsv[1] <= 100);
    assert(hsv[2] >= 0 && hsv[2] <= 100);
    assert(Math.min(...cmyk.slice(0, 3)) < 1e-9);
  }
});
test("2 000 воспроизводимых CMYK: сохраняется цвет, а не обязательно координаты", () => {
  const rng = random(42);
  for (let i = 0; i < 2000; i++) {
    const cmyk = Array.from({ length: 4 }, () => rng() * 100),
      rgb = cmykToRgb(cmyk);
    near(cmykToRgb(rgbToCmyk(rgb)), rgb);
    near(hsvToRgb(rgbToHsv(rgb)), rgb);
  }
});
test("2 000 воспроизводимых HSV: обратимость цветных значений", () => {
  const rng = random(123);
  for (let i = 0; i < 2000; i++) {
    const hsv = [rng() * 360, 1 + rng() * 99, 1 + rng() * 99];
    near(rgbToHsv(hsvToRgb(hsv)), hsv, 1e-8);
  }
});
test("Преобразования не изменяют входные массивы", () => {
  for (const [fn, input] of [
    [rgbToHsv, [32, 64, 128]],
    [rgbToCmyk, [32, 64, 128]],
    [rgbToHex, [32, 64, 128]],
    [hsvToRgb, [210, 75, 50]],
    [cmykToRgb, [75, 50, 0, 50]],
  ]) {
    const original = input.slice();
    fn(Object.freeze(input));
    assert.deepEqual(input, original);
  }
});
