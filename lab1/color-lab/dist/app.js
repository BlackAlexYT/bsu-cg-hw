"use strict";
const { clamp, angle, cmykToRgb, rgbToCmyk, hsvToRgb, rgbToHsv, rgbToHex, hexToRgb } =
  ColorMath;
const state = { rgb: [113, 101, 245], cmyk: [], hsv: [] };
state.cmyk = rgbToCmyk(state.rgb);
state.hsv = rgbToHsv(state.rgb);
const specs = {
  rgb: {
    name: "RGB",
    desc: "Красный · зелёный · синий",
    channels: ["R", "G", "B"],
    max: [255, 255, 255],
    unit: ["", "", ""],
    title: ["Красный", "Зелёный", "Синий"],
  },
  cmyk: {
    name: "CMYK",
    desc: "Голубой · пурпурный · жёлтый · чёрный",
    channels: ["C", "M", "Y", "K"],
    max: [100, 100, 100, 100],
    unit: ["%", "%", "%", "%"],
    title: ["Голубая краска", "Пурпурная краска", "Жёлтая краска", "Чёрная краска"],
  },
  hsv: {
    name: "HSV",
    desc: "Тон · насыщенность · значение",
    channels: ["H", "S", "V"],
    max: [360, 100, 100],
    unit: ["°", "%", "%"],
    title: ["Цветовой тон", "Насыщенность", "Value: максимум RGB"],
  },
};
const fmt = (n) => String(Math.round(n * 100) / 100);
function update(model, values, active) {
  state[model] = values.slice();
  if (model === "rgb") {
    state.cmyk = rgbToCmyk(values);
    state.hsv = rgbToHsv(values, state.hsv[0]);
  } else if (model === "cmyk") {
    state.rgb = cmykToRgb(values);
    state.hsv = rgbToHsv(state.rgb, state.hsv[0]);
  } else {
    state.rgb = hsvToRgb(values);
    state.cmyk = rgbToCmyk(state.rgb);
  }
  render(active);
}
function paletteValues(model, x, y) {
  return [state.hsv[0], clamp(x, 0, 1) * 100, (1 - clamp(y, 0, 1)) * 100];
}
function choosePalette(model, hsv, active) {
  const rgb = hsvToRgb(hsv);
  if (model === "hsv") update("hsv", hsv, active);
  else {
    update(model, model === "rgb" ? rgb : rgbToCmyk(rgb), active);
    state.hsv = hsv.slice();
    render(active);
  }
}
function setHex(hex) {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  update("rgb", rgb);
  return true;
}
function build() {
  const models = document.getElementById("models");
  for (const [key, spec] of Object.entries(specs)) {
    const card = document.createElement("article");
    card.className = "model";
    card.innerHTML = `<div class="modeltop"><h3>${spec.name}</h3><span class="tag">${spec.channels.length} канала</span></div><p class="modeldesc">${spec.desc}</p>`;
    spec.channels.forEach((ch, i) => {
      const id = key + "-" + ch;
      const row = document.createElement("div");
      row.className = "channel";
      row.innerHTML = `<div class="fieldtop"><label for="${id}-num" title="${spec.title[i]}">${ch} · ${spec.title[i]}</label><span class="numwrap"><input id="${id}-num" type="number" min="0" max="${spec.max[i]}" step="any" aria-label="${spec.name}: ${spec.title[i]}"><span>${spec.unit[i]}</span></span></div><input id="${id}-range" type="range" min="0" max="${spec.max[i]}" step="${key === "rgb" ? "1" : "0.1"}" aria-label="${spec.name}: ползунок ${spec.title[i]}">`;
      card.appendChild(row);
      for (const suffix of ["num", "range"]) {
        const el = row.querySelector("#" + id + "-" + suffix);
        el.addEventListener("input", () => {
          if (el.value.trim() === "") return;
          const n = Number(el.value);
          if (!Number.isFinite(n) || n < 0 || n > spec.max[i]) {
            el.setCustomValidity(`Введите число от 0 до ${spec.max[i]}`);
            el.reportValidity();
            return;
          }
          el.setCustomValidity("");
          const vals = state[key].slice();
          vals[i] = n;
          update(key, vals, el);
        });
        el.addEventListener("change", () => {
          el.setCustomValidity("");
          render();
        });
      }
    });
    const label = document.createElement("label");
    label.className = "modelpalette";
    label.innerHTML = `Выбрать цвет<input type="color" id="${key}-picker" aria-label="Выбрать цвет в модели ${spec.name}">`;
    label.querySelector("input").addEventListener("input", (e) => {
      const rgb = hexToRgb(e.target.value);
      update(
        key,
        key === "rgb"
          ? rgb
          : key === "cmyk"
            ? rgbToCmyk(rgb)
            : rgbToHsv(rgb, state.hsv[0]),
      );
    });
    card.appendChild(label);
    if (key === "hsv") {
      const heading = document.createElement("p");
      heading.className = "palette-axes";
      heading.textContent = "Насыщенность → · Светлее сверху, темнее снизу";
      card.appendChild(heading);
      const pad = document.createElement("div");
      pad.id = key + "-svpad";
      pad.className = "svpad";
      pad.setAttribute(
        "aria-label",
        heading.textContent + "; для клавиатуры доступны ползунки каналов",
      );
      pad.innerHTML = `<span id="${key}-svcursor" class="cursor"></span>`;
      const pick = (e) => {
        const r = pad.getBoundingClientRect();
        choosePalette(
          key,
          paletteValues(
            key,
            (e.clientX - r.left) / r.width,
            (e.clientY - r.top) / r.height,
          ),
        );
      };
      pad.addEventListener("pointerdown", (e) => {
        pad.setPointerCapture(e.pointerId);
        pick(e);
      });
      pad.addEventListener("pointermove", (e) => {
        if (pad.hasPointerCapture(e.pointerId)) pick(e);
      });
      pad.addEventListener("pointerup", (e) => {
        if (pad.hasPointerCapture(e.pointerId)) pad.releasePointerCapture(e.pointerId);
      });
      card.appendChild(pad);
      {
        const hueLabel = document.createElement("label");
        hueLabel.className = "palette-hue";
        hueLabel.innerHTML = `<span>Тон H</span><input id="${key}-palette-hue" class="huebar" type="range" min="0" max="360" step="0.1" aria-label="${spec.name}: тон палитры">`;
        hueLabel
          .querySelector("#" + key + "-palette-hue")
          .addEventListener("input", (e) =>
            choosePalette(
              key,
              [Number(e.target.value), state.hsv[1], state.hsv[2]],
              e.target,
            ),
          );
        card.appendChild(hueLabel);
      }
      const hint = document.createElement("p");
      hint.id = key + "-palette-caption";
      hint.className = "small";
      card.appendChild(hint);
    }
    models.appendChild(card);
  }
  const presets = [
    "#FF0000",
    "#00FF00",
    "#0000FF",
    "#00FFFF",
    "#FF00FF",
    "#FFFF00",
    "#FF8000",
    "#7165F5",
    "#FFFFFF",
    "#808080",
    "#000000",
  ];
  for (const hex of presets) {
    const b = document.createElement("button");
    b.style.background = hex;
    b.title = hex;
    b.setAttribute("aria-label", "Выбрать " + hex);
    b.addEventListener("click", () => setHex(hex));
    document.getElementById("presets").appendChild(b);
  }
}
function render(active) {
  const hex = rgbToHex(state.rgb);
  const swatch = document.getElementById("swatch");
  swatch.style.background = hex;
  swatch.style.color =
    state.rgb[0] * 0.299 + state.rgb[1] * 0.587 + state.rgb[2] * 0.114 > 155
      ? "#151724"
      : "#fff";
  document.getElementById("hexBig").textContent = hex;
  if (active !== document.getElementById("hex"))
    document.getElementById("hex").value = hex;
  document.getElementById("picker").value = hex;
  for (const [key, spec] of Object.entries(specs)) {
    spec.channels.forEach((ch, i) => {
      for (const suffix of ["num", "range"]) {
        const el = document.getElementById(key + "-" + ch + "-" + suffix);
        if (el !== active) el.value = fmt(state[key][i]);
      }
      const range = document.getElementById(key + "-" + ch + "-range");
      const a = state[key].slice(),
        b = state[key].slice();
      a[i] = 0;
      b[i] = spec.max[i];
      const toRGB = (v) =>
        key === "rgb" ? v : key === "cmyk" ? cmykToRgb(v) : hsvToRgb(v);
      range.style.background =
        key === "hsv" && i === 0
          ? "linear-gradient(to right,red,yellow,lime,cyan,blue,magenta,red)"
          : `linear-gradient(to right,${rgbToHex(toRGB(a))},${rgbToHex(toRGB(b))})`;
    });
    document.getElementById(key + "-picker").value = hex;
  }
  {
    const key = "hsv";
    const pad = document.getElementById(key + "-svpad"),
      marker = document.getElementById(key + "-svcursor"),
      caption = document.getElementById(key + "-palette-caption");
    pad.style.background = `linear-gradient(to top,black,transparent),linear-gradient(to right,white,transparent),${rgbToHex(hsvToRgb([state.hsv[0], 100, 100]))}`;
    pad.style.backgroundBlendMode = "normal";
    marker.style.left = state.hsv[1] + "%";
    marker.style.top = 100 - state.hsv[2] + "%";
    const hue = document.getElementById(key + "-palette-hue");
    if (hue !== active) hue.value = fmt(state.hsv[0]);
    caption.textContent = "Выберите тон на полосе, затем цвет в квадрате.";
  }
}

build();
render();
document
  .getElementById("picker")
  .addEventListener("input", (e) => setHex(e.target.value));
const hexInput = document.getElementById("hex");
hexInput.addEventListener("input", () => {
  const rgb = hexToRgb(hexInput.value);
  hexInput.setCustomValidity(rgb ? "" : "Формат: # и шесть цифр 0–9 или букв A–F");
  if (rgb) update("rgb", rgb, hexInput);
});
hexInput.addEventListener("change", () => {
  if (!hexToRgb(hexInput.value)) hexInput.reportValidity();
  else render();
});
document.getElementById("copy").addEventListener("click", async () => {
  const hex = rgbToHex(state.rgb),
    status = document.getElementById("status");
  try {
    if (!navigator.clipboard?.writeText) throw Error();
    await navigator.clipboard.writeText(hex);
    status.textContent = "Скопировано: " + hex;
  } catch {
    hexInput.focus();
    hexInput.select();
    status.textContent = "Цвет выделен. Нажмите Ctrl+C / ⌘C.";
  }
});
