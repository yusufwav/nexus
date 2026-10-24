/**
 * THE MODEL PICKER, DRAWN.
 * ---------------------------------------------------------------------------
 *   node scripts/preview-picker.mjs
 *
 * The tutor's model picker is a sheet of the app's own rows over a dimmed
 * page, and a sheet cannot be seen in a screenshot of the screen behind it.
 * So the sheet is drawn on its own here, at the app's own sizes, in the
 * app's own palette — twice: once with a provider open and once with the
 * providers all closed.
 *
 * It is a mock, like the other previews, but the numbers in it are the
 * app's: the type scale, the radius scale, the row heights and the filter
 * are all read out of the source where they can be.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, ".expo-preview");
mkdirSync(outDir, { recursive: true });

/* ------------------------------------------------------------------ *
 * the palette
 * ------------------------------------------------------------------ */

const pal = readFileSync(join(root, "src/theme/palettes.generated.ts"), "utf8");

const palettes = new Map();
for (const m of pal.matchAll(/\r?\n  "([^"]+)": \{\r?\n((?:.*\r?\n)*?)  \},/g)) {
  const body = m[2];
  const get = (k) => body.match(new RegExp(`(?:^|\\r?\\n)    ${k}: "([^"]+)"`))?.[1] ?? "";
  palettes.set(m[1], {
    bg0: get("bg0"),
    bg1: get("bg1"),
    bg2: get("bg2"),
    fg: get("fg"),
    fgMuted: get("fgMuted"),
    fgDim: get("fgDim"),
    accentA: get("accentA"),
    line: get("line"),
    surfaceRaised: get("surfaceRaised"),
  });
}

const P = palettes.get("dark");

/* ------------------------------------------------------------------ *
 * the app's own numbers
 * ------------------------------------------------------------------ */

/** `RADIUS` in `src/theme/radius.ts`. */
const radiusSrc = readFileSync(join(root, "src/theme/radius.ts"), "utf8");
const radius = (name) => {
  const m = new RegExp(`${name}:\\s*(\\d+)`).exec(radiusSrc);
  return m === null ? 0 : Number(m[1]);
};
const RADIUS_FIELD = radius("field");
const RADIUS_PANEL = radius("panel");

/** `TYPE` in `src/theme/typography.ts` — the sizes the picker uses. */
const typeSrc = readFileSync(join(root, "src/theme/typography.ts"), "utf8");
const typeSize = (role) => {
  const m = new RegExp(`${role}:\\s*\\{[\\s\\S]*?fontSize:\\s*(\\d+)`).exec(typeSrc);
  return m === null ? 14 : Number(m[1]);
};
const SIZE_LABEL = typeSize("label");
const SIZE_SUBHEADING = typeSize("subheading");
const SIZE_BODY = typeSize("body");
const SIZE_SMALL = typeSize("small");

/** The row's own numbers, from the picker's styles. */
const uiSrc = readFileSync(join(root, "src/components/ui.tsx"), "utf8");
const uiNumber = (styleName, key) => {
  const m = new RegExp(`${styleName}:\\s*\\{[\\s\\S]*?${key}:\\s*(\\d+)`).exec(uiSrc);
  return m === null ? 0 : Number(m[1]);
};
const ROW_PAD_X = uiNumber("selectRow", "paddingHorizontal");
const ROW_PAD_Y = uiNumber("selectRow", "paddingVertical");
const GROUP_PAD_X = uiNumber("selectGroup", "paddingHorizontal");
const GROUP_PAD_Y = uiNumber("selectGroup", "paddingVertical");
const FILTER_PAD_X = uiNumber("selectFilterRow", "paddingHorizontal");
const FILTER_PAD_Y = uiNumber("selectFilterRow", "paddingVertical");
const TRIGGER_PAD_X = uiNumber("selectTrigger", "paddingHorizontal");
const TRIGGER_MIN = uiNumber("selectTrigger", "minHeight");
const SHEET_MAX = 62;

/* ------------------------------------------------------------------ *
 * the two states
 * ------------------------------------------------------------------ */

/** What the sheet shows, and whether a provider is open. */
const PROVIDERS = [
  { id: "pv_openai", name: "OpenAI", detail: "6 free", open: true },
  { id: "pv_anthropic", name: "Anthropic", detail: "2 free", open: false },
  { id: "pv_openrouter", name: "OpenRouter", detail: "loading…", open: false },
];

const MODELS = [
  { id: "gpt-5", label: "GPT-5", free: true },
  { id: "gpt-5-mini", label: "GPT-5 mini", free: true },
  { id: "gpt-4.1", label: "GPT-4.1", free: false },
  { id: "o4-mini", label: "o4-mini", free: true },
  { id: "gpt-4o", label: "GPT-4o", free: false },
  { id: "gpt-4o-mini", label: "GPT-4o mini", free: true },
];

const font = (family, file) =>
  `@font-face { font-family: "${family}"; src: url("file:///${join(root, "assets/fonts", file).replace(/\\/g, "/")}"); }`;

/**
 * The sheet.
 *
 * `providers` says which ones are open, so the same drawing shows the
 * picker closed and the picker open.
 */
