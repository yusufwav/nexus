import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import type { Database } from "@Main/db";
import * as schema from "@Main/db/schema/auth";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

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
function trustedOrigins(env: AuthConfig): string[] {
  const raw = process.env["BETTER_AUTH_EXTRA_ORIGINS"];
  const extra =
    raw === undefined
      ? []
      : raw
          .split(",")
          .map((o) => o.trim())
          .filter((o) => o.length > 0);
  return [...new Set([env.BETTER_AUTH_URL, ...extra])];
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
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/sign-up/email": { window: 3600, max: 5 },
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [nextCookies()],
  });
}

export type Session = ReturnType<typeof createAuth>["$Infer"]["Session"];
