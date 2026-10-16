import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import type { Database } from "@Main/db";
import { consumeAiBudget, AI_BUDGET } from "@Main/db/ai-rate-limit";

/**
 * THE TUTOR BUDGET DEFERS ITS DECISION; THE ROUTE MAKES IT
 * ------------------------------------------------------------------------
 * `ai-rate-limit.ts` promised, in its own header, that the budget "must be
 * able to fail OPEN for the reader's own key while still refusing the
 * server's". That read like a guarantee and was not one: the upsert sat bare,
 * so any failure propagated out of `/api/ai` as a 500, and a missing
 * `ai_usage` table would have taken the tutor down entirely.
 *
 * The fix splits the responsibility, and the split IS the design:
 *
 *   consumeAiBudget   catches, reports `degraded`, and NEVER decides.
 *   /api/ai           decides, because it is the only place that knows
 *                     whether the next call is billed to the reader or to
 *                     the owner.
 *
 * Failing open unconditionally would be wrong here in a way it is RIGHT on
 * the content route. On `/api/topics/[slug]`, an uncounted request only means
 * a bulk loop runs at full speed. Here, an uncounted request on the SERVER's
 * key is a real drain of the owner's quota — and `ai_usage` exists for no
 * other purpose. Thirty unguarded POSTs returning 200 is the exact situation
 * that prompted the table.
 *
 * ------------------------------------------------------------------------
 * WHY THIS FILE IMPORTS THE REAL MODULE
 *
 * The earlier version hand-transpiled the source with regexes to strip its
 * TypeScript types and evaluated the result in `new Function`. Two failures
 * followed, and the second is the one that matters:
 *
 *   1. The stripping was incomplete — annotations leaked into the generated
 *      JS and every behavioural check died with a SyntaxError.
 *   2. The harness called `fn()` without `await`, so a rejected promise was
 *      recorded as `ok`. All three behavioural checks reported success while
 *      executing nothing, and would have passed against a `consumeAiBudget`
 *      that did nothing at all.
 *
 * Both are now impossible: the real module is imported, and the only thing
 * faked is the database, which is the thing under test.
 *
 * Run from apps/web:  npx tsx scripts/test-ai-budget-degraded.ts
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

function failingDb(message: string): Database {
  return { execute: () => Promise.reject(new Error(message)) } as unknown as Database;
}
function answeringDb(row: Record<string, unknown>): Database {
  return { execute: () => Promise.resolve({ rows: [row] }) } as unknown as Database;
}

async function main(): Promise<void> {
  const budgetSrc = readFileSync(
    new URL("../../../packages/db/src/ai-rate-limit.ts", import.meta.url),
    "utf8",
  );
  const routeSrc = readFileSync(
    new URL("../src/app/api/ai/route.ts", import.meta.url),
    "utf8",
  );

  /* -- 1. the counter catches, and refuses to decide -- */

  console.log("\nthe counter catches and refuses to decide");

  await check("the upsert is inside a try with a catch", () => {
    const start = budgetSrc.indexOf("export async function consumeAiBudget");
    assert.ok(start > 0, "consumeAiBudget must be findable");
    const body = budgetSrc.slice(start);
    const tryAt = body.indexOf("try {");
    const insertAt = body.indexOf("insert into ai_usage");
    const catchAt = body.indexOf("catch (err)", tryAt);
    assert.ok(tryAt > -1, "no try — a failure 500s the tutor");
    assert.ok(insertAt > tryAt, "the INSERT must be INSIDE the try");
    assert.ok(catchAt > insertAt, "the catch must follow the statement it guards");
    assert.ok(
      !/throw\s/.test(body.slice(catchAt, catchAt + 800)),
      "the catch must not rethrow",
    );
  });

  await check("the failure is logged and names the table", () => {
    const catchAt = budgetSrc.indexOf(
      "catch (err) {",
      budgetSrc.indexOf("export async function"),
    );
    const body = budgetSrc.slice(catchAt, catchAt + 800);
    assert.ok(/console\.error/.test(body), "a silent degradation is indistinguishable from a working counter");
    assert.ok(/ai_usage/.test(body), "the log must name the table that is missing");
  });

  await check("the type warns that `allowed` does not decide alone", () => {
    // Located by finding the comment that ENDS at the field, not by a fixed
    // number of characters before it — a width starts failing the next time
    // someone adds a paragraph, and a test that fails for the wrong reason
    // gets ignored.
    const fieldAt = budgetSrc.indexOf("readonly degraded: boolean;");
    assert.ok(fieldAt > -1, "AiBudget must carry a degraded field");
    const docStart = budgetSrc.lastIndexOf("/**", fieldAt);
    assert.ok(docStart > -1, "the degraded field has no doc comment above it");
    const doc = budgetSrc.slice(docStart, fieldAt);
    assert.ok(
      doc.includes("ALWAYS true") && doc.includes("does not decide alone"),
      "the doc must say `allowed` is always true and does not decide alone",
    );
  });

  /* -- 2. the route decides, and refuses only for the server's key -- */

  console.log("\nthe route refuses only when the owner would pay");

  await check("the check keys on BOTH degraded and source", () => {
    const at = routeSrc.indexOf("budget.degraded");
    assert.ok(at > -1, "the route never checks budget.degraded — nobody decided");
    const window = routeSrc.slice(at, at + 200);
    assert.ok(
      /chosen\.source\s*===\s*"server"/.test(window),
      'the refusal must be gated on chosen.source === "server"',
    );
  });

  await check("the refusal comes AFTER the model is resolved", () => {
    // The ordering is the entire point: before `resolveTutorModel` the route
    // does not know whose key pays, and refusing then would block readers
    // whose own key would have worked perfectly well.
    const resolveAt = routeSrc.indexOf("await resolveTutorModel(wanted)");
    const degradedAt = routeSrc.indexOf("budget.degraded");
    assert.ok(resolveAt > -1 && degradedAt > -1, "both must be findable");
    assert.ok(degradedAt > resolveAt, "the check must follow resolveTutorModel");
  });

  await check("the refusal is 503, not 429", () => {
    const at = routeSrc.indexOf("budget.degraded");
    const window = routeSrc.slice(at, at + 900);
    assert.ok(/status:\s*503/.test(window), "this is a dependency outage, not a rate limit");
    assert.ok(!/status:\s*429/.test(window), "429 would tell the reader to retry something that fails identically");
  });

  await check("a degraded budget on the reader's own key proceeds", () => {
    // The half a naive `if (degraded) return` gets wrong: it would refuse
    // readers who were about to spend their own money, cost the owner
    // nothing, and could have been answered.
    const at = routeSrc.indexOf("budget.degraded");
    assert.ok(
      !/if\s*\(\s*budget\.degraded\s*\)\s*\{/.test(routeSrc.slice(at, at + 200)),
      "the check must not refuse unconditionally",
    );
  });

  await check("the refusal offers the reader a way forward", () => {
    const at = routeSrc.indexOf("budget.degraded");
    assert.ok(/Settings/.test(routeSrc.slice(at, at + 900)), "a refusal with no way forward is a dead end");
  });

  /* -- 3. behaviour: the real function -- */

  console.log("\nand the real function survives a database that rejects");

  await check("a rejecting database yields a degraded budget rather than throwing", async () => {
    const b = await consumeAiBudget(
      failingDb('relation "ai_usage" does not exist'),
      "reader-1",
    );
    assert.equal(b.degraded, true, "must be marked degraded");
    assert.equal(b.allowed, true, "must not block on its own — the caller decides");
  });

  await check("a permission error degrades identically", async () => {
    const b = await consumeAiBudget(failingDb("permission denied for table ai_usage"), "reader-1");
    assert.equal(b.degraded, true, "a permission error is also a degraded counter");
  });

  await check("a healthy counter still enforces the ceiling", async () => {
    const b = await consumeAiBudget(
      answeringDb({ count: AI_BUDGET.MAX_TURNS + 1, retry_after_ms: 30000 }),
      "reader-1",
    );
    assert.equal(b.degraded, false, "a working counter is not degraded");
    assert.equal(b.allowed, false, "over the ceiling must still be refused");
    assert.equal(b.remaining, 0, "nothing remains");
  });

  await check("a healthy counter under the ceiling allows", async () => {
    const b = await consumeAiBudget(answeringDb({ count: 1, retry_after_ms: 0 }), "reader-1");
    assert.equal(b.allowed, true, "under the ceiling must be allowed");
    assert.ok(b.remaining > 0, "remaining should be reported");
    assert.equal(b.retryAfterMs, 0, "no retry delay when allowed");
  });

  await check("the boundary itself is exact", async () => {
    // The ceiling is read from the module's own export rather than written
    // here, so this cannot drift away from the real limit.
    const at = await consumeAiBudget(
      answeringDb({ count: AI_BUDGET.MAX_TURNS, retry_after_ms: 0 }),
      "reader-1",
    );
    const over = await consumeAiBudget(
      answeringDb({ count: AI_BUDGET.MAX_TURNS + 1, retry_after_ms: 5000 }),
      "reader-1",
    );
    assert.equal(at.allowed, true, `turn ${AI_BUDGET.MAX_TURNS} is the last allowed one`);
    assert.equal(over.allowed, false, `turn ${AI_BUDGET.MAX_TURNS + 1} must be refused`);
    assert.equal(at.retryAfterMs, 0, "an allowed turn carries no retry delay");
    assert.ok(over.retryAfterMs > 0, "a refused turn must carry a retry delay");
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