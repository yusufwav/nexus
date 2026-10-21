/**
 * A SMALL MARKDOWN RENDERER
 * ---------------------------------------------------------------------------
 * The tutor's answers are composed from the notes, and they use five marks:
 *
 *   **bold**      for headings and emphasis
 *   `code`       for inline identifiers
 *   ```          for a fenced block, which is how the worked examples read
 *   ·            for a bullet
 *   $...$        for inline maths, and $$...$$ for a displayed equation
 *
 * That is all. A full markdown library is a large dependency for five marks,
 * and the tutor's output is generated, so the grammar is known rather than
 * arbitrary.
 *
 * THE MATHS
 * ---------------------------------------------------------------------------
 * The maths is drawn by `src/components/Math.tsx`, which lays it out with a
 * box engine and draws it with `<Text>` and `<View>`. There is no WebView
 * and no KaTeX; see that file for why.
 *
 * THE ONE PLACE THE RENDERING SPLITS IN TWO
 * ---------------------------------------------------------------------------
 * A line with no maths is a paragraph, and a paragraph is a `<Text>` — one
 * box that wraps. A line WITH maths cannot be: an equation is a box of its
 * own, and React Native has no `View` inside a `Text`, so an equation in a
 * sentence means the sentence has to become a row of pieces.
 *
 * So there are two paths, and the ordinary one is left exactly as it was:
 *
 *   · no maths  →  one `<Text>`, which wraps the way text wraps;
 *   · maths     →  a row of pieces, each laid out on the same baseline.
 *
 * The second path is the one that has to work, so it is worth saying how the
 * baselines are made to agree. Every piece knows where its own baseline is,
 * in points, because the maths is monospace and its metrics are arithmetic
 * rather than measurement. The prose's baseline is known too, from the same
 * font's ascent and the line height. So the equation is given a margin that
 * puts its baseline exactly on the prose's, and the two read as one line.
 */
