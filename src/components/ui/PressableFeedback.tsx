/**
 * PRESS FEEDBACK
 * ---------------------------------------------------------------------------
 * HeroUI's answer to "how does a button feel pressed", and the reason
 * every control in this kit looks alive.
 *
 * WHAT IT IS
 * ---------------------------------------------------------------------------
 * Two things happen at once when a control is pressed:
 *
 *   1. THE CONTROL SHRINKS. A scale of 0.985 — barely more than one
 *      percent — which reads as the surface being pushed in rather than
 *      as the whole thing bouncing.
 *
 *   2. A HIGHLIGHT LAYS OVER IT. A wash of the colour the control
 *      turns into when it is hovered, fading in and back out. It is what
 *      makes the press feel like the surface is lit rather than like the
 *      whole thing bouncing.
 *
 * The scale is animated on the UI thread, so it is smooth even while the
 * JS thread is busy — which matters on a phone, where the JS thread is
 * often busy.
 *
 * WHY IT IS ITS OWN COMPONENT
 * ---------------------------------------------------------------------------
 * Because five different controls want it and none of them should each
 * grow their own copy: the button, the chip, the list row, the select
 * trigger, the tab. One implementation, one set of numbers, one place
 * where "how hard does a press push in" is decided.
 */
import { type ReactNode } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from "react-native-reanimated";

/**
 * The Pressable, made animatable.
 *
 * The scale has to be ON the control itself, not on a view around its
 * children: a view that is absolutely positioned contributes nothing to
 * the control's size, so a button built that way has no width at all and
 * collapses to whatever its padding is.
 */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** How far in a press pushes the surface. One and a half percent. */
const PRESSED_SCALE = 0.985;

/** How long the press takes to go in, and to come back out. */
const IN_MS = 90;
const OUT_MS = 160;

export type PressableFeedbackProps = {
  children: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  /**
   * The colour of the highlight that lays over the control while it is
   * pressed. `null` means no highlight — scale only.
   */
  highlight?: string | null;
  style?: StyleProp<ViewStyle>;
  accessibilityRole?: "button" | "switch" | "checkbox" | "radio" | "tab" | "menuitem";
  accessibilityLabel?: string;
  accessibilityState?: { disabled?: boolean; selected?: boolean; checked?: boolean };
  accessibilityHint?: string;
  testID?: string;
};

export function PressableFeedback({
  children,
  onPress,
  disabled = false,
  highlight = null,
  style,
  accessibilityRole = "button",
  accessibilityLabel,
  accessibilityState,
  accessibilityHint,
  testID,
}: PressableFeedbackProps): React.JSX.Element {
  const pressed = useSharedValue(0);
  const highlightAlpha = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - (1 - PRESSED_SCALE) * pressed.value }],
  }));
  const highlightStyle = useAnimatedStyle(() => ({
    opacity: highlightAlpha.value,
  }));

  return (
    <AnimatedPressable
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      accessibilityHint={accessibilityHint}
      testID={testID}
      disabled={disabled}
      onPressIn={() => {
        pressed.set(withTiming(1, { duration: IN_MS, easing: Easing.out(Easing.ease) }));
        if (highlight !== null) {
          highlightAlpha.set(withTiming(1, { duration: IN_MS, easing: Easing.out(Easing.ease) }));
        }
      }}
      onPressOut={() => {
        pressed.set(withTiming(0, { duration: OUT_MS, easing: Easing.out(Easing.ease) }));
        if (highlight !== null) {
          highlightAlpha.set(withTiming(0, { duration: OUT_MS, easing: Easing.out(Easing.ease) }));
        }
      }}
      onPress={onPress}
      style={[style, animatedStyle]}
    >
      {children}
      {highlight !== null ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.highlight, { backgroundColor: highlight }, highlightStyle]}
        />
      ) : null}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  highlight: {
    ...StyleSheet.absoluteFill,
  },
});
