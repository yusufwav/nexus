/**
 * THE PRACTICE QUESTION SCHEMA
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/content/practice-schema.ts
 *
 * The web app validates questions with zod. A React Native bundle does not
 * need a schema library, so the SAME invariants are enforced by hand here.
 * Every rule below is the web app's rule, word for word where the rule is
 * about the content rather than about the library.
 *
 * WHY THIS FILE EXISTS AT ALL, AND WHY IT IS NOT "JUST A TYPE"
 * ---------------------------------------------------------------------------
 * A question's `spec` is editable data. If the grader validated against its
 * own copy of the rules, a question the authoring schema would have
 * rejected — two correct options, a proof with a gap in its positions, a
 * decoy carrying a true position — would be served to a reader and graded by
 * code that had never heard of those rules.
 *
 * Importing ONE schema means a spec can only reach a reader if it satisfies
 * exactly the constraints the author was held to.
 *
 * Nothing here is grading logic: it is shape and correctness invariants only.
 * `lib/practice-grading.ts` owns what happens next.
 */

/* ------------------------------------------------------------------ *
 *  SHARED FIELDS
 * ------------------------------------------------------------------ */

/** Format codes, as they appear in an id. Never parsed — read for humans. */
export const FORMAT_TAG = {
  "multiple-choice": "mc",
  application: "ap",
  "proof-order": "po",
} as const;

export type QuestionFormat = keyof typeof FORMAT_TAG;

/** The validated shape of one question. */
export type PracticeQuestion =
  | MultipleChoiceQuestion
  | ApplicationQuestion
  | ProofOrderQuestion;

export type MultipleChoiceOption = {
  readonly id: string;
  readonly text: string;
  readonly correct: boolean;
  /**
   * REQUIRED ON EVERY OPTION, including the correct one.
   *
   * This is the whole reason to choose multiple choice first: a distractor
   * is a claim about what the reader wrongly believes, so explaining it
   * names the misconception rather than just marking the answer wrong.
   */
  readonly explanation: string;
};

export type MultipleChoiceSpec = {
  readonly options: ReadonlyArray<MultipleChoiceOption>;
};

export type MultipleChoiceQuestion = {
  readonly id: string;
  readonly format: "multiple-choice";
  readonly moduleCode: string;
  readonly topicSlug: string;
  readonly difficulty: number;
  readonly tags: ReadonlyArray<string>;
  readonly prompt: string;
  readonly spec: MultipleChoiceSpec;
};

export type AcceptedValue = {
  readonly value: number;
  /**
   * Non-negative. ZERO IS VALID AND MEANS EXACT MATCH, which is the right
   * answer for a question whose result is a whole number.
   */
  readonly tolerance: number;
  /** Relative-or-absolute is decided by `relative`; both are authored, never guessed. */
  readonly relative: boolean;
};

export type ApplicationSpec = {
  /** Every accepted final answer, each with its own tolerance. */
  readonly accepted: ReadonlyArray<AcceptedValue>;
  /** Units, shown next to the answer box. Not graded — it is a label. */
  readonly units?: string;
  /** THE FULL WORKED SOLUTION, and the part that actually teaches. */
  readonly solution: string;
};

export type ApplicationQuestion = {
  readonly id: string;
  readonly format: "application";
  readonly moduleCode: string;
  readonly topicSlug: string;
  readonly difficulty: number;
  readonly tags: ReadonlyArray<string>;
  readonly prompt: string;
  readonly spec: ApplicationSpec;
};

export type ProofPiece = {
  readonly id: string;
  readonly text: string;
  readonly correct: boolean;
  /**
   * 0-based index in the canonical proof. Required on every correct piece
   * and forbidden on every decoy — a decoy has no true position.
   */
  readonly position?: number;
};

export type ProofOrderSpec = {
  readonly pieces: ReadonlyArray<ProofPiece>;
};

export type ProofOrderQuestion = {
  readonly id: string;
  readonly format: "proof-order";
  readonly moduleCode: string;
  readonly topicSlug: string;
  readonly difficulty: number;
  readonly tags: ReadonlyArray<string>;
  readonly prompt: string;
  readonly spec: ProofOrderSpec;
};

