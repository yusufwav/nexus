/**
 * COLOUR CONTRAST AUDIT — for the bring-your-own-key section
 * ------------------------------------------------------------
 * Reads the REAL token values out of tokens.css (both the default and
 * the `.light` block) and computes the WCAG contrast ratio for every
 * foreground/background pair that `.nt-keys` actually creates.
 *
 * The point is that a token name is not a guarantee. `--fg-dim` exists,
 * resolves in both themes, and is still unreadable at `--fs-xs` — so the
 * only way to know is to compute it.
 *
 *   node scripts/audit-key-colours.mjs
 */

/* ---------- token extraction, straight from the stylesheet ---------- */
import { readFileSync } from "node:fs";

const css = readFileSync("src/styles/tokens.css", "utf8");

function block(startMarker, endMarker) {
  const from = css.indexOf(startMarker);
  const to = css.indexOf(endMarker, from);
  return css.slice(from, to);
}

// The two theme scopes, located by their opening selectors.
const scopes = [
  { theme: "dark", body: css.slice(css.indexOf(".nt-root {"), css.indexOf(".light .nt-root {")) },
  {
    theme: "light",
    body: css.slice(css.indexOf(".light .nt-root {"), css.lastIndexOf("}")),
  },
];

/** Every `--token: value` in a block, hex or rgba. */
function tokens(blockBody) {
  const out = {};
  for (const m of blockBody.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out[m[1]] = m[2].trim();
  }
  return out;
}

/* ---------- colour maths ---------- */
function hexToRgb(hex) {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function parse(value) {
  if (value.startsWith("#")) return { rgb: hexToRgb(value), a: 1 };
  const m = value.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
  return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
}

function over(fg, bg, alpha) {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));
}

function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Resolve a token to an opaque rgb, compositing over a page background. */
function resolve(tok, name, pageBg) {
  const raw = tok[name];
  if (!raw) return null;
  const p = parse(raw);
  if (!p) return null;
  return p.a === 1 ? p.rgb : over(p.rgb, pageBg, p.a);
}

/* ---------- run ---------- */
const results = [];

for (const scope of scopes) {
  const tok = tokens(scope.body);
  const bg0 = resolve(tok, "bg-0", [0, 0, 0]); // page/field background
  const bg1 = resolve(tok, "bg-1", [0, 0, 0]);
  const pageBg = bg1;
  // The section sits on the settings group body, which is --panel over
  // the page; the key rows add --glass-bg on top of that.
  const panel = resolve(tok, "panel", pageBg);
  const rowBg = resolve(tok, "glass-bg", panel);

  // [label, fg token, background it is drawn on, minimum required]
  // 11.2px (`--fs-xs`) is normal text under WCAG, so 4.5 is the bar
  // everywhere — none of this qualifies as large text.
  //
  // This list is the set of colours `.nt-keys` actually declares. It
  // used to also probe `--fg-dim` as a "what if" comparison, which made
  // the script keep reporting failures for a token nothing referenced
  // any more. Keep it in step with the stylesheet or it stops being a
  // regression guard and turns into a source of false alarms.
  const pairs = [
    ["lead paragraph", "fg-muted", panel, 4.5],
    ["lead emphasis", "fg", panel, 4.5],
    ["provider name", "fg", rowBg, 4.5],
    ["key tail (accent)", "accent-b", rowBg, 4.5],
    ["model id", "fg-muted", rowBg, 4.5],
    ["field label", "fg-muted", panel, 4.5],
    ["input text", "fg", bg0, 4.5],
    ["delete icon", "fg-muted", rowBg, 4.5],
    ["delete icon hover", "danger", rowBg, 4.5],
    ["success note", "fg-muted", panel, 4.5],
    ["error note", "danger", panel, 4.5],
  ];

  console.log(`\n=== ${scope.theme.toUpperCase()} ===`);
  for (const [label, name, bg, need] of pairs) {
    const fg = resolve(tok, name, pageBg);
    if (!fg || !bg) {
      console.log(`  ?     ${label.padEnd(28)} (token '${name}' not found)`);
      continue;
    }
    const ratio = contrast(fg, bg);
    const ok = ratio >= need;
    results.push({ theme: scope.theme, label, ratio, ok });
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(28)} ${ratio.toFixed(2)}:1  (need ${need})`,
    );
  }
}

/* ---------- verdict ---------- */
const failed = results.filter((r) => !r.ok);
console.log("");
if (failed.length === 0) {
  console.log("every pair meets WCAG AA in both themes");
} else {
  console.log(`${failed.length} pair(s) below the 4.5:1 AA bar:`);
  for (const f of failed) {
    console.log(`  ${f.theme.padEnd(6)} ${f.label} — ${f.ratio.toFixed(2)}:1`);
  }
  process.exitCode = 1;
}