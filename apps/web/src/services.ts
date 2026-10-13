import { readFileSync } from "node:fs";
import path from "node:path";

import { createAuth } from "@Main/auth";
import { createDb } from "@Main/db";

import { ENV } from "./env.server";
import { providerKeysConfigured } from "./lib/key-crypto";

export const db = createDb(ENV);
export const auth = createAuth(ENV, db);

/**
 * Is the var present in apps/web/.env even though the process cannot see
 * it? Development only.
 *
 * This is the single most confusing state this codebase can be in, and it
 * is reached easily: append the secret to .env while `pnpm dev` is
 * already running and the running process never picks it up. Env loading
 * here belongs to varlock, its hot-reload can fail silently, and nothing
 * was watching for the outcome — so the symptom was a 500 on save and a
 * tutor answering from the server's key, neither of which points at a
 * missing environment variable.
 *
 * So this reads .env straight off disk purely to tell those two states
 * apart. `.env` present + process.env absent is the answerable case, and
 * the answer is "restart the dev server", which is a completely different
 * piece of advice from "generate a secret and add it".
 *
 * Not attempted in production, where there is no .env to read and the only
 * real answer is a redeploy.
 *
 * THE ACTUAL FAILURE, so this is not guesswork. varlock injects its
 * resolved values into process.env at startup, and on hot-reload it first
 * DELETES every key it injected and restores its pre-injection snapshot.
 * Its reload fails on this machine on every dev start (a libuv assertion
 * in async.c), so a process that started before the secret was added ends
 * up with a process.env missing every schema-backed variable — while
 * still serving pages, answering requests, and looking entirely healthy.
 *
 * That is the case this distinguishes: the secret is in .env, the process
 * cannot see it, and the fix is a restart. Reading .env is the only way
 * to tell that apart from "nobody has configured this yet".
 */
function secretIsInDotEnv(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  // Several candidates rather than a bare ".env": process.cwd() is the
  // package directory under turbo, the monorepo root when next is invoked
  // through a workspace filter from above, and something else entirely
  // when a script imports this module. Rather than guess once, try the
  // places it can plausibly be and treat "found it and it has the key" as
  // the only positive — a false negative just drops the extra hint, but a
  // false positive would tell someone to restart a server that needs no
  // restarting.
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "apps", "web", ".env"),
    path.join(process.cwd(), "..", "..", "apps", "web", ".env"),
  ];
  for (const file of candidates) {
    try {
      const contents = readFileSync(file, "utf8");
      // Matched only when commented out? Then it is not configured.
      if (/^PROVIDER_KEYS_SECRET=.+$/m.test(contents)) return true;
    } catch {
      /* not here; try the next candidate */
    }
  }
  return false;
}

/**
 * BOOT CHECK — is reader credential storage actually configured?
 *
 * NOT a throw. The tutor is usable without it: a reader who never adds a
 * key gets the server model, which is the intended free path. Crashing
 * the process would take the whole site down to report a problem with one
 * optional feature, and on a fresh clone the var is legitimately absent
 * until someone generates it.
 *
 * Runs once at module load, which on a serverless platform is per cold
 * start — the right frequency, since the var cannot change without a
 * deploy.
 */
const secretStatus = providerKeysConfigured();

/*
 * WHAT ORIGIN IS THIS DEPLOYMENT TRUSTING?
 * ------------------------------------------------------------
 * Printed on every cold start in production, on purpose.
 *
 * A wrong trustedOrigins fails in the most opaque way available: every
 * same-origin request is refused with a bare 403 "Invalid origin", on
 * sign-in, on sign-up and on every session check, while pages, styles and
 * every other API route behave perfectly. Nothing about that points at
 * configuration, and the value that is wrong is not printed anywhere.
 *
 * The deployed origin is public information - it is the address the
 * reader just typed - so this leaks nothing. Compare the first value
 * against the domain in the address bar: if they differ, sign-in is
 * being refused against itself.
 *
 * An empty BETTER_AUTH_URL is the other case worth catching, and it looks
 * the same from the outside. It means the platform variables this computes
 * from were absent, and every origin is rejected rather than the right one.
 */
console.log(
  `[boot] base URL: ${JSON.stringify(ENV.BETTER_AUTH_URL || "<empty>")}  (production domain: ${JSON.stringify(process.env.VERCEL_PROJECT_PRODUCTION_URL || "<unset>")}, deployment: ${JSON.stringify(process.env.VERCEL_URL || "<unset>")}, VERCEL_ENV: ${JSON.stringify(process.env.VERCEL_ENV || "<unset>")})`,
);

if (!secretStatus.ok) {
  const inDotEnv = secretIsInDotEnv();
  console.warn(
    [
      "",
      "  BYOK is OFF: reader-supplied model keys cannot be stored.",
      `  ${secretStatus.detail}`,
      ...(inDotEnv
        ? [
            "",
            "  -> The secret IS in .env but this process cannot see it, so the",
            "     server started before it was added. RESTART THE DEV SERVER —",
            "     nothing else will fix it.",
          ]
        : []),
      "  The tutor still works and answers with the server's model.",
      "  Until this is set, /api/keys returns 503 and every reader is served",
      "  by GOOGLE_GENERATIVE_AI_API_KEY rather than their own.",
      "",
    ].join("\n"),
  );
} else if (process.env.NODE_ENV === "production") {
  // Worth a line in production logs and nowhere else: a reader who saved
  // a key is spending their own money, so "is this actually on?" should
  // never be something you have to go looking for.
  console.log("[boot] provider key sealing is configured");
}