import { Fragment, type ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { RADIUS } from "@/theme/radius";
import { TYPE } from "@/theme/typography";
import { isDisplayDelimiter, layoutMath, splitLine, type LineSegment } from "@/lib/latex";
import type { Layout } from "@/lib/latex/layout";
import { MATH_METRICS } from "@/lib/latex/metrics";
import { MathBox, MATH_SIZE } from "@/components/Math";

type Segment = { text: string; bold: boolean; code: boolean };

/** Split a line into its bold and code runs. */
function parseInline(line: string): Segment[] {
  const segments: Segment[] = [];
  let rest = line;
  while (rest.length > 0) {
    const bold = rest.indexOf("**");
    const code = rest.indexOf("`");
    const next =
      bold === -1 ? code : code === -1 ? bold : Math.min(bold, code);
    if (next === -1) {
      segments.push({ text: rest, bold: false, code: false });
      break;
    }
    if (next > 0) {
      segments.push({ text: rest.slice(0, next), bold: false, code: false });
      rest = rest.slice(next);
      continue;
    }
    const marker = rest.slice(0, 2) === "**" ? "**" : "`";
    const end = rest.indexOf(marker, marker.length);
    if (end === -1) {
      segments.push({ text: rest, bold: false, code: false });
      break;
    }
    segments.push({
      text: rest.slice(marker.length, end),
      bold: marker === "**",
      code: marker === "`",
    });
    rest = rest.slice(end + marker.length);
  }
  return segments;
}

/**
 * Where the prose's baseline sits, in points from the top of a line.
 *
 * React Native centres a line's contents between the font's ascent and its
 * descent — the half-leading model — so with a line height of its own the
 * baseline is at half the slack plus the ascent.
 */
const PROSE_SIZE = 14;
const PROSE_LINE_HEIGHT = 23;
const PROSE_BASELINE =
  (PROSE_LINE_HEIGHT - (MATH_METRICS.ascender + MATH_METRICS.descenderDepth) * PROSE_SIZE) / 2 +
  MATH_METRICS.ascender * PROSE_SIZE;

/** One piece of maths, and where its baseline lands. */
type MathsPiece = {
  readonly latex: string;
  readonly display: boolean;
  readonly layout: Layout;
  /** The margin that puts its baseline on the prose's baseline. */
  readonly marginTop: number;
};

export function Markdown({ source }: { source: string }): React.JSX.Element {
  const theme = useActiveTheme();
  const lines = source.split("\n");

  const blocks: ReactNode[] = [];

  /*
   * A plain loop rather than `forEach`, because the accumulator variables are
   * reassigned inside the loop and TypeScript's control-flow analysis does
   * not track a `let` that a closure writes to.
   */
  let code: string[] | null = null;
  let bullets: string[] = [];
  /** The lines of a displayed equation being collected. */
  let display: string[] | null = null;

  const flushBullets = (): void => {
    if (bullets.length === 0) return;
    blocks.push(
      <View key={`bullets-${blocks.length}`} style={styles.bullets}>
        {bullets.map((b, i) => (
          <View key={`${i}-${b.slice(0, 12)}`} style={styles.bulletRow}>
            <Text style={[styles.bulletMark, { color: theme.tokens.accentA }]}>·</Text>
            <View style={styles.bulletText}>
              <InlineContent source={b} />
            </View>
          </View>
        ))}
      </View>,
    );
    bullets = [];
  };

  const flushDisplay = (): void => {
    if (display === null) return;
    const latex = display.join("\n").trim();
    display = null;
    if (latex.length === 0) return;
    const { layout } = layoutMath(latex, true);
    blocks.push(
      <View key={`display-${blocks.length}`} style={styles.display}>
        <MathBox layout={layout} display color={theme.tokens.fg} ruleColor={theme.tokens.fgMuted} />
      </View>,
    );
  };

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    if (code !== null) {
      if (line.trimStart().startsWith("```")) {
        blocks.push(
          <View key={`code-${index}`} style={[styles.code, { borderColor: theme.tokens.line }]}>
            <Text style={[styles.codeText, { color: theme.tokens.fg }]}>{code.join("\n")}</Text>
          </View>,
        );
        code = null;
      } else {
        code.push(line);
      }
      continue;
    }

    /* ---- a displayed equation, collected over several lines ---- */
    if (display !== null) {
      if (isDisplayDelimiter(line)) {
        flushDisplay();
      } else {
        display.push(line);
      }
      continue;
    }

    if (line.trimStart().startsWith("```")) {
      flushBullets();
      code = [];
      continue;
    }

    if (isDisplayDelimiter(line)) {
      flushBullets();
      display = [];
      continue;
    }

    if (line.startsWith("· ")) {
      bullets.push(line.slice(2));
      continue;
    }

    flushBullets();

    if (line.trim().length === 0) {
      blocks.push(<View key={`gap-${index}`} style={styles.gap} />);
      continue;
    }

    blocks.push(
      <View key={`p-${index}`} style={styles.paragraphBlock}>
        <InlineContent source={line} />
      </View>,
    );
  }

  flushBullets();
  flushDisplay();

  if (code !== null && code.length > 0) {
    blocks.push(
      <View key="code-tail" style={[styles.code, { borderColor: theme.tokens.line }]}>
        <Text style={[styles.codeText, { color: theme.tokens.fg }]}>{code.join("\n")}</Text>
      </View>,
    );
  }

  return <View>{blocks}</View>;
}

/**
 * A LINE OF THE ANSWER.
 *
 * With no maths it is one `<Text>`, which wraps. With maths it is a row of
 * pieces, and the pieces are put on one baseline.
 */
function InlineContent({ source }: { source: string }): React.JSX.Element {
  const theme = useActiveTheme();
  const segments = splitLine(source);

  const hasMath = segments.some((s) => s.kind !== "text");

  if (!hasMath) {
    const runs = parseInline(source);
    return (
      <Text style={[styles.paragraph, { color: theme.tokens.fgMuted }]}>
        {runs.map((run, i) => (
          <Fragment key={`${i}-${run.text.slice(0, 8)}`}>
            {run.code ? (
              <Text
                style={[
                  styles.inlineCode,
                  {
                    color: theme.tokens.synNum,
                    backgroundColor: theme.tokens.surfaceRaised,
                  },
                ]}
              >
                {run.text}
              </Text>
            ) : run.bold ? (
              <Text style={[styles.bold, { color: theme.tokens.fg }]}>{run.text}</Text>
            ) : (
              run.text
            )}
          </Fragment>
        ))}
      </Text>
    );
  }

  return <MathsLine segments={segments} />;
}

