/**
 * THE TUTOR, BEFORE AND AFTER.
 * ---------------------------------------------------------------------------
 *   node scripts/preview-tutor.mjs
 *
 * Three changes to the tutor screen, drawn at the app's own sizes in the
 * app's own palette: the three default questions are centred in the screen
 * rather than pinned to the top, the model picker moves from a filled bar
 * under the composer to an icon in the header, and what is left under the
 * composer is the model's own name in the smallest type the app has.
 *
 * It is a mock, like the other previews, but the numbers in it are the
 * app's: the type scale, the radius scale, the header and composer metrics
 * and the gaps are all read out of the source where they can be, so the
 * drawing cannot drift away from the thing it is drawing.
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
    fg: get("fg"),
    fgMuted: get("fgMuted"),
    fgDim: get("fgDim"),
    accentA: get("accentA"),
    accentDot: get("accentDot"),
    line: get("line"),
    lineSoft: get("lineSoft"),
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
const RADIUS_PANEL = radius("panel");
const RADIUS_CONTROL = radius("control");

/** `TYPE` in `src/theme/typography.ts`. */
const typeSrc = readFileSync(join(root, "src/theme/typography.ts"), "utf8");
const typeOf = (role) => {
  const m = new RegExp(`${role}:\\s*\\{([\\s\\S]*?)\\n  \\}`).exec(typeSrc);
  const body = m?.[1] ?? "";
  return {
    size: Number(/fontSize:\s*(\d+)/.exec(body)?.[1] ?? 14),
    line: Number(/lineHeight:\s*(\d+)/.exec(body)?.[1] ?? 21),
    track: Number(/letterSpacing:\s*(-?[\d.]+)/.exec(body)?.[1] ?? 0),
  };
};
const TYPE = {
  micro: typeOf("micro"),
  small: typeOf("small"),
  subheading: typeOf("subheading"),
  label: typeOf("label"),
  body: typeOf("body"),
};

/** A number out of a stylesheet, out of a file. */
function styleNumber(file, styleName, key) {
  const src = readFileSync(join(root, file), "utf8");
  const m = new RegExp(`${styleName}:\\s*\\{[\\s\\S]*?${key}:\\s*(\\d+)`).exec(src);
  return m === null ? 0 : Number(m[1]);
}

const TUTOR = "src/app/(tabs)/tutor.tsx";
const HEADER = "src/components/ui/ScreenHeader.tsx";

/** The tutor's own numbers. */
const STARTER_PAD_X = styleNumber(TUTOR, "starter", "paddingHorizontal");
const STARTER_PAD_Y = styleNumber(TUTOR, "starter", "paddingVertical");
const STARTER_MIN = styleNumber(TUTOR, "starter", "minHeight");
const STARTER_GAP = styleNumber(TUTOR, "starter", "marginBottom");
const TOOL = styleNumber(TUTOR, "tool", "width");
const COMPOSER_PAD_L = styleNumber(TUTOR, "composerRow", "paddingLeft");
const COMPOSER_PAD_V = styleNumber(TUTOR, "composerRow", "paddingVertical");
const SEND = styleNumber(TUTOR, "send", "width");
const MODEL_LINE_GAP = styleNumber(TUTOR, "modelLine", "gap");
const MODEL_LINE_TOP = styleNumber(TUTOR, "modelLine", "marginTop");
/** The old bar, which the "before" column still draws. */
const BAR_PAD_L = styleNumber(TUTOR, "providerBar", "paddingLeft");
const BAR_PAD_R = styleNumber(TUTOR, "providerBar", "paddingRight");
const BAR_PAD_V = styleNumber(TUTOR, "providerBar", "paddingVertical");
const BAR_TOP = styleNumber(TUTOR, "providerBar", "marginTop");

/** The header's own numbers. */
const BAR_H = 44;
const DOT = 8;
const DOT_GAP = 5;
const BAR_PAD_X = 12;

const font = (family, file) =>
  `@font-face { font-family: "${family}"; src: url("file:///${join(root, "assets/fonts", file).replace(/\\/g, "/")}"); }`;

/* ------------------------------------------------------------------ *
 * the pieces
 * ------------------------------------------------------------------ */

/** A header icon, in the app's own mark. */
function tool(glyph, tone) {
  const colour = tone === "danger" ? P.danger : P.fgMuted;
  return `<div class="tool" style="color:${colour}">${glyph}</div>`;
}

/**
 * THE TUTOR SCREEN.
 *
 * `after` is the new arrangement: the starters are in the middle of the
 * screen, the bar has a fourth icon, and what is under the composer is
 * the model's name in the smallest type the app has.
 */
