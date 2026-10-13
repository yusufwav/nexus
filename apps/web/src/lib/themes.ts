/**
 * THE LIST OF THEMES
 * ------------------------------------------------------------------------
 * One array, and everything else derives from it: what the dashboard
 * offers, what an account value is allowed to be, and what an unknown
 * value falls back to.
 *
 * WHY THIS IS A REGISTRY AND NOT A DATABASE CONSTRAINT
 *
 * More themes are coming - gruvbox, dracula, opencode orange. They are
 * deliberately not listed here as placeholders, because a placeholder is a
 * promise with nothing behind it and it would show up in the dashboard as a
 * choice that silently does nothing.
 *
 * But the shape has to make adding one cheap and safe, because that is the
 * part that is easy to get wrong. The obvious alternative is a Postgres enum
 * or a CHECK constraint on user.theme. Both would be a schema migration to
 * add a colour, applied to production while readers are signed in, to widen
 * an allowed value list - and a forgotten migration would reject the write
 * and lose the reader's choice.
 *
 * So the column is free text and this file is the allowlist. The cost is
 * that the database will accept a value that names no real theme; the
 * registry is what catches that, in isTheme(), and an unrecognised value
 * resolves to the default instead of being applied. That failure is
 * invisible and harmless. A rejected write is neither.
 *
 * HOW A THEME IS APPLIED
 *
 * `attribute="class"` on the ThemeProvider means next-themes writes the
 * theme name onto <html> as a class, and the palettes are defined against
 * those class names. So adding a theme means adding a class.
 *
 * THE LIST IS GENERATED, NOT WRITTEN HERE
 *
 * THEMES comes from themes.generated.ts, which build-palettes.mjs emits from
 * the same palette-seeds.json that produces palettes.generated.css.
 *
 * This file used to carry a hand-written array beside a hand-written
 * stylesheet, which is two lists of one fact, and they did disagree: a theme
 * present in one and absent from the other renders as a class nothing styles,
 * or as a picker option that quietly does nothing. Neither is an error -
 * check-palettes.mjs is what noticed, and only because it compares the two.
 *
 * Generating both makes that state unreachable. There is now one place to add
 * a palette, and it cannot be half-done.
 *
 *   light / dark / system
 *     light is hand-written in tokens.css. dark is the base palette, held in
 *     .nt-root, so it has no block of its own - duplicating 72 values would
 *     mean two copies to keep in step. "system" is not a palette at all: it
 *     is an instruction to follow the OS, and next-themes resolves it to
 *     light or dark.
 */
import { GENERATED_THEMES } from "./themes.generated";
export const THEMES = GENERATED_THEMES;

export type ThemeId = (typeof THEMES)[number]["id"];

/**
 * The theme a reader sees when they have expressed no preference.
 *
 * Light, per product decision. Note this is NOT "system": a reader on a
 * dark OS who has never chosen, and has no account, gets light.
 */
export const DEFAULT_THEME: ThemeId = "light";

/**
 * Is this a theme we know how to render?
 *
 * The gate every stored value passes through. Deliberately strict and
 * deliberately small: it accepts only ids present in THEMES, so a value
 * written by an older build, a typo, or a hand-edited row cannot reach
 * next-themes and become a class name on <html> that no stylesheet
 * matches - which would render as an unstyled page.
 */
export function isTheme(value: unknown): value is ThemeId {
  return typeof value === "string" && THEMES.some((t) => t.id === value);
}

/**
 * Resolve anything - a stored value, a null, junk - to a usable theme.
 *
 * Always returns a real theme, so no caller has to handle a null here.
 */
export function resolveTheme(value: unknown): ThemeId {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** Human label for a stored value, for display next to the current choice. */
export function themeLabel(value: unknown): string {
  if (!isTheme(value)) return "Unknown";
  return THEMES.find((t) => t.id === value)?.label ?? "Unknown";
}

/** Glyph for a value, for the header toggle. Unknown values get the default's. */
export function themeGlyph(value: unknown): string {
  if (!isTheme(value)) return THEMES.find((t) => t.id === DEFAULT_THEME)?.glyph ?? "☀";
  return THEMES.find((t) => t.id === value)?.glyph ?? "☀";
}

/**
 * What the small header button should offer.
 *
 * Not every theme. The header button is a three-state convenience: light,
 * dark, and whatever the reader chose for themselves. It is on every page, so
 * it has to stay a thing you can cycle through by feel without looking.
 *
 * With thirty-three palettes in the registry, cycling all of them would make
 * the button nearly unusable - and worse, it would make the common case
 * (going from light to dark for a quick look) take thirty clicks. The full
 * list lives in Settings, where it is a deliberate act.
 *
 * So the header offers exactly three, and collapses to two when the reader's
 * own theme is already one of them:
 *
 *   reader has never chosen      light, dark
 *   reader chose "light"         light, dark            (nothing to add)
 *   reader chose "night-owl"     light, dark, night-owl
 *
 * Returns the pair plus the reader's theme when that theme is a real palette
 * and not already one of the two. The order is fixed so the button behaves
 * the same on every page and for every reader.
 */
export function headerThemes(saved: unknown): ThemeId[] {
  const base: ThemeId[] = ["light", "dark"];
  if (isTheme(saved) && !base.includes(saved)) return [...base, saved];
  return base;
}

/**
 * The next theme in the header cycle.
 *
 * Takes the reader's saved theme rather than the whole registry, so the cycle
 * is the three (or two) options above. Wraps at the end.
 */
export function nextTheme(current: unknown, saved?: unknown): ThemeId {
  const ids = headerThemes(saved);
  const at = isTheme(current) ? ids.indexOf(current) : -1;
  return ids[(at + 1) % ids.length];
}

/**
 * Should this be written to the reader's account?
 *
 * Extracted from ThemeSync because the rule was wrong the first time and the
 * wrongness was invisible. The original compared the *stored* value against
 * the *current* theme and saved on any difference - which meant that signing
 * in and loading any page, with no choice ever made, wrote the site default
 * into the row. "Never chose" became "chose light".
 *
 * The damage is deferred. The row looks fine, the reader sees the right
 * colours, and the bug only surfaces the day DEFAULT_THEME changes and every
 * one of those accounts stays stubbornly on the old value, with nothing in
 * the database to explain why.
 *
 * So the question is not "does stored differ from current". It is "did the
 * theme change since this page settled" - which is the only thing a save is
 * ever meant to record.
 *
 *   signedIn  false  -> no. A visitor gets next-themes' local storage and no
 *                      account to write to; ThemePicker says so in its copy.
 *   settled not a real theme -> no. We have not established what the page
 *                      arrived on, so any difference is meaningless. ThemeSync
 *                      already refuses to settle until next-themes has read
 *                      storage; this is the same rule stated where the
 *                      decision is made, so a future caller cannot skip it.
 *   current not a real theme -> no. Never write a value we cannot render.
 *   current === settled     -> no. Nothing changed, so nothing was chosen.
 *   otherwise               -> yes.
 */
export function shouldSaveTheme({
  signedIn,
  settled,
  current,
}: {
  readonly signedIn: boolean;
  readonly settled: unknown;
  readonly current: unknown;
}): boolean {
  if (!signedIn) return false;
  if (!isTheme(settled)) return false;
  if (!isTheme(current)) return false;
  return current !== settled;
}