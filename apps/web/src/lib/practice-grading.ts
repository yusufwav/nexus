import {
  practiceQuestionSchema,
  type PracticeQuestion,
} from "@/content/practice-schema";

/**
 * PRACTICE GRADING
 * ------------------------------------------------------------
 * Pure functions. No database, no session, no network, no clock. That is the
 * whole design and it is not incidental: grading is the one thing in this
 * feature that must give the same answer every time, and the cheapest way to
 * guarantee that is for it to have nothing to disagree about.
 *
 * ------------------------------------------------------------------------
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 *
 * A question's `spec` names which option is correct, and that name must never
 * reach a browser before the reader has answered.
 *
 * The obvious implementation serves the whole row to the client and grades
 * there, which would be faster and would hand every answer to anyone who opens
 * devtools. The rest of this feature is built on the assumption that a reader
 * has not seen the answers, so that their practice is worth anything at all —
 * and B3's weakness profile would be measuring a test everyone had already
 * passed.
 *
 * So the split is:
 *
 *   toPublicQuestion()   strips `correct` AND every explanation.
 *   gradeAnswer()        runs server-side and returns the verdict.
 *
 * Explanations are stripped too, and that is the less obvious half. The
 * explanation for the CORRECT option necessarily begins by explaining why that
 * option is right, so shipping explanations alongside the question reveals the
 * answer just as thoroughly as shipping the `correct` flag would.
 *
 * ------------------------------------------------------------------------
 * THE GRADER DOES NOT TRUST THE CLIENT
 *
 * `gradeAnswer` takes the chosen option's ID, never a claimed verdict. A
 * request body saying `{"correct": true}` is ignored entirely, because the
 * only question worth asking is which option they picked -- and the correct
 * option is decided here, from the stored spec.
 *
 * An option ID that is not in the spec is treated as a non-answer rather than
 * an error, and deliberately reveals nothing about which option is right. A
 * rejected id would otherwise be a free oracle: probe until the response stops
 * complaining and the answer is in the last error message.
 */

export type { PracticeQuestion };

/** What a question looks like before it has been answered. */
export type PublicQuestion = {
  readonly id: string;
  readonly format: PracticeQuestion["format"];
  readonly moduleCode: string;
  readonly topicSlug: string;
  readonly difficulty: number;
  readonly tags: ReadonlyArray<string>;
  readonly prompt: string;
  /** Options with no `correct` flag and no explanation. */
  readonly options: ReadonlyArray<{ readonly id: string; readonly text: string }>;
  /** How many options there are, which the UI needs for "2 of 5". */
  readonly optionCount: number;
};

/** What the reader is told after answering. */
export type GradeResult = {
  readonly questionId: string;
  readonly correct: boolean;
  readonly chosenOptionId: string;
  readonly correctOptionId: string;
  /** The option's own text, so the UI can show what was chosen. */
  readonly chosenOptionText: string | null;
  /**
   * Why the chosen option is right or wrong. This is the whole point of the
   * format: a distractor is a claim about what the reader wrongly believes,
   * so naming it is the teaching.
   */
  readonly chosenExplanation: string;
  /** Present only on a miss, so the reader is not handed the answer twice. */
  readonly correctExplanation: string | null;
  readonly correctOptionText: string;
  /**
   * True when the submitted option ID matched nothing in the spec.
   *
   * Recorded as an incorrect attempt rather than rejected, so a client that
   * sends nonsense is visible in the history instead of silently doing nothing.
   */
  readonly unrecognised: boolean;
};

/**
 * A stored question that failed validation.
 *
 * Carried rather than thrown at the caller: one malformed row in the catalogue
 * must not take down the whole practice page for every reader. The question is
 * skipped, and the reason is logged once with its id.
 */
export class InvalidPracticeQuestion extends Error {
  constructor(
    readonly questionId: string,
    readonly detail: string,
  ) {
    super(`practice question "${questionId}" is invalid: ${detail}`);
    this.name = "InvalidPracticeQuestion";
  }
}

/**
 * Parse a row from `practice_questions` into a validated question.
 *
 * THE SAME SCHEMA THE AUTHOR WROTE AGAINST, which is the point of extracting
 * it. A hand-edited jsonb spec that would have been rejected at authoring time
 * is rejected here too, rather than being served to a reader and graded by
 * code that never heard of those rules.
 */
