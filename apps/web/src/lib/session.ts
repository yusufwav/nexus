import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Session } from "@Main/auth";

import { auth } from "@/services";

/**
 * SESSION — SERVER ONLY
 * ------------------------------------------------------------
 * One place to read the current session on the server, so the auth
 * gate and the "who is this" lookups cannot drift apart.
 *
 * `getSession()` never throws — an unauthenticated visitor simply
 * gets null, which is what the public pages (the module catalogue,
 * the module detail page) need in order to render prices and
 * descriptions while hiding the actions.
 *
 * `requireSession()` redirects, and is for the dashboard and its
 * sub-pages, which have nothing to show a logged-out visitor.
 *
 * SERVER ONLY: this imports the auth instance, which imports the
 * database driver. Importing it from a client component fails at
 * runtime with "Can't resolve 'dns'" — which is exactly how
 * `initialsOf` ended up in a client bundle once already. Anything a
 * client component needs belongs in its own module; see
 * lib/initials.ts.
 *
 * TODO: add `import "server-only"` to make that a build error rather
 * than a runtime one. The package is not installed. See
 * IDEAS/TODO.md.
 */

/** The signed-in user, or null. Safe to call from any server component. */
export async function getSession(): Promise<Session["user"] | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user ?? null;
  } catch {
    // An unreachable auth database must not take the public pages
    // down with it; the dashboard's own gate catches the miss.
    return null;
  }
}

/** The signed-in user, or a redirect to /login. */
export async function requireSession(returnTo?: string): Promise<Session["user"]> {
  const user = await getSession();
  if (!user) {
    // Preserve where they were headed so signing in returns them
    // there instead of dumping them on the overview.
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return user;
}

// Initials for the avatar live in ./initials, not here: this module
// imports the server-only auth instance, so a client component
// reaching into it would pull the database driver into the bundle.