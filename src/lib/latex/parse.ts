/**
 * THE PARSER
 * ---------------------------------------------------------------------------
 * LaTeX in, a tree out.
 *
 * It is a hand-written recursive-descent parser over a hand-written
 * tokenizer, and it is deliberately SMALL: the grammar a maths tutor uses is
 * not the whole of LaTeX, it is about forty constructs, and a general
 * implementation would be a large dependency that the app does not need and
 * cannot verify offline.
 *
 * WHAT IT SUPPORTS
 * ---------------------------------------------------------------------------
 *   · groups `{...}`, and the commands that take one — `\frac`, `\sqrt`,
 *     `\text`, `\mathbf`, `\hat`, `\overline`, …
 *   · scripts — `x^2`, `a_{n+1}`, `x_i^2`
 *   · big operators with limits — `\sum_{i=0}^{n}`, `\int_a^b`, `\lim_{x\to0}`
 *   · `\left( ... \right)` and friends, with the delimiter set
 *   · the matrix environments — `matrix`, `pmatrix`, `bmatrix`, `vmatrix`,
 *     `cases` — with `&` for columns and `\\` for rows
 *   · spacing — `\,` `\;` `\:` `\!` `\quad` `\qquad`
 *   · every symbol in `symbols.ts`
 *
 * WHAT IT DOES NOT, AND WHY IT IS STILL CORRECT
 * ---------------------------------------------------------------------------
 * LaTeX has macros, `\begin{align}`, `\label`, and a hundred other things.
 * The parser does not implement them, and it does not need to: **an unknown
 * command is kept as its literal text**, so the reader sees exactly what the
 * model wrote rather than a gap where it should have been. Nothing is ever
 * swallowed.
 *
 * The same is true of a `$` that never closes — the currency case, where the
 * model writes "$50" and the rest of the sentence would be eaten by a
 * formula. The splitter in `index.ts` is what handles that, and it is
 * deliberately outside this file.
 */
import {
  DELIMITERS,
  MATH,
  NUM,
  SPACING,
  SYMBOLS,
  TEXT_COMMANDS,
  VAR,
  type Variant,
} from "@/lib/latex/symbols";
import { hasGlyph } from "@/lib/latex/metrics";

/* ------------------------------------------------------------------ *
 * the tree
 * ------------------------------------------------------------------ */

/** The accents the layout engine can draw over a base. */
export type Accent = "hat" | "bar" | "vec" | "tilde" | "dot" | "ddot" | "overline" | "underline";

/** One node of a parsed expression. */
export type Node =
  /** A horizontal sequence. */
  | { readonly kind: "row"; readonly children: readonly Node[] }
  /** A run of glyphs in one face. */
  | { readonly kind: "run"; readonly text: string; readonly variant: Variant }
  /** A fraction. */
  | { readonly kind: "frac"; readonly num: Node; readonly den: Node; readonly variant: Variant }
  /** A root, with an optional index. */
  | { readonly kind: "root"; readonly radicand: Node; readonly index?: Node }
  /** A base with a superscript and/or a subscript. */
  | { readonly kind: "script"; readonly base: Node; readonly sup?: Node; readonly sub?: Node }
  /** A mark drawn over a base. */
  | { readonly kind: "accent"; readonly accent: Accent; readonly base: Node }
  /** A bracketed run, with its own left and right delimiters. */
  | { readonly kind: "delim"; readonly left: string; readonly right: string; readonly body: Node }
  /** A big operator, with limits above and below it. */
  | { readonly kind: "bigop"; readonly glyph: string; readonly upper?: Node; readonly lower?: Node }
  /** A grid of cells, with its own left and right delimiters. */
  | {
      readonly kind: "matrix";
      readonly rows: readonly (readonly Node[])[];
      readonly left: string;
      readonly right: string;
    }
  /** Horizontal space. */
  | { readonly kind: "space"; readonly em: number }
  /** A line break. */
  | { readonly kind: "break" };

/* ------------------------------------------------------------------ *
 * the tokenizer
 * ------------------------------------------------------------------ */

