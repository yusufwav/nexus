import "server-only";

import { ENV } from "@/env.server";
import { buildAllowedOrigins } from "@/lib/origin-guard";

/**
 * THE ONE PLACE THAT KNOWS WHERE ORIGINS COME FROM
 * ------------------------------------------------------------
 * `origin-guard.ts` deliberately takes the allowlist as an argument rather
 * than reading the environment, so it can be tested against a known set.
 * That leaves one question it cannot answer for itself: in THIS repo,
 * where does the configured base URL actually live?
 *
 * The answer is not `process.env`, and that is the whole point of this
 * file.
 *
 * Env loading here belongs to varlock. It resolves .env into a validated
 * object and re-exports it through src/env.ts, and it does NOT write the
 * values back into process.env. The origin guard's first version read
 * `process.env.BETTER_AUTH_URL` directly, found nothing, and refused
 * every same-origin request in the app — 403 on the tutor's own chat, on
 * saving a key, on posting a message.
 *
 * Two sources, and they are NOT interchangeable:
 *
 *   BETTER_AUTH_URL
 *     Comes from the varlock object. On Vercel the platform also sets it
 *     in the process environment, so process.env would work in production
 *     and fail in dev — which is the worst possible split, because it
 *     looks fine until someone runs the app locally.
 *
 *   BETTER_AUTH_EXTRA_ORIGINS
 *     NOT in .env.schema. It is a per-machine setting (testing from a
 *     phone on the LAN), not part of the app's contract, so varlock has no
 *     reason to know it exists. It reaches the process through turbo's
 *     `globalEnv`, which is why reading it from process.env is correct and
 *     reading it from the varlock object would always be undefined.
 *
 *     It is a development-only setting and must stay unset in production —
 *     packages/auth warns loudly on every cold start if it is not, and
 *     this function is the other half of the same allowlist, so a reader
 *     who wanted the warning to be ignored would find it printed twice.
 *
 * Kept in step with packages/auth's `trustedOrigins`, which builds the
 * same set from the same two inputs; test-origin-guard.mjs fails if the
 * two definitions stop agreeing.
 */
export function allowedOrigins(): ReadonlySet<string> {
  return buildAllowedOrigins(ENV.BETTER_AUTH_URL, process.env.BETTER_AUTH_EXTRA_ORIGINS);
}