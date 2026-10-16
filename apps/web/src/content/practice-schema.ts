import { z } from "zod";

/**
 * THE PRACTICE QUESTION SCHEMA
 * ------------------------------------------------------------
 * Extracted from `practice-questions.ts` so the AUTHORING file and the
 * GRADING file validate against one definition rather than two that drift.
 *
 * This matters more than it looks. A question's `spec` lives in a jsonb
 * column that a person can edit by hand, that an import can write, and that a
 * future migration can reshape. If the grader validated against its own copy
 * of the rules, a row the authoring schema would have rejected -- two correct
 * options, a proof with a gap in its positions, a decoy carrying a true
 * position -- would be served to a reader and graded by code that had never
 * heard of those rules.
 *
 * Importing ONE schema means a spec can only reach a reader if it satisfies
 * exactly the constraints the author was held to.
 *
 * The rules themselves, and why each exists, are documented where they are
 * defined below. Nothing here is grading logic: it is shape and correctness
 * invariants only. `lib/practice-grading.ts` owns what happens next.
 */
/* ------------------------------------------------------------------ *
 *  SHARED FIELDS
 * ------------------------------------------------------------------ */

/** Format codes, as they appear in an id. Never parsed â€” read for humans. */
const FORMAT_TAG = {
  "multiple-choice": "mc",
  application: "ap",
  "proof-order": "po",
} as const;

/**
 * A lowercase, dash-separated identifier.
 *
 * The charset is restricted rather than merely non-empty because these end
 * up in URLs and in stored history, and a space or a slash in either is a
 * bug that surfaces much later and somewhere else.
 */
const Id = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "ids are lowercase and dash-separated");

/** NMU course code. Matches the shape `modules.code` uses. */
const ModuleCode = z.string().regex(/^[A-Z]{4}\d{3}$/, "e.g. MATT101");

/**
 * Difficulty, 1 to 4. Deliberately four values, not ten: an author asked
 * to rate 1-10 invents the difference between 6 and 7, and the number
 * that gets invented is the one the reader sees as precision.
 *
 *   1  the definition itself
 *   2  one step of working
 *   3  multi-step, or choosing the right method
 *   4  stretch â€” unseen, or needing a step the reader must derive
 */
const Difficulty = z.number().int().min(1).max(4);

const shared = {
  id: Id,
  moduleCode: ModuleCode,
  /** Must exist in `MODULE_TOPICS`. Checked there, not here: this file cannot import it. */
  topicSlug: z.string().min(1),
  difficulty: Difficulty,
  /** At least one. These drive the weakness profile in B3a, and an untagged question is invisible to it. */
  tags: z.array(z.string().min(1)).min(1),
  prompt: z.string().min(1),
};

/* ------------------------------------------------------------------ *
 *  FORMAT 1 â€” MULTIPLE CHOICE
 * ------------------------------------------------------------------ */

const optionSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  correct: z.boolean(),
  /**
   * REQUIRED ON EVERY OPTION, including the correct one.
   *
   * This is the whole reason to choose multiple choice first: a distractor
   * is a claim about what the reader wrongly believes, so explaining it
   * names the misconception rather than just marking the answer wrong. An
   * option with no explanation is a guess the reader cannot learn from,
   * which makes the format no better than a coin toss with a score.
   */
  explanation: z.string().min(1),
});

const multipleChoiceSpec = z.object({
  options: z.array(optionSchema).min(4).max(5),
});

const multipleChoiceQuestion = z
  .object({
    ...shared,
    format: z.literal("multiple-choice"),
    spec: multipleChoiceSpec,
  })
  .superRefine((q, ctx) => {
    const opts = q.spec.options;

    const ids = new Set<string>();
    for (const o of opts) {
      if (ids.has(o.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["spec", "options"],
          message: `duplicate option id "${o.id}" â€” options are graded by id`,
        });
      }
      ids.add(o.id);
    }

    const correct = opts.filter((o) => o.correct);
    if (correct.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["spec", "options"],
        message: `exactly one option must be correct, found ${correct.length}`,
      });
    }

    // Two identical option texts cannot be graded: the reader cannot tell
    // which they chose, and one of them is a dead option that looks live.
    const texts = new Map<string, number>();
    for (const o of opts) texts.set(o.text, (texts.get(o.text) ?? 0) + 1);
    for (const [text, n] of texts) {
      if (n > 1) {
        ctx.addIssue({
          code: "custom",
          path: ["spec", "options"],
          message: `"${text.slice(0, 40)}" appears ${n} times â€” identical options cannot be told apart`,
        });
      }
    }
  });

/* ------------------------------------------------------------------ *
 *  FORMAT 2 â€” APPLICATION
 * ------------------------------------------------------------------ */

