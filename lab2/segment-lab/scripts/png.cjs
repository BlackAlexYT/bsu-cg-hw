"use strict";
// Минимальные чтение и запись PNG для скриптов: 8 бит, без чересстрочности.
// Чтение: полутоновые (тип 0) и RGB/RGBA (типы 2, 6), возвращается яркость 0..255.
// Запись: только полутоновые.
const fs = require("node:fs"),
  zlib = require("node:zlib");

function readPng(file) {
  const buf = fs.readFileSync(file);
  let pos = 8,
    width,
    height,
    type;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos),
      name = buf.toString("ascii", pos + 4, pos + 8);
    const chunk = buf.subarray(pos + 8, pos + 8 + len);
    if (name === "IHDR") {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      type = chunk[9];
      if (chunk[8] !== 8 || chunk[12] !== 0) throw new Error(file + ": только 8 бит без interlace");
    } else if (name === "IDAT") idat.push(chunk);
    pos += 12 + len;
  }
  const bpp = { 0: 1, 2: 3, 6: 4 }[type];
  if (!bpp) throw new Error(file + ": неподдерживаемый тип " + type);
  const raw = zlib.inflateSync(Buffer.concat(idat)),
    stride = width * bpp;
  const px = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)],
      line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? px[y * stride + i - bpp] : 0;
      const b = y ? px[(y - 1) * stride + i] : 0;
      const c = y && i >= bpp ? px[(y - 1) * stride + i - bpp] : 0;
      const p = a + b - c,
        pa = Math.abs(p - a),
        pb = Math.abs(p - b),
        pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      px[y * stride + i] = (line[i] + pred) & 255;
    }
  }
  const data = new Float64Array(width * height);
  for (let i = 0; i < data.length; i++) {
    const j = i * bpp;
    data[i] = bpp === 1 ? px[j] : Math.round(0.299 * px[j] + 0.587 * px[j + 1] + 0.114 * px[j + 2]);
  }
  return { width, height, data };
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(name, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(name, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function writePng(file, { width, height, data }) {
  const raw = Buffer.alloc(height * (width + 1));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      raw[y * (width + 1) + 1 + x] = Math.max(0, Math.min(255, Math.round(data[y * width + x])));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // бит на канал; тип 0 — полутона
  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

module.exports = { readPng, writePng };
