/**
 * WHERE THE BUTTONS GO, BEFORE AND AFTER.
 * ---------------------------------------------------------------------------
 *   node scripts/preview-buttons.mjs
 *
 * A before-and-after of the button placement, drawn at the app's own sizes
 * in the app's own palette: the two examples the reader asked for, and the
 * pair that was a stack and is now a row.
 *
 * It is a mock, like the other previews, but the numbers in it are the
 * app's: the type scale, the radius scale, the button metrics, the card
 * padding and the gaps are all read out of the source where they can be,
 * so the drawing cannot drift away from the thing it is drawing.
 *
 * The three cases, each shown twice:
 *
 *   1. THE PRACTICE MODULE CARD — "start" moves onto the module name's
 *      line, at the trailing edge, and the question count moves up to the
 *      header opposite the code.
 *   2. THE "ON THIS DEVICE" CARD — "clear local data" moves from the left
 *      gutter to the middle of the card.
 *   3. THE END-OF-SESSION ACTIONS — "go again" and "all modules" stop
 *      being a stack and become a row.
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
    lineSoft: get("lineSoft"),
    surfaceRaised: get("surfaceRaised"),
    danger: get("danger"),
  });
}

const P = palettes.get("dark");

/* ------------------------------------------------------------------ *
 * the ink on a fill
 * ------------------------------------------------------------------ */

/**
 * `inkFor` in `src/lib/palette-colours.ts` — white on a fill dark enough
 * to need it, black on one light enough to carry it. The threshold is the
 * WCAG one: a fill at or above 3:1 against black takes black ink.
 */
function inkFor(background) {
  const hex = background.replace("#", "");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  const againstWhite = 1.05 / (L + 0.05);
  return againstWhite >= L ? "#ffffff" : "#000000";
}

const INK_ACCENT = inkFor(P.accentA);
const INK_DANGER = inkFor(P.danger);

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
  subheading: typeOf("subheading"),
  small: typeOf("small"),
  code: typeOf("code"),
  label: typeOf("label"),
};

/**
 * A number out of a stylesheet, out of a file.
 *
 * `styleName` is the key in the `StyleSheet.create` block and `key` is the
 * property inside it, so the drawing takes the app's own number rather
 * than a copy of it.
 */
function styleNumber(file, styleName, key) {
  const src = readFileSync(join(root, file), "utf8");
  const m = new RegExp(`${styleName}:\\s*\\{[\\s\\S]*?${key}:\\s*(\\d+)`).exec(src);
  return m === null ? 0 : Number(m[1]);
}

/** The button's own metrics, from `src/components/ui/Button.tsx`. */
const BTN_H = 48;
const BTN_PAD = 16;
const BTN_RADIUS = RADIUS_CONTROL;

/** The card's padding, from `src/components/ui/Card.tsx`. */
const CARD_PAD = 16;

/** The list row's own numbers, from `src/components/ui.tsx`. */
const ROW_PAD_Y = styleNumber("src/components/ui.tsx", "listRow", "paddingVertical");
const ROW_TITLE_MT = styleNumber("src/components/ui.tsx", "listRowDetail", "marginTop");

/** The practice module card's own numbers. */
const MODULE_GAP = styleNumber("src/app/(tabs)/practice.tsx", "moduleRow", "gap");

/** The end-of-session row. */
const ACTION_GAP = styleNumber("src/app/practice/[code].tsx", "actionRow", "gap");

/* ------------------------------------------------------------------ *
 * the pieces
 * ------------------------------------------------------------------ */

const font = (family, file) =>
  `@font-face { font-family: "${family}"; src: url("file:///${join(root, "assets/fonts", file).replace(/\\/g, "/")}"); }`;

/**
 * A button, in the app's own button.
 *
 * `full` is the sign-out button's own width: the whole of the card it is
 * in. Every button on the You screen is that size.
 */
function button(label, variant, full) {
  const skin = {
    primary: { background: P.accentA, color: INK_ACCENT, border: "none" },
    outline: { background: P.surfaceRaised, color: P.fg, border: `1px solid ${P.line}` },
    danger: { background: P.danger, color: INK_DANGER, border: "none" },
  }[variant];
  return `<div class="btn ${full === true ? "full" : ""}" style="background:${skin.background};color:${skin.color};border:${skin.border}">${label}</div>`;
}

/**
 * THE PRACTICE MODULE CARD.
 *
 * `after` is the new arrangement: the name and the button share a line, and
 * the count of quizzes sits under the name.
 */
