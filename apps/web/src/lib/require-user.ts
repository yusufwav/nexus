import { NextResponse } from "next/server";

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
 */
export async function requireUser(): Promise<{ id: string } | NextResponse> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  }
  return user;
}