/** The unvalidated shape, as it is authored. */
export type RawQuestion = {
  readonly id: string;
  readonly format: string;
  readonly moduleCode: string;
  readonly topicSlug: string;
  readonly difficulty: number;
  readonly tags: ReadonlyArray<string>;
  readonly prompt: string;
  readonly spec: unknown;
};

/* ------------------------------------------------------------------ *
 *  THE RULES
 * ------------------------------------------------------------------ */

/**
 * A lowercase, dash-separated identifier.
 *
 * The charset is restricted rather than merely non-empty because these end up
 * in URLs and in stored history, and a space or a slash in either is a bug
 * that surfaces much later and somewhere else.
 */
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** NMU course code. Matches the shape `modules.code` uses. */
const MODULE_CODE_RE = /^[A-Z]{4}\d{3}$/;

/**
 * Difficulty, 1 to 4. Deliberately four values, not ten.
 *
 *   1  the definition itself
 *   2  one step of working
 *   3  multi-step, or choosing the right method
 *   4  stretch — unseen, or needing a step the reader must derive
 */
const DIFFICULTY_MIN = 1;
const DIFFICULTY_MAX = 4;

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

function nonEmptyString(v: unknown, what: string): string {
  if (!isString(v) || v.length === 0) fail(`${what} must be a non-empty string`);
  return v;
}

function parseShared(raw: RawQuestion): {
  id: string;
  moduleCode: string;
  topicSlug: string;
  difficulty: number;
  tags: ReadonlyArray<string>;
  prompt: string;
} {
  const id = nonEmptyString(raw.id, "id");
  if (!ID_RE.test(id)) fail("ids are lowercase and dash-separated");
  const moduleCode = nonEmptyString(raw.moduleCode, "moduleCode");
  if (!MODULE_CODE_RE.test(moduleCode)) fail("moduleCode is not a course code, e.g. MATT101");
  const topicSlug = nonEmptyString(raw.topicSlug, "topicSlug");
  const difficulty = raw.difficulty;
  if (
    typeof difficulty !== "number" ||
    !Number.isInteger(difficulty) ||
    difficulty < DIFFICULTY_MIN ||
    difficulty > DIFFICULTY_MAX
  ) {
    fail(`difficulty must be an integer from ${DIFFICULTY_MIN} to ${DIFFICULTY_MAX}`);
  }
  if (!Array.isArray(raw.tags) || raw.tags.length < 1) {
    fail("tags must have at least one entry");
  }
  const tags = raw.tags.map((t) => nonEmptyString(t, "tag"));
  const prompt = nonEmptyString(raw.prompt, "prompt");
  return { id, moduleCode, topicSlug, difficulty, tags, prompt };
}

function parseMultipleChoice(spec: unknown): MultipleChoiceSpec {
  if (typeof spec !== "object" || spec === null) fail("spec must be an object");
  const options = (spec as { options?: unknown }).options;
  if (!Array.isArray(options)) fail("spec.options must be an array");
  if (options.length < 4 || options.length > 5) {
    fail(`spec.options must have 4 or 5 entries, found ${options.length}`);
  }
  const parsed: MultipleChoiceOption[] = [];
  const ids = new Set<string>();
  for (const raw of options) {
    if (typeof raw !== "object" || raw === null) fail("each option must be an object");
    const o = raw as Record<string, unknown>;
    const id = nonEmptyString(o.id, "option id");
    if (ids.has(id)) fail(`duplicate option id "${id}" — options are graded by id`);
    ids.add(id);
    const text = nonEmptyString(o.text, "option text");
    if (typeof o.correct !== "boolean") fail("option.correct must be a boolean");
    const explanation = nonEmptyString(o.explanation, "option explanation");
    parsed.push({ id, text, correct: o.correct, explanation });
  }
  const correct = parsed.filter((o) => o.correct);
  if (correct.length !== 1) {
    fail(`exactly one option must be correct, found ${correct.length}`);
  }
  const texts = new Map<string, number>();
  for (const o of parsed) texts.set(o.text, (texts.get(o.text) ?? 0) + 1);
  for (const [text, n] of texts) {
    if (n > 1) {
      fail(
        `"${text.slice(0, 40)}" appears ${n} times — identical options cannot be told apart`,
      );
    }
  }
  return { options: parsed };
}

