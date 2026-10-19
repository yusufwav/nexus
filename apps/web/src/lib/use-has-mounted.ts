"use client";

import { useEffect, useState } from "react";

/**
 * HAS THIS COMPONENT FINISHED HYDRATING?
 * ------------------------------------------------------------
 * False on the server, false on the client's first render, true from the
 * first effect onwards. It exists so that a component can render the same
 * thing on both sides of hydration and only afterwards start answering
 * questions it could not have answered on the server.
 *
 * WHY IT IS NOT THE SAME AS `isPending`
 * ------------------------------------------------------------
 * It looks interchangeable with the auth client's own pending flag and it
 * is not. `isPending` reads an EXTERNAL STORE, and an external store can
 * change at any moment — including while hydration is still walking the
 * tree. React 19 reports a store that lands mid-hydration as exactly what
 * it looks like: a server/client mismatch, followed by the whole subtree
 * being thrown away and rebuilt on the client.
 *
 * That is not theoretical. It happened on /ai, and only on /ai, and the
 * reason is worth writing down because the fix looks like overkill until
 * you know it:
 *
 *   · the session atom starts as `{ data: null, isPending: true }`, and
 *     `useSyncExternalStore` is given the same getter for both the client
 *     snapshot and the server snapshot — so the server and the first
 *     client render genuinely do agree;
 *   · `useSession` schedules its fetch in a `setTimeout(…, 0)` on mount;
 *   · hydrating /ai takes longer than one round trip to a local server,
 *     because it is the biggest client tree in the app (the horizon
 *     canvas, the chat, the model picker);
 *   · so the fetch resolved while React was still hydrating the header,
 *     `isPending` went false, and the header swapped from its pending
 *     markup to the account menu in the middle of the walk.
 *
 *   /practice is the same code with a smaller tree, and / and /modules
 *   were clean. They are not correct; they are fast enough not to show
 *   it. A fix that only works on the pages where it has not happened yet
 *   is not a fix.
 *
 * A `useEffect` cannot run until hydration has committed, which makes
 * this flag the one signal guaranteed to be false while React is still
 * walking the tree.
 *
 * WHAT IT COSTS. One frame of the pre-mount markup. Every caller here
 * already had a pending state to render, so the pre-mount markup is that
 * same pending state — this changes when it appears, not what it says.
 */
export function useHasMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}