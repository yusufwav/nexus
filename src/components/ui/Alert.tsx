/**
 * THE ALERT
 * ---------------------------------------------------------------------------
 * HeroUI's Alert, rebuilt in this app's own idiom.
 *
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------
 * A message that needs saying in a place the reader will look: a
 * problem with a form, a note about a setting, a confirmation that
 * something happened. It is not a toast — a toast goes away, and an
 * alert stays until it is read.
 *
 * THE FIVE STATUSES
 * ---------------------------------------------------------------------------
 * `default`, `accent`, `success`, `warning` and `danger`. The status
 * does two things: it tints the indicator, and it tints the title. The
 * BODY of the alert is always the ordinary foreground colour, because the
 * body is a sentence to be read and a coloured sentence is a harder
 * sentence.
 *
 * The soft tints are the palette's own colour at 15% — which is how
 * HeroUI does it too, and why the tint works on all fifty-two palettes
 * without a table of per-palette tints.
 */
import { type ReactNode } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { useSemantic } from "@/theme/semantic";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";

export type AlertStatus = "default" | "accent" | "success" | "warning" | "danger";

export type AlertProps = {
  title?: string;
  children?: ReactNode;
  status?: AlertStatus;
  /** An icon or a dot at the leading edge. */
  indicator?: ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * AN ALERT.
 *
 * A panel with a status, a title and a body. The panel is the app's own
 * `GlassPanel` — the one container treatment — and the status is what is
 * added to it.
 */
export function Alert({
  title,
  children,
  status = "default",
  indicator,
  style,
  accessibilityLabel,
}: AlertProps): React.JSX.Element {
  const s = useSemantic();

  const tone = (() => {
    switch (status) {
      case "default":
        return { ink: s.foreground, dot: s.dim, tint: s.surfaceTertiary };
      case "accent":
        return { ink: s.accentSoftForeground, dot: s.accent, tint: s.accentSoft };
      case "success":
        return { ink: s.successSoftForeground, dot: s.success, tint: s.successSoft };
      case "warning":
        return { ink: s.warningSoftForeground, dot: s.warning, tint: s.warningSoft };
      case "danger":
        return { ink: s.dangerSoftForeground, dot: s.danger, tint: s.dangerSoft };
    }
  })();

  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.root,
        { backgroundColor: tone.tint, borderRadius: RADIUS.panel },
        style,
      ]}
    >
      {indicator !== undefined ? (
        <View style={styles.indicator}>{indicator}</View>
      ) : (
        <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      )}

      <View style={styles.body}>
        {title !== undefined ? (
          <Text style={[styles.title, { color: tone.ink }]}>{title}</Text>
        ) : null}
        {children !== undefined ? (
          <Text style={[styles.text, { color: s.muted }]}>{children}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 14,
  },
  indicator: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 4,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  title: {
    ...TYPE.subheading,
  },
  text: {
    ...TYPE.small,
    lineHeight: 19,
  },
});
