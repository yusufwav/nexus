import { NextResponse, type NextRequest } from "next/server";

/**
 * AUTH MIDDLEWARE
 * ------------------------------------------------------------
 * There was no middleware at all, so every protected page opted in
 * individually by calling requireSession(). That is a convention, not
 * a boundary: the /ai page forgot, and shipped a whole chat UI to
 * anonymous visitors. The next page would forget too.
 *
 * This is the belt to that pair of braces. It matches by prefix
 * rather than an allowlist, so a new route under /dashboard or /ai is
 * covered the moment it exists, without anyone remembering to opt in.
 *
 * WHAT THIS IS NOT: an authorisation check. It does not validate the
 * session token — it only looks for a cookie's presence, because
 * verifying one properly means hitting the database, which the edge
 * runtime cannot do. So a forged cookie gets past here and is then
 * correctly rejected by requireSession()/getSession() further in. The
 * page-level gates are still what enforce access; this only ensures a
 * request carrying no session never reaches them, and never renders a
 * protected shell on the way to being redirected.
 */

const PREFIXES = ["/dashboard", "/ai"] as const;

function isProtected(pathname: string): boolean {
  return PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;

  // Never intercept the auth endpoints themselves — the sign-in flow
  // lives under /api/auth and redirects back here. API routes do their
  // own checks too, and a 307 to /login would break a JSON client.
  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/")) {
    return NextResponse.next();
  }

  if (!isProtected(pathname)) {
    return NextResponse.next();
  }

  // Presence of a session cookie, not validity. See the note above.
  // The name carries a __Secure- / __Host- prefix when the app is
  // served over HTTPS, so accept those spellings too.
  const hasSessionCookie =
    req.cookies.has("better-auth.session_token") ||
    req.cookies.has("__Secure-better-auth.session_token") ||
    req.cookies.has("__Host-better-auth.session_token");

  if (!hasSessionCookie) {
    const login = new URL("/login", req.url);
    // Carry the destination so signing in returns the visitor to where
    // they were headed rather than dumping them on the overview.
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  /*
   * Everything except Next's own assets, the API routes, and anything
   * with a file extension (static assets served from /public).
   */
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[\\w]+$).*)"],
};