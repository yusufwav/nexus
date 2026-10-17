"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";

import { authClient } from "@/lib/auth-client";
import { readQuickTheme } from "@/lib/theme-override";
import { isTheme, shouldRestoreTheme } from "@/lib/themes";

/**
 * THE ACCOUNT'S DEFAULT THEME APPLIES ON ARRIVAL
 * ------------------------------------------------------------------------
 * One job. When the session resolves, if the reader has a default theme on
 * their account and has not overridden it with the header button, put it on
 * the page.
 *
 * next-themes already persists to localStorage, which covers the easy half -
 * same browser, next week. What it does not do is follow the *account*. Clear
 * the storage, or open another device, and the choice is gone even though the
 * session says who you are. That gap is what this closes.
 *
 * IT NO LONGER SAVES, AND THAT IS THE FIX
 * ------------------------------------------------------------------------
 * There was a second effect here that watched the theme and wrote any change
 * into the account row. It existed because the header button and the Settings
 * picker shared one slot and something had to persist the button's choice.
 *
 * They do not share one slot any more - the button's choice lives in
 * localStorage under its own key, see lib/theme-override - so the effect had
 * no reason to exist and was actively harmful. It made pressing the small
 * light/dark button write `light` into the reader's row and overwrite the
 * palette they had chosen as their default, with nothing on screen to say so
 * and no way back except going into Settings and picking again.
 *
 * ThemePicker writes the account directly, in one place, where the reader has
 * just deliberately chosen something. A component that saves on every change
 * cannot tell that difference, which is the whole problem with it.
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
 * session actually arrived afterwards - a slow fetch, one transient failure, a
 * cold start, a cold Next.js chunk in production - the effect returned early
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
 * then picks a different one must keep it, even though the account still
 * holds the old value - so the restore condition stops matching and leaves it
 * alone.
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
  const applied = useRef<string | null>(null);

  const { data: session, isPending, error } = authClient.useSession();
  const user = session?.user as { theme?: unknown } | undefined;

  /*
   * Read on every render rather than once in an effect or a ref.
   *
   * This has to be evaluated inside the decision, not captured at mount: the
   * header button writes that key from a click handler in a component that
   * mounts long after this one, so anything read earlier is stale. Reading it
   * here costs one localStorage get per render, which is nothing next to the
   * session query already running.
   */
  const quickOverride = readQuickTheme();

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
        quickOverride,
      })
    ) {
      applied.current = stored as string;
      setTheme(stored as string);
    }
  }, [isPending, error, user?.theme, theme, setTheme, quickOverride]);

  return null;
}