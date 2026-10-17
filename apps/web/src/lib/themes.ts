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
/*
 * The `.ts` extension is written out, unlike every other import in this
 * repo, and it is load-bearing: scripts/test-theme-registry.mjs imports this
 * module directly under Node, whose ESM resolver will not guess an extension.
 * Extensionless worked for webpack and for tsc and failed at runtime with
 * ERR_MODULE_NOT_FOUND, which is the one failure mode that reaches the test
 * suite rather than the type checker.
 */
import { GENERATED_THEMES } from "./themes.generated.ts";

/*
 * The registry's shape, declared once here rather than inferred at each use.
 *
 * GENERATED_THEMES is emitted `as const`, so its type is a union of literal
 * object types - and because only the generated palettes carry a `group`,
 * that union splits: most members have no `group` property at all, so
 * `t.group` on the union is a type error rather than `string | undefined`.
 *
 * That error is correct and worth keeping. Widening the union to add
 * `group?: string` is the fix, and doing it HERE means one declaration
 * instead of a cast at each of the call sites that needs to read a group.
 * `ThemeId` stays derived from the literal union, so an id that is not in the
 * generated file is still a compile error.
 */
export type ThemeEntry = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly glyph: string;
  /** Section this palette belongs under, or absent if it is ungrouped. */
  readonly group?: string;
};

export const THEMES: readonly ThemeEntry[] = GENERATED_THEMES;

export type ThemeId = (typeof GENERATED_THEMES)[number]["id"];

/**
 * Every theme id, in the shape next-themes wants them.
 *
 * This exists because of a bug that only appears once there is more than the
 * two themes next-themes ships expecting. On every theme change next-themes
 * does this:
 *
 *   d.classList.remove(...themes)
 *   d.classList.add(next)
 *
 * `themes` defaults to ["light", "dark"]. We never passed it, so it stayed
 * at those two - and every palette id outside them was only ever ADDED,
 * never removed. Switching gruvbox -> dracula left both on <html>:
 *
 *   <html class="gruvbox dracula">
 *
 * Both rules match `.nt-root` at the same specificity, so the winner was
 * whichever block came later in the stylesheet rather than whichever theme
 * the reader picked. Worse, the accumulated classes kept growing, so a
 * session that visited a few palettes could end up rendering a theme nobody
 * had chosen. It read as "the picker sets it wrong".
 *
 * Handing next-themes the full id list makes its own remove-then-add correct
 * for our palettes, and keeps the two lists from drifting apart.
 */
/*
 * Mapped from GENERATED_THEMES rather than from THEMES, so the element type
 * stays the literal union and an id that is not in the generated registry is
 * a compile error rather than an accepted string.
 */
export const THEME_IDS: string[] = GENERATED_THEMES.map((t) => t.id);

/**
 * The theme a reader sees when they have expressed no preference.
 *
 * Dark, per product decision. Note this is NOT "system": a reader on a light
 * OS who has never chosen, and has no account, gets dark.
 */
export const DEFAULT_THEME: ThemeId = "dark";

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
 * Should the account's saved theme be applied to the page right now?
 *
 * Extracted from ThemeSync because the version inside the component was wrong
 * in a way nobody could see: it decided "there is no saved theme to apply"
 * the first time the session query settled, and never looked again.
 *
 * Better Auth's session atom starts as { data: null, isPending: true } and
 * sets isPending false both when the fetch SUCCEEDS and when it FAILS. So the
 * first settle does not mean "this reader is anonymous" - it may mean "we did
 * not find out". The old code sealed itself there, and whenever the session
 * arrived a moment later - a slow fetch, a transient failure, a cold start -
 * the account's theme was silently never applied. The reader landed on
 * whatever their device had, and the only way back to their own theme was a
 * refresh, which retried the query and usually worked. That reads as a
 * rendering bug, and it is not one.
 *
 * Three answers, not two:
 *
 *   still fetching       -> do nothing, keep waiting
 *   the fetch failed     -> do nothing, keep waiting. We do not know yet,
 *                           and because nothing is sealed, the next
 *                           successful settle is handled normally.
 *   settled with a session carrying a real theme -> apply it, once
 *
 * `applied` is what stops a local change being reverted. Once the account's
 * theme has been applied, a reader who then picks a different one must keep
 * it: the condition stops matching, so the account value does not drag them
 * back on the next render. That is what makes it safe to run on every render
 * rather than sealing after a single use.
 *
 * `quickOverride` is the header button's choice, and it outranks the account.
 * That is the whole point of holding the two apart: the small light/dark
 * button is meant to be remembered WITHOUT destroying the palette somebody
 * chose as their default, so when it has a value the account's default is
 * simply not re-applied on top of it.
 *
 * The header button's cycle deliberately includes the account's own theme,
 * so a reader can get back to their default from the header. Landing on it
 * stores that as an explicit choice, which is why this is a veto rather
 * than a comparison - a reader who went back to their own palette on
 * purpose must not have the same palette dragged over them by the
 * mechanism that was supposed to be honouring it.
 */
export function shouldRestoreTheme({
  isPending,
  error,
  storedTheme,
  currentTheme,
  applied,
  quickOverride,
}: {
  readonly isPending: boolean;
  readonly error: unknown;
  readonly storedTheme: unknown;
  readonly currentTheme: unknown;
  readonly applied: string | null;
  readonly quickOverride?: unknown;
}): boolean {
  if (isPending) return false;
  if (error) return false;
  if (!isTheme(storedTheme)) return false;
  if (isTheme(quickOverride)) return false;
  if (applied === storedTheme) return false;
  return storedTheme !== currentTheme;
}
