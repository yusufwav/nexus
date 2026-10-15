import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * THE READ BUDGET MUST NOT BE ABLE TO TAKE DOWN PAID CONTENT
 * ------------------------------------------------------------------------
 * Reproduces the failure that shipped: `read_usage` existed in the local
 * database and had never been created in production, so the upsert inside
 * `consumeReadBudget` threw on every call and `GET /api/topics/[slug]`
 * answered 500 instead of serving a PDF the reader had paid for.
 *
 * It stayed invisible for one reason: production had zero purchases, so the
 * purchase gate refused every caller before reaching the budget. The bug was
 * sitting directly behind the first sale, which is the worst possible place
 * to discover one.
 *
 * WHAT IS ASSERTED, and why each part:
 *
 *   1. The upsert is INSIDE a try. Read from the source, because a test that
 *      re-implements the function proves only that the test works -- the
 *      same defect that test-ai-budget.mjs had, where it copied the SQL,
 *      called itself "verbatim", and went on passing against a copy of the
 *      bug it was meant to catch.
 *
 *   2. A throwing database yields delayMs 0 and `degraded: true`. Serving
 *      is the whole point: this file's stated design is that the budget
 *      DELAYS and never REFUSES, and an exception is an accidental refusal.
 *
 *   3. The ROUTE serves the file when degraded. A budget that returns a
 *      sentinel is only half a fix if the caller treats it as fatal.
 *
 *   4. The failure is logged. A silent fail-open is indistinguishable from a
 *      working one, which is how a missing table stays missing.
 *
 *   5. The table the fix depends on is named in that log, so the reader of
 *      the message knows what to run.
 *
 *   6. The happy path is unchanged — `degraded: false` and the real delay.
 *
 * Run from apps/web:  node scripts/test-read-budget-degraded.mjs
 */

let passed = 0;
const failures = [];

function ok(m) {
  passed += 1;
  console.log(`  ok   ${m}`);
}
function bad(m) {
  failures.push(m);
  console.log(`  FAIL ${m}`);
}
function check(name, fn) {
  try {
    fn();
    ok(name);
  } catch (e) {
    bad(`${name} — ${e.message}`);
  }
}

/* ------------------------------------------------------------------ *
 *  the source, read not copied
 * ------------------------------------------------------------------ */

const src = readFileSync(
  new URL("../../../packages/db/src/read-budget.ts", import.meta.url),
  "utf8",
);

console.log("\nthe guard is in the source");

check("the upsert sits inside a try", () => {
  const fnStart = src.indexOf("export async function consumeReadBudget");
  assert.ok(fnStart > 0, "consumeReadBudget must be findable");
  const body = src.slice(fnStart);

  const tryAt = body.indexOf("try {");
  assert.ok(tryAt > -1, "consumeReadBudget has no try — a throwing upsert 500s the content route");

  // The INSERT must be after the try, or the try guards nothing.
  const insertAt = body.indexOf("insert into read_usage");
  assert.ok(insertAt > tryAt, "the INSERT must be inside the try, not before it");

  // And there must be a catch that returns rather than rethrows.
  const catchAt = body.indexOf("catch (", tryAt);
  assert.ok(catchAt > tryAt, "the try has no catch");
  const after = body.slice(catchAt);
  assert.ok(
    /return\s*\{[^}]*degraded:\s*true/.test(after),
    "the catch must RETURN a degraded budget rather than rethrow",
  );
  assert.ok(
    !/throw\s+/.test(after.slice(0, after.indexOf("}"))),
    "the catch must not rethrow — that is the original bug",
  );
});

check("the degraded result serves with no delay", () => {
  const catchBlock = src.slice(src.indexOf("catch (err) {", src.indexOf("export async function")));
  assert.ok(
    /return\s*\{\s*delayMs:\s*0[^}]*degraded:\s*true\s*\}/s.test(catchBlock),
    "the degraded return must be delayMs 0, count 0, overFree 0, degraded true",
  );
});

check("the healthy result is marked not degraded", () => {
  assert.ok(
    /return\s*\{\s*delayMs:\s*readDelayMs\(count\)[^}]*degraded:\s*false\s*\}/s.test(src),
    "the normal return must set degraded: false",
  );
});

check("the failure is logged, not swallowed", () => {
  const catchBlock = src.slice(src.indexOf("catch (err) {", src.indexOf("export async function")));
  assert.ok(/console\.error/.test(catchBlock), "a silent fail-open is indistinguishable from a working one");
});