function sheet(providers, title) {
  const rows = providers
    .map((p) => {
      const heading = `<div class="group">
      <div class="group-label">${p.name}</div>
      <div class="group-detail">${p.detail}</div>
      <div class="group-chevron">${p.open ? "▾" : "▸"}</div>
    </div>`;
      if (!p.open) return heading;
      const models = MODELS.filter((m) => m.free)
        .map(
          (m) => `<div class="row">
        <div class="row-text">
          <div class="row-label">${m.label}</div>
          <div class="row-detail">${m.id}  ·  free</div>
        </div>
        ${m.id === "gpt-5" ? '<div class="tick">✓</div>' : ""}
      </div>`,
        )
        .join("");
      return heading + models;
    })
    .join("");

  return `<figure>
  <figcaption>${title}</figcaption>
  <div class="phone" style="background:${P.bg0}">
    <div class="scrim"></div>
    <div class="sheet" style="background:${P.bg1}; border-color:${P.line}">
      <div class="filter" style="border-color:${P.line}">
        <div class="filter-label">Free only</div>
        <div class="switch" style="background:${P.accentA}"><div class="knob" style="background:${P.fg}"></div></div>
      </div>
      ${rows}
    </div>
  </div>
</figure>`;
}

const html = `<!doctype html><meta charset="utf-8" />
<style>
  ${font("JBMono", "JetBrainsMono-Regular.ttf")}
  ${font("JBMonoMedium", "JetBrainsMono-Medium.ttf")}
  ${font("JBMonoBold", "JetBrainsMono-Bold.ttf")}
  ${font("NovaMono", "NovaMono-Regular.ttf")}

  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#101014; color:#7c7c88; font-family:"JBMono", monospace;
         display:flex; gap:36px; padding:28px; align-items:flex-start; }
  figure { display:flex; flex-direction:column; gap:10px; }
  figcaption { font-size:10px; letter-spacing:1px; text-transform:uppercase; }

  .phone { position:relative; width:390px; height:560px; overflow:hidden; border-radius:16px; }
  .scrim { position:absolute; inset:0; background:${P.bg0}CC; }

  .sheet { position:absolute; left:22px; right:22px; top:70px;
           border:1px solid; border-radius:${RADIUS_PANEL}px; overflow:hidden; }

  .filter { display:flex; align-items:center; justify-content:space-between;
            padding:${FILTER_PAD_Y}px ${FILTER_PAD_X}px; border-bottom:1px solid; }
  .filter-label { font-size:${SIZE_SUBHEADING}px; color:${P.fg}; }
  .switch { width:40px; height:22px; border-radius:11px; position:relative; }
  .knob { position:absolute; right:2px; top:2px; width:18px; height:18px; border-radius:9px; }

  .group { display:flex; align-items:center; gap:10px;
           padding:${GROUP_PAD_Y}px ${GROUP_PAD_X}px; }
  .group-label { flex:1; font-size:${SIZE_SUBHEADING}px; color:${P.fg}; }
  .group-detail { font-size:${SIZE_SMALL}px; color:${P.fgDim}; }
  .group-chevron { font-size:${SIZE_BODY}px; color:${P.fgDim}; width:16px; text-align:right; }

  .row { display:flex; align-items:center;
         padding:${ROW_PAD_Y}px ${ROW_PAD_X}px; }
  .row-text { flex:1; padding-right:10px; }
  .row-label { font-size:${SIZE_SUBHEADING}px; color:${P.fg}; }
  .row-detail { font-size:${SIZE_SMALL}px; color:${P.fgDim}; margin-top:2px; }
  .tick { font-size:${SIZE_BODY}px; color:${P.accentA}; }

  /* the trigger, in the bar */
  .trigger { display:flex; align-items:center; justify-content:center;
             width:104px; min-height:${TRIGGER_MIN}px;
             padding:0 ${TRIGGER_PAD_X}px; border-radius:${RADIUS_FIELD}px;
             background:${P.surfaceRaised}; border:1px solid ${P.line};
             font-size:${SIZE_SUBHEADING}px; color:${P.fgDim}; }
</style>

<h2 style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a8b0bb;margin-bottom:14px">the trigger, in the bar</h2>
<div style="display:flex;gap:36px;align-items:center;margin-bottom:26px">
  <div class="trigger">models</div>
  <div style="font-size:11px;color:#6b7280">104 wide, no arrow, and it says what it opens</div>
</div>

<h2 style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a8b0bb;margin-bottom:14px">the sheet</h2>
${sheet(
  [
    { id: "pv_openai", name: "OpenAI", detail: "6 free", open: true },
    { id: "pv_anthropic", name: "Anthropic", detail: "2 free", open: false },
    { id: "pv_openrouter", name: "OpenRouter", detail: "loading…", open: false },
  ],
  "a provider open",
)}
${sheet(
  [
    { id: "pv_openai", name: "OpenAI", detail: "6 free", open: false },
    { id: "pv_anthropic", name: "Anthropic", detail: "2 free", open: false },
    { id: "pv_openrouter", name: "OpenRouter", detail: "loading…", open: false },
  ],
  "all closed — the models are collapsed into the names",
)}
`;

const htmlPath = join(outDir, "picker.html");
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

const pngPath = join(outDir, "picker.png");
execFileSync(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--force-device-scale-factor=1",
  "--window-size=1300,900",
  `--screenshot=${pngPath}`,
  `file:///${htmlPath.replace(/\\/g, "/")}`,
]);
console.log(`wrote ${pngPath}`);