function moduleCard(after) {
  const head = after
    ? `<div class="card-head">
         <div class="code">STAS102</div>
       </div>
       <div class="card-content">
         <div class="card-row">
           <div class="name">Calculus for CS</div>
           ${button("start", "outline")}
         </div>
         <div class="count">12 quizzes</div>
       </div>`
    : `<div class="card-head">
         <div class="code">STAS102</div>
       </div>
       <div class="card-content">
         <div class="name">Calculus for CS</div>
       </div>
       <div class="card-foot">
         <div class="count">12 questions</div>
         ${button("start", "outline")}
       </div>`;
  return `<div class="card">${head}</div>`;
}

/** THE "ON THIS DEVICE" CARD, with the one button under the rows. */
function deviceCard(after) {
  const rows = [
    ["Local database", "12 KB of notes, attempts and history"],
    ["Attempts", "Every question you have answered"],
    ["Chat history", "Every conversation with the study partner"],
  ]
    .map(
      ([title, detail]) => `<div class="row">
        <div class="row-text">
          <div class="row-title">${title}</div>
          <div class="row-detail">${detail}</div>
        </div>
      </div>`,
    )
    .join("");
  return `<div class="card">
    ${rows}
    <div class="card-body">${button("clear local data", "danger", after)}</div>
  </div>`;
}

/**
 * THE ACCOUNT CARD, with the face beside the name.
 *
 * `after` puts the picture on the name's row, at the trailing edge,
 * where the eye finishes a row.
 */
function accountCard(after) {
  const face = `<div class="avatar">Y</div>`;
  const rows = [
    `<div class="row">
       <div class="row-text">
         <div class="row-title">Email</div>
         <div class="row-detail">yusuf@nmu.ac.za</div>
       </div>
     </div>`,
    after
      ? `<div class="row">
           <div class="row-text">
             <div class="row-title">Name</div>
             <div class="row-detail">Yusuf</div>
           </div>
           <div class="row-trailing">${face}</div>
         </div>`
      : `<div class="row">
           <div class="row-text">
             <div class="row-title">Name</div>
             <div class="row-detail">Yusuf</div>
           </div>
         </div>`,
    `<div class="row">
       <div class="row-text">
         <div class="row-title">Email verified</div>
         <div class="row-detail">confirmed</div>
       </div>
       <div class="row-trailing"><div class="badge">VERIFIED</div></div>
     </div>`,
  ].join("");
  const head = after
    ? ""
    : `<div class="card-head">${face}</div>`;
  return `<div class="card">
    ${head}
    ${rows}
    <div class="card-foot">${button("save", "primary", after)}</div>
  </div>`;
}

/** THE END-OF-SESSION ACTIONS. */
function reviewActions(after) {
  if (after) {
    return `<div class="row-of-buttons">${button("go again", "primary")}${button("all modules", "outline")}</div>`;
  }
  return `<div class="stack-of-buttons">${button("go again", "primary")}${button("all modules", "outline")}</div>`;
}

