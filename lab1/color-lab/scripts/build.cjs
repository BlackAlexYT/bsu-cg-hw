"use strict";

const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  dist = path.join(root, "dist");
let html = fs.readFileSync(path.join(dist, "index.html"), "utf8");
html = html.replace(
  /<link\s+rel="stylesheet"\s+href="style\.css"\s*\/?>/,
  () => "<style>" + fs.readFileSync(path.join(dist, "style.css"), "utf8") + "</style>",
);
for (const name of ["colors.js", "app.js"])
  html = html.replace(
    `<script src="${name}"></script>`,
    () => "<script>" + fs.readFileSync(path.join(dist, name), "utf8") + "</script>",
  );
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(root, "standalone.html");
fs.writeFileSync(output, html);
console.log("HTML: " + output);
