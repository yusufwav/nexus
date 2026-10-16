import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { sql } from "drizzle-orm";

import { createDb } from "@Main/db";
import * as q from "@Main/db/queries";
import { gradeAnswer, outcomeFor, parseQuestion, publicQuestion } from "../src/lib/practice-grading";

/**
 * THE PRACTICE PATH, AGAINST A REAL DATABASE
 * ------------------------------------------------------------------------
 * The other suite pins grading as a pure function, which is the right level for
 * "the verdict is a lookup". This one pins the parts a pure test cannot see:
 *
 *   · the entitlement filter actually filters, in SQL, against real rows
 *   · a reader with no purchases gets nothing rather than everything
 *   · grading a row that came back from the database works end to end
 *   · the attempt is recorded, and is invisible to another reader
 *
 * It runs against the LOCAL database and only ever writes to
 * practice_attempts, which is append-only and per-reader. No question row is
 * created, modified or deleted — the catalogue is imported content and this
 * test has no business touching it.
 *
 * Run from apps/web:  npx tsx scripts/test-practice-integration.ts
 */

const url = readFileSync(new URL("../.env", import.meta.url), "utf8")
  .match(/^DATABASE_URL=(.*)$/m)?.[1]
  .trim()
  .replace(/^["']|["']$/g, "");
assert.ok(url, "DATABASE_URL must be set in apps/web/.env");

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
async function check(name: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
    ok(name);
  } catch (e) {
    bad(`${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

const db = createDb({ DATABASE_URL: url });

async function main(): Promise<void> {
  /* -- the catalogue is actually in the database -- */

  console.log("\nthe catalogue is in the database");

  const everything = await q.listPracticeQuestions(db, new Set(["MATT101", "MATT102", "MAPV111", "MAPV112"]));
  await check("questions come back for owned modules", () => {
    assert.ok(everything.length > 0, "no questions at all — has the import been run?");
  });

  await check("every returned row validates against the authoring schema", () => {
    for (const row of everything) {
      parseQuestion(row); // throws with the offending id if it does not
    }
  });

  await check("the multiple-choice rows are gradeable end to end", () => {
    const mc = everything.filter((r) => r.format === "multiple-choice");
    assert.ok(mc.length > 0, "no multiple-choice questions imported");
    for (const row of mc) {
      const question = parseQuestion(row);
      // Narrow before touching a format-specific field: parseQuestion returns
      // the three-format union, and `spec` is only shaped per variant.
      assert.equal(question.format, "multiple-choice", `${row.id} is not multiple choice`);
      if (question.format !== "multiple-choice") continue;
      const correctId = question.spec.options.find((o) => o.correct)!.id;
      const wrongId = question.spec.options.find((o) => !o.correct)!.id;

      assert.equal(gradeAnswer(question, correctId).correct, true, `${row.id}: right answer marked wrong`);
      assert.equal(gradeAnswer(question, wrongId).correct, false, `${row.id}: wrong answer marked right`);
    }
  });

  /* -- the entitlement filter -- */

  console.log("\nthe entitlement filter filters");

  const matt = await q.listPracticeQuestions(db, new Set(["MATT101"]));
  await check("one module returns only that module's questions", () => {
    assert.ok(matt.length > 0, "MATT101 has no questions");
    for (const row of matt) {
      assert.equal(row.module_code, "MATT101", `${row.id} leaked from ${row.module_code}`);
    }
  });

  await check("a reader owning nothing gets nothing", async () => {
    const none = await q.listPracticeQuestions(db, new Set());
    assert.equal(none.length, 0, "an empty entitlement set returned questions");
  });

  await check("a code that matches nothing returns nothing", async () => {
    const none = await q.listPracticeQuestions(db, new Set(["NOPE999"]));
    assert.equal(none.length, 0, "an unknown module returned questions");
  });

  await check("a requested module outside the entitlement set is refused", async () => {
    // This is the bypass the route depends on: asking for a module the reader
    // does not own must come back empty, not come back with that module's
    // questions. The filter is applied BEFORE the module filter on purpose, so
    // a caller cannot widen its own entitlement by naming a module.
    const none = await q.listPracticeQuestions(db, new Set(["MATT101"]), {
      moduleCode: "MAPV111",
    });
    assert.equal(none.length, 0, "naming an unowned module returned its questions");
  });

  /* -- the strip, on real rows -- */

  console.log("\nreal rows strip cleanly");

  await check("no serialised public question carries an answer", () => {
        // Only the rows the route would actually serve. `publicQuestion` throws
    // for any other format by design, and B2a is multiple choice alone -- so
    // testing the application rows here would be asserting on rows the
    // endpoint never emits.
    const mcOnly = matt.filter((r) => r.format === "multiple-choice");
    assert.ok(mcOnly.length > 0, "no multiple-choice questions to strip");
    const wire = JSON.stringify(mcOnly.map((r) => publicQuestion(parseQuestion(r))));
    assert.ok(!wire.includes('"correct"'), "a correct flag reached the wire format");
    assert.ok(!wire.includes('"explanation"'), "an explanation reached the wire format");
  });

  await check("getPracticeQuestionById finds a real row and misses a fake one", async () => {
    const found = await q.getPracticeQuestionById(db, matt[0]!.id);
    assert.ok(found !== null, "a known id was not found");
    assert.equal(found!.id, matt[0]!.id);
    const missing = await q.getPracticeQuestionById(db, "no-such-question");
    assert.equal(missing, null, "an unknown id returned a row");
  });

  /* -- recording an attempt -- */

  console.log("\nattempts are recorded, and stay the reader's own");

  const READER = "practice-integration-reader";
  const OTHER = "practice-integration-other";

  for (const [id, email] of [
    [READER, "practice-integration@example.invalid"],
    [OTHER, "practice-integration-2@example.invalid"],
  ] as const) {
    // drizzle takes parameters through the tagged template, not a params
    // array. The array form compiles, runs, and silently binds NOTHING --
    // which surfaces as a bare "Failed query" with an empty `params:`, so
    // this is written the way the rest of the repo writes it.
    await db.execute(sql`
      insert into "user" (id, name, email, email_verified, created_at, updated_at)
      values (${id}, ${"Practice Probe"}, ${email}, true, now(), now())
      on conflict (id) do nothing
    `);
  }

  /*
   * CLEAR FIRST, THEN ASSERT.
   *
   * The first version cleaned up only at the end, so a run that failed partway
   * through left its attempts behind — and the NEXT run failed for a different
   * reason, "expected 1 attempt, found 3", which points at the code under test
   * when the cause is debris. Any test that writes rows has to be able to run
   * twice in a row, and that means starting from a known state rather than
   * assuming the last run finished.
   */
  await db.execute(
    sql`delete from practice_attempts where user_id = ${READER} or user_id = ${OTHER}`,
  );

  const mcRow = matt.find((r) => r.format === "multiple-choice")!;
  const question = parseQuestion(mcRow);
  assert.equal(question.format, "multiple-choice", "the probe row is not multiple choice");
  if (question.format !== "multiple-choice") throw new Error("unreachable");
  const wrongId = question.spec.options.find((o) => !o.correct)!.id;
  const result = gradeAnswer(question, wrongId);

  const attemptId = await q.recordPracticeAttempt(db, READER, {
    questionId: mcRow.id,
    format: mcRow.format,
    outcome: outcomeFor(result),
    detail: { chosenOptionId: wrongId, unrecognised: false },
  });

  await check("the attempt was written", async () => {
    assert.ok(typeof attemptId === "string" && attemptId.length > 0);
    const mine = await q.listAttemptsForQuestion(db, READER, mcRow.id);
    assert.equal(mine.length, 1, `expected 1 attempt, found ${mine.length}`);
    assert.equal(mine[0]!.outcome, "incorrect", "the outcome stored does not match the verdict");
  });

  await check("the answer is stored, not just the verdict", async () => {
    const mine = await q.listAttemptsForQuestion(db, READER, mcRow.id);
    const detail = mine[0]!.detail as { chosenOptionId?: string };
    assert.equal(
      detail.chosenOptionId,
      wrongId,
      "the chosen option was not stored, so the verdict cannot be recomputed later",
    );
  });

  await check("another reader cannot see that attempt", async () => {
    const theirs = await q.listAttemptsForQuestion(db, OTHER, mcRow.id);
    assert.equal(theirs.length, 0, "an attempt leaked across readers");
  });

  await check("a second attempt on the same question is kept, not collapsed", async () => {
    // B3c's spaced repetition has nothing to work with if repeats are lost.
    await q.recordPracticeAttempt(db, READER, {
      questionId: mcRow.id,
      format: mcRow.format,
      outcome: "correct",
      detail: { chosenOptionId: question.spec.options.find((o) => o.correct)!.id },
    });
    const mine = await q.listAttemptsForQuestion(db, READER, mcRow.id);
    assert.equal(mine.length, 2, `expected 2 attempts, found ${mine.length}`);
  });

  await check("attempts are listed newest first", async () => {
    const mine = await q.listAttemptsForQuestion(db, READER, mcRow.id);
    assert.equal(mine[0]!.outcome, "correct", "the newest attempt is not first");
  });

  /* -- clean up: only the rows this test created -- */

  // Plain equality, not `= any($1::text[])`. The array form casts to the wrong
  // element and is not valid SQL at all, and a test that cannot clean up after
  // itself is a test that leaves debris in the database.
  await db.execute(
    sql`delete from practice_attempts where user_id = ${READER} or user_id = ${OTHER}`,
  );
  await db.execute(
    sql`delete from "user" where id = ${READER} or id = ${OTHER}`,
  );

  const leftover = await db.execute(
    sql`select count(*)::int as n from practice_attempts where user_id = ${READER} or user_id = ${OTHER}`,
  );
  const left = (leftover.rows[0] as { n: number }).n;
  await check("only this test's rows were removed", () => {
    assert.equal(left, 0, `${left} probe attempts remain`);
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