/** One case, in one column. */
function caseBlock(caption, body) {
  return `<figure>
    <figcaption>${caption}</figcaption>
    <div class="phone" style="background:${P.bg0}">${body}</div>
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
  ${font("NovaMono", "NovaMono-Regular.ttf")}

  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#101014; color:#7c7c88; font-family:"JBMono", monospace;
         padding:26px 30px 34px; }
  h1 { font-size:12px; letter-spacing:2px; text-transform:uppercase;
       color:#a8b0bb; font-weight:400; margin-bottom:20px; }
  .cols { display:flex; gap:34px; align-items:flex-start; }
  .col { display:flex; flex-direction:column; gap:26px; }
  .col-title { font-size:10px; letter-spacing:1.4px; text-transform:uppercase;
               color:#5d6470; padding-bottom:2px; }
  figure { display:flex; flex-direction:column; gap:8px; }
  figcaption { font-size:9px; letter-spacing:1px; text-transform:uppercase; color:#5d6470; }
  .phone { width:390px; padding:16px; border-radius:14px;
           border:1px solid #1c1c22; display:flex; flex-direction:column; gap:0; }

  /* the card */
  .card { background:${P.bg1}; border:1px solid ${P.line};
          border-radius:${RADIUS_PANEL}px; overflow:hidden; }
  .card-head { display:flex; align-items:center; justify-content:space-between;
               padding:${CARD_PAD}px ${CARD_PAD}px 0; }
  /* A React Native View is a FLEX COLUMN, not a block box — which is the
     whole reason a button's own alignSelf decides whether it is against
     the left edge of the card or in the middle of it. */
  .card-content { padding:${CARD_PAD}px; display:flex; flex-direction:column; }
  .card-body { padding:${CARD_PAD}px; display:flex; flex-direction:column; }
  .card-foot { display:flex; align-items:center; justify-content:space-between;
               padding:${CARD_PAD}px; border-top:1px solid ${P.lineSoft}; }
  .card-row { display:flex; align-items:center; gap:${MODULE_GAP}px; }
  .card-body.centred { display:flex; justify-content:center; }

  .code { font-family:"JBMonoMedium", monospace; font-size:${TYPE.code.size}px;
          letter-spacing:${TYPE.code.track}px; color:${P.accentA}; }
  .count { font-size:${TYPE.small.size}px; line-height:${TYPE.small.line}px; color:${P.fgDim}; margin-top:4px; }
  .name { font-family:"JBMonoMedium", monospace; font-size:${TYPE.subheading.size}px;
          line-height:${TYPE.subheading.line}px; color:${P.fg}; flex:1; }

  /* the list rows — a ROW, like the app's: the text takes the space and
     whatever trails it sits at the trailing edge */
  .row { display:flex; align-items:center; padding:${ROW_PAD_Y}px ${CARD_PAD}px;
         border-bottom:1px solid ${P.lineSoft}; }
  .row-text { flex:1; }
  .row-title { font-family:"JBMonoMedium", monospace; font-size:${TYPE.subheading.size}px;
               line-height:${TYPE.subheading.line}px; color:${P.fg}; }
  .row-detail { font-size:${TYPE.small.size}px; line-height:${TYPE.small.line}px;
                color:${P.fgMuted}; margin-top:${ROW_TITLE_MT}px; }

  /* the button */
  .btn { height:${BTN_H}px; padding:0 ${BTN_PAD}px; border-radius:${BTN_RADIUS}px;
         display:flex; align-items:center; justify-content:center;
         font-family:"JBMonoMedium", monospace; font-size:${TYPE.subheading.size}px;
         letter-spacing:0.6px; white-space:nowrap;
         /* The button brings its own alignSelf, and the default is
            "flex-start" — in a COLUMN that is the horizontal axis, so the
            button is the width of its own label and sits against the left.
            In a ROW it is the vertical axis, so it sits at the top. */
         align-self:flex-start; }
  /* the sign-out button's width: the whole of the card it is in */
  .btn.full { align-self:stretch; width:100%; }
  /* the two places the app overrides that */
  .card-row .btn { align-self:center; }
  /* the face */
  .avatar { width:34px; height:34px; border-radius:17px; background:${P.accentA};
            color:${INK_ACCENT}; display:flex; align-items:center; justify-content:center;
            font-family:"JBMonoBold", monospace; font-size:14px; }
  .row-text { flex:1; }
  .row-trailing { margin-left:8px; display:flex; align-items:center; }
  .badge { font-family:"JBMonoMedium", monospace; font-size:9px; letter-spacing:1px;
           text-transform:uppercase; color:${P.ok}; }
  .row-of-buttons { display:flex; gap:${ACTION_GAP}px; align-items:center; }
  .stack-of-buttons { display:flex; flex-direction:column; gap:10px; align-items:flex-start; }
</style>

<h1>where the buttons go</h1>
<div class="cols">
  <div class="col">
    <div class="col-title">before</div>
    ${caseBlock("the practice module card", moduleCard(false))}
    ${caseBlock("the &ldquo;on this device&rdquo; card", deviceCard(false))}
    ${caseBlock("the account card", accountCard(false))}
    ${caseBlock("the end-of-session actions", reviewActions(false))}
  </div>
  <div class="col">
    <div class="col-title">after</div>
    ${caseBlock("the practice module card", moduleCard(true))}
    ${caseBlock("the &ldquo;on this device&rdquo; card", deviceCard(true))}
    ${caseBlock("the account card", accountCard(true))}
    ${caseBlock("the end-of-session actions", reviewActions(true))}
  </div>
</div>
`;

const htmlPath = join(outDir, "buttons.html");
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

const pngPath = join(outDir, "buttons.png");
execFileSync(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=960,1240",
    `--screenshot=${pngPath}`,
    `file:///${htmlPath.replace(/\\/g, "/")}`,
  ],
  // Chrome writes "N bytes written to file" to stderr, which is noise.
  { stdio: ["ignore", "ignore", "ignore"] },
);
console.log(`wrote ${pngPath}`);
