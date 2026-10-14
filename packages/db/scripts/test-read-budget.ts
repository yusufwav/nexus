/**
 * THE READ BUDGET, AGAINST A REAL DATABASE
 * ------------------------------------------------------------------------
 * `scripts/test-read-budget.mjs` in apps/web proves the arithmetic and the
 * shape. It cannot prove the SQL runs, that the upsert actually increments,
 * that the window really resets, or — the one that matters most — that
 * concurrent calls really do get distinct counts. All four are properties of
 * Postgres, so they are tested against Postgres.
 *
 * The concurrency case is the reason this file exists. A counter written as
 * SELECT-then-UPDATE passes every single assertion in the .mjs suite: the
 * source has an upsert, the unique index is there, the arithmetic is right. It
 * only fails when two requests arrive together — which is precisely what
 * happens when someone parallelises a download loop, the first thing anyone
 * would try. So: fire them together and require every count to be distinct.
 *
 * Run from packages/db:  pnpm db:test:read-budget
 */
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";

import { createDb } from "../src/index";
import { consumeReadBudget, readDelayMs, READ_BUDGET } from "../src/read-budget";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("  DATABASE_URL is not set — nothing to prove against.");
  process.exit(1);
}

const db = createDb({ DATABASE_URL: url });

let passed = 0;
const ok = (m: string) => {
  passed += 1;
  console.log(`  ok   ${m}`);
};

/** A real user id, because read_usage.user_id is a foreign key. */
const rows = await db.execute(
  sql`select id from "user" order by created_at limit 1`,
);
const userId = (rows.rows[0] as { id: string } | undefined)?.id;
if (!userId) {
  console.error("  no user row exists — sign up once first, then re-run.");
  process.exit(1);
}

const reset = async () => {
  await db.execute(sql`delete from read_usage where user_id = ${userId}`);
};

console.log(`\nthe counter increments and resets (user ${userId.slice(0, 8)}…)`);

{
  await reset();
  const counts: number[] = [];
  const delays: number[] = [];
  for (let i = 0; i < 25; i += 1) {
    const r = await consumeReadBudget(db, userId);
    counts.push(r.count);
    delays.push(r.delayMs);
  }
  assert.deepEqual(
    counts,
    Array.from({ length: 25 }, (_, i) => i + 1),
    `expected 1..25, got ${counts.join(",")}`,
  );
  ok("25 sequential calls produced counts 1 through 25, with no gap or repeat");

  // The free allowance must actually be free, against the real table.
  const free = delays.slice(0, READ_BUDGET.FREE_PER_WINDOW);
  assert.ok(
    free.every((d) => d === 0),
    `the first ${READ_BUDGET.FREE_PER_WINDOW} calls must be undelayed, got ${free.join(",")}`,
  );
  ok(`the first ${READ_BUDGET.FREE_PER_WINDOW} calls are undelayed in the real table`);

  // `delays[i]` is `number | undefined` under noUncheckedIndexedAccess, and
  // assert.notEqual does not narrow, so the guard is explicit.
  const firstOverLimit = delays[READ_BUDGET.FREE_PER_WINDOW] ?? 0;
  assert.ok(firstOverLimit > 0, "call 21 should be delayed once past the allowance");
  ok("the call past the allowance is delayed");

  // The row the arithmetic reads must be the row the arithmetic returns.
  const row = await db.execute(
    sql`select count from read_usage where user_id = ${userId}`,
  );
  const storedRow = (row.rows[0] as { count: number } | undefined)?.count;
  assert.notEqual(storedRow, undefined, "the read_usage row must exist");
  const stored = Number(storedRow);
  assert.equal(stored, 25, `the table should hold 25, holds ${stored}`);
  ok(`the table holds the same count (${stored}) the function returned — one source of truth`);

  // Monotonic in the database, not just in the pure function.
  let previous = -1;
  for (const d of delays) {
    assert.ok(d >= previous, `delay fell from ${previous} to ${d}`);
    previous = d;
  }
  ok("delay never decreases across a real sequence of calls");
}

