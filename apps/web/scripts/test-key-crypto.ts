/**
 * KEY CRYPTOGRAPHY TESTS
 * ------------------------------------------------------------
 * The property being tested is not "it round-trips" — that is easy and
 * nearly worthless on its own. It is: **a value that was not sealed
 * under this server's key does not come back.**
 *
 * Three ways a stored credential can be wrong, and all three must be
 * indistinguishable from "no key stored", because all three have the
 * same correct user-facing outcome — ask the reader to re-enter it:
 *
 *   · sealed under a DIFFERENT secret (someone rotated it)
 *   · the ciphertext was tampered with (someone wrote to the database)
 *   · the stored string is truncated or is not a valid envelope
 *
 * A version that returned a *wrong but decryptable* string, or that
 * threw on these paths and took the request down with it, would fail
 * every one of these.
 *
 * The module under test imports `server-only`, which resolves to a module
 * that throws unless the `react-server` condition is active. So this has
 * to run as:
 *
 *   $env:NODE_OPTIONS = "--conditions react-server"
 *   ..\..\node_modules\.bin\tsx.cmd scripts\test-key-crypto.ts
 *
 * Static imports, no top-level await: apps/web is a CJS package and
 * esbuild will not emit either.
 */
import { randomBytes } from "node:crypto";

import { lastFour, openKey, sealKey } from "../src/lib/key-crypto";

const SECRET = process.env.PROVIDER_KEYS_SECRET;
if (!SECRET || SECRET.length < 32) {
  console.error("PROVIDER_KEYS_SECRET is not set or too short.");
  process.exit(1);
}

const problems: string[] = [];
const pass = (m: string) => console.log(`  PASS  ${m}`);
const fail = (m: string) => {
  problems.push(m);
  console.log(`  FAIL  ${m}`);
};

const KEY = "sk-or-v1-abcdefghijklmnopqrstuvwxyz0123456789ABCD";

console.log("\n=== 1. round-trips ===");
const sealed = sealKey(KEY);
if (openKey(sealed) === KEY) pass("the sealed value opens back to the key");
else fail("the sealed value did not open back to the key");

console.log("\n=== 2. the sealed value is not the key, anywhere in it ===");
const env = Buffer.from(sealed, "base64");
if (!env.toString("utf8").includes(KEY) && !env.toString("latin1").includes(KEY)) {
  pass("the plaintext does not appear in the envelope");
} else {
  fail("the plaintext is recoverable from the envelope");
}

console.log("\n=== 3. a fresh IV per seal ===");
const a = sealKey(KEY);
const b = sealKey(KEY);
if (a !== b) pass("sealing the same key twice gives two different envelopes");
else fail("the IV is being reused — identical inputs produced identical output");

console.log("\n=== 4. fails closed when the server key has changed ===");
// Re-derive under a different secret, the way a rotation would leave
// every already-stored row.
const OTHER = randomBytes(48).toString("base64");
process.env.PROVIDER_KEYS_SECRET = OTHER;
const afterRotation = openKey(sealed);
if (afterRotation === null) pass("a key sealed under the old secret returns null");
else fail(`a rotated server key still opened a credential (got ${afterRotation?.slice(0, 8)}…)`);
process.env.PROVIDER_KEYS_SECRET = SECRET;
if (openKey(sealed) === KEY) pass("and opens again once the secret is restored");
else fail("the original secret failed to open its own envelope");

console.log("\n=== 5. fails closed on a tampered ciphertext ===");
const bytes = Buffer.from(sealed, "base64");
// Flip one bit in the ciphertext body (skip iv and tag).
bytes[bytes.length - 1] ^= 0x01;
const tampered = bytes.toString("base64");
const afterTamper = openKey(tampered);
if (afterTamper === null) pass("a modified ciphertext returns null rather than wrong data");
else fail(`a modified ciphertext opened to ${afterTamper?.slice(0, 8)}… — GCM is not authenticating`);

console.log("\n=== 6. fails closed on a mangled value ===");
for (const [name, value] of [
  ["empty string", ""],
  ["not base64", "!!!not-base64!!!"],
  ["shorter than iv+tag", Buffer.from(randomBytes(10)).toString("base64")],
  ["truncated envelope", Buffer.from(Buffer.from(sealed, "base64").subarray(0, 20)).toString("base64")],
] as const) {
  const r = openKey(value);
  if (r === null) pass(`${name} returns null`);
  else fail(`${name} opened to something`);
}

console.log("\n=== 7. refuses a too-short secret rather than using it ===");
const real = process.env.PROVIDER_KEYS_SECRET;
process.env.PROVIDER_KEYS_SECRET = "short";
let threw = false;
try {
  sealKey(KEY);
} catch {
  threw = true;
}
process.env.PROVIDER_KEYS_SECRET = real;
if (threw) pass("a secret under 32 chars is refused loudly, not silently padded");
else fail("a 5-character secret was accepted");

console.log("\n=== 8. lastFour is taken from the plaintext ===");
// A pasted key usually arrives with a trailing newline. Without the trim
// the tail would be almost entirely whitespace, and the settings list —
// whose whole job is letting a reader tell two keys apart — would show
// the same thing for both.
if (lastFour("sk-or-v1-abcdefghij\n") === "ghij") {
  pass("a trailing newline does not blank the tail");
} else {
  fail(`trailing-whitespace key showed "${lastFour("sk-or-v1-abcdefghij\n")}"`);
}
if (lastFour(KEY) === KEY.slice(-4)) pass("the tail matches the key");
else fail("the tail does not match the key");
// Non-ASCII: JS string length is UTF-16 units, so an emoji key could in
// principle slice a surrogate pair in half. What matters is that it
// cannot throw and cannot return more than the key itself.
const astral = lastFour("🔑🔑🔑🔑tail");
if (astral.length <= 4 && typeof astral === "string") pass("an astral-plane key still yields a short tail");
else fail("lastFour produced something unusable");

console.log("");
if (problems.length > 0) {
  console.error(`${problems.length} FAILED`);
  process.exitCode = 1;
} else {
  console.log("key crypto holds");
}