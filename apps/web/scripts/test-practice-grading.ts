import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  InvalidPracticeQuestion,
  gradeAnswer,
  outcomeFor,
  parseQuestion,
  publicQuestion,
} from "../src/lib/practice-grading";
import { PRACTICE_QUESTIONS } from "../src/content/practice-questions";

/**
 * GRADING IS DETERMINISTIC, AND THE ANSWER NEVER LEAVES THE SERVER
 * ------------------------------------------------------------------------
 * Two properties, and the second is the one that makes the feature worth
 * anything.
 *
 * 1. DETERMINISTIC. The verdict is a lookup against the stored spec, not a
 *    judgement. There is no model in this path and there will not be one — see
 *    B2 in TODO.md. A grader whose answer can differ between two runs teaches
 *    the student to argue with the tool rather than with the maths, and it
 *    makes the weakness profile in B3a a measurement of noise.
 *
 * 2. NO LEAK. `publicQuestion` is the only thing allowed to reach a browser
 *    before an answer, and it must contain neither the `correct` flags nor the
 *    explanations. The second half is the less obvious one: the explanation for
 *    the CORRECT option explains why that option is right, so shipping
 *    explanations alongside the question reveals the answer just as thoroughly
 *    as shipping the flag would.
 *
 * The leak checks below assert on the SERIALISED payload, not on the object.
 * A field renamed in a way that `in` still finds is exactly the sort of thing
 * that survives a review.
 *
 * Run from apps/web:  npx tsx scripts/test-practice-grading.ts
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
function check(name: string, fn: () => void | Promise<void>): void {
  try {
    fn();
    ok(name);
  } catch (e) {
    bad(`${name} — ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** A real question from the catalogue, so the tests cannot drift from it. */
