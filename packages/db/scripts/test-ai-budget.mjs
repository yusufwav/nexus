/**
 * The tutor's spending budget.
 *
 * The properties that matter, in order of how much they would hurt if
 * they broke:
 *
 *   1. it actually refuses (the bug being fixed: 30 consecutive POSTs,
 *      all 200, no limit at all)
 *   2. it refuses at the right number, not off-by-one either way
 *   3. it is PER READER, so one reader exhausting their budget does not
 *      lock anyone else out
 *   4. the window REOPENS, so a reader who waits is not punished for the
 *      rest of the day — a lifetime cap would be a support burden and a
 *      reason to give up on the feature
 *   5. the counter is not lost across a fresh connection, because that is
 *      what "database-backed" has to mean in practice
 *
 * Property 5 is checked by connecting twice: an in-memory limiter would
 * pass 1-4 on a single connection and fail 5, which is exactly the bug
 * a serverless restart would reintroduce.
 *
 * Run from packages/db:
 *   node scripts/test-ai-budget.mjs
 */
import { Client, Pool } from "pg";
import { readFileSync } from "node:fs";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const WINDOW_SECONDS = 60;
const MAX_TURNS = 20;

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

const client = new Client({ connectionString: url });

/*
 * The `id` expression, READ FROM THE REAL SOURCE rather than copied.
 *
 * This script re-implements the upsert so it can run under bare node, which
 * makes drift possible: it said "verbatim" and then quietly stopped being
 * verbatim when ai-rate-limit.ts was fixed, so for one run it was testing a
 * copy of the *bug*. Reading the expression out of the file closes that — the
 * copy is still a copy for the rest of the statement, but the one token that
 * broke cannot go stale here.
 */
