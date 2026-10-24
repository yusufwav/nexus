/**
 * PRACTICE — the index
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/(app)/practice/page.tsx
 *
 * The web app's practice index was a list of module buttons, each with a
 * question count. That is already close to right for a phone, so what
 * changed is the framing: the screen leads with what practice is FOR, and
 * the modules are cards rather than buttons.
 *
 * The session itself lives on its own route, `practice/[code]`, because a
 * session is a mode rather than a page and a phone needs a way out of it
 * that is not the back gesture.
 */
import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, EmptyState, Num, Section, Stat, Title } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getOwnedCodes, getQuestions, listModules } from "@/storage/library";
import { moduleStats, tallyAttempts } from "@/storage/progress";

export default function PracticeScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [modules, setModules] = useState<
    ReadonlyArray<{ code: string; name: string; count: number }>
  >([]);
  const [owned, setOwned] = useState<ReadonlySet<string>>(new Set<string>());
  const [attempts, setAttempts] = useState({ right: 0, wrong: 0 });
  const [weak, setWeak] = useState<ReadonlyArray<{ moduleCode: string; wrong: number }>>([]);


  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all = await listModules();
      const ownedCodes = await getOwnedCodes();
      const counts = await Promise.all(
        all.map(async (m) => ({ code: m.code, name: m.name, count: (await getQuestions(m.code)).length })),
      );
      const tally = await tallyAttempts();
      const stats = await moduleStats();
      if (cancelled) return;
      setModules(counts);
      setOwned(ownedCodes);
      setAttempts(tally);
      setWeak(stats.filter((s) => s.wrong > 0).slice(0, 3));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const available = useMemo(() => modules.filter((m) => m.count > 0), [modules]);
  const accuracy =
    attempts.right + attempts.wrong === 0
      ? null
      : Math.round((attempts.right / (attempts.right + attempts.wrong)) * 100);

  return (
    <View style={styles.root}>
      <ScreenHeader title="Practice" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <Title style={styles.title}>One question at a time</Title>
        <Body style={styles.lead}>Every answer is explained, right or wrong.</Body>

        <View style={styles.stats}>
          <Stat
            label="answered"
            value={String(attempts.right + attempts.wrong)}
            foot={attempts.right + attempts.wrong === 0 ? "nothing yet" : undefined}
          />
          <Stat
            label="accuracy"
            value={accuracy === null ? "—" : `${accuracy}%`}
            foot={attempts.wrong === 0 ? "no misses" : `${attempts.wrong} to look at`}
          />
        </View>

        {weak.length > 0 ? (
          <Section title="Worth a second look">
            <Card>
              {weak.map((w) => (
                <View key={w.moduleCode} style={styles.weakRow}>
                  <Num style={[styles.weakCode, { color: theme.tokens.accentA }]}>
                    {w.moduleCode}
                  </Num>
                  <Num style={[styles.weakNote, { color: theme.tokens.fgMuted }]}>
                    {w.wrong} wrong
                  </Num>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        <Section title="Choose a module">
          {available.length === 0 ? (
            <EmptyState
              title="No questions yet"
              body="Practice questions arrive with your module. The catalogue is one tap away."
            />
          ) : (
            available.map((m) => (
              /*
               * A CARD, LIKE EVERY OTHER BLOCK ON THE SCREEN.
               *
               * These used to be bare views, so their text sat on the
               * screen's gutter with nothing around it while every other
               * section on the app was a card. They are cards now, and the
               * space between them is the same space the other lists use.
               *
               * THE START BUTTON IS ON THE NAME'S LINE.
               *
               * The button acts on this module, so it belongs on the line
               * that names it, at the trailing edge — and the count of
               * quizzes, which is about the module rather than about the
               * action, sits under the name.
               */
              <Card key={m.code} style={styles.moduleCard}>
                <Card.Header>
                  <Num style={[styles.code, { color: theme.tokens.accentA }]}>{m.code}</Num>
                </Card.Header>

                <Card.Content>
                  <View style={styles.moduleRow}>
                    <Text style={[styles.name, { color: theme.tokens.fg }]}>{m.name}</Text>
                    <Button
                      label="start"
                      tone={owned.has(m.code) ? "primary" : "ghost"}
                      onPress={() =>
                        router.push({ pathname: "/practice/[code]", params: { code: m.code } })
                      }
                      style={styles.start}
                    />
                  </View>
                  <Num style={[styles.count, { color: theme.tokens.fgDim }]}>
                    {m.count} quiz{m.count === 1 ? "" : "zes"}
                  </Num>
                </Card.Content>
              </Card>
            ))
          )}
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
  },
  title: {
    ...TYPE.title,
    marginTop: 8,
  },
  lead: {
    marginTop: 8,
  },
  /*
   * THE GRID OF NUMBERS.
   *
   * `gap` rather than a margin on the tiles, so the row and the column
   * are the same distance apart.
   */
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 18,
  },
  weakRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
  },
  weakCode: {
    ...TYPE.code,
    letterSpacing: 0.8,
  },
  weakNote: {
    ...TYPE.small,
  },
  moduleCard: {
    marginBottom: 12,
  },
  /**
   * THE NAME AND THE BUTTON, ON ONE LINE.
   *
   * The button acts on the module, so it sits on the line that names it,
   * at the trailing edge. The name takes the room and the button takes
   * what it needs.
   */
  moduleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  code: {
    ...TYPE.code,
    letterSpacing: 1.2,
  },
  count: {
    ...TYPE.small,
    marginTop: 4,
  },
  name: {
    ...TYPE.subheading,
    flex: 1,
  },
  /**
   * The start button, at the trailing edge of the name's line.
   *
   * `alignSelf: "center"` rather than "flex-start" because the button
   * brings its own default — and in a ROW that default would put it at
   * the TOP of the line rather than in the middle of it.
   */
  start: {
    alignSelf: "center",
  },
});
