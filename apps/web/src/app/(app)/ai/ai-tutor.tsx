"use client";

import AsciiField from "@/components/landing/ascii-field";
// EmailVerifyNotice is intentionally not rendered — see the comment at the
// shell. The import is dropped with it so nothing can re-render it by
// accident; the component and its 37 assertions are untouched.
import { ModelPicker, useModelPicker, type ModelPick } from "@/components/model-picker";
import { useChat } from "@ai-sdk/react";
import { createMathPlugin } from "@streamdown/math";
import { DefaultChatTransport, type UIMessage } from "ai";
import { z } from "zod";
import {
  ArrowUpIcon,
  HistoryIcon,
  Loader2Icon,
  MessageSquareIcon,
  RotateCwIcon,
  SparklesIcon,
  SlidersHorizontalIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { Streamdown } from "streamdown";

/**
 * THE AI TUTOR
 * ------------------------------------------------------------
 * The chat half of /ai. The page above it is a server component that
 * requires a session, so by the time any of this renders the visitor
 * is already known to be signed in.
 *
 * Look and feel, following the rest of the product:
 *
 *   · a slow, non-interactive ASCII field behind the whole
 *     conversation — the "ambient" variant, which ignores the
 *     pointer, so nothing the user is reaching for is ever
 *     intercepted by a canvas;
 *   · a veil between that field and the text, so a page of LaTeX is
 *     readable over moving glyphs without hiding the field;
 *   · the header and the composer are glass panels floating over it,
 *     so the field reads as depth behind the UI rather than as
 *     decoration beside it;
 *   · the muted terminal palette the rest of the app uses, rather
 *     than the cyan SaaS bubbles this route had before.
 *
 * The empty state is a prompt set rather than a shrug — a fresh chat
 * with nothing to do is the most common state on this page, so it
 * earns the space.
 *
 * HISTORY is server-side, not held in this component. `threadId` is
 * the one piece of state that decides which conversation is on screen;
 * opening one from the pane sets it and loads that thread's messages
 * in via setMessages. Saving is a side effect of a message being
 * written rather than an action the user takes, so a conversation that
 * is opened and never continued still persists — which leaves the
 * delete button as the only way to lose one.
 */

const STARTERS = [
  "Explain limits the way I would need them for a first-year calculus exam.",
  "Walk me through differentiating a chain rule expression, slowly.",
  "I got 42 for a probability question. Sanity-check the setup with me.",
  "Quiz me on the difference between a limit and a value at a point.",
] as const;

/**
 * LaTeX — KaTeX via Streamdown's math plugin.
 *
 * Both of these are module-level constants on purpose. Streamdown keys
 * its parsed-markdown cache off the identity of the plugin lists it is
 * given, so an object rebuilt on every render misses that cache on every
 * render — which during a stream means re-parsing and re-running KaTeX
 * over the whole answer for each token that arrives.
 *
 * `singleDollarTextMath` is turned on deliberately. It defaults to false,
 * which means only `$$…$$` is treated as math, and an inline `$f'(x)$`
 * would reach the reader as literal dollar signs. Since the tutor's whole
 * subject is calculus, inline math is not the exception here, it is most
 * of the output. The cost is that a bare currency amount can be read as
 * an unclosed formula, which is why the system prompt on the server asks
 * for money to be written without a leading `$`.
 */
const MATH = createMathPlugin({ singleDollarTextMath: true });

/**
 * Applied to the tutor's half of the conversation only.
 *
 * The reader's own text goes through the same markdown renderer without
 * this, so a question about a price, or anything else containing a `$`,
 * is never re-interpreted as mathematics on its way back to them.
 */
const TUTOR_PLUGINS = { math: MATH } as const;

/**
 * How long a single turn may run before the client gives up on it.
 *
 * Deliberately shorter than the server's `maxDuration` (60). The client
 * therefore always wins the race, and that is the better of the two
 * endings: aborting here tears the request down deliberately and the
 * reader gets an explanation, whereas a turn that hits the platform
 * ceiling is severed mid-stream and looks like the app hung. The server
 * ceiling stays as the backstop for a turn that is still running when
 * the tab is closed or the network drops.
 *
 * Thirty seconds is chosen so a reader is told something is wrong while
 * they are still waiting rather than minutes later. It does mean a
 * genuinely long derivation gets cut off, so it is a real ceiling on
 * answer length, not just a failure detector.
 */
const WATCHDOG_MS = 30_000;

/**
 * What the server says about the turn that produced this message.
 *
 * The server has always sent this — `messageMetadata` in api/ai/route.ts,
 * carrying which credential paid, whether the reader's choice was
 * honoured, and any warning. Nothing ever READ it. The reader was told
 * their model was in use while the answer came off the server's account,
 * and the one field whose whole job is "you did not get what you asked
 * for" was transmitted into the void.
 *
 * Mirrors the server's `messageMetadata` deliberately and is passed to
 * `useChat` as `messageMetadataSchema`, so a mismatch fails validation
 * rather than silently rendering nothing.
 */
const TutorMetadataSchema = z.object({
  notes: z
    .object({
      read: z
        .array(z.object({ moduleCode: z.string(), title: z.string() }))
        .optional()
        .default([]),
    })
    .optional(),
  model: z
    .object({
      source: z.enum(["user-key", "server"]),
      provider: z.string(),
      modelId: z.string(),
    })
    .optional(),
  /** Set when the requested model could not be used. */
  warning: z.string().optional(),
  /** True when the reader's explicit choice was NOT honoured. */
  substituted: z.boolean().optional(),
});

type TutorMetadata = z.infer<typeof TutorMetadataSchema>;

/**
 * The one notice the reader needs above the conversation.
 *
 * Precedence matters. `warning` is the server naming a specific cause, so
 * it wins. `substituted` on its own is the weaker signal that a different
 * model answered, which is worth saying plainly because the alternative
 * is the reader drawing conclusions from an answer that did not come from
 * the model they chose. Silence is the one outcome that is never correct
 * here.
 */
function tutorNotice(metadata: TutorMetadata | undefined): string | null {
  if (!metadata) return null;
  if (metadata.warning) return metadata.warning;
  if (metadata.substituted) {
    return "That model could not be used, so this answer came from the tutor's own model.";
  }
  return null;
}

/**
 * What to tell the reader when a turn fails.
 *
 * Provider failures are already the server's job — see
 * `explainProviderFailure` in api/ai/route.ts, which is the only place
 * the real cause still exists, since the SDK strips it to "An error
 * occurred." before it crosses the wire. So this deliberately does NOT
 * try to re-classify quota, keys or outages: by the time an error
 * reaches the client it has already been turned into a sentence, and
 * re-deriving a second, different sentence from that text would
 * overwrite a good one with a worse guess.
 *
 * What is left here is the class the server cannot see at all, because
 * it never reached the server: a request the browser abandoned, a
 * connection that dropped, or the watchdog stopping a turn.
 *
 * "An error occurred." is matched explicitly. It is the SDK's generic
 * mask, so its arrival means the error arrived without a description —
 * showing it verbatim would be strictly worse than saying something.
 *
 * A JSON body is unwrapped, which is not the same as re-deriving one. When
 * the server answers a refusal with `{ error, code, email }` the sentence
 * has already been written for the reader; it just arrives wearing the
 * envelope. Falling through to `text` therefore rendered the literal
 *
 *     {"error":"Confirm your email address to use the tutor.",
 *      "code":"EMAIL_NOT_VERIFIED","email":"..."}
 *
 * into the chat, which is the one failure in this file a reader cannot
 * act on. Unwrapping preserves the server's wording verbatim; it invents
 * nothing. If the JSON has no `error` string the original text is used
 * unchanged, so a body that happens to parse is never silently swallowed.
 */
function failureMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err ?? "");

  if (text.includes("abort") || text.includes("timed out") || text.includes("timeout")) {
    return "That took too long and was stopped. Try a smaller question.";
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const message =
        typeof parsed === "object" && parsed !== null
          ? (parsed as { error?: unknown }).error
          : undefined;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
    } catch {
      // Not JSON after all. Fall through and show it as it is.
    }
  }

  if (trimmed && trimmed !== "An error occurred.") {
    return trimmed;
  }
  return "The tutor could not answer that. Try again.";
}

