import { PRACTICE_QUESTIONS, practiceCatalogueSchema } from "../src/content/practice-questions";

/**
 * THE CATALOGUE PARSES, AND REFUSES TO PARSE GARBAGE
 * ------------------------------------------------------------------------
 * The catalogue is validated by zod at module load. That single decision
 * does a lot of work: a malformed question fails the build instead of
 * costing a reader marks at grade time, and there is no path by which
 * unvalidated content reaches the database, because importing the module
 * IS the parse.
 *
 * So this asserts both directions, which is the only way to know the
 * validation is real:
 *
 *   1. The real catalogue loads. If the schemas were wrong, this fails
 *      and the whole app fails to boot.
 *   2. Deliberately broken questions are REJECTED. A validator that only
 *      ever accepts is indistinguishable from no validator, and it would
 *      pass every assertion below.
 *
 * Every case here corresponds to a mistake that is easy to make when
 * authoring, and each one produces a WRONG GRADE rather than a crash —
 * which is why they are worth a permanent assertion:
 *
 *   · two correct options    -> nothing can be marked wrong
 *   · an option with no explanation -> the misconception goes unnamed,
 *                                     which is the whole value of the format
 *   · duplicate option ids    -> grading by id becomes ambiguous
 *   · two identical options   -> the reader cannot tell which they picked
 *   · missing decoy in a proof -> answerable by elimination, tests nothing
 *   · gapped proof positions  -> "correct order" stops being well defined
 *   · a decoy WITH a position -> grading "the author's arrangement", not
 *                                the argument
 *
 * Run from apps/web:  npx tsx scripts/test-practice-catalogue.ts
 */

/* ------------------------------------------------------------------ *
 *  harness
 * ------------------------------------------------------------------ */

let passed = 0;
const failures: string[] = [];

function ok(name: string): void {
  passed += 1;
  console.log(`  ok   ${name}`);
}

function bad(name: string, detail: string): void {
  failures.push(`${name} — ${detail}`);
  console.log(`  FAIL ${name}`);
  console.log(`       ${detail}`);
}

