import { practiceCatalogueSchema, type PracticeQuestion } from "@/content/practice-schema";

/*
 * Re-exported rather than duplicated: `test-practice-catalogue.ts` and the
 * importer both reach for the schema through this module, and pointing them at
 * practice-schema.ts directly is a second thing to keep in step.
 */
export { practiceCatalogueSchema, practiceQuestionSchema } from "@/content/practice-schema";
export type { PracticeQuestion } from "@/content/practice-schema";

/**
 * PRACTICE QUESTIONS — the catalogue
 * ------------------------------------------------------------
 * Every question the practice feature can serve, authored here. This
 * file is the single source of truth: the importer reads it, the
 * checker validates it, and nothing writes questions from anywhere else.
 *
 * WHY A FILE AND NOT AN ADMIN UI: the questions are editorial. Someone
 * writes them, and the review that matters is "is this maths correct",
 * which a human does by reading — not through a form. `module-topics.ts`
 * is the same shape for the same reason, and `check-topics.mjs` is the
 * precedent for validating one.
 *
 * THE CATALOGUE IS AUTHORED IN CODE, NOT ADMINISTERED IN THE DATABASE, and
 * that is the decision everything else here rests on. Questions arrive as
 * a pull request: reviewed, diffed, revertible. A database table of
 * hand-typed rows has none of those properties, and an admin UI is a
 * whole product for content that arrives in batches of ten.
 *
 * ------------------------------------------------------------------------
 * IDs ARE STABLE FOREVER. This is the load-bearing property.
 *
 * `id` is hand-authored, never generated, never derived from content. A
 * reader's history is a list of these strings. Renumbering, reordering,
 * re-importing, changing a question's wording, changing its difficulty —
 * none of it may disturb them, because `practice_attempts.question_id`
 * points at these values and a reader who is told they got a question
 * wrong that they never attempted is a bug with no recovery.
 *
 * That is also why the id carries its own topic and format:
 * `matt101-limits-mc-01` says what it is without a lookup. The suffix
 * (`mc` / `ap` / `po`) is a reading convenience, never parsed.
 *
 * EDITING AN EXISTING QUESTION IS FINE. Changing `id` is not — treat it
 * as deleting one question and adding another, which is exactly what it
 * is, and what the reader's history will see.
 * ------------------------------------------------------------------------
 *
 * FEEDBACK IS STAGED, AND STAGE ONE IS DETERMINISTIC.
 *
 * Nothing in this file is graded by a model. Every format carries enough
 * authored information to mark an answer outright:
 *
 *   · multiple-choice  the correct option is named, and so is why each
 *                       WRONG option is wrong — a distractor is a claim
 *                       about what the reader wrongly believes, so naming
 *                       the claim is the teaching
 *   · application       a set of accepted values with tolerances
 *   · proof-order       which pieces belong, and in which order
 *
 * A model may later be asked to explain a miss, opt-in per question. It
 * is never asked to decide whether the answer was right. A grader whose
 * verdict can differ between runs teaches the student to argue with the
 * tool instead of with the maths.
 *
 * ADDING A QUESTION is one entry here. Nothing in the page, the route or
 * the schema needs to change — the format is a discriminant on the row.
 */

/* ------------------------------------------------------------------ *
 *  THE CATALOGUE
 * ------------------------------------------------------------------ */

/**
 * Everything below is real content, written to be marked correct by hand.
 * The distractors are chosen to be things a student plausibly believes,
 * not things that are obviously wrong to anyone — an option that is
 * wrong for no interesting reason tests reading, not understanding.
 *
 * `as const` is NOT used. It would make every literal readonly and narrow,
 * which buys nothing when the value is immediately parsed into a
 * validated type, and costs the ability to pass a plain array in.
 */
