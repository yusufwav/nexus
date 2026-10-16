import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * THE TUTOR BUDGET DEFERS ITS DECISION; THE ROUTE MAKES IT
 * ------------------------------------------------------------------------
 * `ai-rate-limit.ts` promised, in its own header comment, that the budget
 * "must be able to fail OPEN for the reader's own key while still refusing
 * the server's". That sentence read like a guarantee and was not one: the
 * upsert sat bare, so any failure propagated out of `/api/ai` as a 500, and
 * a missing `ai_usage` table would have taken the tutor down entirely.
 *
 * The fix splits the responsibility, and the split is the whole design:
 *
 *   consumeAiBudget   catches, reports `degraded`, and NEVER decides.
 *   /api/ai           decides, because it is the only place that knows
 *                     whether the next call is billed to the reader or to
 *                     the owner.
 *
 * Failing open unconditionally would be wrong here in a way it is RIGHT on
 * the content route. On `/api/topics/[slug]`, an uncounted request only means
 * a bulk loop runs at full speed. Here, an uncounted request on the SERVER's
 * key is a real drain of the owner's quota — and ai_usage exists for no other
 * purpose. Thirty unguarded POSTs returning 200 is the exact situation that
 * prompted the table.
 *
 * SO THE ASSERTIONS ARE ABOUT THE DECISION, not the catch. A test that only
 * checks "does not throw" would pass against a version that failed open for
 * everything, which is the dangerous version.
 *
 * Run from apps/web:  node scripts/test-ai-budget-degraded.mjs
 */

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
function check(name, fn) {
  try {
    fn();
    ok(name);
  } catch (e) {
    bad(`${name} — ${e.message}`);
  }
}

const budgetSrc = readFileSync(
  new URL("../../../packages/db/src/ai-rate-limit.ts", import.meta.url),
  "utf8",
);
const routeSrc = readFileSync(
  new URL("../src/app/api/ai/route.ts", import.meta.url),
  "utf8",
);

/* ------------------------------------------------------------------ *
 *  1. the counter catches, and does not decide
 * ------------------------------------------------------------------ */

console.log("\nthe counter catches and refuses to decide");

check("the upsert is inside a try", () => {
  const fnStart = budgetSrc.indexOf("export async function consumeAiBudget");
  assert.ok(fnStart > 0, "consumeAiBudget must be findable");
  const body = budgetSrc.slice(fnStart);
  const tryAt = body.indexOf("try {");
  assert.ok(tryAt > -1, "consumeAiBudget has no try — a failure 500s the tutor");
  const insertAt = body.indexOf("insert into ai_usage");
  assert.ok(insertAt > tryAt, "the INSERT must be inside the try, not before it");
});

check("a degraded budget reports the flag and does not rethrow", () => {
  assert.ok(
    /return\s*\{[^}]*degraded:\s*true[^}]*\}/s.test(budgetSrc),
    "the catch must return an object carrying degraded: true",
  );
  const catchStart = budgetSrc.indexOf("catch (err) {", budgetSrc.indexOf("export async function"));
  const catchBody = budgetSrc.slice(catchStart, catchStart + 600);
  assert.ok(!/throw\s/.test(catchBody), "the catch must not rethrow");
});

check("the healthy path sets degraded: false", () => {
  assert.ok(
    /allowed:\s*count\s*<=\s*MAX_TURNS[\s\S]{0,200}degraded:\s*false/.test(budgetSrc),
    "the normal return must set degraded: false",
  );
});

check("the failure is logged, with the table named", () => {
  const catchStart = budgetSrc.indexOf("catch (err) {", budgetSrc.indexOf("export async function"));
  const catchBody = budgetSrc.slice(catchStart, catchStart + 700);
  assert.ok(/console\.error/.test(catchBody), "a silent degradation is indistinguishable from a working counter");
  assert.ok(/ai_usage/.test(catchBody), "the log must name the table that is missing");
});

check("the type documents that allowed is meaningless when degraded", () => {
  // The doc block is located by finding the comment that ENDS at the field,
  // not by a fixed number of characters before it. A width would silently
  // start failing the next time someone adds a paragraph, and a test that
  // fails for the wrong reason gets ignored — which is the failure mode this
  // whole file exists to avoid.
  const fieldAt = budgetSrc.indexOf("readonly degraded: boolean;");
  assert.ok(fieldAt > -1, "AiBudget must carry a degraded field");
  const docStart = budgetSrc.lastIndexOf("/**", fieldAt);
  assert.ok(docStart > -1, "the degraded field has no doc comment above it");
  const doc = budgetSrc.slice(docStart, fieldAt);

  assert.ok(
    doc.includes("ALWAYS true") && doc.includes("does not decide alone"),
    "the doc above `degraded` must say `allowed` is always true and does not decide alone — that is what stops a future caller trusting it",
  );
});

/* ------------------------------------------------------------------ *
 *  2. the route decides, and refuses for the server's key
 * ------------------------------------------------------------------ */

console.log("\nthe route refuses only when the owner would pay");