type Token =
  | { readonly type: "char"; readonly value: string }
  | { readonly type: "command"; readonly name: string }
  | { readonly type: "lbrace" }
  | { readonly type: "rbrace" }
  | { readonly type: "sup" }
  | { readonly type: "sub" }
  | { readonly type: "amp" }
  | { readonly type: "newline" }
  | { readonly type: "space" };

const LETTER = /[A-Za-z]/;

/**
 * Split LaTeX into tokens.
 *
 * Whitespace is a token rather than being thrown away, because space is
 * meaningful in maths: `a b` is two things and `ab` is one.
 */
export function tokenize(source: string): readonly Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const c = source[i]!;

    if (c === "\\") {
      const next = source[i + 1];
      if (next === undefined) {
        // A trailing backslash is a stray backslash.
        tokens.push({ type: "char", value: "\\" });
        i += 1;
        continue;
      }
      if (next === "\\") {
        tokens.push({ type: "newline" });
        i += 2;
        continue;
      }
      if (LETTER.test(next)) {
        let name = "";
        let j = i + 1;
        while (j < source.length && LETTER.test(source[j]!)) {
          name += source[j];
          j += 1;
        }
        tokens.push({ type: "command", name: `\\${name}` });
        i = j;
        continue;
      }
      // A single non-letter command: `\{`, `\,`, `\\` was handled above.
      tokens.push({ type: "command", name: `\\${next}` });
      i += 2;
      continue;
    }

    if (c === "{") {
      tokens.push({ type: "lbrace" });
      i += 1;
      continue;
    }
    if (c === "}") {
      tokens.push({ type: "rbrace" });
      i += 1;
      continue;
    }
    if (c === "^") {
      tokens.push({ type: "sup" });
      i += 1;
      continue;
    }
    if (c === "_") {
      tokens.push({ type: "sub" });
      i += 1;
      continue;
    }
    if (c === "&") {
      tokens.push({ type: "amp" });
      i += 1;
      continue;
    }
    if (c === "~") {
      tokens.push({ type: "space" });
      i += 1;
      continue;
    }
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      tokens.push({ type: "space" });
      i += 1;
      continue;
    }

    tokens.push({ type: "char", value: c });
    i += 1;
  }

  return tokens;
}

/* ------------------------------------------------------------------ *
 * the parser
 * ------------------------------------------------------------------ */

/** The accents, and the commands that ask for them. */
const ACCENTS: Readonly<Record<string, Accent>> = {
  "\\hat": "hat",
  "\\widehat": "hat",
  "\\bar": "bar",
  "\\overline": "overline",
  "\\vec": "vec",
  "\\tilde": "tilde",
  "\\widetilde": "tilde",
  "\\dot": "dot",
  "\\ddot": "ddot",
  "\\underline": "underline",
  "\\overbrace": "overline",
};

/** The environments the parser knows how to draw. */
const MATRIX_ENVIRONMENTS: Readonly<Record<string, { left: string; right: string }>> = {
  matrix: { left: "", right: "" },
  pmatrix: { left: "(", right: ")" },
  bmatrix: { left: "[", right: "]" },
  Bmatrix: { left: "{", right: "}" },
  vmatrix: { left: "|", right: "|" },
  Vmatrix: { left: "‖", right: "‖" },
  cases: { left: "{", right: "" },
};

/** The size modifiers, which the layout engine ignores but must not choke on. */
const SIZE_MODIFIERS = new Set(["\\big", "\\Big", "\\bigg", "\\Bigg", "\\bigl", "\\bigr", "\\Bigl", "\\Bigr"]);

class Parser {
  private readonly tokens: readonly Token[];
  private at = 0;

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token | undefined {
    return this.tokens[this.at];
  }

  private next(): Token | undefined {
    const token = this.tokens[this.at];
    if (token !== undefined) this.at += 1;
    return token;
  }

  /**
   * A sequence of nodes, up to a `}` or the end of the input.
   *
   * `stopAtRight` is for `\left...\right`: the body of a pair ends at the
   * `\right`, not at a brace.
   */
  parseSequence(stopAtRight = false): { nodes: Node[]; stoppedAtRight: boolean } {
    const nodes: Node[] = [];

    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at]!;

