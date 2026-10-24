/**
 * THE SCREEN HEADER
 * ---------------------------------------------------------------------------
 * The app's one bar, at the top of the screen, with the screen's own title in
 * it.
 *
 * WHY IT EXISTS
 * ---------------------------------------------------------------------------
 * The README container used to be a TERMINAL WINDOW: a bar with three dots,
 * and a body under it. That bar was the app's most recognisable piece of
 * chrome, and it was doing two jobs at once — being the window's chrome, and
 * being the only thing at the top of the screen.
 *
 * So the bar is now its own thing, at the top of the screen, and it is the
 * ONLY one: the README container is a plain panel and carries no bar of its
 * own. Two rows of dots ten points apart is two terminal windows, not one
 * page. The header is the big one, and it reaches UP into the status bar, so
 * the status bar's own background is the header's background and there is no
 * seam between them.
 *
 * WHAT IS IN IT
 * ---------------------------------------------------------------------------
 *   · three dots, the first one in the accent colour, because that is how a
 *     terminal marks the one window that has focus;
 *   · a raised surface behind them;
 *   · a hairline along the bottom edge;
 *   · the screen's title, centred across the WHOLE bar;
 *   · the screen's own controls on the right, when it has any.
 *
 * Only the size is different from the bar it came from. The dots are bigger,
 * the row is taller, and the title is a step down from the screen's own
 * headline — because a bar is a bar and not a headline.
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
  /**
   * What sits on the RIGHT of the bar.
   *
   * This is the slot for a screen's own controls — the tutor's history,
   * new-chat and delete buttons — which belong in the bar rather than in a
   * row under it, and which the reader reaches for while they are reading.
   *
   * It is NOT the same as `children`. `children` is the centred title
   * overlay, and it is centred across the whole bar; `trailing` is in the
   * row's own flow, pushed to the right.
   *
   * The slot leaves room on the right for the side menu's button, which
   * floats in the top-right corner of the app — so a trailing control
   * never sits under it.
   */
  trailing?: ReactNode;
  /** The height of the bar itself, below the status bar. */
  height?: number;
  style?: StyleProp<ViewStyle>;
};

export function ScreenHeader({
  children,
  title,
  trailing,
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

        {/* ---- the screen's own controls, on the right ---- */}
        {trailing !== undefined ? (
          <View style={styles.trailing} pointerEvents="box-none">
            {trailing}
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
    // The dots sit on the left of the bar, where the terminal window that
    // this bar came from put them, and the row is taller than that window's
    // ever was, because this bar is the big one.
    paddingHorizontal: 12,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    // The bar this came from had 5-point dots, 3 apart. These are a step
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
  trailing: {
    // In the row's own flow, pushed to the right — not an overlay like the
    // title, because a control has to be where it is, not centred.
    marginLeft: "auto",
    /*
     * THE SIDE MENU'S BUTTON.
     *
     * It floats in the top-right corner of the app, 40 points wide and 12
     * from the edge. So the trailing slot stops 48 points short of the
     * edge: 12 for the margin, 40 for the button, and a little air so the
     * two do not touch.
     */
    marginRight: 48,
  },
});
