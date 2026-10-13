/*
 * ONE-OFF: appends the bright themes to palette-seeds.json.
 *
 * Written as a script rather than a hand edit because the JSON is
 * machine-written already (the generator rewrites nothing here, but the file
 * is 30 entries of identical shape and hand-editing the tail invites a
 * missing comma in a 40-line diff).
 *
 * It REPLACES any previously-added light group rather than appending, so
 * running it twice is the same as running it once. That matters: a script
 * that appends on every run is a script that eventually produces a duplicate.
 *
 *   node scripts/add-light-themes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(HERE, "..", "src", "styles", "palette-seeds.json");

const seeds = JSON.parse(readFileSync(FILE, "utf8"));

/*
 * THE BRIGHT TEN
 * ------------------------------------------------------------------------
 * Every `bg` here is between #fbfaf7 and #ffffff - near-white, with the
 * tints kept to a couple of percent so they read as paper rather than as a
 * colour. That is the brief: bright, close to white, a few lightly tinted.
 *
 * The `fg` values are where most of the character lives. On a near-white
 * page a mid-grey foreground fails 4.5:1 and the generator will say so, so
 * every one of these is genuinely dark - #14110f to #1b1a26 - which means the
 * differences between them are hue, not lightness. That is the only degree
 * of freedom a light palette actually has, so it is the one used here.
 *
 * The accents are the opposite choice on purpose. They are the one place a
 * light theme can be loud, because a saturated colour on white has more
 * contrast to work with than the same colour on black. Several of these use
 * accents that would be unreadable on a dark canvas.
 *
 * `group` is "light" for all ten. It is not decoration: the generator
 * measures the background and takes the light rule set when it is bright,
 * then checks the two agree and fails if they do not. See build-palettes.mjs.
 */
const LIGHT = [
  {
    id: "paper",
    label: "Paper",
    hint: "Warm white, ink black",
    glyph: "▤",
    group: "light",
    bg: "#fbfaf7",
    fg: "#14110f",
    muted: "#6b6560",
    primary: "#1d4ed8",
    secondary: "#b45309",
  },
  {
    id: "linen",
    label: "Linen",
    hint: "Soft off-white, woven warm",
    glyph: "▦",
    group: "light",
    bg: "#fdfbf6",
    fg: "#1a1713",
    muted: "#736b60",
    primary: "#0f766e",
    secondary: "#9d174d",
  },
  {
    id: "porcelain",
    label: "Porcelain",
    hint: "Cool white, clean slate",
    glyph: "◻",
    group: "light",
    bg: "#fcfdfe",
    fg: "#141a1f",
    muted: "#666f78",
    primary: "#0369a1",
    secondary: "#7c3aed",
  },
  {
    id: "snow",
    label: "Snow",
    hint: "Blue-white, bright and cold",
    glyph: "❅",
    group: "light",
    bg: "#fdfeff",
    fg: "#101820",
    muted: "#61707e",
    primary: "#1e40af",
    secondary: "#0891b2",
  },
  {
    id: "butter",
    label: "Butter",
    hint: "Cream yellow, honey accent",
    glyph: "▨",
    group: "light",
    bg: "#fffdf3",
    fg: "#1c1708",
    muted: "#7a6f4e",
    primary: "#a16207",
    secondary: "#15803d",
  },
  {
    id: "mint",
    label: "Mint",
    hint: "Pale green, fresh and calm",
    glyph: "▩",
    group: "light",
    bg: "#f9fefb",
    fg: "#0f1f17",
    muted: "#5c7268",
    primary: "#047857",
    secondary: "#0e7490",
  },
  {
    id: "blush",
    label: "Blush",
    hint: "Faint rose, rose and plum",
    glyph: "▧",
    group: "light",
    bg: "#fefafb",
    fg: "#1d1319",
    muted: "#7a6169",
    primary: "#be185d",
    secondary: "#6d28d9",
  },
  {
    id: "sky",
    label: "Sky",
    hint: "Pale blue, azure accent",
    glyph: "▢",
    group: "light",
    bg: "#f8fbff",
    fg: "#0f1721",
    muted: "#5f6b7a",
    primary: "#1d4ed8",
    secondary: "#c2410c",
  },
  {
    id: "lemon",
    label: "Lemon",
    hint: "Brightest white, sharp accents",
    glyph: "▬",
    group: "light",
    bg: "#fffffd",
    fg: "#12130a",
    muted: "#6b6d55",
    primary: "#4d7c0f",
    secondary: "#9333ea",
  },
  {
    id: "ivory",
    label: "Ivory",
    hint: "Warm white, classic serif ink",
    glyph: "▥",
    group: "light",
    bg: "#fdfaf3",
    fg: "#17140d",
    muted: "#6f6857",
    primary: "#92400e",
    secondary: "#1e40af",
  },
];

// Replace the group rather than append to it, so this is idempotent.
const withoutLight = seeds.palettes.filter((p) => p.group !== "light");

const seen = new Set(withoutLight.map((p) => p.id));
for (const p of LIGHT) {
  if (seen.has(p.id)) throw new Error(`id collides with an existing palette: ${p.id}`);
  seen.add(p.id);
}

// Bright themes first, so the section leads with them in the registry and in
// the stylesheet. Section order is decided in the picker, not here, but
// reading the generated CSS top-down should start with the light ones.
seeds.palettes = [...LIGHT, ...withoutLight];

writeFileSync(FILE, `${JSON.stringify(seeds, null, 2)}\n`, "utf8");
console.log(`  light themes added : ${LIGHT.length}`);
console.log(`  total palettes     : ${seeds.palettes.length}`);
console.log(`  order              : ${seeds.palettes.slice(0, 3).map((p) => p.id).join(", ")}, ... ${seeds.palettes.slice(-1)[0].id}`);
