/**
 * PALETTE GENERATOR
 * ------------------------------------------------------------------------
 * Turns five colours per theme into the 72 CSS custom properties a palette
 * block must define, and writes apps/web/src/styles/palettes.generated.css.
 *
 * WHY THIS EXISTS
 *
 * A palette block is 72 tokens. Thirty themes is 2,160 hand-written lines,
 * and the failure mode of every one of them is silent: a token you forget is
 * inherited from the dark base, whose values are tuned for #000, so the
 * theme renders slightly wrong and nothing reports it. Hand-writing does not
 * scale past two themes and does not review well at thirty.
 *
 * So each theme supplies the five colours it actually defines - background,
 * foreground, muted, and two accents - and everything else is derived by
 * rules written down here. The rules are the reviewable artefact: if a
 * derived token is wrong, it is wrong for every theme at once, and fixing
 * it is a one-line change rather than 30 edits.
 *
 * WHY GENERATED CSS IS COMMITTED
 *
 * Because tokens.css has to exist for the app to build, and a build step that
 * must run before `next dev` is a build step someone will forget. The
 * generated file is committed, checked in CI by check-palettes.mjs, and
 * regenerated only when the seeds change.
 *
 * THE RULES, and why each one is what it is
 *
 *   Hairlines are the foreground hue, never white.
 *     The dark base uses rgba(255,255,255,...) everywhere because its
 *     background is black. On a warm or coloured background a neutral white
 *     hairline reads as a cold line on warm paper - this is the single most
 *     common way a ported palette looks wrong, and it is invisible in a
 *     hex diff.
 *
 *   Shadows fall to a darker version of the background, never to black.
 *     Same reason. A pure black shadow under #282828 is visibly wrong.
 *
 *   Scrims are the background hue at an alpha.
 *     A modal over a coloured page should dim that page, not punch a black
 *     hole in the middle of it.
 *
 *   Surfaces step toward the foreground in small amounts.
 *     bg-1 and bg-2 are panel colours, not new backgrounds; a fixed step of
 *     lightness reads as banding on a dark, slightly-tinted bg.
 *
 *   The third accent is a hue rotation, not a mix.
 *     Mixing two accents lands between them on the wheel and gives mud. A
 *     rotation gives a third hue that is still in the same family.
 *
 *   Status colours are rotated toward their canonical hue, then pulled back
 *     toward the palette. "ok" should read green and "danger" should read
 *     red in every theme - a reader recognises success by hue regardless of
 *     the palette - but a pure #00ff00 in a warm theme looks pasted on.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not check that a theme is legible. It reports contrast for fg on
 * bg and exits non-zero below 4.5:1, which is the one accessibility floor
 * worth gating on for a body-text colour, but it is not a full audit and
 * does not pretend to be.
 *
 * Usage, from apps/web:
 *   node scripts/build-palettes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = join(HERE, "..", "src", "styles");

/* ---------------------------------------------------------------- colour -- */

const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

