import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@Main/db";
import * as schema from "@Main/db/schema/auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { normalizeOrigin, normalizeOriginList } from "./origin";

/*
 * Re-exported so the app's own origin guard normalises with the same function
 * this package uses. Two copies of this logic would be two chances to
 * disagree, and the failure is silent: an allowlist that never matches still
 * looks like a valid set of strings.
 */
export { normalizeOrigin, normalizeOriginList } from "./origin";

export type AuthConfig = {
  BETTER_AUTH_URL: string;
  BETTER_AUTH_SECRET: string;
};

/**
 * Extra origins, for testing from a phone on the same wifi.
 * ------------------------------------------------------------
 * `trustedOrigins` is a strict allowlist, so serving the app from
 * `http://10.0.0.10:3001` and signing in from there fails the CSRF
 * origin check — the request's Origin is not `BETTER_AUTH_URL`. That
 * is correct behaviour rather than a bug, and the fix is to NAME the
 * extra origin instead of widening the check.
 *
 * Deliberately NOT done: falling back to "trust whatever Origin the
 * request carries", or to a wildcard. Either silently reduces the
 * origin check to no check at all, and this check is what stands
 * between a page on another site and a signed-in session.
 *
 * Read straight from process.env rather than through the generated env
 * module so that adding it does not require regenerating env.ts — a
 * codegen step that is not runnable on every machine here. Unset means
 * exactly one trusted origin: the deployed one.
 */
/*
 * SESSION LIFETIME
 * ------------------------------------------------------------
 * Seven days was Better Auth's default, which is long for a cookie that
 * is the only thing standing between an attacker and somebody's saved
 * transcripts. The two settings below trade a little convenience for a
 * much smaller window, and the split is the important part:
 *
 *   expiresIn  7 days
 *     How long a session is valid if the reader does nothing at all.
 *     Long enough that someone who signs in once a week is not logged out
 *     every time, which is the reason the default was not simply cut.
 *
 *   updateAge  24 hours
 *     How long before an ACTIVE session's expiry is pushed back. This is
 *     the setting that actually shrinks the exposure: a session that is
 *     being used is renewed daily, so a stolen cookie is only useful for
 *     as long as the thief keeps using it — and every renewal changes
 *     the token, so a copy taken before the window rolls over stops
 *     working.
 *
 * The combination means an unused session dies in 7 days and a used one
 * can be kept alive indefinitely, which is the behaviour readers expect
 * and which does not require trusting a cookie for a month.
 */
const SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7; // 7 days
const SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24; // 1 day

function trustedOrigins(env: AuthConfig): string[] {
  /*
   * Both sources are normalised. BETTER_AUTH_URL arrives on Vercel as a bare
   * hostname - see the note in origin.ts - and an Origin header always
   * carries a scheme, so the un-normalised value made the deployed app
   * refuse its own traffic with 403 "Invalid origin". EXTRA_ORIGINS is
   * typed by hand, so it is normalised for the trailing comma and the stray
   * space rather than because it needs the scheme.
   */
  const own = normalizeOrigin(env.BETTER_AUTH_URL);
  const extra = normalizeOriginList(process.env["BETTER_AUTH_EXTRA_ORIGINS"]);
  return [...new Set([own, ...extra].filter((o) => o.length > 0))];
}

/*
 * BETTER_AUTH_EXTRA_ORIGINS IS FOR LOCAL DEVELOPMENT ONLY
 * ------------------------------------------------------------
 * Listing an origin here lets a page on it make AUTHENTICATED requests
 * with the reader's session cookie. That is exactly what you want when
 * testing the app from a phone on the same wifi, and it is exactly what
 * you do not want on a deployed site, where the list should contain
 * nothing.
 *
 * It is deliberately NOT in apps/web/.env.schema, so varlock does not
 * know about it and cannot complain when it is absent; it arrives through
 * turbo's `globalEnv`.
 *
 * So this is a loud warning rather than a hard failure. Throwing would
 * break the one case it exists for — someone mid-development with the
 * variable set locally — which is the opposite of helpful. Printing the
 * origins on every cold start is enough that nobody can ship it without
 * having seen it.
 */
if (process.env.NODE_ENV === "production" && process.env["BETTER_AUTH_EXTRA_ORIGINS"]) {
  console.warn(
    [
      "[auth] BETTER_AUTH_EXTRA_ORIGINS is set in production:",
      `  ${process.env["BETTER_AUTH_EXTRA_ORIGINS"]}`,
      "  Any page on those origins can make authenticated requests as a",
      "  signed-in reader. This is intended for LAN testing only — unset it",
      "  on the deployed environment.",
    ].join("\n"),
  );
}

export function createAuth(env: AuthConfig, database: Database) {
  return betterAuth({
    database: drizzleAdapter(database, {
      provider: "pg",
      schema,
    }),
    trustedOrigins: trustedOrigins(env),
    emailAndPassword: {
      enabled: true,
      /*
       * The default was 8, which happily accepts "password1". This
       * is the only thing standing between a leaked wordlist and the
       * accounts, so it is raised rather than left at the default.
       */
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    /*
     * There was no rate limiting at all, which made sign-up a free
     * account factory: one unauthenticated POST per account, no
     * CAPTCHA, no verification. Tight on the credential endpoints
     * specifically — sign-in is a password-guessing oracle, and
     * sign-up is how you get a free seat.
     */
    rateLimit: {
      enabled: true,
      window: 60,
      max: 10,
      // Database-backed, so the budget survives a restart. Memory
      // storage would hand an attacker a fresh allowance every time
      // the process cycled.
      storage: "database",
      // Fail CLOSED, not open.
      //
      // The default is to fall back to an in-memory store when the
      // database one is unavailable, which is the wrong direction here:
      // these rules guard credential endpoints, so a limiter that can be
      // made to fail is a password-guessing oracle, and "the limiter
      // broke" must never quietly mean "no limit".
      //
      // Note the deliberate asymmetry with the tutor route, which does
      // the opposite — see packages/db/src/ai-rate-limit.ts. There, failing
      // closed costs an honest reader a 429; here it costs someone their
      // account.
      disableMemoryFallback: true,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
      },
    },
    session: {
      expiresIn: SESSION_EXPIRES_IN_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    /*
     * The cookie carries the session token itself, so it is `httpOnly`
     * (no script can read it) and `sameSite: "lax"` (no other site can
     * send it on a write). Both are Better Auth's defaults and are set
     * explicitly here so that a dependency upgrade cannot quietly change
     * them — the origin guard in apps/web is a second layer, and a second
     * layer is only a second layer if the first one stays put.
     *
     * `secure` is deliberately NOT forced. It defaults to true when
     * baseURL is https, which is the deployed case; forcing it would
     * break local development over http, where the cookie would then
     * never be sent and every test would fail with an authentication
     * error that looks nothing like a cookie problem.
     */
    cookies: {
      httpOnly: true,
      sameSite: "lax",
    },
    secret: env.BETTER_AUTH_SECRET,
    /*
     * Normalised for the same reason as trustedOrigins: Better Auth builds
     * absolute URLs from this, and `${baseURL}/api/auth/...` on a bare
     * hostname is not a URL. Correcting it in one place means the allowlist
     * and the base cannot disagree - which is exactly the failure mode here,
     * where a base that looked right produced an allowlist that refused
     * everything.
     */
    baseURL: normalizeOrigin(env.BETTER_AUTH_URL),
    plugins: [nextCookies()],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
