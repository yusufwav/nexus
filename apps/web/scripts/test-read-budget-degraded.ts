import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Database } from "@Main/db";
import { consumeReadBudget, READ_BUDGET } from "@Main/db/read-budget";

/**
 * THE READ BUDGET MUST NOT BE ABLE TO TAKE DOWN PAID CONTENT
 * ------------------------------------------------------------------------
 * `read_usage` existed in the local database and was never created in
 * production, so the upsert inside `consumeReadBudget` threw on every call
 * and `GET /api/topics/[slug]` answered 500 instead of serving a PDF the
 * reader had paid for. Nothing noticed for one reason: production had zero
 * purchases, so the purchase gate refused every caller before reaching the
 * budget. The bug was sitting directly behind the first sale.
 *
 * It was then caught a second way, and worse: `nexus_app` had no GRANT on
 * `read_usage` at all, so the upsert raised 42501 permission denied, the
 * budget caught that too, and every download sailed through unpaced. Same
 * symptom class, different cause — and a second reminder that a defence
 * which fails open must be loud about doing so, because it will otherwise
 * fail open silently for a reason nobody imagined.
 *
 * ------------------------------------------------------------------------
 * WHY THIS FILE IMPORTS THE REAL MODULE
 *
 * Earlier versions hand-transpiled the source with a chain of regexes to
 * strip its TypeScript types, then evaluated the result in `new Function`.
 * That was broken twice over:
 *
 *   1. The stripping was INCOMPLETE — type annotations leaked into the
 *      generated JS and every behavioural check died with a SyntaxError.
 *   2. Worse, it was HIDDEN. The harness called `fn()` without `await`, so a
 *      rejected promise was recorded as `ok`. Every behavioural check
 *      reported success while executing nothing, and would have passed
 *      against a `consumeReadBudget` that did nothing at all.
 *
 * One passed for a reason unrelated to the code even after the harness was
 * fixed: the rejecting-database case never stubbed the `sql` tag, so it
 * "succeeded" via `ReferenceError: sql is not defined` and would still have
 * passed with the catch deleted.
 *
 * A test that passes for the wrong reason is worse than no test, because it
 * reports that the thing is verified. So there is no hand-transpiling here.
 * The module is imported, and the only thing faked is the database — which
 * is precisely the thing under test.
 *
 * Run from apps/web:  npx tsx scripts/test-read-budget-degraded.ts
 */

