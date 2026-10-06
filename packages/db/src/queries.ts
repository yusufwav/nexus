import { and, asc, desc, eq } from "drizzle-orm";

import type { Database } from ".";
import { chatMessages, chatThreads } from "./schema/chat";
import { modules, purchases } from "./schema/modules";

/**
 * READS
 * ------------------------------------------------------------
 * Catalogue queries live here rather than in the app, because this
 * package owns the drizzle dependency. Callers pass the Database
 * returned by createDb().
 *
 * Every function can be treated by a caller as "throw means fall
 * back to the bundled list" — see apps/web/src/lib/modules.ts, which
 * swallows errors so the public pages render with Docker off.
 */

export async function listModules(db: Database) {
  return db.select().from(modules).orderBy(asc(modules.sortOrder));
}

export async function getModuleByCode(db: Database, code: string) {
  const rows = await db.select().from(modules).where(eq(modules.code, code)).limit(1);
  return rows[0] ?? null;
}

/** Course codes the user has paid for. Pending and refunded rows do not count. */
export async function getOwnedCodes(db: Database, userId: string) {
  const rows = await db
    .select({ code: modules.code })
    .from(purchases)
    .innerJoin(modules, eq(purchases.moduleId, modules.id))
    .where(and(eq(purchases.userId, userId), eq(purchases.status, "paid")));
  return new Set(rows.map((r) => r.code));
}

/** A user's purchases with the module joined in, oldest first. */
export async function listPurchases(db: Database, userId: string) {
  return db
    .select({
      id: purchases.id,
      amountCents: purchases.amountCents,
      status: purchases.status,
      provider: purchases.provider,
      createdAt: purchases.createdAt,
      code: modules.code,
      name: modules.name,
    })
    .from(purchases)
    .innerJoin(modules, eq(purchases.moduleId, modules.id))
    .where(eq(purchases.userId, userId))
    .orderBy(asc(purchases.createdAt));
}

/* ============================================================
   CHAT HISTORY
   ------------------------------------------------------------
   Every function here takes `userId` as its FIRST argument and
   filters on it in the WHERE clause — including the ones that take a
   thread id. That is deliberate and is the entire access-control story
   for the history pane: a thread id is guessable (it comes from the
   URL of a request the caller made), so looking one up by id alone
   would hand over any transcript in the table to anyone who asked.
   Scoping by user means the worst a wrong thread id can do is look
   like a thread that does not exist.

   Callers get userId from getSession(). It is never a request
   parameter — see apps/web/src/app/api/chat/.
   ============================================================ */

/** How many threads the history pane shows before it stops asking. */
const THREAD_PAGE = 50;

/** One row of the history pane: an id to reopen, and a label. */
export type ChatThreadSummary = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: Date;
};

/** This user's threads, most recently touched first. */
export async function listChatThreads(
  db: Database,
  userId: string,
): Promise<Array<ChatThreadSummary>> {
  const rows = await db
    .select({
      id: chatThreads.id,
      title: chatThreads.title,
      updatedAt: chatThreads.updatedAt,
    })
    .from(chatThreads)
    .where(eq(chatThreads.userId, userId))
    .orderBy(desc(chatThreads.updatedAt))
    .limit(THREAD_PAGE);
  return rows;
}

/** One stored message, as the transcript renders it back. */
export type StoredChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

/**
 * One thread and its messages, or null.
 *
 * Null covers both "no such thread" and "not yours" on purpose: the two
 * are the same answer from outside, so this cannot be used to probe
 * which thread ids exist.
 */
export async function getChatThread(
  db: Database,
  userId: string,
  threadId: string,
): Promise<{ id: string; title: string; messages: Array<StoredChatMessage> } | null> {
  // Ownership first. Without this the messages query would happily
  // return a transcript for a thread belonging to somebody else.
  const thread = await db
    .select({ id: chatThreads.id, title: chatThreads.title })
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
    .limit(1);
  const found = thread[0];
  if (!found) {
    return null;
  }

  const rows = await db
    .select({
      id: chatMessages.id,
      role: chatMessages.role,
      content: chatMessages.content,
    })
    .from(chatMessages)
    .where(eq(chatMessages.threadId, found.id))
    .orderBy(asc(chatMessages.createdAt));

  return {
    id: found.id,
    title: found.title,
    messages: rows.map((r) => ({
      id: r.id,
      // Coerced rather than trusted: role is a free-text column, and a
      // value the tutor never wrote would otherwise render as a
      // user-authored bubble in someone else's transcript.
      role: r.role === "assistant" ? "assistant" : "user",
      content: r.content,
    })),
  };
}

