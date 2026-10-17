(function (root, factory) {
  "use strict";
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ColorMath = api;
})(globalThis, function () {
  "use strict";
  const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
  const angle = (h) => ((h % 360) + 360) % 360;

  function cmykToRgb([c, m, y, k]) {
    return [c, m, y].map((channel) => 255 * (1 - channel / 100) * (1 - k / 100));
  }

  function rgbToCmyk(rgb) {
    const [r, g, b] = rgb.map((channel) => channel / 255);
    const max = Math.max(r, g, b);
    if (max === 0) return [0, 0, 0, 100];

    return [
      ((max - r) / max) * 100,
      ((max - g) / max) * 100,
      ((max - b) / max) * 100,
      (1 - max) * 100,
    ];
  }

  function hsvToRgb([h, s, v]) {
    h = angle(h);
    s /= 100;
    v /= 100;
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const components =
      h < 60
        ? [c, x, 0]
        : h < 120
          ? [x, c, 0]
          : h < 180
            ? [0, c, x]
            : h < 240
              ? [0, x, c]
              : h < 300
                ? [x, 0, c]
                : [c, 0, x];
    return components.map((channel) => (channel + m) * 255);
  }

  function rgbToHsv([r, g, b], previousHue = 0) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = previousHue;

    if (delta !== 0) {
      h =
        max === r
          ? 60 * ((g - b) / delta)
          : max === g
            ? 60 * ((b - r) / delta + 2)
            : 60 * ((r - g) / delta + 4);
    }
    return [angle(h), max === 0 ? 0 : (delta / max) * 100, (max / 255) * 100];
  }

  function rgbToHex(rgb) {
    return (
      "#" +
      rgb
        .map((channel) =>
          Math.round(clamp(channel, 0, 255))
            .toString(16)
            .padStart(2, "0"),
        )
        .join("")
        .toUpperCase()
    );
  }

  function hexToRgb(hex) {
    return typeof hex === "string" && /^#[\da-f]{6}$/i.test(hex)
      ? [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      : null;
  }

  return Object.freeze({
    clamp,
    angle,
    cmykToRgb,
    rgbToCmyk,
    hsvToRgb,
    rgbToHsv,
    rgbToHex,
    hexToRgb,
  });
});
