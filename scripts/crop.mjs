/**
 * Crops a region out of a screenshot, so a detail can be looked at closely.
 *
 *   node scripts/crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]
 *
 * It re-renders the PNG through a headless browser rather than decoding it
 * in Node, because the browser is already here and a canvas crop is a few
 * lines of code.
 */
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const [, , input, output, x, y, w, h, scale = "3"] = process.argv;

if (input === undefined || output === undefined) {
  console.error("usage: node scripts/crop.mjs <in.png> <out.png> <x> <y> <w> <h> [scale]");
  process.exit(1);
}

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chrome = chromePaths.find((p) => existsSync(p));
if (chrome === undefined) {
  console.error("no Chrome or Edge found");
  process.exit(1);
}

const src = pathToFileURL(resolve(root, input)).href;
const out = resolve(root, output);

const html = `<!doctype html><meta charset="utf-8" />
<style>
  html, body { margin:0; padding:0; background:#000; overflow:hidden; }
  canvas { display:block; image-rendering:pixelated; }
</style>
<canvas id="c"></canvas>
<script>
  const img = new Image();
  img.onload = () => {
    const c = document.getElementById("c");
    const s = ${scale};
    c.width = ${w} * s;
    c.height = ${h} * s;
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(img, ${x}, ${y}, ${w}, ${h}, 0, 0, c.width, c.height);
    document.title = "ready";
  };
  img.src = "${src}";
</script>`;

const tmp = join(root, ".expo-preview", "crop.html");
writeFileSync(tmp, html, "utf8");

try {
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--window-size=${Number(w) * Number(scale)},${Number(h) * Number(scale)}`,
      `--screenshot=${out}`,
      pathToFileURL(tmp).href,
    ],
    { stdio: "pipe", timeout: 120000 },
  );
  console.log(`wrote ${out}`);
} catch (err) {
  console.error(err.stderr?.toString() ?? err.message);
  if (existsSync(out)) console.log(`wrote ${out}`);
  else process.exit(1);
}