const RAW_QUESTIONS = [
  /* ---------------------------------------------------------------- *
   * MATT101 — Limits and continuity
   * ---------------------------------------------------------------- */
  {
    id: "matt101-limits-mc-01",
    format: "multiple-choice",
    moduleCode: "MATT101",
    topicSlug: "matt101-limits",
    difficulty: 1,
    tags: ["limits", "definition", "continuity"],
    prompt:
      "A function f is defined with f(2) = 7, and for every other x, f(x) = x² + 3. " +
      "What is lim(x→2) f(x)?",
    spec: {
      options: [
        {
          id: "a",
          text: "7",
          correct: false,
          explanation:
            "7 is f(2), the VALUE at the point. The limit is about what happens to f(x) as x approaches 2, and it says nothing about f(2) itself — a function can be discontinuous at a point and still have a perfectly good limit there.",
        },
        {
          id: "b",
          text: "It does not exist, because f is not continuous at 2",
          correct: false,
          explanation:
            "Continuity is a property of the function AT a point; a limit is a property of its behaviour AROUND a point. They are different questions, and f here has limit 7 while being discontinuous at 2 — the single most common confusion in the topic.",
        },
        {
          id: "c",
          text: "The value is whatever f(x) is arbitrarily close to 2",
          correct: false,
          explanation:
            "Close to 2 is not the same as close to the limit. f(x) is close to 7, and 7 is what the limit must equal for this to be right — but as written this describes the ARGUMENT rather than answering it.",
        },
        {
          id: "d",
          text: "7, because x² + 3 → 7 as x → 2, regardless of the value at the point",
          correct: true,
          explanation:
            "Correct, and the reasoning is the point: the limit only ever looks at values for x close to 2 but not equal to it. The single exceptional value f(2) = 7 is invisible to it — which is why a removable discontinuity still has a limit.",
        },
        {
          id: "e",
          text: "4 + 3 = 7, but only if you approach from the right",
          correct: false,
          explanation:
            "A two-sided limit requires both directions to agree, and here they do — so the side is irrelevant. The idea that a limit is directional belongs to one-sided limits (x→2⁺ and x→2⁻), which are a separate definition.",
        },
      ],
    },
  },
  {
    id: "matt101-limits-ap-01",
    format: "application",
    moduleCode: "MATT101",
    topicSlug: "matt101-limits",
    difficulty: 3,
    tags: ["limits", "trigonometry", "standard-limit"],
    prompt:
      "Evaluate the following limit. Give your answer as a single number to at least 3 decimal places.\n\n" +
      "lim(x→0)  [ sin(3x) / x ]",
    spec: {
      accepted: [{ value: 3, tolerance: 0.001, relative: false }],
      solution:
        "The standard limit is lim(x→0) sin(x)/x = 1. This question differs from it only in what sits inside the sine.\n\n" +
        "Write it as sin(3x)/x = 3 · [sin(3x)/(3x)].\n\n" +
        "The bracket is the standard limit in disguise: as x → 0 we also have 3x → 0, so sin(3x)/(3x) → 1.\n\n" +
        "Therefore the limit is 3 · 1 = 3.\n\n" +
        "The general form is lim(x→0) sin(kx)/x = k. The factor k in the argument does not change the limit; it scales it.",
    },
  },

  /* ---------------------------------------------------------------- *
   * MATT101 — Reading a derivative into words
   * ---------------------------------------------------------------- */
  {
    id: "matt101-modelling-ap-01",
    format: "application",
    moduleCode: "MATT101",
    topicSlug: "matt101-modelling",
    difficulty: 3,
    tags: ["exponentials", "modelling", "logarithms"],
    prompt:
      "The population of a town is modelled by\n\n" +
      "    N(t) = 1500 · e^(0.08t)\n\n" +
      "where t is measured in years. How many years does it take for the population to reach 3000?\n\n" +
      "Give your answer in years to 2 decimal places.",
    spec: {
      accepted: [{ value: 8.66, tolerance: 0.02, relative: false }],
      units: "years",
      solution:
        "Set the model equal to the target and solve for t.\n\n" +
        "3000 = 1500 · e^(0.08t)\n\n" +
        "Divide both sides by 1500:\n\n" +
        "2 = e^(0.08t)\n\n" +
        "This is 2 written in exponential form. Take logarithms to bring t down:\n\n" +
        "ln 2 = 0.08t\n\n" +
        "t = ln(2) / 0.08 = 0.693147 / 0.08 = 8.664…\n\n" +
        "So the population reaches 3000 after about 8.66 years.\n\n" +
        "Note the structure: doubling time is always ln(2)/k, independent of the starting population. The 1500 cancels entirely.",
    },
  },

  /* ---------------------------------------------------------------- *
   * MAPV111 — Proof techniques
   * ---------------------------------------------------------------- */
  {
    id: "mapv111-proofs-po-01",
    format: "proof-order",
    moduleCode: "MAPV111",
    topicSlug: "mapv111-proofs",
    difficulty: 4,
    tags: ["contradiction", "irrationality", "proof-structure"],
    prompt:
      "These are the lines of a proof that √2 is irrational, along with three lines that do not belong. " +
      "Arrange the ones that belong into the correct order.",
    spec: {
      pieces: [
        {
          id: "assume",
          text: "Suppose √2 is rational. Then √2 = p/q for integers p, q with q ≠ 0 and gcd(p, q) = 1.",
          correct: true,
          position: 0,
        },
        {
          id: "square",
          text: "Squaring both sides gives 2 = p²/q², so p² = 2q².",
          correct: true,
          position: 1,
        },
        {
          id: "peven",
          text: "So p² is even, and therefore p is even.",
          correct: true,
          position: 2,
        },
        {
          id: "qeven",
          text: "Writing p = 2k and substituting gives 4k² = 2q², so q² = 2k², and therefore q is even.",
          correct: true,
          position: 3,
        },
        {
          id: "contradiction",
          text: "Then p and q are both even, contradicting gcd(p, q) = 1.",
          correct: true,
          position: 4,
        },
        {
          id: "conclude",
          text: "The supposition was false, so √2 is irrational.",
          correct: true,
          position: 5,
        },
        /* --- decoys --- */
        {
          id: "decoy-numeric",
          text: "√2 ≈ 1.41421356, which is not a whole number, so √2 is irrational.",
          correct: false,
        },
        {
          id: "decoy-swap",
          text: "Squaring both sides gives 2 = p²/q², so q² = 2p², and therefore q is even.",
          correct: false,
        },
        {
          id: "decoy-reverse",
          text: "The supposition shows √2 is rational, so a rational square root of 2 does exist.",
          correct: false,
        },
      ],
    },
  },
  {
    id: "mapv111-proofs-mc-01",
    format: "multiple-choice",
    moduleCode: "MAPV111",
    topicSlug: "mapv111-proofs",
    difficulty: 2,
    tags: ["direct-proof", "contradiction", "technique-choice"],
    prompt:
      "You need to prove that n² + n is even for every integer n. Which proof structure is most appropriate?",
    spec: {
      options: [
        {
          id: "a",
          text: "Proof by contradiction: assume n² + n is odd, derive a contradiction",
          correct: true,
          explanation:
            "The right technique, because the statement has a clean negation to contradict. More directly: assume n² + n is odd. Then n² and n have opposite parity — but they are either both even or both odd, since an integer's square always has the same parity as the integer. Contradiction.",
        },
        {
          id: "b",
          text: "Proof by induction on n",
          correct: false,
          explanation:
            "Induction works and is not wrong, but it is the heavier tool: it needs a base case and an inductive step for a statement that has a one-line proof. Choosing induction here usually signals not recognising that the simpler structure is available, and on an exam it costs time you may need.",
        },
        {
          id: "c",
          text: "Proof by counterexample: exhibit an n where n² + n is odd",
          correct: false,
          explanation:
            "A counterexample refutes a universal statement, so finding one would DISPROVE the claim. There is no such n — n² + n = n(n + 1) is a product of consecutive integers, so one of them is even. Using counterexample here would mean believing the statement is false.",
        },
        {
          id: "d",
          text: "Proof by contrapositive: show that if n² + n is odd then n is neither integer nor real",
          correct: false,
          explanation:
            "A contrapositive of P → Q is ¬Q → ¬P. Here there is no implication to take apart: the claim is a statement about all integers, not a conditional. This option shows the technique being reached for by name rather than by looking at the problem.",
        },
        {
          id: "e",
          text: "Proof by exhaustion: check every integer from −10 to 10 and note the pattern",
          correct: false,
          explanation:
            "A finite check cannot establish a statement about all integers, no matter how suggestive the pattern looks. The result that a pattern holds everywhere needs an argument, not an extrapolation — that is exactly what induction and contradiction provide.",
        },
      ],
    },
  },

  /* ---------------------------------------------------------------- *
   * MAPV112 — The bisection method
   * ---------------------------------------------------------------- */
  {
    id: "mapv112-bisection-method-ap-01",
    format: "application",
    moduleCode: "MAPV112",
    topicSlug: "mapv112-bisection-method",
    difficulty: 3,
    tags: ["bisection", "iteration", "root-finding"],
    prompt:
      "The bisection method is applied to f(x) = x³ − 8 on the interval [2, 3], starting from that interval.\n\n" +
      "How many iterations are needed to reduce the interval of uncertainty to a width of 0.01 or less?\n\n" +
      "Give your answer as a whole number.",
    spec: {
      accepted: [{ value: 7, tolerance: 0, relative: false }],
      units: "iterations",
      solution:
        "Bisection halves the interval every iteration, so after n iterations the width is\n\n" +
        "    (b − a) / 2ⁿ = (3 − 2) / 2ⁿ = 1 / 2ⁿ\n\n" +
        "We need that to be at most 0.01:\n\n" +
        "    1 / 2ⁿ ≤ 0.01\n" +
        "    2ⁿ ≥ 100\n\n" +
        "Since 2⁶ = 64 and 2⁷ = 128, the first n that works is 7.\n\n" +
        "So 7 iterations are needed. The useful general fact: bisection gains ONE binary digit of precision per iteration, and n iterations guarantee an error below (b − a)/2ⁿ.",
    },
  },

  /* ---------------------------------------------------------------- *
   * STAS101 — Probability and distributions
   * ---------------------------------------------------------------- */
  {
    id: "stas101-probability-mc-01",
    format: "multiple-choice",
    moduleCode: "STAS101",
    topicSlug: "stas101-probability",
    difficulty: 2,
    tags: ["probability", "combinations", "binomial"],
    prompt: "A fair coin is tossed three times. What is the probability of getting exactly two heads?",
    spec: {
      options: [
        {
          id: "a",
          text: "1/2",
          correct: false,
          explanation:
            "1/2 counts the three possible POSITIONS for the single tail, but not which of the eight equally likely sequences each corresponds to. There are 8 sequences in total and 3 favourable ones, so the answer is 3/8 — 1/2 has dropped a factor of three.",
        },
        {
          id: "b",
          text: "3/8",
          correct: true,
          explanation:
            "Correct. Each sequence of three tosses has probability 1/8, and exactly three of them have two heads: HHT, HTH, THH. So 3 × 1/8 = 3/8. Equivalently, C(3,2)·(1/2)³ = 3/8.",
        },
        {
          id: "c",
          text: "1/4",
          correct: false,
          explanation:
            "This is C(3,2)/2⁴ = 3/16 doubled, or more plainly it comes from treating the answer as 'half the time you get two of something' — but three tosses give eight outcomes, not four, so there is no such symmetry to appeal to.",
        },
        {
          id: "d",
          text: "1/8",
          correct: false,
          explanation:
            "1/8 is the probability of one specific sequence, such as HHT. HTH and THH are equally likely and equally correct answers, so this counts only the first arrangement and forgets the other two.",
        },
        {
          id: "e",
          text: "2/3",
          correct: false,
          explanation:
            "2 out of 3 tosses sounds like 2/3, but the tosses are not independent choices about a fixed total of three. Each toss is its own event, and outcomes are counted against 2³ = 8 equally likely sequences, not 3 tosses.",
        },
      ],
    },
  },

  /* ---------------------------------------------------------------- *
   * WRSC111 — Element-wise versus matrix operations
   * ---------------------------------------------------------------- */
  {
    id: "wrsc111-operations-mc-01",
    format: "multiple-choice",
    moduleCode: "WRSC111",
    topicSlug: "wrsc111-operations",
    difficulty: 3,
    tags: ["matrices", "element-wise", "vectorised-operators"],
    prompt:
      "In R, given the 2×2 matrix A = [[1, 2], [3, 4]], what does A^2 compute?",
    spec: {
      options: [
        {
          id: "a",
          text: "[[1, 4], [9, 16]] — every element squared",
          correct: false,
          explanation:
            "That is element-wise squaring, which is what A^2 does in MATLAB and Python/NumPy. R's ^ is a genuine matrix power, so this answer belongs to a different language entirely.",
        },
        {
          id: "b",
          text: "[[7, 10], [15, 22]] — the matrix product A × A",
          correct: true,
          explanation:
            "Correct. R's ^ is matrix exponentiation: (1·1 + 2·3, 1·2 + 2·4; 3·1 + 4·3, 3·2 + 4·4) = (7, 10; 15, 22). Note R uses %*% for multiplication, but ^ raises to a power and treats the argument as a matrix.",
        },
        {
          id: "c",
          text: "[[2, 4], [6, 8]] — every element multiplied by 2",
          correct: false,
          explanation:
            "This is A * 2, a scalar multiplication. It is what you get by confusing squaring with doubling, and it is not what any exponentiation operator computes.",
        },
        {
          id: "d",
          text: "An error — R does not support matrix powers",
          correct: false,
          explanation:
            "R's ^ works on matrices directly. The error you are probably remembering is that A^2 on a non-square matrix raises a non-conformable arguments error, because a matrix power needs a square base — but a 2×2 matrix is square, so it succeeds.",
        },
        {
          id: "e",
          text: "[[1, 2], [3, 4]] — unchanged, because squaring a matrix is not meaningful",
          correct: false,
          explanation:
            "Matrix powers are perfectly meaningful and are the basis of exponential methods for differential equations. Returning A unchanged is what you would get from a function that forgot to perform the multiplication.",
        },
      ],
    },
  },

  /* ---------------------------------------------------------------- *
   * WRFV102 — TCP and UDP
   * ---------------------------------------------------------------- */
  {
    id: "wrfv102-transport-mc-01",
    format: "multiple-choice",
    moduleCode: "WRFV102",
    topicSlug: "wrfv102-transport",
    difficulty: 2,
    tags: ["tcp", "udp", "transport-layer", "reliability"],
    prompt:
      "A video call drops frames constantly on a congested link, but a file transfer over the same link must not " +
      "deliver a corrupted byte. Which transport protocol suits each, and why?",
    spec: {
      options: [
        {
          id: "a",
          text: "UDP for both — TCP's reliability features are unnecessary overhead",
          correct: false,
          explanation:
            "Correct about video, wrong about the file. Without TCP's guarantees the transfer would deliver data in the wrong order or duplicated, which is worse than corruption: the file would be silently wrong rather than visibly broken.",
        },
        {
          id: "b",
          text: "UDP for video, TCP for the file — a late frame is worthless, a reordered byte is not",
          correct: true,
          explanation:
            "Correct. TCP retransmits and blocks until ordered delivery is guaranteed, which on a congested link converts loss into latency. For video, a frame that arrives after its moment has passed is worthless, so dropping it is preferable to waiting. For a file, ordering and completeness are the whole requirement.",
        },
        {
          id: "c",
          text: "TCP for both — reliability is always preferable",
          correct: false,
          explanation:
            "TCP's guarantee is paid for in latency, and for real-time media that is the wrong currency. Head-of-line blocking means one lost segment stalls every segment behind it, so a congested link turns into freeze-then-catch-up rather than smooth degradation.",
        },
        {
          id: "d",
          text: "UDP for video, UDP for the file, with the application doing its own checksums",
          correct: false,
          explanation:
            "Checksums detect corruption but do not recover from loss or enforce order. An application can add reliability on top of UDP, and QUIC does exactly this — but then it has rebuilt TCP, at which point the question is whether that was worth it.",
        },
        {
          id: "e",
          text: "TCP for video, UDP for the file — TCP is always reliable",
          correct: false,
          explanation:
            "Exactly reversed. TCP's reliability is what makes it right for the file and wrong for the video, because reliable delivery that arrives too late has no value to a live stream.",
        },
      ],
    },
  },

  /* ---------------------------------------------------------------- *
   * MATT102 — Improper integrals
   * ---------------------------------------------------------------- */
  {
    id: "matt102-improper-mc-01",
    format: "multiple-choice",
    moduleCode: "MATT102",
    topicSlug: "matt102-improper",
    difficulty: 3,
    tags: ["improper-integrals", "convergence", "comparison-test"],
    prompt: "The integral ∫₁^∞ (1/x²) dx is improper. What is its value?",
    spec: {
      options: [
        {
          id: "a",
          text: "It diverges, because the interval is unbounded",
          correct: false,
          explanation:
            "An unbounded interval does not force divergence — that is the entire reason improper integrals are defined by a limit. Here the integrand decays fast enough (1/x², p = 2 > 1) that the limit is finite.",
        },
        {
          id: "b",
          text: "It equals 1",
          correct: true,
          explanation:
            "Correct. ∫₁^∞ 1/x² dx = lim(b→∞) [-1/x]₁^b = lim(b→∞) (-1/b + 1) = 1. The p-integral rule is the shortcut: ∫₁^∞ x^(−p) converges exactly when p > 1.",
        },
        {
          id: "c",
          text: "It diverges, because 1/x² never reaches zero",
          correct: false,
          explanation:
            "Reaching zero is not a requirement. Plenty of divergent integrands do reach zero, and plenty of convergent ones never do. What matters is how quickly the function approaches zero compared with how fast the interval grows.",
        },
        {
          id: "d",
          text: "It equals 0",
          correct: false,
          explanation:
            "This confuses the limit of the antiderivative with its value. The antiderivative −1/x approaches 0 as b → ∞, but the definite integral is the DIFFERENCE −1/b − (−1/1) = 1, not the limit of the antiderivative alone.",
        },
        {
          id: "e",
          text: "It equals 1/2",
          correct: false,
          explanation:
            "1/2 would be the value of ∫₁^∞ 1/x dx's exponent applied wrongly, or a confusion with the antiderivative evaluated at a single point. The power matters: for exponent −2 the integral converges to 1/(2−1) = 1.",
        },
      ],
    },
  },

  /* ---------------------------------------------------------------- *
   * WRAV101 — Types and conversion
   * ---------------------------------------------------------------- */
  {
    id: "wrav101-types-mc-01",
    format: "multiple-choice",
    moduleCode: "WRAV101",
    topicSlug: "wrav101-types",
    difficulty: 2,
    tags: ["types", "casting", "integer-division"],
    prompt:
      "In C#, what does the following expression evaluate to?\n\n    int a = 7;\n    int b = 2;\n    double x = a / b;",
    spec: {
      options: [
        {
          id: "a",
          text: "3.5",
          correct: false,
          explanation:
            "This is the intended answer, and the code does not produce it. The division happens between two ints, so C# performs integer division, which truncates toward zero: 7 / 2 is 3. The widening to double happens afterwards, turning 3 into 3.0.",
        },
        {
          id: "b",
          text: "3.0",
          correct: true,
          explanation:
            "Correct. a / b is evaluated first, and both operands are int, so integer division truncates to 3. Only then is that int converted to double for the assignment. To get 3.5, write (double)a / b.",
        },
        {
          id: "c",
          text: "4",
          correct: false,
          explanation:
            "4 is the result of ROUNDING 3.5 to the nearest integer. C# truncates toward zero rather than rounding — for negative results the difference is even starker, since -7 / 2 is -3 in C# but -4 under round-half-away-from-zero.",
        },
        {
          id: "d",
          text: "A compile-time error, because an int cannot be assigned to a double implicitly",
          correct: false,
          explanation:
            "The assignment is fine — int converts implicitly to double, and that conversion is lossless. The error you may be thinking of is the opposite direction, assigning a double to an int without a cast.",
        },
        {
          id: "e",
          text: "It depends on the platform, because integer division is unspecified",
          correct: false,
          explanation:
            "C# specifies integer division exactly: it truncates toward zero, on every platform. Languages that leave this to the hardware, such as JavaScript and Java, are the ones where the result of 7/2 on negative operands varies — this is not one of them.",
        },
      ],
    },
  },
] as const satisfies ReadonlyArray<PracticeQuestion>;

/**
 * THE CATALOGUE, validated at module load.
 *
 * Deliberately not a plain export: a malformed question throws HERE,
 * which means it fails the build, rather than throwing at grade time and
 * costing a reader marks. The importer cannot bypass this either —
 * importing this module IS the parse, so there is no path by which
 * unvalidated content reaches the database.
 */
export const PRACTICE_QUESTIONS: ReadonlyArray<PracticeQuestion> =
  practiceCatalogueSchema.parse(RAW_QUESTIONS);
