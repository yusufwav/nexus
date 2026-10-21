/**
 * THE SCREEN HEADER
 * ---------------------------------------------------------------------------
 * The terminal's bar, at the top of the screen, with the app's own title in
 * it.
 *
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------
 * The README container is a TERMINAL WINDOW: a bar with three dots, and a
 * body under it. That bar is the app's most recognisable piece of chrome, and
 * it was doing two jobs at once — being the window's chrome, and being the
 * only thing at the top of the screen.
 *
 * So the bar is now its own thing, at the top of the screen, and the README
 * container keeps its own smaller bar under it. The header is the big one:
 * it reaches UP into the status bar, so the status bar's own background is
 * the header's background and there is no seam between them.
 *
 * IT IS THE SAME BAR, MADE BIGGER
 * ---------------------------------------------------------------------------
 * The header is not a new idea — it is the README container's own bar, with
 * the same parts in the same places:
 *
 *   · the same three dots, the first one in the accent colour, because that
 *     is how a terminal marks the one window that has focus;
 *   · the same raised surface behind them;
 *   · the same hairline along the bottom edge.
 *
 * Only the size is different. The dots are bigger, the row is taller, and
 * the title is a step down from the screen's own headline — because a bar
 * is a bar and not a headline.
 */
import { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";

/**
 * THE TITLE IN THE BAR.
 *
 * A step down from `TYPE.title`, because the bar is a bar and not a
 * headline: the title has to sit in the middle of a 44-point row without
 * shouting. `TYPE.subheading` is the size that reads as a label rather than
 * as a title, which is what a window's own bar wants.
 */
export const HEADER_TITLE = {
  ...TYPE.subheading,
  letterSpacing: 0.4,
} as const;

export type ScreenHeaderProps = {
  /**
   * What sits in the middle of the bar, over the dots.
   *
   * It is centred across the WHOLE bar, not the space beside the dots, so
   * the title is genuinely in the middle of the screen rather than in the
   * middle of the gap the dots leave.
   */
  children?: ReactNode;
  /**
   * The screen's name, in the bar.
   *
   * A convenience for the common case: it is centred and set in the
   * header's own title size, which is a step down from the screen's own
   * headline because the bar is a bar and not a headline.
   */
  title?: string;
  /** The height of the bar itself, below the status bar. */
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function ScreenHeader({
  children,
  title,
  height = 44,
  style,
}: ScreenHeaderProps): React.JSX.Element {
  const theme = useActiveTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          // The status bar's own height, plus the bar. This is what puts the
          // header's background UNDER the status bar.
          height: insets.top + height,
          paddingTop: insets.top,
          // The bar's own surface — the same raised colour the README
          // container's bar uses, so the two read as the same material.
          backgroundColor: theme.tokens.surfaceRaised,
          // The same hairline along the bottom edge, so the bar has a lip
          // and the content below it has a line to sit under.
          borderBottomColor: theme.tokens.line,
        },
        style,
      ]}
    >
      {/* ---- the bar itself: one row, everything centred in it ---- */}
      <View style={[styles.bar, { height }]}>
        {/* ---- the dots, exactly as the terminal draws them ---- */}
        <View style={styles.dots}>
          {/* The first dot is the accent, the way a terminal marks the one
              window that has focus. */}
          <View style={[styles.dot, { backgroundColor: theme.tokens.accentDot }]} />
          <View style={[styles.dot, { backgroundColor: theme.tokens.line }]} />
          <View style={[styles.dot, { backgroundColor: theme.tokens.line }]} />
        </View>

        {/* ---- the title, centred over the whole bar ---- */}
        {title !== undefined ? (
          <View style={styles.title} pointerEvents="box-none">
            <Text style={[styles.titleText, { color: theme.tokens.fg }]}>{title}</Text>
          </View>
        ) : children !== undefined ? (
          <View style={styles.title} pointerEvents="box-none">
            {children}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    // The dots sit where the README container's own dots sit, and the row
    // is taller, because this bar is the big one.
    paddingHorizontal: 12,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    // The terminal's dots are 5 points across and 3 apart. These are a step
    // bigger, because the bar they are in is a step bigger.
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  title: {
    // The title is centred ACROSS THE WHOLE BAR, so it is not pushed by
    // the dots: the dots are in the row's own flow and the title takes the
    // full width, centred within it.
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  titleText: {
    ...HEADER_TITLE,
  },
});
