/**
 * HOME — the overview
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/dashboard/page.tsx
 *
 * THE WEB APP'S DASHBOARD, RE-IMAGINED FOR A PHONE
 * ---------------------------------------------------------------------------
 * On the web, the dashboard was a full-height glass console with a tab strip
 * across the top, an uncovered strip above it carrying the identity block,
 * and the numbers laid out in a wide four-across row.
 *
 * On a phone that becomes:
 *
 *   · the IDENTITY STRIP at the top, with the Letter Glitch field behind it,
 *     which is the web app's uncovered strip, now sized for a thumb;
 *   · the NUMBERS as a two-up grid of stat cards rather than a wide row;
 *   · CONTINUE READING, which is the tile the web app could only describe as
 *     a placeholder, because there is now a read position to resume from;
 *   · YOUR MODULES as a card list;
 *   · the placeholders, folded into a single honest panel rather than eight
 *     tiles of wishful thinking.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, EmptyState, Label, ListRow, Section, Stat, Title } from "@/components/ui";
import { TerminalPanel } from "@/components/ui/TerminalPanel";
import { ScreenHeader, HEADER_TITLE } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";
import {
  getModuleContent,
  getOwnedCodes,
  listModules,
  listPurchases,
  subjectOf,
} from "@/storage/library";
import { completedLessonCount, listReadPositions, moduleStats, tallyAttempts } from "@/storage/progress";
import { formatZar } from "@/lib/money";
import { readFirstName } from "@/storage/settings";
import { RADIUS } from "@/theme/radius";

/**
 * THE README CONTAINER'S CORNER RADIUS.
 *
 * The README terminal is chrome rather than a card, and chrome on a phone
 * is chrome with a curve on it, so it asks for the panel radius rather than
 * taking the default silently. It is the same twelve points every other
 * surface in the app has, so the rounded things agree with each other.
 */
const README_RADIUS = RADIUS.panel;

