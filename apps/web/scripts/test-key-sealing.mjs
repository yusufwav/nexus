/**
 * The sealing key, and the broken state it used to fail in.
 *
 * Three things are checked, and the third is the one that matters:
 *
 *   1. sealKey/openKey round-trip, and that a wrong key fails rather than
 *      returning garbage (GCM is authenticated — this is not a property
 *      to take on trust).
 *   2. readSecret's failure is explicit and says the actionable thing.
 *   3. A process that CANNOT see the secret can detect it, rather than
 *      silently sealing nothing or falling back to a derived key.
 *
 * Property 3 is the regression guard. The real failure was: the secret in
 * .env, process.env missing it because varlock's hot-reload had wiped its
 * own injections, the app serving traffic and looking healthy, and
 * `sealKey` throwing deep inside a route handler so the reader saw a bare
 * 500. The detection lives in services.ts (a boot check that reads .env
 * off disk to tell "not configured" from "configured, restart me"), which
 * cannot be imported here because it also constructs the database.
 *
 * So what this asserts is the half that can be asserted: that a missing
 * or short secret produces a named failure, that the message mentions a
 * restart, and that nothing anywhere quietly substitutes a default.
 */
import { lastFour, openKey, readSecret, sealKey } from "../src/lib/key-crypto";

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

const original = process.env.PROVIDER_KEYS_SECRET;

console.log("round trip");
{
  const plaintext = "sk-or-v1-TESTKEYDONOTUSE0000000000000000000000000004";
  const sealed = sealKey(plaintext);
  ok(`sealed length ${sealed.length} (iv 12 + tag 16 + ciphertext, base64)`);
  eq("opens back to the original", openKey(sealed), plaintext);
  eq("lastFour reads the plaintext, not the envelope", lastFour(plaintext), "0004");
}

console.log("\na fresh IV per call");
{
  const plaintext = "sk-or-v1-SAMEPLAINTEXTTWICE00000000000000000000000000004";
  const a = sealKey(plaintext);
  const b = sealKey(plaintext);
  if (a === b) bad("sealing the same plaintext twice produced identical output (IV reused)");
  else ok("two seals of identical plaintext differ — IV is not reused");
}

console.log("\nGCM is authenticated, not just encrypted");
{
  const sealed = sealKey("sk-or-v1-TAMPER000000000000000000000000000000000004");
  // Flip one byte of the ciphertext, leaving the envelope the right shape.
  const raw = Buffer.from(sealed, "base64");
  raw[raw.length - 1] ^= 0xff;
  eq("a tampered row opens to null", openKey(raw.toString("base64")), null);

  eq("a truncated envelope opens to null", openKey(sealed.slice(0, 20)), null);
  eq("gibberish opens to null", openKey("not-a-real-envelope-at-all-really"), null);
}

console.log("\nwrong sealing key cannot decrypt");
{
  const sealed = sealKey("sk-or-v1-ORIGINAL0000000000000000000000000000000004");
  process.env.PROVIDER_KEYS_SECRET = "Z".repeat(48); // same length, different bytes
  eq("decrypts to null under a different key", openKey(sealed), null);
  process.env.PROVIDER_KEYS_SECRET = original;
  eq("and back to the original under the right key", openKey(sealed) !== null, true);
}

console.log("\nmissing or short secrets fail explicitly");
{
  process.env.PROVIDER_KEYS_SECRET = undefined;
  delete process.env.PROVIDER_KEYS_SECRET;
  const missing = readSecret();
  eq("absent secret is not ok", missing.ok, false);
  if (!missing.ok) {
    if (/restart/i.test(missing.problem)) ok("the failure names a restart");
    else bad(`the failure does not mention a restart: ${missing.problem}`);
  }

  process.env.PROVIDER_KEYS_SECRET = "tooshort";
  const short = readSecret();
  eq("short secret is not ok", short.ok, false);

  process.env.PROVIDER_KEYS_SECRET = "x".repeat(31);
  eq("31 chars (one under the bar) is rejected", readSecret().ok, false);
  process.env.PROVIDER_KEYS_SECRET = "x".repeat(32);
  eq("32 chars (exactly the bar) is accepted", readSecret().ok, true);

  process.env.PROVIDER_KEYS_SECRET = original;
  eq("the real secret is accepted", readSecret().ok, true);
}

console.log("\nnothing substitutes a default");
{
  // If this ever passes with the secret absent, something is deriving a
  // key from ambient state, which is the failure the whole design exists
  // to prevent.
  process.env.PROVIDER_KEYS_SECRET = undefined;
  delete process.env.PROVIDER_KEYS_SECRET;
  let threw = false;
  try {
    sealKey("sk-or-v1-SHOULDNOTBESEALED000000000000000000000000000004");
  } catch {
    threw = true;
  }
  eq("sealKey throws rather than sealing with a fallback", threw, true);
  process.env.PROVIDER_KEYS_SECRET = original;
}

function eq(label, actual, expected) {
  if (actual === expected) ok(`${label} = ${JSON.stringify(actual)}`);
  else bad(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

console.log(failures === 0 ? "\nsealing behaves." : `\n${failures} failure(s).`);
process.exitCode = failures === 0 ? 0 : 1;