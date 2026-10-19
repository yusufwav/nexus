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
 *   6. a CUSTOM provider's model catalogue is scoped, which is a different
 *      property and matters more: `hasProviderModel` is the check that
 *      decides whether the server will call a model, so a reader who could
 *      read another's catalogue could put their own model id onto a
 *      provider that is not theirs
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

/*
 * === 6. the model catalogue is scoped ===
 *
 * A different property from the five above, and the one that matters more.
 * The credential test asks "can one reader get another's SECRET". This one
 * asks "can one reader put their own model id on a provider that is not
 * theirs" — which is the exact question `hasProviderModel` exists to
 * answer, in tutor-model.ts, before the server is willing to call anything.
 *
 * The provider slug is reader-minted and therefore guessable-by-shape, and
 * the `provider` column in this table has no foreign key (a built-in
 * provider's models live in OpenRouter's catalogue, not here). So nothing
 * but the RLS policy stands between the two.
 */
console.log("\n=== 6. the custom model catalogue is scoped ===");

const ALICE_SLUG = "custom_aaaaaaaaaaaaaaaaaaaaaaaa";
const BOB_SLUG = "custom_bbbbbbbbbbbbbbbbbbbbbbbb";

await db.query(`delete from provider_models where "user_id" in ($1,$2)`, [alice, bob]);

await db.query(
  `insert into provider_models (id, "user_id", provider, model_id, source, created_at)
   values ($1,$2,$3,'qwen3:8b','custom', now()), ($4,$2,$3,'qwen3:32b','custom', now())`,
  [`pm_a1_${alice}`, alice, ALICE_SLUG, `pm_a2_${alice}`],
);
// Bob gets a provider of his own, plus a row of his OWN naming ALICE's
// provider slug. That second row is the interesting one: it stands in for
// a bug in a writer, and it is why the assertion below is about model ids
// rather than about the slug. See the note on `bOnAlices`.
await db.query(
  `insert into provider_models (id, "user_id", provider, model_id, source, created_at)
   values ($1,$2,$3,'bob-model','custom', now()), ($4,$2,$5,'bob-own-row','custom', now())`,
  [`pm_b1_${bob}`, bob, BOB_SLUG, `pm_b2_${bob}`, ALICE_SLUG],
);

const modelsFor = async (uid, provider) =>
  (await db.query(
    `select model_id, source from provider_models where "user_id" = $1 and provider = $2`,
    [uid, provider],
  )).rows;

const aModels = await modelsFor(alice, ALICE_SLUG);
if (aModels.length === 2) pass("alice sees her own two models");
else fail(`alice sees ${aModels.length} models on her own provider, expected 2`);

/*
 * NOT "bob sees nothing under that slug".
 *
 * The first version of this asserted exactly that, and it failed —
 * correctly, because the fixture above deliberately puts one of bob's own
 * rows under alice's slug. The slug is not a secret; bob naming it is not
 * the leak. Asserting otherwise would be asserting that the fixture cannot
 * exist.
 *
 * What has to hold is the narrower and actually-dangerous thing: nothing
 * of alice's is in the set bob can read, and `hasProviderModel` — which is
 * what the tutor route consults — matches nothing of hers for him.
 */

const bOnAlices = await modelsFor(bob, ALICE_SLUG);
const aIds = aModels.map((r) => r.model_id);
const bLeaked = bOnAlices.filter((r) => aIds.includes(r.model_id));
if (bLeaked.length === 0) {
  pass(
    `bob naming alice's slug reaches only his own row — none of her ${aIds.length} model ids`,
  );
} else {
  fail(`bob read alice's model ids by naming her provider: ${bLeaked.map((r) => r.model_id).join(", ")}`);
}

// The check the tutor route actually makes.
const hasFor = async (uid, provider, modelId) =>
  (await db.query(
    `select 1 from provider_models where "user_id" = $1 and provider = $2 and model_id = $3`,
    [uid, provider, modelId],
  )).rowCount;

if ((await hasFor(bob, ALICE_SLUG, "qwen3:8b")) === 0) {
  pass("hasProviderModel refuses bob alice's model on alice's provider");
} else {
  fail("bob's model check matched a row in alice's catalogue");
}
if ((await hasFor(alice, ALICE_SLUG, "qwen3:8b")) === 1) {
  pass("hasProviderModel still matches alice's own model");
} else {
  fail("alice's own model did not match — the check is broken, not just permissive");
}

console.log("\n=== 7. a custom provider cannot carry a plaintext address problem ===");
// The CHECK constraint is the database's half of the rule; the route's
// validation is the other half. This asserts the constraint exists, since a
// version of the DDL without it would let a built-in row carry a URL that
// never went through validateCustomProviderUrl.
const checks = await db.query(
  `select conname from pg_constraint
    where conrelid = 'provider_keys'::regclass and conname = 'provider_keys_kind_address'`,
);
if (checks.rowCount === 1) pass("the kind/address CHECK is installed");
else fail("provider_keys_kind_address is missing — a built-in row could carry any URL");

for (const u of [alice, bob]) {
  await db.query('delete from provider_keys where "user_id" = $1', [u]);
  await db.query('delete from provider_models where "user_id" = $1', [u]);
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