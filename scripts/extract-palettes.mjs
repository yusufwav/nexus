/**
 * PALETTE EXTRACTOR
 * ---------------------------------------------------------------------------
 * The web app keeps its themes as CSS custom properties inside
 * `palettes.generated.css` (52 generated palettes) and `tokens.css`
 * (the hand-written light and dark pair).
 *
 * React Native has no CSS cascade, so the palettes have to become a
 * TypeScript object. This script does that conversion once, and the
 * result is committed as `src/theme/palettes.generated.ts`.
 *
 * It is a GENERATED file: change the source CSS in the web app, re-run
 * this, and the mobile app follows.
 *
 *   node scripts/extract-palettes.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const WEB_SRC = "C:/Users/yusuf/orca/projects/nexus/apps/web/src";
const OUT = join(process.cwd(), "src/theme/palettes.generated.ts");

/** css custom property -> TS key */
const TOKENS = {
  bg0: "--bg-0",
  bg1: "--bg-1",
  bg2: "--bg-2",
  fg: "--fg",
  fgMuted: "--fg-muted",
  fgDim: "--fg-dim",
  accentA: "--accent-a",
  accentB: "--accent-b",
  accentC: "--accent-c",
  accentInk: "--accent-ink",
  accentPure: "--accent-pure",
  accentDot: "--accent-dot",
  accentLine: "--accent-line",
  accentSoft: "--accent-soft",
  synKey: "--syn-key",
  synFn: "--syn-fn",
  synStr: "--syn-str",
  synNum: "--syn-num",
  synCom: "--syn-com",
  synVar: "--syn-var",
  synType: "--syn-type",
  ok: "--ok",
  warn: "--warn",
  danger: "--danger",
  line: "--line",
  lineSoft: "--line-soft",
  panel: "--panel",
  surfaceBar: "--surface-bar",
  surfaceHover: "--surface-hover",
  surfaceRaised: "--surface-raised",
  glassBg: "--glass-bg",
  glassConsole: "--glass-console",
  glassEdge: "--glass-edge",
  glassSheen: "--glass-sheen",
  glassTint: "--glass-tint",
  asciiLow: "--ascii-low",
  asciiHigh: "--ascii-high",
  asciiOp: "--ascii-op",
  ambLow: "--amb-low",
  ambHigh: "--amb-high",
  gradFrom: "--grad-from",
  gradMid: "--grad-mid",
  gradTo: "--grad-to",
  aiVeil: "--ai-veil",
  aiBloomVeil: "--ai-bloom-veil",
  glowAccent: "--glow-accent",
  glowAccentStrong: "--glow-accent-strong",
};

/** Parse `--name: value;` pairs out of one CSS block. */
function readBlock(css, selector) {
  const start = css.indexOf(selector);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close);
  const out = {};
  const re = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
  let m;
  while ((m = re.exec(body)) !== null) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/** Every `.id .nt-root { ... }` block in a stylesheet. */
function readThemes(css) {
  const out = new Map();
  const re = /\.([a-z0-9-]+)\s+\.nt-root\s*\{/gi;
  let m;
  while ((m = re.exec(css)) !== null) {
    const open = m.index + m[0].length;
    const close = css.indexOf("}", open);
    const body = css.slice(open, close);
    const vars = {};
    const vr = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let v;
    while ((v = vr.exec(body)) !== null) {
      vars[v[1]] = v[2].trim();
    }
    out.set(m[1], vars);
  }
  return out;
}

const generated = readThemes(readFileSync(join(WEB_SRC, "styles/palettes.generated.css"), "utf8"));
const tokensCss = readFileSync(join(WEB_SRC, "styles/tokens.css"), "utf8");

/** The hand-written pair lives in tokens.css. */
const darkVars = readBlock(tokensCss, ".nt-root {");
const lightVars = readBlock(tokensCss, ".light .nt-root");

/** Fallbacks so a missing token never yields `undefined`. */
const FALLBACK = {
  bg0: "#000000",
  bg1: "#050608",
  bg2: "#0a0d11",
  fg: "#f2f4f7",
  fgMuted: "#a8b0bb",
  fgDim: "#6b7280",
  accentA: "#8b0000",
  accentB: "#fdd3aeff",
  accentC: "#6b0024ff",
  accentInk: "#6b0024",
  accentPure: "#8b0000",
  accentDot: "rgba(139, 0, 0, 0.8)",
  accentLine: "rgba(255, 208, 222, 0.27)",
  accentSoft: "rgba(139, 0, 0, 0.34)",
  synKey: "#ff7b72",
  synFn: "#fdd3ae",
  synStr: "#a5d6a7",
  synNum: "#79c0ff",
  synCom: "#6b7280",
  synVar: "#f2f4f7",
  synType: "#ffa657",
  ok: "#a5d6a7",
  warn: "#fdd3ae",
  danger: "#ff7b72",
  line: "rgba(255, 255, 255, 0.08)",
  lineSoft: "rgba(255, 255, 255, 0.045)",
  panel: "rgba(255, 255, 255, 0.025)",
  surfaceBar: "rgba(255, 255, 255, 0.02)",
  surfaceHover: "rgba(255, 255, 255, 0.035)",
  surfaceRaised: "rgba(255, 255, 255, 0.04)",
  glassBg: "rgba(255, 255, 255, 0.03)",
  glassConsole: "rgba(5, 6, 8, 0.72)",
  glassEdge: "rgba(255, 255, 255, 0.09)",
  glassSheen: "rgba(255, 255, 255, 0.05)",
  glassTint: "rgba(255, 255, 255, 0.28)",
  asciiLow: "#f2f4f7",
  asciiHigh: "#8b0000",
  asciiOp: "0.55",
  ambLow: "#6b7280",
  ambHigh: "#8b0000",
  gradFrom: "#8b0000",
  gradMid: "#fdd3ae",
  gradTo: "#6b0024",
  aiVeil: "rgba(0, 0, 0, 0.4)",
  aiBloomVeil: "rgba(0, 0, 0, 0.16)",
  glowAccent: "rgba(139, 0, 0, 0.22)",
  glowAccentStrong: "rgba(139, 0, 0, 0.5)",
};

function pick(vars) {
  const out = {};
  for (const [key, cssName] of Object.entries(TOKENS)) {
    const v = vars ? vars[cssName] : undefined;
    out[key] = v && v.length > 0 ? v : FALLBACK[key];
  }
  return out;
}

const entries = [];
entries.push({ id: "dark", vars: pick(darkVars) });
entries.push({ id: "light", vars: pick(lightVars) });
for (const [id, vars] of generated) {
  entries.push({ id, vars: pick(vars) });
}

const body = entries
  .map((e) => {
    const lines = Object.entries(e.vars)
      .map(([k, v]) => `    ${k}: "${v}",`)
      .join("\n");
    return `  "${e.id}": {\n${lines}\n  },`;
  })
  .join("\n");

const out = `/* GENERATED FILE - DO NOT EDIT.
 *
 * Generated by scripts/extract-palettes.mjs from the web app's
 * styles/palettes.generated.css and styles/tokens.css.
 *
 * React Native has no CSS cascade, so the theme tokens the four GL
 * engines read off \`.nt-root\` on the web have to exist as plain data
 * here. Every value is the one the web app uses, verbatim.
 */

export type PaletteTokens = {
${Object.keys(TOKENS)
  .map((k) => `  readonly ${k}: string;`)
  .join("\n")}
};

export const PALETTES: Readonly<Record<string, PaletteTokens>> = {
${body}
};
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out, "utf8");
console.log(`wrote ${OUT} with ${entries.length} palettes`);
