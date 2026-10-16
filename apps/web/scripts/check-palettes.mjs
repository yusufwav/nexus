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
const PICKER = readFileSync(join(HERE, "src", "components", "theme-picker.tsx"), "utf8");
const SELECT = readFileSync(join(HERE, "src", "components", "centered-select.tsx"), "utf8");

let failures = 0;

/**
 * WCAG relative luminance. Duplicated from build-palettes.mjs rather than
 * imported, because that file runs top-to-bottom as a build step and exports
 * nothing. Two copies of a five-line standard is the cheaper trade than
 * reshaping the generator into a module; the formula is fixed by the spec, so
 * it cannot drift in the way a palette rule can.
 */
function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

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
 * Both canvas background engines parse the ramp with a hex-only reader
 * (hexToRgb in ascii-field.tsx and in gradient-ascii.tsx). A named colour or
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

/*
 * THE "LIGHT MODE PALETTES" SECTION IS REAL
 * ------------------------------------------------------------------------
 * Grouping is the one part of this feature that has no stylesheet to check it
 * against. A palette with a `group` renders identically whether or not the
 * picker honours the group, so the only failure mode is silent: the heading
 * says "Light mode palettes" and the list underneath it is dark themes, or the
 * heading is missing entirely and forty options read as one undifferentiated
 * wall.
 *
 * Both are checked here, by reading the two files that have to agree:
 * theme-picker.tsx decides which palette goes in which section, and
 * centered-select.tsx has to be able to render the heading at all.
 */
