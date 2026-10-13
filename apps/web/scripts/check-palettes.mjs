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
const CSS = [
  readFileSync(join(HERE, "src", "styles", "tokens.css"), "utf8"),
  readFileSync(join(HERE, "src", "styles", "palettes.generated.css"), "utf8"),
].join("\n");
const REGISTRY = readFileSync(join(HERE, "src", "lib", "themes.generated.ts"), "utf8");

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
 * no other rule matches and `.nt-root` answers. Duplicating 72 values into a
 * .dark block would mean two copies of one palette to keep in step.
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
];

/* Every generated palette, found by scanning rather than by a hardcoded list,
 * so a new seed cannot be added without being checked.
 *
 * "light" is excluded because it lives in tokens.css and is already listed
 * above. Leaving it in scanned it twice and made the count wrong, which is
 * the kind of wrong that makes a number stop being worth reading. */
const generatedIds = [...CSS.matchAll(/^\.([a-z0-9-]+) \.nt-root \{/gm)]
  .map((m) => m[1])
  .filter((id) => id !== "light");
for (const id of generatedIds) paletteSelectors.push([`.${id} .nt-root`, id]);

console.log(`  ${generatedIds.length} generated palettes + light + the dark base`);
if (generatedIds.length === 0) bad("no generated palette blocks found - is palettes.generated.css committed?");

for (const [selector, name] of paletteSelectors) {
  const at = selectorAt(selector);
  if (at === -1) {
    bad(`${name}: no block for "${selector}" - the theme will not render`);
    continue;
  }
  const tokens = blockTokens(at);

  const missing = [...contract].filter((t) => !tokens.has(t));
  // The base legitimately also defines the theme-invariant tokens, so "extra"
  // is only a problem for the override blocks.
  const isBase = selector === ".nt-root";
  const extra = isBase ? [] : [...tokens].filter((t) => !contract.has(t));

  if (missing.length > 0) {
    bad(`${name}: missing ${missing.length} token(s) - they will inherit from the dark base, tuned for #000:`);
    for (const t of missing) console.log(`          ${t}`);
  } else {
    ok(`${name.padEnd(18)} defines all ${contract.size}${isBase ? " (plus theme-invariant tokens)" : ""}`);
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
const HEX_TOKENS = ["--ascii-low", "--ascii-high", "--amb-low", "--amb-high"];
let hexChecked = 0;
for (const id of generatedIds) {
  const at = selectorAt(`.${id} .nt-root`);
  if (at === -1) continue;
  const open = CSS.indexOf("{", at);
  const close = CSS.indexOf("}", open);
  const body = CSS.slice(open, close);
  for (const token of HEX_TOKENS) {
    const m = new RegExp(`${token}\\s*:\\s*([^;]+);`).exec(body);
    if (!m) continue;
    hexChecked++;
    const value = m[1].trim();
    if (!/^#[0-9a-f]{6}$/i.test(value)) {
      bad(`${id} ${token} = ${value}, which the hex reader cannot parse`);
    }
  }
}
if (hexChecked > 0) ok(`${hexChecked} ramp tokens across ${generatedIds.length} palettes are hex`);

console.log("\nevery theme in the registry has a stylesheet block");
const registryIds = [...REGISTRY.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
console.log(`  registry has ${registryIds.length} entries`);
if (new Set(registryIds).size !== registryIds.length) {
  bad("the registry contains duplicate ids");
}
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