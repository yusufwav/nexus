"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { isTheme, shouldSaveTheme } from "@/lib/themes";
import { isPreviewing } from "@/lib/theme-preview";

/**
 * THEME FOLLOWS THE ACCOUNT
 * ------------------------------------------------------------------------
 * The requirement, precisely: an anonymous browser is light; a signed-in
 * reader gets whatever they chose, on any device, for as long as they stay
 * signed in.
 *
 * next-themes already persists to localStorage, which covers the easy half -
 * same browser, next week. What it does not do is follow the *account*. Clear
 * the storage, or sign in on a phone, and the choice is gone even though the
 * session says who you are. That gap is what this closes.
 *
 * WHY THE ORDER IS RESTORE-THEN-SAVE
 *
 * Two effects fight over the theme here, and getting them backwards produces
 * a bug that is hard to see: the account would be overwritten with the
 * device's stale localStorage value on every page load, and a reader's
 * choice would follow whichever device they happened to use last.
 *
 *   restore  runs once, when the session first resolves
 *   save     runs on change, and is suppressed until restore has finished
 *
 * The `restored` ref is what makes that ordering enforceable rather than a
 * coincidence of timing. Without it, a slow session fetch and a fast user
 * click race, and the click wins - which is right - but only sometimes.
 *
 * WHY THE ACCOUNT WINS OVER LOCALSTORAGE ON SIGN IN
 *
 * Because the reader signed in, and the account is the more durable record.
 * A device that was set to dark by a housemate, or before an update changed
 * the default, should not override a choice the reader made deliberately
 * somewhere else.
 *
 * WHY THERE IS A FLASH, AND WHY IT IS ACCEPTABLE
 *
 * The first paint uses localStorage (or the default). The account value
 * arrives a round trip later and is applied without a reload, so a reader
 * who chose dark on another device sees a brief light flash on first visit.
 *
 * Fixing that means reading the theme on the server and inlining it into the
 * HTML, which would require the session in the root layout - the layout is
 * statically rendered, and making it dynamic would opt the whole site out of
 * static rendering to remove one flash. Trading that for a slightly wider
 * flash on one transition is a bad deal, so this is stated rather than
 * hidden.
 */
export function ThemeSync(): null {
  const { theme, setTheme } = useTheme();
  const restored = useRef(false);
  const settled = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  const { data: session, isPending } = authClient.useSession();

  /* -- restore: once, when the session first resolves ------------------- */
  useEffect(() => {
    if (isPending || restored.current) return;

    /*
     * Wait until next-themes has actually read storage before settling.
     *
     * `theme` is undefined until it has, and the session can resolve first.
     * Settling on an undefined theme would record null, and then the real
     * value arriving a tick later would look like the reader changing it -
     * which is the original bug all over again, reintroduced through a race
     * rather than through a comparison.
     */
    if (!isTheme(theme)) return;

    // Signed out, or signed in with no stored preference. Nothing to apply,
    // and next-themes has already fallen back to its default.
    if (session?.user) {
      const stored = (session.user as { theme?: unknown }).theme;
      if (isTheme(stored) && stored !== theme) {
        setTheme(stored);
      }
    }

    restored.current = true;
    /*
     * Recorded AFTER the restore, not before, so applying the account's own
     * theme is not mistaken for the reader changing it.
     */
    settled.current = theme;
    setReady(true);
  }, [isPending, session, theme, setTheme]);

  /* -- save: only on a change the reader made ----------------------------- */
  useEffect(() => {
    if (!ready || !restored.current) return;

    /*
     * A preview repaints the page but is not a choice. Without this, sweeping
     * the pointer down the palette list would save every theme it passed
     * over - thirty writes, and whichever was hovered last would become the
     * reader's saved theme. See lib/theme-preview.ts.
     */
    if (isPreviewing()) return;

    const chosen = isTheme(theme) ? theme : null;

    /*
     * The rule lives in themes.ts as shouldSaveTheme, not here. It was wrong
     * the first time - it compared stored against current and so wrote the
     * site default into every account on first load - and the wrongness was
     * invisible from the component. See that function for the full account.
     */
    if (!shouldSaveTheme({ signedIn: Boolean(session?.user), settled: settled.current, current: chosen })) {
      return;
    }

    const timer = setTimeout(() => {
      settled.current = chosen;
      void authClient.updateUser({ theme: chosen });
    }, 400);

    return () => clearTimeout(timer);
  }, [ready, theme, session]);

  return null;
}