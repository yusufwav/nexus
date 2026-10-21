/**
 * TYPOGRAPHY
 * ---------------------------------------------------------------------------
 * The app's one typeface is **JetBrains Mono**, in four weights.
 *
 * WHY A MONOSPACE FOR EVERYTHING, AND WHY IT IS NOT A COMPROMISE
 * ---------------------------------------------------------------------------
 * The web app paired Inter for prose with JetBrains Mono for code and
 * chrome. On a phone that pairing is a liability: a proportional face and a
 * monospace face have different x-heights and different rhythms, so a screen
 * that mixes them reads as two apps.
 *
 * The notes themselves are mathematical — `lim(x→2) f(x)`, `f'(x) = 2x + h` —
 * and a monospace face sets them in a column, which is what they are. Reading
 * a worked example in a proportional face breaks the alignment that makes it
 * legible in the first place.
 *
 * So: one family, everywhere, and the hierarchy comes from WEIGHT, SIZE and
 * LETTER-SPACING rather than from a second typeface.
 *
 * THE WEIGHTS ARE NAMED FAMILIES, NOT `fontWeight`
 * ---------------------------------------------------------------------------
 * Android resolves `fontWeight` against the family, and a custom family
 * registered from a single file has no bold variant to find — so
 * `fontWeight: "700"` on a family called "JetBrainsMono" either does nothing
 * or synthesises a smear. Each weight is therefore registered under its own
 * family name and selected with `fontFamily` alone.
 */

/** The registered family names. `expo-font` registers each file under its key. */
export const FONT = {
  regular: "JetBrainsMono-Regular",
  medium: "JetBrainsMono-Medium",
  bold: "JetBrainsMono-Bold",
  extraBold: "JetBrainsMono-ExtraBold",
  /**
   * Nova Mono — the numbers' face.
   *
   * A second family for one job. Its cap height (0.74em) is within a
   * thousandth of JetBrains Mono's (0.73em), so a number set in it sits ON
   * the line instead of in it, and its x-height is the same. Its advance
   * is narrower — 0.562em against 0.6em — so a figure is about six per
   * cent tighter than the letters around it, which is the point: the digits
   * read as data rather than as words.
   *
   * It has ONE weight, so a number in a bold heading is regular-weight
   * Nova Mono. That is the trade the family asks for.
   */
  nova: "NovaMono-Regular",
} as const;

/**
 * The type scale.
 *
 * JetBrains Mono is a wide face — roughly 0.6em per character against
 * Inter's 0.5em — so the sizes sit a notch below where the equivalent
 * proportional sizes would, and the letter-spacing is tightened to keep
 * long headings from running wide.
 */
export const TYPE = {
  /** The largest thing on a screen. The wordmark, the page title. */
  display: {
    fontFamily: FONT.extraBold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -1,
  },
  /** A screen's title. */
  title: {
    fontFamily: FONT.bold,
    fontSize: 23,
    lineHeight: 29,
    letterSpacing: -0.6,
  },
  /** A section's heading. */
  heading: {
    fontFamily: FONT.bold,
    fontSize: 17,
    lineHeight: 23,
    letterSpacing: -0.3,
  },
  /** A subsection's heading. */
  subheading: {
    fontFamily: FONT.medium,
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  /** Running prose. */
  body: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 21,
  },
  /** Secondary prose. */
  small: {
    fontFamily: FONT.regular,
    fontSize: 12,
    lineHeight: 18,
  },
  /** A tiny all-caps eyebrow. */
  label: {
    fontFamily: FONT.medium,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  /** A code-ish run, a course code, a path. */
  code: {
    fontFamily: FONT.medium,
    fontSize: 12,
    lineHeight: 18,
    letterSpacing: 0.2,
  },
  /** The contents of a worked example. */
  mono: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 21,
  },
} as const;

export type TypeRole = keyof typeof TYPE;

/* ------------------------------------------------------------------ *
 *  numbers
 * ------------------------------------------------------------------ */

/**
 * EVERY NUMBER, IN NOVA MONO.
 *
 * The app has one typeface for everything, and now a second one for the
 * numbers alone: a run of digits is set in Nova Mono, and everything around
 * it stays in JetBrains Mono.
 *
 * A FIGURE IS NOT JUST ITS DIGITS. The letters that name the number travel
 * with it, because a number is one thing and a number with its unit or its
 * code in a different face is two things:
 *
 *   R50          the rand sign is part of the amount
 *   STAS102      the whole course code is one figure
 *   42%          the percent sign belongs to the number
 *   12 Mar 2026  the digits are figures; the month is a word
 *
 * So a figure is a run of letters immediately followed by digits — no space
 * between them, which is what separates `R50` and `STAS102` from a word
 * that happens to end in a number — and the punctuation that belongs to the
 * number travels with it: a decimal point, a thousands separator, the
 * percent sign, the slash in a fraction, the colon in a clock.
 */
const NUMERIC_RUN = /[A-Za-z]{0,8}\d+(?:[.,:/]\d+)*%?/g;

export type TextRun = {
  readonly text: string;
  /** Whether this run is a number, and so belongs in Nova Mono. */
  readonly numeric: boolean;
};

/**
 * Split a string into the runs that are numbers and the runs that are not.
 *
 * The order of the runs is the order of the text, and the numbers are
 * returned as they are found, so a caller can render them in place.
 */
export function splitNumericRuns(text: string): ReadonlyArray<TextRun> {
  const runs: TextRun[] = [];
  let last = 0;
  for (const match of text.matchAll(NUMERIC_RUN)) {
    const at = match.index ?? 0;
    if (at > last) runs.push({ text: text.slice(last, at), numeric: false });
    runs.push({ text: match[0], numeric: true });
    last = at + match[0].length;
  }
  if (last < text.length) runs.push({ text: text.slice(last), numeric: false });
  if (runs.length === 0) return [{ text, numeric: false }];
  return runs;
}

/** The font files, as `expo-font` wants them. */
export const FONT_ASSETS = {
  "JetBrainsMono-Regular": require("../../assets/fonts/JetBrainsMono-Regular.ttf"),
  "JetBrainsMono-Medium": require("../../assets/fonts/JetBrainsMono-Medium.ttf"),
  "JetBrainsMono-Bold": require("../../assets/fonts/JetBrainsMono-Bold.ttf"),
  "JetBrainsMono-ExtraBold": require("../../assets/fonts/JetBrainsMono-ExtraBold.ttf"),
  "NovaMono-Regular": require("../../assets/fonts/NovaMono-Regular.ttf"),
} as const;