const applicationSpec = z.object({
  /**
   * Every accepted final answer, each with its own tolerance.
   *
   * A list rather than a single value because a question with one right
   * answer that reads as several (a value in two units, a sign the author
   * did not anticipate) is a question that marks correct work wrong. Each
   * entry may carry its own tolerance because "within 1%" and "within 0.5"
   * are different demands and the question should say which.
   */
  accepted: z
    .array(
      z.object({
        value: z.number().finite(),
        /**
         * Non-negative. ZERO IS VALID AND MEANS EXACT MATCH, which is the
         * right answer for a question whose result is a whole number â€” an
         * iteration count or a small integer has no meaningful "close
         * enough", and pretending otherwise would mark 7 right and 6.9999
         * wrong while looking precise.
         *
         * Negative is refused, because it is always an authoring slip and
         * silently behaving as exact match would hide it.
         */
        tolerance: z.number().min(0),
        /** Relative-or-absolute is decided by `relative`; both are authored, never guessed. */
        relative: z.boolean().default(false),
      }),
    )
    .min(1),
  /** Units, shown next to the answer box. Not graded â€” it is a label. */
  units: z.string().min(1).optional(),
  /**
   * THE FULL WORKED SOLUTION, and the part that actually teaches.
   *
   * Not a mark scheme. A worked example transfers to the next question; a
   * number of marks does not. It is shown on a miss, before any model is
   * involved, because the reader should see the reasoning whether or not
   * they go on to ask about their own attempt.
   */
  solution: z.string().min(1),
});

const applicationQuestion = z
  .object({
    ...shared,
    format: z.literal("application"),
    spec: applicationSpec,
  })
  .superRefine((q, ctx) => {
    const values = new Set(q.spec.accepted.map((a) => a.value));
    if (values.size !== q.spec.accepted.length) {
      ctx.addIssue({
        code: "custom",
        path: ["spec", "accepted"],
        message: "the same value is listed twice â€” one tolerance is enough",
      });
    }
  });

/* ------------------------------------------------------------------ *
 *  FORMAT 3 â€” PROOF ORDER
 * ------------------------------------------------------------------ */

/**
 * ONE LINE OF A PROOF.
 *
 * The reader is not asked to type a proof. They are not asked anything
 * resembling one. This format exists because the blocker on checking
 * proofs was never the grading â€” it was the INPUT. Nobody types LaTeX.
 * They type `2x+3(4` with mismatched brackets, or three words that are a
 * third of the way to the idea, and every character of that is a
 * defensible reading of what they meant. So the question is never posed
 * as free text: the argument is dealt out in pieces and the reader
 * assembles it, which is something a student can actually do and a
 * better test of understanding than transcribing one.
 */
const pieceSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  correct: z.boolean(),
  /**
   * 0-based index in the canonical proof. Required on every correct piece
   * and forbidden on every decoy â€” a decoy has no true position, and
   * giving it one would mean grading "did they find the author's
   * arrangement" rather than "did they reconstruct the argument".
   */
  position: z.number().int().min(0).optional(),
});

const proofOrderSpec = z.object({
  pieces: z.array(pieceSchema).min(3),
});

const proofOrderQuestion = z
  .object({
    ...shared,
    format: z.literal("proof-order"),
    spec: proofOrderSpec,
  })
  .superRefine((q, ctx) => {
    const pieces = q.spec.pieces;

    const ids = new Set<string>();
    for (const p of pieces) {
      if (ids.has(p.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["spec", "pieces"],
          message: `duplicate piece id "${p.id}"`,
        });
      }
      ids.add(p.id);
    }

    const correct = pieces.filter((p) => p.correct);
    if (correct.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["spec", "pieces"],
        message: "a proof needs at least two correct pieces to be an ordering at all",
      });
    }

    // The decoys are what make this a question rather than a copying
    // exercise. Without one the reader can succeed by elimination alone,
    // which tests nothing about whether they know the argument.
    const decoys = pieces.filter((p) => !p.correct);
    if (decoys.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["spec", "pieces"],
        message: "no decoy pieces â€” the reader could succeed by elimination without knowing the proof",
      });
    }

    // Positions must be exactly 0..n-1 with no gaps or repeats, or the
    // canonical order is not well defined and "right position" is a lie.
    const positions = correct.map((p) => p.position).sort((a, b) => (a ?? 0) - (b ?? 0));
    const expected = correct.map((_, i) => i);
    if (positions.length !== correct.length || positions.some((p, i) => p !== expected[i])) {
      ctx.addIssue({
        code: "custom",
        path: ["spec", "pieces"],
        message: `correct pieces must carry positions 0..${correct.length - 1} exactly once each; found [${positions.join(", ")}]`,
      });
    }

    for (const p of decoys) {
      if (p.position !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["spec", "pieces"],
          message: `decoy "${p.id}" carries position ${p.position} â€” a decoy has no true position`,
        });
      }
    }
  });

/* ------------------------------------------------------------------ *
 *  THE UNION
 * ------------------------------------------------------------------ */

export const practiceQuestionSchema = z.discriminatedUnion("format", [
  multipleChoiceQuestion,
  applicationQuestion,
  proofOrderQuestion,
]);

export const practiceCatalogueSchema = z.array(practiceQuestionSchema);

/**
 * The validated shape of one question.
 *
 * Exported from here so that authoring, importing and GRADING all name the same
 * type. A second declaration anywhere else would be allowed to drift, and the
 * drift would only show up as a reader being graded by rules the author never
 * met.
 */
export type PracticeQuestion = z.infer<typeof practiceQuestionSchema>;

/** The per-format payload, for callers that need the shape without the union. */
export type MultipleChoiceSpec = Extract<PracticeQuestion, { format: "multiple-choice" }>["spec"];
export type ApplicationSpec = Extract<PracticeQuestion, { format: "application" }>["spec"];
export type ProofOrderSpec = Extract<PracticeQuestion, { format: "proof-order" }>["spec"];

/** Id suffix for a format, for authors writing new entries. */
export const formatTag = FORMAT_TAG;