/**
 * A LINE WITH MATHS IN IT.
 *
 * The line becomes a row of pieces, and the pieces are put on one baseline:
 * the prose's baseline is known from the font's ascent and the line height,
 * and the maths's baseline is known from its own layout, so the margin that
 * joins them is arithmetic.
 */
function MathsLine({ segments }: { segments: readonly LineSegment[] }): React.JSX.Element {
  const theme = useActiveTheme();

  /*
   * PASS ONE: the maths, and where each piece's baseline lands.
   */
  const pieces: (MathsPiece | null)[] = [];
  let lowest = 0;

  for (const segment of segments) {
    if (segment.kind === "text") {
      pieces.push(null);
      continue;
    }
    const display = segment.kind === "display";
    const { layout } = layoutMath(segment.latex, display);
    const size = display ? MATH_SIZE.display : MATH_SIZE.inline;
    const marginTop = PROSE_BASELINE - layout.height * size;
    if (marginTop < lowest) lowest = marginTop;
    pieces.push({ latex: segment.latex, display, layout, marginTop });
  }

  /*
   * PASS TWO: the row.
   *
   * The padding is there because an equation can be TALLER than the line of
   * prose it sits in, and a tall equation's top would otherwise reach above
   * the row and be clipped by whatever is above it.
   */
  const paddingTop = Math.max(0, -lowest);

  return (
    <View style={[styles.mathsLine, { paddingTop }]}>
      {segments.map((segment, index) => {
        if (segment.kind === "text") {
          const runs = parseInline(segment.text);
          return (
            <Text key={`t-${index}`} style={[styles.paragraph, styles.mathsText, { color: theme.tokens.fgMuted }]}>
              {runs.map((run, i) => (
                <Fragment key={`${i}-${run.text.slice(0, 8)}`}>
                  {run.code ? (
                    <Text
                      style={[
                        styles.inlineCode,
                        {
                          color: theme.tokens.synNum,
                          backgroundColor: theme.tokens.surfaceRaised,
                        },
                      ]}
                    >
                      {run.text}
                    </Text>
                  ) : run.bold ? (
                    <Text style={[styles.bold, { color: theme.tokens.fg }]}>{run.text}</Text>
                  ) : (
                    run.text
                  )}
                </Fragment>
              ))}
            </Text>
          );
        }

        const piece = pieces[index];
        if (piece === null) return null;
        return (
          <View key={`m-${index}`} style={{ marginTop: piece.marginTop }}>
            <MathBox
              layout={piece.layout}
              display={piece.display}
              color={theme.tokens.fg}
              ruleColor={theme.tokens.fgMuted}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  paragraphBlock: {
    marginBottom: 2,
  },
  paragraph: {
    ...TYPE.body,
    fontSize: 14,
    lineHeight: 23,
  },
  mathsLine: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
  },
  mathsText: {
    // The prose pieces shrink rather than overflow, so a long sentence still
    // wraps inside the bubble.
    flexShrink: 1,
  },
  display: {
    alignItems: "center",
    marginVertical: 12,
  },
  bold: {
    fontWeight: "800",
  },
  inlineCode: {
    ...TYPE.code,
    fontSize: 13,
  },
  gap: {
    height: 12,
  },
  bullets: {
    marginBottom: 6,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  bulletMark: {
    width: 16,
    fontSize: 15,
    lineHeight: 24,
    fontWeight: "800",
  },
  bulletText: {
    flex: 1,
  },
  code: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    padding: 14,
    marginVertical: 10,
  },
  codeText: {
    ...TYPE.mono,
    fontSize: 12,
    lineHeight: 19,
  },
});
