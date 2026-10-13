"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { isTheme, shouldRestoreTheme, shouldSaveTheme } from "@/lib/themes";

/**
 * THEME FOLLOWS THE ACCOUNT
 * ------------------------------------------------------------------------
 * The requirement, precisely: an anonymous browser is light; a signed-in
 * reader gets whatever they chose, on any device, for as long as they stay
 * signed in.
 *
 * next-themes already persists to localStorage, which covers the easy half -
 * same browser, next week. What it does not do is follow the *account*. Clear
 * the storage, or sign in on another device, and the choice is gone even
 * though the session says who you are. That gap is what this closes.
 *
 * WHY THERE IS NO "ONLY DO THIS ONCE" FLAG
 * ------------------------------------------------------------------------
 * The first version of this file had one - a `restored` ref set the first
 * time the session query settled, after which the effect returned early for
 * the lifetime of the page. It looked like the obvious way to say "restore
 * once, on arrival" and it was the reason the account theme was applied only
 * after a refresh.
 *
 * Better Auth's session atom starts as { data: null, isPending: true } and
 * clears isPending both when the fetch succeeds AND when it fails. So "the
 * query settled" does not mean "the reader is anonymous" - it can mean "we did
 * not find out". The flag was set on that first settle, and whenever the
 * session actually arrived afterwards - a slow fetch, one transient failure,
 * a cold start, a cold Next.js chunk in production - the effect returned early
 * and the account's theme was never applied. The reader saw their device's
 * theme and had no way back but a reload, which retried the query and usually
 * worked. Which is precisely "it doesn't take effect until the website
 * refreshes".
 *
 * Nothing is sealed now. The effect asks, on every render, whether the
 * account's theme should be applied right now - and the rule for that lives
 * in shouldRestoreTheme(), which distinguishes still-fetching, failed and
 * genuinely-signed-out. A late session is therefore handled by the ordinary
 * render path rather than by a second, special case.
 *
 * WHY A LOCAL CHANGE IS NEVER REVERTED
 * ------------------------------------------------------------------------
 * `applied` records the account theme once it has been used. A reader who
 * then picks a different theme in Settings must keep it, even though the
 * account still holds the old value until the save lands - so the restore
 * condition stops matching and leaves it alone.
 *
 * WHY THERE IS A FLASH, AND WHY IT IS ACCEPTABLE
 * ------------------------------------------------------------------------
 * The first paint uses localStorage (or the default). The account value
 * arrives a round trip later and is applied without a reload, so a reader who
 * chose dark on another device sees a brief flash of the device theme on
 * first visit.
 *
 * Fixing that means reading the theme on the server and inlining it into the
 * HTML, which requires the session in the root layout - and the layout is
 * statically rendered, so making it dynamic would opt the whole site out of
 * static rendering to remove one flash. Trading that for a slightly wider
 * flash on one transition is a bad deal, so this is stated rather than hidden.
 */
export function ThemeSync(): null {
  const { theme, setTheme } = useTheme();
  const settled = useRef<string | null>(null);
  const applied = useRef<string | null>(null);
  const [ready, setReady] = useState(false);

  const { data: session, isPending, error } = authClient.useSession();
  const user = session?.user as { theme?: unknown } | undefined;

  /* -- restore: whenever the account says something new -------------------- */
  useEffect(() => {
    const current = isTheme(theme) ? theme : null;
    const stored = user?.theme;

    if (
      shouldRestoreTheme({
        isPending,
        error,
        storedTheme: stored,
        currentTheme: current,
        applied: applied.current,
      })
    ) {
      applied.current = stored as string;
      setTheme(stored as string);
      // The page is now (about to be) showing the account's theme, so that is
      // the baseline a later local change is measured against.
      settled.current = stored as string;
      setReady(true);
      return;
    }

    /*
     * The baseline is only meaningful once the query has actually answered.
     * Seeding it while still fetching would record "whatever the device had"
     * as the starting point, and a reader who changed the theme in the gap
     * would have their change written to their account without ever having
     * seen the account's value.
     */
    if (isPending || error) return;

    settled.current = current;
    setReady(true);
  }, [isPending, error, user?.theme, theme, setTheme]);

  /* -- save: only a change the reader made --------------------------------- */
  useEffect(() => {
    if (!ready) return;
    if (!user) return;

    const chosen = isTheme(theme) ? theme : null;
    if (!shouldSaveTheme({ signedIn: true, settled: settled.current, current: chosen })) return;

    const timer = setTimeout(() => {
      settled.current = chosen;
      void authClient.updateUser({ theme: chosen });
    }, 400);

    return () => clearTimeout(timer);
  }, [ready, theme, user]);

  return null;
}