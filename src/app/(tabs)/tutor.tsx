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
import { Body, Button, Label, Select } from "@/components/ui";
import { RADIUS } from "@/theme/radius";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";
import { STARTERS, titleFor } from "@/lib/tutor-engine";
import {
  SEARCH_NOTES_TOOL,
  TUTOR_SYSTEM_PROMPT,
  runSearchNotes,
  type NotesRead,
} from "@/lib/tutor-prompt";
import { listModels, streamChat, type ChatMessage, type ModelInfo } from "@/lib/llm";
import {
  getProviderWithKey,
  listProviders,
  readActiveProviderId,
  readModelChoice,
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
  const [models, setModels] = useState<ReadonlyArray<ModelInfo>>([]);

  const [keyboardTop, setKeyboardTop] = useState<number | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView> | null>(null);
  const seeded = useRef(false);
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
    setProvider(chosen);
    if (chosen === null) {
      setApiKey(null);
      setModel("");
      setModels([]);
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
  const loadModels = useCallback(async () => {
    if (provider === null || apiKey === null) return;
    try {
      const list = await listModels(provider.baseUrl, apiKey);
      setModels(list);
    } catch {
      // A provider that will not list its models is not a failure: the
      // reader can still type one in the settings.
      setModels([]);
    }
  }, [apiKey, provider]);

  useEffect(() => {
    if (provider === null) return;
    void (async () => {
      await loadModels();
    })();
  }, [loadModels, provider]);

  const chooseModel = useCallback(
    (next: string) => {
      setModel(next);
      if (provider !== null) {
        void writeModelChoice(provider.id, next);
      }
    },
    [provider],
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

      const userId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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

      const assistantId = `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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

  const modelOptions = useMemo(
    () =>
      models.map((m) => ({
        value: m.id,
        label: m.label,
        detail: m.free ? `${m.id}  ·  free` : m.id,
      })),
    [models],
  );

  /**
   * FREE ONLY, IN THE CHAT TOO.
   *
   * The same filter the settings screen offers, for the same reason: a
   * provider that lists hundreds of models is a list nobody scrolls
   * through, and the ones that cost nothing are usually the ones wanted.
   */
  const [freeOnly, setFreeOnly] = useState(true);

  const noProvider = provider === null;

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title="Study partner" />
      <View style={styles.shell}>
        {/* ---- the header ----
             The title is in the screen's own bar now, so what is left here
             is the line under it and the tools. The tools used to sit in the
             top-right corner, which is where the side menu's button is, so
             they have moved down onto their own row. */}
        <View style={styles.head}>
          <View style={styles.headText}>
            <Body style={styles.sub}>
              It reads the same notes you do, so it can explain the part you are stuck on.
            </Body>
          </View>
          <View style={styles.tools}>
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
          </View>
        </View>

        {/* ---- the model bar: which provider, and which model ---- */}
        {noProvider ? (
          <View style={[styles.providerBar, { borderColor: theme.tokens.line }]}>
            <Text style={[styles.providerName, { color: theme.tokens.fgDim }]}>
              No model provider yet.
            </Text>
            <Button
              label="add one"
              tone="quiet"
              onPress={() => router.push("/settings/provider")}
              style={styles.providerButton}
            />
          </View>
        ) : (
          <View style={[styles.providerBar, { borderColor: theme.tokens.line }]}>
            <View style={styles.providerText}>
              <Text style={[styles.providerName, { color: theme.tokens.fg }]} numberOfLines={1}>
                {provider.name}
              </Text>
              <Text style={[styles.providerModel, { color: theme.tokens.fgDim }]} numberOfLines={1}>
                {model.length > 0 ? model : "no model chosen"}
              </Text>
            </View>
            <View style={styles.modelPicker}>
              <Select
                value={model.length > 0 ? model : null}
                options={modelOptions}
                onChange={chooseModel}
                placeholder="choose a model"
                filter={{
                  label: "Free only",
                  active: freeOnly,
                  onToggle: () => setFreeOnly((prev) => !prev),
                  matches: (option) => {
                    const found = models.find((m) => m.id === option.value);
                    return found?.free === true;
                  },
                }}
              />
            </View>
          </View>
        )}

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
                <Text style={[styles.emptyLead, { color: theme.tokens.fg }]}>
                  The study partner is a language model, so it needs a provider of your own.
                </Text>
                <Text style={[styles.emptySub, { color: theme.tokens.fgDim }]}>
                  Add one under You → Study partner, with the key it gave you. The notes stay on
                  this device: the model searches them for itself, and never keeps a copy.
                </Text>
                <View style={styles.emptyAction}>
                  <Button label="add a provider" onPress={() => router.push("/settings/provider")} />
                </View>
              </View>
            ) : (
              <View style={styles.empty}>
                <Label>START HERE</Label>
                <Text style={[styles.emptyLead, { color: theme.tokens.fg }]}>
                  Pick one of these, or just ask.
                </Text>
                {STARTERS.map((s) => (
                  <Pressable
                    key={s}
                    accessibilityRole="button"
                    onPress={() => send(s)}
                    style={({ pressed }) => [
                      styles.starter,
                      {
                        borderColor: theme.tokens.line,
                        backgroundColor: theme.tokens.surfaceRaised,
                        opacity: pressed ? 0.7 : 1,
                      },
                    ]}
                  >
                    <Text style={[styles.starterText, { color: theme.tokens.fgMuted }]}>{s}</Text>
                    <Icon name="arrowUp" size={16} tone="accent" strokeWidth={2} />
                  </Pressable>
                ))}
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
                    row.role === "user" ? theme.tokens.surfaceRaised : theme.tokens.bg1,
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

          {error !== null ? (
            <View
              style={[
                styles.bubble,
                styles.bubblePartner,
                { backgroundColor: theme.tokens.bg1, borderColor: theme.tokens.danger },
              ]}
            >
              <Text style={[styles.userText, { color: theme.tokens.danger }]}>{error}</Text>
            </View>
          ) : null}

          {notesRead.length > 0 ? (
            <Text style={[styles.notesRead, { color: theme.tokens.fgDim }]}>
              Read from {notesRead.map((n) => n.moduleCode).join(", ")}
            </Text>
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
          <View style={[styles.composerRow, { borderColor: theme.tokens.line }]}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about anything in the modules"
              placeholderTextColor={theme.tokens.fgDim}
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
                    backgroundColor: theme.tokens.surfaceRaised,
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
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  headText: {
    flex: 1,
    paddingRight: 10,
  },
  title: {
    ...TYPE.title,
  },
  sub: {
    ...TYPE.small,
    marginTop: 4,
  },
  tools: {
    flexDirection: "row",
    alignItems: "center",
    /*
     * The tools used to step aside to leave room for the side menu's button,
     * which lived in the top-right corner. They are below the header now, so
     * there is nothing to step aside for.
     */
  },
  tool: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  providerBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 18,
    marginBottom: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.panel,
  },
  providerText: {
    flex: 1,
    paddingRight: 10,
  },
  providerName: {
    ...TYPE.subheading,
  },
  providerModel: {
    ...TYPE.small,
    marginTop: 2,
  },
  providerButton: {
    minHeight: 34,
    paddingVertical: 4,
  },
  modelPicker: {
    width: 132,
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
  bodyContent: {
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  empty: {
    paddingTop: 12,
  },
  emptyLead: {
    ...TYPE.subheading,
    marginTop: 8,
  },
  emptySub: {
    ...TYPE.small,
    marginTop: 8,
  },
  emptyAction: {
    marginTop: 16,
    alignSelf: "flex-start",
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
    ...TYPE.small,
    marginTop: 4,
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