function parseHex(value) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) throw new Error(`not a 6-digit hex colour: ${JSON.stringify(value)}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend: t=0 returns a, t=1 returns b. */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

/** Rotate hue by `deg` degrees, preserving saturation and lightness. */
function rotate(rgb, deg) {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgbOut = [0, 0, 0];
  if (h < 60) rgbOut = [c, x, 0];
  else if (h < 120) rgbOut = [x, c, 0];
  else if (h < 180) rgbOut = [0, c, x];
  else if (h < 240) rgbOut = [0, x, c];
  else if (h < 300) rgbOut = [x, 0, c];
  else rgbOut = [c, 0, x];
  return rgbOut.map((v) => (v + m) * 255);
}

/** Pull a colour toward a target hue without abandoning the palette's own. */
function towardHue(from, targetHue, amount) {
  let h = 0;
  const [r, g, b] = from.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  let delta = ((targetHue - h + 540) % 360) - 180;
  return rotate(from, delta * amount);
}

const rgba = (rgb, a) =>
  `rgba(${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v)))).join(", ")}, ${a})`;

/** WCAG relative luminance, for the one contrast floor worth gating on. */
function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---------------------------------------------------------------- derive -- */

function derive(p) {
  const bg = parseHex(p.bg);
  const fg = parseHex(p.fg);
  const muted = parseHex(p.muted);
  const primary = parseHex(p.primary);
  const secondary = parseHex(p.secondary);

  // A darker and a lighter step of the background, both toward the
  // foreground hue rather than toward black or white.
  const bg1 = mix(bg, fg, 0.04);
  const bg2 = mix(bg, fg, 0.09);
  const bgDeep = mix(bg, BLACK, 0.28);

  const fgMuted = mix(fg, muted, 0.5);
  const accentC = rotate(primary, 150);
  const shadowInk = mix(bg, BLACK, 0.2);

  // Status: canonical hues, pulled toward the palette's own accents so they
  // belong. Hue 135 green, 45 amber, 5 red.
  const ok = mix(towardHue(secondary, 135, 0.7), secondary, 0.2);
  const warn = mix(towardHue(secondary, 45, 0.75), primary, 0.25);
  const danger = mix(towardHue(primary, 5, 0.8), primary, 0.3);

  return {
    "--bg-0": hex(...bg),
    "--bg-1": hex(...bg1),
    "--bg-2": hex(...bg2),
    "--bg-fade": hex(...bg),

    "--fg": hex(...fg),
    "--fg-muted": hex(...fgMuted),
    "--fg-dim": hex(...muted),

    "--accent-a": hex(...primary),
    "--accent-b": hex(...secondary),
    "--accent-c": hex(...accentC),
    "--accent-dot": rgba(primary, 0.8),
    "--accent-line": rgba(secondary, 0.28),
    "--accent-soft": rgba(secondary, 0.08),

    "--syn-key": hex(...primary),
    "--syn-fn": hex(...secondary),
    "--syn-str": hex(...fgMuted),
    "--syn-num": hex(...accentC),
    "--syn-com": hex(...muted),
    "--syn-var": hex(...mix(primary, fg, 0.45)),
    "--syn-type": hex(...secondary),

    "--ok": hex(...ok),
    "--warn": hex(...warn),
    "--danger": hex(...danger),
    "--ok-fill": rgba(ok, 0.08),
    "--ok-line": rgba(ok, 0.3),
    "--warn-line": rgba(warn, 0.3),
    "--danger-fill": rgba(danger, 0.09),

    "--line": rgba(fg, 0.11),
    "--line-soft": rgba(fg, 0.055),
    "--panel": rgba(fg, 0.035),
    "--grid-line": rgba(fg, 0.05),

    "--shadow-console": `0 -20px 60px -30px ${hex(...shadowInk)}`,
    "--shadow-lg": `0 30px 80px -40px ${hex(...shadowInk)}`,
    "--shadow-md": `0 14px 40px -22px ${rgba(shadowInk, 0.8)}`,
    "--shadow-sm": `0 10px 34px -26px ${rgba(shadowInk, 0.9)}`,

    "--scrim": rgba(bg, 0.7),
    "--scrim-bar": rgba(bg, 0.3),
    "--scrim-deep": rgba(bgDeep, 0.9),
    "--scrim-soft": rgba(bg, 0.45),

    "--hover-edge": rgba(secondary, 0.4),
    "--hover-fill": rgba(secondary, 0.05),
    "--hover-glow": `0 18px 50px -26px ${rgba(secondary, 0.45)}`,

    "--input-bg": rgba(bgDeep, 0.5),
    "--input-bg-focus": rgba(bgDeep, 0.72),
    "--input-line-hover": rgba(fg, 0.16),

    "--surface-bar": rgba(fg, 0.018),
    "--surface-hover": rgba(fg, 0.022),
    "--surface-raised": rgba(fg, 0.02),
    "--switch-track": rgba(bgDeep, 0.45),

    "--glass-bg": rgba(fg, 0.028),
    "--glass-bg-hover": rgba(secondary, 0.05),
    "--glass-console": rgba(bg, 0.74),
    "--glass-edge": rgba(fg, 0.09),
    "--glass-sheen": rgba(fg, 0.05),
    "--glass-tint": rgba(fg, 0.3),
    "--glass-tint-hover": rgba(bg1, 0.72),

    "--glow-accent": rgba(secondary, 0.16),
    "--glow-accent-a": rgba(primary, 0.26),
    "--glow-accent-breathe": rgba(secondary, 0.14),
    "--glow-accent-soft": rgba(secondary, 0.05),
    "--glow-accent-strong": rgba(secondary, 0.42),
    "--bundle-glow": `0 26px 70px -30px ${rgba(secondary, 0.42)}`,

    // Hex only: hexToRgb() in ascii-field.tsx parses nothing else, and a
    // named colour here renders as a black field.
    "--ascii-op": "0.55",
    "--ascii-low": hex(...bg2),
    "--ascii-high": hex(...secondary),
    "--amb-op": "0.4",
    "--amb-low": hex(...muted),
    "--amb-high": hex(...accentC),
    "--ai-veil": rgba(bg, 0.4),

    "--grad-from": hex(...primary),
    "--grad-mid": hex(...secondary),
    "--grad-to": hex(...mix(secondary, fg, 0.35)),
  };
}

/* ----------------------------------------------------------------- build -- */

const seeds = JSON.parse(readFileSync(join(STYLES, "palette-seeds.json"), "utf8"));
const palettes = seeds.palettes;

/*
 * The registry is generated from the same seeds, and that is the point.
 *
 * It used to be a hand-written array next to a hand-written stylesheet, which
 * is two lists of the same fact. They disagreed before: a theme present in one
 * and not the other renders as a class on <html> that nothing styles, or as a
 * picker option that silently does nothing - and neither is an error.
 *
 * Generating both from palette-seeds.json makes that state unreachable. A theme
 * cannot be offered without its CSS, because there is only one place to add it.
 */
/*
 * light and dark are the brand palettes and are NOT seeded or generated.
 *
 * dark is the base - held in .nt-root in tokens.css, tuned token by token for
 * the crimson identity - and light was written by hand against it. Folding
 * them into the generator would mean re-deriving values that were chosen
 * deliberately, and the two are the palettes every other one is judged
 * against, so they should stay reviewable as prose.
 *
 * They still belong in the registry, which is why they are added here rather
 * than left out: the picker has to offer them.
 */
const brandEntries = [
  `  { id: "light", label: "Light", hint: "Bright surfaces, dark text", glyph: "☀" },`,
  `  { id: "dark", label: "Dark", hint: "Dark surfaces, light text", glyph: "☾" },`,
].join("\n");

const paletteEntries = palettes
  .map((p) => `  { id: ${JSON.stringify(p.id)}, label: ${JSON.stringify(p.label)}, hint: ${JSON.stringify(p.hint)}, glyph: ${JSON.stringify(p.glyph)} },`)
  .join("\n");

const registry = `/* GENERATED FILE - DO NOT EDIT.
 *
 * Source: apps/web/src/styles/palette-seeds.json
 * Regenerate: node scripts/build-palettes.mjs   (from apps/web)
 *
 * Generated rather than hand-written so it cannot drift from
 * palettes.generated.css - a theme the picker offers but no stylesheet
 * answers for renders as an unstyled page.
 *
 * light and dark are listed here but defined in tokens.css by hand: dark is
 * the base palette, and light was written against it. Only the palettes below
 * them are generated.
 */

