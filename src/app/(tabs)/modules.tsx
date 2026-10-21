/**
 * MODULES — the catalogue
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/modules/page.tsx
 *
 * THE WEB APP'S CATALOGUE, RE-IMAGINED FOR A PHONE
 * ---------------------------------------------------------------------------
 * On the web the catalogue was a table: a code, a name, a hover-revealed
 * description, a status and a price, all on one line, across a wide screen.
 *
 * On a phone each module becomes a CARD: the code and name on the first
 * line, the description under it, and the price and status as a footer row.
 * The description is always visible rather than hidden behind a hover —
 * there is no hover on a phone, and a description that only exists on a
 * desktop is a description most readers never see.
 *
 * The subject filter is a row of chips above the list, because a catalogue
 * of thirteen modules across five subjects is exactly the kind of thing a
 * phone can filter rather than scroll.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Chip, Num, Title } from "@/components/ui";
import { GlassPanel } from "@/components/ui/GlassPanel";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getOwnedCodes, listModules, subjectOf, type ModuleView } from "@/storage/library";
import { formatZar } from "@/lib/money";

export default function ModulesScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [modules, setModules] = useState<ReadonlyArray<ModuleView>>([]);
  const [owned, setOwned] = useState<ReadonlySet<string>>(new Set<string>());
  const [subject, setSubject] = useState<string>("all");


  /*
   * LOADING ON MOUNT.
   *
   * The setState calls are inside the effect's own async body, after
   * an await, because a setState called SYNCHRONOUSLY in an effect
   * body causes a cascading render. The `cancelled` flag is what stops
   * a response that arrives after the screen has gone from setting
   * state on a component that is no longer mounted.
   */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [all, ownedCodes] = await Promise.all([listModules(), getOwnedCodes()]);
      if (cancelled) return;
      setModules(all);
      setOwned(ownedCodes);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const m of modules) set.add(subjectOf(m.code));
    return ["all", ...Array.from(set).sort()];
  }, [modules]);

  const visible = useMemo(
    () =>
      subject === "all"
        ? modules
        : modules.filter((m) => subjectOf(m.code) === subject),
    [modules, subject],
  );

  const ready = modules.filter((m) => m.status === "available").length;

  const renderItem = useCallback(
    ({ item }: { item: ModuleView }) => {
      const isOwned = owned.has(item.code);
      return (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: "/module/[code]", params: { code: item.code } })
          }
          style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
        >
          {/*
           * THE CARD.
           *
           * A `GlassPanel`, like every other surface in the app, so the
           * catalogue's cards are the same treatment as the rest.
           */}
          <GlassPanel strength="soft" padding={16} style={styles.card}>
            <View style={styles.cardHead}>
              <Num style={[styles.code, { color: theme.tokens.accentA }]}>{item.code}</Num>
              {isOwned ? (
                <Text style={[styles.badge, { color: theme.tokens.ok }]}>OWNED</Text>
              ) : item.status === "available" ? (
                <Text style={[styles.badge, { color: theme.tokens.warn }]}>READY</Text>
              ) : (
                <Text style={[styles.badge, { color: theme.tokens.fgDim }]}>SOON</Text>
              )}
            </View>
            <Text style={[styles.name, { color: theme.tokens.fg }]}>{item.name}</Text>
            <Num style={[styles.description, { color: theme.tokens.fgMuted }]}>
              {item.description}
            </Num>
            <View style={styles.cardFoot}>
              <Num style={[styles.price, { color: theme.tokens.fg }]}>
                {formatZar(item.priceCents)}
              </Num>
              <Num style={[styles.subject, { color: theme.tokens.fgDim }]}>
                {subjectOf(item.code)}
              </Num>
            </View>
          </GlassPanel>
        </Pressable>
      );
    },
    [owned, router, theme],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title="Modules" />
      <FlatList
        data={visible}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: insets.bottom + 28 },
        ]}
        ListHeaderComponent={
          <View style={styles.header}>
            <Title style={styles.title}>{modules.length} modules, {ready} of them ready</Title>
            <Body style={styles.lead}>
              Every module is R50 and the notes stay yours either way. Unlock the ones you need.
            </Body>
            <View style={styles.chips}>
              {subjects.map((s) => (
                <Chip
                  key={s}
                  label={s === "all" ? "All" : s}
                  selected={subject === s}
                  onPress={() => setSubject(s)}
                />
              ))}
            </View>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  field: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  list: {
    paddingHorizontal: 18,
  },
  header: {
    marginBottom: 18,
  },
  title: {
    ...TYPE.title,
    marginTop: 8,
  },
  lead: {
    marginTop: 8,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 18,
  },
  card: {
    // SHARP CORNERS. The GlassPanel brings its own edge and fill, so the
    // card's own border and background are gone. See STYLING.md §1.2.
    marginBottom: 12,
  },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  code: {
    ...TYPE.code,
    letterSpacing: 1.2,
  },
  badge: {
    ...TYPE.label,
    fontSize: 9,
  },
  name: {
    ...TYPE.subheading,
    marginTop: 8,
  },
  description: {
    ...TYPE.small,
    marginTop: 6,
  },
  cardFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  price: {
    ...TYPE.subheading,
  },
  subject: {
    ...TYPE.small,
  },
});
