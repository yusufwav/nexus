import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * RLS ON practice_attempts, PROVEN BY TRYING TO READ SOMEONE ELSE'S.
 *
 * A policy that is declared but not exercised is exactly the decoration
 * create-rls-policies.mjs warns about. So this does the real thing: it
 * applies the policy, then inserts rows as two different readers and
 * checks that reader A cannot see reader B's attempts, and cannot write a
 * row that claims to belong to B.
 *
 * The write case is the one that matters most and is the one usually
 * untested: a USING clause without a matching WITH CHECK lets a reader
 * INSERT a row carrying someone else's id, which then leaks back to them
 * and corrupts that person's history.
 *
 * Run from packages/db as a role that can create policies (the owner):
 *   node scripts/test-practice-rls.mjs
 */
/**
 * Resolved from this script's own URL, not the process cwd, so the file works
 * from anywhere. And unquoted: a `DATABASE_URL="postgres://..."` value makes pg
 * fail to parse it, at which point libpq silently uses its built-in default of
 * localhost:5432 — the error then reads as "the database is down" rather than
 * "you passed a malformed argument". `target.mjs` exists for the same reason.
 */
function readLocalDbUrl() {
  const raw = readFileSync(new URL("../../../apps/web/.env", import.meta.url), "utf8").match(
    /^DATABASE_URL=(.*)$/m,
  )?.[1];
  if (raw === undefined) throw new Error("DATABASE_URL not found in apps/web/.env");
  return raw.trim().replace(/^["']|["']$/g, "");
}
const url = readLocalDbUrl();

let passed = 0;
const failures = [];
const ok = (m) => {
  passed += 1;
  console.log(`  ok   ${m}`);
};
const bad = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
const check = (name, cond, detail = "") => (cond ? ok(name) : bad(`${name}${detail ? ` — ${detail}` : ""}`));

const client = new pg.Client({ connectionString: url });
await client.connect();

// ---- apply the same policy the setup script uses -----------------------
const readerId = `nullif(current_setting('app.user_id', true), '')`;
await client.query("CREATE OR REPLACE FUNCTION app_reader_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT " + readerId + " $$");
await client.query('ALTER TABLE "practice_attempts" ENABLE ROW LEVEL SECURITY');
await client.query('ALTER TABLE "practice_attempts" FORCE ROW LEVEL SECURITY');
await client.query("DROP POLICY IF EXISTS practice_attempts_reader ON \"practice_attempts\"");
await client.query(
  `CREATE POLICY practice_attempts_reader ON "practice_attempts"
     FOR ALL TO public
     USING (user_id = app_reader_id()) WITH CHECK (user_id = app_reader_id())`,
);

// A question to point attempts at.
await client.query(
  `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
   values ('rls-probe-q', 'application', 'MATT101', 'matt101-limits', 2, 'p', ARRAY['t'], '{}'::jsonb)
   on conflict (id) do nothing`,
);

const A = "rls-probe-reader-a";
const B = "rls-probe-reader-b";

const ROLE = "practice_rls_probe";

// A role with NO BYPASSRLS, or the test proves nothing.
//
// This is the trap create-rls-policies.mjs documents at length: the app
// used to connect as a role carrying BYPASSRLS, which ignores the entire
// mechanism, so every policy was decorative and nothing failed. Seeding
// as `postgres` here would repeat exactly that mistake -- postgres is a
// superuser, FORCE ROW LEVEL SECURITY does not apply to superusers, and
// reader A would see reader B's rows while every assertion below passed
// for the wrong reason.
//
// So the probe role is granted the table and the tests run under
// SET ROLE, which is the closest reproducible stand-in for nexus_app.
await client.query(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${ROLE}') THEN
    EXECUTE 'CREATE ROLE ${ROLE} NOLOGIN NOSUPERUSER NOBYPASSRLS';
  END IF;
END $$`);
await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON practice_attempts TO ${ROLE}`);
await client.query(`GRANT SELECT ON practice_questions TO ${ROLE}`);

/** Run `fn` with the RLS identity set AND the probe role active. */
async function withReader(as, fn) {
  await client.query("begin");
  try {
    await client.query("select set_config('app.user_id', $1, true)", [as]);
    await client.query(`SET LOCAL ROLE ${ROLE}`);
    const out = await fn();
    await client.query("reset role");
    await client.query("commit");
    return out;
  } catch (e) {
    await client.query("reset role").catch(() => {});
    await client.query("rollback");
    throw e;
  }
}

// Two real readers. The FK on practice_attempts.user_id is enforced, so
// these have to exist -- which is itself worth knowing: an attempt cannot
// be recorded against a user that is not there.
await client.query(
  `insert into "user" (id, name, email, email_verified, created_at, updated_at)
   values ($1, $2, $3, true, now(), now())
   on conflict (id) do nothing`,
  [A, "Reader A", "rls-probe-a@example.invalid"],
);
await client.query(
  `insert into "user" (id, name, email, email_verified, created_at, updated_at)
   values ($1, $2, $3, true, now(), now())
   on conflict (id) do nothing`,
  [B, "Reader B", "rls-probe-b@example.invalid"],
);

console.log("\nseeding two readers' attempts as the owner");

// Seed as the owner, bypassing RLS (the owner is the table owner).
for (const [id, uid] of [
  ["rls-attempt-a1", A],
  ["rls-attempt-a2", A],
  ["rls-attempt-b1", B],
]) {
  await client.query(
    `insert into practice_attempts (id, user_id, question_id, format, outcome, detail)
     values ($1, $2, 'rls-probe-q', 'application', 'correct', '{}'::jsonb)
     on conflict (id) do nothing`,
    [id, uid],
  );
}
console.log("  seeded 2 attempts for A, 1 for B");

console.log("\nthe policy, exercised");

const asA = await withReader(A, () =>
  client.query("select id from practice_attempts order by id"),
);
check(
  "reader A sees exactly their own 2 attempts",
  asA.rows.length === 2 && asA.rows.every((r) => r.id.startsWith("rls-attempt-a")),
  `saw ${JSON.stringify(asA.rows.map((r) => r.id))}`,
);

const asB = await withReader(B, () =>
  client.query("select id from practice_attempts order by id"),
);
check(
  "reader B sees exactly their own 1 attempt",
  asB.rows.length === 1 && asB.rows[0].id === "rls-attempt-b1",
  `saw ${JSON.stringify(asB.rows.map((r) => r.id))}`,
);

const asNone = await withReader("", () => client.query("select id from practice_attempts"));
check(
  "no identity sees nothing (the fail-closed default)",
  asNone.rows.length === 0,
  `saw ${asNone.rows.length} rows`,
);

// The write case. USING without WITH CHECK would let this through.
let insertForOtherSucceeded = false;
try {
  await withReader(A, () =>
    client.query(
      `insert into practice_attempts (id, user_id, question_id, format, outcome, detail)
       values ('rls-attempt-forged', $1, 'rls-probe-q', 'application', 'correct', '{}'::jsonb)`,
      [B],
    ),
  );
  insertForOtherSucceeded = true;
} catch {
  /* refused, which is the point */
}
check(
  "reader A cannot insert an attempt claiming to be reader B's",
  !insertForOtherSucceeded,
  "the INSERT was allowed — WITH CHECK is missing or wrong",
);

// The delete case, checked by rowCount and NOT by "did it throw".
//
// A DELETE filtered by USING simply matches nothing, and matching nothing
// is not an error -- it is a successful statement that deleted 0 rows. An
// earlier version of this file treated "no exception" as "the delete
// worked" and failed for the wrong reason, which is the same trap as a
// test that passes while proving nothing.
const del = await withReader(A, () =>
  client.query(`delete from practice_attempts where id = 'rls-attempt-b1'`),
);
check(
  "reader A's delete of reader B's attempt affects 0 rows",
  del.rowCount === 0,
  `rowCount was ${del.rowCount}`,
);

// And the row is genuinely still there, seen by its owner.
const stillThere = await withReader(B, () =>
  client.query(`select id from practice_attempts where id = 'rls-attempt-b1'`),
);
check(
  "reader B's attempt survived reader A's delete",
  stillThere.rowCount === 1,
  `reader B now sees ${stillThere.rowCount} matching rows`,
);

// The UPDATE case, and note it refuses DIFFERENTLY from the delete.
//
// Deleting B's row never matches, so it is a quiet 0-row statement. But
// A's OWN row is visible to A, so the UPDATE matches it -- and then
// WITH CHECK refuses, because the row would end up owned by somebody else.
// So one verb fails by matching nothing and the other fails by erroring,
// and a test that checks only one of those signals misses half the policy.
let updRefused = false;
let updDetail = "";
try {
  const r = await withReader(A, () =>
    client.query(`update practice_attempts set user_id = $1 where id = 'rls-attempt-a1'`, [B]),
  );
  updRefused = r.rowCount === 0;
  updDetail = `rowCount was ${r.rowCount}`;
} catch (e) {
  updRefused = String(e.message).includes("row-level security") || e.code === "42501";
  updDetail = "refused by WITH CHECK, which is correct";
}
check("reader A's attempt cannot be re-pointed at reader B", updRefused, updDetail);

// The owner's view is unfiltered, which is what makes the seeding above
// possible and what makes the policy testable at all.
const asOwner = await client.query("select id from practice_attempts order by id");
check(
  "the owner still sees every row (so the policy is not just denying everything)",
  asOwner.rows.length >= 3,
  `owner saw ${asOwner.rows.length}`,
);

// And the control that matters most: prove the probe role really is
// subject to RLS. If it were not, the assertions above would be passing
// because everything is visible, not because the policy works.
const leaky = await withReader("rls-someone-else-entirely", () =>
  client.query("select id from practice_attempts"),
);
check(
  "the probe role is genuinely subject to RLS (an unrelated identity sees nothing)",
  leaky.rows.length === 0,
  `saw ${leaky.rows.length} rows -- the role bypasses RLS, so the tests above prove nothing`,
);

// Clean up.
await client.query("delete from practice_attempts where id like 'rls-attempt-%'");
await client.query("delete from practice_questions where id = 'rls-probe-q'");
await client.query(`delete from "user" where id in ($1, $2)`, [A, B]);
console.log("\n  probes cleaned up");

await client.end();
console.log(
  failures.length === 0 ? `\n${passed} passed.` : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);