check("the check exists and keys on both degraded and source", () => {
  const at = routeSrc.indexOf("budget.degraded");
  assert.ok(at > -1, "the route never checks budget.degraded — the decision was never made");
  const window = routeSrc.slice(at, at + 200);
  assert.ok(
    /chosen\.source\s*===\s*"server"/.test(window),
    'the refusal must be gated on chosen.source === "server"',
  );
});

check("the refusal comes AFTER the model is resolved", () => {
  // Ordering is the entire point: before `resolveTutorModel` the route does
  // not know who pays, and refusing then would block readers whose own key
  // would have worked fine.
  const resolveAt = routeSrc.indexOf("await resolveTutorModel(wanted)");
  const degradedAt = routeSrc.indexOf("budget.degraded");
  assert.ok(resolveAt > -1 && degradedAt > -1, "both must be findable");
  assert.ok(
    degradedAt > resolveAt,
    "the degraded check must come after resolveTutorModel, or it cannot know whose key pays",
  );
});

check("the refusal is 503, not 429", () => {
  const at = routeSrc.indexOf("budget.degraded");
  const window = routeSrc.slice(at, at + 900);
  assert.ok(
    /status:\s*503/.test(window),
    "a 429 tells the reader to retry something that will fail identically; this is a dependency outage",
  );
  assert.ok(
    !/status:\s*429/.test(window),
    "the degraded refusal must not be a 429",
  );
});

check("a degraded budget on the reader's own key proceeds", () => {
  // The positive half, which is the one a naive `if (degraded) return`
  // would get wrong: it would refuse readers who were about to spend their
  // own money and cost the owner nothing.
  const at = routeSrc.indexOf("budget.degraded");
  const window = routeSrc.slice(at, at + 200);
  assert.ok(
    !/if\s*\(\s*budget\.degraded\s*\)\s*\{/.test(window),
    "the check must not refuse unconditionally — only for the server's key",
  );
});

check("the refusal tells the reader how to keep working", () => {
  const at = routeSrc.indexOf("budget.degraded");
  const window = routeSrc.slice(at, at + 900);
  assert.ok(
    /Settings/.test(window),
    "the message must offer the reader a way forward, not just a refusal",
  );
});

/* ------------------------------------------------------------------ *
 *  3. behaviour: the real function against a database that throws
 * ------------------------------------------------------------------ */

console.log("\nand the real function survives a database that throws");

/** Strip the types so the source can run under `new Function`. */
function runnable(src) {
  return src
    .replace(/^import .*$/gm, "")
    .replace(/export type AiBudget = \{[\s\S]*?\n\};/, "")
    .replace(/export type [\s\S]*?\n\};/g, "")
    .replace(/: Promise<AiBudget>/g, "")
    .replace(/readonly /g, "")
    .replace(/\((\w+): Database, (\w+): string\)/g, "($1, $2)")
    .replace(/export async function/g, "async function")
    .replace(/export function/g, "function")
    .replace(/export const AI_BUDGET/g, "const AI_BUDGET")
    .replace(/\bas const\b/g, "")
    .replace(/sql`/g, "sqlTag`")
    .replace(/export type/g, "type");
}

check("a rejecting database yields a degraded budget rather than throwing", async () => {
  const factory = new Function(
    "sqlTag",
    "db",
    "userId",
    `function __sqlTag(s){return s}
     ${runnable(budgetSrc)}
     return consumeAiBudget(db, userId);`,
  );
  const boom = {
    execute: () => Promise.reject(new Error('relation "ai_usage" does not exist')),
  };
  const b = await factory((s) => s, boom, "reader-1");
  assert.equal(b.degraded, true, "must be marked degraded");
  assert.equal(b.allowed, true, "must not block on its own — the caller decides");
});

check("a healthy database still enforces the limit", async () => {
  const factory = new Function(
    "sqlTag",
    "db",
    "userId",
    `function __sqlTag(s){return s}
     ${runnable(budgetSrc)}
     return consumeAiBudget(db, userId);`,
  );
  // MAX_TURNS is read from the source rather than hard-coded here, so this
  // cannot drift away from the real ceiling.
  const MAX_TURNS = Number(/const MAX_TURNS = (\d+)/.exec(budgetSrc)[1]);
  const healthy = {
    execute: () => Promise.resolve({ rows: [{ count: MAX_TURNS + 1, retry_after_ms: 30000 }] }),
  };
  const b = await factory((s) => s, healthy, "reader-1");
  assert.equal(b.degraded, false, "a working counter is not degraded");
  assert.equal(b.allowed, false, "over the ceiling must still be refused");
});

check("a healthy database under the ceiling allows", async () => {
  const factory = new Function(
    "sqlTag",
    "db",
    "userId",
    `function __sqlTag(s){return s}
     ${runnable(budgetSrc)}
     return consumeAiBudget(db, userId);`,
  );
  const healthy = {
    execute: () => Promise.resolve({ rows: [{ count: 1, retry_after_ms: 0 }] }),
  };
  const b = await factory((s) => s, healthy, "reader-1");
  assert.equal(b.allowed, true, "under the ceiling must be allowed");
  assert.ok(b.remaining > 0, "remaining should be reported");
});

/* ------------------------------------------------------------------ */

console.log(
  failures.length === 0
    ? `\n${passed} passed.`
    : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);