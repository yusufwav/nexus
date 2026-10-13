import { BookOpenIcon, HomeIcon, SparklesIcon } from "lucide-react";

/**
 * THE DASHBOARD'S OUT-OF-CONSOLE DESTINATIONS
 * ------------------------------------------------------------
 * One list, two presentations: the inline icon row the dashboard shell
 * renders on desktop, and the overflow menu it renders on phones.
 *
 * WHY THIS IS A PLAIN MODULE
 * ------------------------------------------------------------
 * `dashboard-shell.tsx` is a server component and `user-menu.tsx` is a
 * client one. If this constant lived inside either of them, the other
 * side would import a VALUE across the client boundary — which
 * type-checks perfectly, because the export has a real type on both
 * sides, and then fails at runtime with
 * `DASH_ACTIONS.map is not a function`. In RSC the server receives the
 * client module's *reference*, not its exports.
 *
 * That class of bug is invisible to `tsc` and only appears in a render,
 * so the shared value lives here, in a module neither side claims.
 *
 * These are the destinations OUTSIDE the dashboard's own sections — the
 * tab bar below handles those. They are kept out of the tab bar because
 * a tab implies "you are here", and none of these are a dashboard page.
 */
export const DASH_ACTIONS = [
  { href: "/", label: "Home", Icon: HomeIcon },
  { href: "/ai", label: "AI tutor", Icon: SparklesIcon },
  { href: "/modules", label: "Browse modules", Icon: BookOpenIcon },
] as const;