function tutor(after) {
  const tools = after
    ? tool("☰", "muted") + tool("↺", "muted") + tool("🗑", "danger") + tool("▣", "muted")
    : tool("☰", "muted") + tool("↺", "muted") + tool("🗑", "danger");

  const starters = [
    "Explain limits the way I would need them for a first-year calculus exam.",
    "What is the difference between a limit and the value at a point?",
    "How does the bisection method decide which half to keep?",
  ]
    .map(
      (s) => `<div class="starter">
        <div class="starter-text">${s}</div>
        <div class="starter-arrow">↑</div>
      </div>`,
    )
    .join("");

  const empty = after
    ? `<div class="empty">
         <div class="empty-head">
           <div class="label">START HERE</div>
           <div class="lead">Pick one of these, or just ask.</div>
         </div>
         <div class="empty-body">${starters}</div>
       </div>`
    : `<div class="empty">
         <div class="empty-head old">
           <div class="label">START HERE</div>
           <div class="lead old">Pick one of these, or just ask.</div>
         </div>
         <div class="empty-body old">${starters}</div>
       </div>`;

  const under = after
    ? `<div class="model-line"><div class="model-name">gpt-4o-mini</div></div>`
    : `<div class="model-bar" style="border-color:${P.line}">
         <div class="bar-text">
           <div class="bar-provider">OpenAI</div>
           <div class="bar-model">gpt-4o-mini</div>
         </div>
         <div class="bar-button">models</div>
       </div>`;

  const placeholder = after ? "What's on your mind?" : "Ask about anything in the modules";

  return `<div class="phone" style="background:${P.bg0}">
    <div class="header" style="background:${P.surfaceRaised};border-bottom-color:${P.line}">
      <div class="dots">
        <div class="dot" style="background:${P.accentDot}"></div>
        <div class="dot" style="background:${P.line}"></div>
        <div class="dot" style="background:${P.line}"></div>
      </div>
      <div class="tools">${tools}</div>
    </div>
    <div class="transcript">${empty}</div>
    <div class="composer">
      <div class="composer-row" style="border-color:${P.line}">
        <div class="composer-placeholder">${placeholder}</div>
        <div class="send" style="background:${P.accentA}">↑</div>
      </div>
      ${under}
    </div>
  </div>`;
}

/** One case, in one column. */
function caseBlock(caption, body) {
  return `<figure>
    <figcaption>${caption}</figcaption>
    ${body}
  </figure>`;
}

/* ------------------------------------------------------------------ *
 * the page
 * ------------------------------------------------------------------ */