const mc = PRACTICE_QUESTIONS.find((q) => q.format === "multiple-choice");
if (mc === undefined) {
  console.error("the catalogue has no multiple-choice question to test against");
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 *  1. the payload a browser receives
 * ------------------------------------------------------------------ */

console.log("\nthe payload a browser receives carries no answer");

check("the serialised question contains no `correct` flag", () => {
  const wire = JSON.stringify(publicQuestion(mc));
  assert.ok(!wire.includes('"correct"'), "the wire format still carries a correct flag");
  assert.ok(!wire.includes('"explanation"'), "the wire format still carries explanations");
});

check("no option text mentions that it is correct", () => {
  // A weaker leak than the flag, and the one a careless edit introduces.
  // Authored explanations are allowed to say "correct, because..." — that is
  // the teaching — so this only holds because none are shipped at all.
  const wire = JSON.stringify(publicQuestion(mc));
  assert.ok(
    !/correct,|is correct|the right answer/i.test(wire),
    `an explanation leaked through: ${wire.slice(0, 160)}`,
  );
});

check("every option and the prompt are present", () => {
  const pub = publicQuestion(mc);
  assert.equal(pub.optionCount, mc.spec.options.length);
  assert.equal(pub.prompt, mc.prompt);
  assert.equal(pub.id, mc.id);
  for (const o of mc.spec.options) {
    const found = pub.options.find((p) => p.id === o.id);
    assert.ok(found !== undefined, `option ${o.id} is missing`);
    assert.equal(found.text, o.text, `option ${o.id} text was altered`);
  }
});

check("a public question is not an object with the spec attached", () => {
  // Guards against someone "helpfully" spreading the original question into
  // the response alongside the stripped copy.
  const pub = publicQuestion(mc) as unknown as Record<string, unknown>;
  assert.equal(pub.spec, undefined, "the stripped question still carries its spec");
});

/* ------------------------------------------------------------------ *
 *  2. grading
 * ------------------------------------------------------------------ */

console.log("\ngrading is a lookup, and it is right");

const correctId = mc.spec.options.find((o) => o.correct)!.id;
const wrongId = mc.spec.options.find((o) => !o.correct)!.id;

check("the correct option grades correct", () => {
  const r = gradeAnswer(mc, correctId);
  assert.equal(r.correct, true);
  assert.equal(r.correctOptionId, correctId);
  assert.equal(r.correctExplanation, null, "a correct answer must not repeat the explanation twice");
  assert.equal(r.unrecognised, false);
});

check("a wrong option grades incorrect and explains the misconception", () => {
  const r = gradeAnswer(mc, wrongId);
  assert.equal(r.correct, false);
  assert.equal(r.correctOptionId, correctId, "the reader is told which option was right");
  const wrong = mc.spec.options.find((o) => o.id === wrongId)!;
  assert.equal(r.chosenExplanation, wrong.explanation, "the explanation must be the CHOSEN one's");
  assert.ok(r.correctExplanation !== null, "a miss must also show why the right answer is right");
});

check("the same answer always gives the same verdict", () => {
  for (let i = 0; i < 25; i += 1) {
    const r = gradeAnswer(mc, wrongId);
    assert.equal(r.correct, false, `run ${i + 1} disagreed with the others`);
  }
});

check("grading is independent of the order options are submitted in", () => {
  // The spec order is the authored order and must not affect the outcome.
  const shuffled = { ...mc, spec: { ...mc.spec, options: [...mc.spec.options].reverse() } };
  assert.equal(gradeAnswer(shuffled, correctId).correct, true);
  assert.equal(gradeAnswer(shuffled, wrongId).correct, false);
});

check("outcome maps to exactly correct or incorrect", () => {
  assert.equal(outcomeFor(gradeAnswer(mc, correctId)), "correct");
  assert.equal(outcomeFor(gradeAnswer(mc, wrongId)), "incorrect");
});

/* ------------------------------------------------------------------ *
 *  3. a tampered client
 * ------------------------------------------------------------------ */

console.log("\na modified client gains nothing");

check("the grader's signature has no room for a claimed verdict", () => {
  // Asserted at runtime rather than with `@ts-expect-error`, which is fragile
  // to comment placement and would fail the whole typecheck for the wrong
  // reason if it drifted.
  //
  // The point is that there is nowhere for a client's `{"correct": true}` to
  // bind: `gradeAnswer` takes the question and the chosen option and nothing
  // else. So such a value is not merely ignored at runtime — it is
  // unrepresentable, by the arity as well as by the type.
  assert.equal(
    gradeAnswer.length,
    2,
    `gradeAnswer takes ${gradeAnswer.length} arguments; a third would be a slot for a claimed verdict`,
  );
});

check("a wrong answer is still graded wrong, whatever else was sent", () => {
  // Belt and braces: with the type-level guarantee above, this only has to
  // confirm the runtime behaviour for the two real inputs.
  assert.equal(gradeAnswer(mc, wrongId).correct, false);
  assert.equal(gradeAnswer(mc, correctId).correct, true);
});

check("an unknown option id is a non-answer, not an oracle", () => {
  const r = gradeAnswer(mc, "not-an-option");
  assert.equal(r.correct, false);
  assert.equal(r.unrecognised, true);
  // The response does name the right option, exactly as an ordinary wrong
  // answer does — a reader learns that by answering anyway. What it must NOT
  // do is list the valid ids, which would let someone probe until the error
  // stops and read the answer off the last failure.
  const wire = JSON.stringify(r);
  for (const o of mc.spec.options) {
    if (o.id === r.correctOptionId) continue;
    assert.ok(
      !wire.includes(`"${o.id}"`),
      `the failure response names the valid option "${o.id}" — that is a free oracle`,
    );
  }
});

check("a non-string option id cannot select an option", () => {
  for (const junk of [null, undefined, 42, {}, [], true]) {
    const r = gradeAnswer(mc, junk);
    assert.equal(r.correct, false, `${JSON.stringify(junk)} was accepted`);
    assert.equal(r.unrecognised, true);
  }
});

/* ------------------------------------------------------------------ *
 *  4. a row that fails validation
 *
 *  A spec can be edited by hand in the database, and one bad row must not take
 *  down the page for every reader.
 * ------------------------------------------------------------------ */

console.log("\na malformed stored row is refused, not served");

check("parseQuestion throws InvalidPracticeQuestion on a bad spec", () => {
  const row = {
    id: "broken-1",
    format: "multiple-choice",
    module_code: "MATT101",
    topic_slug: "matt101-limits",
    difficulty: 2,
    prompt: "p",
    tags: ["t"],
    spec: { options: [] }, // too few options
  };
  let threw: unknown = null;
  try {
    parseQuestion(row);
  } catch (e) {
    threw = e;
  }
  assert.ok(threw instanceof InvalidPracticeQuestion, "a bad spec must be refused by name");
  assert.ok((threw as Error).message.includes("broken-1"), "the error must name the question");
});

check("a row claiming two correct options is refused", () => {
  // The authoring schema forbids this, and because the grader imports the SAME
  // schema, a hand-edited row cannot smuggle it past the grader either.
  const spec = structuredClone(mc.spec);
  spec.options[0].correct = true;
  spec.options[1].correct = true;
  let threw = false;
  try {
    parseQuestion({ ...mc, format: "multiple-choice", module_code: "x", moduleCode: "x", spec } as never);
  } catch {
    threw = true;
  }
  assert.ok(threw, "two correct options must be refused");
});

check("publicQuestion fails CLOSED on an unknown format", () => {
  // A future format must ship nothing rather than ship a question whose spec
  // shape this function does not understand.
  let threw = false;
  try {
    publicQuestion({ ...mc, format: "essay" } as never);
  } catch {
    threw = true;
  }
  assert.ok(threw, "an unhandled format must throw rather than render");
});

/* ------------------------------------------------------------------ *
 *  5. the routes, read from source
 * ------------------------------------------------------------------ */

console.log("\nand the routes keep the answers server-side");

const questionsRoute = readFileSync(
  new URL("../src/app/api/practice/questions/route.ts", import.meta.url),
  "utf8",
);
const answerRoute = readFileSync(
  new URL("../src/app/api/practice/answer/route.ts", import.meta.url),
  "utf8",
);

check("the serve route sends questions through publicQuestion", () => {
  assert.ok(
    /publicQuestion\(/.test(questionsRoute),
    "the serve route must use publicQuestion — it is the only stripping there is",
  );
});

check("the serve route never selects the spec directly into its response", () => {
  assert.ok(
    !/questions:\s*rows\b/.test(questionsRoute),
    "the raw rows look like they are being sent unstripped",
  );
});

check("the answer route checks the purchase BEFORE grading", () => {
  const gradeAt = answerRoute.indexOf("gradeAnswer(");
  const checkAt = answerRoute.indexOf("!owned.has(row.module_code)");
  assert.ok(gradeAt > -1 && checkAt > -1, "both must be present");
  assert.ok(
    checkAt < gradeAt,
    "the entitlement check must come before grading — grading is what reveals the answer",
  );
});

check("the answer route loads the question before checking entitlement", () => {
  const loadAt = answerRoute.indexOf("getPracticeQuestionById");
  const checkAt = answerRoute.indexOf("!owned.has(row.module_code)");
  assert.ok(loadAt < checkAt, "the module is on the question, so the check cannot precede the load");
});

check("the answer route never reads a verdict from the request body", () => {
  assert.ok(
    !/body\.(correct|isCorrect|outcome|verdict)/.test(answerRoute),
    "a verdict must not be read from the client",
  );
});

check("the answer route copies format from the row, not the body", () => {
  assert.ok(
    /format:\s*row\.format/.test(answerRoute),
    "format must come from the stored question",
  );
});

check("both routes are session-gated", () => {
  for (const [name, src] of [
    ["questions", questionsRoute],
    ["answer", answerRoute],
  ] as const) {
    const gate = src.indexOf("getSession()");
    const gateNull = src.indexOf("if (!user)");
    assert.ok(gate > -1 && gateNull > gate, `${name} route has no session gate before anything else`);
  }
});

check("both routes are uncached", () => {
  for (const [name, src] of [
    ["questions", questionsRoute],
    ["answer", answerRoute],
  ] as const) {
    assert.ok(/no-store/.test(src), `${name} route must not be cacheable — it is per-reader`);
  }
});

/* ------------------------------------------------------------------ */

console.log(
  failures.length === 0
    ? `\n${passed} passed.`
    : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);