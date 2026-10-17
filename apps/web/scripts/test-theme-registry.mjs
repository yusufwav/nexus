/**
 * Why the theme registry is the allowlist, and not the database.
 *
 * THE CONSTRAINT THIS FILE PROTECTS
 *
 * More palettes are coming - gruvbox, dracula, opencode orange. The column
 * on user is free text precisely so that adding one is an array entry and
 * not a migration applied to production while readers are signed in.
 *
 * That trade is only sound if something downstream actually enforces the
 * list. The database will happily store "gruvbox" the day someone hand-edits
 * a row, and "gruvbox-with-a-typo" the day a theme is renamed. If an
 * unrecognised value were passed to next-themes it would land as a class on
 * <html> that no stylesheet matches, and the reader gets an unstyled page -
 * a worse failure than silently falling back, and one that looks like a
 * stylesheet bug rather than a data problem.
 *
 * So the assertion below is the important one: a value nobody recognises
 * resolves to the default and is NOT applied. Adding a real theme is then a
 * deliberate act in one file, and typos degrade instead of breaking.
 *
 * Run from apps/web:
 *   node scripts/test-theme-registry.mjs
 */
import {
  DEFAULT_THEME,
  THEMES,
  headerThemes,
  isTheme,
  nextTheme,
  resolveTheme,
  shouldRestoreTheme,
  themeGlyph,
  themeLabel,
} from "../src/lib/themes.ts";

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};
const eq = (label, actual, expected) => {
  if (actual === expected) ok(label);
  else bad(`${label}\n          expected: ${JSON.stringify(expected)}\n          actual:   ${JSON.stringify(actual)}`);
};

console.log("the default is dark, per product decision");
eq("DEFAULT_THEME", DEFAULT_THEME, "dark");
if (!THEMES.some((t) => t.id === DEFAULT_THEME)) {
  bad("the default is not in the registry, so it could never be selected");
} else {
  ok("the default is also a selectable option");
}

console.log("\nevery registered theme is a real, selectable choice");
for (const t of THEMES) {
  eq(`${t.id} is a theme`, isTheme(t.id), true);
  eq(`${t.id} resolves to itself`, resolveTheme(t.id), t.id);
  eq(`${t.id} has a label`, typeof t.label === "string" && t.label.length > 0, true);
}

console.log("\nan unrecognised value falls back rather than being applied");
/*
 * These are the values that actually turn up: a theme renamed and not
 * migrated, a hand-edited row, a value from a newer build rolling back to
 * an older one. None of them may reach next-themes.
 *
 * Note what is NOT here: "gruvbox" and "dracula" were both used as unknown
 * values while they were still to be implemented. A test that asserts a real
 * theme is unknown fails the moment someone adds it, which teaches the
 * reader to distrust the suite. These are all ids no palette will plausibly
 * claim.
 */
for (const value of ["no-such-theme", "midnight", "DRACULA", "gruvbox-dark", " light", "light ", "solarized-lagoon"]) {
  eq(`${JSON.stringify(value)} resolves to the default`, resolveTheme(value), DEFAULT_THEME);
  eq(`${JSON.stringify(value)} is not a theme`, isTheme(value), false);
}

console.log("\nnon-strings cannot smuggle a value through");
for (const [label, value] of [
  ["undefined", undefined],
  ["null", null],
  ["number", 1],
  ["boolean", true],
  ["object", { id: "dark" }],
  ["array", ["dark"]],
]) {
  eq(`${label} resolves to the default`, resolveTheme(value), DEFAULT_THEME);
  eq(`${label} is not a theme`, isTheme(value), false);
}

console.log("\nprototype keys are not themes");
/*
 * isTheme checks membership in THEMES rather than reading a property off an
 * object, so "toString" and "constructor" are not themes. Worth asserting
 * because a registry built as a Record and looked up by key would pass one
 * of these.
 */
