/**
 * THE TUTOR — the study partner
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/(app)/ai/ai-tutor.tsx
 *
 * THE TRANSCRIPT
 * ---------------------------------------------------------------------------
 * On the web, the tutor was a chat over a model: a message went out, a
 * provider streamed an answer back, and the transcript was saved to
 * Postgres as each message was written.
 *
 * Here the same shape, with the network put back in. A message goes out
 * from the device, the reader's own provider streams an answer back, and
 * the transcript is saved to the device's own SQLite as each message is
 * written. The provider, its key and its model are the reader's to choose —
 * see `src/app/settings/provider.tsx`.
 *
 * WHAT THE MODEL IS ALLOWED TO SAY
 * ---------------------------------------------------------------------------
 * The model may answer from its own knowledge, and the answer would be
 * better written than anything the app could compose. It would also be
 * wrong more often, in a way the reader cannot check.
 *
 * So the model gets ONE tool: `search_notes`, which runs on the device
 * over the notes the app already has (`lib/tutor-engine.ts`). The
 * passages it finds are the material, and the prompt tells the model that
 * passages are reference material and never instructions. If the notes do
 * not cover something, the honest answer is "your notes don't cover that
 * yet", and the prompt says so in as many words.
 *
 * HISTORY IS LOCAL, not held in this component. `threadId` is the one piece
 * of state that decides which conversation is on screen; opening one from
 * the pane sets it and loads that thread's messages in. Saving is a side
 * effect of a message being written rather than an action the user takes,
 * so a conversation that is opened and never continued still persists —
 * which leaves the delete button as the only way to lose one.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
  type KeyboardEvent as RNKeyboardEvent,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Markdown } from "@/components/Markdown";
import { Alert, Badge, Body, Button, Label, Select } from "@/components/ui";
import { RADIUS } from "@/theme/radius";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useFieldLevel } from "@/components/GradientAsciiBackground";
import { Icon } from "@/components/icons";
import { STARTERS, titleFor } from "@/lib/tutor-engine";
import { newId } from "@/lib/ids";
import {
  SEARCH_NOTES_TOOL,
  TUTOR_SYSTEM_PROMPT,
  runSearchNotes,
  type NotesRead,
} from "@/lib/tutor-prompt";
import { listModels, streamChat, type ChatMessage, type ModelInfo } from "@/lib/llm";
import { modelOption, modelValue, splitModelValue } from "@/lib/model-picker";
import {
  getProviderWithKey,
  listProviders,
  readActiveProviderId,
  readModelChoice,
  writeActiveProviderId,
  writeModelChoice,
  type Provider,
} from "@/storage/provider";
import {
  deleteThread,
  listMessages,
  listThreads,
  newThreadId,
  persistMessages,
  type ThreadSummary,
} from "@/storage/chat";

type Row = { id: string; role: "user" | "assistant"; content: string };

/** How many messages of the transcript are sent to the model. */
const HISTORY_LIMIT = 20;

/**
 * How long a request may take to produce its FIRST token before the app
 * stops waiting for it.
 */
const WATCHDOG_MS = 30_000;

