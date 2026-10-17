/**
 * THE HEADER BUTTON'S THEME - a per-browser override
 * ------------------------------------------------------------------------
 * Two slots, and this is the second one:
 *
 *   user.theme            the reader's DEFAULT theme. Which palette they want.
 *                         Follows the account: another device, another browser,
 *                         and it is written in exactly one place, the picker
 *                         in Settings.
 *
 *   this key              what this BROWSER has been told to show. Written by
 *                         both deliberate controls - the header button and the
 *                         picker - and it never touches the account.
 *
 * They are separate because they answer different questions. "What do you
 * want the site to look like" is a setting; "I want to look at it in the
 * other one for a minute" is not. The earlier version had one slot, and
 * ThemeSync saved ANY change into it - so pressing the small button wrote
 * `light` into the row and permanently destroyed a palette the reader had
 * chosen, with no way to tell that had happened.
 *
 * IT IS ITS OWN KEY, NOT next-themes' `theme`
 * next-themes already persists whatever setTheme was last called with, so the
 * header button's choice survives a reload with nothing extra. A separate key
 * is needed anyway, for one reason: it is what makes "has this browser been
 * told what to show?" a question with an answer. shouldRestoreTheme has to be
 * able to tell "no preference recorded" from "a preference that happens to
 * equal the site default", and it cannot do that by looking at next-themes'
 * key, which holds whatever the last setTheme was - including a restore the
 * reader never chose.
 *
 * NOT IN lib/themes.ts, which stays DOM-free
 * That module is imported directly by scripts/test-theme-registry.mjs under
 * plain Node, so a `window` reference at module scope would take the whole
 * test suite down on import rather than on the one line that uses it.
 *
 * EVERY READ IS VALIDATED, and that is not defensive noise. This value is
 * written by one module but read back by another on a later page load, from
 * storage a reader can edit, a browser extension can write, or a future
 * deploy can leave behind holding an id that no longer exists. It is
 * validated by the same isTheme() every other stored value goes through,
 * because an unvalidated string from here would become a class name on
 * <html> that no stylesheet matches - which renders as an unstyled page.
 */
import { isTheme, type ThemeId } from "./themes.ts";

/**
 * Deliberately not next-themes' key and not the account.
 *
 * Namespaced because nothing else in the app writes storage by hand, so a
 * collision is not a live risk - but a bare `theme` key sitting next to
 * next-themes' own is exactly the kind of thing that gets confused for it
 * by whoever reads this next.
 */
export const QUICK_THEME_KEY = "nexus:quick-theme";

/** localStorage throws in more situations than it is given credit for. */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    // Private mode in some browsers, and a sandboxed iframe in others.
    return null;
  }
}

/**
 * What this browser was last told to show, or null when nothing has been.
 *
 * Null covers three states that must behave identically: never chosen, storage
 * unreadable, and unreadable because the browser refused to hand it over. None
 * of them is a choice, and all of them leave the account's default theme in
 * charge.
 */
export function readQuickTheme(): ThemeId | null {
  const store = storage();
  if (store === null) return null;
  try {
    const raw = store.getItem(QUICK_THEME_KEY);
    return isTheme(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Remember a choice made on this browser.
 *
 * Written by BOTH deliberate controls, and that is not a shortcut - it is what
 * keeps ThemeSync from undoing them:
 *
 *   the header button    a quick light/dark look, deliberately not touching
 *                        the account
 *   the Settings picker  the account's default theme, which must ALSO win over
 *                        the stale session value for the moment before
 *                        updateUser lands, or it would restore the old palette
 *                        over the new one. See the note in choose().
 *
 * A write that throws is swallowed. The page is already the colour the reader
 * asked for - setTheme ran first, and that is what they can see - so failing
 * to persist it costs them the choice again on the next load, which is not
 * worth an unhandled error in a click handler.
 *
 * THERE IS NO CLEAR, and there was one and it was wrong.
 *
 * Clearing looked obviously right: "the reader has made a real choice, so the
 * override should stand down". It reintroduced the race the split exists to
 * end - with the override gone and the session still carrying the old default,
 * ThemeSync reads the reader's fresh choice as an unexplained departure and
 * restores the palette they just replaced. It also left the reader with no way
 * back to their account default other than opening Settings.
 *
 * With no clear, the key simply means "this browser has been told which theme
 * to use, by a deliberate choice, and it is still true". The header cycle's
 * third stop is the reader's own default theme, so getting back to it - here or
 * anywhere else - is one press away and rewrites the key.
 */
export function writeQuickTheme(id: string): void {
  const store = storage();
  if (store === null) return;
  try {
    store.setItem(QUICK_THEME_KEY, id);
  } catch {
    /* see above */
  }
}