console.log("\nthe window expires instead of becoming a lifetime cap");

{
  await reset();
  await consumeReadBudget(db, userId);
  await consumeReadBudget(db, userId);
  await consumeReadBudget(db, userId);

  // Push the window into the past, exactly as the passage of time would.
  await db.execute(
    sql`update read_usage
           set window_started_at = now() - make_interval(secs => ${
             Math.round(READ_BUDGET.WINDOW_MS / 1000) + 5
           })
         where user_id = ${userId}`,
  );

  const after = await consumeReadBudget(db, userId);
  assert.equal(after.count, 1, "an expired window must reset to 1, not continue from 4");
  assert.equal(after.delayMs, 0, "a reader returning after the window must not be penalised");
  ok("a call after the window resets the count to 1 and applies no delay");

  // And the same window must not reset early.
  await consumeReadBudget(db, userId);
  await consumeReadBudget(db, userId);
  const inside = await consumeReadBudget(db, userId);
  assert.equal(inside.count, 4, "a window that has not expired must keep counting");
  ok("a window that has not expired keeps counting — the reset is not a free reset");
}

console.log("\nconcurrent calls cannot both be admitted (the upsert race)");

{
  await reset();
  // Fired together, deliberately. This is what a parallelised download looks
  // like, and it is the exact case a SELECT-then-UPDATE counter gets wrong.
  const results = await Promise.all(
    Array.from({ length: 30 }, () => consumeReadBudget(db, userId)),
  );
  const counts = results.map((r) => r.count).sort((a, b) => a - b);

  assert.deepEqual(
    counts,
    Array.from({ length: 30 }, (_, i) => i + 1),
    `30 concurrent calls should yield 1..30 exactly once each, got ${counts.join(",")}`,
  );
  ok("30 concurrent calls produced 1..30 with no duplicates — no request was admitted twice");

  const row = await db.execute(
    sql`select count from read_usage where user_id = ${userId}`,
  );
  assert.equal(Number((row.rows[0] as { count: number }).count), 30);
  ok("the stored count agrees with 30, so none of the increments was lost");
}

console.log("\nthe pure curve and the persisted curve agree");

{
  await reset();
  for (let i = 1; i <= 40; i += 1) {
    const r = await consumeReadBudget(db, userId);
    assert.equal(
      r.delayMs,
      readDelayMs(i),
      `call ${i}: persisted delay ${r.delayMs} disagrees with the pure curve ${readDelayMs(i)}`,
    );
  }
  ok("40 calls through the database match the pure curve exactly, every one");

  const row = await db.execute(
    sql`select count from read_usage where user_id = ${userId}`,
  );
  const final = Number((row.rows[0] as { count: number }).count);
  assert.equal(final, 40, `expected the table to hold 40, holds ${final}`);

  // 40 calls is (40 - 20) * 250 = 5000ms, which is *below* the 6000ms cap.
  // Asserting the cap is reached at 40 was wrong: the cap lands when
  // (count - FREE) * STEP >= MAX, i.e. count >= 44.
  assert.equal(readDelayMs(final), 5000, "40 calls should be 5000ms — still short of the cap");
  ok("40 calls reach 5000ms through the real path — under the cap, as the arithmetic says");

  const firstCapped = Math.ceil(READ_BUDGET.MAX_DELAY_MS / READ_BUDGET.DELAY_STEP_MS) + READ_BUDGET.FREE_PER_WINDOW;
  assert.equal(readDelayMs(firstCapped - 1), READ_BUDGET.MAX_DELAY_MS - READ_BUDGET.DELAY_STEP_MS);
  assert.equal(readDelayMs(firstCapped), READ_BUDGET.MAX_DELAY_MS, `the cap should land at count ${firstCapped}`);
  ok(`the cap first lands at exactly count ${firstCapped}, derived from the constants not guessed`);
}

await reset();
console.log(`\n${passed} passed.`);