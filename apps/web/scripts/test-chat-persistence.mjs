/**
 * WHY THE USER'S QUESTION WAS NEVER SAVED
 * ------------------------------------------------------------------------
 * Reproduces the notification ordering that caused it, without needing an AI
 * provider or a network. The bug was not in our code — it was in the order
 * the SDK notifies, and an assertion about that order is the only thing that
 * can keep this fixed.
 *
 * WHAT ACTUALLY HAPPENS, in ai@7 / @ai-sdk/react@4:
 *
 *   chat.ts:468   state.pushMessage(userMsg)   -> calls MESSAGE callbacks
 *   chat.ts:841   setStatus({ status: 'submitted' }) -> calls STATUS callbacks
 *
 * Both inside one synchronous block, and `useChat` reads `messages` and
 * `status` from two SEPARATE `useSyncExternalStore` subscriptions. React
 * therefore commits ONE render in which the question is the newest message
 * AND `status === 'submitted'`.
 *
 * The old effect gated every message on `!isSending`, so on that single
 * render it returned early. There was never a render where the question
 * existed without `isSending` being true — which is why transcripts kept
 * their answers and lost their questions.
 *
 * This models that sequence and asserts the rule the fix depends on: a user
 * message is writable on the first render that contains it, regardless of
 * whether a stream is running.
 *
 * Run from apps/web:  node scripts/test-chat-persistence.mjs
 */
import assert from "node:assert/strict";

/* ------------------------------------------------------------ the SDK -- */

/**
 * The ordering from ai/src/ui/chat.ts, reduced to what the effect observes.
 *
 * `messages` and `status` are published independently, exactly as
 * `ReactChatState` does - `pushMessage` calls the message callbacks and
 * `setStatus` calls the status callbacks, and nothing joins them.
 */
function makeChat() {
  const listeners = [];
  const chat = {
    messages: [],
    status: "ready",
    pushMessage(m) {
      chat.messages = [...chat.messages, m];
      listeners.forEach((fn) => fn());
    },
    setStatus(s) {
      chat.status = s;
      listeners.forEach((fn) => fn());
    },
    subscribe(fn) {
      listeners.push(fn);
    },
  };
  return chat;
}

/**
 * One React commit: the external store changed, so the component re-renders
 * and every effect sees the new snapshot. Each `emit` is one commit.
 *
 * React coalesces notifications that arrive in the same synchronous block,
 * which is the whole point - so a push immediately followed by a status
 * change is ONE render, not two.
 */
function commit(chat, runEffect) {
  runEffect({ messages: chat.messages, status: chat.status });
}

const userMsg = (id, text) => ({ id, role: "user", parts: [{ type: "text", text }] });
const asstMsg = (id, text) => ({ id, role: "assistant", parts: [{ type: "text", text }] });

/* ------------------------------------------------- the rule under test -- */

/**
 * The decision the effect makes, extracted verbatim from ai-tutor.tsx.
 *
 * Written as a pure function over (messages, status) so the ordering claim
 * can be asserted directly. If the effect changes, this must change with it
 * or this file stops testing anything - which is why it is a copy and not an
 * import: the component is a hook and cannot be called outside a renderer.
 */
function selectPersistable(messages, status, alreadySaved, threadId = "t1") {
  const isSending = status === "submitted" || status === "streaming";
  const saved = new Set(alreadySaved);
  const pending = [];

  for (const message of messages) {
    const role = message.role === "user" ? "user" : "assistant";
    if (role === "assistant" && isSending) {
      continue;
    }
    const content = (message.parts ?? []).map((p) => p.text ?? "").join("");
    if (content.length === 0) {
      continue;
    }
    const key = `${threadId}:${message.id}`;
    if (saved.has(key)) {
      continue;
    }
    saved.add(key);
    pending.push({ id: message.id, role, content });
  }
  return { pending, saved };
}

let passed = 0;
const ok = (m) => {
  console.log(`  ok   ${m}`);
  passed++;
};
const bad = (m) => {
  console.log(`  FAIL ${m}`);
  process.exitCode = 1;
};

/* ------------------------------------------------------------- cases --- */

