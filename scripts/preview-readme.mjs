/**
 * THE README CONTAINER, RENDERED TO A PNG.
 * ---------------------------------------------------------------------------
 * A mock of the home screen's README section, so the treatment can be LOOKED
 * at — the fill, the grain, the edge and the type — without a device.
 *
 *   node scripts/preview-readme.mjs
 *
 * It is a mock, not the real screen, but everything it draws is real: the
 * actual JetBrains Mono files, the actual palette tokens, the actual grain
 * tile, the actual edge and sheen opacities, and the actual spacing numbers
 * from `src/app/(tabs)/index.tsx`.
 *
 * WHAT IT PROVES, NOW THAT THE CONTAINER HAS NO BAR
 * ---------------------------------------------------------------------------
 * The container and the screen header used to be two terminal windows: the
 * header's bar at the top of the screen, and the README container's own
 * smaller bar a few points under it. Two rows of dots and two hairlines,
 * one above the other. The container is a plain `GlassPanel` now, so this
 * draws the header (the only bar) and the panel under it, which is the
 * arrangement the reader actually sees.
 *
 * The field behind the page is a WebGL pipeline in a WebView, which a
 * headless screenshot cannot draw, so the page is the flat `bg0` here. Every
 * container, every edge and every number below it is the app's own.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, ".expo-preview");
mkdirSync(outDir, { recursive: true });

/* ------------------------------------------------------------------ *
 * the palette — the dark theme's tokens, read from the app's own data
 * ------------------------------------------------------------------ */

const palettes = readFileSync(join(root, "src/theme/palettes.generated.ts"), "utf8");

/** Pull one token's value out of a palette block by its key. */
function token(block, key) {
  const m = new RegExp(`${key}:\\s*"([^"]+)"`).exec(block);
  if (m === null) throw new Error(`no ${key} in the palette`);
  return m[1];
}