const aiSrc = readFileSync(new URL("../src/ai-rate-limit.ts", import.meta.url), "utf8");
const idExpr = /values\s*\(\s*(.+?),\s*(?:\$\{|\x60)/s.exec(aiSrc)?.[1]?.trim() ?? "";

/*
 * Validated BEFORE anything uses it, and deliberately fatal.
 *
 * `consume()` splices `idExpr` straight into SQL, so a reverted source makes
 * this script die with `syntax error at or near "$"` from Postgres on the very
 * first call — a real failure, but one that says nothing about the bug. Naming
 * it here turns a confusing crash into the sentence that explains it.
 */
if (!idExpr) {
  console.error(
    `\nfailed: could not read the id expression out of ai-rate-limit.ts (got "${idExpr}").` +
      `\nThis test must be updated to match the file.`,
  );
  process.exit(1);
}
if (/userId/.test(idExpr)) {
  console.error(
    `\nfailed: the id column is derived from the user id ("${idExpr}").` +
      `\nai_usage has a PRIMARY KEY (id) and UNIQUE (user_id), and the upsert names` +
      `\nonly user_id as its arbiter. A deterministic id therefore collides on the` +
      `\nprimary key when two turns arrive before any row exists — 23505, which is` +
      `\na 500 on /api/ai. Generate it in the database instead.`,
  );
  process.exit(1);
}
console.log(`  ok   the id column is database-generated, not derived from the user id (${idExpr})`);

/** The upsert from consumeAiBudget. */
async function consume(userId) {
  const r = await client.query(
    `insert into ai_usage (id, user_id, window_started_at, count, updated_at)
     values (${idExpr}, $1, now(), 1, now())
     on conflict (user_id) do update set
       count = case
         when ai_usage.window_started_at <= now() - make_interval(secs => $2)
           then 1
         else ai_usage.count + 1
       end,
       window_started_at = case
         when ai_usage.window_started_at <= now() - make_interval(secs => $2)
           then now()
         else ai_usage.window_started_at
       end,
       updated_at = now()
     returning count,
       greatest(0, extract(epoch from (
         ai_usage.window_started_at + make_interval(secs => $2) - now()
       )) * 1000)::bigint as retry_after_ms`,
    [userId, WINDOW_SECONDS],
  );
  const row = r.rows[0];
  const count = Number(row.count);
  const retryAfterMs = Number(row.retry_after_ms);
  return { allowed: count <= MAX_TURNS, count, retryAfterMs };
}

try {
  await client.connect();

  const users = await client.query(`select id, email from "user" order by email limit 2`);
  if (users.rows.length < 2) {
    console.log("SKIP: need two accounts.");
    await client.end();
    process.exit(1);
  }
  const [a, b] = users.rows;

  await client.query(`delete from ai_usage`);

  // ---- 1 + 2: refuses, and at the right threshold ---------------------
  console.log(`reader A (${a.email}): ${MAX_TURNS} turns allowed per ${WINDOW_SECONDS}s`);
  let lastAllowed = 0;
  let firstRefused = null;
  for (let i = 1; i <= MAX_TURNS + 5; i++) {
    const res = await consume(a.id);
    if (res.allowed) lastAllowed = i;
    else if (firstRefused === null) firstRefused = i;
  }
  eq("last allowed turn", lastAllowed, MAX_TURNS);
  eq("first refused turn", firstRefused, MAX_TURNS + 1);
  if (firstRefused) ok(`refusal carries Retry-After (~${Math.round((await consume(a.id)).retryAfterMs / 1000)}s)`);

  // ---- 3: per reader, not global -------------------------------------
  console.log(`\nreader B (${b.email}) is unaffected by A having been throttled`);
  const bFirst = await consume(b.id);
  eq("B's first turn allowed", bFirst.allowed, true);
  eq("B starts from one", bFirst.count, 1);

  // ---- 5: survives a new connection ----------------------------------
  console.log("\nstate survives a new connection (what 'database-backed' means)");
  const second = new Client({ connectionString: url });
  await second.connect();
  const persisted = await second.query(`select count from ai_usage where user_id = $1`, [a.id]);
  eq("A's count from a fresh connection", Number(persisted.rows[0].count), MAX_TURNS + 6);
  await second.end();

  // ---- 4: the window reopens -----------------------------------------
  console.log("\nrewind the window rather than sleeping 60s");
  await client.query(
    `update ai_usage set window_started_at = now() - make_interval(secs => $2) where user_id = $1`,
    [a.id, WINDOW_SECONDS + 5],
  );
  const afterWindow = await consume(a.id);
  eq("allowed again after the window", afterWindow.allowed, true);
  eq("counter reset, not incremented", afterWindow.count, 1);

  // ---- 6: concurrent first-turns must not collide on the primary key ----
  //
  // `ai_usage` has two unique constraints: `id` is the PRIMARY KEY and
  // `user_id` is unique. The upsert names only `user_id` as its arbiter, so two
  // turns arriving before any row existed both attempted an INSERT, and the
  // loser collided on the primary key:
  //
  //   duplicate key value violates unique constraint "ai_usage_pkey"
  //
  // This threw, which on /api/ai is a 500 on the tutor — not the documented
  // behaviour, which is to fail OPEN for the reader's key and refuse only the
  // server's. Measured at roughly 1 in 120 concurrent calls, so it was real and
  // had simply never fired because nothing had ever hit a brand-new account
  // with two tutor turns at the same instant.
  //
  // Firing enough of them that the timing window is hit more than once, so a
  // regression cannot pass by luck.
  console.log("\nconcurrent first-turns collide on neither constraint");
  {
    // A POOL, not the shared `client`.
    //
    // A single pg.Client serialises: it warns "Calling client.query() when the
    // client is already executing a query" and queues the rest. So the obvious
    // version of this test fires 120 calls, has none of them overlap, and
    // passes against the *unfixed* code. It proved nothing while looking like
    // it proved something. The pool is the difference between a concurrency
    // test and a loop.
    const pool = new Pool({ connectionString: url, max: 24 });
    const consumeP = async (userId) => {
      const r = await pool.query(
        `insert into ai_usage (id, user_id, window_started_at, count, updated_at)
         values (${idExpr}, $1, now(), 1, now())
         on conflict (user_id) do update set
           count = case
             when ai_usage.window_started_at <= now() - make_interval(secs => $2)
               then 1
             else ai_usage.count + 1
           end,
           window_started_at = case
             when ai_usage.window_started_at <= now() - make_interval(secs => $2)
               then now()
             else ai_usage.window_started_at
           end,
           updated_at = now()
         returning count`,
        [userId, WINDOW_SECONDS],
      );
      return { count: Number(r.rows[0].count) };
    };

    let collided = null;
    let admitted = null;
    for (let round = 0; round < 4 && !collided; round += 1) {
      await pool.query(`delete from ai_usage where user_id = $1`, [b.id]);
      const results = await Promise.allSettled(
        Array.from({ length: 96 }, () => consumeP(b.id)),
      );
      const rejected = results.filter((r) => r.status === "rejected");
      if (rejected.length) {
        collided = rejected[0].reason?.cause ?? rejected[0].reason;
        break;
      }
      admitted = results.map((r) => r.value.count).sort((x, y) => x - y);
    }
    await pool.end();

    if (collided) {
      bad(
        `no concurrent call may be rejected by the database — got ` +
          `${collided.code}: ${String(collided.message).slice(0, 90)}`,
      );
    } else {
      ok("96 concurrent turns over 4 rounds, none rejected by the database");
      const distinct = new Set(admitted).size;
      const maxCount = Math.max(...admitted);
      if (admitted.length === 96 && distinct === 96 && maxCount === 96) {
        ok(`every turn counted exactly once — 96 distinct counts, max ${maxCount}`);
      } else {
        bad(
          `expected 96 turns counted once each, got ${admitted.length} results, ` +
            `${distinct} distinct, max ${maxCount} — an increment was lost or reused`,
        );
      }
    }
  }

  // ---- cleanup self-verifies -----------------------------------------
  const gone = (await client.query(`delete from ai_usage where user_id = any($1::text[])`, [[a.id, b.id]])).rowCount;
  eq("fixture rows removed", gone, 2);
} catch (err) {
  failures++;
  console.error("\nfailed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}

console.log(failures === 0 ? "\nthe spending budget holds." : `\n${failures} failure(s).`);
process.exitCode = failures === 0 ? 0 : 1;