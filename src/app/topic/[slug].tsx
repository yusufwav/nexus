/**
 * A TOPIC
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/components/landing/topic-list.tsx
 *
 * On the web, each topic was a row in a list with a download button behind
 * the module's purchase. The files themselves were PDFs on a server.
 *
 * On a phone there is no server and no PDF to fetch, so a topic becomes what
 * it actually is: ONE TOPIC OF A MODULE, with the note's own summary, the
 * lessons that cover it, and the practice questions that test it.
 *
 * The topic's metadata — the title, the description, the page count — is
 * the web app's, unchanged.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, EmptyState, ListRow, Num, Prose, Section, Title } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";
import { MODULE_TOPICS, type ModuleTopic } from "@/content/module-topics";
import { getModuleContent, getQuestions } from "@/storage/library";

export default function TopicScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = params.slug ?? "";

  const [topic, setTopic] = useState<{ topic: ModuleTopic; moduleCode: string } | null>(null);
  const [lessons, setLessons] = useState<
    ReadonlyArray<{ n: number; title: string; body: string }>
  >([]);
  const [questionCount, setQuestionCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      for (const [moduleCode, topics] of Object.entries(MODULE_TOPICS)) {
        const found = topics.find((t) => t.slug === slug);
        if (found === undefined) continue;
        if (cancelled) return;
        setTopic({ topic: found, moduleCode });
        const content = await getModuleContent(moduleCode);
        const all = await getQuestions(moduleCode);
        if (cancelled) return;
        setLessons(
          (content?.lessons ?? []).map((l) => ({ n: l.n, title: l.title, body: l.body })),
        );
        setQuestionCount(all.filter((q) => q.topicSlug === slug).length);
        return;
      }
      if (!cancelled) setTopic(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const goToModule = useCallback(
    (moduleCode: string) => {
      router.push({ pathname: "/module/[code]", params: { code: moduleCode } });
    },
    [router],
  );

  if (topic === null) {
    return (
      <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
        <ScreenHeader />
        <View style={[styles.content, { paddingTop: 12 }]}>
          <EmptyState title="No such topic" body="This note is not in the catalogue." />
        </View>
      </View>
    );
  }

  const module = MODULE_TOPICS[topic.moduleCode] !== undefined ? topic.moduleCode : "";

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title={module} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => goToModule(module)}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={styles.backRow}>
            <Icon name="chevronLeft" size={16} tone="accent" />
            <Num style={[styles.backText, { color: theme.tokens.accentA }]}>{module}</Num>
          </View>
        </Pressable>

        <Title style={styles.title}>{topic.topic.title}</Title>
        <Body style={styles.lead}>{topic.topic.description}</Body>

        <View style={styles.metaRow}>
          <Num style={[styles.meta, { color: theme.tokens.fgDim }]}>
            {topic.topic.pages === null ? "pdf" : `${topic.topic.pages} pages`}
          </Num>
          <Num style={[styles.meta, { color: theme.tokens.fgDim }]}>
            {questionCount} practice question{questionCount === 1 ? "" : "s"}
          </Num>
        </View>

        {questionCount > 0 ? (
          <View style={styles.cta}>
            <Button
              label="practise this topic"
              onPress={() =>
                router.push({ pathname: "/practice/[code]", params: { code: module } })
              }
            />
          </View>
        ) : null}

        <Section title="Where this is covered" subtitle="The lessons that carry this topic.">
          <Card>
            {lessons.length === 0 ? (
              <Body>This module is announced but not written yet.</Body>
            ) : (
              lessons.map((lesson) => (
                <ListRow
                  key={lesson.n}
                  title={lesson.title}
                  subtitle={`Lesson ${lesson.n}`}
                  onPress={() =>
                    router.push({
                      pathname: "/lesson/[code]/[n]",
                      params: { code: module, n: String(lesson.n) },
                    })
                  }
                  trailing={<Icon name="chevronRight" size={18} tone="accent" />}
                />
              ))
            )}
          </Card>
        </Section>

        {lessons.length > 0 ? (
          <Section title="In short" subtitle="The lesson that covers it, in its own words.">
            <Card>
              {lessons.slice(0, 2).map((lesson) => (
                <View key={lesson.n} style={styles.excerpt}>
                  <Num style={[styles.excerptTitle, { color: theme.tokens.fg }]}>
                    {lesson.title}
                  </Num>
                  <Prose>{lesson.body}</Prose>
                </View>
              ))}
            </Card>
          </Section>
        ) : null}

        <Body style={styles.foot}>
          {topic.topic.pdf === null
            ? "This topic's note has not been written yet. The lesson above is the closest thing to it."
            : "The full PDF of this topic lives with the module."}
        </Body>
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
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 14,
  },
  meta: {
    ...TYPE.small,
    marginRight: 16,
  },
  cta: {
    marginTop: 18,
    alignSelf: "flex-start",
  },
  excerpt: {
    marginBottom: 16,
  },
  excerptTitle: {
    ...TYPE.subheading,
    marginBottom: 6,
  },
  foot: {
    ...TYPE.small,
    marginTop: 22,
  },
});
