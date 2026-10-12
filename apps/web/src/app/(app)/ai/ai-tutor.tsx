"use client";

import AsciiField from "@/components/landing/ascii-field";
import { useChat } from "@ai-sdk/react";
import { createMathPlugin } from "@streamdown/math";
import { DefaultChatTransport } from "ai";
import {
  ArrowUpIcon,
  HistoryIcon,
  Loader2Icon,
  MessageSquareIcon,
  RotateCwIcon,
  SparklesIcon,
  Trash2Icon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
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
 */
function failureMessage(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err ?? "");

  if (text.includes("abort") || text.includes("timed out") || text.includes("timeout")) {
    return "That took too long and was stopped. Try a smaller question.";
  }
  if (text.trim() && text.trim() !== "An error occurred.") {
    return text.trim();
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

  const { messages, sendMessage, status, setMessages, error, stop, clearError } = useChat({
    id: threadId,
    messages: seed === null ? undefined : toUiMessages(seed),
    transport: new DefaultChatTransport({ api: "/api/ai" }),
  });
  const isSending = status === "submitted" || status === "streaming";

  /**
   * WATCHDOG — a turn that never ends
   * ------------------------------------------------------------
   * There was nothing here, and a turn that did not finish simply
   * never finished. The composer stayed disabled behind the "thinking"
   * bubble with no way out, which is indistinguishable from a hung app:
   * no error, no spinner that stops, no message. It is easy to hit,
   * because the failure that causes it is not exotic. A rate-limited
   * or out-of-quota key makes the AI SDK retry with exponential
   * backoff for minutes before giving up, and a dropped connection
   * mid-answer looks identical.
   *
   * So the budget is enforced on the client, where it can be undone.
   * `stop()` aborts the in-flight request and returns the chat to idle,
   * which re-enables the composer and lets the reader try again.
   *
   * Keyed on `isSending` alone, NOT on `status`. The status flips from
   * "submitted" to "streaming" when the first token lands, so depending
   * on it would restart the clock at exactly the moment the model is
   * generating the long tail — the one part where the budget is
   * supposed to be running.
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
    if (!isSending) {
      return;
    }
    const t = window.setTimeout(() => {
      setStalled(true);
      stop();
    }, WATCHDOG_MS);
    return () => window.clearTimeout(t);
  }, [isSending, stop]);

  // Follow the stream, but only when the reader is already at the
  // bottom — yanking the viewport on every token would fight anyone
  // scrolling back through an earlier answer.
  useEffect(() => {
    const el = endRef.current;
    if (el === null) {
      return;
    }
    const nearBottom =
      window.innerHeight + window.scrollY >= document.body.offsetHeight - 160;
    if (nearBottom) {
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
function toUiMessages(rows: ReadonlyArray<StoredMessage>) {
  return rows.map((m) => ({
    id: m.id,
    role: m.role,
    parts: [{ type: "text" as const, text: m.content }],
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
   * ONE rule: the newest message is written the moment it is complete,
   * and it is the only thing written.
   *
   *   · The user's question is complete the instant it is appended, so
   *     it lands on that render — before the model is even asked. A
   *     turn that then fails costs the answer, never the question.
   *   · The reply is complete when no stream is running. Mid-stream
   *     the last message is a partial assistant bubble, and writing it
   *     would store half a sentence as though it were the whole reply.
   *     The question prompting it is already on disk, so an
   *     interrupted turn keeps its half of the conversation.
   *
   * Keyed on the message id rather than the count, and only the last
   * message is sent. That is what makes a replay a no-op: by the time
   * this runs, `messages.at(-1)` is the very message that was saved
   * last, whatever else has been added since. Sending the whole
   * transcript would mean re-sending every earlier row each turn,
   * which the upsert would absorb and the network would not.
   *
   * The ids come from the chat and it ignores any id passed to
   * sendMessage — so the id is read back off the message the chat
   * produced, rather than predicted. A wrong prediction would not lose
   * the row, it would write the question a second time under a second
   * id in the reopened thread.
   *
   * There is deliberately no `useEffect(() => { savedRef.current = null
   * }, [threadId])` clearing the guard on a thread switch. There used
   * to be one, declared after this effect, and effects run in
   * declaration order — so it reset the guard a render too late, and
   * restoring a thread re-saved it on the same pass. The upsert
   * absorbed that, so it was harmless, but an effect that undoes its
   * neighbour's guard on the same commit is one refactor away from a
   * bug that is not absorbed.
   *
   * It is unneeded rather than merely reordered because the key carries
   * the thread id: switching threads changes the key by itself, so the
   * guard cannot survive across a switch and nothing has to clear it.
   */
  const savedRef = useRef<string | null>(null);
  useEffect(() => {
    const last = messages.at(-1);
    if (!last) {
      return;
    }
    // Mid-stream the last message is a partial answer. Waiting for
    // this to clear is what keeps a truncated reply out of history.
    if (isSending) {
      return;
    }

    const key = `${threadId}:${last.id}`;
    if (savedRef.current === key) {
      return;
    }
    savedRef.current = key;

    const role = last.role === "user" ? ("user" as const) : ("assistant" as const);
    const content = (last.parts ?? [])
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("");
    if (content.length === 0) {
      return;
    }

    void persist([{ id: last.id, role, content }], threadId, paneOpen);
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

  return (
    <div className="nt-root nt-ai">
      {/* The field is ambient: it ignores the pointer, so the header,
          the transcript and the composer all stay clickable. */}
      <AsciiField variant="ambient" />

      <div className="nt-ai__shell">
        <header className="nt-ai__head nt-glass">
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
                      ? "That took too long and was stopped. Try a smaller question."
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