/** The first palette block in the generated file — the dark one. */
function firstBlock(source) {
  const start = source.indexOf("PALETTES");
  const open = source.indexOf("{", start);
  const body = source.slice(open);
  // The first palette entry, whose key is quoted.
  const m = /"([a-z0-9-]+)"\s*:\s*\{/.exec(body);
  if (m === null) throw new Error("no palette block found");
  const entryStart = body.indexOf("{", m.index);
  let depth = 0;
  for (let i = entryStart; i < body.length; i += 1) {
    if (body[i] === "{") depth += 1;
    else if (body[i] === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(entryStart + 1, i);
    }
  }
  throw new Error("unbalanced palette block");
}

const block = firstBlock(palettes);
const T = {
  bg0: token(block, "bg0"),
  bg1: token(block, "bg1"),
  fg: token(block, "fg"),
  fgMuted: token(block, "fgMuted"),
  fgDim: token(block, "fgDim"),
  accentA: token(block, "accentA"),
  accentDot: token(block, "accentDot"),
  surfaceRaised: token(block, "surfaceRaised"),
  line: token(block, "line"),
};

/** The grain's opacity, from `src/components/ui/GlassPanel.tsx`. */
const GRAIN_OPACITY = 0.14;

/**
 * The sheen's colour.
 *
 * `GlassPanel` draws the edge in the palette's own `line` colour — NOT the
 * accent, which is what this preview used to claim — and the sheen as
 * `${fg}1F` — the foreground at 12%.
 */
const SHEEN_ALPHA = 0x1f / 255;

/**
 * An rgba() string from a hex or an rgba() source and an alpha.
 */
function withAlpha(color, alpha) {
  let r;
  let g;
  let b;
  if (color.startsWith("#")) {
    const h = color.slice(1);
    const n = Number.parseInt(h.length === 3 ? [...h].map((c) => c + c).join("") : h, 16);
    r = (n >> 16) & 255;
    g = (n >> 8) & 255;
    b = n & 255;
  } else {
    const parts = color.match(/[\d.]+/g);
    [r, g, b] = parts.map(Number);
  }
  return `rgba(${r},${g},${b},${alpha})`;
}

/** The grain tile, as a data URI, so the page can tile it. */
function grainDataUri() {
  const file = join(root, "assets/images/grain-light.png");
  if (!existsSync(file)) return null;
  return `data:image/png;base64,${readFileSync(file).toString("base64")}`;
}

/* ------------------------------------------------------------------ *
 * the page
 * ------------------------------------------------------------------ */

const grain = grainDataUri();
const grainLayer =
  grain === null
    ? ""
    : `<div class="grain" style="background-image:url(${grain})"></div>`;

/*
 * The geometry, in points, from the app:
 *
 *   screen gutter    18
 *   panel width      390 - 18*2  = 354
 *   status inset     24    (a phone's status bar, for the header to reach up into)
 *   header height    44
 *   header dots      8pt across, 4 radius, 5 apart, 12 from the left edge
 *   header gap       14    (`styles.readme.marginTop`)
 *   corner radius    12    (`RADIUS.panel`, the default)
 *   panel padding    22    (`GlassPanel`'s default)
 *   eyebrow          TYPE.label  10/14
 *   title            TYPE.title  23/29
 *   subtitle         TYPE.small  12/18
 */
const W = 390;
const H = 420;
const INSET = 24;
const HEADER = 44;

const html = `<!doctype html><meta charset="utf-8" />
<style>
  @font-face { font-family: "JBMono"; src: url("file:///${join(root, "assets/fonts/JetBrainsMono-Regular.ttf").replace(/\\/g, "/")}"); }
  @font-face { font-family: "JBMono"; font-weight: 500; src: url("file:///${join(root, "assets/fonts/JetBrainsMono-Medium.ttf").replace(/\\/g, "/")}"); }
  @font-face { font-family: "JBMono"; font-weight: 700; src: url("file:///${join(root, "assets/fonts/JetBrainsMono-Bold.ttf").replace(/\\/g, "/")}"); }

  * { margin:0; padding:0; box-sizing:border-box; }
  html, body { background:${T.bg0}; }
  body { width:${W}px; height:${H}px; overflow:hidden; font-family:"JBMono", monospace; position:relative; }

  /* ---- the screen header: the app's only bar ---- */
  .header { position:absolute; top:0; left:0; right:0; height:${INSET + HEADER}px;
            padding-top:${INSET}px; background:${T.surfaceRaised};
            border-bottom:1px solid ${T.line}; }
  .bar { position:relative; height:${HEADER}px; display:flex; align-items:center;
         padding:0 12px; }
  .dots { display:flex; align-items:center; gap:5px; }
  .dot { width:8px; height:8px; border-radius:4px; }
  .dot1 { background:${T.accentDot}; } .dot2,.dot3 { background:${T.line}; }
  /* the title is centred across the WHOLE bar, not the space the dots leave */
  .g-title { position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
             font-size:14px; line-height:20px; letter-spacing:.4px; color:${T.fg}; }

  /* ---- the panel: the raised surface, one step off the page ---- */
  .panel { position:absolute; left:18px; top:${INSET + HEADER + 14}px; width:${W - 36}px;
           background:${T.bg1}; border-radius:12px; overflow:hidden; }

  ${grainLayer ? `.panel .grain { position:absolute; inset:0; background-image:url(${grain});
                     background-repeat:repeat; opacity:${GRAIN_OPACITY}; }` : ""}

  /* the edge, and the sheen along the top of it */
  .panel .edge { position:absolute; inset:0; pointer-events:none;
                 border:1px solid ${T.line}; border-radius:12px; }
  .panel .sheen { position:absolute; top:0; left:0; right:0; height:1px;
                  background:${withAlpha(T.fg, SHEEN_ALPHA)}; }

  /* ---- the body: no bar of its own ---- */
  .body { padding:22px; position:relative; }
  .eyebrow { font-size:10px; line-height:14px; letter-spacing:1.4px; text-transform:uppercase;
             color:${T.fgMuted}; font-weight:500; margin-bottom:10px; }
  .title { font-size:23px; line-height:29px; letter-spacing:-.6px; color:${T.fg}; font-weight:700; }
  .sub { font-size:12px; line-height:18px; color:${T.fgMuted}; margin-top:8px; }
</style>

<div class="header">
  <div class="bar">
    <div class="dots"><span class="dot dot1"></span><span class="dot dot2"></span><span class="dot dot3"></span></div>
    <div class="g-title">Good evening</div>
  </div>
</div>

<div class="panel">
  ${grainLayer ? '<div class="grain"></div>' : ""}
  <div class="edge"></div>
  <div class="sheen"></div>
  <div class="body">
    <div class="eyebrow">COMPUTER SCIENCE &middot; NMU</div>
    <div class="title">Notes that learn you as you learn them</div>
    <div class="sub">The notes we got were good enough. But I made them better.</div>
  </div>
</div>`;

const htmlPath = join(outDir, "readme.html");
writeFileSync(htmlPath, html, "utf8");
console.log(`wrote ${htmlPath}`);

/* ------------------------------------------------------------------ *
 * the PNG — headless Chrome, which is the same engine the web target uses
 * ------------------------------------------------------------------ */

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chrome = chromePaths.find((p) => existsSync(p));
if (chrome === undefined) {
  console.error("no Chrome or Edge found — the HTML preview was written, but no PNG");
  process.exit(1);
}

const pngPath = join(outDir, "readme.png");
try {
  execFileSync(
    chrome,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--force-device-scale-factor=2",
      `--window-size=${W},${H}`,
      `--screenshot=${pngPath}`,
      `file:///${htmlPath.replace(/\\/g, "/")}`,
    ],
    { stdio: "pipe" },
  );
  console.log(`wrote ${pngPath}`);
} catch (err) {
  // Chrome writes its progress to stderr and exits non-zero on some setups;
  // the screenshot is usually still there.
  if (existsSync(pngPath)) {
    console.log(`wrote ${pngPath}`);
  } else {
    console.error(err.stderr?.toString() ?? err.message);
    process.exit(1);
  }
}
