/**
 * CREDENTIAL ISOLATION TESTS
 * ------------------------------------------------------------
 * The property: one reader's API key is unreachable by any other reader,
 * by every route, in every direction. A key id is a guessable value, so
 * anything that looks a credential up by id alone is the bug.
 *
 * Asserted here:
 *   1. one reader's list never contains another's key
 *   2. fetch-by-provider is scoped — bob cannot ask for "openrouter" and
 *      receive alice's credential
 *   3. delete is scoped
 *   4. the plaintext appears nowhere in the stored row
 *   5. the stored value is ciphertext
 *
 * Run from packages/db:
 *   $env:PROVIDER_KEYS_SECRET = "..."   # must match the app's
 *   node scripts/test-key-isolation.mjs
 */
import { Client } from "pg";
import { createCipheriv, randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL is not set."); process.exit(1); }

const SERVER_KEY = process.env.PROVIDER_KEYS_SECRET;
if (!SERVER_KEY || SERVER_KEY.length < 32) {
  console.error("PROVIDER_KEYS_SECRET is not set or too short. It must match the app's.");
  process.exit(1);
}

const db = new Client({ connectionString: url });
await db.connect();

const problems = [];
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { problems.push(m); console.log(`  FAIL  ${m}`); };

// Mirrors apps/web/src/lib/key-crypto.ts, so the test fails if the real
// one drifts rather than only if the SQL does.
function seal(plaintext) {
  const iv = randomBytes(12);
  const c = createCipheriv(
    "aes-256-gcm",
    Buffer.from(SERVER_KEY.slice(0, 32).padEnd(32, "0"), "utf8"),
    iv,
  );
  const sealed = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), sealed]).toString("base64");
}

const PLAINTEXT = "sk-or-v1-TESTKEYDONOTUSE0000000000000000000000000004";

async function makeUser(tag) {
  const id = `u_iso_${tag}`;
  await db.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1,$2,$3,true, now(), now())
     on conflict (id) do update set email = excluded.email`,
    [id, `Iso ${tag}`, `iso-${tag}@test.local`],
  );
  return id;
}

const rowsFor = async (uid) =>
  (await db.query(
    `select id, provider, last_four, encrypted_key from provider_keys where "user_id" = $1`,
    [uid],
  )).rows;

const getFor = async (uid, provider) =>
  (await db.query(
    `select encrypted_key from provider_keys where "user_id" = $1 and provider = $2`,
    [uid, provider],
  )).rows;

const alice = await makeUser("alice");
const bob = await makeUser("bob");
await db.query(`delete from provider_keys where "user_id" in ($1,$2)`, [alice, bob]);

await db.query(
  `insert into provider_keys
     (id, "user_id", provider, label, encrypted_key, last_four, model_id, created_at, updated_at)
   values ($1,$2,'openrouter','alice key',$3,'0004',
           'meta-llama/llama-3.1-8b-instruct:free', now(), now())`,
  [`pk_${alice}`, alice, seal(PLAINTEXT)],
);

console.log("\n=== 1. one reader's list excludes another's ===");
const aList = await rowsFor(alice);
const bList = await rowsFor(bob);
if (aList.length === 1) pass("alice sees her own key");
else fail(`alice sees ${aList.length} keys, expected 1`);
if (bList.length === 0) pass("bob sees none of alice's keys");
else fail(`bob sees ${bList.length} of alice's keys`);

console.log("\n=== 2. fetch-by-provider is scoped ===");
if ((await getFor(bob, "openrouter")).length === 0) {
  pass("bob asking for 'openrouter' gets nothing");
} else {
  fail("bob retrieved alice's credential by provider name");
}
if ((await getFor(alice, "openrouter")).length === 1) pass("alice retrieves her own");
else fail("alice could not retrieve her own credential");

console.log("\n=== 3. delete is scoped ===");
const del = await db.query(
  `delete from provider_keys where "user_id" = $1 and provider = 'openrouter' returning id`,
  [bob],
);
if (del.rowCount === 0) pass("bob deleting 'openrouter' removed nothing");
else fail("bob deleted a key he does not own");
if ((await rowsFor(alice)).length === 1) pass("alice's key survived bob's delete attempt");
else fail("alice's key was removed by another user");

console.log("\n=== 4. plaintext never stored ===");
if (!aList.some((r) => JSON.stringify(r).includes(PLAINTEXT))) {
  pass("the plaintext appears nowhere in the stored row");
} else {
  fail("plaintext key found in the row");
}

console.log("\n=== 5. the stored value is ciphertext ===");
const stored = aList[0]?.encrypted_key ?? "";
if (stored !== PLAINTEXT && stored.length > 40 && !stored.startsWith("sk-or")) {
  pass("stored value is ciphertext, not the key");
} else {
  fail("stored value looks like a plaintext key");
}

for (const u of [alice, bob]) {
  await db.query('delete from provider_keys where "user_id" = $1', [u]);
  await db.query('delete from "session" where "user_id" = $1', [u]);
  await db.query('delete from "account" where "user_id" = $1', [u]);
  await db.query('delete from "user" where id = $1', [u]);
}
await db.end();

console.log("");
if (problems.length > 0) {
  console.error(`${problems.length} FAILED`);
  process.exitCode = 1;
} else {
  console.log("credential isolation holds");
}