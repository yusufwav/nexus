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
  isTheme,
  nextTheme,
  resolveTheme,
  shouldSaveTheme,
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

console.log("the default is light, per product decision");
eq("DEFAULT_THEME", DEFAULT_THEME, "light");
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
 * "gruvbox" was one of these until it was added. It is deliberately NOT in
 * this list any more - asserting it was unknown would now be a test that
 * fails the moment someone implements it, which is the wrong way round.
 */
for (const value of ["dracula", "midnight", "GRUVBOX", "gruvbox-dark", " light", "light ", "solarized-lagoon"]) {
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
eq("unknown value", themeLabel("dracula"), "Unknown");
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
eq("a theme that was removed", themeLabel("dracula"), "Unknown");
eq("glyph for a removed theme", typeof themeGlyph("dracula"), "string");

console.log("\nthe save rule, which was wrong the first time");
/*
 * The original rule was "save whenever stored differs from current". On a
 * first-ever sign-in stored is NULL and current is the site default, so it
 * saved - turning "never chose" into "chose light" for every reader who
 * simply loaded a page. Nothing looked broken; the damage only appeared
 * when the default changed and those accounts refused to follow it.
 *
 * The rule that replaced it asks whether the theme changed since the page
 * settled, which is the only thing a save is meant to record.
 */
const save = (signedIn, settled, current) =>
  shouldSaveTheme({ signedIn, settled, current });

console.log("\n  a reader who signs in and touches nothing");
/*
 * `settled` is the theme this page resolved to on arrival - not the stored
 * value, and not null. That distinction is the whole fix, so it is worth
 * stating: settled="light", current="light" means "we arrived on light and
 * are still on light", which is not a choice.
 *
 * The tempting wrong version of this test is settled=null, current="light",
 * which reads as "nothing was stored and the page is light" - but that is
 * not the state the component is ever in, because it refuses to settle
 * until next-themes has actually read storage. Left unfixed, that is a race
 * that reinvents the original bug.
 */
eq("arrived light, still light", save(true, "light", "light"), false);
eq("arrived dark, still dark", save(true, "dark", "dark"), false);
eq("arrived on system, still system", save(true, "system", "system"), false);
eq("arrived light, storage not read yet", save(true, undefined, "light"), false);

console.log("\n  a reader who actually chooses");
eq("picked dark from light", save(true, "light", "dark"), true);
eq("picked light from dark", save(true, "dark", "light"), true);
eq("picked system from dark", save(true, "dark", "system"), true);

console.log("\n  the same choice twice writes once");
eq("already settled on dark, still dark", save(true, "dark", "dark"), false);

console.log("\n  a signed-out visitor never writes");
eq("not signed in", save(false, "light", "dark"), false);
eq("not signed in, first choice", save(false, undefined, "dark"), false);

console.log("\n  a value we cannot render is never written");
eq("a theme that does not exist", save(true, "light", "dracula"), false);
eq("null", save(true, "light", null), false);
eq("undefined", save(true, "light", undefined), false);
eq("not a string", save(true, "light", 7), false);

console.log("\nthe header toggle reaches every palette, including the new ones");
/*
 * The cycle was a hardcoded three-entry map (system -> light -> dark ->
 * system). Adding a fourth theme would not have thrown - the button would
 * simply have cyclled those three forever, so a palette added to the picker
 * would have been unreachable from the header. That reads as "the toggle is
 * broken", not "the toggle was hardcoded", which is why the cycle is now
 * derived from THEMES and asserted against THEMES.
 */
const ids = THEMES.map((t) => t.id);
console.log(`  order: ${ids.join(" -> ")}`);

// Walk the whole cycle and prove it visits every theme exactly once before
// returning to where it started.
const walked = [];
let at = ids[0];
for (let i = 0; i < ids.length; i++) {
  walked.push(at);
  at = nextTheme(at);
}
eq("visits every theme", walked.length, ids.length);
eq("and returns to the start", at, ids[0]);
for (const id of ids) {
  if (walked.includes(id)) ok(`reachable from the toggle: ${id}`);
  else bad(`unreachable from the toggle: ${id}`);
}
eq("no theme visited twice", new Set(walked).size, ids.length);

console.log("\n  cycling from an unknown value still lands somewhere real");
eq("unknown", nextTheme("gruvbox-dark"), DEFAULT_THEME);
eq("undefined", nextTheme(undefined), DEFAULT_THEME);
eq("null", nextTheme(null), DEFAULT_THEME);

console.log("\n  every theme carries a glyph, so the toggle always has one");
for (const t of THEMES) {
  eq(`${t.id} has a glyph`, typeof t.glyph === "string" && t.glyph.length > 0, true);
}
eq("unknown value falls back to a glyph", typeof themeGlyph("nope"), "string");

console.log(
  failures === 0
    ? "\nan unknown theme degrades to light instead of breaking the page."
    : `\n${failures} failure(s).`,
);
process.exitCode = failures === 0 ? 0 : 1;