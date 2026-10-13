/**
 * DOES EVERY PALETTE DEFINE EVERY TOKEN?
 * ------------------------------------------------------------------------
 * The contract, and why it is enforced rather than trusted.
 *
 * A palette is a `.gruvbox .nt-root { ... }` block in styles/tokens.css. The
 * app does not know which palettes exist - next-themes writes the id onto
 * <html> as a class and the stylesheet answers - so a palette that is short
 * a token does not error. It silently inherits the value from :root, and
 * :root is tuned for #000.
 *
 * That failure is invisible until someone looks at it. A shadow at 0.9 black
 * on #282828 is not obviously wrong, it is just heavier than intended; a
 * scrim at 0.7 pure black punches a cold hole in a warm page. Neither throws,
 * neither breaks a test, and both get shipped.
 *
 * The reference block is `.light .nt-root`, which overrides exactly the 72
 * colour tokens. Spacing, type scale, radii and motion are deliberately not
 * repeated there - they are theme-invariant - so 72 is the true contract and
 * not a convenient round number.
 *
 * Reading the contract off .light rather than hardcoding a list here means
 * the check cannot drift from the thing it checks: if someone adds a colour
 * to .light, every palette is immediately required to define it too.
 *
 * Run from apps/web:
 *   node scripts/check-palettes.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSS = readFileSync(join(HERE, "src", "styles", "tokens.css"), "utf8");

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

/** The tokens inside a `{ ... }` block, opening brace at `from`. */
function blockTokens(from) {
  const open = CSS.indexOf("{", from);
  if (open === -1) return null;
  let depth = 0;
  let end = -1;
  for (let i = open; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const body = CSS.slice(open, end);
  const tokens = new Set();
  for (const m of body.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) tokens.add(m[1]);
  return tokens;
}

/** Selector start offset for `<sel> {`, skipping the comment header. */
function selectorAt(selector) {
  // Anchor on the selector followed by whitespace and a brace, and require it
  // to be at the start of a line so ".light" cannot match inside ".light-ish".
  const re = new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[ \\t]*\\{`, "m");
  const m = re.exec(CSS);
  return m ? m.index : -1;
}

console.log("the contract: what .light overrides");
const lightAt = selectorAt(".light .nt-root");
if (lightAt === -1) {
  bad("could not find the .light block - is tokens.css refactored?");
  process.exit(1);
}
const contract = blockTokens(lightAt);
console.log(`  ${contract.size} colour tokens`);
if (contract.size < 40) bad(`only ${contract.size} tokens found - the contract looks wrong`);

console.log("\nevery palette block defines all of them");
/*
 * "dark" is listed here even though it has no `.dark .nt-root` block, and
 * that is correct rather than an omission: dark IS the base palette, held in
 * a plain `.nt-root` block, so when next-themes puts class="dark" on <html>
 * neither the .light nor the .gruvbox rule matches and `.nt-root` answers.
 * Duplicating 72 values into a .dark block would mean two copies of one
 * palette to keep in step, and .dark .nt-root at specificity (0,2,0) would
 * also have to win against itself.
 *
 * The selector match is anchored to the start of a line so ".nt-root" cannot
 * match the tail of ".light .nt-root" - which is exactly the mistake an
 * earlier version of this file made when it looked for ":root", a selector
 * that does not exist in this stylesheet. The match returned nothing, the
 * index went negative, and the block reader silently reported every token in
 * the file as belonging to the base palette.
 */
const paletteSelectors = [
  [".nt-root", "dark (base)"],
  [".light .nt-root", "light"],
  [".gruvbox .nt-root", "gruvbox"],
];

for (const [selector, name] of paletteSelectors) {
  const at = selectorAt(selector);
  if (at === -1) {
    bad(`${name}: no block for "${selector}" - the theme will not render`);
    continue;
  }
  const tokens = blockTokens(at);

  const missing = [...contract].filter((t) => !tokens.has(t));
  // :root legitimately also defines the theme-invariant tokens, so "extra"
  // is only a problem for the override blocks.
  const isBase = selector === ".nt-root";
  const extra = isBase ? [] : [...tokens].filter((t) => !contract.has(t));

  if (missing.length > 0) {
    bad(`${name}: missing ${missing.length} token(s) - they will inherit from :root, which is tuned for #000:`);
    for (const t of missing) console.log(`          ${t}`);
  } else {
    ok(`${name.padEnd(12)} defines all ${contract.size}${isBase ? " (plus theme-invariant tokens)" : ""}`);
  }
  if (extra.length > 0) {
    bad(`${name}: defines ${extra.length} token(s) the contract does not list: ${extra.join(", ")}`);
  }
}

console.log("\nhex-only where the ASCII engine requires it");
/*
 * ascii-field.tsx parses the ramp with a hex-only reader. A named colour or
 * an rgb() there renders as black - which reads as "the field is broken"
 * rather than "a token was written in the wrong notation".
 */
for (const selector of [".gruvbox .nt-root"]) {
  const at = selectorAt(selector);
  if (at === -1) continue;
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("}", open);
  const body = CSS.slice(open, close);
  for (const token of ["--ascii-low", "--ascii-high", "--amb-low", "--amb-high"]) {
    const m = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body);
    if (!m) continue;
    const value = m[1].trim();
    if (/^#[0-9a-f]{6}$/i.test(value)) ok(`${selector.split(" ")[0].slice(1)} ${token} is hex`);
    else bad(`${selector.split(" ")[0].slice(1)} ${token} = ${value}, which the hex reader cannot parse`);
  }
}

console.log("\nevery theme in the registry has a stylesheet block");
const themesSrc = readFileSync(join(HERE, "src", "lib", "themes.ts"), "utf8");
const registryIds = [...themesSrc.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
console.log(`  registry: ${registryIds.join(", ")}`);
for (const id of registryIds) {
  /*
   * "system" is an instruction, not a palette - it has no tokens of its own
   * and next-themes resolves it to light or dark. Everything else must have
   * a block, or selecting it puts a class on <html> that nothing styles.
   */
  if (id === "system") {
    ok("system needs no block (it resolves to light or dark)");
    continue;
  }
  if (id === "dark") {
    const at = selectorAt(".nt-root");
    ok(at === -1 ? "dark is the base palette but .nt-root is missing" : "dark is the base palette, expressed as .nt-root");
    continue;
  }
  const at = selectorAt(`.${id} .nt-root`);
  if (at === -1) bad(`${id} is selectable in the picker but has no .${id} .nt-root block`);
  else ok(`${id} has a block`);
}

console.log(
  failures === 0
    ? "\nevery palette is complete."
    : `\n${failures} problem(s). a palette missing a token renders wrong without erroring.`,
);
process.exitCode = failures === 0 ? 0 : 1;