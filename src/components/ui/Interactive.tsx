/**
 * THE INTERACTIVE PARTS
 * ---------------------------------------------------------------------------
 * HeroUI's `Tabs`, `Dialog`, `Tooltip`, `ProgressBar` and `RadioGroup`,
 * rebuilt in this app's own idiom.
 *
 * WHY THESE FIVE
 * ---------------------------------------------------------------------------
 * They are the five the app does not have and wants:
 *
 *   Tabs        a row of choices that shows one of several things. The
 *               practice screen's history, the appearance screen's
 *               groups — a screen of tabbed views rather than a screen
 *               of sections with headings.
 *   Dialog      a modal that asks for a decision. "Clear local data" is a
 *               destructive action with no confirmation, which is the one
 *               thing a modal is for.
 *   Tooltip     a hint on a control the reader may not understand. On a
 *               phone it is a long press, not a hover.
 *   ProgressBar a bar that says how far along something is.
 *   RadioGroup  a set of options where exactly one is chosen.
 */
import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useSemantic } from "@/theme/semantic";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";
import { PressableFeedback } from "@/components/ui/PressableFeedback";

/* ------------------------------------------------------------------ *
 *  Tabs
 * ------------------------------------------------------------------ */

export type TabsProps = {
  /** The tab that is showing. */
  value: string;
  onValueChange: (value: string) => void;
  /** The tab bar. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * THE TAB BAR.
 *
 * HeroUI's tabs are a row of triggers with an indicator that slides under
 * the chosen one. The indicator is the part that matters: it is what says
 * "these are choices, and this is the one you have made", and without it
 * a row of tabs is a row of buttons.
 */
export function Tabs({ value, onValueChange, children, style }: TabsProps): React.JSX.Element {
  const s = useSemantic();
  return (
    <View style={[styles.tabsRoot, { backgroundColor: s.default, borderRadius: RADIUS.panel }, style]}>
      {children}
    </View>
  );
}

export type TabsTriggerProps = {
  value: string;
  /** Whether this is the tab that is showing. */
  active: boolean;
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function TabsTrigger({
  active,
  onPress,
  children,
  style,
}: TabsTriggerProps): React.JSX.Element {
  const s = useSemantic();
  return (
    <PressableFeedback
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      highlight={s.pressWash}
      style={[
        styles.tabTrigger,
        {
          backgroundColor: active ? s.surface : "transparent",
          borderRadius: RADIUS.lg,
        },
        style,
      ]}
    >
      {children}
    </PressableFeedback>
  );
}

export function TabsLabel({ children }: { children: ReactNode }): React.JSX.Element {
  const s = useSemantic();
  return (
    <Text style={[styles.tabLabel, { color: s.foreground }]} numberOfLines={1}>
      {children}
    </Text>
  );
}

/* ------------------------------------------------------------------ *
 *  Dialog
 * ------------------------------------------------------------------ */

export type DialogProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  /** The buttons along the bottom. */
  actions?: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A DIALOG.
 *
 * A panel over a dimmed page, for something the reader has to decide
 * about. The scrim is the page's own colour at 55% — dark enough that
 * the page behind it stops being the thing you are looking at.
 */
export function Dialog({
  visible,
  onClose,
  title,
  children,
  actions,
  style,
}: DialogProps): React.JSX.Element {
  const s = useSemantic();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.dialogScrim, { backgroundColor: s.backdrop }]}
        onPress={onClose}
        accessibilityLabel="Close"
        accessibilityRole="button"
      />
      <View style={styles.dialogWrap} pointerEvents="box-none">
        <View
          style={[
            styles.dialog,
            { backgroundColor: s.overlay, borderColor: s.border, borderRadius: RADIUS["2xl"] },
            style,
          ]}
        >
          {title !== undefined ? (
            <Text style={[styles.dialogTitle, { color: s.foreground }]}>{title}</Text>
          ) : null}
          {children !== undefined ? (
            <View style={styles.dialogBody}>
              {typeof children === "string" ? (
                <Text style={[styles.dialogText, { color: s.muted }]}>{children}</Text>
              ) : (
                children
              )}
            </View>
          ) : null}
          {actions !== undefined ? <View style={styles.dialogActions}>{actions}</View> : null}
        </View>
      </View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 *  Tooltip
 * ------------------------------------------------------------------ */

export type TooltipProps = {
  /** The hint. */
  label: string;
  /** The control it belongs to. */
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A TOOLTIP.
 *
 * A hint that appears when the control is held down. On a phone there is
 * no hover, so a tooltip is a LONG PRESS — which is why it is a
 * deliberate action rather than something that pops up at you.
 */
export function Tooltip({ label, children, style }: TooltipProps): React.JSX.Element {
  const s = useSemantic();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, []);

  const show = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), 400);
  };

  const hide = (): void => {
    if (timer.current !== null) clearTimeout(timer.current);
    setOpen(false);
  };

  return (
    <View style={style}>
      <View onTouchStart={show} onTouchEnd={hide} onTouchCancel={hide}>
        {children}
      </View>
      {open ? (
        <View
          style={[
            styles.tooltip,
            { backgroundColor: s.overlay, borderColor: s.border, borderRadius: RADIUS.md },
          ]}
          pointerEvents="none"
        >
          <Text style={[styles.tooltipText, { color: s.foreground }]}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  ProgressBar
 * ------------------------------------------------------------------ */

export type ProgressBarProps = {
  /** How far along, 0 to 1. */
  value: number;
  /** A colour that is not the accent — a warning colour, say. */
  color?: string;
  height?: number;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * A PROGRESS BAR.
 *
 * A track and a fill. The fill is the accent unless it is told otherwise,
 * because a bar that is nearly done and nearly empty both being red
 * would say nothing.
 */
export function ProgressBar({
  value,
  color,
  height = 6,
  style,
  accessibilityLabel,
}: ProgressBarProps): React.JSX.Element {
  const s = useSemantic();
  const clamped = Math.min(1, Math.max(0, value));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
      style={[
        styles.progressTrack,
        { height, borderRadius: height / 2, backgroundColor: s.surfaceTertiary },
        style,
      ]}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: "100%",
          borderRadius: height / 2,
          backgroundColor: color ?? s.accent,
        }}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  RadioGroup
 * ------------------------------------------------------------------ */

export type RadioGroupProps = {
  /** The option that is chosen. */
  value: string | null;
  onValueChange: (value: string) => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * A RADIO GROUP.
 *
 * A set of options where exactly one is chosen. The group is what makes
 * the four rows in a multiple-choice question ONE question rather than
 * four independent buttons, and the group's own state is what keeps them
 * in agreement.
 */
export function RadioGroup({
  value,
  onValueChange,
  children,
  style,
}: RadioGroupProps): React.JSX.Element {
  return (
    <View accessibilityRole="radiogroup" style={style}>
      {children}
    </View>
  );
}

export type RadioProps = {
  value: string;
  /** Whether this option is the chosen one. */
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function Radio({
  value,
  selected,
  disabled = false,
  onPress,
  children,
  style,
}: RadioProps): React.JSX.Element {
  const s = useSemantic();

  return (
    <PressableFeedback
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={value}
      highlight={s.pressWash}
      style={[
        styles.radioRow,
        {
          borderColor: selected ? s.accent : s.border,
          backgroundColor: selected ? s.surfaceTertiary : "transparent",
          borderRadius: RADIUS.field,
        },
        style,
      ]}
    >
      <View
        style={[
          styles.radioMark,
          {
            borderColor: selected ? s.accent : s.border,
            backgroundColor: selected ? s.accent : "transparent",
          },
        ]}
      />
      {children}
    </PressableFeedback>
  );
}

const styles = StyleSheet.create({
  tabsRoot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    padding: 4,
  },
  tabTrigger: {
    flexGrow: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    overflow: "hidden",
  },
  tabLabel: {
    ...TYPE.subheading,
  },

  dialogScrim: {
    ...StyleSheet.absoluteFill,
  },
  dialogWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 26,
  },
  dialog: {
    borderWidth: StyleSheet.hairlineWidth,
    padding: 22,
    gap: 12,
  },
  dialogTitle: {
    ...TYPE.heading,
  },
  dialogBody: {
    gap: 8,
  },
  dialogText: {
    ...TYPE.body,
    lineHeight: 21,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 6,
  },

  tooltip: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 8,
    zIndex: 10,
  },
  tooltipText: {
    ...TYPE.small,
  },

  progressTrack: {
    width: "100%",
    overflow: "hidden",
  },

  radioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 52,
    overflow: "hidden",
  },
  radioMark: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
});
