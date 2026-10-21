/**
 * THE UI KIT
 * ---------------------------------------------------------------------------
 * The app's shared primitives.
 *
 * THE CONTAINER
 * ---------------------------------------------------------------------------
 * Every panel in this app is `GlassPanel` — sharp corners, a blurred and
 * tinted background, and grain over the container only. It is the single
 * container treatment, and it is reused everywhere, which is the point: one
 * surface language across the whole product.
 *
 * A panel only blurs when there is something behind it to blur. Over the
 * live background fields — the gradient ASCII engine, the pixel field — the
 * blur is on. Over the flat page background it is off, because twenty
 * BlurViews in a scrolling list is twenty native surfaces for no visual
 * gain.
 *
 * EVERYTHING IS IN JETBRAINS MONO
 * ---------------------------------------------------------------------------
 * One family, four weights, and the hierarchy comes from weight and size
 * rather than from a second typeface. See `src/theme/typography.ts`.
 */
import { type ReactNode, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { inkFor } from "@/lib/palette-colours";
import { FONT, TYPE, splitNumericRuns } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";
import { GlassPanel } from "@/components/ui/GlassPanel";

/* ------------------------------------------------------------------ *
 *  text
 * ------------------------------------------------------------------ */

/**
 * TEXT, WITH ITS NUMBERS IN NOVA MONO.
 *
 * Every number the app shows is a figure rather than a word, and it is set
 * in Nova Mono: a run of digits in a second face, the punctuation that
 * belongs to the number with it, and everything else in the app's own
 * JetBrains Mono.
 *
 * The tutor's chat is the one exception, and it is not an exception to the
 * font — it is an exception to the RULE, because a message is something
 * somebody wrote, and a figure inside a sentence somebody wrote is part of
 * the sentence.
 */
export function Num({
  children,
  style,
  numberOfLines,
}: {
  /** The text. Numbers inside it are set in Nova Mono. */
  children?: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}): React.JSX.Element {
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {numberRuns(children)}
    </Text>
  );
}

/**
 * The children of a text, with every number in them set in Nova Mono.
 *
 * A string is split into its numeric and non-numeric runs; a number is
 * numeric on its own; an array is walked. Anything else — a nested element
 * the caller has already styled — is left exactly as it is.
 */
