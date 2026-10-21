/**
 * APPEARANCE — the theme picker
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/components/theme-picker.tsx
 *
 * The web app offered fifty-two palettes as a swatch grid with a preview
 * panel. On a phone the grid is the whole screen, and the swatch is the
 * palette's three accents side by side with the name underneath — enough
 * to tell them apart without a preview pane, and a third of the height the
 * old swatch took.
 *
 * They are filed under LIGHT, DARK and COLOURFUL, and the last heading
 * holds the dark palettes whose background has become a colour rather than
 * staying black. See `themeGroup` in `src/theme/themes.ts`.
 *
 * "Match system" is the first entry, because it is the one a reader reaches
 * for without thinking.
 */
import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme, useTheme, SYSTEM_THEME_ID } from "@/theme/ThemeProvider";
import { THEME_GROUPS, THEME_LIST, themeGroup, type ThemeGroup, type ThemeMeta } from "@/theme/themes";
import { PALETTES } from "@/theme/palettes.generated";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";
import { Body, Title } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";

export default function AppearanceScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const { themeId, setThemeId } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const groups = useMemo(() => {
    const byGroup: Record<ThemeGroup, ThemeMeta[]> = { light: [], dark: [], colourful: [] };
    for (const entry of THEME_LIST) {
      byGroup[themeGroup(entry)].push(entry);
    }
    return byGroup;
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title="Appearance" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={styles.backRow}>
            <Icon name="chevronLeft" size={16} tone="accent" />
            <Text style={[styles.backText, { color: theme.tokens.accentA }]}>you</Text>
          </View>
        </Pressable>

        <Title style={styles.title}>{THEME_LIST.length} palettes</Title>
        <Body style={styles.lead}>
          Every palette is a set of colours the four background fields read from, so the scenes
          change with the theme rather than fighting it.
        </Body>

        <Pressable
          accessibilityRole="button"
          onPress={() => setThemeId(SYSTEM_THEME_ID)}
          style={({ pressed }) => [
            styles.systemRow,
            {
              borderColor: themeId === SYSTEM_THEME_ID ? theme.tokens.accentA : theme.tokens.line,
              backgroundColor: theme.tokens.bg1,
              opacity: pressed ? 0.7 : 1,
            },
          ]}
        >
          <View style={styles.systemGlyph}>
            <Icon name="system" size={20} tone="accent" />
          </View>
          <View style={styles.systemText}>
            <Text style={[styles.systemTitle, { color: theme.tokens.fg }]}>Match system</Text>
            <Text style={[styles.systemSub, { color: theme.tokens.fgDim }]}>
              Follow your operating system&apos;s setting
            </Text>
          </View>
        </Pressable>

        {THEME_GROUPS.map((group) => (
          <View key={group.id} style={styles.group}>
            <Text style={[styles.groupLabel, { color: theme.tokens.fgDim }]}>{group.label}</Text>
            <View style={styles.grid}>
              {groups[group.id].map((entry) => (
                <ThemeSwatch
                  key={entry.id}
                  id={entry.id}
                  label={entry.label}
                  hint={entry.hint}
                  selected={themeId === entry.id}
                  onPress={() => setThemeId(entry.id)}
                />
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * A PALETTE, AS THREE COLOURS.
 *
 * The swatch used to be a miniature of the theme: the palette's own
 * background, its own little mark in the corner, and three dots of its
 * accents. It was showing the reader a preview of a screen to sell a
 * colour, and the preview was three times the size of the thing it was
 * selling.
 *
 * Now it is a bar of the palette's three accents, side by side, filling it
 * — which is what the palette IS, and nothing else. No background: the
 * background is the page's. No mark: the mark was decoration, and the
 * name underneath says the same thing in fewer pixels.
 *
 * The selected palette is called out by its border and its name rather
 * than by a tick inside the bar, because the bar is now three colours of
 * the palette's own, and a tick painted in one of them reads as a fourth.
 */
function ThemeSwatch({
  id,
  label,
  hint,
  selected,
  onPress,
}: {
  id: string;
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const theme = useActiveTheme();
  const tokens = PALETTES[id];
  const a = tokens?.accentA ?? theme.tokens.accentA;
  const b = tokens?.accentB ?? theme.tokens.accentB;
  const c = tokens?.accentC ?? theme.tokens.accentC;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label}. ${hint}`}
      onPress={onPress}
      style={({ pressed }) => [styles.swatch, { opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={[
          styles.swatchInner,
          { borderColor: selected ? theme.tokens.accentA : theme.tokens.line },
        ]}
      >
        <View style={[styles.band, { backgroundColor: a }]} />
        <View style={[styles.band, { backgroundColor: b }]} />
        <View style={[styles.band, { backgroundColor: c }]} />
      </View>
      <Text
        style={[
          styles.swatchLabel,
          { color: selected ? theme.tokens.accentA : theme.tokens.fgDim },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
  },
  back: {
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    ...TYPE.title,
    marginTop: 8,
  },
  lead: {
    marginTop: 8,
  },
  systemRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    padding: 14,
    marginTop: 20,
  },
  systemGlyph: {
    width: 30,
  },
  systemText: {
    flex: 1,
  },
  systemTitle: {
    ...TYPE.subheading,
  },
  systemSub: {
    fontSize: 12,
    marginTop: 2,
  },
  group: {
    marginTop: 24,
  },
  groupLabel: {
    ...TYPE.label,
    marginBottom: 12,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -5,
  },
  swatch: {
    width: "33.33%",
    paddingHorizontal: 5,
    paddingBottom: 12,
  },
  /**
   * The bar of three colours.
   *
   * 24 points tall, which is a third of the 76 the old swatch was: a mark
   * on a line of text is 14, and this is the same kind of thing.
   */
  swatchInner: {
    flexDirection: "row",
    height: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    overflow: "hidden",
  },
  /** One third of the bar, filled with one of the palette's accents. */
  band: {
    flex: 1,
  },
  swatchLabel: {
    ...TYPE.label,
    fontSize: 9,
    textAlign: "center",
    marginTop: 6,
  },
});
