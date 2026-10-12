/**
 * Access-tier test.
 *
 * Covers accessibleModuleCodes() — the function that decides which
 * modules a reader may read — without going through the model, because
 * the model's generation quota is a separate thing from whether the
 * entitlement logic is right. Getting the tiers wrong is a security bug
 * whether or not a model is currently available.
 *
 * Reimplements the function against the same two queries it uses, so it
 * fails if the logic drifts rather than only if the SQL does.
 *
 * Run from packages/db:
 *   node scripts/test-access-tiers.mjs
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const db = new Client({ connectionString: url });
await db.connect();

const problems = [];
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { problems.push(m); console.log(`  FAIL  ${m}`); };

/** Mirrors apps/web/src/lib/notes-access.ts. */
async function accessibleModuleCodes(userId) {
  const codes = new Set();
  const { rows: owned } = await db.query(
    `select m.code from purchases p join modules m on m.id = p.module_id
      where p.user_id = $1 and p.status = 'paid'`,
    [userId],
  );
  for (const r of owned) codes.add(r.code);
  const { rows: trial } = await db.query(
    "select code from modules where has_trial_pdf = true",
  );
  for (const r of trial) codes.add(r.code);
  return codes;
}

async function makeUser(tag) {
  const id = `u_test_${tag}`;
  const email = `tier-${tag}@test.local`;
  await db.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, $3, $2, true, now(), now())
     on conflict (id) do update set email = excluded.email`,
    [id, email, `Tier Test ${tag}`],
  );
  return { id, email };
}

const { rows: mods } = await db.query("select id, code, has_trial_pdf from modules order by code");
const trialCode = mods.find((m) => m.has_trial_pdf)?.code ?? null;
const paidModule = mods.find((m) => !m.has_trial_pdf);
if (!trialCode || !paidModule) {
  console.error("Need one module with has_trial_pdf and one without.");
  process.exit(1);
}

const free = await makeUser("free");
const paid = await makeUser("paid");

// Give the paid user a real paid purchase. pending/refunded must not count.
const { rows: modRows } = await db.query("select id, code from modules where code = $1", [
  paidModule.code,
]);
await db.query(
  `insert into purchases (id, "user_id", "module_id", amount_cents, status)
   values ($1,$2,$3,5000,'pending')
   on conflict ("user_id","module_id") do update set status = 'pending'`,
  [`p_pending_${paidModule.code}`, paid.id, modRows[0].id],
);
const beforePaid = await accessibleModuleCodes(paid.id);
if (!beforePaid.has(paidModule.code)) {
  pass(`a pending purchase does NOT grant ${paidModule.code}`);
} else {
  fail(`a PENDING purchase granted access to ${paidModule.code}`);
}

await db.query(
  `update purchases set status = 'paid' where id = $1`,
  [`p_pending_${paidModule.code}`],
);
const afterPaid = await accessibleModuleCodes(paid.id);

await db.query(
  `update purchases set status = 'refunded' where id = $1`,
  [`p_pending_${paidModule.code}`],
);
const afterRefund = await accessibleModuleCodes(paid.id);
if (!afterRefund.has(paidModule.code)) {
  pass(`a refunded purchase does NOT grant ${paidModule.code}`);
} else {
  fail(`a REFUNDED purchase still granted access to ${paidModule.code}`);
}

await db.query(
  `insert into purchases (id, "user_id", "module_id", amount_cents, status)
   values ($1,$2,$3,5000,'paid')
   on conflict ("user_id","module_id") do update set status = 'paid'`,
  [`p_paid_${paidModule.code}`, paid.id, modRows[0].id],
);

const freeCodes = await accessibleModuleCodes(free.id);
const paidCodes = await accessibleModuleCodes(paid.id);

console.log("\n=== tiers ===");
console.log(`  free user  -> ${[...freeCodes].join(", ") || "(nothing)"}`);
console.log(`  paid user  -> ${[...paidCodes].join(", ") || "(nothing)"}`);

console.log("\n=== assertions ===");
if (freeCodes.has(trialCode)) pass(`free tier includes the sample module ${trialCode}`);
else fail(`free tier is missing ${trialCode} — every signed-in reader should get it`);

if (!freeCodes.has(paidModule.code)) {
  pass(`free tier excludes ${paidModule.code} (no purchase)`);
} else {
  fail(`free tier INCLUDES ${paidModule.code} without a purchase — this is the leak`);
}

if (paidCodes.has(trialCode)) pass(`paid user keeps the free tier too (${trialCode})`);
else fail(`paying removed free-tier access to ${trialCode}`);

if (paidCodes.has(paidModule.code)) pass(`paid tier includes ${paidModule.code}`);
else fail(`paying did NOT grant ${paidModule.code}`);

// Cleanup so repeated runs do not accumulate.
for (const u of [free.id, paid.id]) {
  await db.query("delete from purchases where user_id = $1", [u]);
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
  console.log("access tiers behave");
}