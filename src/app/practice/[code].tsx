/**
 * THE PRACTICE SESSION
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/(app)/practice/practice.tsx
 *
 * One question at a time, answered, explained, then the next. Deliberately
 * not a list: a reader who can see eight questions at once will pattern-match
 * across them, and a distractor only names a misconception if it was chosen
 * before its neighbours were visible.
 *
 * THE ANSWER NEVER ARRIVES WITH THE QUESTION.
 * ---------------------------------------------------------------------------
 * The screen's state holds either a `PublicQuestion` (options, no `correct`
 * flag, no explanations) or a `GradeResult`. Never both. The graded answer
 * only exists after `gradeAnswer()` has run, so the reveal is a consequence
 * of the state machine rather than a promise.
 *
 * WHY THERE IS NO TIMER AND NO SCORE OUT OF TEN: neither teaches anything a
 * per-question explanation does not, and both add pressure to guess. The
 * progress indicator counts questions, not points, for the same reason.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, Label, Num, Prose, Radio, RadioGroup, Title } from "@/components/ui";
import { RADIUS } from "@/theme/radius";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";
import {
  gradeAnswer,
  outcomeFor,
  publicQuestion,
  type GradeResult,
  type PublicQuestion,
} from "@/lib/practice-grading";
import { getQuestions } from "@/storage/library";
import { recordAttempt } from "@/storage/progress";
import type { PracticeQuestion } from "@/content/practice-schema";

const DIFFICULTY_WORDS = ["", "Foundation", "Working", "Stretch", "Hard"] as const;

type Missed = { question: PublicQuestion; result: GradeResult };

export default function PracticeSessionScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();

  const [session, setSession] = useState<ReadonlyArray<PublicQuestion> | null>(null);
  const [at, setAt] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [missed, setMissed] = useState<ReadonlyArray<Missed>>([]);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [moduleCode, setModuleCode] = useState(code);


  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const all = await getQuestions(code);
      const usable = all.filter((q) => q.format === "multiple-choice");
      if (cancelled) return;
      if (usable.length === 0) {
        setError("There are no practice questions for that module yet.");
        return;
      }
      setSession(usable.map(publicQuestion));
      setModuleCode(code);
      setAt(0);
      setChosen(null);
      setResult(null);
      setScore({ right: 0, wrong: 0 });
      setMissed([]);
      setFinished(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const current = session?.[at] ?? null;
  const answered = result !== null;
  const isLast = session !== null && at + 1 >= session.length;

  const submit = useCallback(async () => {
    if (current === null || chosen === null) return;
    const all = await getQuestions(code);
    const full = all.find((q) => q.id === current.id) as PracticeQuestion | undefined;
    if (full === undefined) return;
    const graded = gradeAnswer(full, chosen);
    setResult(graded);
    /*
     * HAPTICS, SPARINGLY.
     *
     * One tap on the answer, and the answer itself says whether it was
     * right. A buzz for a right answer and a duller one for a miss is the
     * difference between a screen the reader is looking at and a screen they
     * are reading.
     */
    void Haptics.impactAsync(
      graded.correct ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    setScore((s) => ({
      right: s.right + (graded.correct ? 1 : 0),
      wrong: s.wrong + (graded.correct ? 0 : 1),
    }));
    if (!graded.correct) {
      setMissed((m) => [...m, { question: current, result: graded }]);
    }
    await recordAttempt(
      graded.questionId,
      graded.chosenOptionId,
      outcomeFor(graded),
      graded.chosenExplanation,
    );
  }, [chosen, code, current]);

  const next = useCallback(() => {
    if (session === null) return;
    if (at + 1 >= session.length) {
      setFinished(true);
      return;
    }
    setAt((n) => n + 1);
    setChosen(null);
    setResult(null);
  }, [at, session]);

  const closeSession = useCallback(() => {
    router.back();
  }, [router]);

  const goAgain = useCallback(() => {
    setAt(0);
    setChosen(null);
    setResult(null);
    setMissed([]);
    setScore({ right: 0, wrong: 0 });
    setFinished(false);
  }, []);

  const askTutor = useCallback(
    (question: PublicQuestion, grade: GradeResult) => {
      const text =
        grade.correct === true
          ? `I'm revising a practice question I got RIGHT and want to understand it better: "${question.prompt}"\nI chose: ${grade.chosenOptionText ?? "nothing"}\nI understand it's correct but not why.`
          : `I'm practising and got this wrong: "${question.prompt}"\nI chose: ${grade.chosenOptionText ?? "nothing"}\nI don't understand why that's wrong.`;
      router.push({ pathname: "/tutor", params: { ask: text } });
    },
    [router],
  );

  const header = useMemo(
    () => (
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          onPress={closeSession}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={styles.backRow}>
            <Icon name="chevronLeft" size={16} tone="accent" />
            <Num style={[styles.backText, { color: theme.tokens.accentA }]}>{moduleCode}</Num>
          </View>
        </Pressable>
        {session !== null ? (
          <Num style={[styles.progress, { color: theme.tokens.fgDim }]}>
            {at + 1} of {session.length} · {score.right} right
          </Num>
        ) : null}
      </View>
    ),
    [at, closeSession, moduleCode, score.right, session, theme],
  );

  /* -- the review, at the end of a session -- */
  if (finished && session !== null) {
    const total = score.right + score.wrong;
    return (
      <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
        <ScreenHeader title={moduleCode} />
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 28 },
          ]}
        >
          {header}
          <Title style={styles.reviewTitle}>
            {score.right} of {total} right
          </Title>
          <Body style={styles.reviewLead}>
            {missed.length === 0
              ? "Nothing to look at. Try a harder module, or one you have not seen."
              : `These ${missed.length} are the ones worth a second look.`}
          </Body>

          {missed.map((m) => (
            <Card key={m.question.id} style={styles.missCard}>
              <Num style={[styles.missPrompt, { color: theme.tokens.fg }]}>
                {m.question.prompt}
              </Num>
              <Num style={[styles.missLine, { color: theme.tokens.danger }]}>
                You chose: {m.result.chosenOptionText ?? "nothing"}
              </Num>
              <Prose>{m.result.chosenExplanation}</Prose>
              <Num style={[styles.missLine, { color: theme.tokens.ok }]}>
                The answer: {m.result.correctOptionText}
              </Num>
              {m.result.correctExplanation !== null ? (
                <View style={styles.missGap}>
                  <Prose>{m.result.correctExplanation}</Prose>
                </View>
              ) : null}
              <View style={styles.missAction}>
                <Button
                  label="ask the partner about this one"
                  tone="ghost"
                  onPress={() => askTutor(m.question, m.result)}
                />
              </View>
            </Card>
          ))}

          <View style={styles.actions}>
            <Button label="go again" onPress={goAgain} />
            <Button label="all modules" variant="outline" onPress={closeSession} />
          </View>
        </ScrollView>
      </View>
    );
  }

  /* -- a session -- */
  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title={moduleCode} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        {header}

        {error !== null ? (
          <Card>
            <Body>{error}</Body>
            <View style={styles.missAction}>
              <Button label="back to practice" variant="outline" onPress={closeSession} />
            </View>
          </Card>
        ) : current === null ? (
          <Body>Loading…</Body>
        ) : (
          <>
            <View style={styles.meta}>
              <Label>{DIFFICULTY_WORDS[current.difficulty] ?? `Level ${current.difficulty}`}</Label>
              {current.tags.length > 0 ? (
                <Num style={[styles.tags, { color: theme.tokens.fgDim }]}>
                  {current.tags.join(" · ")}
                </Num>
              ) : null}
            </View>

            <Num style={[styles.prompt, { color: theme.tokens.fg }]}>{current.prompt}</Num>

            <RadioGroup
              value={chosen}
              onValueChange={(next) => setChosen(next)}
              style={styles.options}
            >
              {current.options.map((o) => {
                const isChosen = chosen === o.id;
                const isAnswer = answered && result?.correctOptionId === o.id;
                return (
                  <View key={o.id}>
                    <Radio
                      value={o.text}
                      selected={isChosen}
                      disabled={answered}
                      onPress={() => setChosen(o.id)}
                    >
                      <Num style={[styles.optionText, { color: theme.tokens.fg }]}>{o.text}</Num>
                    </Radio>
                    {answered && (isAnswer || isChosen) ? (
                      <View style={styles.why}>
                        <Text
                          style={[
                            styles.whyHead,
                            { color: isAnswer ? theme.tokens.ok : theme.tokens.danger },
                          ]}
                        >
                          {isAnswer
                            ? isChosen
                              ? "Correct."
                              : "This is the one."
                            : "Not this one."}
                        </Text>
                        <Prose>
                          {isAnswer
                            ? (result?.correctExplanation ?? result?.chosenExplanation ?? "")
                            : (result?.chosenExplanation ?? "")}
                        </Prose>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </RadioGroup>

            <View style={styles.actions}>
              {!answered ? (
                <Button
                  label="check answer"
                  disabled={chosen === null}
                  onPress={() => void submit()}
                />
              ) : (
                <>
                  <Button label={isLast ? "finish" : "next question"} onPress={next} />
                  <View style={styles.missAction}>
                    <Button
                      label={
                        result?.correct === true
                          ? "understand why — ask the partner"
                          : "still do not get it — ask the partner"
                      }
                      variant="outline"
                      onPress={() => {
                        if (current !== null && result !== null) askTutor(current, result);
                      }}
                    />
                  </View>
                </>
              )}
            </View>
          </>
        )}
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
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  back: {
    paddingVertical: 6,
    paddingRight: 12,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    ...TYPE.subheading,
  },
  progress: {
    ...TYPE.small,
  },
  reviewTitle: {
    ...TYPE.title,
  },
  reviewLead: {
    marginTop: 6,
    marginBottom: 18,
  },
  missCard: {
    marginBottom: 12,
  },
  missPrompt: {
    ...TYPE.subheading,
    marginBottom: 10,
  },
  missLine: {
    ...TYPE.small,
    marginTop: 8,
    marginBottom: 4,
  },
  missGap: {
    marginTop: 8,
  },
  missAction: {
    marginTop: 14,
    alignSelf: "flex-start",
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tags: {
    fontSize: 11,
    flexShrink: 1,
    textAlign: "right",
    marginLeft: 12,
  },
  prompt: {
    ...TYPE.subheading,
    fontSize: 16,
    lineHeight: 25,
    marginTop: 12,
    marginBottom: 20,
  },
  options: {
    marginBottom: 20,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.field,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    minHeight: 52,
    justifyContent: "center",
  },
  /**
   * The radio mark. A ring that fills in when the answer is chosen.
   */
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  optionText: {
    ...TYPE.body,
  },
  why: {
    paddingLeft: 4,
    paddingRight: 4,
    paddingBottom: 6,
  },
  whyHead: {
    ...TYPE.label,
    fontSize: 9,
    marginBottom: 4,
  },
  actions: {
    marginTop: 8,
  },
});