/** One row of the history pane. Mirrors ChatThreadSummary in the db package. */
type ThreadSummary = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

/** Persisted message, as /api/chat returns it. */
type StoredMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

/** One row on its way to /api/chat. Mirrors NewChatMessage in the db package. */
type StoredRow = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

function greeting(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `Morning, ${first}!` : "Morning!";
}

/** A short id the client owns and the server stores verbatim. */
function newThreadId(): string {
  return `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** "4 Mar", or "4 Mar 2025" when it is not this year. */
function shortDate(iso: string): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) {
    return "";
  }
  return then.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    ...(then.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }),
  });
}

export default function AiTutor({ name }: { readonly name: string }): React.JSX.Element {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement | null>(null);

  // Which conversation is on screen. Minted once per chat and reused
  // for every turn in it, so the server upserts one thread rather than
  // making a new one per message.
  const [threadId, setThreadId] = useState(newThreadId);

  // null until the pane is first opened, so arriving at /ai does not
  // hit the database for a list nobody has looked at.
  const [threads, setThreads] = useState<ReadonlyArray<ThreadSummary> | null>(null);
  const [paneOpen, setPaneOpen] = useState(false);
  const [paneBusy, setPaneBusy] = useState(false);

  /**
   * The transcript to open `threadId` with, or null for an empty chat.
   *
   * useChat seeds a chat from its `messages` option, but ONLY at
   * construction, and it constructs exactly once per distinct `id`:
   *
   *   const { chat } = useMemo(() => ({ chat: new Chat(chatOptions) }), [chatKey]);
   *   // chatKey === options.id
   *
   * `setMessages` cannot be used to load a stored transcript instead. It
   * is `useCallback(..., [chat])` writing `chat.messages` on one specific
   * Chat instance, so after switching threads it targets the instance
   * being switched away from — and its setter only assigns
   * `state.messages`, notifying nobody, so even the current instance
   * would not repaint. Between them that is why opening a stored chat
   * needed two clicks: the first closed the pane and restored nothing.
   *
   * So the rows ride along as state and are handed to useChat, which
   * applies them on the render where `threadId` turns over. Both states
   * are set in the same continuation, so React batches them into that
   * one render and the new chat is built pre-seeded — no extra round
   * trip and no flash of empty conversation.
   */
  const [seed, setSeed] = useState<ReadonlyArray<StoredMessage> | null>(null);

  /*
   * Which thread `seed` belongs to.
   *
   * A ref rather than state, and read at write time, because the two are
   * set in the same batch and a state read would be stale on the render
   * that consumes it. It is also genuinely mutable data: it exists only to
   * be read inside an effect keyed on `seed`, and putting it in state would
   * add a second render to every thread open for no observable difference.
   */
  const seedThread = useRef<string | null>(null);

  /*
   * THE MODEL PICK, AND WHY THE TRANSPORT IS A REF
   * ------------------------------------------------------------
   * The reader's choice is read at request time through a ref rather
   * than captured in the transport's `body`. `body` is evaluated once
   * when the transport is built, so a value baked into it would be the
   * model chosen when the chat mounted, not the one currently selected.
   * That failure is quiet and perfectly plausible-looking: the picker
   * would appear to work, the picker would even show the new value, and
   * every answer would still come from the old model.
   *
   * `prepareSendMessagesRequest` runs per request, which is exactly the
   * lifetime the choice needs.
   */
  const picker = useModelPicker();
  const pickRef = useRef<ModelPick>(picker.pick);
  pickRef.current = picker.pick;

  const chatTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/ai",
        prepareSendMessagesRequest: ({ messages: msgs }) => ({
          body: { messages: msgs, model: pickRef.current },
        }),
      }),
    [],
  );

  const { messages, sendMessage, status, setMessages, error, stop, clearError } = useChat({
    id: threadId,
    messages: seed === null ? undefined : toUiMessages(seed),
    transport: chatTransport,
    // Declared so `message.metadata` below is typed and VALIDATED rather
    // than cast. Without this the server's notice arrives as `unknown` and
    // the only way to render it is an unchecked assertion, which is how a
    // notice that says the wrong thing gets shipped.
    messageMetadataSchema: TutorMetadataSchema,
  });
  const isSending = status === "submitted" || status === "streaming";

  /**
   * The newest message that carries a notice wins.
   *
   * Scanned backwards rather than taking the last message: during
   * streaming the newest message is the one still arriving, and it may
   * not have its metadata yet. The most recent message that actually
   * says something is the one the reader needs.
   */
  const tutorNoticeText = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const notice = tutorNotice(messages[i]?.metadata);
      if (notice) return notice;
    }
    return null;
  })();
  /**
   * The watchdog guards the WAIT FOR A FIRST TOKEN, not the turn.
   *
   * This is a correction, and the comment it replaces argued for the
   * behaviour that had to go. That comment claimed keying the timer on
   * `isSending` was deliberate because depending on `status` would
   * "restart the clock at exactly the moment the model is generating
   * the long tail". Restarting the clock IS the correct behaviour, for
   * the reason the comment had backwards: the failure this exists to
   * catch is *no response at all* — a retry loop with exponential
   * backoff after a rate-limit, a connection that never delivers. A
   * model producing tokens steadily for a minute is not that; it is a
   * long answer, and killing it truncates a perfectly healthy reply
   * mid-sentence with "that took too long, try something smaller".
   *
   * So the budget is 30 seconds to FIRST TOKEN. The moment `status`
   * becomes "streaming" the effect's cleanup disarms the timer and it
   * never re-arms for that turn. A genuinely dead mid-stream
   * connection is no longer caught by this — that is the cost of the
   * change, and it is the right trade: a truncated answer is a certain
   * failure, whereas a hung stream is rare and the reader can reload.
   */
  const awaitingFirstToken = status === "submitted";

  /**
   * WATCHDOG — a turn that never starts
   * ------------------------------------------------------------
   * There was nothing here, and a turn that did not finish simply
   * never finished. The composer stayed disabled behind the "thinking"
   * bubble with no way out, which is indistinguishable from a hung app:
   * no error, no spinner that stops, no message.
   *
   * So the budget is enforced on the client, where it can be undone.
   * `stop()` aborts the in-flight request and returns the chat to idle,
   * which re-enables the composer and lets the reader try again.
   *
   * `stalled` is deliberately NOT cleared when sending ends. `stop()`
   * is what ends the turn, so resetting on that would wipe the
   * explanation on the same tick it is raised and the reader would see
   * the spinner vanish and nothing replace it — the same dead end this
   * is here to remove. It is cleared when the next turn starts instead,
   * which is the only other place it can be wrong.
   */
  const [stalled, setStalled] = useState(false);
  useEffect(() => {
    if (!awaitingFirstToken) {
      return;
    }
    const t = window.setTimeout(() => {
      setStalled(true);
      stop();
    }, WATCHDOG_MS);
    return () => window.clearTimeout(t);
  }, [awaitingFirstToken, stop]);

  // Follow the stream, but only when the reader is already at the
  // bottom - yanking the viewport on every token would fight anyone
  // scrolling back through an earlier answer.
  //
  // "The bottom" is measured against .nt-ai__body, NOT the window. The
  // page no longer scrolls at all - the shell is pinned to one viewport
  // and this list is the only scroll container - so the old
  // `window.innerHeight + window.scrollY >= document.body.offsetHeight`
  // test was reading a scroll position that is now permanently 0. It
  // did not merely break; it evaluated TRUE on every token, so the list
  // was dragged to the bottom continuously and a reader trying to read
  // back through an answer was fought the whole way.
  useEffect(() => {
    const el = endRef.current;
    if (el === null) {
      return;
    }
    const box = el.closest(".nt-ai__body") as HTMLElement | null;
    if (box === null) {
      return;
    }
    const distanceFromBottom = box.scrollHeight - box.scrollTop - box.clientHeight;
    if (distanceFromBottom < 160) {
      el.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, status]);

  /** Load the list. Also toggles the pane closed if it was open. */
  const openHistory = useCallback(async () => {
    const wasOpen = paneOpen;
    setPaneOpen(!wasOpen);
    if (wasOpen) {
      return;
    }
    setPaneBusy(true);
    try {
      const res = await fetch("/api/chat", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { threads?: ThreadSummary[] };
        setThreads(data.threads ?? []);
      } else {
        setThreads([]);
      }
    } catch {
      setThreads([]);
    } finally {
      setPaneBusy(false);
    }
  }, [paneOpen]);

  /** Stored rows in the shape useChat renders them back. */
/**
 * Rebuild messages from a stored thread.
 *
 * Typed as `UIMessage<TutorMetadata>` rather than left to inference,
 * because an object literal infers to a narrow shape with no `metadata`
 * property at all — and that narrow type then propagates into `useChat`'s
 * `messages`, which is exactly how `message.metadata` stops type-checking
 * and starts needing a cast. The stored rows carry no metadata (it was
 * never persisted), so it is simply absent.
 */
function toUiMessages(rows: ReadonlyArray<StoredMessage>): UIMessage<TutorMetadata>[] {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text", text: m.content }],
  }));
}

/** Reopen a stored conversation. */
  const loadThread = useCallback(
    async (id: string) => {
      setPaneBusy(true);
      try {
        const res = await fetch(`/api/chat?thread=${encodeURIComponent(id)}`, {
          cache: "no-store",
        });
        if (!res.ok) {
          return;
        }
        const thread = (await res.json()) as { id: string; messages?: StoredMessage[] };
        // Rekey, then restore — but not here.
        //
        // `setMessages` is `useCallback(..., [chat])` and writes to
        // `chat.messages` on ONE specific Chat instance; useChat memoises
        // that instance on its `id`, so changing `threadId` builds a new
        // one and a new `setMessages` with it. The `setMessages` in scope
        // here belongs to the chat being switched AWAY from, so writing
        // to it lands on an object nothing renders any more and the
        // transcript silently never appears.
        //
        // It used to try to dodge this with a `setTimeout(0)` between
        // the two steps, reasoning that React would commit a render in
        // the gap and rebind the variable. A closure does not rebind
        // itself — `setMessages` was captured when this callback was
        // created and still points at the old chat however long you
        // wait. The delay bought nothing, which is why opening a stored
        // chat needed two clicks: the first closed the pane and restored
        // nothing. The write is handed to the effect below instead.
        const rows = thread.messages ?? [];

        // Both in one batch: the chat is built on the render where
        // `threadId` turns over, and it picks up `seed` on that same
        // render. Reopening the thread already on screen changes neither,
        // and needs neither — its transcript is what is on screen.
        if (thread.id !== threadId) {
          // Set before setSeed: both are batched into one render, and the
          // effect that marks these rows as already-saved reads the ref
          // during that render. Writing them the other way round would
          // restore a transcript that the save effect then treats as new.
          seedThread.current = thread.id;
          setSeed(rows);
          setThreadId(thread.id);
        }
        setPaneOpen(false);
      } catch {
        // Leave the current conversation alone: a failed load should
        // not cost the reader what they were reading.
      } finally {
        setPaneBusy(false);
      }
    },
    [setMessages, threadId],
  );

  /** Forget the conversation on screen. The server cascades to its messages. */
  const deleteThread = useCallback(async () => {
    const id = threadId;
    // Start a fresh chat immediately rather than leaving an empty
    // transcript beside a delete button that no longer means anything.
    // The new id builds a new chat, so clearing the seed is what keeps the
    // deleted transcript out of it.
    setSeed(null);
    seedThread.current = null;
    setThreadId(newThreadId());
    setInput("");
    setThreads((prev) => prev?.filter((t) => t.id !== id) ?? null);
    try {
      await fetch(`/api/chat?thread=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      // Gone from the screen either way, and there is nothing the
      // reader could do about it from here.
    }
  }, [threadId]);

  /**
   * Write rows to the server.
   *
   * Takes the thread id and the pane flag as arguments rather than
   * reading them from state, so this stays referentially stable and
   * the effect below can depend on it. A stable identity means that
   * effect re-runs for the reasons it is meant to and nothing else.
   *
   * Re-writing a row is safe: the server upserts on (thread_id, id), so
   * a duplicate POST updates the row instead of adding a second one.
   * That is what lets the effect above be re-run freely.
   *
   * The pane refresh lives in here rather than in the caller because
   * it is not optional — a conversation saved while the list is on
   * screen has to turn up in it, and that has to happen after the save
   * this function just made.
   */
  const persist = useCallback(
    async (rows: ReadonlyArray<StoredRow>, id: string, refreshPane: boolean) => {
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: id, messages: rows }),
        });
        if (res.ok && refreshPane) {
          const list = await fetch("/api/chat", { cache: "no-store" });
          if (list.ok) {
            const data = (await list.json()) as { threads?: ThreadSummary[] };
            setThreads(data.threads ?? []);
          }
        }
      } catch {
        // History is a convenience. A failed save must never take the
        // conversation being read down with it.
      }
    },
    [],
  );

  /**
   * Persist a conversation as soon as it exists.
   *
   * NOT gated on the turn succeeding. That gate was why nothing was
   * ever saved: a question the tutor could not answer — or a stream
   * that died — left the whole conversation unwritten, so a reader lost
   * the message they had just typed. Persistence is a property of a
   * message existing, not of a reply arriving.
   *
   * ONE rule, per role, because the two are complete at different
   * moments and for different reasons.
   *
   *   · A user's question is complete the instant it is appended. It
   *     never streams, so nothing can make it more finished later, and
   *     a turn that then fails must still cost the answer rather than
   *     the question.
   *   · An assistant reply is complete only when no stream is running.
   *     Mid-stream it is a partial bubble, and writing it would store
   *     half a sentence as though it were the whole reply.
   *
   * WHY THE QUESTION USED TO BE LOST, AND IT WAS NOT THE `isSending`
   * GUARD ON ITS OWN
   * ------------------------------------------------------------
   * This effect gated EVERY message on `!isSending`, on the reasoning
   * that the question lands before the model is asked. It does not, and
   * the reason is in the SDK rather than in this file.
   *
   * `sendMessage` does, in one synchronous block:
   *
   *     ai/src/ui/chat.ts:468   state.pushMessage(userMsg)   // notifies
   *     ai/src/ui/chat.ts:841   setStatus({ status: 'submitted' })
   *
   * `useChat` reads `messages` and `status` from two SEPARATE
   * `useSyncExternalStore` subscriptions, and both notifications land
   * in the same tick. React therefore commits ONE render in which
   * `messages.at(-1)` is the user's question AND `status` is already
   * 'submitted' — so `isSending` was true and the question returned
   * early. There was never a render where the question existed on its
   * own.
   *
   * By the time the stream ended, `messages.at(-1)` was the reply, so
   * only the reply was ever written. Transcripts kept their answers
   * and lost their questions, which is exactly what was reported.
   *
   * So the gate moves: it applies to assistant messages, which are the
   * only ones that can be half-written. A user message is written on
   * the very first render that contains it.
   *
   * TRACKING SAVED IDS, NOT JUST THE LAST ONE
   * ------------------------------------------------------------
   * A single `lastId` guard cannot express "the question is written and
   * the reply is not", because by the time the reply arrives the guard
   * has been overwritten by the question's id and the two are
   * indistinguishable from the outside. The guard is a Set of the ids
   * actually written, which makes the replay property explicit instead
   * of emergent: a message is written when it first appears complete,
   * and never again.
   *
   * Seeded rows are pre-loaded rather than written, so they are marked
   * as already saved — otherwise reopening a thread would re-post the
   * whole transcript on every mount. The upsert would absorb that, but
   * it is a full transcript's worth of pointless requests.
   *
   * The ids come from the chat and it ignores any id passed to
   * sendMessage — so the id is read back off the message the chat
   * produced, rather than predicted. A wrong prediction would not lose
   * the row, it would write the question a second time under a second
   * id in the reopened thread.
   *
   * There is deliberately no effect clearing the guard on a thread
   * switch. There used to be one, declared after this effect, and
   * effects run in declaration order — so it reset the guard a render
   * too late, and restoring a thread re-saved it on the same pass. The
   * upsert absorbed that, so it was harmless, but an effect that undoes
   * its neighbour's guard on the same commit is one refactor away from a
   * bug that is not absorbed.
   *
   * It is unneeded rather than merely reordered because every key
   * carries the thread id: switching threads changes the key by itself,
   * so no id can be mistaken for one already written on another thread
   * and nothing has to clear anything.
   */
  const savedRef = useRef<ReadonlySet<string>>(new Set<string>());

  /*
   * Mark restored rows as already written.
   *
   * The guard above is a Set of ids this browser has POSTed. A transcript
   * loaded from /api/chat is already in the database by definition — it was
   * read from there — so it must enter the Set as though it had been saved,
   * or the effect below would treat every restored row as new and re-post
   * the entire conversation on each mount.
   *
   * The upsert would absorb those duplicates, so the symptom would only be
   * wasted requests. It is still wrong: the history pane's thread list is
   * re-read after a save, and a duplicate storm on every reopen is how a
   * cheap feature becomes an expensive one.
   *
   * Keyed the same way as the guard, so a row restored onto thread A cannot
   * mark the identically-numbered row on thread B as written. Ids are only
   * unique per chat in this app, not globally.
   */
  useEffect(() => {
    if (seed === null || seedThread.current === null) {
      return;
    }
    savedRef.current = new Set([
      ...savedRef.current,
      ...seed.map((m) => `${seedThread.current}:${m.id}`),
    ]);
  }, [seed]);

  useEffect(() => {
    const pending: StoredRow[] = [];

    for (const message of messages) {
      const role = message.role === "user" ? ("user" as const) : ("assistant" as const);
      /*
       * The gate, and it applies to the ROLE that can be half-written.
       *
       * A reply is still arriving while isSending is true, so writing it
       * would store half a sentence. A question never streams, so waiting
       * for the stream would mean the question is only ever written as a
       * side effect of the answer completing - which is the bug this
       * replaced: a turn that fails or is abandoned saved neither.
       */
      if (role === "assistant" && isSending) {
        continue;
      }

      const content = (message.parts ?? [])
        .filter((part): part is { type: "text"; text: string } => part.type === "text")
        .map((part) => part.text)
        .join("");
      // Nothing to store. Not marked saved, so a message that fills in
      // later is still picked up on a subsequent render.
      if (content.length === 0) {
        continue;
      }

      const key = `${threadId}:${message.id}`;
      if (savedRef.current.has(key)) {
        continue;
      }

      savedRef.current = new Set(savedRef.current).add(key);
      pending.push({ id: message.id, role, content });
    }

    if (pending.length > 0) {
      /*
       * ONE request for the batch, not one per message.
       *
       * The route already loops and upserts, so a turn that produced a
       * question and an answer writes both in a single POST. That matters
       * because a browser will happily drop the second of two requests
       * fired back to back, and the answer is the row nobody would notice
       * missing until they reopened the thread.
       */
      void persist(pending, threadId, paneOpen);
    }
  }, [messages, isSending, threadId, paneOpen, persist]);

  const send = (text: string) => {
    const body = text.trim();
    if (!body || isSending) {
      return;
    }
    // Clear the previous failure before starting the next turn, so a
    // stale quota or timeout message cannot sit above a fresh answer.
    // `clearError` is safe to call when there is no error.
    setStalled(false);
    clearError();
    // The message is persisted by the effect below as soon as it lands
    // in `messages`, which is the first render after this call — not
    // when a reply comes back.
    sendMessage({ text: body });
    setInput("");
  };

  const startNewChat = () => {
    // The seed has to go with the new id. Left set, the fresh chat would
    // be built with the previous transcript already in it.
    setSeed(null);
    seedThread.current = null;
    setThreadId(newThreadId());
    setInput("");
    // A failure belongs to the conversation it happened in; carrying it
    // into a fresh thread would blame the new one for it.
    setStalled(false);
    clearError();
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends; Shift+Enter is a newline.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  };

  const hasMessages = messages.length > 0;

  /*
   * THE HEADER, ONCE THE CONVERSATION HAS STARTED
   * ------------------------------------------------------------
   * Before the first message the header is the page's whole subject:
   * it says what this is and it holds the tools. Once the reader has
   * asked something, that subject has been answered and the header is
   * competing with the conversation for a viewport that is mostly
   * vertical space. So it collapses into a single button and the
   * conversation gets the screen.
   *
   * The collapsed form is a BUTTON rather than a bare icon so the
   * controls come back by an explicit, labelled action instead of by
   * scrolling or tapping near where they used to be.
   *
   * Clicking it expands the panel again and it stays expanded until
   * the reader clicks outside it. It does NOT collapse on its own
   * after a timer: something the reader opened should stay open until
   * they dismiss it, and a panel that hides itself is a panel that
   * hides itself mid-interaction.
   *
   * GATED ON hasMessages, so a fresh chat is never in this state and
   * there is nothing to expand back into before the first send.
   */
  const [controlsOpen, setControlsOpen] = useState(false);
  const controlsRef = useRef<HTMLDivElement>(null);

  // Collapse the moment the conversation starts, and re-arm the flag so
  // "new chat" returns to the full header rather than leaving the
  // reader with a collapsed bar and no way to tell why.
  useEffect(() => {
    setControlsOpen(false);
  }, [hasMessages]);

  // Click outside dismisses. Only while expanded — with the panel
  // collapsed there is nothing to dismiss, and a listener that always
  // ran would swallow clicks aimed at the conversation.
  useEffect(() => {
    if (!controlsOpen) {
      return;
    }
    const onPointerDown = (e: MouseEvent) => {
      if (controlsRef.current && !controlsRef.current.contains(e.target as Node)) {
        setControlsOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [controlsOpen]);

  return (
    <div className="nt-root nt-ai">
      {/* The field is ambient: it ignores the pointer, so the header,
          the transcript and the composer all stay clickable. */}
      <AsciiField variant="ambient" />

      <div className="nt-ai__shell">
        {/*
          THE VERIFICATION NOTICE — NOT RENDERED, ON PURPOSE.

          It used to be the first child of the shell, which is where it
          belongs: above the transcript, so the restriction is stated
          before the reader tries rather than arriving as a 403 after they
          have composed something.

          It is pulled for now because the shell is laid out to fill the
          viewport exactly, and a block above the transcript pushes the
          page past it — a scrollbar on a screen that has no business
          having one.

          The gate itself is UNCHANGED and still enforced: the 403 in
          /api/ai is what stops an unverified reader, and it does not
          depend on this component. So removing the banner removes a
          scrollbar and nothing else. With mail unconfigured — which is
          the case in production, and is deliberate until there is a
          domain — the banner never rendered there in the first place.

          To restore, put this back as the shell's first child:

              <EmailVerifyNotice />

          ...or import it and render it above <EmailVerifyNotice />'s
          place when mail is finally configured. The fix, if the
          scrollbar is wanted back, is to make the shell's scroll
          container the transcript rather than the page — the banner
          belongs outside the thing that scrolls.
        */}
        {/*
          THE COLLAPSED TOGGLE.
          Rendered only once there is a conversation. It sits where the
          header was, so the reader's eye does not have to travel, and it
          is the same width as the bar it replaced so the layout does not
          jump when it appears.
        */}
        {hasMessages && !controlsOpen && (
          <button
            type="button"
            className="nt-ai__reveal nt-glass"
            onClick={() => setControlsOpen(true)}
            aria-label="Show tutor settings and tools"
            aria-expanded={false}
          >
            <SparklesIcon aria-hidden="true" />
            <span>AI tutor</span>
            <SlidersHorizontalIcon className="nt-ai__reveal-icon" aria-hidden="true" />
          </button>
        )}

        <header
          className={`nt-ai__head nt-glass${hasMessages ? " is-collapsible" : ""}${
            controlsOpen ? " is-open" : ""
          }`}
          ref={controlsRef}
        >
          <div className="nt-ai__head-txt">
            <h1 className="nt-ai__title">
              <SparklesIcon aria-hidden="true" />
              AI tutor
            </h1>
            <p className="nt-ai__sub">
              Ask about anything in the modules. It knows calculus, and it will show
              its working.
            </p>
          </div>

          {/* Icon-only, left to right: history, new, delete. The
              aria-label carries the name the visible text used to, so
              these lose their label without losing their meaning for
              anyone who cannot see the glyph. */}
          <div className="nt-ai__tools">
            {/* The model picker sits with the tools rather than under
                the composer: it changes how the NEXT turn is answered,
                and it belongs where the reader is already looking when a
                provider starts failing. */}
            <ModelPicker
              pick={picker.pick}
              onPick={picker.setPick}
              models={picker.models}
              hasKey={picker.hasKey}
              disabled={isSending}
            />
            {tutorNoticeText ? (
              // role="status" so a screen reader announces it when it
              // appears. aria-live territory: the answer below it can look
              // entirely normal while this is what actually happened.
              <p className="nt-ai__notice" role="status">
                {tutorNoticeText}
              </p>
            ) : null}
            <button
              type="button"
              className="nt-btn nt-btn--ghost nt-ai__tool"
              onClick={() => void openHistory()}
              aria-label="Chat history"
              aria-expanded={paneOpen}
              aria-controls="nt-ai-history"
              disabled={isSending}
            >
              <HistoryIcon aria-hidden="true" />
            </button>

            <button
              type="button"
              className="nt-btn nt-btn--ghost nt-ai__tool"
              onClick={startNewChat}
              aria-label="New chat"
              disabled={!hasMessages || isSending}
            >
              <RotateCwIcon aria-hidden="true" />
            </button>

            <button
              type="button"
              className="nt-btn nt-btn--ghost nt-ai__tool nt-ai__tool--danger"
              onClick={() => void deleteThread()}
              aria-label="Delete this chat"
              disabled={!hasMessages || isSending}
            >
              <Trash2Icon aria-hidden="true" />
            </button>
          </div>
        </header>

        {/* The history pane. Inside the shell and below the header, so
            it takes its width from the conversation rather than
            floating over the transcript. Only rendered once asked for. */}
        {paneOpen && (
          <section
            className="nt-ai__pane nt-glass"
            id="nt-ai-history"
            aria-label="Chat history"
          >
            {threads === null && paneBusy ? (
              <p className="nt-ai__pane-note">loading…</p>
            ) : threads === null || threads.length === 0 ? (
              <p className="nt-ai__pane-note">no saved conversations yet</p>
            ) : (
              <ul className="nt-ai__threads">
                {threads.map((t) => {
                  const isCurrent = t.id === threadId;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`nt-ai__thread${isCurrent ? " nt-ai__thread--on" : ""}`}
                        onClick={() => void loadThread(t.id)}
                        aria-current={isCurrent ? "true" : undefined}
                        disabled={paneBusy}
                      >
                        <MessageSquareIcon aria-hidden="true" />
                        <span className="nt-ai__thread-title">{t.title}</span>
                        <span className="nt-ai__thread-when">{shortDate(t.updatedAt)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}

        <main className="nt-ai__body">
          {messages.length === 0 && !isSending ? (
            <div className="nt-ai__empty">
              <p className="nt-ai__greet">{greeting(name)}</p>
              <p className="nt-ai__empty-lead">Pick one of these, or just ask.</p>
              <ul className="nt-ai__starters">
                {STARTERS.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="nt-ai__starter"
                      onClick={() => send(s)}
                    >
                      <span>{s}</span>
                      <ArrowUpIcon aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol className="nt-ai__thread-list">
              {messages.map((m) => {
                const isUser = m.role === "user";
                return (
                  <li
                    key={m.id}
                    className={`nt-ai__msg${isUser ? " nt-ai__msg--me" : ""}`}
                  >
                    <div className="nt-ai__who">{isUser ? "you" : "tutor"}</div>
                    <div className="nt-ai__bubble nt-glass">
                      {m.parts?.map((part, i) =>
                        part.type === "text" ? (
                          <Streamdown
                            key={i}
                            isAnimating={status === "streaming" && !isUser}
                            plugins={isUser ? undefined : TUTOR_PLUGINS}
                          >
                            {part.text}
                          </Streamdown>
                        ) : null,
                      )}
                    </div>
                  </li>
                );
              })}

              {isSending && (
                <li className="nt-ai__msg">
                  <div className="nt-ai__who">tutor</div>
                  <div className="nt-ai__bubble nt-glass nt-ai__thinking">
                    <Loader2Icon className="nt-ai__spin" aria-hidden="true" />
                    <span>thinking</span>
                  </div>
                </li>
              )}

              {(error || stalled) && (
                <li className="nt-ai__msg">
                  <div className="nt-ai__who">error</div>
                  <div className="nt-ai__bubble nt-ai__bubble--bad nt-glass">
                    {stalled
                      ? "No reply arrived within 30 seconds. The model provider may be rate-limiting this key, or the request never got through. Try again, or pick a different model."
                      : failureMessage(error)}
                  </div>
                </li>
              )}

              <div ref={endRef} />
            </ol>
          )}
        </main>

        <footer className="nt-ai__foot">
          <form className="nt-ai__composer nt-glass" onSubmit={handleSubmit}>
            <label className="nt-sr-only" htmlFor="nt-ai-prompt">
              Message the tutor
            </label>
            <textarea
              id="nt-ai-prompt"
              className="nt-ai__input"
              name="prompt"
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask the tutor something…"
              autoComplete="off"
              disabled={isSending}
            />
            <button
              type="submit"
              className="nt-btn nt-ai__send"
              disabled={isSending || !input.trim()}
              aria-label="Send"
            >
              {isSending ? (
                <Loader2Icon className="nt-ai__spin" aria-hidden="true" />
              ) : (
                <ArrowUpIcon aria-hidden="true" />
              )}
            </button>
          </form>
          <p className="nt-ai__note">Enter sends · Shift + Enter adds a line</p>
        </footer>
      </div>
    </div>
  );
}