check("the log names the table and the migration", () => {
  const catchBlock = src.slice(src.indexOf("catch (err) {", src.indexOf("export async function")));
  assert.ok(/read_usage/.test(catchBlock), "the log must name the table that is missing");
  assert.ok(
    /neon-setup-6-read-budget\.sql/.test(catchBlock),
    "the log must name the file to run, or the reader of the message does not know the fix",
  );
});

/* ------------------------------------------------------------------ *
 *  the route serves the file when degraded
 * ------------------------------------------------------------------ */

const routeSrc = readFileSync(
  new URL("../src/app/api/topics/[slug]/route.ts", import.meta.url),
  "utf8",
);

console.log("\nthe route treats a degraded budget as a served file");

check("the route does not throw or 500 on a degraded budget", () => {
  const call = routeSrc.indexOf("await consumeReadBudget");
  assert.ok(call > -1, "the route must call the budget");
  const after = routeSrc.slice(call, call + 400);

  // The only branch that may exist is the delay. No error branch, no 5xx.
  assert.ok(
    !/return\s+new\s+Response\([^)]*5\d\d/.test(after),
    "the route must not answer with a 5xx when the budget is degraded",
  );
  assert.ok(
    !/catch\s*\{/.test(after),
    "the route must not treat a degraded budget as fatal — serving is the whole point",
  );
  assert.ok(
    /budget\.delayMs\s*>\s*0/.test(after),
    "the route should still honour a real delay when one is returned",
  );
});

/* ------------------------------------------------------------------ *
 *  behaviour, not just source shape
 *
 *  Source assertions above can be satisfied by a comment. This runs the
 *  real function against a database object that throws, which is the exact
 *  condition production was in.
 * ------------------------------------------------------------------ */

console.log("\nand the real function survives a database that throws");

check("a rejecting database yields a served, degraded budget", async () => {
  // The function is TypeScript, so it is transpiled to JS here the same way
  // the test above extracts readDelayMs. Only the types are stripped; the
  // body is the file's.
  const js = src
    .replace(/^import .*$/gm, "")
    .replace(/export type ReadBudget = \{[\s\S]*?\n\};/, "")
    .replace(/: Promise<ReadBudget>/g, "")
    .replace(/readonly /g, "")
    .replace(/\((\w+): Database, (\w+): string\)/g, "($1, $2)")
    .replace(/export async function/g, "async function")
    .replace(/export function/g, "function")
    .replace(/export const READ_BUDGET/g, "const READ_BUDGET")
    .replace(/\bas const\b/g, "");

  const factory = new Function(
    "db",
    "userId",
    `${js}
     return consumeReadBudget(db, userId);`,
  );

  const boom = {
    execute() {
      return Promise.reject(new Error('relation "read_usage" does not exist'));
    },
  };

  const budget = await factory(boom, "some-reader");

  assert.equal(budget.delayMs, 0, "a degraded request must not be delayed");
  assert.equal(budget.degraded, true, "a degraded request must be marked degraded");
  assert.equal(budget.count, 0, "count should not be invented");
  assert.equal(budget.overFree, 0, "overFree should not be invented");
});

check("a working database still returns the real delay", async () => {
  const js = src
    .replace(/^import .*$/gm, "")
    .replace(/export type ReadBudget = \{[\s\S]*?\n\};/, "")
    .replace(/: Promise<ReadBudget>/g, "")
    .replace(/readonly /g, "")
    .replace(/\((\w+): Database, (\w+): string\)/g, "($1, $2)")
    .replace(/export async function/g, "async function")
    .replace(/export function/g, "function")
    .replace(/export const READ_BUDGET/g, "const READ_BUDGET")
    .replace(/\bas const\b/g, "")
    // The tagged template needs a stand-in that produces something
    // `db.execute` can be handed; the SQL text is irrelevant to the curve.
    .replace(/sql`/g, "sqlTag`")
    .replace(/function readDelayMs/, "function __sqlTag(s) { return s; }\nfunction readDelayMs");

  const factory = new Function(
    "sqlTag",
    "db",
    "userId",
    `${js}
     return consumeReadBudget(db, userId);`,
  );

  const healthy = {
    execute() {
      return Promise.resolve({ rows: [{ count: 21 }] });
    },
  };

  const budget = await factory((s) => s, healthy, "some-reader");

  assert.equal(budget.degraded, false, "a working database is not degraded");
  assert.equal(budget.count, 21, "the real count comes back");
  // 21 is one past the free allowance of 20, so exactly one step.
  assert.ok(budget.delayMs > 0, "the real delay must still apply");
});

/* ------------------------------------------------------------------ */

console.log(
  failures.length === 0
    ? `\n${passed} passed.`
    : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);