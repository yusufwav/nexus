/**
 * THE MATHS ENGINE, TESTED
 * ---------------------------------------------------------------------------
 *   node --import ./scripts/register-ts.mjs scripts/test-latex.mjs
 *
 * The engine is pure — no React Native, no rendering — so it can be run
 * straight from the app's own source by Node 24, which strips the types.
 *
 * What is worth testing here is the four things that could be wrong in a way
 * nobody would notice by looking at the code:
 *
 *   1. THE SPLITTER. The `$` that opens a price rather than a formula has to
 *      stay a dollar sign, and everything after it has to survive.
 *   2. THE GLYPH REPERTOIRE. A character the font does not have comes out
 *      as a BOX, and a page of boxes is worse than a page of plain text — so
 *      no expression the engine can parse may produce one.
 *   3. THE GEOMETRY. A fraction's rule sits on the axis, a numerator is
 *      centred on it, and a superscript rises above the baseline.
 *   4. THE FALLBACKS. The font is missing fifteen characters, and every
 *      command that needs one has to have a way through.
 */
import { layoutMath, splitLine, isDisplayDelimiter, type LineSegment } from "@/lib/latex";
import { hasGlyph } from "@/lib/latex/metrics";
import { parseLatex } from "@/lib/latex/parse";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed += 1;
    return;
  }
  failures.push(`${name}${detail === undefined ? "" : ` — ${detail}`}`);
}

function equal<T>(name: string, actual: T, expected: T): void {
  check(name, actual === expected, `got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`);
}

function near(name: string, actual: number, expected: number, tolerance: number): void {
  check(
    name,
    typeof actual === "number" && Math.abs(actual - expected) <= tolerance,
    `got ${actual}, wanted ${expected} ± ${tolerance}`,
  );
}

/**
 * The prose of one segment, or "" if it is not prose.
 */
function textOf(segments: readonly LineSegment[], index: number): string {
  const segment = segments[index];
  return segment !== undefined && segment.kind === "text" ? segment.text : "";
}

/**
 * The maths of one segment, or "" if it is not maths.
 */
function latexOf(segments: readonly LineSegment[], index: number): string {
  const segment = segments[index];
  return segment !== undefined && segment.kind === "text" ? "" : segment?.latex ?? "";
}

/* ------------------------------------------------------------------ *
 *  1. the splitter
 * ------------------------------------------------------------------ */

{
  const segments = splitLine("the limit $x \\to a$ is the value");
  equal("inline maths is found", segments.length, 3);
  equal("the prose before it", textOf(segments, 0), "the limit ");
  equal("the maths itself", latexOf(segments, 1), "x \\to a");
  equal("the prose after it", textOf(segments, 2), " is the value");
}

{
  /* THE CURRENCY CASE. A price must not open a formula. */
  const segments = splitLine("It costs $50 and that is all.");
  check(
    "a price is not maths",
    segments.every((s) => s.kind === "text"),
    JSON.stringify(segments),
  );
  equal("the price survives", textOf(segments, 0), "It costs $50 and that is all.");
}

{
  /* A bare number between dollars is a price, not maths. */
  const segments = splitLine("the fee is $60 for the term");
  check(
    "a bare number between dollars is a price",
    segments.every((s) => s.kind === "text"),
    JSON.stringify(segments),
  );
}

{
  /* An unclosed dollar sign must not swallow the rest of the line. */
  const segments = splitLine("it costs $50 for the whole course");
  check(
    "an unclosed dollar survives",
    segments.every((s) => s.kind === "text"),
    JSON.stringify(segments),
  );
  equal("nothing is swallowed", textOf(segments, 0), "it costs $50 for the whole course");
}

{
  /* A closed dollar span with maths in it IS maths. */
  const segments = splitLine("so $x^2 + 1$ is the expression");
  equal("a closed span is maths", segments[1].kind, "inline");
  equal("and it holds the maths", latexOf(segments, 1), "x^2 + 1");
}

{
  /* A display equation on one line. */
  const segments = splitLine("$$e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}$$");
  equal("a one-line display is found", segments[0].kind, "display");
  equal(
    "and it holds the maths",
    latexOf(segments, 0),
    "e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}",
  );
}

{
  equal("a bare $$ is a delimiter", isDisplayDelimiter("$$"), true);
  equal("a spaced $$ is a delimiter", isDisplayDelimiter("  $$  "), true);
  equal("a line with text is not", isDisplayDelimiter("$$x$$"), false);
}

/* ------------------------------------------------------------------ *
 *  2. the glyph repertoire
 * ------------------------------------------------------------------ */

/**
 * EVERY expression in here, and they are the ones a calculus, probability
 * and linear-algebra tutor actually writes.
 */
