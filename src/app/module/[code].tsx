/**
 * A MODULE
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/modules/[code]/page.tsx
 *
 * On the web, one glass panel held everything: what the module is, a page of
 * the notes, a download, and the topic list.
 *
 * On a phone it becomes a screen of SECTIONS: what it is, what you will be
 * able to do afterwards, the lessons, the topics, and the unlock.
 *
 * A code that is not in the catalogue at all is a genuine 404. A code that is
 * in the catalogue but has no notes yet is not — that would tell a student
 * the module does not exist, when it simply is not finished.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, EmptyState, ListRow, Num, Prose, Section, Title } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";
import {
  getModuleByCode,
  getModuleContent,
  getOwnedCodes,
  getTopics,
  releaseModule,
  unlockModule,
  type ModuleView,
  type ModuleTopic,
} from "@/storage/library";
import { completedLessonCount } from "@/storage/progress";
import { formatZar } from "@/lib/money";

export default function ModuleScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();

  const [mod, setMod] = useState<ModuleView | null>(null);
  const [topics, setTopics] = useState<ReadonlyArray<ModuleTopic>>([]);
  const [owned, setOwned] = useState(false);
  const [completed, setCompleted] = useState(0);
  const [content, setContent] = useState<{
    overview: ReadonlyArray<string>;
    outcomes: ReadonlyArray<string>;
    prerequisites: ReadonlyArray<string>;
    lessons: ReadonlyArray<{ n: number; title: string }>;
  } | null>(null);

  const load = useCallback(async () => {
    const found = await getModuleByCode(code);
    setMod(found);
    setTopics(await getTopics(code));
    setOwned((await getOwnedCodes()).has(code));
    setCompleted(await completedLessonCount(code));
    setContent(await getModuleContent(code));
  }, [code]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const found = await getModuleByCode(code);
      const topics = await getTopics(code);
      const ownedCodes = await getOwnedCodes();
      const done = await completedLessonCount(code);
      const content = await getModuleContent(code);
      if (cancelled) return;
      setMod(found);
      setTopics(topics);
      setOwned(ownedCodes.has(code));
      setCompleted(done);
      setContent(content);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const unlock = useCallback(async () => {
    await unlockModule(code);
    await load();
  }, [code, load]);

  const release = useCallback(async () => {
    await releaseModule(code);
    await load();
  }, [code, load]);

  if (mod === null) {
    return (
      <View style={styles.root}>
        <ScreenHeader />
        <View style={[styles.content, { paddingTop: 12 }]}>
          <Body>Loading…</Body>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title={mod.code} />
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
            <Text style={[styles.backText, { color: theme.tokens.accentA }]}>modules</Text>
          </View>
        </Pressable>

        <Title style={styles.title}>{mod.name}</Title>
        <Body style={styles.lead}>{mod.description}</Body>

        <View style={styles.priceRow}>
          <Num style={[styles.price, { color: theme.tokens.fg }]}>
            {formatZar(mod.priceCents)}
          </Num>
          {owned ? (
            <Text style={[styles.badge, { color: theme.tokens.ok }]}>OWNED</Text>
          ) : mod.status === "available" ? (
            <Text style={[styles.badge, { color: theme.tokens.warn }]}>READY</Text>
          ) : (
            <Text style={[styles.badge, { color: theme.tokens.fgDim }]}>COMING SOON</Text>
          )}
        </View>

        {/*
         * THE UNLOCK, AND WHY IT IS NOT A CHECKOUT.
         *
         * The unlock is the one thing this screen is for, so it is
         * centred rather than pushed against the gutter, and the note
         * under it is centred with it — a centred button over a
         * left-aligned note reads as two unrelated things.
         *
         * The "remove" is the other side of the same coin, and it is
         * deliberately quiet and left where it is: a removal is not the
         * thing this screen is for.
         */}
        {owned ? (
          <Button
            label="remove from your account"
            variant="ghost"
            onPress={() => void release()}
            style={styles.release}
          />
        ) : (
          <View style={styles.cta}>
            <Button
              label={`unlock for ${formatZar(mod.priceCents)}`}
              onPress={() => void unlock()}
              fullWidth
              style={styles.centred}
            />
            <Body style={styles.ctaNote}>
              Unlocking is local — there is no checkout and no card.
            </Body>
          </View>
        )}

        {content !== null ? (
          <>
            <Section title="What this module is">
              <Card>
                <Card.Content>
                  {content.overview.map((paragraph) => (
                    <View key={paragraph.slice(0, 24)} style={styles.paragraph}>
                      <Prose>{paragraph}</Prose>
                    </View>
                  ))}
                </Card.Content>
              </Card>
            </Section>

            <Section title="What you will be able to do">
              <Card>
                {content.outcomes.map((outcome) => (
                  <View key={outcome.slice(0, 24)} style={styles.outcomeRow}>
                    <View style={styles.outcomeMark}>
                      <Icon name="check" size={14} tone="ok" strokeWidth={2.25} />
                    </View>
                    <Num style={[styles.outcomeText, { color: theme.tokens.fgMuted }]}>
                      {outcome}
                    </Num>
                  </View>
                ))}
              </Card>
            </Section>

            <Section
              title="Lessons"
              subtitle={
                completed > 0
                  ? `${completed} of ${content.lessons.length} finished`
                  : `${content.lessons.length} lessons`
              }
            >
              <Card>
                {content.lessons.map((lesson) => (
                  <ListRow
                    key={lesson.n}
                    title={lesson.title}
                    subtitle={`Lesson ${lesson.n}`}
                    onPress={() =>
                      router.push({
                        pathname: "/lesson/[code]/[n]",
                        params: { code: mod.code, n: String(lesson.n) },
                      })
                    }
                    trailing={<Icon name="chevronRight" size={18} tone="accent" />}
                  />
                ))}
              </Card>
            </Section>

            <Section title="Before you start">
              <Card>
                {content.prerequisites.map((item) => (
                  <View key={item.slice(0, 24)} style={styles.outcomeRow}>
                    <Text style={[styles.outcomeDot, { color: theme.tokens.fgDim }]}>·</Text>
                    <Num style={[styles.outcomeText, { color: theme.tokens.fgMuted }]}>{item}</Num>
                  </View>
                ))}
              </Card>
            </Section>
          </>
        ) : (
          <Section title="Not written yet">
            <EmptyState
              title="Coming soon"
              body="I write one module at a time, in the order of the ones I am actually sitting in, so there is no sample of this one yet."
            />
          </Section>
        )}

        <Section title="Topics" subtitle="Take the one you are stuck on.">
          <Card>
            {topics.length === 0 ? (
              <Body>No topics yet.</Body>
            ) : (
              topics.map((topic) => (
                <ListRow
                  key={topic.slug}
                  title={topic.title}
                  subtitle={topic.description}
                  detail={topic.pages === null ? "pdf" : `${topic.pages} pages`}
                  onPress={() =>
                    router.push({ pathname: "/topic/[slug]", params: { slug: topic.slug } })
                  }
                  trailing={<Icon name="chevronRight" size={18} tone="accent" />}
                />
              ))
            )}
          </Card>
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
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 18,
  },
  price: {
    ...TYPE.title,
  },
  badge: {
    ...TYPE.label,
    fontSize: 9,
  },
  /**
   * THE UNLOCK, CENTRED.
   *
   * The block takes the screen's full width and the button sits in the
   * middle of it. The button's own `alignSelf` has to be overridden:
   * `fullWidth` asks for "stretch", and a stretched button is the width
   * of the screen rather than the width of the thing it says.
   */
  cta: {
    marginTop: 18,
    alignItems: "center",
  },
  centred: {
    alignSelf: "center",
  },
  ctaNote: {
    marginTop: 10,
    fontSize: 12,
    lineHeight: 18,
    alignSelf: "stretch",
    textAlign: "center",
  },
  release: {
    marginTop: 18,
    alignSelf: "flex-start",
  },
  /*
   * THE PARAGRAPHS OF THE OVERVIEW.
   *
   * The card's own content view already spaces its children by ten, so
   * this is the little that is added on top of it rather than a second
   * gap of its own.
   */
  paragraph: {
    marginBottom: 6,
  },
  outcomeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  outcomeMark: {
    width: 20,
    paddingTop: 3,
    alignItems: "flex-start",
  },
  outcomeDot: {
    width: 20,
    fontSize: 14,
    lineHeight: 22,
    fontWeight: "800",
  },
  outcomeText: {
    ...TYPE.body,
    flex: 1,
  },
});
