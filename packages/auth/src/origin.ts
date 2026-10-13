/**
 * AN ORIGIN WITHOUT A SCHEME CAN NEVER MATCH
 * ------------------------------------------------------------------------
 * Deployed on Vercel, every /api/auth/* route returned 403 "Invalid origin".
 * The allowlist contained:
 *
 *   nexus-yusufwav.vercel.app
 *
 * and the browser sent:
 *
 *   Origin: https://nexus-yusufwav.vercel.app
 *
 * An Origin header is defined as scheme + host + port. A bare hostname is
 * not an origin and never will be, so the comparison failed against the
 * real deployment's own traffic — the app refusing itself.
 *
 * WHERE THE BARE HOSTNAME CAME FROM
 *
 * BETTER_AUTH_URL is not set by hand on Vercel. It is computed in
 * .env.schema from VERCEL_ORIGIN, which falls back to
 * VERCEL_PROJECT_PRODUCTION_URL and then VERCEL_URL — and both of those
 * are bare hostnames by design. Vercel documents them that way. So the
 * value was correct as far as it went and still unusable for its only
 * purpose.
 *
 * WHY NORMALISE IN CODE RATHER THAN IN THE SCHEMA
 *
 * Prefixing https:// in .env.schema would be the smaller edit, and it is
 * the wrong one. It fixes the Vercel path and leaves every other source of
 * this value exactly as fragile as it is now: a hand-set BETTER_AUTH_URL
 * with a trailing slash, with a path, or with http:// for local work. The
 * value is consumed in two independent places - Better Auth's trustedOrigins
 * and the app's own CSRF guard - and both were wrong in the same way. One
 * function at the point of use fixes both and any future caller.
 *
 * WHY NOT WIDEN THE CHECK INSTEAD
 *
 * The tempting fix is to accept the host with or without a scheme, or to
 * trust whatever Origin arrives. Both silently reduce the origin check to
 * no check, and that check is the only thing stopping a page on another
 * site from making authenticated requests as a signed-in reader. The
 * correct value is compared exactly, so the value has to be right.
 */

/** Trailing slashes make "https://x/" and "https://x" compare unequal. */
function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.replace(/\/+$/, "") : value;
}

/**
 * Turn whatever this environment supplied into a real origin.
 *
 * Returns "" for anything unusable rather than a plausible-looking guess.
 * An empty entry in an allowlist can never match a request, so a missing
 * base URL fails closed and says so - which is the correct direction. The
 * alternative, defaulting to some host, would mean an app that silently
 * trusts a domain nobody chose.
 */
export function normalizeOrigin(raw: string | undefined | null): string {
  if (typeof raw !== "string") return "";

  const trimmed = raw.trim();
  if (trimmed.length === 0) return "";

  // Already schemed. Leave the scheme alone - http://localhost:3001 is
  // correct in development and downgrading it would break local work.
  if (/^https?:\/\//i.test(trimmed)) return stripTrailingSlash(trimmed);

  // A protocol-relative "//host" is not something a platform sets, but it
  // is unambiguous, so treat it as the https it obviously means.
  if (trimmed.startsWith("//")) return stripTrailingSlash(`https:${trimmed}`);

  // The Vercel case: a bare hostname, on a platform where everything is
  // served over TLS.
  return stripTrailingSlash(`https://${trimmed}`);
}

/**
 * Split a comma-separated allowlist and normalise each entry.
 *
 * Used for BETTER_AUTH_EXTRA_ORIGINS, which is typed by hand on a
 * developer's machine and therefore gets a trailing comma or a stray space
 * sooner or later.
 */
export function normalizeOriginList(raw: string | undefined | null): string[] {
  if (typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((o) => normalizeOrigin(o))
    .filter((o) => o.length > 0);
}