export default function TutorScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ ask?: string }>();
  const { height: windowHeight } = useWindowDimensions();

  const [input, setInput] = useState("");
  const [rows, setRows] = useState<ReadonlyArray<Row>>([]);
  const [threadId, setThreadId] = useState(newThreadId);
  const [threads, setThreads] = useState<ReadonlyArray<ThreadSummary> | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notesRead, setNotesRead] = useState<ReadonlyArray<NotesRead>>([]);

  const [provider, setProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [model, setModel] = useState<string>("");
  /** Every provider the reader has added, not only the active one. */
  const [providers, setProviders] = useState<ReadonlyArray<Provider>>([]);
  /** The models of each provider, fetched once and kept. */
  const [modelsByProvider, setModelsByProvider] = useState<
    Readonly<Record<string, ReadonlyArray<ModelInfo>>>
  >({});
  /** The providers whose models are being fetched right now. */
  const [loadingProviders, setLoadingProviders] = useState<ReadonlyArray<string>>([]);

  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const seeded = useRef(false);
  /** The providers whose models have already been asked for. */
  const asked = useRef<ReadonlyArray<string>>([]);

  /**
   * FREE ONLY, IN THE CHAT TOO.
   *
   * The same filter the settings screen offers, for the same reason: a
   * provider that lists hundreds of models is a list nobody scrolls
   * through, and the ones that cost nothing are usually the ones wanted.
   */
  const [freeOnly, setFreeOnly] = useState(true);
  const abortRef = useRef<AbortController | null>(null);

  /*
   * THE KEYBOARD, AND WHERE THE COMPOSER GOES WHEN IT ARRIVES.
   * ---------------------------------------------------------------------------
   * The composer is the bottom of the screen and the keyboard is the bottom
   * of the screen too, so one of them has to move. Which one depends on the
   * platform, and that is the whole problem: on iOS the window does not
   * resize and the keyboard lands on top of the composer, and on Android it
   * usually does resize, and the composer rides up on its own.
   *
   * So rather than guess, the composer is given the OVERLAP: how much of the
   * window the keyboard is actually covering. That is the window's height
   * minus the keyboard's top edge, and it is the only number that is right
   * in every case:
   *
   *   · iOS, window not resized: the keyboard's top is above the window's
   *     bottom, so the overlap is the keyboard's height, and the composer
   *     is lifted clear of it.
   *   · Android, window resized: the window is already only as tall as the
   *     space above the keyboard, so the keyboard's top IS the window's
   *     bottom, the overlap is zero, and the composer is left where it is.
   *
   * The second case is why this is computed at render time rather than read
   * off the keyboard event: the resize and the event arrive in either
   * order, and a number captured in the event would be the wrong one in one
   * of them. A `KeyboardAvoidingView` cannot do this, because it has to
   * commit to one behaviour per platform and the platforms disagree.
   */
  useEffect(() => {
    const onShow = (event: RNKeyboardEvent): void => {
      setKeyboardTop(event.endCoordinates.screenY);
    };
    const shown =
      Platform.OS === "ios"
        ? Keyboard.addListener("keyboardWillShow", onShow)
        : Keyboard.addListener("keyboardDidShow", onShow);
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardTop(null));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const keyboardOverlap = keyboardTop === null ? 0 : Math.max(0, windowHeight - keyboardTop);

  /* ---- the provider, its key and the model the chat is using ---- */
  const loadProvider = useCallback(async () => {
    const all = await listProviders();
    const activeId = await readActiveProviderId();
    const chosen = all.find((p) => p.id === activeId) ?? all[0] ?? null;
    setProviders(all);
    setProvider(chosen);
    // A provider's catalogue can change, and a reader who has just been in
    // the settings may have added one, so the models are asked for again.
    setModelsByProvider({});
    asked.current = [];
    if (chosen === null) {
      setApiKey(null);
      setModel("");
      return;
    }
    const withKey = await getProviderWithKey(chosen.id);
    setApiKey(withKey?.apiKey ?? null);
    const picked = await readModelChoice(chosen.id);
    setModel(picked ?? chosen.model);
  }, []);

  /*
   * THE PROVIDER, EVERY TIME THE SCREEN IS FOCUSED.
   *
   * Not on mount, but on focus — and the difference is the whole reason a
   * reader who had just added a provider was told they had not.
   *
   * The provider lives in the settings screen, and the tutor is a tab
   * beside it. Adding a provider and coming back does not remount the
   * tab, so an effect that runs once on mount has already run by the
   * time the reader arrives, and the tutor is still holding the answer
   * it worked out before the provider existed.
   *
   * `useFocusEffect` runs on focus instead, which is the moment the
   * question "what provider is there now?" is worth asking. It also
   * covers the reader who added one in a different way — a restored
   * backup, a second device — and it costs one read of a small list.
   */
  useFocusEffect(
    useCallback(() => {
      void (async () => {
        await loadProvider();
      })();
    }, [loadProvider]),
  );

  /* ---- the models, from the provider's own list ---- */
  /**
   * A PROVIDER'S MODELS, FETCHED ONCE AND KEPT.
   *
   * The reader can open any provider's models from the picker, so the list
   * is fetched per provider and kept: a provider is asked once, and the
   * answer is remembered for as long as the screen is mounted.
   */
  const loadProviderModels = useCallback(
    async (providerId: string): Promise<void> => {
      if (asked.current.includes(providerId)) return;
      const target = providers.find((p) => p.id === providerId);
      if (target === undefined) return;
      asked.current = [...asked.current, providerId];
      setLoadingProviders((prev) =>
        prev.includes(providerId) ? prev : [...prev, providerId],
      );
      const withKey = await getProviderWithKey(providerId);
      let list: ReadonlyArray<ModelInfo> = [];
      if (withKey !== null) {
        try {
          list = await listModels(target.baseUrl, withKey.apiKey);
        } catch {
          // A provider that will not list its models is not a failure: the
          // reader can still type one in the settings.
          list = [];
        }
      }
      setModelsByProvider((prev) => ({ ...prev, [providerId]: list }));
      setLoadingProviders((prev) => prev.filter((id) => id !== providerId));
    },
    [providers],
  );

  useEffect(() => {
    if (provider === null) return;
    void (async () => {
      await loadProviderModels(provider.id);
    })();
  }, [loadProviderModels, provider]);

  const chooseModel = useCallback(
    (next: string) => {
      const parsed = splitModelValue(next);
      if (parsed === null) return;
      if (provider !== null && provider.id === parsed.providerId) {
        setModel(parsed.modelId);
        void writeModelChoice(parsed.providerId, parsed.modelId);
        return;
      }
      /*
       * A MODEL FROM ANOTHER PROVIDER.
       *
       * That provider becomes the active one, because a model the reader has
       * picked and the provider the tutor is talking to have to be the same
       * one — otherwise the choice means nothing.
       */
      void (async () => {
        await writeActiveProviderId(parsed.providerId);
        await writeModelChoice(parsed.providerId, parsed.modelId);
        await loadProvider();
      })();
    },
    [loadProvider, provider],
  );

  /* ---- `?ask=` PRE-FILLS THE COMPOSER, and deliberately does not send ---- */
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    const ask = params.ask;
    if (ask === undefined || ask.trim().length === 0) return;
    void (async () => {
      setInput(ask);
    })();
  }, [params.ask]);

  const openHistory = useCallback(async () => {
    const wasOpen = paneOpen;
    setPaneOpen(!wasOpen);
    if (wasOpen) return;
    const list = await listThreads();
    setThreads(list);
  }, [paneOpen]);

  const loadThread = useCallback(async (id: string) => {
    const stored = await listMessages(id);
    const next: Row[] = stored.map((m) => ({ id: m.id, role: m.role, content: m.content }));
    setThreadId(id);
    setRows(next);
    setPaneOpen(false);
    setError(null);
    setNotesRead([]);
  }, []);

  const startNewChat = useCallback(() => {
    setRows([]);
    setThreadId(newThreadId());
    setInput("");
    setStreaming(false);
    setError(null);
    setNotesRead([]);
  }, []);

  const removeThread = useCallback(async () => {
    const id = threadId;
    setRows([]);
    setThreadId(newThreadId());
    setInput("");
    await deleteThread(id);
    setThreads((prev) => prev?.filter((t) => t.id !== id) ?? null);
  }, [threadId]);

  /**
   * THE TRANSCRIPT THE MODEL SEES.
   *
   * The system prompt, then the last of the conversation. The cap is
   * there because a long conversation costs a long prompt, and the web app
   * caps at fifty messages for the same reason.
   */
  const historyFor = useCallback((): ChatMessage[] => {
    const messages: ChatMessage[] = [{ role: "system", content: TUTOR_SYSTEM_PROMPT }];
    const recent = rows.slice(-HISTORY_LIMIT);
    for (const row of recent) {
      if (row.content.trim().length === 0) continue;
      messages.push({ role: row.role, content: row.content });
    }
    return messages;
  }, [rows]);

  /*
   * THE WATCHDOG.
   * ---------------------------------------------------------------------------
   * The web app gives a request thirty seconds to produce its FIRST TOKEN and
   * then stops waiting, so a provider that has gone quiet does not leave the
   * reader looking at a bubble that never fills. The timer is disarmed the
   * moment the first token lands, deliberately: a long but healthy answer
   * must never be cut off halfway.
   *
   * A phone needs the same rule and a different clock. A timer does not
   * tick while the app is in the background — the JS thread is frozen —
   * so a reader who switches apps mid-answer comes back to a request that
   * has been dead for minutes with nothing said about it. So the deadline
   * is measured against the CLOCK, and it is checked again the moment the
   * app comes back to the front.
   */
  const startedRef = useRef<number | null>(null);
  const answeredRef = useRef(false);

  const giveUp = useCallback(() => {
    abortRef.current?.abort();
    setError(
      "No answer arrived within thirty seconds. The provider may be rate-limiting this key, or the request never got through. Try again, or pick a different model.",
    );
  }, []);

  useEffect(() => {
    if (!streaming) return;
    const tick = setInterval(() => {
      const started = startedRef.current;
      if (started === null || answeredRef.current) return;
      if (Date.now() - started > WATCHDOG_MS) {
        clearInterval(tick);
        giveUp();
      }
    }, 1000);
    return () => clearInterval(tick);
  }, [giveUp, streaming]);

  /*
   * THE SAME CHECK, WHEN THE APP COMES BACK.
   *
   * The interval above does not run while the app is in the background, so
   * the deadline is checked once more here — which is the moment it can
   * actually be wrong.
   */
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") return;
      const started = startedRef.current;
      if (started === null || answeredRef.current) return;
      if (Date.now() - started > WATCHDOG_MS) {
        giveUp();
      }
    });
    return () => subscription.remove();
  }, [giveUp]);

  const send = useCallback(
    (text: string) => {
      const body = text.trim();
      if (body.length === 0 || streaming) return;
      if (provider === null) {
        setError("Add a model provider first — the study partner cannot answer without one.");
        return;
      }
      if (apiKey === null) {
        /*
         * THE PROVIDER IS THERE BUT ITS KEY IS NOT.
         *
         * The list and the key live in different places — the list in
         * plain preferences, the key in the keychain — so they can
         * disagree. The two are named apart here, because "add a
         * provider" is the wrong advice when the reader already added
         * one: what they have to do is put the key back in.
         */
        setError(
          "That provider's key is not in the keychain. Open You → Model provider and enter the key again.",
        );
        return;
      }
      if (model.length === 0) {
        setError("Choose a model first.");
        return;
      }

      setPaneOpen(false);
      setError(null);
      setNotesRead([]);
      void Haptics.selectionAsync();

      const userId = newId("m");
      const question = body;
      setRows((prev) => [...prev, { id: userId, role: "user", content: question }]);
      setInput("");
      setStreaming(true);
      startedRef.current = Date.now();
      answeredRef.current = false;

      /*
       * The question is saved BEFORE the answer is asked for, so a provider
       * that never answers does not take the question with it.
       */
      void persistMessages(threadId, [{ id: userId, role: "user", content: question }], titleFor(question));

      const assistantId = newId("m");
      let answer = "";

      const controller = new AbortController();
      abortRef.current = controller;

      void (async () => {
        try {
          for await (const event of streamChat({
            baseUrl: provider.baseUrl,
            apiKey,
            model,
            messages: historyFor(),
            tools: [SEARCH_NOTES_TOOL],
            runTool: async (_name, args) => {
              const result = await runSearchNotes(args);
              if (result.read.length > 0) {
                setNotesRead(result.read);
              }
              return result.output;
            },
            signal: controller.signal,
          })) {
            if (event.kind === "text") {
              answer += event.delta;
              // The first token is the answer: the watchdog is disarmed from
              // here on, and a long answer is never cut off.
              answeredRef.current = true;
              setRows((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last !== undefined && last.id === assistantId) {
                  next[next.length - 1] = { ...last, content: answer };
                } else {
                  next.push({ id: assistantId, role: "assistant", content: answer });
                }
                return next;
              });
            } else if (event.kind === "error") {
              setError(event.message);
            }
          }

          if (answer.trim().length > 0) {
            await persistMessages(threadId, [
              { id: assistantId, role: "assistant", content: answer },
            ]);
            const list = await listThreads();
            setThreads(list);
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "The provider could not be reached.");
        } finally {
          abortRef.current = null;
          setStreaming(false);
        }
      })();
    },
    [apiKey, historyFor, model, provider, streaming, threadId],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  /**
   * THE PROVIDERS, AND THEIR MODELS UNDER THEM.
   *
   * A group is a provider, and the models are under it. A provider that has
   * not been opened yet has no models, so the group says how many it has
   * rather than showing an empty list.
   */
  const modelGroups = useMemo(
    () =>
      providers.map((p) => {
        const list = modelsByProvider[p.id];
        const loading = loadingProviders.includes(p.id);
        return {
          id: p.id,
          label: p.name,
          detail: loading
            ? "loading…"
            : list === undefined
              ? undefined
              : freeOnly
                ? `${list.filter((m) => m.free === true).length} free`
                : `${list.length} models`,
          options: (list ?? []).map((m) => modelOption(p.id, m)),
        };
      }),
    [freeOnly, loadingProviders, modelsByProvider, providers],
  );

  /**
   * THE FREE MODELS, AS VALUES.
   *
   * The filter is on by default, because a provider that lists hundreds of
   * models is a list nobody scrolls through, and the ones that cost nothing
   * are usually the ones wanted.
   */
  const freeValues = useMemo(() => {
    const set = new Set<string>();
    for (const [providerId, list] of Object.entries(modelsByProvider)) {
      for (const m of list) {
        if (m.free === true) set.add(modelValue(providerId, m.id));
      }
    }
    return set;
  }, [modelsByProvider]);


  const noProvider = provider === null;

  /**
   * HAS THE READER SAID ANYTHING YET?
   *
   * The field is at ninety per cent until they do, and then it goes
   * away, slowly, because a conversation is the one screen the field
   * has to stop competing with.
   *
   * It is `rows` and not a flag, so starting a new chat puts the field
   * back: an empty conversation is the field's screen, and a full one is
   * not. And because the screen is not unmounted when the reader opens
   * another one and comes back, the conversation is still on the screen
   * when they return — and so is the decision about the field.
   */
  const hasMessages = rows.length > 0;

  /*
   * THE FIELD, WHILE THIS SCREEN IS THE ONE ON TOP.
   *
   * There is one field for the whole app now — see
   * `src/components/GradientAsciiBackground.tsx` — so the tutor asks for
   * it rather than owning it. The claim is given back when the reader
   * moves to another screen, and the field goes back to being the app's
   * background there.
   */
  useFieldLevel({ intensity: 0.9, dim: hasMessages });

  return (
    <View style={styles.root}>
      {/*
       * THE HEADER.
       *
       * The tool buttons live IN the bar, on the right, where the screen's
       * title used to be. The title went because the bar already says what
       * this screen is — it is the tutor, and the tab it is on says so —
       * and the tools are what the reader actually reaches for while they
       * are mid-conversation.
       *
       * THE MODEL PICKER IS ONE OF THEM.
       *
       * It used to be a filled bar under the composer, which put the thing
       * the reader picks least often in the place their thumb rests and
       * the thing they are typing in the way. The model is a choice, and a
       * choice belongs with the other choices — in the bar — while the
       * name of what was chosen stays under the form as a footnote.
       *
       * The bar's right edge leaves room for the side menu's button, which
       * floats in the top-right corner of the app. The tools stop short of
       * it rather than sitting under it.
       */}
      <ScreenHeader
        trailing={
          <View style={styles.headerTools}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Chat history"
              onPress={() => void openHistory()}
              style={({ pressed }) => [styles.tool, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="history" size={20} tone="muted" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="New chat"
              onPress={startNewChat}
              style={({ pressed }) => [styles.tool, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="newChat" size={20} tone="muted" />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete this chat"
              onPress={() => void removeThread()}
              style={({ pressed }) => [styles.tool, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="trash" size={20} tone="danger" />
            </Pressable>
            {/*
             * THE MODEL PICKER.
             *
             * The sheet is the `Select`'s own — the trigger only says when
             * to open it — so the list of models, the groups, the free
             * filter and the tick all still live in one place.
             */}
            {provider !== null ? (
              <Select
                trigger={({ onPress }) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Choose the model"
                    onPress={onPress}
                    style={({ pressed }) => [styles.tool, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Icon name="model" size={20} tone="muted" />
                  </Pressable>
                )}
                value={
                  provider !== null && model.length > 0
                    ? modelValue(provider.id, model)
                    : null
                }
                options={[]}
                onChange={chooseModel}
                groups={modelGroups}
                onGroupOpen={(group) => void loadProviderModels(group.id)}
                filter={{
                  label: "Free only",
                  active: freeOnly,
                  onToggle: () => setFreeOnly((prev) => !prev),
                  matches: (option) => freeValues.has(option.value),
                }}
              />
            ) : null}
          </View>
        }
      />
      <View style={styles.shell}>
        {/* ---- the history pane ---- */}
        {paneOpen ? (
          <View style={[styles.pane, { borderColor: theme.tokens.line }]}>
            {threads === null || threads.length === 0 ? (
              <Body style={styles.paneNote}>No saved conversations yet</Body>
            ) : (
              threads.map((t) => (
                <Pressable
                  key={t.id}
                  accessibilityRole="button"
                  onPress={() => void loadThread(t.id)}
                  style={({ pressed }) => [styles.thread, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <Text
                    style={[
                      styles.threadTitle,
                      { color: t.id === threadId ? theme.tokens.accentA : theme.tokens.fg },
                    ]}
                    numberOfLines={1}
                  >
                    {t.title}
                  </Text>
                </Pressable>
              ))
            )}
          </View>
        ) : null}

        {/* ---- the transcript ---- */}
        <ScrollView
          ref={scrollRef}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          keyboardShouldPersistTaps="handled"
        >
          {rows.length === 0 && !streaming ? (
            noProvider ? (
              <View style={styles.empty}>
                <View style={styles.emptyHead}>
                  <Text style={[styles.emptyLead, { color: theme.tokens.fg }]}>
                    The study partner is a language model, so it needs a provider of your own.
                  </Text>
                  <Text style={[styles.emptySub, { color: theme.tokens.fgDim }]}>
                    Add one under You → Study partner. The notes stay on this device — the model
                    searches them and never keeps a copy.
                  </Text>
                </View>
                <View style={styles.emptyBody}>
                  {/*
                   * THE ONE THING TO DO HERE.
                   *
                   * The empty state has a single action, and it is the
                   * point of the screen, so it is centred rather than
                   * pushed against the gutter.
                   */}
                  <View style={styles.emptyAction}>
                    <Button
                      label="add a provider"
                      onPress={() => router.push("/settings/provider")}
                      style={styles.centred}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.empty}>
                {/*
                 * THE HEADING, AT THE TOP.
                 *
                 * It is centred and it is the first thing on the screen,
                 * because it is the label ON the three questions rather
                 * than a paragraph in its own right. The questions
                 * themselves sit in the middle of the screen — a blank
                 * conversation with three suggestions pinned to the top
                 * of it looks like the app ran out of room.
                 */}
                <View style={styles.emptyHead}>
                  <Label>START HERE</Label>
                  <Text style={[styles.emptyLead, { color: theme.tokens.fg }]}>
                    Pick one of these, or just ask.
                  </Text>
                </View>
                <View style={styles.emptyBody}>
                  {STARTERS.map((s) => (
                    <Pressable
                      key={s}
                      accessibilityRole="button"
                      onPress={() => send(s)}
                      style={({ pressed }) => [
                        styles.starter,
                        {
                          borderColor: theme.tokens.line,
                          /*
                           * OPAQUE, like every other panel in the app.
                           *
                           * `surfaceRaised` is a two per cent white: over
                           * the page it is a panel, and over the field it
                           * is nothing at all, and the ASCII field came
                           * straight through the three questions.
                           */
                          backgroundColor: theme.tokens.bg1,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      <Text style={[styles.starterText, { color: theme.tokens.fgMuted }]}>{s}</Text>
                      <Icon name="arrowUp" size={16} tone="accent" strokeWidth={2} />
                    </Pressable>
                  ))}
                </View>
              </View>
            )
          ) : null}

          {rows.map((row) => (
            <View
              key={row.id}
              style={[
                styles.bubble,
                row.role === "user" ? styles.bubbleUser : styles.bubblePartner,
                {
                  backgroundColor:
                    row.role === "user" ? theme.tokens.bg2 : theme.tokens.bg1,
                  borderColor: theme.tokens.line,
                },
              ]}
            >
              {row.role === "assistant" ? (
                <Markdown source={row.content} />
              ) : (
                <Text style={[styles.userText, { color: theme.tokens.fg }]}>{row.content}</Text>
              )}
            </View>
          ))}

          {streaming && rows[rows.length - 1]?.role === "user" ? (
            <View
              style={[
                styles.bubble,
                styles.bubblePartner,
                { backgroundColor: theme.tokens.bg1, borderColor: theme.tokens.line },
              ]}
            >
              <Text style={[styles.userText, { color: theme.tokens.fgDim }]}>Thinking…</Text>
            </View>
          ) : null}

          {/*
           * THE ERROR.
           *
           * An `Alert`, not a chat bubble. A bubble is something the
           * study partner said, and the partner did not say this — the
           * provider did, or the network did. So it is a panel with a
           * status, sitting outside the conversation, where it can be
           * told from what the partner said at a glance.
           */}
          {error !== null ? (
            <Alert status="danger" style={styles.alert}>
              {error}
            </Alert>
          ) : null}

          {/*
           * WHAT THE ANSWER WAS READ FROM.
           *
           * A badge rather than a line of text, because it is a label
           * ABOUT the answer rather than part of it — the same way a
           * footnote is set apart from the paragraph it belongs to.
           */}
          {notesRead.length > 0 ? (
            <Badge
              label={`read from ${notesRead.map((n) => n.moduleCode).join(", ")}`}
              variant="secondary"
              size="sm"
              style={styles.notesRead}
            />
          ) : null}
        </ScrollView>

        {/* ---- the composer ---- */}
        <View
          style={[
            styles.composer,
            {
              // The keyboard's overlap, or the home indicator, whichever is
              // the taller thing to sit above.
              paddingBottom: (keyboardOverlap > 0 ? keyboardOverlap : insets.bottom) + 10,
            },
          ]}
        >
          <View
            style={[
              styles.composerRow,
              {
                borderColor: theme.tokens.line,
                /*
                 * OPAQUE, like every other panel in the app.
                 *
                 * The composer is the one control the reader's thumb is
                 * on, and it was the one control the field came through:
                 * the row had a hairline and nothing behind it, so the
                 * ASCII was under the text they were typing. It is a
                 * panel now, and the send button is in it with it.
                 */
                backgroundColor: theme.tokens.bg1,
              },
            ]}
          >
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="What's on your mind?"
              placeholderTextColor={theme.tokens.fgDim}
              /*
               * THE TYPED TEXT.
               *
               * The composer is a panel, so the text is read against the
               * panel and not against the field, and it is the palette's
               * own foreground like every other piece of type in the app.
               */
              style={[styles.input, { color: theme.tokens.fg }]}
              multiline
              onSubmitEditing={() => send(input)}
              returnKeyType="send"
              blurOnSubmit
            />
            {streaming ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop"
                onPress={stop}
                style={({ pressed }) => [
                  styles.send,
                  {
                    backgroundColor: theme.tokens.bg2,
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Icon name="stop" size={16} color={theme.tokens.fg} />
              </Pressable>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                disabled={input.trim().length === 0}
                onPress={() => send(input)}
                style={({ pressed }) => [
                  styles.send,
                  {
                    backgroundColor: theme.tokens.accentA,
                    opacity: input.trim().length === 0 ? 0.4 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Icon name="arrowUp" size={18} tone="inverse" strokeWidth={2} />
              </Pressable>
            )}
          </View>

          {/*
           * THE MODEL, UNDER THE FORM.
           *
           * Just the name, just under the box the reader is typing in, and
           * as small as the app says anything. It is an answer to a
           * question the reader did not ask, so it is a footnote and not a
           * control: the CONTROL — the thing that changes the model — is
           * the icon in the bar.
           *
           * The name is the provider's own, exactly as its own
           * `/v1/models` listed it, because that is the name the reader
           * would have to type to ask for it somewhere else.
           */}
          <View style={styles.modelLine}>
            {noProvider ? (
              <>
                <Text style={[styles.modelName, { color: theme.tokens.fgDim }]}>
                  no model provider yet
                </Text>
                <Button
                  label="add one"
                  variant="ghost"
                  onPress={() => router.push("/settings/provider")}
                  style={styles.providerButton}
                />
              </>
            ) : (
              <Text style={[styles.modelName, { color: theme.tokens.fgDim }]} numberOfLines={1}>
                {model.length > 0 ? model : "no model chosen"}
              </Text>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  shell: {
    flex: 1,
  },
  /*
   * THE TOOLS IN THE BAR.
   *
   * They sit on the right of the header, and the header's `trailing` slot
   * is what puts them there and keeps them clear of the side menu's
   * button — which floats in the top-right corner of the app.
   */
  headerTools: {
    flexDirection: "row",
    alignItems: "center",
  },
  tool: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  /*
   * THE MODEL BAR, UNDER THE FORM.
   *
   * It is a bar rather than a row of the composer's own, because it is
   * the same object it was when it was at the top of the screen: the
   * provider, the model, and the picker. What changed is where it lives.
   *
   * `marginTop` rather than `marginBottom`, because it now sits BELOW the
   * form instead of above it.
   */
  /**
   * THE MODEL'S NAME, UNDER THE FORM.
   *
   * A line of text and nothing else — no box, no edge, no fill. The
   * control that changes the model is the icon in the bar, so what is
   * left here is only the answer, and an answer does not need a frame
   * around it.
   */
  modelLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 6,
  },
  modelName: {
    ...TYPE.micro,
  },
  providerButton: {
    minHeight: 34,
    paddingVertical: 4,
  },
  pane: {
    marginHorizontal: 18,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    paddingVertical: 6,
    maxHeight: 190,
  },
  paneNote: {
    padding: 12,
  },
  thread: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  threadTitle: {
    ...TYPE.small,
  },
  body: {
    flex: 1,
  },
  /**
   * THE TRANSCRIPT'S CONTENT.
   *
   * `flexGrow: 1` so the content is at least as tall as the transcript
   * when there is not much of it — which is what lets the empty state
   * centre itself in the space rather than sitting at the top of it.
   */
  bodyContent: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  /**
   * THE EMPTY STATE.
   *
   * Two parts: a HEAD at the top and a BODY that takes the rest. The
   * head says what the screen is; the body holds the three default
   * questions in the MIDDLE of the screen, not under the bar — an empty
   * conversation with three suggestions pinned to the top of it looks
   * like the app ran out of room.
   */
  empty: {
    flex: 1,
  },
  /**
   * THE HEAD, AT THE TOP AND CENTRED.
   *
   * It is the label on the three questions below it, so it is centred
   * over them and it is the first thing on the screen.
   */
  emptyHead: {
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 8,
  },
  emptyBody: {
    flex: 1,
    justifyContent: "center",
  },
  emptyLead: {
    ...TYPE.subheading,
    marginTop: 8,
    textAlign: "center",
  },
  emptySub: {
    ...TYPE.small,
    marginTop: 8,
    textAlign: "center",
  },
  /**
   * THE EMPTY STATE'S ONE ACTION.
   *
   * The wrapper has no `alignSelf`, so it takes the transcript's full
   * width and the centring is against the transcript rather than
   * against the button.
   */
  emptyAction: {
    marginTop: 18,
  },
  /**
   * A BUTTON, CENTRED.
   *
   * A button brings its own `alignSelf`, and the default would put it
   * against the left edge of whatever holds it.
   */
  centred: {
    alignSelf: "center",
  },
  starter: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 10,
    minHeight: 52,
  },
  starterText: {
    ...TYPE.small,
    flex: 1,
    paddingRight: 10,
  },
  bubble: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 10,
  },
  bubbleUser: {
    alignSelf: "flex-end",
    maxWidth: "88%",
  },
  bubblePartner: {
    alignSelf: "stretch",
  },
  userText: {
    ...TYPE.body,
  },
  notesRead: {
    marginTop: 6,
  },
  /**
   * The error panel. It sits outside the conversation, so it needs
   * room of its own below it.
   */
  alert: {
    marginBottom: 10,
  },
  composer: {
    paddingHorizontal: 18,
    paddingTop: 8,
  },
  composerRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    ...TYPE.body,
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    paddingTop: 8,
    paddingBottom: 8,
  },
  send: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
});
