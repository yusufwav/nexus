/**
 * THE SMALL SURFACES
 * ---------------------------------------------------------------------------
 * `Chip`, `Badge`, `Avatar`, `Separator`, `Spinner` and `Skeleton` —
 * HeroUI's smallest parts, rebuilt in this app's own idiom.
 *
 * WHY THEY ARE IN ONE FILE
 * ---------------------------------------------------------------------------
 * Because they are all small, all have the same shape of problem — a
 * colour, a size, an optional icon — and because a kit that grows one
 * file per component ends up with more files than components.
 */
import { type ReactNode, useEffect } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useSemantic } from "@/theme/semantic";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";
import { PressableFeedback } from "@/components/ui/PressableFeedback";

/* ------------------------------------------------------------------ *
 *  Chip
 * ------------------------------------------------------------------ */

export type ChipVariant = "primary" | "secondary" | "tertiary" | "success" | "warning" | "danger";
export type ChipSize = "sm" | "md" | "lg";

export type ChipProps = {
  label: string;
  onPress?: () => void;
  variant?: ChipVariant;
  size?: ChipSize;
  /** An icon or a dot at the leading edge. */
  startContent?: ReactNode;
  /** A remove button at the trailing edge. */
  onClose?: () => void;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * A CHIP.
 *
 * A capsule, because a chip is a label you can touch and a capsule is
 * the shape that says so. HeroUI's sizes are a 2-unit pad at `sm`, 3 at
 * `md` and 4 at `lg`, and its radius grows with them.
 */
export function Chip({
  label,
  onPress,
  variant = "secondary",
  size = "md",
  startContent,
  onClose,
  selected = false,
  style,
  accessibilityLabel,
}: ChipProps): React.JSX.Element {
  const s = useSemantic();

  const metrics = {
    sm: { padding: 8, vertical: 2, radius: RADIUS.lg, text: TYPE.small },
    md: { padding: 12, vertical: 4, radius: RADIUS.xl, text: TYPE.small },
    lg: { padding: 16, vertical: 6, radius: RADIUS["2xl"], text: TYPE.body },
  }[size];

  const surface = (() => {
    switch (variant) {
      case "primary":
        return { bg: s.accent, ink: s.accentForeground };
      case "secondary":
        return { bg: s.default, ink: s.foreground };
      case "tertiary":
        return { bg: "transparent", ink: s.muted };
      case "success":
        return { bg: s.successSoft, ink: s.successSoftForeground };
      case "warning":
        return { bg: s.warningSoft, ink: s.warningSoftForeground };
      case "danger":
        return { bg: s.dangerSoft, ink: s.dangerSoftForeground };
    }
  })();

  /*
   * THE SELECTED CHIP.
   *
   * A chip that is chosen says so by being FILLED, not by being a
   * different colour — which is the same rule HeroUI follows, and the
   * reason a filter row of chips reads as a filter and not as a row of
   * labels.
   */
  const chosen = selected;
  const fill = chosen ? s.accent : surface.bg;
  const ink = chosen ? s.accentForeground : surface.ink;

  const body = (
    <>
      {startContent !== undefined ? <View style={styles.chipAffix}>{startContent}</View> : null}
      <Text style={[metrics.text, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
      {onClose !== undefined ? (
        <Text
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={onClose}
          style={[styles.chipClose, { color: ink }]}
        >
          ✕
        </Text>
      ) : null}
    </>
  );

  const shell = [
    styles.chip,
    {
      paddingHorizontal: metrics.padding,
      paddingVertical: metrics.vertical,
      borderRadius: metrics.radius,
      backgroundColor: fill,
      borderWidth: variant === "tertiary" ? StyleSheet.hairlineWidth : 0,
      borderColor: s.border,
    },
    style,
  ];

  if (onPress === undefined) {
    return <View style={shell}>{body}</View>;
  }

  return (
    <PressableFeedback
      onPress={onPress}
      highlight={s.pressWash}
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      style={shell}
    >
      {body}
    </PressableFeedback>
  );
}

/* ------------------------------------------------------------------ *
 *  Badge
 * ------------------------------------------------------------------ */

export type BadgeProps = {
  label?: string;
  /** A dot, for a status that needs no words. */
  color?: string;
  variant?: ChipVariant;
  size?: "sm" | "md";
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * A BADGE.
 *
 * The smallest thing in the kit: a dot, or a dot with a word on it. It
 * marks a state — a module you own, a model that is free, a note that
 * is new — and it never takes a tap.
 */
export function Badge({
  label,
  color,
  variant = "secondary",
  size = "md",
  style,
  accessibilityLabel,
}: BadgeProps): React.JSX.Element {
  const s = useSemantic();

  const ink = (() => {
    switch (variant) {
      case "primary":
        return s.accent;
      case "secondary":
        return s.muted;
      case "tertiary":
        return s.dim;
      case "success":
        return s.success;
      case "warning":
        return s.warning;
      case "danger":
        return s.danger;
    }
  })();

  const dot = size === "sm" ? 6 : 8;

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? label}
      style={[styles.badge, style]}
    >
      <View
        style={{
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          backgroundColor: color ?? ink,
        }}
      />
      {label !== undefined ? (
        <Text style={[TYPE.label, { color: ink }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  Avatar
 * ------------------------------------------------------------------ */

export type AvatarSize = "sm" | "md" | "lg";

export type AvatarProps = {
  /** A name to take the initials from. */
  name?: string;
  /** The initials themselves, if there is no name. */
  fallback?: string;
  size?: AvatarSize;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * AN AVATAR.
 *
 * Initials on a soft disc, which is what HeroUI shows when there is no
 * picture — and this app has no picture of anybody, so it is always
 * initials.
 */
export function Avatar({
  name,
  fallback,
  size = "md",
  style,
  accessibilityLabel,
}: AvatarProps): React.JSX.Element {
  const s = useSemantic();

  const metrics = { sm: 40, md: 48, lg: 64 }[size];

  const initials =
    fallback ??
    (name ?? "")
      .split(" ")
      .filter((part) => part.length > 0)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("");

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel ?? name}
      style={[
        styles.avatar,
        {
          width: metrics,
          height: metrics,
          borderRadius: RADIUS["3xl"],
          backgroundColor: s.default,
        },
        style,
      ]}
    >
      <Text style={[styles.avatarText, { color: s.foreground }]} numberOfLines={1}>
        {initials}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  Separator
 * ------------------------------------------------------------------ */

export type SeparatorProps = {
  orientation?: "horizontal" | "vertical";
  variant?: "thin" | "thick";
  style?: StyleProp<ViewStyle>;
};

/**
 * A SEPARATOR.
 *
 * A line. The `thin` one is a hairline, the `thick` one is six points,
 * and that is the whole of HeroUI's separator.
 */
export function Separator({
  orientation = "horizontal",
  variant = "thin",
  style,
}: SeparatorProps): React.JSX.Element {
  const s = useSemantic();
  const thick = variant === "thick";
  return (
    <View
      accessibilityRole="none"
      style={[
        orientation === "horizontal"
          ? { height: thick ? 6 : StyleSheet.hairlineWidth }
          : { width: thick ? 6 : StyleSheet.hairlineWidth, alignSelf: "stretch" },
        { backgroundColor: s.separator },
        style,
      ]}
    />
  );
}

/* ------------------------------------------------------------------ *
 *  Spinner
 * ------------------------------------------------------------------ */

export type SpinnerSize = "sm" | "md" | "lg";

export type SpinnerProps = {
  size?: SpinnerSize;
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * A SPINNER.
 *
 * A ring that turns. It is the app's loading state, and it replaces the
 * bare `ActivityIndicator` the boot screen used to show.
 */
export function Spinner({
  size = "md",
  color,
  style,
  accessibilityLabel = "Loading",
}: SpinnerProps): React.JSX.Element {
  const s = useSemantic();
  const metrics = { sm: 16, md: 24, lg: 32 }[size];

  const spin = useSharedValue(0);
  const animated = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));

  useEffect(() => {
    spin.set(
      withRepeat(
        withTiming(360, { duration: 900, easing: Easing.linear }),
        -1,
        false,
      ),
    );
  }, [spin]);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[styles.spinner, { width: metrics, height: metrics }, style]}
    >
      <Animated.View style={[styles.spinnerRing, animated]}>
        <View
          style={[
            styles.spinnerArc,
            {
              width: metrics,
              height: metrics,
              borderRadius: metrics / 2,
              borderColor: color ?? s.accent,
            },
          ]}
        />
      </Animated.View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  Skeleton
 * ------------------------------------------------------------------ */

export type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * A SKELETON.
 *
 * The shape of something that has not arrived yet. It pulses, which is
 * what tells the reader the content is coming rather than missing.
 */
export function Skeleton({
  width = "100%",
  height = 16,
  radius = RADIUS.sm,
  style,
}: SkeletonProps): React.JSX.Element {
  const s = useSemantic();

  const pulse = useSharedValue(0.4);
  const animated = useAnimatedStyle(() => ({ opacity: pulse.value }));

  useEffect(() => {
    pulse.set(
      withRepeat(
        withTiming(0.9, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      ),
    );
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius: radius, backgroundColor: s.surfaceTertiary },
        animated,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    overflow: "hidden",
  },
  chipAffix: {
    alignItems: "center",
    justifyContent: "center",
  },
  chipClose: {
    ...TYPE.small,
    fontSize: 12,
    paddingHorizontal: 2,
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: {
    ...TYPE.subheading,
    fontSize: 15,
  },
  spinner: {
    alignItems: "center",
    justifyContent: "center",
  },
  spinnerRing: {
    alignItems: "center",
    justifyContent: "center",
  },
  spinnerArc: {
    borderWidth: 2,
    borderTopColor: "transparent",
    borderRightColor: "transparent",
  },
});