export const GENERATED_THEMES = [
${brandEntries}
${paletteEntries}
  // Not a palette: an instruction to follow the OS. next-themes resolves it to
  // light or dark, and it therefore needs no block of its own.
  { id: "system", label: "Match system", hint: "Follow your operating system's setting", glyph: "⌘" },
] as const;
`;

writeFileSync(join(HERE, "..", "src", "lib", "themes.generated.ts"), registry, "utf8");

const REQUIRED = ["bg", "fg", "muted", "primary", "secondary"];
let failures = 0;

const seen = new Set();
const header = [
  "/* GENERATED FILE - DO NOT EDIT.",
  " *",
  " * Source:    apps/web/src/styles/palette-seeds.json",
  " * Generator: apps/web/scripts/build-palettes.mjs",
  " * Regenerate: node scripts/build-palettes.mjs   (from apps/web)",
  " *",
  " * Every token below is derived from that theme's five seed colours by the",
  " * rules documented in the generator. To change a palette, change its seed.",
  " * To change the derivation, change the rules - that is one edit rather than",
  " * thirty, which is the whole reason this file exists.",
  " */",
  "",
].join("\n");

const blocks = [];
const report = [];

for (const p of palettes) {
  for (const key of REQUIRED) {
    if (!p[key]) {
      console.log(`  FAIL ${p.id}: missing "${key}"`);
      failures++;
    }
  }
  if (seen.has(p.id)) {
    console.log(`  FAIL duplicate id: ${p.id}`);
    failures++;
  }
  seen.add(p.id);

  const tokens = derive(p);
  const count = Object.keys(tokens).length;

  const bg = parseHex(p.bg);
  const fg = parseHex(p.fg);
  const muted = parseHex(p.muted);
  const ratio = contrast(fg, bg);
  const mutedRatio = contrast(muted, bg);
  report.push({ id: p.id, tokens: count, ratio, mutedRatio });

  if (ratio < 4.5) {
    console.log(`  FAIL ${p.id}: body text contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
    failures++;
  }

  const lines = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`);
  blocks.push(
    `/* ${p.label} - ${p.hint} */\n.${p.id} .nt-root {\n${lines.join("\n")}\n}`,
  );
}

const out = `${header}\n${blocks.join("\n\n")}\n`;
writeFileSync(join(STYLES, "palettes.generated.css"), out, "utf8");

// Verified rather than assumed.
const written = (out.match(/^  --/gm) ?? []).length;
const expected = palettes.length * 72;

console.log(`palettes      : ${palettes.length}`);
console.log(`blocks        : ${(out.match(/^\.\S+ \.nt-root \{/gm) ?? []).length}`);
console.log(`registry      : ${palettes.length + 1} entries (${palettes.length} palettes + system)`);
console.log(`token lines   : ${written} (expected ${expected})`);
console.log(`file size     : ${Math.round(out.length / 1024)} KB`);
console.log(`consistent    : ${written === expected && written === Object.keys(derive(palettes[0])).length * palettes.length}`);
if (written !== expected) failures++;

console.log("\nbody-text contrast, worst first:");
for (const r of [...report].sort((a, b) => a.ratio - b.ratio).slice(0, 6)) {
  console.log(`  ${r.id.padEnd(18)} fg ${r.ratio.toFixed(2)}:1   muted ${r.mutedRatio.toFixed(2)}:1`);
}

process.exitCode = failures === 0 ? 0 : 1;