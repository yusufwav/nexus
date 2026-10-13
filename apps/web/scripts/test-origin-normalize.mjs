/**
 * Why every /api/auth/* route answered 403 "Invalid origin" in production,
 * and why it no longer does.
 *
 * THE BUG
 *
 * On Vercel, BETTER_AUTH_URL is not set by hand. .env.schema computes it
 * from VERCEL_ORIGIN, which falls back to VERCEL_PROJECT_PRODUCTION_URL and
 * then VERCEL_URL. Both of those are bare hostnames:
 *
 *   allowlist had:  nexus-yusufwav.vercel.app
 *   browser sent:   https://nexus-yusufwav.vercel.app
 *
 * An Origin header is scheme + host + port. A bare hostname is not an origin,
 * so the deployed app refused its own traffic. Locally the same code worked,
 * because a hand-written BETTER_AUTH_URL in .env always carried http:// —
 * which is why nothing failed until deployment.
 *
 * TWO PLACES, ONE FIX
 *
 * Better Auth's trustedOrigins and the app's own CSRF guard build the same
 * allowlist from the same value and were both wrong the same way. So they
 * must be fixed together, by one function — see packages/auth/src/origin.ts.
 *
 * WHAT IS ASSERTED
 *
 * The Vercel hostname, the localhost case that must not regress, and the
 * rule that matters most: normalisation corrects a malformed value and never
 * widens an allowlist. A scheme-less host becomes one exact https origin; it
 * does not become "any origin", and an empty value stays empty rather than
 * defaulting to something plausible.
 *
 * Run from apps/web:
 *   node scripts/test-origin-normalize.mjs
 */
import { normalizeOrigin, normalizeOriginList } from "../../../packages/auth/src/origin.ts";

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};
/*
 * Deep comparison. The first version used ===, which silently fails for
 * every array assertion below - two arrays holding identical contents are
 * still two different references - and would have reported four failures
 * that were not there. Worth being explicit about because a test that
 * cannot pass is worse than no test: it looks like a real problem.
 */
const same = (a, b) =>
  Array.isArray(a) && Array.isArray(b) ? JSON.stringify(a) === JSON.stringify(b) : a === b;

const eq = (label, actual, expected) => {
  if (same(actual, expected)) ok(`${label}`);
  else bad(`${label}\n          expected: ${JSON.stringify(expected)}\n          actual:   ${JSON.stringify(actual)}`);
};

console.log("the Vercel case - bare hostname, no scheme");
eq(
  "production domain gains https",
  normalizeOrigin("nexus-yusufwav.vercel.app"),
  "https://nexus-yusufwav.vercel.app",
);
eq(
  "a deployment URL also gains it",
  normalizeOrigin("nexus-25g0duqfc-yusufwav.vercel.app"),
  "https://nexus-25g0duqfc-yusufwav.vercel.app",
);

console.log("\nthis now matches the Origin header a browser actually sends");
const origin = "https://nexus-yusufwav.vercel.app";
const allowed = new Set([normalizeOrigin("nexus-yusufwav.vercel.app")]);
if (allowed.has(origin)) ok(`the deployed origin matches: ${origin}`);
else bad(`the deployed origin still does not match: ${origin}`);

console.log("\nlocal development must not regress");
eq("http is preserved", normalizeOrigin("http://localhost:3001"), "http://localhost:3001");
eq(
  "https localhost preserved",
  normalizeOrigin("https://localhost:3001"),
  "https://localhost:3001",
);
eq(
  "an explicit port survives",
  normalizeOrigin("http://127.0.0.1:3001"),
  "http://127.0.0.1:3001",
);

console.log("\nslashes and whitespace, which is how these get typed by hand");
eq("trailing slash removed", normalizeOrigin("https://x.dev/"), "https://x.dev");
eq("many trailing slashes", normalizeOrigin("https://x.dev///"), "https://x.dev");
eq("surrounding whitespace", normalizeOrigin("  https://x.dev  "), "https://x.dev");
eq("scheme case is preserved", normalizeOrigin("HTTPS://x.dev"), "HTTPS://x.dev");
eq("protocol relative", normalizeOrigin("//x.dev"), "https://x.dev");

console.log("\nunusable values stay unusable - the allowlist fails closed");
for (const [label, input] of [
  ["undefined", undefined],
  ["null", null],
  ["empty string", ""],
  ["whitespace only", "   "],
]) {
  const out = normalizeOrigin(input);
  if (out === "") ok(`${label} -> "" (cannot match any request)`);
  else bad(`${label} -> ${JSON.stringify(out)}, expected ""`);
}

console.log("\nEXTRA_ORIGINS is typed by a human, so it gets messy input");
eq(
  "trailing comma and spaces",
  normalizeOriginList("http://10.0.0.10:3001 , , http://192.168.1.5:3001,"),
  ["http://10.0.0.10:3001", "http://192.168.1.5:3001"],
);
eq("a single entry", normalizeOriginList("http://10.0.0.10:3001"), ["http://10.0.0.10:3001"]);
eq("undefined is empty", normalizeOriginList(undefined), []);
eq("all-empty is empty", normalizeOriginList(" , , "), []);

console.log("\nand it never widens the allowlist into something permissive");
/*
 * The tempting alternative fix was to compare without the scheme, or to
 * trust whatever Origin arrives. Both would make the deployed app work and
 * would also remove the only thing stopping a page on another site from
 * making authenticated requests as a signed-in reader. So: one exact origin
 * in, one exact origin out - never a wildcard.
 */
const normalised = normalizeOrigin("evil.example.com");
if (normalised === "https://evil.example.com") ok("a host normalises to exactly one https origin");
else bad(`a host normalised to ${JSON.stringify(normalised)}`);
if (!normalised.includes("*")) ok("no wildcard is ever produced");
if (normalised !== "https://" && !/^https:\/\/[^/]+$/.test(normalised)) {
  bad(`unexpected shape: ${JSON.stringify(normalised)}`);
} else {
  ok("the result is a bare scheme+host origin with no path or wildcard");
}

console.log(
  failures === 0 ? "\norigins are normalised, so the app stops refusing itself." : `\n${failures} failure(s).`,
);
process.exitCode = failures === 0 ? 0 : 1;