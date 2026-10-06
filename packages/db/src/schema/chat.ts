import { defineRelationsPart } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * CHAT THREADS + MESSAGES
 * ------------------------------------------------------------
 * The tutor's history. Two tables rather than one: a thread is listed
 * in the history pane by title alone, and loading one pulls its
 * messages. Splitting them keeps the list query off the messages table,
 * which is the one that grows.
 *
 * WHY THIS IS IN THE DATABASE rather than in localStorage: history that
 * lives in a browser tab is history that a second device does not have,
 * and clearing site data takes it with it. It is also the only place the
 * per-user scoping can be enforced by something other than the client.
 *
 * THE SCOPING RULE is that every read and write in queries.ts carries
 * `eq(chatThreads.userId, userId)` where userId comes from
 * getSession() — never from a request body, a query parameter, or a
 * client-supplied header. That is the whole of the "only this user"
 * guarantee on the read path, and it is why no function below accepts a
 * user id from the caller.
 */

export const chatThreads = pgTable(
  "chat_threads",
  {
    id: text("id").primaryKey(),
    /**
     * Cascade, not restrict: deleting an account should take its chat
     * history with it rather than orphaning transcripts full of
     * somebody's questions.
     */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** First user message, trimmed. Falls back to "New chat". */
    title: text("title").notNull().default("New chat"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    /** Bumped on every appended message; this is what the list sorts. */
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Serves the history pane's one query: this user's threads, newest
    // first. Without it the list is a scan of every thread ever written.
    index("chat_threads_user_updated_idx").on(table.userId, table.updatedAt),
  ],
);

export const chatMessages = pgTable(
  "chat_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id")
      .notNull()
      .references(() => chatThreads.id, { onDelete: "cascade" }),
    /** "user" or "assistant". Not an enum: nothing branches on it. */
    role: text("role").notNull(),
    /**
     * The rendered markdown, as text. Streamdown takes markdown, so it
     * is stored the way it is displayed rather than as message parts —
     * which also means a reopened thread cannot drift from what was
     * shown when it was live.
     */
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Loading one thread is the only read, and it is always ordered.
    index("chat_messages_thread_created_idx").on(table.threadId, table.createdAt),
    // Uniqueness that appendChatMessage's ON CONFLICT targets. Scoped
    // to the thread on purpose: `id` alone is the primary key and so is
    // already unique, but an upsert matching on it alone would let a
    // client that reused another user's message id overwrite that
    // message. A message is only identified within its conversation.
    uniqueIndex("chat_messages_thread_id_idx").on(table.threadId, table.id),
  ],
);

/**
 * Lets appendMessage name a constraint for ON CONFLICT, so a replayed
 * turn updates its row rather than inserting a duplicate.
 */
export const chatMessagesIdUnique = uniqueIndex("chat_messages_id_idx").on(
  chatMessages.id,
);

export const chatRelations = defineRelationsPart(
  { user, chatThreads, chatMessages },
  (r) => ({
    user: {
      chatThreads: r.many.chatThreads({
        from: r.user.id,
        to: r.chatThreads.userId,
      }),
    },
    chatThreads: {
      user: r.one.user({
        from: r.chatThreads.userId,
        to: r.user.id,
      }),
      messages: r.many.chatMessages({
        from: r.chatThreads.id,
        to: r.chatMessages.threadId,
      }),
    },
    chatMessages: {
      thread: r.one.chatThreads({
        from: r.chatMessages.threadId,
        to: r.chatThreads.id,
      }),
    },
  }),
);