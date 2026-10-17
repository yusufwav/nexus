/**
 * HORIZON BLOOM PALETTE AUDIT
 * ------------------------------------------------------------------------
 * The tutor chat's background picks its two light colours out of the active
 * theme - the brightest and the most saturated - and that choice is invisible
 * until it is wrong. Fifty palettes generate the tokens, none of them is
 * checked, and a change to a seed colour or to the candidate list can quietly
 * leave a palette with two greys, or with the effect's white-on-white.
 *
 * So this reads the REAL token values out of tokens.css and
 * palettes.generated.css - every palette in the registry, not two samples -
 * runs the same derivation the component runs, and asserts the result.
 *
 *   node scripts/audit-horizon-colours.mjs
 *
 * What is asserted, and why each one is a failure rather than a note:
 *
 *   1. Both colours came from the palette. A fallback means the derivation
 *      found nothing, which for a palette that definitely has colours in it
 *      is a bug in the derivation, not a palette with no colours.
 *
 *   2. The two colours are not the same token. The effect blends warm into
 *      cool across its atmosphere; if they are one colour the blend is a no-op
 *      and the whole OKLab path in the shader does nothing.
 *
 *   3. warm is lighter than cool. The effect's warm colour is the light near
 *      the surface and its cool colour is the upper atmosphere, and the ramp
 *      between them is what gives the horizon depth. A palette where the
 *      brightest colour is darker than the most saturated one renders, but
 *      the depth inverts and it is worth knowing a palette did it.
 *
 *   4. In a dark palette both colours are visible against the background, and
 *      in a light palette both are dark enough to read as ink. Measured as
 *      WCAG contrast against --bg-0, which is the number that decides whether
 *      there is anything to see.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const here = import.meta.dirname;
const web = path.join(here, "..");

// pathToFileURL, not a bare path: on Windows an absolute path arrives with a
// `c:` protocol and the ESM loader rejects it as an unknown scheme.
const { horizonPalette, relativeLuminance, parseColor, srgbToOklab, HORIZON_CANDIDATES } = await import(
  pathToFileURL(path.join(web, "src", "lib", "horizon-colours.ts")).href
);

/* ---------- token extraction, straight from the stylesheets ---------- */

/** Every `--token: value` inside a block body. */
function tokens(blockBody) {
  const out = {};
  for (const m of blockBody.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out["--" + m[1]] = m[2].trim();
  }
  return out;
}

/**
 * The base palette and the light palette are hand-written in tokens.css; the
 * other forty-eight are generated into palettes.generated.css. Both are read
 * here so the audit covers all fifty rather than the generated half.
 */
function palettes() {
  const tokensCss = readFileSync(path.join(web, "src", "styles", "tokens.css"), "utf8");
  const out = [];

  const base = tokensCss.slice(tokensCss.indexOf(".nt-root {"), tokensCss.indexOf(".light .nt-root {"));
  out.push({ id: "dark", tokens: tokens(base) });

  const light = tokensCss.slice(tokensCss.indexOf(".light .nt-root {"));
  out.push({ id: "light", tokens: tokens(light) });

  const generated = readFileSync(path.join(web, "src", "styles", "palettes.generated.css"), "utf8");
  for (const block of generated.split(/\n(?=\.)/)) {
    const head = /^\.([a-z0-9-]+)\s+\.nt-root\s*\{/.exec(block);
    if (head === null) continue;
    out.push({ id: head[1], tokens: tokens(block) });
  }
  return out;
}

/** WCAG contrast between two hex strings. */
function contrast(a, b) {
  const ratio = (x, y) => {
    const [hi, lo] = x > y ? [x, y] : [y, x];
    return (hi + 0.05) / (lo + 0.05);
  };
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (pa === null || pb === null) return 0;
  return ratio(relativeLuminance(pa), relativeLuminance(pb));
}

/* ---------- run ---------- */

const MIN_CONTRAST = 1.35;
const rows = [];
let failures = 0;

const fail = (id, msg) => {
  failures += 1;
  console.log(`  FAIL  ${id.padEnd(14)} ${msg}`);
};

console.log(`Horizon Bloom palette — ${HORIZON_CANDIDATES.length} candidate tokens\n`);
console.log("  palette      warm      cool      bg        light  contrast(warm/bg, cool/bg)");

for (const { id, tokens: t } of palettes()) {
  const p = horizonPalette(t);

  // 1. not a fallback
  const warmed = parseColor(p.warm) !== null && parseColor(p.cool) !== null;
  if (!warmed) fail(id, "derivation returned a fallback colour");
  if (parseColor(p.background) === null) fail(id, "no background resolved");

  // 2. not the same colour twice
  if (p.warm === p.cool) fail(id, `warm and cool are both ${p.warm} — the OKLab blend would be a no-op`);

  // 3. warm is the lighter of the two, measured the way the derivation
  //    measures it — OKLab L, not WCAG relative luminance.
  //
  //    This distinction is not pedantry. Green is perceptually light and
  //    carries almost no relative luminance, so a vivid green out-lights a
  //    pale gold under `relativeLuminance` while ranking below it on OKLab L.
  //    An earlier version of this check compared relative luminance and
  //    failed four perfectly good palettes for it. The derivation ranks on
  //    L, so this checks L.
  const lw = parseColor(p.warm);
  const lc = parseColor(p.cool);
  if (lw !== null && lc !== null && srgbToOklab(lw).L < srgbToOklab(lc).L - 1e-6) {
    fail(id, `warm ${p.warm} is darker than cool ${p.cool} — the depth ramp inverts`);
  }

  // 4. both readable against the palette's own background
  const cw = contrast(p.warm, p.background);
  const cc = contrast(p.cool, p.background);
  if (cw < MIN_CONTRAST) fail(id, `warm ${p.warm} on ${p.background} is ${cw.toFixed(2)}:1 — nothing to see`);
  if (cc < MIN_CONTRAST) fail(id, `cool ${p.cool} on ${p.background} is ${cc.toFixed(2)}:1 — nothing to see`);

  rows.push({ id, warm: p.warm, cool: p.cool, bg: p.background, light: p.light, cw, cc });
  console.log(
    `  ${id.padEnd(13)} ${p.warm}    ${p.cool}    ${p.background}   ${(p.light ? "light" : "dark ").padEnd(6)}` +
      ` ${cw.toFixed(2)} / ${cc.toFixed(2)}`,
  );
}

/* ---------- verdict ---------- */

const lights = rows.filter((r) => r.light).length;
console.log("");
console.log(`${rows.length} palettes (${lights} light, ${rows.length - lights} dark)`);

if (failures === 0) {
  console.log(`every palette yields a distinct warm/cool pair, warm above cool, both visible`);
} else {
  console.log(`${failures} problem(s) above`);
  process.exitCode = 1;
}