export function parseQuestion(row: {
  id: string;
  format: string;
  module_code: string;
  topic_slug: string;
  difficulty: number;
  prompt: string;
  tags: ReadonlyArray<string>;
  spec: unknown;
}): PracticeQuestion {
  const parsed = practiceQuestionSchema.safeParse({
    id: row.id,
    format: row.format,
    moduleCode: row.module_code,
    topicSlug: row.topic_slug,
    difficulty: row.difficulty,
    tags: row.tags,
    prompt: row.prompt,
    spec: row.spec,
  });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new InvalidPracticeQuestion(
      row.id,
      first ? `${first.path.join(".")}: ${first.message}` : "unknown",
    );
  }
  return parsed.data;
}

/**
 * Strip a question down to what may be sent before it is answered.
 *
 * The `correct` flags go, and so do the explanations — see the note at the top
 * of this file. `publicQuestion` is the ONLY way a question should reach a
 * client, so that rule has exactly one implementation to get right.
 */
export function publicQuestion(question: PracticeQuestion): PublicQuestion {
  if (question.format !== "multiple-choice") {
    // Deliberately total rather than throwing: this is the function that
    // decides what a browser sees, and a future format must fail CLOSED --
    // shipping nothing -- not open, by rendering a question whose spec shape
    // this function does not understand.
    throw new Error(`publicQuestion does not handle format "${question.format}"`);
  }

  const options = question.spec.options.map((o) => ({ id: o.id, text: o.text }));

  return {
    id: question.id,
    format: question.format,
    moduleCode: question.moduleCode,
    topicSlug: question.topicSlug,
    difficulty: question.difficulty,
    tags: [...question.tags],
    prompt: question.prompt,
    options,
    optionCount: options.length,
  };
}

/**
 * Grade a multiple-choice answer.
 *
 * Deterministic by construction: the verdict is a lookup, not a judgement.
 * There is no model in this path and there will not be one — see B2 in
 * TODO.md. A grader whose answer can differ between two runs teaches the
 * student to argue with the tool rather than with the maths.
 */
export function gradeAnswer(
  question: PracticeQuestion,
  chosenOptionId: unknown,
): GradeResult {
  if (question.format !== "multiple-choice") {
    throw new Error(`gradeAnswer does not handle format "${question.format}"`);
  }

  const correct = question.spec.options.find((o) => o.correct);
  // Unreachable for a parsed question — the schema enforces exactly one — but
  // the type is `| undefined` and pretending otherwise would put a
  // non-null assertion on the load-bearing line of the grader.
  if (correct === undefined) {
    throw new InvalidPracticeQuestion(question.id, "no option is marked correct");
  }

  const chosen =
    typeof chosenOptionId === "string"
      ? question.spec.options.find((o) => o.id === chosenOptionId)
      : undefined;

  if (chosen === undefined) {
    // An unknown or absent id is a non-answer. It scores as incorrect and
    // reveals nothing beyond what an ordinary wrong answer would: the reader
    // learns which option was right, which they would have learned anyway by
    // answering. It is NOT an error response, because an error that named the
    // valid ids would be a free oracle.
    return {
      questionId: question.id,
      correct: false,
      chosenOptionId: typeof chosenOptionId === "string" ? chosenOptionId : "",
      correctOptionId: correct.id,
      chosenOptionText: null,
      chosenExplanation:
        "That answer did not match any of the options. Pick one of the listed choices to see why it is right or wrong.",
      correctExplanation: correct.explanation,
      correctOptionText: correct.text,
      unrecognised: true,
    };
  }

  const isCorrect = chosen.id === correct.id;

  return {
    questionId: question.id,
    correct: isCorrect,
    chosenOptionId: chosen.id,
    correctOptionId: correct.id,
    chosenOptionText: chosen.text,
    // On a correct answer the chosen option IS the correct one, so its own
    // explanation is the answer explanation and the second field stays null.
    // Showing both would repeat the same paragraph twice.
    chosenExplanation: chosen.explanation,
    correctExplanation: isCorrect ? null : correct.explanation,
    correctOptionText: correct.text,
    unrecognised: false,
  };
}

/**
 * The outcome to store.
 *
 * `partial` exists for proof-order and is unreachable from multiple choice on
 * purpose: there is no partial credit on a single-answer question, and
 * inventing some would make the weakness profile in B3a mean something vaguer
 * than it should.
 */
export function outcomeFor(result: GradeResult): "correct" | "incorrect" {
  return result.correct ? "correct" : "incorrect";
}