console.log("a completed turn writes the question AND the answer");
{
  const chat = makeChat();
  let saved = new Set();

  // sendMessage: the block from chat.ts, in order.
  chat.pushMessage(userMsg("u1", "what is a monad"));
  chat.setStatus("submitted");

  commit(chat, ({ messages, status }) => {
    const r = selectPersistable(messages, status, saved);
    saved = r.saved;
    // THE ASSERTION. Before the fix this was empty, because the single
    // commit had the question as the newest message and isSending === true.
    assert.deepEqual(
      r.pending.map((p) => p.role),
      ["user"],
      "the question must be persistable on the first commit that contains it",
    );
  });

  // the stream arrives and finishes
  chat.messages = [...chat.messages, asstMsg("a1", "a monad is a functor")];
  chat.setStatus("streaming");
  commit(chat, ({ messages, status }) => {
    const r = selectPersistable(messages, status, saved);
    saved = r.saved;
    assert.deepEqual(
      r.pending,
      [],
      "a half-streamed answer must not be written",
    );
  });

  chat.setStatus("ready");
  commit(chat, ({ messages, status }) => {
    const r = selectPersistable(messages, status, saved);
    saved = r.saved;
    assert.deepEqual(
      r.pending.map((p) => p.role),
      ["assistant"],
      "the answer is written once the stream ends",
    );
  });

  ok("question, then answer - neither lost");
}

console.log("\na turn that never gets an answer still keeps the question");
{
  const chat = makeChat();
  let saved = new Set();

  chat.pushMessage(userMsg("u2", "and a fold?"));
  chat.setStatus("submitted");
  commit(chat, ({ messages, status }) => {
    saved = selectPersistable(messages, status, saved).saved;
  });

  // the request fails: status goes to error, no assistant message ever exists
  chat.setStatus("error");
  commit(chat, ({ messages, status }) => {
    const r = selectPersistable(messages, status, saved);
    assert.equal(r.pending.length, 0, "nothing new to write");
    assert.ok(saved.has("t1:u2"), "but the question is already saved");
  });

  ok("an abandoned turn costs the answer, never the question");
}

console.log("\nre-running the effect changes nothing");
{
  const chat = makeChat();
  let saved = new Set();
  chat.pushMessage(userMsg("u3", "hi"));
  chat.setStatus("submitted");
  chat.messages = [...chat.messages, asstMsg("a3", "hello")];
  chat.setStatus("ready");

  commit(chat, ({ messages, status }) => {
    saved = selectPersistable(messages, status, saved).saved;
  });
  // A second render with identical state - a pane toggle, a re-render from
  // an unrelated prop. Must be a no-op or the whole transcript is re-posted.
  commit(chat, ({ messages, status }) => {
    const r = selectPersistable(messages, status, saved);
    assert.equal(r.pending.length, 0, "a replay must write nothing");
  });
  ok("the guard makes re-renders free");
}

console.log("\nrestored rows are not re-posted");
{
  // A transcript read back from /api/chat arrives pre-marked, exactly as
  // the seed effect does it in the component.
  const restored = [userMsg("u4", "restored question"), asstMsg("a4", "restored answer")];
  const alreadySaved = new Set(restored.map((m) => `t1:${m.id}`));
  const r = selectPersistable(restored, "ready", alreadySaved);
  assert.equal(r.pending.length, 0, "opening a stored thread must not re-post it");
  ok("reopening a thread writes nothing");
}

console.log("\nthe old rule would have lost the question");
{
  // Not a test of the new code - a test that the bug is real, so this file
  // cannot quietly start passing for the wrong reason.
  const chat = makeChat();
  chat.pushMessage(userMsg("u5", "this one matters"));
  chat.setStatus("submitted");

  // The old predicate, verbatim: gate everything on !isSending.
  const isSending = chat.status === "submitted" || chat.status === "streaming";
  const last = chat.messages.at(-1);
  const oldWouldWrite = !isSending && last !== undefined;

  assert.equal(oldWouldWrite, false, "the old gate must reject this commit");
  assert.equal(last.role, "user", "and the newest message must be the question");
  ok("reproduces the reported symptom: user message, never written");
}

console.log(`\n${passed} passed.`);