function numberRuns(children: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];

  const walk = (node: ReactNode, path: string): void => {
    if (node === null || node === undefined || node === false || node === true) return;
    if (typeof node === "number") {
      out.push(
        <Text key={path} style={styles.nova}>
          {node}
        </Text>,
      );
      return;
    }
    if (typeof node === "string") {
      const parts = splitNumericRuns(node);
      parts.forEach((part, i) => {
        if (!part.numeric) {
          out.push(part.text);
          return;
        }
        out.push(
          <Text key={`${path}-${i}`} style={styles.nova}>
            {part.text}
          </Text>,
        );
      });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}-${i}`));
      return;
    }
    out.push(node);
  };

  walk(children, "n");
  return out;
}

/* ------------------------------------------------------------------ *
 *  Screen
 * ------------------------------------------------------------------ */

export function Screen({
  children,
  style,
  padded = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padded?: boolean;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <View
      style={[
        styles.screen,
        { backgroundColor: theme.tokens.bg0 },
        padded ? styles.screenPadded : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  Text
 * ------------------------------------------------------------------ */

export function Title({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <Num style={[styles.title, { color: theme.tokens.fg }, style]}>{children}</Num>
  );
}

export function Heading({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <Num style={[styles.heading, { color: theme.tokens.fg }, style]}>{children}</Num>
  );
}

export function Body({
  children,
  style,
  dim = false,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  dim?: boolean;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <Num
      style={[styles.body, { color: dim ? theme.tokens.fgDim : theme.tokens.fgMuted }, style]}
    >
      {children}
    </Num>
  );
}

export function Label({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <Num style={[styles.label, { color: theme.tokens.fgDim }, style]}>{children}</Num>
  );
}

export function Mono({
  children,
  style,
  color,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  color?: string;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <Num style={[styles.mono, { color: color ?? theme.tokens.fgMuted }, style]}>
      {children}
    </Num>
  );
}

/* ------------------------------------------------------------------ *
 *  a picker
 * ------------------------------------------------------------------ */

/**
 * A PICKER.
 *
 * The app had no dropdown until the tutor needed one, and the platform's
 * own is the wrong shape for it: a native picker is a wheel on iOS and a
 * spinner on Android, and neither one can be given the app's palette, its
 * corners or its type. This one is a sheet of the app's own rows over a
 * dimmed page, so it looks like the rest of the app and is a list the
 * reader can read rather than a wheel they have to spin.
 */
export type SelectOption = {
  readonly value: string;
  readonly label: string;
  /** A second line, for the detail a row can carry. */
  readonly detail?: string;
};

/**
 * A FILTER ON A PICKER.
 *
 * Some lists are too long to read, and some of the list is not what the
 * reader wants at all — a provider that offers two hundred models, of
 * which a handful cost nothing. The filter is a row at the top of the
 * sheet with a switch on it, and it narrows what is listed.
 *
 * It lives in the SHEET rather than beside the trigger, because the
 * trigger is a narrow bar in the tutor's header and the sheet is the
 * only place with room for a second control, and because a filter that
 * is hidden until the list is open is a filter nobody knows to look for.
 */
export type SelectFilter = {
  /** The label on the switch. */
  readonly label: string;
  /** Whether the filter is on. */
  readonly active: boolean;
  /** Called when the switch is flipped. */
  readonly onToggle: () => void;
  /** Which options survive the filter when it is on. */
  readonly matches: (option: SelectOption) => boolean;
};

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "choose one",
  disabled = false,
  filter,
  style,
}: {
  /** The name of the thing being chosen, shown above the trigger. */
  label?: string;
  /** The chosen value. */
  value: string | null;
  readonly options: ReadonlyArray<SelectOption>;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly disabled?: boolean;
  /** An optional filter, shown at the top of the sheet. */
  readonly filter?: SelectFilter;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const theme = useActiveTheme();
  const [open, setOpen] = useState(false);

  const chosen = options.find((o) => o.value === value) ?? null;

  /*
   * WHAT THE SHEET LISTS.
   *
   * The filter narrows the list, but it never narrows it to nothing
   * without saying so: when the filter is on and it hides everything,
   * the sheet says that rather than showing an empty box, because an
   * empty list looks like a broken one.
   */
  const shown = filter !== undefined && filter.active
    ? options.filter((option) => filter.matches(option))
    : options;
  const hidden = options.length - shown.length;

  return (
    <View style={style}>
      {label !== undefined ? (
        <Text style={[styles.selectLabel, { color: theme.tokens.fgDim }]}>{label}</Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? "choose"}
        accessibilityValue={{ text: chosen?.label ?? placeholder }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.selectTrigger,
          {
            backgroundColor: theme.tokens.surfaceRaised,
            borderColor: theme.tokens.line,
            opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.selectValue,
            { color: chosen === null ? theme.tokens.fgDim : theme.tokens.fg },
          ]}
          numberOfLines={1}
        >
          {chosen?.label ?? placeholder}
        </Text>
        <Text style={[styles.selectChevron, { color: theme.tokens.fgDim }]}>▾</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          style={[styles.selectScrim, { backgroundColor: `${theme.tokens.bg0}CC` }]}
          onPress={() => setOpen(false)}
          accessibilityLabel="Close"
          accessibilityRole="button"
        />
        <View style={styles.selectSheetWrap} pointerEvents="box-none">
          <View
            style={[
              styles.selectSheet,
              { backgroundColor: theme.tokens.bg1, borderColor: theme.tokens.line },
            ]}
          >
            {label !== undefined ? (
              <Text style={[styles.selectSheetTitle, { color: theme.tokens.fgDim }]}>
                {label}
              </Text>
            ) : null}
            {filter !== undefined ? (
              <View style={styles.selectFilterRow}>
                <Text style={[styles.selectFilterLabel, { color: theme.tokens.fg }]}>
                  {filter.label}
                </Text>
                <Switch
                  value={filter.active}
                  onValueChange={filter.onToggle}
                  trackColor={{ true: theme.tokens.accentA, false: theme.tokens.surfaceRaised }}
                  thumbColor={theme.tokens.fg}
                  accessibilityLabel={filter.label}
                />
              </View>
            ) : null}
            <ScrollView
              style={styles.selectList}
              contentContainerStyle={styles.selectListContent}
            >
              {shown.map((option) => {
                const active = option.value === value;
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      onChange(option.value);
                      setOpen(false);
                    }}
                    style={({ pressed }) => [styles.selectRow, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <View style={styles.selectRowText}>
                      <Text
                        style={[
                          styles.selectRowLabel,
                          { color: active ? theme.tokens.accentA : theme.tokens.fg },
                        ]}
                        numberOfLines={1}
                      >
                        {option.label}
                      </Text>
                      {option.detail !== undefined ? (
                        <Text
                          style={[styles.selectRowDetail, { color: theme.tokens.fgDim }]}
                          numberOfLines={1}
                        >
                          {option.detail}
                        </Text>
                      ) : null}
                    </View>
                    {active ? (
                      <Text style={[styles.selectTick, { color: theme.tokens.accentA }]}>✓</Text>
                    ) : null}
                  </Pressable>
                );
              })}
              {options.length === 0 ? (
                <Text style={[styles.selectEmpty, { color: theme.tokens.fgDim }]}>
                  Nothing to choose from yet.
                </Text>
              ) : null}
              {options.length > 0 && shown.length === 0 ? (
                <Text style={[styles.selectEmpty, { color: theme.tokens.fgDim }]}>
                  {`${hidden} hidden by the filter. Turn it off to see them.`}
                </Text>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  Card — the shared container
 * ------------------------------------------------------------------ */

export function Card({
  children,
  style,
  strength = "soft",
  radius = RADIUS.panel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  strength?: "soft" | "medium" | "solid";
  /**
   * The corner radius, in points. RADIUS.panel is the house style; a card
   * opts out of it says so here rather than by hard-coding a style.
   */
  radius?: number;
}): React.JSX.Element {
  return (
    <GlassPanel strength={strength} padding={16} radius={radius} style={style}>
      {children}
    </GlassPanel>
  );
}

/* ------------------------------------------------------------------ *
 *  Buttons
 * ------------------------------------------------------------------ */

export type ButtonTone = "primary" | "ghost" | "danger" | "quiet";

export function Button({
  label,
  onPress,
  tone = "primary",
  disabled = false,
  style,
  accessibilityHint,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}): React.JSX.Element {
  const theme = useActiveTheme();
  const background =
    tone === "primary"
      ? theme.tokens.accentA
      : tone === "danger"
        ? theme.tokens.danger
        : tone === "quiet"
          ? "transparent"
          : theme.tokens.surfaceRaised;
  // The ink on a filled control is CHOSEN against the fill, not inherited
  // from the page. The base palette's accent is nearly black, and the page
  // background is black: black on that is not a button, it is two blacks.
  const color =
    tone === "primary"
      ? inkFor(theme.tokens.accentA)
      : tone === "danger"
        ? inkFor(theme.tokens.danger)
        : theme.tokens.fg;
  const border =
    tone === "ghost" ? theme.tokens.line : tone === "quiet" ? "transparent" : background;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          borderColor: border,
          opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Num style={[styles.buttonText, { color }]}>{label}</Num>
    </Pressable>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}): React.JSX.Element {
  const theme = useActiveTheme();
  const content = (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: selected ? theme.tokens.accentA : theme.tokens.surfaceRaised,
          borderColor: selected ? theme.tokens.accentA : theme.tokens.line,
        },
      ]}
    >
      <Num
        style={[
          styles.chipText,
          { color: selected ? inkFor(theme.tokens.accentA) : theme.tokens.fgMuted },
        ]}
      >
        {label}
      </Num>
    </View>
  );
  if (onPress === undefined) {
    return content;
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
    >
      {content}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 *  Rows and lists
 * ------------------------------------------------------------------ */

export function Row({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return <View style={[styles.row, style]}>{children}</View>;
}

/**
 * A tappable row.
 *
 * The web app's table rows become cards on a phone: the label on one line,
 * the detail under it, the action on the right. Nothing here is a link, so
 * there is no `href` and no browser navigation — the press handler owns what
 * happens next.
 */
export function ListRow({
  title,
  subtitle,
  detail,
  trailing,
  onPress,
  badge,
}: {
  title: string;
  subtitle?: string;
  detail?: string;
  trailing?: ReactNode;
  onPress?: () => void;
  badge?: { label: string; tone: "ok" | "warn" | "muted" };
}): React.JSX.Element {
  const theme = useActiveTheme();
  const badgeTone =
    badge?.tone === "ok"
      ? theme.tokens.ok
      : badge?.tone === "warn"
        ? theme.tokens.warn
        : theme.tokens.fgDim;

  const body = (
    <View style={[styles.listRow, { borderColor: theme.tokens.lineSoft }]}>
      <View style={styles.listRowMain}>
        <View style={styles.listRowHead}>
          <Num style={[styles.listRowTitle, { color: theme.tokens.fg }]}>{title}</Num>
          {badge !== undefined ? (
            <Num style={[styles.listRowBadge, { color: badgeTone }]}>{badge.label}</Num>
          ) : null}
        </View>
        {subtitle !== undefined ? (
          <Num style={[styles.listRowSubtitle, { color: theme.tokens.fgDim }]}>
            {subtitle}
          </Num>
        ) : null}
        {detail !== undefined ? (
          <Num style={[styles.listRowDetail, { color: theme.tokens.fgMuted }]}>
            {detail}
          </Num>
        ) : null}
      </View>
      {trailing !== undefined ? <View style={styles.listRowTrailing}>{trailing}</View> : null}
    </View>
  );

  if (onPress === undefined) {
    return body;
  }
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}
    >
      {body}
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 *  Stats and empties
 * ------------------------------------------------------------------ */

export function Stat({
  label,
  value,
  foot,
}: {
  label: string;
  value: string;
  foot?: string;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <View
      style={[
        styles.stat,
        { borderColor: theme.tokens.line, backgroundColor: theme.tokens.bg1 },
      ]}
    >
      <Num style={[styles.statLabel, { color: theme.tokens.fgDim }]}>{label}</Num>
      <Num style={[styles.statValue, { color: theme.tokens.fg }]}>{value}</Num>
      {foot !== undefined ? (
        <Num style={[styles.statFoot, { color: theme.tokens.fgMuted }]}>{foot}</Num>
      ) : null}
    </View>
  );
}

export function EmptyState({
  title,
  body,
}: {
  title: string;
  body: string;
}): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <View style={[styles.empty, { borderColor: theme.tokens.line }]}>
      <Num style={[styles.emptyTitle, { color: theme.tokens.fg }]}>{title}</Num>
      <Num style={[styles.emptyBody, { color: theme.tokens.fgDim }]}>{body}</Num>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  Section
 * ------------------------------------------------------------------ */

export function Section({
  title,
  subtitle,
  action,
  children,
  style,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  return (
    <View style={[styles.section, style]}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionHeadText}>
          <Heading style={styles.sectionTitle}>{title}</Heading>
          {subtitle !== undefined ? <Body style={styles.sectionSubtitle}>{subtitle}</Body> : null}
        </View>
        {action !== undefined ? <View>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  Prose
 * ------------------------------------------------------------------ */

/**
 * A paragraph of authored prose.
 *
 * The notes carry maths in plain text and use blank lines to mark a
 * paragraph, so the text keeps its line breaks rather than being reflowed
 * into one long line.
 */
export function Prose({ children }: { children: string }): React.JSX.Element {
  const theme = useActiveTheme();
  return (
    <Num style={[styles.prose, { color: theme.tokens.fgMuted }]}>{children}</Num>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  screenPadded: {
    paddingHorizontal: 18,
  },

  title: {
    ...TYPE.title,
  },
  heading: {
    ...TYPE.heading,
  },
  body: {
    ...TYPE.body,
  },
  label: {
    ...TYPE.label,
  },
  mono: {
    ...TYPE.code,
  },

  button: {
    minHeight: 48,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  /**
   * A number, in Nova Mono.
   */
  nova: {
    fontFamily: FONT.nova,
  },
  buttonText: {
    ...TYPE.subheading,
    letterSpacing: 0.6,
  },

  selectLabel: {
    ...TYPE.label,
    marginBottom: 6,
  },
  selectTrigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  selectValue: {
    ...TYPE.subheading,
    flex: 1,
  },
  selectChevron: {
    ...TYPE.body,
    marginLeft: 10,
  },
  selectScrim: {
    ...StyleSheet.absoluteFill,
  },
  selectSheetWrap: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
  },
  selectSheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    maxHeight: "62%",
  },
  selectSheetTitle: {
    ...TYPE.label,
    padding: 16,
    paddingBottom: 8,
  },
  selectList: {
    flexGrow: 0,
  },
  selectFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  selectFilterLabel: {
    ...TYPE.subheading,
  },
  selectListContent: {
    paddingBottom: 8,
  },
  selectRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "transparent",
  },
  selectRowText: {
    flex: 1,
    paddingRight: 10,
  },
  selectRowLabel: {
    ...TYPE.subheading,
  },
  selectRowDetail: {
    ...TYPE.small,
    marginTop: 2,
  },
  selectTick: {
    ...TYPE.body,
  },
  selectEmpty: {
    ...TYPE.body,
    padding: 16,
  },

  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: RADIUS.control,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: {
    ...TYPE.small,
    fontFamily: TYPE.label.fontFamily,
  },

  row: {
    flexDirection: "row",
    alignItems: "center",
  },

  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listRowMain: {
    flex: 1,
    paddingRight: 12,
  },
  listRowHead: {
    flexDirection: "row",
    alignItems: "center",
  },
  listRowTitle: {
    ...TYPE.subheading,
    marginRight: 8,
  },
  listRowBadge: {
    ...TYPE.label,
    fontSize: 9,
  },
  listRowSubtitle: {
    ...TYPE.small,
    marginTop: 2,
  },
  listRowDetail: {
    ...TYPE.small,
    marginTop: 4,
  },
  listRowTrailing: {
    marginLeft: 8,
  },

  stat: {
    flexGrow: 1,
    flexBasis: "46%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    padding: 14,
    marginBottom: 10,
  },
  statLabel: {
    ...TYPE.label,
  },
  statValue: {
    ...TYPE.title,
    marginTop: 6,
  },
  statFoot: {
    ...TYPE.small,
    marginTop: 4,
  },

  empty: {
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
    borderRadius: RADIUS.panel,
    padding: 22,
  },
  emptyTitle: {
    ...TYPE.subheading,
    marginBottom: 6,
  },
  emptyBody: {
    ...TYPE.small,
  },

  section: {
    marginTop: 26,
  },
  sectionHead: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionHeadText: {
    flex: 1,
    paddingRight: 12,
  },
  sectionTitle: {
    ...TYPE.heading,
  },
  sectionSubtitle: {
    marginTop: 4,
  },

  prose: {
    ...TYPE.body,
    fontSize: 15,
    lineHeight: 25,
  },
});
