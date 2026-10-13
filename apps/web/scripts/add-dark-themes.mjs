/*
 * ONE-OFF: appends the near-black themes to palette-seeds.json.
 *
 * The mirror of add-light-themes.mjs, and deliberately structured the same
 * way so the pair reads as a pair.
 *
 * It REPLACES the themes it owns rather than appending, so running it twice is
 * the same as running it once. The light script can identify its own work with
 * `group !== "light"` because that is exactly the set it added. These cannot:
 * "no group" is also how the thirty original dark themes are declared, since
 * ungrouped is what the picker's dark filter collects. Filtering on absence
 * would delete half the palette list. So this script keys off the ids it
 * declares below, which is unambiguous and is why the id list lives in the
 * source rather than being inferred.
 *
 *   node scripts/add-dark-themes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "..", "src", "styles", "palette-seeds.json");

const seeds = JSON.parse(readFileSync(FILE, "utf8"));

/*
 * THE NEAR-BLACK TEN
 * ------------------------------------------------------------------------
 * Every `bg` here sits between #07080a and #0d0e10 - close to absolute black,
 * with the tints kept to the point where you can feel the hue rather than see
 * it. That is the brief, and it is also a real constraint: at these values the
 * difference between "black" and "not quite black" is roughly 3% luminance,
 * so these themes are separated by hue and by their accents rather than by
 * their backgrounds.
 *
 * No `group` field, on purpose. The picker puts every palette with
 * `group === undefined` into "Dark mode palettes", so leaving it off is what
 * files these correctly. Adding a group would need a matching section in
 * theme-picker.tsx, and check-palettes.mjs fails the build on a group that no
 * section handles - which is the intended behaviour, not an obstacle.
 *
 * The foregrounds are near-white but not #ffffff. Pure white on pure black is
 * the highest-contrast pairing available and it is fatiguing over a whole
 * page; these sit just below it, and each carries a hue so the dark themes
 * stay distinguishable from one another when two are open at once.
 */
const DARK = [
  {
    id: "void",
    label: "Void",
    hint: "Near-black, truly neutral",
    glyph: "◘",
    bg: "#08080a",
    fg: "#e9e9ec",
    muted: "#7a7a85",
    primary: "#7c6cff",
    secondary: "#22d3ee",
  },
  {
    id: "pitch",
    label: "Pitch",
    hint: "The darkest here",
    glyph: "●",
    bg: "#060709",
    fg: "#e6e8ea",
    muted: "#767d84",
    primary: "#ff4d6d",
    secondary: "#ffd166",
  },
  {
    id: "obsidian",
    label: "Obsidian",
    hint: "Cool black, glassy sheen",
    glyph: "◆",
    bg: "#0a0a0d",
    fg: "#e8e8ee",
    muted: "#787884",
    primary: "#8b5cf6",
    secondary: "#2dd4bf",
  },
  {
    id: "carbon",
    label: "Carbon",
    hint: "Blue-black, electric accents",
    glyph: "◼",
    bg: "#08090c",
    fg: "#e4e9f0",
    muted: "#727c8a",
    primary: "#38bdf8",
    secondary: "#a3e635",
  },
  {
    id: "ink",
    label: "Ink",
    hint: "Indigo black, deep blue",
    glyph: "◉",
    bg: "#0a0b12",
    fg: "#e6e6f0",
    muted: "#767a90",
    primary: "#818cf8",
    secondary: "#f472b6",
  },
  {
    id: "char",
    label: "Char",
    hint: "Warm black, ember accents",
    glyph: "◍",
    bg: "#0c0a09",
    fg: "#eee9e4",
    muted: "#847c74",
    primary: "#f97316",
    secondary: "#fbbf24",
  },
  {
    id: "basalt",
    label: "Basalt",
    hint: "Stone black, steady grey",
    glyph: "⬒",
    bg: "#0b0d0e",
    fg: "#e7ebec",
    muted: "#7b8285",
    primary: "#94a3b8",
    secondary: "#2dd4bf",
  },
  {
    id: "umber",
    label: "Umber",
    hint: "Brown-black, aged and warm",
    glyph: "◐",
    bg: "#0d0a08",
    fg: "#efe9e1",
    muted: "#877e73",
    primary: "#d97706",
    secondary: "#65a30d",
  },
  {
    id: "nocturne",
    label: "Nocturne",
    hint: "Violet black, low and moody",
    glyph: "◑",
    bg: "#090810",
    fg: "#e8e6f2",
    muted: "#787490",
    primary: "#a78bfa",
    secondary: "#34d399",
  },
  {
    id: "graphite",
    label: "Graphite",
    hint: "Even black, one step up",
    glyph: "■",
    bg: "#0d0e10",
    fg: "#eceef0",
    muted: "#808589",
    primary: "#60a5fa",
    secondary: "#fbbf24",
  },
];

const owned = new Set(DARK.map((p) => p.id));

// Replace only the ids this script owns.
const kept = seeds.palettes.filter((p) => !owned.has(p.id));

const seen = new Set(kept.map((p) => p.id));
for (const p of DARK) {
  if (seen.has(p.id)) throw new Error(`id collides with an existing palette: ${p.id}`);
  seen.add(p.id);
}

/*
 * Light themes lead, then the near-black ten, then the original thirty. The
 * picker re-orders into brand / light / dark sections regardless, so this is
 * only about the generated files reading sensibly top-down.
 */
seeds.palettes = [...seeds.palettes.filter((p) => p.group === "light"), ...DARK, ...kept.filter((p) => p.group !== "light")];

writeFileSync(FILE, `${JSON.stringify(seeds, null, 2)}\n`, "utf8");
console.log(`  near-black themes added : ${DARK.length}`);
console.log(`  total palettes          : ${seeds.palettes.length}`);
console.log(`  light section           : ${seeds.palettes.filter((p) => p.group === "light").length}`);
console.log(`  ungrouped (dark)        : ${seeds.palettes.filter((p) => !p.group).length}`);