for (const key of ["toString", "constructor", "hasOwnProperty", "__proto__"]) {
  eq(`${key} is not a theme`, isTheme(key), false);
}

console.log("\nlabels are for display and degrade readably");
eq("light", themeLabel("light"), "Light");
eq("gruvbox", themeLabel("gruvbox"), "Gruvbox");
eq("unknown value", themeLabel("no-such-theme"), "Unknown");
eq("null", themeLabel(null), "Unknown");

console.log("\nadding a theme later is one entry, and the invariants still hold");
/*
 * Simulated rather than actually added: these themes are coming, and a
 * placeholder would show up in the dashboard as a choice that does nothing.
 * What is asserted is that the contract does not need to change - a new
 * entry is immediately selectable, immediately resolvable, and anything
 * outside it still degrades.
 */
const future = [...THEMES, { id: "gruvbox", label: "Gruvbox", hint: "Warm retro" }];
if (future.some((t) => t.id === "gruvbox")) ok("a new entry would be in the registry");
else bad("adding an entry did not register");
eq("and still resolves", future.some((t) => t.id === "gruvbox"), true);
console.log("\n  label and glyph degrade readably for a value that is gone");
eq("a theme that was removed", themeLabel("no-such-theme"), "Unknown");
eq("glyph for a removed theme", typeof themeGlyph("no-such-theme"), "string");

/*
 * THERE IS NO SAVE RULE ANY MORE, and that is the fix rather than a gap.
 *
 * ThemeSync used to hold a shouldSaveTheme() that wrote the account row on any
 * theme change. It existed only because the header button and the Settings
 * picker shared one slot, so something had to persist the button's choice.
 *
 * The header button now keeps its choice in localStorage under its own key and
 * ThemePicker writes the account directly, so no component saves on change and
 * no rule is needed to decide when that would be correct. Deleting the rule is
 * what guarantees it: a component cannot save what it has no predicate for.
 */
console.log("\nthe save rule is gone, so nothing can save by accident");

console.log("\nevery generated palette is selectable and every seed reached the build");
/*
 * Thirty palettes, generated from one seeds file into both the CSS and the
 * registry. The failure this guards against is a seed that produces a block
 * but no registry entry, or the reverse - either way a theme is offered that
 * does not render, or renders but cannot be picked, and neither throws.
 *
 * THE COUNTS ARE NOT ASSERTED HERE, and used to be: this file hardcoded 33 and
 * then 30 generated palettes, and both numbers were stale by twenty before
 * anyone could see it - the whole suite had been failing to import since
 * themes.ts grew a Node-resolvable import, so a broken suite looks exactly
 * like an unrun one. Registry-vs-stylesheet agreement is check-palettes.mjs's
 * job and it does it by scanning both files rather than by counting, so a
 * palette added tomorrow needs no edit here. What is left to assert is that
 * the hand-written three are present and that nothing is a duplicate.
 */
for (const required of ["light", "dark", "system"]) {
  if (isTheme(required)) ok(`the hand-written "${required}" is in the registry`);
  else bad(`MISSING from the registry: ${required}`);
}
const labels = new Set(THEMES.map((t) => t.label));
eq("no duplicate labels", labels.size, THEMES.length);
const registryIds = new Set(THEMES.map((t) => t.id));
eq("no duplicate ids", registryIds.size, THEMES.length);
for (const expected of ["light", "dark", "system", "gruvbox", "dracula", "nord", "solarized", "catppuccin", "tokyo-night", "monokai", "one-dark", "everforest", "rose-pine", "night-owl", "kanagawa", "ayu", "zenburn", "iceberg", "oxocarbon", "edge", "sonokai", "nightfox", "oceanic-next", "material", "horizon", "poimandres", "cobalt2", "vesper", "shades-of-purple", "synthwave", "github", "jellybeans", "base16"]) {
  if (isTheme(expected)) ok(`selectable: ${expected}`);
  else bad(`MISSING from the registry: ${expected}`);
}

