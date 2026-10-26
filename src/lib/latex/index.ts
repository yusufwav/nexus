/**
 * THE PUBLIC API
 * ---------------------------------------------------------------------------
 * Two jobs:
 *
 *   1. FIND THE MATHS in a line of the tutor's answer — the `$...$` and the
 *      `$$...$$`;
 *   2. LAY IT OUT, so the renderer has boxes and positions to draw.
 *
 * THE SPLITTER IS WHERE THE CURRENCY PROBLEM IS SOLVED
 * ---------------------------------------------------------------------------
 * `$` opens inline maths, so a price written "$50" opens a formula that
 * never closes, and everything after it gets swallowed into the maths. The
 * web app solves this by asking the model not to write currency that way;
 * that is a good rule but it is a rule about the MODEL, and this file has
 * to survive a model that breaks it.
 *
 * So the splitter refuses a span that does not look like maths:
 *
 *   · the span must be closed on the SAME LINE;
 *   · the span must not begin or end with whitespace;
 *   · the span must not be a bare number — "$50" is a price, not maths.
 *
 * When a `$` fails any of those, it is a LITERAL DOLLAR SIGN and the text
 * around it is left alone. Nothing is ever swallowed.
 */
import { layoutNode, type Layout } from "@/lib/latex/layout";
import { parseLatex } from "@/lib/latex/parse";

/* ------------------------------------------------------------------ *
 * finding the maths
 * ------------------------------------------------------------------ */

/** A piece of a line of the tutor's answer. */
export type LineSegment =
  /** Ordinary prose. */
  | { readonly kind: "text"; readonly text: string }
  /** Inline maths: `$x^2$`. */
  | { readonly kind: "inline"; readonly latex: string }
  /** A displayed equation: `$$...$$`. */
  | { readonly kind: "display"; readonly latex: string };

/** A span that is just a number is a price, not maths. */
const BARE_NUMBER = /^\s*\d+(?:[.,]\d+)?\s*$/;

/**
 * Split one line into prose and maths.
 *
 * A line that is nothing but `$$` is NOT handled here — that is the opening
 * of a displayed equation that runs over several lines, and the caller
 * collects it.
 */
export function splitLine(line: string): readonly LineSegment[] {
  const segments: LineSegment[] = [];
  let text = "";
  let i = 0;

  const flush = (): void => {
    if (text.length === 0) return;
    segments.push({ kind: "text", text });
    text = "";
  };

  while (i < line.length) {
    const c = line[i]!;

    if (c !== "$") {
      text += c;
      i += 1;
      continue;
    }

    /* ---- an escaped dollar sign is a dollar sign ---- */
    if (line[i - 1] === "\\") {
      // The backslash has already gone into `text`; drop it and keep the
      // dollar as a literal.
      text = text.slice(0, -1);
      text += "$";
      i += 1;
      continue;
    }

    /* ---- a displayed equation ---- */
    if (line[i + 1] === "$") {
      const close = line.indexOf("$$", i + 2);
      if (close === -1) {
        // An unclosed `$$` is literal text.
        text += "$$";
        i += 2;
        continue;
      }
      const latex = line.slice(i + 2, close).trim();
      flush();
      if (latex.length > 0) segments.push({ kind: "display", latex });
      i = close + 2;
      continue;
    }

    /* ---- inline maths ---- */
    const close = line.indexOf("$", i + 1);
    if (close === -1) {
      text += "$";
      i += 1;
      continue;
    }
    const latex = line.slice(i + 1, close);
    const usable =
      latex.length > 0 &&
      !latex.includes("\n") &&
      latex.trim() === latex &&
      !BARE_NUMBER.test(latex);
    if (!usable) {
      // Not maths. The dollar sign is literal, and the text carries on.
      text += "$";
      i += 1;
      continue;
    }
    flush();
    segments.push({ kind: "inline", latex });
    i = close + 1;
  }

  flush();
  return segments;
}

/**
 * Is this line the delimiter of a displayed equation?
 *
 * The model is asked to put each `$$` on its own line, with a blank line
 * before it, so that a long equation is a block rather than something jammed
 * into the middle of a sentence.
 */
export function isDisplayDelimiter(line: string): boolean {
  return line.trim() === "$$";
}

/* ------------------------------------------------------------------ *
 * laying it out
 * ------------------------------------------------------------------ */

/** How the maths is laid out, and how it is set. */
export type MathLayout = {
  readonly layout: Layout;
  readonly display: boolean;
  /**
   * True when the source was longer than `MAX_MATH_SOURCE` and was cut
   * before layout. Callers should show the source rather than a half-drawn
   * equation; see the note on `layoutMath`.
   */
  readonly truncated: boolean;
};

/**
 * THE LONGEST SOURCE THAT WILL BE LAID OUT.
 *
 * The layout engine is O(n²) in the number of glyphs: every run is appended
 * to the parent's primitive list, and a 100,000-character expression takes
 * over two minutes on a desktop (measured). A tutor answer is the input, and
 * an answer can come from any endpoint the reader added, so an unbounded
 * input is a way to freeze the UI for as long as the sender likes.
 *
 * Two thousand characters is far past any real equation — a full matrix is a
 * few hundred — and it lays out in about sixty milliseconds. Longer input is
 * cut here and the caller is told, so it can render the text instead.
 */
export const MAX_MATH_SOURCE = 2000;

/**
 * Parse and lay out a piece of maths.
 *
 * `display` is the difference between a displayed equation and an inline
 * one, and it changes two things: the big operators grow and take their
 * limits above and below, and the caller gives the result more room.
 */
export function layoutMath(latex: string, display: boolean): MathLayout {
  const truncated = latex.length > MAX_MATH_SOURCE;
  const source = truncated ? latex.slice(0, MAX_MATH_SOURCE) : latex;
  const tree = parseLatex(source);
  const layout = layoutNode(tree, 1, { display });
  return { layout, display, truncated };
}

export type { Layout, Primitive } from "@/lib/latex/layout";
export type { Node } from "@/lib/latex/parse";
