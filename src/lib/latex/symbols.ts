/**
 * THE SYMBOL TABLE
 * ---------------------------------------------------------------------------
 * LaTeX names are words; a phone has glyphs. This is the dictionary between
 * them, and it is the only place in the app that knows what `\sum` looks
 * like.
 *
 * THE FONT IS NOT COMPLETE, AND THAT IS THE POINT OF THIS FILE
 * ---------------------------------------------------------------------------
 * The app's face is JetBrains Mono, and it does not have every glyph a maths
 * renderer might ask for. `scripts/generate-font-metrics.mjs` reads the font
 * file and lists what is missing, and the answer was:
 *
 *   ⋅ ∝ ∖ ∠ ∗          ∬ ∭ ∮ ∯ ∰ ⨁ ⨂      ∛      ℏ ℜ ℑ
 *
 * A missing glyph comes out as a BOX, and a page of boxes is worse than a
 * page of plain text. So every command below has a FALLBACK, chosen to keep
 * the meaning:
 *
 *   · a near-identical glyph the font DOES have  —  `\cdot` → `·`;
 *   · the same symbol written out  —  `\angle` → `angle`, in italic;
 *   · a construction the layout engine can draw  —  `\hbar` is an `h` with a
 *     rule drawn over it, which is what the glyph IS.
 *
 * The fallback is a property of the symbol, not an error case, so it is
 * written down here once rather than guessed at in the renderer.
 */

/**
 * HOW A RUN IS SET.
 *
 * `face` is the family, `italic` is the slant.
 *
 * ITALIC IS THE MARK OF A VARIABLE. In a maths expression `x` is a
 * quantity and `sin` is a name, and the difference between them is a
 * hundred years of convention. JetBrains Mono has no italic file, so the
 * slant is SYNTHESISED — RN asks the platform for an oblique and the
 * platform supplies one. If a platform ever declines, the run simply reads
 * upright, which is degraded but not broken.
 */
export type Variant = {
  /** The family the run is set in. */
  readonly face: "math" | "nova" | "bold" | "medium";
  /** Whether the run is slanted. */
  readonly italic: boolean;
};

/** Ordinary maths: the body face, upright. */
export const MATH: Variant = { face: "math", italic: false };

/** A variable: the body face, slanted. */
export const VAR: Variant = { face: "math", italic: true };

/** A number: the figures' own face. */
export const NUM: Variant = { face: "nova", italic: false };

/** A name — `sin`, `log`, `max`: upright, because it is a NAME. */
export const NAME: Variant = { face: "math", italic: false };

/** A name in bold — `\mathbf`, `\mathbb`: the heavy face, upright. */
export const STRONG: Variant = { face: "bold", italic: false };

/** Text inside maths — `\text{...}`: the body face, upright, in the prose size. */
export const PROSE: Variant = { face: "math", italic: false };

/** The medium face, for a sub-heading inside maths. */
export const MEDIUM: Variant = { face: "medium", italic: false };

/* ------------------------------------------------------------------ *
 * the symbol table
 * ------------------------------------------------------------------ */

/**
 * A symbol in the table.
 *
 * `glyph` is what is drawn. `variant` says how. `fallback` is used when the
 * font cannot draw `glyph` — the renderer checks the font's repertoire
 * once, at module load, and swaps in the fallback.
 */
export type Symbol = {
  readonly glyph: string;
  readonly variant?: Variant;
  /** What to draw instead, when the font has no `glyph`. */
  readonly fallback?: string;
  /** Whether the symbol is a BIG OPERATOR, and so takes limits. */
  readonly big?: boolean;
  /** The name of a FUNCTION, which is set upright and spaced. */
  readonly fn?: boolean;
};

/**
 * The greek letters, both cases.
 *
 * Lower case is a variable and is slanted; upper case is a constant and is
 * not. That distinction is the whole reason the two cases are listed
 * separately rather than generated.
 *
 * The NAMES are the Latin ones, because those are what LaTeX calls them:
 * `\alpha` is alpha, and the glyph it draws is α. The names are listed
 * beside the letters rather than derived from them, because the Latin
 * spelling of rho is `rho` and its code point is nowhere near the sixteenth
 * letter of the Greek alphabet.
 */
const GREEK_LOWER: ReadonlyArray<readonly [string, string]> = [
  ["alpha", "α"],
  ["beta", "β"],
  ["gamma", "γ"],
  ["delta", "δ"],
  ["epsilon", "ε"],
  ["zeta", "ζ"],
  ["eta", "η"],
  ["theta", "θ"],
  ["iota", "ι"],
  ["kappa", "κ"],
  ["lambda", "λ"],
  ["mu", "μ"],
  ["nu", "ν"],
  ["xi", "ξ"],
  ["omicron", "ο"],
  ["pi", "π"],
  ["rho", "ρ"],
  ["sigma", "σ"],
  ["tau", "τ"],
  ["upsilon", "υ"],
  ["phi", "φ"],
  ["chi", "χ"],
  ["psi", "ψ"],
  ["omega", "ω"],
];

