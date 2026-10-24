/**
 * THE BUTTON
 * ---------------------------------------------------------------------------
 * HeroUI's Button, rebuilt in this app's own idiom.
 *
 * WHY IT IS REBUILT AND NOT INSTALLED
 * ---------------------------------------------------------------------------
 * HeroUI Native is a real library and it supports this app's exact stack
 * (Expo SDK 58, React Native 0.88, Gesture Handler 3). But it is built
 * on Tailwind CSS v4 by way of Uniwind, and this app has no Tailwind, a
 * different container treatment of its own (`GlassPanel`), fifty-two
 * palettes rather than HeroUI's one light and one dark, and a typography
 * scale of its own. Installing it would mean a second styling system
 * fighting the first one, and a palette system that could not do what
 * this app's does.
 *
 * So the DESIGN is taken and the LIBRARY is not. What follows is the
 * anatomy, the variant ladder, the size ladder and the press behaviour
 * of HeroUI's Button, expressed in this app's tokens.
 *
 * THE VARIANT LADDER
 * ---------------------------------------------------------------------------
 * HeroUI's principle is SEMANTIC INTENT OVER VISUAL STYLE: a button says
 * what it is FOR, not what it looks like. That is the ladder, and it is
 * borrowed exactly:
 *
 *   primary    the main action, to move forward. One per context.
 *   secondary  an alternative action. Several allowed.
 *   tertiary   a dismissive action — cancel, skip. Sparingly.
 *   outline    a bordered button that sits on a surface.
 *   ghost      no fill at all, for the quietest actions.
 *   danger     a destructive action.
 *   danger-soft  a destructive action that is not the main one.
 *
 * The app's own names were `primary`, `ghost`, `danger` and `quiet`, and
 * `quiet` is gone: it was `ghost` under another name. The old names
 * still work, so nothing that calls a button has to change today.
 *
 * THE SIZE LADDER
 * ---------------------------------------------------------------------------
 * HeroUI's sizes are `sm`, `md` and `lg`, and so are these, measured the
 * way HeroUI measures them: a 40-point button, a 48-point one, and a
 * 56-point one, with the padding and the gap growing alongside.
 */
import { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useSemantic } from "@/theme/semantic";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";
import { PressableFeedback } from "@/components/ui/PressableFeedback";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-soft";

/**
 * THE APP'S OLDER NAMES.
 *
 * The app had four button looks before HeroUI's ladder, and the calls
 * that used them are all over the place. They are kept, and they keep
 * their MEANING: `ghost` was a BORDERED button and `quiet` was a
 * borderless one, which is the opposite of what the same words mean in
 * HeroUI.
 *
 * So the old names are translated on the way in rather than being
 * aliased onto the new ones, and a button that says `ghost` looks exactly
 * as it did before this change. New code should say `variant`.
 */
export type ButtonTone = "primary" | "ghost" | "danger" | "quiet";

const TONE_VARIANT: Record<ButtonTone, ButtonVariant> = {
  primary: "primary",
  /* A bordered button, which HeroUI calls `outline`. */
  ghost: "outline",
  danger: "danger",
  /* A borderless one, which HeroUI calls `ghost`. */
  quiet: "ghost",
};

export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  /** The button's text. */
  label?: string;
  /** Custom content — an icon and a label, for instance. */
  children?: ReactNode;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** The app's older name for `variant`, kept so existing calls work. */
  tone?: ButtonTone;
  size?: ButtonSize;
  disabled?: boolean;
  /** A square button that holds an icon and nothing else. */
  isIconOnly?: boolean;
  /**
   * Stretches to the width of its container.
   *
   * A button is content-sized by default, which is what HeroUI does and
   * what a button in a row of buttons wants. A button that is the main
   * action of a SCREEN wants the screen's width instead, and that is what
   * this is for.
   */
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
};

/**
 * The sizes, in points. HeroUI's ladder, in this app's units.
 *
 * THE RADIUS
 * ---------------------------------------------------------------------------
 * HeroUI's buttons are rounded at `--radius-3xl` — 24 points — and at
 * `--radius-4xl` for the large one. That is a LOTTED curve, and a corner
 * that round on a 48-point button would make it a pill, and a pill is a
 * shape with a meaning: a segmented control, a tab bar. So the buttons
 * take the app's own CONTROL radius, which is the same one a chip and an
 * input take, and the ladder's larger steps are for the surfaces.
 */
