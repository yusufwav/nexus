"use client";

import { useEffect, useState } from "react";

/**
 * The narrow-screen query, in one place.
 *
 * 640px is not a preference: it is the breakpoint the stylesheet already
 * draws. `.nt-dash__float` becomes a fixed control at max-width: 640px and
 * `.nt-dash__id-row` is hidden inside the same query. Any component that has
 * to *behave* differently on a phone has to agree with that number, so the
 * number lives here rather than being retyped — a 639px here and a 641px in
 * the CSS produces a layout that is correct in neither.
 */
export const NARROW_QUERY = "(max-width: 640px)";

/**
 * True while the viewport matches NARROW_QUERY.
 *
 * Starts false and corrects on mount, so server and first client render
 * agree. That is deliberate: this feeds a positioning decision, and a hook
 * that flipped to true during hydration would move an already-open menu
 * under the reader's finger. The menu is never open on first paint, so the
 * correction lands before anyone can see it.
 *
 * `addEventListener` rather than the deprecated `addListener`, so Safari
 * 14+ and every Chromium both take the change path.
 */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(NARROW_QUERY);
    const sync = (): void => setNarrow(mql.matches);

    // Read once: the query may already match by the time this runs, and
    // waiting for a "change" event would mean never firing at all.
    sync();
    mql.addEventListener("change", sync);
    return () => mql.removeEventListener("change", sync);
  }, []);

  return narrow;
}