const GREEK_UPPER: ReadonlyArray<readonly [string, string]> = [
  ["Gamma", "Γ"],
  ["Delta", "Δ"],
  ["Theta", "Θ"],
  ["Lambda", "Λ"],
  ["Xi", "Ξ"],
  ["Pi", "Π"],
  ["Sigma", "Σ"],
  ["Upsilon", "Υ"],
  ["Phi", "Φ"],
  ["Psi", "Ψ"],
  ["Omega", "Ω"],
];

const greek: Record<string, Symbol> = {};
for (const [name, glyph] of GREEK_LOWER) {
  greek[`\\${name}`] = { glyph, variant: VAR };
}
for (const [name, glyph] of GREEK_UPPER) {
  greek[`\\${name}`] = { glyph, variant: MATH };
}

/** The operators and relations, as glyphs the font actually has. */
const OPERATORS: Readonly<Record<string, string>> = {
  "\\pm": "±",
  "\\mp": "∓",
  "\\times": "×",
  "\\div": "÷",
  "\\cdot": "·",
  "\\cdots": "⋯",
  "\\ldots": "…",
  "\\dots": "…",
  "\\vdots": "⋮",
  "\\ddots": "⋱",
  "\\le": "≤",
  "\\leq": "≤",
  "\\ge": "≥",
  "\\geq": "≥",
  "\\ne": "≠",
  "\\neq": "≠",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\sim": "∼",
  "\\to": "→",
  "\\rightarrow": "→",
  "\\leftarrow": "←",
  "\\leftrightarrow": "↔",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
  "\\Leftrightarrow": "⇔",
  "\\implies": "⇒",
  "\\iff": "⇔",
  "\\mapsto": "↦",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\subseteq": "⊆",
  "\\supset": "⊃",
  "\\supseteq": "⊇",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\emptyset": "∅",
  "\\varnothing": "∅",
  "\\nabla": "∇",
  "\\partial": "∂",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\neg": "¬",
  "\\lnot": "¬",
  "\\wedge": "∧",
  "\\lor": "∨",
  "\\oplus": "⊕",
  "\\otimes": "⊗",
  "\\perp": "⊥",
  "\\parallel": "∥",
  "\\prime": "′",
  "\\circ": "∘",
  "\\mid": "|",
  "\\nmid": "∤",
  "\\colon": ":",
  "\\therefore": "∴",
  "\\because": "∵",
  "\\ll": "≪",
  "\\gg": "≫",
  "\\doteq": "≐",
  "\\models": "⊨",
  "\\vdash": "⊢",
  "\\dashv": "⊣",
  "\\langle": "⟨",
  "\\rangle": "⟩",
  "\\lceil": "⌈",
  "\\rceil": "⌉",
  "\\lfloor": "⌊",
  "\\rfloor": "⌋",
  "\\infty": "∞",
  "\\ell": "ℓ",
  "\\hbar": "ℏ",
  "\\Re": "ℜ",
  "\\Im": "ℑ",
  "\\angle": "∠",
  "\\ast": "∗",
  "\\star": "★",
  "\\bullet": "•",
  "\\setminus": "∖",
  "\\propto": "∝",
  "\\sqrt": "√",
};

/** The big operators, which take limits above and below in display mode. */
const BIG_OPERATORS: Readonly<Record<string, string>> = {
  "\\sum": "∑",
  "\\prod": "∏",
  "\\coprod": "∐",
  "\\int": "∫",
  "\\iint": "∬",
  "\\iiint": "∭",
  "\\oint": "∮",
  "\\bigcup": "⨀",
  "\\bigcap": "⨂",
  "\\bigotimes": "⨂",
};

/** The function names, which are set upright and spaced. */
const FUNCTIONS: ReadonlyArray<string> = [
  "sin",
  "cos",
  "tan",
  "cot",
  "sec",
  "csc",
  "arcsin",
  "arccos",
  "arctan",
  "sinh",
  "cosh",
  "tanh",
  "log",
  "ln",
  "lg",
  "exp",
  "lim",
  "limsup",
  "liminf",
  "max",
  "min",
  "sup",
  "inf",
  "det",
  "dim",
  "ker",
  "deg",
  "gcd",
  "hom",
  "arg",
  "Pr",
];

/** The delimiters, by the command that opens them. */
export const DELIMITERS: Readonly<Record<string, string>> = {
  "(": "(",
  ")": ")",
  "[": "[",
  "]": "]",
  "\\{": "{",
  "\\}": "}",
  "|": "|",
  "\\|": "‖",
  "\\langle": "⟨",
  "\\rangle": "⟩",
  "\\lfloor": "⌊",
  "\\rfloor": "⌋",
  "\\lceil": "⌈",
  "\\rceil": "⌉",
  "/": "/",
  "\\vert": "|",
  "\\Vert": "‖",
};