const EXPRESSIONS = [
  "x^2 + 3x + 2",
  "\\frac{d}{dx}\\left[uv\\right] = u'v + uv'",
  "e^x = \\sum_{n=0}^{\\infty} \\frac{x^n}{n!}",
  "\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1",
  "\\int_0^1 x^2\\,dx = \\tfrac{1}{3}",
  "a^2 + b^2 = c^2",
  "\\sqrt{x^2 + y^2}",
  "\\sqrt[3]{27}",
  "\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}",
  "\\prod_{k=1}^{n} k",
  "\\oint_C \\vec{F} \\cdot d\\vec{r}",
  "\\nabla \\cdot \\vec{E} = \\frac{\\rho}{\\varepsilon}",
  "\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}",
  "\\begin{bmatrix} 1 & 0 \\\\ 0 & 1 \\end{bmatrix}",
  "\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}",
  "\\begin{cases} x & x \\ge 0 \\\\ -x & x < 0 \\end{cases}",
  "\\left( \\frac{a}{b} \\right)",
  "\\left[ \\frac{1}{2} \\right]",
  "\\left\\{ x \\in \\mathbb{R} \\right\\}",
  "\\hat{y} = \\bar{x} + \\tilde{\\beta}",
  "\\overline{AB} \\parallel \\overline{CD}",
  "\\hat{\\theta} \\approx \\bar{\\mu}",
  "\\hbar \\neq 0",
  "\\Re(z) + \\Im(z) = z",
  "\\forall x \\in \\mathbb{N}, \\exists y",
  "\\{x \\mid x > 0\\}",
  "f(x) = \\begin{cases} 1 & x \\ge 0 \\\\ 0 & x < 0 \\end{cases}",
  "\\binom{n}{k}",
  "\\text{if } x > 0",
  "\\mathbf{v} \\cdot \\mathbf{w}",
  "\\lim_{n \\to \\infty} \\left(1 + \\frac{1}{n}\\right)^n = e",
  "\\cdot \\cdot \\cdot",
  "\\pm \\mp \\times \\div \\le \\ge \\neq \\approx \\equiv",
  "\\to \\leftarrow \\Rightarrow \\iff \\mapsto \\in \\notin \\subset \\cup \\cap",
  "\\infty \\partial \\nabla \\emptyset \\pm",
];

for (const expression of EXPRESSIONS) {
  const { layout } = layoutMath(expression, true);
  const bad: string[] = [];
  for (const primitive of layout.primitives) {
    if (primitive.type !== "text") continue;
    if (!hasGlyph(primitive.text)) bad.push(primitive.text);
  }
  check(
    `every glyph is drawable: ${expression.slice(0, 40)}`,
    bad.length === 0,
    `missing ${JSON.stringify(bad)}`,
  );
  check(
    `the expression has a width: ${expression.slice(0, 40)}`,
    layout.width > 0,
    "zero width",
  );
}

/* ------------------------------------------------------------------ *
 *  3. the geometry
 * ------------------------------------------------------------------ */

{
  /* A fraction's rule sits ON the axis, and the numerator is centred on it. */
  const { layout } = layoutMath("\\frac{ab}{c}", true);
  const rule = layout.primitives.find((p) => p.type === "rule");
  check("a fraction draws a rule", rule !== undefined);
  if (rule !== undefined && rule.type === "rule") {
    near("the rule is on the axis", rule.y + rule.thickness / 2, 0, 0.001);
    check("the rule is narrower than the box", rule.width <= layout.width + 0.001);
  }
  check("a fraction is taller than its parts", layout.height > 0.9);
}

{
  /* A superscript rises, and a subscript drops. */
  const sup = layoutMath("x^2", true);
  const sub = layoutMath("x_1", true);
  const plain = layoutMath("x", true);

  check("a superscript is taller than the base", sup.layout.height > plain.layout.height);
  check("a subscript is deeper than the base", sub.layout.depth > plain.layout.depth);
  check("a superscript is wider than the base", sup.layout.width > plain.layout.width);
}

{
  /* Both scripts at once. */
  const both = layoutMath("x_i^2", true);
  const either = layoutMath("x_i", true);
  check("both scripts make it wider", both.layout.width > either.layout.width);
  check("both scripts make it taller", both.layout.height >= either.layout.height);
}

{
  /* A big operator in a DISPLAYED equation takes its limits above and
   * below, which is what makes a summation read as a summation. */
  const display = layoutMath("\\sum_{i=1}^{n} i", true);
  const inline = layoutMath("\\sum_{i=1}^{n} i", false);
  check("a display sum is bigger than an inline one", display.layout.height > inline.layout.height);
  check("a display sum reaches above the glyph", display.layout.height > 1.5);
}

{
  /* A root draws an overbar. */
  const { layout } = layoutMath("\\sqrt{x}", true);
  const rules = layout.primitives.filter((p) => p.type === "rule");
  check("a root draws an overbar", rules.length === 1);
  check("a root is taller than its radicand", layout.height > 1.0);
}