function check(name: string, fn: () => void): void {
  try {
    fn();
    ok(name);
  } catch (e) {
    bad(name, e instanceof Error ? e.message : String(e));
  }
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

/* ------------------------------------------------------------------ *
 *  1. the real catalogue loads
 * ------------------------------------------------------------------ */

console.log("\nthe authored catalogue validates");

check("every question parsed", () => {
  assert(PRACTICE_QUESTIONS.length > 0, "catalogue is empty");
  console.log(`       ${PRACTICE_QUESTIONS.length} questions`);
});

check("all three formats are represented", () => {
  const formats = new Set(PRACTICE_QUESTIONS.map((q) => q.format));
  for (const want of ["multiple-choice", "application", "proof-order"]) {
    assert(formats.has(want as never), `no question uses format "${want}"`);
  }
});

check("ids are unique across the catalogue", () => {
  const seen = new Set<string>();
  const dupes: string[] = [];
  for (const q of PRACTICE_QUESTIONS) {
    if (seen.has(q.id)) dupes.push(q.id);
    seen.add(q.id);
  }
  assert(dupes.length === 0, `duplicate ids: ${dupes.join(", ")}`);
});

check("every difficulty is 1-4 and both ends are used", () => {
  const levels = new Set(PRACTICE_QUESTIONS.map((q) => q.difficulty));
  assert(levels.has(1), "nothing is marked difficulty 1");
  assert(levels.has(4), "nothing is marked difficulty 4");
  for (const q of PRACTICE_QUESTIONS) {
    assert(
      q.difficulty >= 1 && q.difficulty <= 4,
      `${q.id} has difficulty ${q.difficulty}, outside 1-4`,
    );
  }
});

check("every question carries at least one tag", () => {
  // B3a's weakness profile is driven entirely by these. An untagged
  // question is invisible to it, so this is a functional requirement and
  // not a tidiness one.
  for (const q of PRACTICE_QUESTIONS) {
    assert(q.tags.length > 0, `${q.id} has no tags`);
  }
});

/* ------------------------------------------------------------------ *
 *  2. deliberately broken questions are REJECTED
 *
 *  The important half. If any of these were accepted, a real authoring
 *  mistake would ship and produce wrong marks silently.
 * ------------------------------------------------------------------ */

console.log("\nbroken questions are refused at import");

/** A known-good multiple-choice question, to mutate. */
function goodMc(): Record<string, unknown> {
  return {
    id: "test-mc-01",
    format: "multiple-choice",
    moduleCode: "TEST101",
    topicSlug: "test-topic",
    difficulty: 2,
    tags: ["t"],
    prompt: "pick one",
    spec: {
      options: [
        { id: "a", text: "one", correct: true, explanation: "because" },
        { id: "b", text: "two", correct: false, explanation: "not this" },
        { id: "c", text: "three", correct: false, explanation: "nor this" },
        { id: "d", text: "four", correct: false, explanation: "nor that" },
      ],
    },
  };
}

/** A known-good proof-order question, to mutate. */
function goodProof(): Record<string, unknown> {
  return {
    id: "test-po-01",
    format: "proof-order",
    moduleCode: "TEST101",
    topicSlug: "test-topic",
    difficulty: 3,
    tags: ["t"],
    prompt: "order these",
    spec: {
      pieces: [
        { id: "p1", text: "first", correct: true, position: 0 },
        { id: "p2", text: "second", correct: true, position: 1 },
        { id: "d1", text: "decoy", correct: false },
      ],
    },
  };
}

/** A known-good application question, to mutate. */
function goodApp(): Record<string, unknown> {
  return {
    id: "test-ap-01",
    format: "application",
    moduleCode: "TEST101",
    topicSlug: "test-topic",
    difficulty: 2,
    tags: ["t"],
    prompt: "compute",
    spec: {
      accepted: [{ value: 4, tolerance: 0.01, relative: false }],
      solution: "the working",
    },
  };
}

/**
 * Parse one mutated question and require the schema to REJECT it.
 *
 * Synchronous rather than re-importing the module per case: the module
 * caches, so a dynamic import would return the same already-validated
 * catalogue and silently pass every case below. Going through the
 * exported schema directly is what actually exercises the rules.
 */
function rejects(
  name: string,
  mutate: (q: Record<string, unknown>) => void,
  build: () => Record<string, unknown>,
): void {
  const q = build();
  mutate(q);
  const parsed = practiceCatalogueSchema.safeParse([q]);
  if (parsed.success) {
    bad(name, "the catalogue ACCEPTED a broken question");
  } else {
    ok(`${name} — refused: ${parsed.error.issues[0]?.message ?? "?"}`);
  }
}

type MutatingCase = readonly [
  name: string,
  mutate: (q: Record<string, unknown>) => void,
  build: () => Record<string, unknown>,
];

const mcCases: ReadonlyArray<MutatingCase> = [
  [
    "two correct options",
    (q) => {
      (q.spec as { options: Array<{ correct: boolean }> }).options[1]!.correct = true;
    },
    goodMc,
  ],
  [
    "an option with no explanation",
    (q) => {
      delete (q.spec as { options: Array<Record<string, unknown>> }).options[1]!.explanation;
    },
    goodMc,
  ],
  [
    "an empty explanation",
    (q) => {
      (q.spec as { options: Array<Record<string, unknown>> }).options[1]!.explanation = "";
    },
    goodMc,
  ],
  [
    "duplicate option ids",
    (q) => {
      (q.spec as { options: Array<{ id: string }> }).options[1]!.id = "a";
    },
    goodMc,
  ],
  [
    "two identical option texts",
    (q) => {
      (q.spec as { options: Array<{ text: string }> }).options[1]!.text = "one";
    },
    goodMc,
  ],
  [
    "only three options",
    (q) => {
      (q.spec as { options: unknown[] }).options.pop();
    },
    goodMc,
  ],
  [
    "an id that is not url-safe",
    (q) => {
      q.id = "Test MC 01";
    },
    goodMc,
  ],
  [
    "a malformed module code",
    (q) => {
      q.moduleCode = "MATT1";
    },
    goodMc,
  ],
  [
    "a difficulty of 0",
    (q) => {
      q.difficulty = 0;
    },
    goodMc,
  ],
  [
    "a difficulty of 5",
    (q) => {
      q.difficulty = 5;
    },
    goodMc,
  ],
  [
    "no tags",
    (q) => {
      q.tags = [];
    },
    goodMc,
  ],
];

for (const [name, mutate, build] of mcCases) {
  rejects(name, mutate, build);
}

const proofCases: ReadonlyArray<MutatingCase> = [
  [
    "a proof with no decoy",
    (q) => {
      (q.spec as { pieces: Array<{ correct: boolean }> }).pieces.pop();
    },
    goodProof,
  ],
  [
    "proof positions with a gap",
    (q) => {
      (q.spec as { pieces: Array<{ position?: number }> }).pieces[1]!.position = 3;
    },
    goodProof,
  ],
  [
    "duplicate proof positions",
    (q) => {
      (q.spec as { pieces: Array<{ position?: number }> }).pieces[1]!.position = 0;
    },
    goodProof,
  ],
  [
    "a decoy carrying a position",
    (q) => {
      (q.spec as { pieces: Array<Record<string, unknown>> }).pieces[2]!.position = 2;
    },
    goodProof,
  ],
  [
    "a proof with one correct piece",
    (q) => {
      (q.spec as { pieces: Array<{ correct: boolean }> }).pieces[1]!.correct = false;
    },
    goodProof,
  ],
  [
    "duplicate piece ids",
    (q) => {
      (q.spec as { pieces: Array<{ id: string }> }).pieces[2]!.id = "p1";
    },
    goodProof,
  ],
];

for (const [name, mutate, build] of proofCases) {
  rejects(name, mutate, build);
}

const appCases: ReadonlyArray<MutatingCase> = [
  [
    "no accepted answers",
    (q) => {
      (q.spec as { accepted: unknown[] }).accepted = [];
    },
    goodApp,
  ],
  [
    "a negative tolerance",
    (q) => {
      (q.spec as { accepted: Array<{ tolerance: number }> }).accepted[0]!.tolerance = -0.01;
    },
    goodApp,
  ],
  [
    "an empty solution",
    (q) => {
      (q.spec as { solution: string }).solution = "";
    },
    goodApp,
  ],
  [
    "a non-finite accepted value",
    (q) => {
      (q.spec as { accepted: Array<{ value: number }> }).accepted[0]!.value = Number.POSITIVE_INFINITY;
    },
    goodApp,
  ],
  [
    "the same accepted value twice",
    (q) => {
      (q.spec as { accepted: unknown[] }).accepted = [
        { value: 4, tolerance: 0.01, relative: false },
        { value: 4, tolerance: 0.02, relative: false },
      ];
    },
    goodApp,
  ],
];

for (const [name, mutate, build] of appCases) {
  rejects(name, mutate, build);
}

/* ------------------------------------------------------------------ *
 *  3. tolerance arithmetic — the actual grading rule
 *
 *  Not a schema concern, but it belongs here rather than in the route:
 *  an application question's grade IS this comparison, and it is the one
 *  piece of deterministic grading in the feature that can be wrong in a
 *  way no schema would catch.
 * ------------------------------------------------------------------ */

console.log("\nthe tolerance rule does what the docs claim");

/** Absolute or relative, as EMBEDDING-style tolerances are meant to work. */
function withinTolerance(given: number, accepted: number, tolerance: number, relative: boolean): boolean {
  const gap = Math.abs(given - accepted);
  return relative ? gap <= Math.abs(accepted) * tolerance : gap <= tolerance;
}

check("an exact answer is inside an absolute tolerance", () => {
  assert(withinTolerance(3, 3, 0.001, false), "exact answer rejected");
});

check("an answer within tolerance is accepted", () => {
  assert(withinTolerance(3.0009, 3, 0.001, false), "in-tolerance answer rejected");
});

check("an answer outside tolerance is refused", () => {
  assert(!withinTolerance(3.01, 3, 0.001, false), "out-of-tolerance answer accepted");
});

check("relative tolerance scales with the answer", () => {
  // The same absolute gap of 0.5, against two different answers, both at
  // 1% relative tolerance. On 100 the allowance is 1.0 and 0.5 fits; on 1
  // the allowance is 0.01 and the same 0.5 is ten times too big. That is
  // the whole reason `relative` exists: one fixed absolute tolerance
  // cannot be simultaneously sensible for a population count and a rate.
  assert(withinTolerance(100.5, 100, 0.01, true), "relative tolerance too tight on a large answer");
  assert(!withinTolerance(1.5, 1, 0.01, true), "relative tolerance too loose on a small answer");
});

check("tolerance is symmetric", () => {
  assert(
    withinTolerance(2.999, 3, 0.001, false) === withinTolerance(3.001, 3, 0.001, false),
    "above and below behave differently",
  );
});

/* ------------------------------------------------------------------ *
 *  4. the canonical comparison the importer relies on
 *
 *  The importer must tell "this question changed" from "this question is
 *  identical", and it compares against values read back out of a jsonb
 *  column. Postgres reorders object keys on storage, so a plain
 *  JSON.stringify comparison reports an unchanged question as edited —
 *  forever, on every run. That is not a cosmetic bug: it means a weekly
 *  catalogue import rewrites rows that never changed, and the importer's
 *  own report of what it did is wrong.
 * ------------------------------------------------------------------ */

console.log("\nthe canonical comparison does not invent changes");

/** Verbatim from apps/web/scripts/import-practice-questions.ts. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

check("key order does not make two equal objects look different", () => {
  const stored = { accepted: [{ value: 7, relative: false, tolerance: 0 }], solution: "s", units: "u" };
  const authored = { accepted: [{ tolerance: 0, value: 7, relative: false }], solution: "s", units: "u" };
  assert(canonical(stored) === canonical(authored), "identical objects compared unequal");
});

check("nested key order is normalised too", () => {
  const a = { spec: { options: [{ id: "a", text: "x", correct: true }] } };
  const b = { spec: { options: [{ correct: true, text: "x", id: "a" }] } };
  assert(canonical(a) === canonical(b), "nested objects compared unequal");
});

check("a genuine change is still detected", () => {
  const stored = { solution: "s", accepted: [{ value: 7, tolerance: 0 }] };
  const edited = { solution: "s", accepted: [{ value: 8, tolerance: 0 }] };
  assert(canonical(stored) !== canonical(edited), "a real edit compared equal");
});

check("ARRAY order is data and is never normalised away", () => {
  // Proof pieces and answer options are ordered. Reordering them is a real
  // change to the question, so this must NOT compare equal.
  const a = { pieces: [{ id: "p1", text: "first" }, { id: "p2", text: "second" }] };
  const b = { pieces: [{ id: "p2", text: "second" }, { id: "p1", text: "first" }] };
  assert(canonical(a) !== canonical(b), "reordered arrays compared equal — proof order would be unchangeable");
});

check("a missing key is distinguished from a key set to undefined", () => {
  assert(canonical({ a: 1 }) === canonical({ a: 1, b: undefined }), "undefined should be dropped, matching JSON");
  assert(canonical({ a: 1 }) !== canonical({ a: 1, b: null }), "null is a value and must not be dropped");
});

/* ------------------------------------------------------------------ *
 *  report
 * ------------------------------------------------------------------ */

console.log(
  failures.length === 0
    ? `\n${passed} passed.`
    : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);