/** The spacing commands, in em. */
export const SPACING: Readonly<Record<string, number>> = {
  "\\,": 0.17,
  "\\thinspace": 0.17,
  "\\:": 0.22,
  "\\;": 0.28,
  "\\!": -0.17,
  "\\ ": 0.33,
  "\\quad": 1,
  "\\qquad": 2,
};

/* ------------------------------------------------------------------ *
 * the assembled table
 * ------------------------------------------------------------------ */

/**
 * EVERY COMMAND THE PARSER KNOWS, and what it draws.
 *
 * A command that is not in here is not an error: the parser keeps the
 * literal text, so an unknown macro shows the reader exactly what the model
 * wrote rather than swallowing it.
 */
export const SYMBOLS: Readonly<Record<string, Symbol>> = (() => {
  const table: Record<string, Symbol> = { ...greek };

  for (const [command, glyph] of Object.entries(OPERATORS)) {
    table[command] = { glyph };
  }

  for (const [command, glyph] of Object.entries(BIG_OPERATORS)) {
    table[command] = { glyph, big: true };
  }

  for (const name of FUNCTIONS) {
    table[`\\${name}`] = { glyph: name, fn: true };
  }

  /*
   * THE GREEK VARIANTS.
   *
   * LaTeX has two spellings of several letters and they are not the
   * same glyph: `\epsilon` is the lunate one and `\varepsilon` is the
   * curly one, and the same is true of `\phi` and `\varphi`. A tutor
   * uses both, so both are here.
   */
  table["\\epsilon"] = { glyph: "ϵ", variant: VAR };
  table["\\varepsilon"] = { glyph: "ε", variant: VAR };
  table["\\phi"] = { glyph: "ϕ", variant: VAR };
  table["\\varphi"] = { glyph: "φ", variant: VAR };
  table["\\theta"] = { glyph: "θ", variant: VAR };
  table["\\vartheta"] = { glyph: "ϑ", variant: VAR };
  table["\\rho"] = { glyph: "ρ", variant: VAR };
  table["\\varrho"] = { glyph: "ϱ", variant: VAR };
  table["\\sigma"] = { glyph: "σ", variant: VAR };
  table["\\varsigma"] = { glyph: "ς", variant: VAR };
  table["\\pi"] = { glyph: "π", variant: VAR };
  table["\\varpi"] = { glyph: "ϖ", variant: VAR };
  table["\\kappa"] = { glyph: "κ", variant: VAR };
  table["\\varkappa"] = { glyph: "ϰ", variant: VAR };
  table["\\iota"] = { glyph: "ι", variant: VAR };
  table["\\imath"] = { glyph: "ı", variant: VAR };

  /* An escaped dollar sign is a dollar sign. */
  table["\\$"] = { glyph: "$" };
  /* A percent sign, which LaTeX escapes because it is a comment. */
  table["\\%"] = { glyph: "%" };
  /* An ampersand, which LaTeX escapes because it is a column separator. */
  table["\\&"] = { glyph: "&" };
  /* An underscore. */
  table["\\_"] = { glyph: "_" };
  /* A hash. */
  table["\\#"] = { glyph: "#" };

  /*
   * The fallbacks. The font is missing these, so each one says what to draw
   * instead.
   */
  table["\\cdot"] = { glyph: "·" };
  table["\\ast"] = { glyph: "∗", fallback: "*" };
  table["\\angle"] = { glyph: "∠", fallback: "angle", variant: VAR };
  table["\\setminus"] = { glyph: "∖", fallback: "\\" };
  table["\\propto"] = { glyph: "∝", fallback: "prop", variant: VAR };
  table["\\iint"] = { glyph: "∬", fallback: "∫∫", big: true };
  table["\\iiint"] = { glyph: "∭", fallback: "∫∫∫", big: true };
  table["\\oint"] = { glyph: "∮", fallback: "∫", big: true };
  table["\\bigcup"] = { glyph: "⨀", fallback: "⋃", big: true };
  table["\\bigcap"] = { glyph: "⨂", fallback: "⋂", big: true };
  table["\\bigotimes"] = { glyph: "⨂", fallback: "⊗", big: true };
  table["\\hbar"] = { glyph: "ℏ", fallback: "h", variant: VAR };
  table["\\Re"] = { glyph: "ℜ", fallback: "Re", variant: MATH };
  table["\\Im"] = { glyph: "ℑ", fallback: "Im", variant: MATH };

  return table;
})();

/** The commands that open a group whose contents are set in a different way. */
export const TEXT_COMMANDS: Readonly<Record<string, Variant>> = {
  "\\text": PROSE,
  "\\textrm": PROSE,
  "\\textnormal": PROSE,
  "\\mathrm": MATH,
  "\\mathbf": STRONG,
  "\\mathbb": STRONG,
  "\\mathbfit": { face: "bold", italic: true },
  "\\mathit": VAR,
  "\\mathcal": STRONG,
  "\\mathscr": STRONG,
  "\\boldsymbol": STRONG,
  "\\bm": STRONG,
  "\\operatorname": MATH,
};