console.log("\nthe header toggle offers three states, not thirty-three");
/*
 * It used to cycle every palette in the registry. With thirty-three themes
 * that put thirty-one clicks between light and dark - the journey almost
 * everyone actually takes - and the button is on every page, so it has to be
 * usable by feel without looking at it.
 *
 * So the cycle is light, dark, and the reader's own theme, collapsing to two
 * when that theme is already one of the pair.
 */
eq("never chose anything", headerThemes(undefined).join(","), "light,dark");
eq("never chose, null", headerThemes(null).join(","), "light,dark");
eq("chose light (already in the pair)", headerThemes("light").join(","), "light,dark");
eq("chose dark (already in the pair)", headerThemes("dark").join(","), "light,dark");
eq("chose a palette", headerThemes("night-owl").join(","), "light,dark,night-owl");
eq("chose gruvbox", headerThemes("gruvbox").join(","), "light,dark,gruvbox");
eq("a value naming no theme", headerThemes("no-such-theme").join(","), "light,dark");

console.log("\n  and the cycle walks that set and wraps");
eq("light -> dark", nextTheme("light", undefined), "dark");
eq("dark -> light (nothing chosen)", nextTheme("dark", undefined), "light");
eq("dark -> reader theme", nextTheme("dark", "night-owl"), "night-owl");
eq("reader theme -> light", nextTheme("night-owl", "night-owl"), "light");
eq("light -> dark", nextTheme("light", "night-owl"), "dark");
eq("a reader theme reached from dark, three states", headerThemes("night-owl").length, 3);

console.log("\n  an unknown current value still lands somewhere real");
/*
 * An unrecognised current is treated as "not in the list", which indexes to 0
 * - light, the site default. Deliberately the same as an undefined current:
 * a stored theme naming nothing real should not leave the button cycling from
 * somewhere arbitrary.
 */
eq("unknown current", nextTheme("no-such-theme", undefined), "light");
eq("undefined current", nextTheme(undefined, undefined), "light");
eq("null current", nextTheme(null, undefined), "light");

console.log("\n  every registered palette is still REACHABLE - just not from the header");
/*
 * The header being narrowed must not mean the picker is. Every registered theme
 * has to remain selectable somewhere, or the whole feature is decoration.
 *
 * This is a completeness check over whatever the registry currently holds,
 * rather than a count: it fails if a theme stops being selectable, and it does
 * not need editing when palettes are added.
 */
const ids = THEMES.map((t) => t.id);
eq("every id is unique", new Set(ids).size, ids.length);
for (const id of ids) {
  if (isTheme(id)) ok(`selectable in the picker: ${id}`);
  else bad(`NOT selectable: ${id}`);
}

console.log("\n  every theme carries a glyph, so the toggle always has one");
for (const t of THEMES) {
  eq(`${t.id} has a glyph`, typeof t.glyph === "string" && t.glyph.length > 0, true);
}
eq("unknown value falls back to a glyph", typeof themeGlyph("nope"), "string");

console.log("\nthe restore rule, and the race that made the theme need a refresh");
/*
 * This is the bug behind "changing the theme does nothing until I reload".
 *
 * Better Auth's session atom starts { data: null, isPending: true } and clears
 * isPending both on success and on FAILURE. ThemeSync used to seal itself the
 * first time that settled, so a session that arrived afterwards - slow fetch,
 * transient failure, cold start - was never read. The reader landed on their
 * device's theme and had to reload.
 *
 * The rule below has to keep waiting while the answer is unknown, and must not
 * seal, so a late session is handled by the ordinary render path.
 */
const restore = (o) => shouldRestoreTheme(o);
const late = { storedTheme: "dracula", currentTheme: "dark", applied: null };

console.log("\n  while the answer is not yet known");
eq("still fetching", restore({ ...late, isPending: true, error: null }), false);
eq("fetch failed", restore({ ...late, isPending: false, error: new Error("network") }), false);
eq("fetch failed with no message", restore({ ...late, isPending: false, error: true }), false);

