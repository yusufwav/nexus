import { NextResponse } from "next/server";

import { CROSS_ORIGIN_REFUSAL, originAllowed } from "@/lib/origin-guard";
import { allowedOrigins } from "@/lib/origin-set";
import { getSession } from "@/lib/session";

/**
 * WHY THIS GATE IS A FUNCTION EVERY ROUTE CALLS
 * ------------------------------------------------------------
 * A key route that forgets this returns the credential list — or worse,
 * accepts a write — to an anonymous caller. Repeating the check in each
 * route means the eighth route is the one that forgets it.
 *
 * 401 rather than a redirect: these are JSON endpoints, and a 307 to
 * /login would be followed into an HTML page by a client expecting data.
 *
 * AND WHY THERE IS A SECOND GATE FOR MUTATIONS
 * ------------------------------------------------------------
 * This one answers "who is this". It does not answer "where did this
 * request come from", and a session cookie alone cannot: any page that
 * can make the browser attach it is indistinguishable from this app.
 *
 * `SameSite=Lax` currently stops that, but it is a library default rather
 * than a decision made here, and it is one config change away from not
 * applying. Mutating routes therefore take a `req` and route it through
 * `requireSameOriginUser` instead. Reads are unaffected: there is nothing
 * to forge about a GET.
 */
export async function requireUser(
  req?: Request,
): Promise<{ id: string } | NextResponse> {
  // No request in hand means a read-only caller; see the routes.
  if (req && !originAllowed(req, allowedOrigins())) {
    return NextResponse.json(CROSS_ORIGIN_REFUSAL, { status: 403 });
  }

  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  return user;
}