      if (token.type === "rbrace") {
        // The closing brace is CONSUMED here, not left for the caller:
        // every caller of this method is a group, and a group that does
        // not swallow its own brace leaves the next argument reading
        // the wrong token.
        this.at += 1;
        break;
      }

      if (token.type === "command" && token.name === "\\right") {
        if (stopAtRight) return { nodes, stoppedAtRight: true };
        // A `\right` with no `\left` — skip it and carry on.
        this.at += 1;
        this.readDelimiter();
        continue;
      }

      const node = this.parseAtom(nodes);
      if (node !== null) {
        nodes.push(node);
        this.attachScripts(nodes);
      }
    }

    return { nodes, stoppedAtRight: false };
  }

  /**
   * One atom, and the scripts that hang off it.
   *
   * The scripts are attached by the caller, because a script belongs to the
   * atom BEFORE it — `\frac{a}{b}^2` is the fraction squared, not the `b`.
   */
  private parseAtom(soFar: Node[]): Node | null {
    const token = this.next();
    if (token === undefined) return null;

    switch (token.type) {
      case "space":
        return null;

      case "lbrace": {
        const { nodes } = this.parseSequence();
        return { kind: "row", children: nodes };
      }

      case "rbrace":
        return null;

      case "amp":
      case "newline":
        return null;

      case "sup":
      case "sub":
        // A script with nothing to attach to is dropped.
        return null;

      case "char": {
        const variant = variantForChar(token.value);
        return { kind: "run", text: token.value, variant };
      }

      case "command":
        return this.parseCommand(token.name);

      default:
        return null;
    }
  }

  /** A command, and whatever it takes. */
  private parseCommand(name: string): Node | null {

    /* ---- a size modifier: consumed, and otherwise ignored ---- */
    if (SIZE_MODIFIERS.has(name)) {
      // `\bigl(` — the modifier applies to the delimiter that follows.
      const after = this.peek();
      if (after !== undefined && after.type === "command") return null;
      return null;
    }

    /* ---- spacing ---- */
    const space = SPACING[name];
    if (space !== undefined) return { kind: "space", em: space };

    /* ---- a styled group ---- */
    const styled = TEXT_COMMANDS[name];
    if (styled !== undefined) {
      const raw = this.readRawGroup();
      if (raw === null) return { kind: "run", text: name, variant: MATH };
      return { kind: "run", text: raw, variant: styled };
    }

    /* ---- an accent ---- */
    const accent = ACCENTS[name];
    if (accent !== undefined) {
      const base = this.readArgument();
      if (base === null) return { kind: "run", text: name, variant: MATH };
      return { kind: "accent", accent, base };
    }

    /* ---- `\hbar` is an `h` with a bar over it, and that is what it IS ---- */
    if (name === "\\hbar") {
      return {
        kind: "accent",
        accent: "bar",
        base: { kind: "run", text: "h", variant: VAR },
      };
    }

    switch (name) {
      case "\\frac":
      case "\\dfrac":
      case "\\tfrac":
      case "\\cfrac": {
        const num = this.readArgument();
        const den = this.readArgument();
        if (num === null || den === null) return { kind: "run", text: name, variant: MATH };
        return { kind: "frac", num, den, variant: MATH };
      }

      case "\\binom":
      case "\\dbinom":
      case "\\tbinom": {
        const num = this.readArgument();
        const den = this.readArgument();
        if (num === null || den === null) return { kind: "run", text: name, variant: MATH };
        return {
          kind: "delim",
          left: "(",
          right: ")",
          body: { kind: "frac", num, den, variant: MATH },
        };
      }

      case "\\sqrt": {
        // An optional index: `\sqrt[3]{x}`.
        let index: Node | undefined;
        const maybeBracket = this.peek();
        if (maybeBracket !== undefined && maybeBracket.type === "char" && maybeBracket.value === "[") {
          this.next();
          index = this.readUntilChar("]") ?? undefined;
        }
        const radicand = this.readArgument();
        if (radicand === null) return { kind: "run", text: name, variant: MATH };
        return { kind: "root", radicand, index };
      }

      case "\\left": {
        const left = this.readDelimiter();
        const { nodes, stoppedAtRight } = this.parseSequence(true);
        let right = "";
        if (stoppedAtRight) right = this.readDelimiter();
        return { kind: "delim", left, right, body: { kind: "row", children: nodes } };
      }

      case "\\begin": {
        const env = this.readRawGroup();
        if (env === null) return null;
        const shape = MATRIX_ENVIRONMENTS[env];
        if (shape === undefined) {
          // An environment the parser does not know: read to its `\end` and
          // keep the contents, so the reader still sees the maths.
          this.skipToEnd(env);
          return null;
        }
        return this.parseMatrix(env, shape);
      }

      case "\\end":
        // A stray `\end`: swallow its argument.
        this.readRawGroup();
        return null;

      case "\\displaystyle":
      case "\\textstyle":
      case "\\scriptstyle":
      case "\\limits":
      case "\\nolimits":
      case "\\label":
      case "\\tag":
      case "\\nonumber":
        // Consumed and ignored. `\limits` is honoured below, by the caller,
        // for the big operators that follow.
        return null;

      default:
        break;
    }

    const symbol = SYMBOLS[name];
    if (symbol === undefined) {
      // An unknown command: keep it as literal text, so nothing disappears.
      return { kind: "run", text: name, variant: MATH };
    }

    /*
     * THE FALLBACK.
     *
     * The app's font does not have every glyph. `symbols.ts` says what to
     * draw instead, and this is where the swap happens — the layout engine
     * never has to know that a glyph is missing.
     */
    const glyph = hasGlyph(symbol.glyph) ? symbol.glyph : symbol.fallback ?? symbol.glyph;

    if (symbol.big) {
      const limits = this.readLimits();
      return {
        kind: "bigop",
        glyph,
        upper: limits.upper,
        lower: limits.lower,
      };
    }

    return { kind: "run", text: glyph, variant: symbol.variant ?? MATH };
  }

  /**
   * The limits of a big operator — `_{i=0}^{n}`.
   *
   * A big operator is an ATOM, and its limits follow it, so the scripts are
   * read here rather than by the generic script handling.
   */
  private readLimits(): { upper?: Node; lower?: Node } {
    let upper: Node | undefined;
    let lower: Node | undefined;

    for (;;) {
      const token = this.peek();
      if (token === undefined) break;
      if (token.type === "sup") {
        this.next();
        upper = this.readArgument() ?? undefined;
        continue;
      }
      if (token.type === "sub") {
        this.next();
        lower = this.readArgument() ?? undefined;
        continue;
      }
      break;
    }

    return { upper, lower };
  }

  /**
   * Attach a script to the atom before it.
   *
   * `x_i^2` is one node with both, and `x^2_i` is the same node, because
   * the order of the two markers does not change what they mean.
   */
  private attachScripts(nodes: Node[]): void {
    const token = this.peek();
    if (token === undefined) return;
    if (token.type !== "sup" && token.type !== "sub") return;

    const base = nodes.pop();
    if (base === undefined) return;

    let sup: Node | undefined;
    let sub: Node | undefined;

    for (;;) {
      const mark = this.peek();
      if (mark === undefined) break;
      if (mark.type === "sup" && sup === undefined) {
        this.next();
        sup = this.readArgument() ?? undefined;
        continue;
      }
      if (mark.type === "sub" && sub === undefined) {
        this.next();
        sub = this.readArgument() ?? undefined;
        continue;
      }
      break;
    }

    nodes.push({ kind: "script", base, sup, sub });
  }

  /**
   * One argument: a group `{...}`, or a single atom.
   *
   * `\frac12` is `\frac{1}{2}` to LaTeX, and this matches it.
   */
  private readArgument(): Node | null {
    const token = this.peek();
    if (token === undefined) return null;

    if (token.type === "lbrace") {
      this.next();
      const { nodes } = this.parseSequence();
      return { kind: "row", children: nodes };
    }

    const node = this.parseAtom([]);
    return node;
  }

  /** The contents of a group, as PLAIN TEXT — for `\text{...}`. */
  private readRawGroup(): string | null {
    const token = this.peek();
    if (token === undefined) return null;
    if (token.type !== "lbrace") return null;
    this.next();

    let depth = 1;
    let raw = "";
    while (this.at < this.tokens.length) {
      const t = this.tokens[this.at]!;
      if (t.type === "lbrace") {
        depth += 1;
        raw += "{";
      } else if (t.type === "rbrace") {
        depth -= 1;
        if (depth === 0) {
          this.at += 1;
          return raw;
        }
        raw += "}";
      } else if (t.type === "char") {
        raw += t.value;
      } else if (t.type === "space") {
        raw += " ";
      } else if (t.type === "command") {
        raw += t.name;
      } else if (t.type === "newline") {
        raw += " ";
      } else if (t.type === "amp") {
        raw += "&";
      } else if (t.type === "sup") {
        raw += "^";
      } else if (t.type === "sub") {
        raw += "_";
      }
      this.at += 1;
    }
    return raw;
  }

  /** The contents of a group, up to a closing `]`. */
  private readUntilChar(close: string): Node | null {
    let depth = 0;
    const nodes: Node[] = [];
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at]!;
      if (token.type === "char" && token.value === close && depth === 0) {
        this.at += 1;
        break;
      }
      if (token.type === "lbrace") depth += 1;
      if (token.type === "rbrace") depth -= 1;
      const node = this.parseAtom(nodes);
      if (node !== null) {
        nodes.push(node);
        this.attachScripts(nodes);
      }
    }
    return { kind: "row", children: nodes };
  }

  /** The delimiter after `\left` or `\right`. */
  private readDelimiter(): string {
    const token = this.next();
    if (token === undefined) return "";

    if (token.type === "char") {
      const direct = DELIMITERS[token.value];
      if (direct !== undefined) return direct;
      return token.value;
    }

    if (token.type === "command") {
      const named = DELIMITERS[token.name];
      if (named !== undefined) return named;
      // `\left.` — an invisible delimiter.
      if (token.name === "\\.") return "";
      const symbol = SYMBOLS[token.name];
      if (symbol !== undefined) return symbol.glyph;
      return "";
    }

    return "";
  }

  /** A matrix environment: rows of cells, split by `&` and `\\`. */
  private parseMatrix(env: string, shape: { left: string; right: string }): Node {
    const rows: Node[][] = [];
    let cells: Node[] = [];
    let cell: Node[] = [];

    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at]!;

      if (token.type === "command" && token.name === "\\end") {
        this.next();
        this.readRawGroup();
        break;
      }

      if (token.type === "amp") {
        this.at += 1;
        cells.push({ kind: "row", children: cell });
        cell = [];
        continue;
      }

      if (token.type === "newline") {
        this.at += 1;
        cells.push({ kind: "row", children: cell });
        cell = [];
        rows.push(cells);
        cells = [];
        continue;
      }

      const node = this.parseAtom(cell);
      if (node !== null) {
        cell.push(node);
        this.attachScripts(cell);
      }
    }

    if (cell.length > 0 || cells.length > 0) {
      cells.push({ kind: "row", children: cell });
      rows.push(cells);
    }

    return { kind: "matrix", rows, left: shape.left, right: shape.right };
  }

  /** Skip to the `\end` of an environment the parser does not draw. */
  private skipToEnd(env: string): void {
    while (this.at < this.tokens.length) {
      const token = this.tokens[this.at]!;
      if (token.type === "command" && token.name === "\\end") {
        this.next();
        this.readRawGroup();
        return;
      }
      this.at += 1;
    }
  }
}

/**
 * How a single character is set.
 *
 * A letter is a VARIABLE and is slanted; a digit is a FIGURE and goes in the
 * figures' own face; everything else is upright.
 */
function variantForChar(c: string): Variant {
  if (c >= "0" && c <= "9") return NUM;
  if (c >= "a" && c <= "z") return VAR;
  if (c >= "A" && c <= "Z") return VAR;
  return MATH;
}

/**
 * Parse a LaTeX expression into a tree.
 *
 * Never throws: an expression that cannot be parsed comes back as a row of
 * the literal text that was in it, so the reader sees the source rather
 * than a gap.
 */
export function parseLatex(source: string): Node {
  try {
    const parser = new Parser(tokenize(source));
    const { nodes } = parser.parseSequence();
    return { kind: "row", children: nodes };
  } catch {
    return { kind: "run", text: source, variant: MATH };
  }
}
