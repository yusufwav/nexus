/**
 * THE MATHS
 * ---------------------------------------------------------------------------
 * LaTeX, drawn with `<Text>` and `<View>`.
 *
 * WHY NOT KATEX
 * ---------------------------------------------------------------------------
 * The web app draws its maths with KaTeX, through Streamdown's math plugin.
 * KaTeX is a web library: it makes HTML and CSS, and it renders in a
 * browser. Putting it in this app would mean a WebView per equation — in a
 * scrolling chat, where a dozen equations can be on the screen at once —
 * and it would break the two rules the app is built on: everything is
 * native, and nothing needs a network.
 *
 * So the maths is set here, natively, and the reason it can be is the font.
 *
 * WHY A BOX LAYOUT ENGINE
 * ---------------------------------------------------------------------------
 * React Native cannot lay maths out. There is no `View` inside a `Text`, and
 * in the New Architecture a nested `<Text>` is a SPAN — `TextProps` does not
 * extend `ViewProps` — so it cannot be transformed or repositioned. A
 * superscript cannot be raised inside a paragraph, and a fraction cannot be
 * built out of one.
 *
 * So the maths is laid out by `src/lib/latex/layout.ts`, and drawn here.
 *
 * WHY THE POSITIONS ARE EXACT
 * ---------------------------------------------------------------------------
 * The app's face is monospace — 0.6em per glyph, read out of the font file
 * by `scripts/generate-font-metrics.mjs` — so every width is arithmetic and
 * nothing has to be measured on the device. A fraction's numerator is
 * CENTRED on a rule that was never measured.
 *
 * THE TWO SIZES
 * ---------------------------------------------------------------------------
 * Inline maths is set at the prose size, so it belongs to the sentence
 * around it. A displayed equation is set a little larger and given room
 * above and below, because it is a thing the reader stops at.
 */
import { StyleSheet, Text, View } from "react-native";

import { layoutMath, type Layout } from "@/lib/latex";
import { MATH_METRICS } from "@/lib/latex/metrics";
import { FONT } from "@/theme/typography";
import type { Variant } from "@/lib/latex/symbols";

/**
 * THE LARGER OF TWO NUMBERS.
 *
 * `Math.max` cannot be used in this file: the component exported below is
 * called `Math`, and inside it the name refers to the component rather than
 * to the global. This is here so that the trap is written down once.
 */
const larger = (a: number, b: number): number => (a > b ? a : b);

/** The size inline maths is set at — the prose size. */
const INLINE_SIZE = 14;

/** The size a displayed equation is set at. */
const DISPLAY_SIZE = 15;

/**
 * The two sizes, exported so that a caller which has to ALIGN the maths
 * with the prose around it is working from the same numbers.
 */
export const MATH_SIZE = { inline: INLINE_SIZE, display: DISPLAY_SIZE } as const;

/** Which family a run is set in. */
function familyFor(variant: Variant): string {
  switch (variant.face) {
    case "nova":
      return FONT.nova;
    case "bold":
      return FONT.bold;
    case "medium":
      return FONT.medium;
    default:
      return FONT.regular;
  }
}

export type MathProps = {
  /** The LaTeX, without the delimiters. */
  readonly latex: string;
  /** Whether this is a displayed equation rather than an inline one. */
  readonly display?: boolean;
  /** The colour of the maths. */
  readonly color: string;
  /** The colour of a fraction's rule and an accent's mark. */
  readonly ruleColor?: string;
};

/**
 * The box of a piece of maths that has ALREADY been laid out.
 *
 * The layout is a separate argument because the caller often needs the
 * metrics as well as the drawing — a line of prose with an equation in it
 * has to know where the equation's BASELINE is, so that it can sit on the
 * text rather than float beside it.
 */
export function MathBox({
  layout,
  display = false,
  color,
  ruleColor,
}: {
  readonly layout: Layout;
  readonly display?: boolean;
  readonly color: string;
  readonly ruleColor?: string;
}): React.JSX.Element {
  const size = display ? DISPLAY_SIZE : INLINE_SIZE;

  /*
   * The container's height is the expression's height plus its depth, and
   * its TOP is the expression's top — so a primitive's distance from the
   * top is the expression's height less the primitive's distance from the
   * baseline.
   */
  const lineHeightEm = MATH_METRICS.ascender + MATH_METRICS.descenderDepth;

  return (
    <View
      style={[
        styles.box,
        {
          width: larger(1, layout.width * size),
          height: larger(1, (layout.height + layout.depth) * size),
        },
      ]}
    >
      {layout.primitives.map((primitive, index) => {
        if (primitive.type === "rule") {
          return (
            <View
              key={`rule-${index}`}
              style={{
                position: "absolute",
                left: primitive.x * size,
                top: (layout.height - primitive.y - primitive.thickness) * size,
                width: larger(1, primitive.width * size),
                height: larger(1, primitive.thickness * size),
                backgroundColor: ruleColor ?? color,
                opacity: 0.85,
              }}
            />
          );
        }

        const fontSize = primitive.scale * size;
        return (
          <Text
            key={`text-${index}`}
            style={{
              position: "absolute",
              left: primitive.x * size,
              top: (layout.height - primitive.y) * size - MATH_METRICS.ascender * fontSize,
              fontFamily: familyFor(primitive.variant),
              fontSize,
              fontStyle: primitive.variant.italic ? "italic" : "normal",
              // The line height IS the font's ascent plus its descent, which
              // puts the glyph's baseline exactly where the layout says it is.
              lineHeight: lineHeightEm * fontSize,
              includeFontPadding: false,
              color,
            }}
          >
            {primitive.text}
          </Text>
        );
      })}
    </View>
  );
}

/**
 * A piece of maths, laid out and drawn.
 *
 * The convenience form, for the places where the caller does not care about
 * the metrics.
 */
export function Math({
  latex,
  display = false,
  color,
  ruleColor,
}: MathProps): React.JSX.Element {
  const { layout } = layoutMath(latex, display);
  return <MathBox layout={layout} display={display} color={color} ruleColor={ruleColor} />;
}

const styles = StyleSheet.create({
  box: {
    // The maths is a box of a known size, and it must not be laid out as if
    // it were a line of text.
    overflow: "visible",
  },
});
