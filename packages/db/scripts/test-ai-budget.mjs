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
import { Client } from "pg";

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

/** The upsert from consumeAiBudget, verbatim. */
async function consume(userId) {
  const r = await client.query(
    `insert into ai_usage (id, user_id, window_started_at, count, updated_at)
     values ($1, $2, now(), 1, now())
     on conflict (user_id) do update set
       count = case
         when ai_usage.window_started_at <= now() - make_interval(secs => $3)
           then 1
         else ai_usage.count + 1
       end,
       window_started_at = case
         when ai_usage.window_started_at <= now() - make_interval(secs => $3)
           then now()
         else ai_usage.window_started_at
       end,
       updated_at = now()
     returning count,
       greatest(0, extract(epoch from (
         ai_usage.window_started_at + make_interval(secs => $3) - now()
       )) * 1000)::bigint as retry_after_ms`,
    [`ai:${userId}`, userId, WINDOW_SECONDS],
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