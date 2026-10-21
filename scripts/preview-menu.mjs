/**
 * Renders the side menu's panel to a page, so the layout can be LOOKED at
 * without a device.
 *
 *   node scripts/preview-menu.mjs
 *
 * It draws the panel with the same metrics the component uses — the same
 * width rule, the same type sizes, the same gaps — in the app's own dark
 * and light palettes, with the real JetBrains Mono files.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

/* ---- the palettes, out of the generated file ---- */
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
    accentB: get("accentB"),
  });
}

/* ---- the metrics, as the component has them ---- */
const SCREEN = { w: 390, h: 844 };
const INSET_TOP = 47;
const PANEL_WIDTH = Math.min(Math.max(SCREEN.w * 0.86, 260), 420);
const ITEM_SIZE = Math.min(44, Math.floor((PANEL_WIDTH - 48 - 36) / 8 / 0.6));
const ITEMS = [
  ["Home", "01"],
  ["Modules", "02"],
  ["Practice", "03"],
  ["Tutor", "04"],
  ["You", "05"],
];
const FOOTER = ["About", "Appearance"];

const font = (weight, file) =>
  `@font-face { font-family: "JetBrainsMono-${weight}"; src: url("file:///${join(
    root,
    "assets/fonts",
    file,
  ).replace(/\\/g, "/")}"); }`;

const panel = (id, label) => {
  const p = palettes.get(id);
  return `<figure>
  <div class="phone" style="background:${p.bg0}">
    <div class="app">
      <div class="app-bar">nexus ~/zsh 120x40</div>
      <div class="app-title">Notes that learn you as you learn them</div>
      <div class="app-line"></div>
      <div class="app-line short"></div>
      <div class="app-line"></div>
    </div>
    <div class="scrim"></div>
    <div class="slab slab-a" style="background:${p.accentA}"></div>
    <div class="slab slab-b" style="background:${p.accentB}"></div>
    <div class="panel" style="width:${PANEL_WIDTH}px; background:${p.bg1}; border-left:1px solid ${p.accentA}66">
      <div class="panel-inner" style="padding-top:${INSET_TOP + 64}px">
        <div class="list">
          ${ITEMS.map(
            ([name, number]) => `<div class="item">
            <span class="label" style="font-size:${ITEM_SIZE}px; line-height:${(ITEM_SIZE * 1.09).toFixed(
              2,
            )}px; color:${p.fg}">${name.toUpperCase()}</span>
            <span class="number" style="color:${p.accentA}">${number}</span>
          </div>`,
          ).join("\n")}
        </div>
        <div class="footer">
          <div class="footer-title" style="color:${p.accentA}">THE APP</div>
          <div class="footer-links">
            ${FOOTER.map((f) => `<span style="color:${p.fg}">${f}</span>`).join("")}
          </div>
        </div>
      </div>
    </div>
    <div class="toggle" style="top:${INSET_TOP + 10}px; background:${p.bg1}; border:1px solid ${p.accentA}44">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${p.fg}" stroke-width="1.75"
        stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
    </div>
  </div>
  <figcaption>${label} — ${id}</figcaption>
</figure>`;
};

const html = `<!doctype html><meta charset="utf-8" />
<style>
  ${font("Bold", "JetBrainsMono-Bold.ttf")}
  ${font("Medium", "JetBrainsMono-Medium.ttf")}
  ${font("Regular", "JetBrainsMono-Regular.ttf")}
  body { background:#101216; color:#f2f4f7; font:12px ui-monospace,monospace; margin:0; padding:20px; }
  .row { display:flex; gap:28px; align-items:flex-start; }
  figure { margin:0; }
  .phone { position:relative; width:${SCREEN.w}px; height:${SCREEN.h}px; overflow:hidden; border:1px solid #ffffff20; }
  .app { position:absolute; inset:0; padding:34px 18px; }
  .app-bar { font-family:"JetBrainsMono-Regular",monospace; font-size:12px; color:#6b7280;
    border:1px solid #ffffff14; padding:10px 12px; }
  .app-title { font-family:"JetBrainsMono-Bold",monospace; font-size:20px; margin-top:20px; }
  .app-line { height:8px; background:#ffffff12; margin-top:14px; }
  .app-line.short { width:60%; }
  .scrim { position:absolute; inset:0; background:rgba(0,0,0,0.42); }
  .slab { position:absolute; top:0; bottom:0; right:0; width:${PANEL_WIDTH}px; }
  .panel { position:absolute; top:0; bottom:0; right:0; overflow:hidden; }
  .panel-inner { height:100%; padding-left:24px; padding-right:24px; padding-bottom:28px;
    display:flex; flex-direction:column; justify-content:space-between; box-sizing:border-box; }
  .list { display:flex; flex-direction:column; gap:2px; }
  .item { display:flex; align-items:flex-start; overflow:hidden; padding:2px 0; }
  .label { font-family:"JetBrainsMono-Bold",monospace; letter-spacing:-1.2px; white-space:nowrap; }
  .number { font-family:"JetBrainsMono-Medium",monospace; font-size:15px; line-height:20px; margin-left:28px; padding-top:3px; }
  .footer { padding-top:24px; }
  .footer-title { font-family:"JetBrainsMono-Medium",monospace; font-size:10px; line-height:14px;
    letter-spacing:1.4px; text-transform:uppercase; }
  .footer-links { display:flex; gap:18px; margin-top:10px; font-family:"JetBrainsMono-Medium",monospace;
    font-size:14px; line-height:20px; }
  .toggle { position:absolute; right:14px; width:40px; height:40px; display:flex; align-items:center;
    justify-content:center; }
  figcaption { padding-top:8px; color:#a8b0bb; }
</style>
<div class="row">${panel("dark", "the dark palette")}${panel("light", "the light palette")}</div>`;

const out = join(root, ".expo-preview-menu.html");
writeFileSync(out, html, "utf8");
console.log(`wrote ${out} (panel ${PANEL_WIDTH}px, item ${ITEM_SIZE}px)`);
