/**
 * THE MATHS, DRAWN.
 * ---------------------------------------------------------------------------
 *   node --import ./scripts/register-ts.mjs scripts/preview-latex.mjs
 *
 * The layout engine puts every glyph at an ABSOLUTE position, which is
 * exactly what React Native does with it — each primitive becomes a `<Text>`
 * at a `left` and a `top`. So an SVG drawn from the same numbers is a
 * faithful picture of what the phone will show, and the maths can be looked
 * at without a device.
 *
 * The baseline of each expression is drawn as a rule, so that the things
 * that have to sit ON the baseline — the scripts, the big operators, the
 * fraction's axis — can be seen to do so.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { layoutMath } from "@/lib/latex";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, ".expo-preview");
mkdirSync(outDir, { recursive: true });

/**
 * The size the expressions are drawn at — the same size the app uses.
 *
 * SCALE draws the same layout bigger, which is how it can be looked at
 * closely without a device. The layout is in em, so everything scales
 * together and the drawing stays faithful.
 */
const SCALE = Number(process.env.LATEX_SCALE ?? 1);
const SIZE = 15 * SCALE;
const INLINE_SIZE = 14 * SCALE;

/** The face a variant is drawn in. */
function familyFor(variant) {
  switch (variant.face) {
    case "nova":
      return "NovaMono";
    case "bold":
      return "JBMonoBold";
    case "medium":
      return "JBMonoMedium";
    default:
      return "JBMono";
  }
}

/**
 * One expression, as an SVG.
 *
 * The baseline is at `layout.height * size` from the top, and a primitive's
 * baseline is `layout.height - p.y` from the top — the same arithmetic the
 * renderer does.
 */
function svg(latex, display, label) {
  const { layout } = layoutMath(latex, display);
  const size = display ? SIZE : INLINE_SIZE;

  const width = Math.max(40, layout.width * size + 24 * SCALE);
  const height = Math.max(40, (layout.height + layout.depth) * size + 24 * SCALE);
  const baseline = 12 * SCALE + layout.height * size;

  const parts = [];

  for (const p of layout.primitives) {
    if (p.type === "text") {
      const fontSize = p.scale * size;
      parts.push(
        `<text x="${(12 * SCALE + p.x * size).toFixed(2)}" y="${(baseline - p.y * size).toFixed(2)}" ` +
          `font-family="${familyFor(p.variant)}" font-size="${fontSize}" ` +
          `${p.variant.italic ? 'font-style="italic" ' : ""}` +
          `fill="#e8e8ee">${p.text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")}</text>`,
      );
    } else {
      parts.push(
        `<rect x="${(12 * SCALE + p.x * size).toFixed(2)}" ` +
          `y="${(baseline - p.y * size - p.thickness * size).toFixed(2)}" ` +
          `width="${(p.width * size).toFixed(2)}" height="${(p.thickness * size).toFixed(2)}" ` +
          `fill="#a8b0bb" />`,
      );
    }
  }

  return `<figure>
  <figcaption>${label}</figcaption>
  <svg width="${width.toFixed(0)}" height="${height.toFixed(0)}" viewBox="0 0 ${width.toFixed(0)} ${height.toFixed(0)}">
    <rect width="100%" height="100%" fill="#0b0b0f" />
    <line x1="0" y1="${baseline.toFixed(2)}" x2="${width.toFixed(0)}" y2="${baseline.toFixed(2)}" stroke="#2a2a35" stroke-width="1" />
    ${parts.join("\n    ")}
  </svg>
</figure>`;
}

/** The expressions worth looking at. */
const DISPLAY = [
  "\\frac{d}{dx}\\left[uv\\right] = u'v + uv'",
  "e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}",
  "\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e",
  "\\int_0^1 x^2\\,dx = \\tfrac{1}{3}",
  "\\sqrt{x^2 + y^2} \\qquad \\sqrt[3]{27}",
  "a^2 + b^2 = c^2",
  "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
  "\\prod_{k=1}^{n} k \\qquad \\oint_C \\vec{F} \\cdot d\\vec{r}",
  "\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon_0}",
  "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
  "\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix} \\qquad \\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}",
  "\\begin{cases} |x| & x \\ge 0 \\\\ -x & x < 0 \\end{cases}",
  "\\hat{y} = \\bar{x} + \\tilde{\\beta} + \\overline{AB}",
  "\\left\\{ x \\in \\mathbb{R} \\mid x > 0 \\right\\}",
  "\\pm \\mp \\times \\div \\le \\ge \\neq \\approx \\equiv \\to \\Rightarrow \\iff \\in \\notin \\subset \\cup \\cap \\emptyset \\infty \\partial \\nabla \\forall \\exists",
  "f(x) = \\begin{cases} 1 & x \\ge 0 \\\\ 0 & x < 0 \\end{cases}",
];

const INLINE = [
  "x^2 + 3x + 2",
  "\\frac{d}{dx}f(x)",
  "e^{i\\pi} + 1 = 0",
  "\\lim_{x \\to 0}",
  "\\alpha \\beta \\gamma \\Delta \\Omega",
];

const font = (family, file) =>
  `@font-face { font-family: "${family}"; src: url("file:///${join(root, "assets/fonts", file).replace(/\\/g, "/")}"); }`;

const html = `<!doctype html><meta charset="utf-8" />
<style>
  ${font("JBMono", "JetBrainsMono-Regular.ttf")}
  ${font("JBMonoMedium", "JetBrainsMono-Medium.ttf")}
  ${font("JBMonoBold", "JetBrainsMono-Bold.ttf")}
  ${font("NovaMono", "NovaMono-Regular.ttf")}

  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#101014; color:#7c7c88; font-family:"JBMono", monospace;
         display:flex; flex-wrap:wrap; gap:22px; padding:24px; align-items:flex-start; }
  figure { display:flex; flex-direction:column; gap:6px; }
  figcaption { font-size:10px; letter-spacing:1px; text-transform:uppercase; }
  h2 { width:100%; font-size:12px; letter-spacing:2px; text-transform:uppercase;
       color:#a8b0bb; margin-top:10px; }
</style>

<h2>displayed equations</h2>
${DISPLAY.map((e) => svg(e, true, e)).join("\n")}

<h2>inline</h2>
${INLINE.map((e) => svg(e, false, e)).join("\n")}
`;

const htmlPath = join(outDir, "latex.html");
writeFileSync(htmlPath, html, "utf8");
console.log(`wrote ${htmlPath}`);

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chrome = chromePaths.find((p) => existsSync(p));
if (chrome === undefined) {
  console.error("no Chrome or Edge found — the HTML preview was written, the PNG was not");
  process.exit(0);
}

const pngPath = join(outDir, "latex.png");
execFileSync(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1400,2400",
  `--screenshot=${pngPath}`,
  `file:///${htmlPath.replace(/\\/g, "/")}`,
]);
console.log(`wrote ${pngPath}`);