/** What the caller wants to add to a thread. */
export type NewChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

/**
 * Create the thread if it is new, then record one message.
 *
 * Returns false when the thread exists but belongs to somebody else.
 *
 * THE OWNERSHIP CHECK IS NOT OPTIONAL. The thread id comes from the
 * client and is the sole primary key of chat_threads, so it is entirely
 * caller-chosen — the upsert below matches on the id alone and would
 * happily accept it. Without the check, any signed-in user could POST
 * to /api/chat with somebody else's thread id and inject messages into
 * that transcript, where they then render inside their history pane.
 * Read and delete were already scoped by userId in their WHERE clause;
 * this write path had no equivalent, so it was the one hole.
 *
 * False rather than an error: from outside, "not yours" and "does not
 * exist" are the same thing, and telling them apart would turn thread
 * ids into a probe for what other users have.
 *
 * The title is set from the first user message only. Re-sending should
 * not rename a conversation the user has already started.
 */
export async function appendChatMessage(
  db: Database,
  userId: string,
  threadId: string,
  threadTitle: string,
  message: NewChatMessage,
): Promise<boolean> {
  // Ownership first, and it has to be a real read: the insert below is
  // an upsert on the id, so it cannot express "only if it is mine".
  const owned = await db
    .select({ id: chatThreads.id })
    .from(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
    .limit(1);

  if (owned.length === 0) {
    // Either genuinely new, or it belongs to someone else. The insert
    // decides which: if the row is already there under another user the
    // conflict fires, and we bail without having written the message.
    const claimed = await db
      .insert(chatThreads)
      .values({ id: threadId, userId, title: threadTitle })
      // A concurrent tab can win the race to create this thread. Its
      // title is the same one we would have written, so taking it is
      // harmless — and cheaper than a select-then-insert.
      .onConflictDoNothing({ target: chatThreads.id })
      .returning({ id: chatThreads.id });

    if (claimed.length === 0) {
      return false;
    }
  }

  await db
    .insert(chatMessages)
    .values({
      id: message.id,
      threadId,
      role: message.role,
      content: message.content,
    })
    // Replays happen: a stream that fails midway can be retried, and
    // the client resends the turn. Same id, so update rather than
    // inserting a second copy of the same message.
    //
    // The conflict target is deliberately NOT chatMessages.id. That
    // column is a global primary key, so a client that guessed or
    // reused another user's message id would collide with it and this
    // upsert would overwrite that user's message with attacker-chosen
    // text — a cross-user write that survives every userId check
    // above, because the collision happens below them. Scoping the
    // target to (threadId, id) means a message id can only ever be
    // updated within the thread that already contains it.
    //
    // DO NOT "simplify" this back to the bare id. It is the second
    // half of the ownership guarantee, not a stylistic choice.
    .onConflictDoUpdate({
      target: [chatMessages.threadId, chatMessages.id],
      set: { content: message.content, role: message.role },
    });

  // Touch the thread so it sorts to the top of the history pane.
  // updateAt has a $onUpdate hook, but that only fires through drizzle's
  // update builder — an insert does not trigger it.
  await db
    .update(chatThreads)
    .set({ updatedAt: new Date() })
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));

  return true;
}

/**
 * Delete one thread and its messages. Scoped by user, so this is a
 * no-op on somebody else's thread rather than a way to delete it.
 * The messages go with it via ON DELETE CASCADE.
 */
export async function deleteChatThread(
  db: Database,
  userId: string,
  threadId: string,
): Promise<boolean> {
  const rows = await db
    .delete(chatThreads)
    .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
    .returning({ id: chatThreads.id });
  return rows.length > 0;
}