const html = `<!doctype html><meta charset="utf-8" />
<style>
  ${font("JBMono", "JetBrainsMono-Regular.ttf")}
  ${font("JBMonoMedium", "JetBrainsMono-Medium.ttf")}
  ${font("JBMonoBold", "JetBrainsMono-Bold.ttf")}

  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#101014; color:#7c7c88; font-family:"JBMono", monospace;
         padding:26px 30px 30px; }
  h1 { font-size:12px; letter-spacing:2px; text-transform:uppercase;
       color:#a8b0bb; font-weight:400; margin-bottom:20px; }
  .cols { display:flex; gap:34px; align-items:flex-start; }
  .col { display:flex; flex-direction:column; gap:22px; }
  .col-title { font-size:10px; letter-spacing:1.4px; text-transform:uppercase;
               color:#5d6470; }
  figure { display:flex; flex-direction:column; gap:8px; }
  figcaption { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:#5d6470; }

  /* the screen */
  .phone { width:390px; height:720px; border-radius:14px; border:1px solid #1c1c22;
           display:flex; flex-direction:column; overflow:hidden; }

  /* the header */
  .header { height:${BAR_H}px; display:flex; align-items:center;
            padding:0 ${BAR_PAD_X}px 0 ${BAR_PAD_X}px; border-bottom:1px solid; position:relative; }
  .dots { display:flex; gap:${DOT_GAP}px; }
  .dot { width:${DOT}px; height:${DOT}px; border-radius:4px; }
  .tools { margin-left:auto; margin-right:48px; display:flex; align-items:center; }
  .tool { width:${TOOL}px; height:${TOOL}px; display:flex; align-items:center;
          justify-content:center; font-size:15px; }

  /* the transcript */
  .transcript { flex:1; display:flex; flex-direction:column; padding:0 18px; overflow:hidden; }
  .empty { flex:1; display:flex; flex-direction:column; }
  .empty-head { align-items:center; padding-top:12px; padding-left:8px; padding-right:8px; }
  .empty-head.old { align-items:flex-start; }
  .empty-body { flex:1; display:flex; flex-direction:column; justify-content:center; }
  .empty-body.old { flex:0; }
  .label { font-family:"JBMonoMedium", monospace; font-size:${TYPE.label.size}px;
           line-height:${TYPE.label.line}px; letter-spacing:${TYPE.label.track}px;
           text-transform:uppercase; color:${P.fgDim}; }
  .lead { font-family:"JBMonoMedium", monospace; font-size:${TYPE.subheading.size}px;
          line-height:${TYPE.subheading.line}px; color:${P.fg}; margin-top:8px; text-align:center; }
  .lead.old { text-align:left; }
  .starter { display:flex; align-items:center; gap:12px; margin-top:${STARTER_GAP}px;
             padding:${STARTER_PAD_Y}px ${STARTER_PAD_X}px; min-height:${STARTER_MIN}px;
             border:1px solid ${P.line}; border-radius:${RADIUS_PANEL}px;
             background:${P.surfaceRaised}; }
  .starter-text { flex:1; font-size:${TYPE.small.size}px; line-height:${TYPE.small.line}px;
                  color:${P.fgMuted}; }
  .starter-arrow { font-size:13px; color:${P.accentA}; }

  /* the composer */
  .composer { padding:8px 18px 18px; }
  .composer-row { display:flex; align-items:center; gap:6px;
                  border:1px solid; border-radius:${RADIUS_CONTROL}px;
                  padding:${COMPOSER_PAD_V}px ${COMPOSER_PAD_V}px ${COMPOSER_PAD_V}px ${COMPOSER_PAD_L}px; }
  .composer-placeholder { flex:1; font-size:${TYPE.body.size}px; line-height:${TYPE.body.line}px;
                          color:${P.fgDim}; }
  .send { width:${SEND}px; height:${SEND}px; border-radius:${SEND / 2}px; color:#fff;
          display:flex; align-items:center; justify-content:center; font-size:15px; }

  /* what is under the composer */
  .model-line { display:flex; align-items:center; justify-content:center;
                gap:${MODEL_LINE_GAP}px; margin-top:${MODEL_LINE_TOP}px; }
  .model-name { font-family:"JBMonoMedium", monospace; font-size:${TYPE.micro.size}px;
                line-height:${TYPE.micro.line}px; letter-spacing:${TYPE.micro.track}px;
                color:${P.fgDim}; }
  .model-bar { display:flex; align-items:center; margin:0 -18px; margin-top:${BAR_TOP}px;
               padding:${BAR_PAD_V}px ${BAR_PAD_R}px ${BAR_PAD_V}px ${BAR_PAD_L}px;
               border:1px solid; border-top:0; border-left:0; border-right:0;
               border-radius:${RADIUS_PANEL}px ${RADIUS_PANEL}px 0 0; }
  .bar-text { flex:1; padding-right:10px; }
  .bar-provider { font-family:"JBMonoMedium", monospace; font-size:${TYPE.subheading.size}px;
                  line-height:${TYPE.subheading.line}px; color:${P.fg}; }
  .bar-model { font-size:${TYPE.small.size}px; line-height:${TYPE.small.line}px;
               color:${P.fgDim}; margin-top:2px; }
  .bar-button { height:34px; padding:0 12px; border-radius:${RADIUS_CONTROL}px;
                background:${P.surfaceRaised}; border:1px solid ${P.line};
                display:flex; align-items:center;
                font-family:"JBMonoMedium", monospace; font-size:${TYPE.small.size}px;
                color:${P.fgDim}; }
</style>

<h1>the tutor screen</h1>
<div class="cols">
  <div class="col">
    <div class="col-title">before</div>
    ${caseBlock("the tutor", tutor(false))}
  </div>
  <div class="col">
    <div class="col-title">after</div>
    ${caseBlock("the tutor", tutor(true))}
  </div>
</div>
`;

const htmlPath = join(outDir, "tutor.html");
writeFileSync(htmlPath, html, "utf8");
console.log(`wrote ${htmlPath}`);

const chromePaths = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chrome = chromePaths.find((p) => existsSync(p));
if (chrome === undefined) {
  console.error("no Chrome or Edge found — the HTML preview was written, the PNG was not");
  process.exit(0);
}

const pngPath = join(outDir, "tutor.png");
execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=920,900",
    `--screenshot=${pngPath}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`,
  ],
  { stdio: ["ignore", "ignore", "ignore"] },
);
console.log(`wrote ${pngPath}`);
