/**
 * THE TERMINAL PANEL
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/components/landing/terminal-hero.tsx
 *
 * THE README CONTAINER, REBUILT FOR A PHONE.
 * ---------------------------------------------------------------------------
 * On the web the README is a terminal window: a bar with three dots and a
 * path on the right, and a body that holds a comment, a shell prompt, a
 * headline and some prose. It is the one piece of chrome that says "this
 * is a file, and you are reading it" rather than "this is a card".
 *
 * This is that container, and it is a SHELL, not a page:
 *
 *   · it carries NO TEXT of its own. The title in the bar is a prop and the
 *     body is children, so the same container can hold the README, a lesson
 *     summary, a lesson's worked example or a test fixture;
 *   · it has NO FIXED HEIGHT. The bar is chrome; the body grows with what is
 *     put in it, so the container is exactly as tall as its content and no
 *     taller.
 *
 * THE PANEL IS NOT HAND-ROLLED
 * ---------------------------------------------------------------------------
 * The surface underneath the bar and the body is `GlassPanel` — the app's one
 * container treatment, with the fill, the grain and the edge. This component
 * only adds the terminal's CHROME on top of it. A second background treatment
 * would be a second product.
 *
 * THE CORNER RADIUS IS THE CALLER'S
 * ---------------------------------------------------------------------------
 * `STYLING.md` §1.2 puts `borderRadius: 0` everywhere, because a square
 * corner is the signal that this is an engineered surface and not a
 * friendly card. The panels keep it. The terminal does not: a terminal is
 * CHROME, and chrome on a phone is chrome with a curve on it, so the radius
 * is a prop and the caller says what it wants.
 */
import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { RADIUS } from "@/theme/radius";
import { GlassPanel, type PanelStrength } from "@/components/ui/GlassPanel";

export type TerminalPanelProps = {
  /**
   * The body. The container is exactly as tall as this, so a longer body
   * gives a taller container.
   */
  children: ReactNode;
  /**
   * The corner radius, in points. `RADIUS.panel` is the house style; a panel
   * opts out of it says so here rather than by hard-coding a style.
   */
  radius?: number;
  /** How much the panel leans on its own background. */
  strength?: PanelStrength;
  /** The padding inside the body. */
  padding?: number;
  style?: StyleProp<ViewStyle>;
  /** The bar's own style, for the rare case that it needs to differ. */
  barStyle?: StyleProp<ViewStyle>;
};

export function TerminalPanel({
  children,
  strength = "medium",
  padding = 22,
  radius = RADIUS.panel,
  style,
  barStyle,
}: TerminalPanelProps): React.JSX.Element {
  const theme = useActiveTheme();

  return (
    <GlassPanel strength={strength} padding={0} radius={radius} style={style}>
      {/* ---- the bar: three dots, and nothing else ---- */}
      <View
        style={[
          styles.bar,
          {
            backgroundColor: theme.tokens.surfaceRaised,
            borderBottomColor: theme.tokens.line,
          },
          barStyle,
        ]}
      >
        <View style={styles.dots}>
          {/* The first dot is the accent, the way a terminal marks the one
              window that has focus. */}
          <View style={[styles.dot, { backgroundColor: theme.tokens.accentDot }]} />
          <View style={[styles.dot, { backgroundColor: theme.tokens.line }]} />
          <View style={[styles.dot, { backgroundColor: theme.tokens.line }]} />
        </View>
      </View>

      {/* ---- the body: whatever the caller put in it ---- */}
      <View style={{ padding }}>{children}</View>
    </GlassPanel>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
});