console.log("\nthe light/dark sections are wired up");
{
  const lightGrouped = [...REGISTRY.matchAll(/group:\s*"([^"]+)"/g)].map((m) => m[1]);
  const distinct = [...new Set(lightGrouped)];

  if (lightGrouped.length === 0) {
    bad("no palette in the registry carries a group, so the picker has no sections");
  } else {
    ok(`${lightGrouped.length} palettes are grouped (${distinct.join(", ")})`);
  }

  /* Every grouped palette must actually be light, measured not declared. */
  const cssLight = new Set();
  for (const m of CSS.matchAll(/^\.([a-z0-9-]+) \.nt-root \{([\s\S]*?)\n\}/gm)) {
    const bg = /--bg-0:\s*(#[0-9a-f]{6})/i.exec(m[2]);
    if (!bg) continue;
    const n = parseInt(bg[1].slice(1), 16);
    const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    const f = (v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const lum = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    if (lum > 0.72) cssLight.add(m[1]);
  }

  const declaredLight = [...REGISTRY.matchAll(/\bid:\s*"([^"]+)"[^\n]*group:\s*"light"/g)].map((m) => m[1]);
  const notActuallyLight = declaredLight.filter((id) => !cssLight.has(id));
  if (notActuallyLight.length > 0) {
    bad(`filed under "light" but their --bg-0 is dark: ${notActuallyLight.join(", ")}`);
  } else {
    ok(`all ${declaredLight.length} palettes filed as light really are bright (--bg-0 luminance > 0.72)`);
  }

  /*
   * The picker must consume the group, and must label it for the reader.
   *
   * Matched as `t.group === "light"` because that is how the code reads it -
   * an earlier version of this check searched for `group: "light"`, the
   * object-literal spelling, and reported the wiring missing while the code
   * was correct. A check that fails on working code gets ignored, so the
   * pattern has to match what is actually written.
   */
  if (!/t\.group\s*===\s*"light"/.test(PICKER)) {
    bad('theme-picker.tsx does not filter on group === "light", so nothing would be sectioned');
  } else if (!/Light mode palettes/.test(PICKER)) {
    bad('theme-picker.tsx sections the light group but never labels it "Light mode palettes"');
  } else {
    ok('theme-picker filters on group === "light" and labels the section "Light mode palettes"');
  }

  /*
   * The dark palettes need a section too, or they fall through.
   *
   * The picker's dark filter is `group === undefined`, so a palette left
   * ungrouped after light is taken would match neither list and become
   * unselectable. theme-picker throws on that at runtime; this catches it at
   * build time, and reads the same condition the picker uses rather than
   * re-deriving it.
   */
  if (!/t\.group\s*===\s*undefined/.test(PICKER)) {
    bad(
      "theme-picker.tsx does not collect group === undefined as the dark section, " +
        "so the ungrouped palettes would land outside both lists",
    );
  } else {
    ok("theme-picker collects the ungrouped palettes as the dark section");
  }

  /*
   * The real orphan case: a palette carrying a group the picker does not
   * handle.
   *
   * Note what is deliberately NOT checked here. "Ungrouped" is not an orphan
   * - ungrouped is exactly how the dark palettes are declared, and the
   * `group === undefined` filter above collects them. An earlier version of
   * this check treated every ungrouped palette as unselectable and failed on
   * all thirty dark themes, which was the check being wrong rather than the
   * code.
   *
   * So the only genuinely unreachable palette is one whose group string is
   * something other than "light": it matches neither filter and falls out of
   * the list entirely. That is the case worth a build failure.
   */
  const groupsInRegistry = [...new Set([...REGISTRY.matchAll(/group:\s*"([^"]+)"/g)].map((m) => m[1]))];
  const unknownGroup = groupsInRegistry.filter((g) => g !== "light");
  if (unknownGroup.length > 0) {
    bad(
      `these group(s) are in the registry but handled by no section in the picker, ` +
        `so those palettes would be unselectable: ${unknownGroup.join(", ")}`,
    );
  } else {
    ok("every group in the registry is handled by a section in the picker");
  }

  /* CenteredSelect has to render a heading, or the group is only data. */
  if (!/nt-sel__group/.test(SELECT)) {
    bad("centered-select.tsx never renders the group heading, so sections would not appear");
  } else {
    ok("centered-select renders a heading row for each group");
  }
}

/*
 * THE INPUT WELL IS VISIBLE ON ITS OWN PAGE
 * ------------------------------------------------------------------------
 * This one exists because a real bug shipped past every other check.
 *
 * --input-bg is built by mixing the background toward black, which is what
 * makes an input sit in a depression. On any background with room below it
 * that works. On a near-black background there is no room: #08080a mixed
 * toward black is #060607, two levels out of 255, and the resulting well
 * measured 1.006:1 against its own page - invisible.
 *
 * Nothing else caught it. The token was present, so the 72-token contract
 * passed. It was a valid hex/rgba, so the ramp check passed. The theme
 * rendered, so there was no error anywhere - just an input field that could
 * not be told apart from the surface it sat on.
 *
 * Six of the thirty original dark themes had the same defect before this
 * check existed (rose-pine, night-owl, iceberg, oxocarbon, vesper,
 * jellybeans). They were all near-black backgrounds and all had it silently.
 *
 * So the well is composited over its own page and measured. Below 1.05:1 it
 * is not a depression, it is a slightly different shade of the page.
 */
console.log("\ninput wells are visible against their own background");
{
  const parseRgba = (v) => {
    const m = /rgba?\(([^)]+)\)/.exec(v);
    if (!m) return null;
    const p = m[1].split(",").map((s) => parseFloat(s));
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const parseHex = (v) => {
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  };
  const over = (f, b) => [0, 1, 2].map((i) => f[i] * f[3] + b[i] * (1 - f[3]));

  const faint = [];
  let measured = 0;
  for (const id of registryIds) {
    if (id === "system" || id === "light" || id === "dark") continue;
    const at = selectorAt(`.${id} .nt-root`);
    if (at === -1) continue;
    const body = CSS.slice(CSS.indexOf("{", at), CSS.indexOf("}", at));
    const bg = parseHex((/--bg-0:\s*([^;]+);/.exec(body) ?? [])[1] ?? "");
    const inp = parseRgba((/--input-bg:\s*([^;]+);/.exec(body) ?? [])[1] ?? "");
    if (!bg || !inp) continue;
    measured++;
    const r =
      (Math.max(luminance(over(inp, bg)), luminance(bg)) + 0.05) /
      (Math.min(luminance(over(inp, bg)), luminance(bg)) + 0.05);
    /*
     * The bar is 1.06:1, not a round number I liked.
     *
     * It comes from the hand-written `.light` palette in tokens.css, which is
     * the one input well in this codebase that was tuned by eye and reviewed:
     * rgba(26,22,20,0.035) over #faf8f6 measures 1.072:1. Holding the
     * generated palettes to that same figure means "good enough" is defined by
     * work someone actually did, rather than by a threshold I picked and then
     * had to defend.
     *
     * 1.06 still catches the real defect comfortably - the broken wells
     * measured 1.006-1.013, an order of magnitude away - while not
     * flagging palettes whose well is subtle but genuinely present.
     */
    if (r < 1.06) faint.push(`${id} ${r.toFixed(3)}:1`);
  }
  if (faint.length > 0) {
    bad(
      `input well is barely distinguishable from the page (bar is 1.06:1, ` +
        `set from the hand-written .light reference): ${faint.join(", ")}`,
    );
  } else {
    ok(`all ${measured} input wells clear 1.06:1 against their own page`);
  }
}

console.log(
  failures === 0
    ? "\nevery palette is complete."
    : `\n${failures} problem(s). a palette missing a token renders wrong without erroring.`,
);
process.exitCode = failures === 0 ? 0 : 1;