/**
 * MODULE CONTENT
 * ------------------------------------------------------------
 * The lesson plan for a written module. MATT101 is the only one
 * populated; every other code renders the "coming soon" state, which
 * is deliberate rather than a 404 — the module is announced and
 * priced, it just does not exist yet.
 *
 * The shape is here so filling in the next module is a data change,
 * not a page rewrite.
 */

export type Lesson = {
  readonly n: number;
  readonly title: string;
  readonly body: string;
  /** Short bullets under the body. */
  readonly points?: ReadonlyArray<string>;
  /** An optional worked example, rendered on the syntax palette. */
  readonly example?: {
    readonly caption: string;
    readonly lines: ReadonlyArray<string>;
  };
};

export type ModuleContent = {
  readonly overview: ReadonlyArray<string>;
  readonly outcomes: ReadonlyArray<string>;
  readonly lessons: ReadonlyArray<Lesson>;
  readonly prerequisites: ReadonlyArray<string>;
};

export const MODULE_CONTENT: Readonly<Record<string, ModuleContent>> = {
  MATT101: {
    overview: [
      "This is the module everyone starts from, and the one most people quietly struggle with. The notes here are built around a single idea: calculus is not a set of formulas to memorise, it is a description of how one quantity depends on another.",
      "Every section starts from the picture and only then reaches for the notation, because the notation is a compression of the picture. If you can draw what a derivative means, the algebra afterwards is bookkeeping.",
    ],
    outcomes: [
      "Read and write limit notation with confidence, including one-sided limits.",
      "Differentiate the standard functions without a table of rules.",
      "Use the chain rule on nested functions, which is where most marks are lost.",
      "Model a real quantity with a derivative and interpret the result in words.",
    ],
    prerequisites: [
      "Algebra to the level of manipulating fractions and indices",
      "Familiarity with graphs of straight lines and simple quadratics",
      "No prior calculus assumed — that is the point of the module",
    ],
    lessons: [
      {
        n: 1,
        title: "What a limit actually is",
        body: "A limit is a question about approach, not substitution. Asking what f(2) is when the formula breaks at 2 sends you down the wrong path entirely; asking what f(x) is doing as x drifts toward 2 from both sides is the right one. The value at the point and the behaviour near the point are separate questions, and almost every confusion in this module comes from conflating them.",
        points: [
          "Left-hand and right-hand limits must agree for the limit to exist",
          "A function can have a limit at a point it is not defined at",
          "The limit is about the neighbourhood, not the point itself",
        ],
      },
      {
        n: 2,
        title: "The derivative as a rate of change",
        body: "Differentiation answers one question: at this exact moment, how fast is this quantity moving, and in which direction? The formal definition looks intimidating, but it is a rate of change with the interval shrunk to nothing. Once that reading lands, the limit laws stop being a list of rules and become bookkeeping for adding and scaling rates.",
        points: [
          "Slope of the tangent, not the average slope over a whole interval",
          "The derivative is itself a function, so it can be differentiated again",
          "Units matter — the derivative of position is velocity, of velocity is acceleration",
        ],
        example: {
          caption: "from average rate to instantaneous rate",
          lines: [
            "f(x)     = x^2",
            "",
            "avg rate = [ f(x+h) - f(x) ] / h",
            "         = [ (x+h)^2 - x^2 ] / h",
            "         = [ 2xh + h^2 ] / h",
            "         = 2x + h          <- h is still finite",
            "",
            "f'(x)    = lim(h->0) 2x + h",
            "         = 2x              <- h vanishes",
          ],
        },
      },
      {
        n: 3,
        title: "The power, product and quotient rules",
        body: "These three cover most of what you will meet in the first semester. The power rule falls out of the binomial expansion; the product and quotient rules are consequences of the limit laws rather than rules to memorise on faith. Learning them as consequences means you can reconstruct them under exam pressure.",
        points: [
          "d/dx(x^n) = n·x^(n-1), for any real n",
          "Product: differentiate each part, keep the other, add the results",
          "Quotient: low d-high minus high d-low, over low squared",
        ],
      },
      {
        n: 4,
        title: "The chain rule",
        body: "This is the one that catches everyone, and the reason it catches people is that the notation hides what is happening. When one function sits inside another, you differentiate the outside function and leave the inside untouched, then multiply by the derivative of the inside. That is the whole rule.",
        points: [
          "Differentiate the outside, treat the inside as a constant",
          "Multiply by the derivative of the inside",
          "If the function is nested three deep, apply the rule three times",
        ],
        example: {
          caption: "f(x) = 5·(x^3)^2, differentiated",
          lines: [
            "f(x)  = 5 · (x^3)^2",
            "",
            "f'(x) = 5 · 2(x^3) · 3x^2",
            "      = 10x^3 · 3x^2",
            "      = 30x^5",
          ],
        },
      },
      {
        n: 5,
        title: "Higher derivatives and curvature",
        body: "The second derivative measures how the first is changing, which is what tells you whether a stationary point is a maximum or a minimum. There is a shortcut worth knowing: if the first derivative is zero at a point and the second derivative is negative there, you are standing on a maximum.",
        points: [
          "f'(x) = 0 marks a candidate stationary point",
          "f''(x) < 0 is a maximum, f''(x) > 0 is a minimum",
          "f'' = 0 is inconclusive — the test has failed, not the point",
        ],
      },
      {
        n: 6,
        title: "Reading a derivative back into words",
        body: "The step that separates a student who can differentiate from a student who understands calculus. A derivative is a number with a unit and a sign, and the exam question is almost always asking you to say what that number means about the underlying situation.",
        points: [
          "Sign tells you direction, magnitude tells you how fast",
          "Units survive differentiation and should be stated",
          "At a minimum the gradient is zero and the sign flips across it",
        ],
      },
    ],
  },
};

/** The content for a code, or null when the module is not written yet. */
export function contentFor(code: string): ModuleContent | null {
  return MODULE_CONTENT[code] ?? null;
}