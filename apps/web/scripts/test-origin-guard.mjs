/**
 * The origin guard, and the two allowlists that must not drift.
 *
 * Two things are checked here, and the second is the one that will
 * actually bite someone.
 *
 *   1. `originAllowed` accepts our own origin and refuses everyone else.
 *      Including the case that looks like a bug: a request with NEITHER
 *      Origin nor Referer. That is refused on purpose — see the note in
 *      origin-guard.ts. A test that let it through would be testing the
 *      hole rather than the defence.
 *
 *   2. `apps/web/src/lib/origin-guard.ts` and `packages/auth/src/index.ts`
 *      define the SAME allowlist from the same three environment
 *      variables. They are separate functions in separate packages, and
 *      nothing in the type system connects them, so drift is silent: a
 *      route accepts an origin the auth layer would reject, or worse the
 *      reverse. This parses both files and compares what they build.
 *
 * The file-parsing check is deliberately crude. It is checking that both
 * sides still mention the same variables in the same shape, not
 * reimplementing them; a regex that fails to match reports loudly
 * instead of quietly passing.
 *
 * Run from apps/web:
 *   node scripts/test-origin-guard.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};
const eq = (label, actual, expected) => {
  if (actual === expected) ok(`${label} = ${JSON.stringify(actual)}`);
  else bad(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

// ---------------------------------------------------------------- setup
const BASE = "http://localhost:3001";
const EXTRA = "http://10.202.186.110:3001";
process.env.BETTER_AUTH_URL = BASE;
process.env.BETTER_AUTH_EXTRA_ORIGINS = EXTRA;

// The pure half is imported directly and asserted. `allowedOrigins()` is
// NOT, because it reads env.server → varlock, which is the part that
// needs a real app process to mean anything — and the bug it had (reading
// a var varlock never writes to process.env, so the allowlist came back
// empty and every same-origin request 403'd) is exactly the kind that a
// unit test of the parser would have passed straight through.
const { originAllowed, buildAllowedOrigins, parseExtraOrigins } = await import(
  "../src/lib/origin-guard.ts"
);

const ALLOW = buildAllowedOrigins(BASE, EXTRA);

// The set every comparison below is made against, passed in explicitly so
// the assertions do not depend on the machine's environment. The untested
// path — where the allowlist comes FROM — is covered by running the app,
// not by this file, which is the honest split: pure logic here, wiring
// there.
const req = (headers) => new Request("http://localhost:3001/api/keys", { headers });
const req2 = (headers) => originAllowed(req(headers), ALLOW);

// ------------------------------------------- 1. the allowlist behaviour
console.log("buildAllowedOrigins");
const origins = buildAllowedOrigins(BASE, EXTRA);
eq("size", origins.size, 2);
eq("base included", origins.has(BASE), true);
eq("extra included", origins.has(EXTRA), true);
eq("duplicate base collapses", buildAllowedOrigins(BASE, `${BASE},${EXTRA}`).size, 2);
eq("no base is survivable", buildAllowedOrigins(undefined, EXTRA).size, 1);
eq("neither yields an empty set", buildAllowedOrigins(undefined, undefined).size, 0);

console.log("\nparseExtraOrigins");
eq("blank entries dropped", JSON.stringify(parseExtraOrigins(`a,,  ,b`)), '["a","b"]');
eq("whitespace trimmed", JSON.stringify(parseExtraOrigins("  a  ,  b  ")), '["a","b"]');
eq("undefined is empty", JSON.stringify(parseExtraOrigins(undefined)), "[]");
eq("empty string is empty", JSON.stringify(parseExtraOrigins("")), "[]");

// `originAllowed(request, allow)` — two arguments, so these read as
// "does this request, judged against this set, pass". req2 builds the
// Request; the allowlist is passed at the call site.
const from = (headers) => originAllowed(req(headers), ALLOW);

console.log("\noriginAllowed — same origin");
eq("exact match", from({ origin: BASE }), true);
eq("the LAN origin is allowed too", from({ origin: EXTRA }), true);

console.log("\noriginAllowed — other origins");
for (const other of [
  "https://evil.example",
  "http://localhost:3002",
  "http://localhost:3001.evil.example",
  "http://evil.example/http://localhost:3001",
  BASE + "/path-should-not-matter", // Origin never carries a path
  "null", // opaque origin: sandboxed iframe, some redirects
]) {
  if (from({ origin: other })) bad(`accepted ${other}`);
  else ok(`refused ${other}`);
}

console.log("\noriginAllowed — referer fallback");
eq("referer from our origin", from({ referer: `${BASE}/dashboard` }), true);
eq("referer from elsewhere", from({ referer: "https://evil.example/x" }), false);
eq("malformed referer", from({ referer: "not a url" }), false);

console.log("\noriginAllowed — no headers at all");
if (from({})) bad("accepted a request with neither Origin nor Referer");
else ok("refused a request with neither Origin nor Referer");

console.log("\noriginAllowed — an empty allowlist refuses everything");
// The failure this file exists to prevent, asserted directly: if the set
// comes back empty, every caller is refused and the app is broken in a
// way that looks exactly like an attack.
if (originAllowed(req({ origin: BASE }), new Set())) {
  bad("an empty allowlist still admitted a same-origin request");
} else {
  ok("an empty allowlist refuses even our own origin");
}

// ------------------------------------------- 2. the two definitions
console.log("\nthe guard and packages/auth must agree on the allowlist");
const guardSrc = readFileSync(
  path.join(import.meta.dirname, "..", "src", "lib", "origin-guard.ts"),
  "utf8",
);
const authPkgSrc = path.join(import.meta.dirname, "..", "..", "..", "packages", "auth", "src");
/*
 * Both files, concatenated. The parsing of BETTER_AUTH_EXTRA_ORIGINS moved out
 * of index.ts and into origin.ts when origins started being normalised, so
 * reading index.ts alone made these assertions fail while the behaviour they
 * describe was still present and separately tested in
 * test-origin-normalize.mjs. Asserting over the package rather than one file
 * keeps the intent - "the auth package does this" - without pinning it to a
 * file layout that is free to change.
 */
const authSrc = ["index.ts", "origin.ts"]
  .map((f) => readFileSync(path.join(authPkgSrc, f), "utf8"))
  .join("\n");

for (const [name, src] of [
  ["origin-guard", guardSrc],
  ["auth", authSrc],
]) {
  for (const v of ["BETTER_AUTH_URL", "BETTER_AUTH_EXTRA_ORIGINS"]) {
    if (src.includes(v)) ok(`${name} reads ${v}`);
    else bad(`${name} does not read ${v}`);
  }
  if (src.includes("split(\",\")")) ok(`${name} splits extras on comma`);
  else bad(`${name} does not split extras on comma`);
  if (/\.trim\(\)/.test(src)) ok(`${name} trims`);
  else bad(`${name} does not trim`);
}

// The shape that matters: auth must build a Set and the guard must too,
// so a duplicate extra cannot double up. Both do, via `[...new Set(...)]`
// and `new Set()` respectively.
if (/new Set/.test(authSrc) && /new Set/.test(guardSrc)) {
  ok("both deduplicate");
} else {
  bad("one of the two does not deduplicate");
}

console.log(failures === 0 ? "\nthe origin guard holds." : `\n${failures} failure(s).`);
process.exitCode = failures === 0 ? 0 : 1;