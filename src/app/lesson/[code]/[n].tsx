/**
 * A LESSON
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/content/module-content.ts
 *
 * The web app rendered the lesson plan as part of the module page. On a
 * phone a lesson deserves its own screen: it is the thing the reader came
 * for, and it is long enough to want a reading position, a completion mark
 * and a way to move to the next one.
 *
 * The lesson body, its points and its worked example are the authored
 * content, unchanged.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, Num, Prose, Title } from "@/components/ui";
import { RADIUS } from "@/theme/radius";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";
import { getLesson, getLessons } from "@/storage/library";
import { completeLesson, touchLesson } from "@/storage/progress";

export default function LessonScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code: string; n: string }>();
  const code = (params.code ?? "").toUpperCase();
  const n = Number(params.n ?? "1");

  const [lesson, setLesson] = useState<Awaited<ReturnType<typeof getLesson>>>(null);
  const [siblings, setSiblings] = useState<ReadonlyArray<{ n: number; title: string }>>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [l, all] = await Promise.all([getLesson(code, n), getLessons(code)]);
      if (cancelled) return;
      setLesson(l);
      setSiblings(all.map((item) => ({ n: item.n, title: item.title })));
      await touchLesson(code, n);
    })();
    return () => {
      cancelled = true;
    };
  }, [code, n]);

  const markDone = useCallback(async () => {
    await completeLesson(code, n);
    setDone(true);
  }, [code, n]);

  const index = siblings.findIndex((s) => s.n === n);
  const previous = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;

  if (lesson === null) {
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
      <ScreenHeader title={code} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={styles.backRow}>
            <Icon name="chevronLeft" size={16} tone="accent" />
            <Text style={[styles.backText, { color: theme.tokens.accentA }]}>{code}</Text>
          </View>
        </Pressable>

        <Title style={styles.title}>{lesson.title}</Title>

        <View style={styles.body}>
          <Prose>{lesson.body}</Prose>
        </View>

        {lesson.points !== undefined && lesson.points.length > 0 ? (
          <Card style={styles.points}>
            {lesson.points.map((point) => (
              <View key={point.slice(0, 24)} style={styles.pointRow}>
                <Text style={[styles.pointMark, { color: theme.tokens.accentA }]}>·</Text>
                <Num style={[styles.pointText, { color: theme.tokens.fgMuted }]}>{point}</Num>
              </View>
            ))}
          </Card>
        ) : null}

        {lesson.example !== undefined ? (
          <View style={styles.example}>
            <Num style={[styles.exampleCaption, { color: theme.tokens.fgDim }]}>
              {lesson.example.caption}
            </Num>
            <View style={[styles.code, { borderColor: theme.tokens.line }]}>
              <Text style={[styles.codeText, { color: theme.tokens.fg }]}>
                {lesson.example.lines.join("\n")}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button
            fullWidth
            label={done ? "marked as read" : "mark as read"}
            tone={done ? "ghost" : "primary"}
            onPress={() => void markDone()}
          />
        </View>

        <View style={styles.pager}>
          {previous !== undefined ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.replace({
                  pathname: "/lesson/[code]/[n]",
                  params: { code, n: String(previous.n) },
                })
              }
              style={({ pressed }) => [styles.pagerButton, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.pagerLabel, { color: theme.tokens.fgDim }]}>PREVIOUS</Text>
              <Num style={[styles.pagerTitle, { color: theme.tokens.fgMuted }]} numberOfLines={1}>
                {previous.title}
              </Num>
            </Pressable>
          ) : (
            <View style={styles.pagerButton} />
          )}
          {next !== undefined ? (
            <Pressable
              accessibilityRole="button"
              onPress={() =>
                router.replace({
                  pathname: "/lesson/[code]/[n]",
                  params: { code, n: String(next.n) },
                })
              }
              style={({ pressed }) => [
                styles.pagerButton,
                styles.pagerRight,
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <Text style={[styles.pagerLabel, { color: theme.tokens.fgDim }]}>NEXT</Text>
              <Num style={[styles.pagerTitle, { color: theme.tokens.fg }]} numberOfLines={1}>
                {next.title}
              </Num>
            </Pressable>
          ) : (
            <View style={styles.pagerButton} />
          )}
        </View>
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
  body: {
    marginTop: 18,
  },
  points: {
    marginTop: 18,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  pointMark: {
    width: 18,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: "800",
  },
  pointText: {
    ...TYPE.body,
    flex: 1,
  },
  example: {
    marginTop: 18,
  },
  exampleCaption: {
    ...TYPE.label,
    marginBottom: 8,
  },
  code: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    padding: 14,
  },
  codeText: {
    ...TYPE.mono,
  },
  actions: {
    marginTop: 26,
  },
  pager: {
    flexDirection: "row",
    marginTop: 26,
  },
  pagerButton: {
    flex: 1,
    paddingVertical: 10,
  },
  pagerRight: {
    alignItems: "flex-end",
  },
  pagerLabel: {
    ...TYPE.label,
    fontSize: 9,
  },
  pagerTitle: {
    ...TYPE.small,
    marginTop: 4,
    maxWidth: 150,
  },
});