let passed = 0;
const failures: string[] = [];
const ok = (m: string) => {
  passed += 1;
  console.log(`  ok   ${m}`);
};
const bad = (m: string) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
async function check(name: string, fn: () => void | Promise<void>): Promise<void> {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(`${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** A database whose every statement fails, as a missing table would. */
function failingDb(message: string): Database {
  return { execute: () => Promise.reject(new Error(message)) } as unknown as Database;
}

/** A database returning one row, so the happy path is exercised for real. */
function answeringDb(row: Record<string, unknown>): Database {
  return { execute: () => Promise.resolve({ rows: [row] }) } as unknown as Database;
}

async function main(): Promise<void> {
  const src = readFileSync(
    new URL("../../../packages/db/src/read-budget.ts", import.meta.url),
    "utf8",
  );
  const routeSrc = readFileSync(
    new URL("../src/app/api/topics/[slug]/route.ts", import.meta.url),
    "utf8",
  );

  /* -- 1. the guard is in the source -- */

  console.log("\nthe guard is in the source");

  await check("the upsert sits inside a try with a catch", () => {
    const start = src.indexOf("export async function consumeReadBudget");
    assert.ok(start > 0, "consumeReadBudget must be findable");
    const body = src.slice(start);
    const tryAt = body.indexOf("try {");
    const insertAt = body.indexOf("insert into read_usage");
    const catchAt = body.indexOf("catch (err)", tryAt);
    assert.ok(tryAt > -1, "no try — a throwing upsert 500s the content route");
    assert.ok(insertAt > tryAt, "the INSERT must be INSIDE the try, not before it");
    assert.ok(catchAt > insertAt, "the catch must come after the statement it guards");
    assert.ok(
      !/throw\s/.test(body.slice(catchAt, catchAt + 700)),
      "the catch must not rethrow — that is the original bug",
    );
  });

  await check("the failure is logged and names the table", () => {
    const catchAt = src.indexOf("catch (err) {", src.indexOf("export async function"));
    const body = src.slice(catchAt, catchAt + 800);
    assert.ok(/console\.error/.test(body), "a silent fail-open is indistinguishable from a working one");
    assert.ok(/read_usage/.test(body), "the log must name the table that is missing");
    assert.ok(
      /neon-setup-6-read-budget\.sql/.test(body),
      "the log must name the file to run, or the reader of the message does not know the fix",
    );
  });

  /* -- 2. behaviour: the real function, a fake database -- */

  console.log("\nthe real function, against a database that rejects");

  await check("a missing table yields a served, degraded budget", async () => {
    const budget = await consumeReadBudget(
      failingDb('relation "read_usage" does not exist'),
      "some-reader",
    );
    assert.equal(budget.degraded, true, "must be marked degraded");
    assert.equal(budget.delayMs, 0, "a degraded request must not be delayed");
    assert.equal(budget.count, 0, "count must not be invented");
    assert.equal(budget.overFree, 0, "overFree must not be invented");
  });

  await check("a permission error yields the same degraded result", async () => {
    // The second live cause: nexus_app had no GRANT on read_usage, so the
    // upsert raised 42501 rather than 42P01. Asserting only the missing-table
    // case would miss this one entirely, and this is the one that shipped.
    const budget = await consumeReadBudget(
      failingDb("permission denied for table read_usage"),
      "some-reader",
    );
    assert.equal(budget.degraded, true, "a permission error is also a degraded counter");
    assert.equal(budget.delayMs, 0, "and must still serve");
  });

  await check("a healthy counter is not degraded and still counts", async () => {
    const budget = await consumeReadBudget(answeringDb({ count: 3 }), "some-reader");
    assert.equal(budget.degraded, false, "a working counter is not degraded");
    assert.equal(budget.count, 3, "the real count comes back");
    assert.equal(
      budget.delayMs,
      0,
      `count 3 is under the allowance of ${READ_BUDGET.FREE_PER_WINDOW}`,
    );
  });

  await check("an over-limit count is still delayed by the real curve", async () => {
    const over = READ_BUDGET.FREE_PER_WINDOW + 1;
    const budget = await consumeReadBudget(answeringDb({ count: over }), "some-reader");
    assert.equal(budget.degraded, false);
    assert.equal(
      budget.delayMs,
      READ_BUDGET.DELAY_STEP_MS,
      "the first over-limit request pays exactly one step",
    );
  });

  await check("the clean-up delete never fails the request", async () => {
    // count % 25 === 1 fires the cleanup. It must not change the result even
    // when it rejects, because housekeeping is not worth a 500.
    const db = {
      execute: (q: unknown) => {
        const text = String(q);
        if (text.includes("delete from read_usage")) {
          return Promise.reject(new Error("cleanup failed"));
        }
        return Promise.resolve({ rows: [{ count: 26 }] });
      },
    } as unknown as Database;
    const budget = await consumeReadBudget(db, "some-reader");
    assert.equal(budget.degraded, false, "a failed cleanup must not degrade the result");
    assert.equal(budget.count, 26, "and must not change the count");
  });

  /* -- 3. the route serves the file when degraded -- */

  console.log("\nthe route treats a degraded budget as a served file");

  await check("it does not 5xx or throw on a degraded budget", () => {
    const at = routeSrc.indexOf("await consumeReadBudget");
    assert.ok(at > -1, "the route must call the budget");
    const after = routeSrc.slice(at, at + 400);
    assert.ok(
      !/return\s+new\s+Response\([^)]*5\d\d/.test(after),
      "the route must not answer with a 5xx when the budget is degraded",
    );
    assert.ok(
      !/catch\s*\{/.test(after),
      "degraded must not be treated as fatal — serving is the whole point",
    );
    assert.ok(/budget\.delayMs\s*>\s*0/.test(after), "a real delay must still be honoured");
  });

  await check("the route ignores `degraded` and serves regardless", () => {
    // Asserted deliberately, because "degraded" is the flag most likely to
    // look like something to branch on later. Branching on it here would
    // reintroduce the 500 in its original form.
    const at = routeSrc.indexOf("await consumeReadBudget");
    const after = routeSrc.slice(at, at + 200);
    assert.ok(
      !/budget\.\s*degraded/.test(after),
      "the route must not consult `degraded` — it serves either way",
    );
  });

  console.log(
    failures.length === 0
      ? `\n${passed} passed.`
      : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});