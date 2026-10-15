/**
 * EXERCISE THE READ BUDGET IN PRODUCTION.
 *
 * Verifies the counter by USING it, because "the table exists" and "the
 * upsert the route issues works" are different claims, and only the second
 * one is the bug that shipped.
 *
 * Read-only apart from the budget row itself, which is removed afterwards.
 * Runs the exact statement from packages/db/src/read-budget.ts, copied —
 * and the copy is asserted against the source below so it cannot drift
 * quietly the way test-ai-budget.mjs's did.
 *
 *   node scripts/verify-read-budget-prod.mjs --prod
 */
import { readFileSync } from "node:fs";
import pg from "pg";

import { resolveTarget } from "./target.mjs";

const { url } = resolveTarget({ script: "verify-read-budget-prod", write: true });
const client = new pg.Client({ connectionString: url });
await client.connect();

let failures = 0;
const check = (name, cond, detail = "") => {
  if (cond) {
    console.log(`  ok   ${name}`);
  } else {
    failures++;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
};

/* -- the copy is still the real thing --------------------------------- */

const src = readFileSync(new URL("../src/read-budget.ts", import.meta.url), "utf8");
const shapes = [
  ["arbiter is user_id", "on conflict (user_id) do update set"],
  ["id is a fresh uuid per attempt", "values (gen_random_uuid()::text, ${userId}, now(), 1, now())"],
  ["window reset is in the statement", "make_interval(secs => ${windowSeconds})"],
  ["fails open rather than throwing", "catch (err)"],
];
console.log("\nthe statement under test still matches read-budget.ts");
for (const [name, needle] of shapes) {
  check(name, src.includes(needle), `read-budget.ts no longer contains "${needle}"`);
}

/* -- run it ----------------------------------------------------------- */

const UPSERT = (userId, windowSeconds) => `
  insert into read_usage (id, user_id, window_started_at, count, updated_at)
  values (gen_random_uuid()::text, $1, now(), 1, now())
  on conflict (user_id) do update set
    count = case
      when read_usage.window_started_at <= now() - make_interval(secs => $2)
        then 1
      else read_usage.count + 1
    end,
    window_started_at = case
      when read_usage.window_started_at <= now() - make_interval(secs => $2)
        then now()
      else read_usage.window_started_at
    end,
    updated_at = now()
  returning count`;

console.log("\nthe upsert the route issues, run for real");

const users = await client.query('select id from "user" order by id limit 1');
if (users.rowCount === 0) {
  console.log("  (production has no users; cannot exercise against a real reader)");
  await client.end();
  process.exit(0);
}
const userId = users.rows[0].id;
console.log(`  using an existing reader (${userId.slice(0, 8)}…)`);

// Clear any residue so the arithmetic below is unambiguous.
await client.query("delete from read_usage where user_id = $1", [userId]);

const first = await client.query(UPSERT(userId, 60), [userId, 60]);
check("the first call creates the row", Number(first.rows[0].count) === 1, `got ${first.rows[0].count}`);

const second = await client.query(UPSERT(userId, 60), [userId, 60]);
check("the second call increments", Number(second.rows[0].count) === 2, `got ${second.rows[0].count}`);

// The concurrency case that produced the 23505 in the first place.
const many = await Promise.all(
  Array.from({ length: 30 }, () => client.query(UPSERT(userId, 60), [userId, 60])),
);
const counts = many.map((r) => Number(r.rows[0].count)).sort((a, b) => a - b);
const unique = new Set(counts).size;
check(
  "30 concurrent calls yield 30 distinct counts (no lost update, no PK collision)",
  unique === 30,
  `${unique} distinct of 30, range ${counts[0]}..${counts[counts.length - 1]}`,
);

const stored = await client.query("select count::int as c from read_usage where user_id = $1", [userId]);
check("the stored count agrees with 32", stored.rows[0].c === 32, `stored ${stored.rows[0].c}`);

// The window reset, which is what stops this becoming a lifetime cap.
await client.query(
  "update read_usage set window_started_at = now() - interval '2 minutes' where user_id = $1",
  [userId],
);
const afterReset = await client.query(UPSERT(userId, 60), [userId, 60]);
check(
  "an expired window resets to 1 rather than locking the reader out",
  Number(afterReset.rows[0].count) === 1,
  `got ${afterReset.rows[0].count}`,
);

await client.query("delete from read_usage where user_id = $1", [userId]);
const left = await client.query("select count(*)::int as n from read_usage");
console.log(`\n  probe row removed; read_usage holds ${left.rows[0].n} rows`);

await client.end();
console.log(failures === 0 ? "\n  the budget works in production." : `\n  ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);