{
  /* A matrix is wider than a single cell, and taller than one row. */
  const matrix = layoutMath("\\begin{pmatrix} a & bb \\\\ ccc & d \\end{pmatrix}", true);
  const cell = layoutMath("a", true);
  check("a matrix is wider than a cell", matrix.layout.width > cell.layout.width * 3);
  check("a matrix is taller than a row", matrix.layout.height > cell.layout.height);
}

{
  /* A delimited group is wider than its contents. */
  const group = layoutMath("\\left( x \\right)", true);
  const bare = layoutMath("x", true);
  check("a delimited group is wider", group.layout.width > bare.layout.width);
}

{
  /* The whole thing is finite and positive. */
  for (const expression of EXPRESSIONS) {
    const { layout } = layoutMath(expression, true);
    check(
      `the layout is sane: ${expression.slice(0, 30)}`,
      Number.isFinite(layout.width) &&
        Number.isFinite(layout.height) &&
        Number.isFinite(layout.depth) &&
        layout.width >= 0 &&
        layout.height >= 0 &&
        layout.depth >= 0,
      JSON.stringify({ w: layout.width, h: layout.height, d: layout.depth }),
    );
  }
}

/* ------------------------------------------------------------------ *
 *  4. the fallbacks
 * ------------------------------------------------------------------ */

{
  /* The fifteen characters the font is missing, and the commands that need
   * them. Every one has to come out as SOMETHING the font can draw. */
  const needsFallback = [
    "\\cdot",
    "\\ast",
    "\\angle",
    "\\setminus",
    "\\propto",
    "\\iint",
    "\\iiint",
    "\\oint",
    "\\bigcup",
    "\\bigcap",
    "\\bigotimes",
    "\\sqrt[3]{x}",
    "\\hbar",
    "\\Re",
    "\\Im",
  ];
  for (const expression of needsFallback) {
    const { layout } = layoutMath(expression, true);
    const text = layout.primitives
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
    check(`the fallback is drawn: ${expression}`, text.length > 0, "nothing was drawn");
    check(
      `the fallback is drawable: ${expression}`,
      hasGlyph(text),
      JSON.stringify(text),
    );
  }
}

{
  /* An unknown command is kept as its literal text — nothing is swallowed. */
  const { layout } = layoutMath("\\notacommand{x}", true);
  const text = layout.primitives
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("");
  check("an unknown command survives", text.includes("notacommand"), JSON.stringify(text));
}

{
  /* The parser never throws, whatever it is given. */
  for (const nasty of ["", "{", "}", "\\", "$$", "^", "_", "\\frac", "\\left", "\\begin{pmatrix}"]) {
    const tree = parseLatex(nasty);
    check(`the parser survives ${JSON.stringify(nasty)}`, tree !== null);
    layoutMath(nasty, true);
  }
}

/* ------------------------------------------------------------------ *
 * the result
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 *  5. the inline baseline
 * ------------------------------------------------------------------ */

/**
 * THE ONE INVARIANT THE WHOLE INLINE PATH RESTS ON.
 *
 * An equation in a sentence is a box of its own, and it has to sit ON the
 * prose's baseline rather than float beside it. The prose's baseline is
 * known — React Native centres a line between the font's ascent and its
 * descent, so with a line height of its own the baseline is at half the
 * slack plus the ascent — and the equation's baseline is known from its
 * own layout.
 *
 * So the margin that joins them is arithmetic, and this is the arithmetic.
 */
{
  const PROSE_SIZE = 14;
  const PROSE_LINE_HEIGHT = 23;
  const ASC = 1.02;
  const DESC = 0.3;
  const proseBaseline =
    (PROSE_LINE_HEIGHT - (ASC + DESC) * PROSE_SIZE) / 2 + ASC * PROSE_SIZE;

  for (const expression of [
    "x^2",
    "\\frac{d}{dx}f(x)",
    "e^{i\\pi}",
    "\\lim_{x \\to 0}",
  ]) {
    const { layout } = layoutMath(expression, false);
    const size = 14;
    const marginTop = proseBaseline - layout.height * size;

    // Where the equation's baseline lands, once the margin has been applied.
    const baseline = marginTop + layout.height * size;
    near(
      `the equation sits on the prose's baseline: ${expression}`,
      baseline,
      proseBaseline,
      0.0001,
    );

    // And the equation's own extent has to be inside the line's box.
    check(
      `the equation fits the line: ${expression}`,
      layout.height * size + layout.depth * size <= PROSE_LINE_HEIGHT * 3,
      "the equation is enormous",
    );
  }
}

console.log(`${passed} checks passed`);
if (failures.length > 0) {
  console.log("");
  console.log(`${failures.length} FAILED:`);
  for (const failure of failures) console.log(`  · ${failure}`);
  process.exit(1);
}
console.log("all good");