export default function HomeScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [modules, setModules] = useState<ReadonlyArray<{ code: string; name: string }>>([]);
  const [ownedModules, setOwnedModules] = useState<ReadonlyArray<{ code: string; name: string }>>([]);
  const [sections, setSections] = useState(0);
  const [spent, setSpent] = useState(0);
  const [purchaseCount, setPurchaseCount] = useState(0);
  const [attempts, setAttempts] = useState({ right: 0, wrong: 0 });
  const [weak, setWeak] = useState<ReadonlyArray<{ moduleCode: string; wrong: number }>>([]);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [resume, setResume] = useState<
    { moduleCode: string; lessonN: number; title: string } | null
  >(null);
  const [refreshing, setRefreshing] = useState(false);

  /**
   * THE DATA, FETCHED.
   *
   * Split from the state it becomes, because a setState called
   * SYNCHRONOUSLY in an effect body causes a cascading render — and
   * because the mount effect and the pull-to-refresh want exactly
   * the same work.
   */
  const fetchHome = useCallback(async () => {
    const all = await listModules();
    const ownedCodes = await getOwnedCodes();
    const purchases = await listPurchases();
    const positions = await listReadPositions();
    const name = await readFirstName();
    const stats = await moduleStats();
    const tally = await tallyAttempts();

    const mine = all.filter((m) => ownedCodes.has(m.code));

    let sectionCount = 0;
    for (const m of mine) {
      const content = await getModuleContent(m.code);
      sectionCount += content?.lessons.length ?? 0;
    }

    const completed = new Map<string, number>();
    for (const m of mine) {
      completed.set(m.code, await completedLessonCount(m.code));
    }

    const next = positions.find((p) => !p.completed && completed.get(p.moduleCode) !== undefined);
    let resumeEntry: { moduleCode: string; lessonN: number; title: string } | null = null;
    if (next !== undefined) {
      const content = await getModuleContent(next.moduleCode);
      const lesson = content?.lessons.find((l) => l.n === next.lessonN);
      resumeEntry = {
        moduleCode: next.moduleCode,
        lessonN: next.lessonN,
        title: lesson?.title ?? `Lesson ${next.lessonN}`,
      };
    }

    return {
      all,
      ownedCodes,
      name,
      mine,
      sectionCount,
      purchases,
      tally,
      stats,
      resumeEntry,
    };
  }, []);

  const load = useCallback(async () => {
    const data = await fetchHome();
    setDisplayName(data.name);
    setModules(data.all.map((m) => ({ code: m.code, name: m.name })));
    setOwnedModules(data.mine.map((m) => ({ code: m.code, name: m.name })));
    setSections(data.sectionCount);
    setSpent(
      data.purchases
        .filter((p) => p.status === "paid")
        .reduce((sum, p) => sum + p.amountCents, 0),
    );
    setPurchaseCount(data.purchases.length);
    setAttempts(data.tally);
    setWeak(data.stats.filter((s) => s.wrong > 0).slice(0, 3));
    setResume(data.resumeEntry);
  }, [fetchHome]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const data = await fetchHome();
      if (cancelled) return;
      setDisplayName(data.name);
      setModules(data.all.map((m) => ({ code: m.code, name: m.name })));
      setOwnedModules(data.mine.map((m) => ({ code: m.code, name: m.name })));
      setSections(data.sectionCount);
      setSpent(
        data.purchases
          .filter((p) => p.status === "paid")
          .reduce((sum, p) => sum + p.amountCents, 0),
      );
      setPurchaseCount(data.purchases.length);
      setAttempts(data.tally);
      setWeak(data.stats.filter((s) => s.wrong > 0).slice(0, 3));
      setResume(data.resumeEntry);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchHome]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
    const first = (displayName ?? "").trim().split(/\s+/)[0];
    return first !== undefined && first.length > 0 ? `${part}, ${first}` : part;
  }, [displayName]);

  const accuracy =
    attempts.right + attempts.wrong === 0
      ? null
      : Math.round((attempts.right / (attempts.right + attempts.wrong)) * 100);

  /*
   * THE COLLAPSE.
   *
   * Tapping the greeting drops the README container out of the header — the
   * container is put away and the content below it moves up to take its
   * place, and tapping the greeting again brings it back.
   *
   * It is a HEIGHT animation rather than a translation, because the thing
   * that has to happen is the container LEAVING the space it was in: that is
   * what makes it read as the container being put away rather than as a card
   * moving about.
   *
   * THE MEASUREMENT IS OF THE CONTENT, NOT OF THE ANIMATED BOX.
   *
   * The animated view's own height is what the animation changes, so
   * measuring IT would measure the animation: it would start at zero, stay
   * at zero, and the container would never appear. So the height is
   * measured on an inner view that is not animated, and the outer one is
   * given that height.
   *
   * AND THE CLIP GOES ON THE INNER VIEW TOO.
   *
   * `overflow: hidden` on the animated box does not reliably clip a child
   * that has a height of its own — on the web it can still paint outside a
   * zero-height parent. The inner wrapper therefore carries the same
   * animated height, so the thing that actually disappears is the content
   * rather than the box around it.
   *
   * THE SHARED VALUE IS NEVER WRITTEN DURING A RENDER.
   *
   * Reanimated says so loudly, and it is right: writing `collapse.value`
   * inside a `setState` updater writes it DURING React's render phase,
   * because the updater function is called while React is rendering. On the
   * web that is merely untidy; on Android it means the animation is started
   * from inside a render, the worklet is scheduled against a shared value
   * that is about to be torn down, and the container never moves at all.
   *
   * So the toggle computes the next value from a REF, writes the shared
   * value outside of React's render phase, and lets the state follow.
   */
  const collapsedRef = useRef(false);
  const [collapsed, setCollapsed] = useState(false);

  /*
   * THE SHARED VALUES LIVE IN REFS.
   *
   * A shared value returned by `useSharedValue` cannot be both a dependency
   * of a `useCallback` and something that callback writes to:
   *
   *   · listing it in the dependency array FREEZES it, and the React
   *     Compiler's immutability rule then refuses every write to it
   *     ("This value cannot be modified");
   *   · leaving it out of the dependency array is what `react-hooks/
   *     exhaustive-deps` warns about.
   *
   * The two rules are both right and they cannot both be satisfied with a
   * bare shared value. A REF is: a ref's `.current` is mutable by
   * definition, the compiler does not freeze it, and `exhaustive-deps` knows
   * a ref is stable and does not ask for it in the dependency array.
   *
   * And it is not a workaround — it is the more honest shape. The collapse
   * is a piece of animation STATE, and the animation wants to own it: the
   * value has to be readable from the UI thread AND writable from a
   * callback, without React re-rendering in between.
   */
  const collapseRef = useRef(useSharedValue(0));
  const readmeHeightRef = useRef(useSharedValue(0));

  const onReadmeLayout = useCallback((event: LayoutChangeEvent) => {
    const height = event.nativeEvent.layout.height;
    const readmeHeight = readmeHeightRef.current;
    if (Math.abs(readmeHeight.get() - height) > 0.5) {
      readmeHeight.set(height);
    }
  }, []);

  const toggleCollapse = useCallback(() => {
    const next = !collapsedRef.current;
    collapsedRef.current = next;
    // The write is OUTSIDE the render phase, which is the whole point.
    collapseRef.current.set(withTiming(next ? 1 : 0, { duration: 280 }));
    setCollapsed(next);
  }, []);

  const readmeStyle = useAnimatedStyle(() => ({
    height: readmeHeightRef.current.value * (1 - collapseRef.current.value),
    opacity: 1 - collapseRef.current.value * 0.35,
    overflow: "hidden",
  }));

  const readmeInnerStyle = useAnimatedStyle(() => ({
    height: readmeHeightRef.current.value * (1 - collapseRef.current.value),
    overflow: "hidden",
  }));

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      {/*
       * THE HEADER.
       *
       * It reaches up into the status bar, so the status bar's background is
       * the header's background and there is no seam between them. The
       * greeting lives in it, centred, and tapping it puts the README
       * container away.
       */}
      <ScreenHeader>
        <Pressable
          onPress={toggleCollapse}
          accessibilityRole="button"
          accessibilityLabel={collapsed ? "Show the notes" : "Hide the notes"}
          accessibilityState={{ expanded: !collapsed }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={[styles.greeting, { color: theme.tokens.fg }]}>{greeting}</Text>
        </Pressable>
      </ScreenHeader>

      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tokens.fgDim} />
        }
      >
        {/* ---- The README container, dropping out of the header ----
             THREE LAYERS, and each one is there for a reason:
               · the OUTER view is the animated one — its height is what the
                 collapse changes, so it is the box that shrinks;
               · the MIDDLE view carries the same animated height, because
                 `overflow: hidden` on the outer one does not reliably
                 clip a child that has a height of its own;
               · the INNER view is the one that is MEASURED, and it is not
                 animated at all — measuring the outer one would measure
                 the animation, and the container would never appear. */}
        <Animated.View style={[styles.readme, readmeStyle]}>
          <Animated.View style={readmeInnerStyle}>
            <View onLayout={onReadmeLayout}>
              <TerminalPanel radius={README_RADIUS} strength="medium">
                {/* The eyebrow is `fgDim`, which is a dim grey: on a very dark panel it is
                    too close to the panel to read, and on a very light one it is
                    worse. `fgMuted` is the token that holds up on both. */}
                <Label style={[styles.readmeEyebrow, { color: theme.tokens.fgMuted }]}>
                  COMPUTER SCIENCE · NMU
                </Label>
                <Title style={styles.readmeTitle}>Notes that learn you as you learn them</Title>
                <Body style={styles.readmeSub}>
                  The notes we got were good enough. But I made them better.
                </Body>
              </TerminalPanel>
            </View>
          </Animated.View>
        </Animated.View>

        {/*
         * THE ONE LINE UNDER THE HEADER.
         *
         * The greeting is in the header now, so what is left of the old
         * identity strip is the one thing it said that the header does not:
         * how much the reader has, in a single line. The "NEXUS" eyebrow
         * went with the greeting — the header is the app's name, in the
         * window's own bar, and repeating it under itself was noise.
         */}
        <Body style={[styles.stripSub, styles.onField]}>
          {ownedModules.length === 0
            ? "Pick a module and the notes come with it."
            : `${ownedModules.length} module${ownedModules.length === 1 ? "" : "s"} open · ${sections} section${sections === 1 ? "" : "s"} in reach`}
        </Body>

        {/* ---- The numbers ---- */}
        <View style={styles.stats}>
          <Stat
            label="modules owned"
            value={`${ownedModules.length}/${modules.length}`}
            foot={ownedModules.length === 0 ? "browse the catalogue" : "in your account"}
          />
          <Stat
            label="sections in reach"
            value={String(sections)}
            foot={ownedModules.length === 0 ? "buy a module to unlock" : "across what you own"}
          />
          <Stat
            label="practice"
            value={accuracy === null ? "—" : `${accuracy}%`}
            foot={
              attempts.right + attempts.wrong === 0
                ? "no answers yet"
                : `${attempts.right} right, ${attempts.wrong} to look at`
            }
          />
          <Stat
            label="total spent"
            value={formatZar(spent)}
            foot={purchaseCount === 0 ? "no purchases yet" : "lifetime, notes included"}
          />
        </View>

        {/* ---- Continue reading ---- */}
        <Section
          title="Continue reading"
          subtitle="Pick up where you left off in a module you own."
        >
          <Card>
            {resume === null ? (
              <EmptyState
                title="Nothing open"
                body="Open a lesson and this becomes a one-tap way back into it."
              />
            ) : (
              <ListRow
                title={resume.title}
                subtitle={`${resume.moduleCode} · Lesson ${resume.lessonN}`}
                detail="Tap to pick up where you left off."
                onPress={() =>
                  router.push({
                    pathname: "/lesson/[code]/[n]",
                    params: { code: resume.moduleCode, n: String(resume.lessonN) },
                  })
                }
                trailing={<Icon name="chevronRight" size={18} tone="accent" />}
              />
            )}
          </Card>
        </Section>

        {/* ---- Your modules ---- */}
        <Section
          title="Your modules"
          subtitle="Everything you have unlocked."
          action={
            <Button
              label="open"
              variant="ghost"
              onPress={() => router.push("/modules")}
            />
          }
        >
          <Card>
            {ownedModules.length === 0 ? (
              <>
                <Card.Content>
                  <Body>
                    You have not bought anything yet. The catalogue is one tap away.
                  </Body>
                </Card.Content>
                <Card.Footer>
                  <Button label="open the catalogue" onPress={() => router.push("/modules")} />
                </Card.Footer>
              </>
            ) : (
              ownedModules.map((m) => (
                <ListRow
                  key={m.code}
                  title={m.name}
                  subtitle={`${m.code} · ${subjectOf(m.code)}`}
                  onPress={() =>
                    router.push({ pathname: "/module/[code]", params: { code: m.code } })
                  }
                  trailing={<Icon name="chevronRight" size={18} tone="accent" />}
                />
              ))
            )}
          </Card>
        </Section>

        {/* ---- Weak spots ---- */}
        {weak.length > 0 ? (
          <Section
            title="Weak spots"
            subtitle="Which modules you keep getting wrong, worst first."
          >
            <Card>
              {weak.map((w) => (
                <ListRow
                  key={w.moduleCode}
                  title={w.moduleCode}
                  subtitle={subjectOf(w.moduleCode)}
                  detail={`${w.wrong} wrong — worth a second look`}
                  onPress={() => router.push("/practice")}
                />
              ))}
            </Card>
          </Section>
        ) : null}

        {/* ---- What is not built yet ---- */}
        <Section
          title="Not built yet"
          subtitle="Honest list of what the app does not do yet."
        >
          <Card>
            {[
              "Spaced revision cards",
              "Notes in your own words",
              "Annotations on the notes",
              "Offline PDF bundles",
            ].map((item) => (
              <ListRow key={item} title={item} detail="planned, not shipped" />
            ))}
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

  /*
   * THE GREETING, IN THE HEADER.
   *
   * The same size as the header's own title, because it IS the header's
   * title here — the home screen's bar says "Good morning" rather than
   * "Home", and it is set the same way so the two do not disagree.
   */
  greeting: {
    ...HEADER_TITLE,
  },
  /*
   * THE README CONTAINER.
   *
   * It sits under the header, and the header's background runs up into the
   * status bar — so the container drops out of the header rather than
   * floating on the page.
   */
  readme: {
    marginTop: 14,
    marginBottom: 14,
  },
  readmeEyebrow: {
    ...TYPE.label,
    marginBottom: 10,
  },
  readmeTitle: {
    ...TYPE.title,
  },
  readmeSub: {
    ...TYPE.small,
    marginTop: 8,
  },
  /*
   * THE ONE LINE UNDER THE HEADER.
   *
   * It is the last of the old identity strip: the part the header does not
   * say, which is how much the reader has.
   */
  stripSub: {
    ...TYPE.small,
    marginBottom: 18,
  },
  /*
   * TEXT THAT SITS DIRECTLY ON THE FIELD.
   *
   * The identity block is the one piece of the home screen that is not
   * inside a panel, so it is the one piece of type that has to be
   * readable over a live ASCII gradient. A soft shadow does that without
   * putting a box around it, and a box around it would be a rectangle
   * inside the rectangle the README container already is.
   */
  onField: {
    textShadowColor: "rgba(0, 0, 0, 0.85)",
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  },
  stats: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 20,
  },
  cardAction: {
    marginTop: 16,
  },
});
