/**
 * CROSS-SITE REQUEST FORGERY
 * ------------------------------------------------------------
 * Every mutating route in this app authenticates with a session cookie
 * and checks nothing else about where the request came from. There was no
 * origin check anywhere in the codebase.
 *
 * WHAT THAT ACTUALLY MEANT HERE, precisely rather than dramatically: the
 * session cookie is `SameSite=Lax`, which already prevents a cross-site
 * POST from carrying it, so a drive-by CSRF against `/api/keys` would
 * have been refused by the browser before it reached the route. The
 * defence was one browser behaviour, applied by a library, to a
 * configuration nobody here chose deliberately.
 *
 * WHY ADD A SECOND LAYER ANYWAY
 *
 *   · `SameSite=Lax` is a default, not a decision. It changes if a future
 *     deploy needs `SameSite=None` for an iframe or an OAuth callback, and
 *     that single change would silently turn every mutating route in the
 *     app into a CSRF target with no diff in this codebase to review.
 *   · It is browser-dependent, and this app is also driven by curl,
 *     scripts and tests — none of which enforce anything.
 *   · A refusal that says WHY is worth more than a browser error page
 *     whose cause is invisible from the server side.
 *
 * WHAT IT IS NOT: a defence against a same-site attacker (XSS), who can
 * read the session anyway and needs no forgery. This is about other
 * origins.
 *
 * NO `server-only`, BUT IT DOES REACH FOR env.server
 * ------------------------------------------------------------
 * It has no database access, no auth instance and no Node APIs — just
 * two environment variables — so it is NOT marked `server-only`, because
 * that would stop a script importing it to assert its behaviour, which is
 * exactly what test-origin-guard.mjs does. The one rule that would
 * justify the marker is "never ship this to a browser", and there is
 * nothing here to ship: an attacker reads the same variables on the
 * server, or omits the header and takes the 403.
 *
 * It does import `ENV` from ./env.server, which is a generated module and
 * does pull in varlock. That is a reason to keep the parsing pure and
 * separately testable (see buildAllowedOrigins) rather than a reason to
 * stop importing it — the base URL genuinely is not readable from
 * process.env here, and the alternative is a guard that always refuses.
 *
 * THE ALLOWLIST
 *
 * Built from the same origins Better Auth trusts — `BETTER_AUTH_URL` plus
 * `BETTER_AUTH_EXTRA_ORIGINS`, resolved through the identical function in
 * packages/auth. Two allowlists that can disagree are how a route ends up
 * accepting an origin the auth layer would have rejected, or the reverse,
 * and neither failure is obvious from the outside.
 *
 * That sharing is not free: it means this module cannot import the auth
 * instance (it would drag the database driver into every route that
 * guards a request), so `trustedOrigins` is re-read here from the same
 * environment variables. The duplication is deliberate and narrow —
 * three variables and a split on "," — and is checked by
 * `test-trusted-origins.mjs`, which fails if the two definitions drift.
 */

/**
 * Split the comma-separated extras into origins.
 *
 * Pure and separately testable, because this is the part with edge cases
 * (blank entries, padding, duplicates) and it is the part that decides
 * whether a legitimate caller is let in.
 */
export function parseExtraOrigins(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

/**
 * Build the allowlist from a base origin plus the extras.
 *
 * Deduped because `BETTER_AUTH_EXTRA_ORIGINS` commonly re-lists the
 * deployed origin, and a Set is what the check needs anyway.
 */
export function buildAllowedOrigins(
  baseUrl: string | undefined,
  extrasRaw: string | undefined,
): ReadonlySet<string> {
  const origins = new Set<string>();
  if (baseUrl) origins.add(baseUrl.trim());
  for (const o of parseExtraOrigins(extrasRaw)) origins.add(o);
  return origins;
}

/**
 * Is this request coming from us?
 *
 * Origin is checked first and preferred, with Referer as the fallback for
 * the browsers that omit Origin on same-origin form posts. Both are
 * compared against the allowlist, so a missing header on both is a
 * refusal rather than a pass — see the note on the missing-header case.
 *
 * `allow` is a PARAMETER, not an environment read, and that is the whole
 * reason this module is worth having. The first version read
 * `process.env.BETTER_AUTH_URL` itself and every same-origin mutation
 * returned 403 — including the tutor's own chat. In this repo env loading
 * belongs to varlock, which resolves .env into its own validated object
 * and does not write the values back into process.env, so the variable
 * being read did not exist and the allowlist came back empty.
 *
 * `packages/auth` never hit that because `createAuth` is HANDED the
 * resolved env object rather than reading it. So the caller here is
 * handed the allowlist too — see origin-set.ts, which is the one place
 * that knows how this repo's env actually resolves.
 *
 * It is not a security-relevant parameter: a caller passing a wider set
 * has already decided to allow those origins, and there is exactly one
 * caller in the app.
 */
export function originAllowed(req: Request, allow: ReadonlySet<string>): boolean {
  const origin = req.headers.get("origin");
  if (origin) return allow.has(origin);

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return allow.has(new URL(referer).origin);
    } catch {
      return false;
    }
  }

  /*
   * NEITHER HEADER PRESENT — AND IT IS REFUSED.
   *
   * A same-origin fetch() sends Origin, so its absence means the request
   * did not come from a browser page on this site. The legitimate
   * non-browser callers (curl, the test scripts, server-to-server) do not
   * send it either, which is a real cost — so rather than break them
   * silently they get a clear error naming the variable to set.
   *
   * The tempting alternative is to treat a missing Origin as same-origin,
   * which is precisely the hole: any attacker who can suppress the header
   * (a non-browser client) then gets an exemption. This route already
   * requires a session, so the exposure is bounded — but "bounded" is not
   * "closed", and closing it costs one documented env var.
   */
  return false;
}

/** The refusal body, shared so the reason is phrased identically. */
export const CROSS_ORIGIN_REFUSAL = {
  error: "Cross-origin request refused.",
  detail:
    "This request carried no usable Origin or Referer. Browsers send one " +
    "automatically; scripts and curl do not. Set BETTER_AUTH_EXTRA_ORIGINS " +
    "to include this caller's origin, or send an Origin header.",
} as const;