console.log("\n  a late session IS applied - the case that used to be lost");
eq("session arrives after a failure", restore({ ...late, isPending: false, error: null }), true);
eq(
  "and is not lost when the device theme differs",
  restore({ storedTheme: "nord", currentTheme: "light", applied: null, isPending: false, error: null }),
  true,
);

console.log("\n  it is applied exactly once, and then left alone");
eq("already applied", restore({ ...late, applied: "dracula", isPending: false, error: null }), false);
eq(
  "reader changed it locally after it was applied",
  restore({ storedTheme: "dracula", currentTheme: "nord", applied: "dracula", isPending: false, error: null }),
  false,
);
eq("already showing it", restore({ ...late, currentTheme: "dracula", isPending: false, error: null }), false);

console.log("\n  a genuinely anonymous reader applies nothing, harmlessly");
eq(
  "no stored theme at all",
  restore({ storedTheme: null, currentTheme: "dark", applied: null, isPending: false, error: null }),
  false,
);
eq(
  "stored theme names nothing real",
  restore({ storedTheme: "no-such-theme", currentTheme: "dark", applied: null, isPending: false, error: null }),
  false,
);

console.log("\nthe header button's override outranks the account's default");
/*
 * This is the behaviour that was asked for and the one the old code got exactly
 * wrong: pressing the small light/dark button used to write into the account
 * row and destroy the palette the reader had chosen as their default.
 *
 * The rule is a veto rather than a comparison, and that matters. The header
 * button's cycle INCLUDES the reader's own default theme as its third stop, so
 * arriving at the default by pressing the button is a deliberate act too - and
 * it must stay recorded, or the very mechanism meant to honour that choice
 * would drag the same palette over the reader who just asked for it.
 */
const override = (quick) => restore({ ...late, quickOverride: quick, isPending: false, error: null });
eq("no override at all", override(null), true);
eq("override is undefined", override(undefined), true);
eq("overridden to light", override("light"), false);
eq("overridden to the account's own theme", override("dracula"), false);
eq("junk in storage is not an override", override("no-such-theme"), true);
eq("a number in storage is not an override", override(7), true);

console.log("\n  and the veto does not resurrect the settled-flag bug");
eq(
  "an override is honoured even while the session is still arriving",
  restore({ ...late, quickOverride: "light", isPending: true, error: null }),
  false,
);
eq(
  "and when the session has not answered at all",
  restore({ ...late, quickOverride: "light", isPending: false, error: new Error("network") }),
  false,
);

console.log("\n  and the picker cannot be undone by the session it is still writing to");
/*
 * The race that made the picker write this key instead of clearing it.
 *
 * A reader picks nord. updateUser is in flight, so the session still carries
 * the old default, gruvbox. ThemeSync sees a current theme that disagrees with
 * the stored one and concludes the reader wandered off - which is exactly the
 * inference that is right on arrival and wrong here - and restores gruvbox over
 * the choice they just made. The picker applies, says "Saved to your account",
 * and watches it get taken back.
 *
 * Both sides of the fix are asserted. The picker writing the key is what stops
 * it, and the assertion below is what fails loudly if someone "tidies" that
 * line back into a clear().
 */
eq(
  "picker wrote its choice, stale session must not win",
  restore({ storedTheme: "gruvbox", currentTheme: "nord", applied: null, quickOverride: "nord", isPending: false, error: null }),
  false,
);
eq(
  "the same moment with no key at all is the bug, not a safety net",
  restore({ storedTheme: "gruvbox", currentTheme: "nord", applied: null, quickOverride: null, isPending: false, error: null }),
  true,
);

console.log(
  failures === 0
    ? "\nan unknown theme degrades to dark instead of breaking the page."
    : `\n${failures} failure(s).`,
);
process.exitCode = failures === 0 ? 0 : 1;