function parseApplication(spec: unknown): ApplicationSpec {
  if (typeof spec !== "object" || spec === null) fail("spec must be an object");
  const s = spec as Record<string, unknown>;
  const accepted = s.accepted;
  if (!Array.isArray(accepted) || accepted.length < 1) {
    fail("spec.accepted must have at least one entry");
  }
  const parsedAccepted: AcceptedValue[] = [];
  const values = new Set<number>();
  for (const raw of accepted) {
    if (typeof raw !== "object" || raw === null) fail("each accepted value must be an object");
    const a = raw as Record<string, unknown>;
    if (typeof a.value !== "number" || !Number.isFinite(a.value)) {
      fail("accepted.value must be a finite number");
    }
    if (typeof a.tolerance !== "number" || a.tolerance < 0) {
      fail("accepted.tolerance must be a non-negative number");
    }
    if (values.has(a.value)) fail("the same value is listed twice — one tolerance is enough");
    values.add(a.value);
    parsedAccepted.push({
      value: a.value,
      tolerance: a.tolerance,
      relative: a.relative === true,
    });
  }
  const units = s.units === undefined ? undefined : nonEmptyString(s.units, "spec.units");
  const solution = nonEmptyString(s.solution, "spec.solution");
  return units === undefined
    ? { accepted: parsedAccepted, solution }
    : { accepted: parsedAccepted, units, solution };
}

function parseProofOrder(spec: unknown): ProofOrderSpec {
  if (typeof spec !== "object" || spec === null) fail("spec must be an object");
  const pieces = (spec as { pieces?: unknown }).pieces;
  if (!Array.isArray(pieces) || pieces.length < 3) {
    fail("spec.pieces must have at least three entries");
  }
  const parsed: ProofPiece[] = [];
  const ids = new Set<string>();
  for (const raw of pieces) {
    if (typeof raw !== "object" || raw === null) fail("each piece must be an object");
    const p = raw as Record<string, unknown>;
    const id = nonEmptyString(p.id, "piece id");
    if (ids.has(id)) fail(`duplicate piece id "${id}"`);
    ids.add(id);
    const text = nonEmptyString(p.text, "piece text");
    if (typeof p.correct !== "boolean") fail("piece.correct must be a boolean");
    const position = p.position;
    if (position !== undefined) {
      if (typeof position !== "number" || !Number.isInteger(position) || position < 0) {
        fail("piece.position must be a non-negative integer");
      }
    }
    parsed.push(
      position === undefined
        ? { id, text, correct: p.correct }
        : { id, text, correct: p.correct, position },
    );
  }
  const correct = parsed.filter((p) => p.correct);
  if (correct.length < 2) {
    fail("a proof needs at least two correct pieces to be an ordering at all");
  }
  const decoys = parsed.filter((p) => !p.correct);
  if (decoys.length < 1) {
    fail(
      "no decoy pieces — the reader could succeed by elimination without knowing the proof",
    );
  }
  const positions = correct.map((p) => p.position ?? 0).sort((a, b) => a - b);
  const expected = correct.map((_, i) => i);
  if (
    positions.length !== correct.length ||
    positions.some((p, i) => p !== expected[i])
  ) {
    fail(
      `correct pieces must carry positions 0..${correct.length - 1} exactly once each; found [${positions.join(", ")}]`,
    );
  }
  for (const p of decoys) {
    if (p.position !== undefined) {
      fail(`decoy "${p.id}" carries position ${p.position} — a decoy has no true position`);
    }
  }
  return { pieces: parsed };
}

/**
 * Parse one authored question into a validated question.
 *
 * Throws on the first violated invariant, with a message that names the rule
 * that was broken.
 */
export function parsePracticeQuestion(raw: RawQuestion): PracticeQuestion {
  const shared = parseShared(raw);
  switch (raw.format) {
    case "multiple-choice":
      return { ...shared, format: "multiple-choice", spec: parseMultipleChoice(raw.spec) };
    case "application":
      return { ...shared, format: "application", spec: parseApplication(raw.spec) };
    case "proof-order":
      return { ...shared, format: "proof-order", spec: parseProofOrder(raw.spec) };
    default:
      return fail(`unknown question format "${raw.format}"`);
  }
}