const SIZES = {
  sm: { height: 40, padding: 14, gap: 6, radius: RADIUS.control },
  md: { height: 48, padding: 16, gap: 8, radius: RADIUS.control },
  lg: { height: 56, padding: 20, gap: 10, radius: RADIUS.control },
} as const;

export function Button({
  label,
  children,
  onPress,
  variant,
  tone,
  size = "md",
  disabled = false,
  isIconOnly = false,
  fullWidth = false,
  style,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: ButtonProps): React.JSX.Element {
  const s = useSemantic();

  /*
   * THE OLD NAMES.
   *
   * `quiet` was this app's name for a button with no fill and no border,
   * and `ghost` was its name for a BORDERED one — the opposite of what
   * the same words mean in HeroUI. They are translated on the way in, so
   * a button that says `ghost` looks exactly as it did before.
   */
  const resolved: ButtonVariant =
    variant ?? TONE_VARIANT[tone ?? "primary"];

  const metrics = SIZES[size];

  const surface: { background: string; border: string; ink: string } = (() => {
    switch (resolved) {
      case "primary":
        return { background: s.accent, border: s.accent, ink: s.accentForeground };
      case "secondary":
        return { background: s.default, border: s.default, ink: s.foreground };
      case "tertiary":
        return { background: s.default, border: s.default, ink: s.muted };
      case "outline":
        // HeroUI's outline is transparent, but this app's panels are
        // opaque and a transparent button on one disappears into it. So
        // the outline keeps the app's own quiet raised surface UNDER the
        // border, which is what the old bordered button looked like.
        return { background: s.surfaceTertiary, border: s.border, ink: s.foreground };
      case "ghost":
        return { background: "transparent", border: "transparent", ink: s.muted };
      case "danger":
        return { background: s.danger, border: s.danger, ink: s.dangerForeground };
      case "danger-soft":
        return { background: s.dangerSoft, border: s.dangerSoft, ink: s.dangerSoftForeground };
    }
  })();

  /*
   * THE PRESS HIGHLIGHT.
   *
   * The wash that lays over the control while it is held down.
   *
   * On the black and white palettes it is the PAGE'S OWN COLOUR, so a
   * pressed control recedes into the page rather than lighting up. On
   * the colourful ones it is the ink of the fill. Both are decided in
   * the semantic layer, because a component that picked the wash
   * itself would have to know which palettes are which.
   */
  const highlight =
    resolved === "primary" || resolved === "danger"
      ? s.pressWashAccent
      : s.pressWash;

  const content =
    children ?? (
      <Text
        style={[
          styles.label,
          size === "sm" ? TYPE.small : size === "lg" ? TYPE.subheading : TYPE.body,
          { color: surface.ink },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    );

  return (
    <PressableFeedback
      onPress={onPress}
      disabled={disabled}
      highlight={disabled ? null : highlight}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      testID={testID}
      style={[
        styles.root,
        {
          height: metrics.height,
          paddingHorizontal: isIconOnly ? 0 : metrics.padding,
          gap: metrics.gap,
          borderRadius: metrics.radius,
          backgroundColor: surface.background,
          borderColor: surface.border,
          borderWidth: resolved === "outline" ? StyleSheet.hairlineWidth : 0,
          opacity: disabled ? 0.45 : 1,
          // An icon-only button has no text to size it, so it is given the
          // square its own height makes.
          width: isIconOnly ? metrics.height : undefined,
          alignSelf: fullWidth ? "stretch" : "flex-start",
        },
        style,
      ]}
    >
      {isIconOnly ? (
        <View style={styles.iconOnly}>{content}</View>
      ) : (
        content
      )}
    </PressableFeedback>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    // The press highlight is clipped by the button's own curve.
    overflow: "hidden",
  },
  iconOnly: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    ...TYPE.subheading,
    letterSpacing: 0.6,
  },
});
