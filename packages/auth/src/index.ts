import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@Main/db";
import * as schema from "@Main/db/schema/auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

import { mailConfigured, sendMail } from "./mail";
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

/**
 * HOW LONG A VERIFICATION LINK IS GOOD FOR
 * ------------------------------------------------------------------------
 * One hour. The token is a bearer credential delivered by email, so the
 * window is the time a stolen link is useful to somebody other than its
 * owner, and email delivery is measured in minutes — a link that outlives the
 * inbox it was sent to is just an unused attack surface.
 *
 * Better Auth's own default is 3600s, so this matches it deliberately rather
 * than inventing a number. The reason it is stated here is that it is a
 * security-relevant choice and the next reader should know it was one.
 */
const VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60; // 1 hour

/**
 * IS EMAIL VERIFICATION ACTUALLY IN FORCE
 * ------------------------------------------------------------------------
 * Depends on mail being configured, and that dependency is the whole point.
 *
 * Verification is enforced by refusing an unverified reader something. If
 * mail cannot be sent, an unverified reader can never become verified, so
 * enforcing it protects nothing — it just removes the tutor permanently for
 * anyone who signs up on a deploy that is missing a token. That is a worse
 * failure than having no verification at all: it looks like the feature
 * working, and it locks people out.
 *
 * So the gate is tied to the ability to satisfy it. With MailTrap configured
 * it is on; without it, it is off and the site behaves exactly as it did
 * before. Every caller reads this rather than reading the token itself, so
 * there is one answer to "is verification in force" rather than three
 * plausible ones.
 */
export function emailVerificationRequired(): boolean {
  return mailConfigured();
}

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
     * EMAIL VERIFICATION
     * ------------------------------------------------------------
     * There was none. `user.email_verified` was already false for every
     * account and nothing ever read it, so an address was an unproven string
     * that a reader typed twice into the same form.
     *
     * WHAT IT IS ENFORCED AGAINST, AND WHAT IT IS NOT
     * --------------------------------------------------------
     * Verification proves control of a mailbox. It does not prove identity,
     * and it does not stop someone registering with an address they do not
     * own — that is what a payment wall is for, and paywalls already exist
     * here. So this is not asked to carry that weight.
     *
     * What it does buy is narrower and real: one mailbox can no longer mint
     * an unbounded number of accounts against the tutor's AI budget, because
     * the budget is per reader and a throwaway address previously gave a
     * fresh budget for free. That is why the gate sits on AI messages and not
     * on the site — see apps/web/src/app/api/ai/route.ts. Browsing, the
     * catalogue and buying are all unaffected, because refusing those would
     * cost a real reader their purchase over a slow mail server while
     * stopping nothing.
     *
     * `sendOnSignUp` is on, so the mail is in flight before the reader has
     * finished reading the confirmation screen. Better Auth's default is to
     * send it on sign-in only when already unverified, which means a reader
     * who closed the tab loses the link and has to know a resend exists.
     *
     * `autoSignInAfterVerification` is on because the reader has just proved
     * they clicked a link in their own inbox moments ago; making them type
     * their password again immediately after is a second, redundant
     * identity check, and it trains people to expect verification links to be
     * followed by being logged out.
     */
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      expiresIn: VERIFICATION_EXPIRES_IN_SECONDS,
      /**
       * Better Auth hands us the finished link; we deliver it.
       *
       * `url` is not optional here and not something to be reconstructed from
       * the email — it carries a signed token whose expiry and single-use
       * semantics live in this library. Building an equivalent link by hand
       * would be a second implementation of a security-relevant token, and
       * the two would drift.
       *
       * A failure to send is logged and swallowed, never thrown. This runs
       * inside sign-up: throwing would report a failed registration for an
       * account that in fact exists, and the reader's next attempt would
       * collide with "user already exists". They would be told the worst
       * possible thing — that sign-up did not work — when the only thing
       * that failed was a mail server.
       */
      sendVerificationEmail: async ({ user, url }) => {
        const result = await sendMail({
          to: user.email,
          subject: "Verify your Nexus account",
          heading: "Confirm your email address",
          body: "One click and your address is confirmed. This link is good for an hour.",
          link: url,
          linkLabel: "Verify my email",
        });

        if (!result.ok) {
          console.error(
            `[auth] verification mail for ${user.email} was not accepted: ${result.reason ?? "unknown reason"}`,
          );
        }
      },
    },
    /*
     * THE READER'S THEME
     * ------------------------------------------------------------
     * Declared as an additional field so it arrives in the session payload
     * and can be written through updateUser, with no bespoke route and no
     * hand-rolled SQL on the app side.
     *
     * `input: true` is what makes it writable. Without it the field is
     * readable but not settable, and the save would have to be a direct
     * database write - which is the thing this is avoiding, because the
     * session cookie is signed by the library and a hand-rolled UPDATE
     * would sit right next to code that is trusted to be correct.
     *
     * `required: false` keeps it nullable, and nullable is the point: NULL
     * means "never chose", which is what lets a reader with no preference
     * fall through to the site default. Making it required would force
     * every existing account to be backfilled with a theme nobody picked.
     *
     * There is deliberately no enum or validation list here. The allowed
     * values live in apps/web/src/lib/themes.ts so that adding a palette
     * costs one array entry and no migration - see the note on the column
     * in packages/db/src/schema/auth.ts. This only declares that the field
     * is a string.
     */
    user: {
      additionalFields: {
        theme: {
          type: "string",
          required: false,
          input: true,
        },
      },
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
