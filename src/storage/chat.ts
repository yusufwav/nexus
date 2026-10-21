/**
 * THE TUTOR'S THREADS
 * ---------------------------------------------------------------------------
 * The web app kept chat threads and their messages in Postgres, written by
 * the `/api/chat` route as a side effect of a message being written.
 *
 * Here they live in the same local SQLite database, and the same rule
 * applies: a conversation is persisted as soon as it exists, not as an
 * action the reader has to take. A conversation that is opened and never
 * continued still persists — which leaves the delete button as the only way
 * to lose one.
 */
import { getDatabase } from "@/storage/database";

export type ThreadSummary = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

export type StoredMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

export type StoredRow = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

/** A short id the client owns and the database stores verbatim. */
export function newThreadId(): string {
  return `th_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Every thread, most recently updated first. */
export async function listThreads(): Promise<ReadonlyArray<ThreadSummary>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; title: string; updated_at: string }>(
    "SELECT id, title, updated_at FROM threads ORDER BY updated_at DESC",
  );
  return rows.map((r) => ({ id: r.id, title: r.title, updatedAt: r.updated_at }));
}

/** The messages of one thread, oldest first. */
export async function listMessages(threadId: string): Promise<ReadonlyArray<StoredMessage>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ id: string; role: string; content: string }>(
    "SELECT id, role, content FROM messages WHERE thread_id = ? ORDER BY rowid ASC",
    [threadId],
  );
  return rows.map((r) => ({
    id: r.id,
    role: r.role === "user" ? "user" : "assistant",
    content: r.content,
  }));
}

/**
 * Write rows to the database.
 *
 * Re-writing a row is safe: the upsert is on (thread_id, id), so a duplicate
 * write updates the row instead of adding a second one.
 */
export async function persistMessages(
  threadId: string,
  rows: ReadonlyArray<StoredRow>,
  title?: string,
): Promise<void> {
  if (rows.length === 0) return;
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const row of rows) {
      await txn.runAsync(
        `INSERT INTO messages (id, thread_id, role, content, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET content = excluded.content`,
        [row.id, threadId, row.role, row.content, now],
      );
    }
    const existing = await txn.getFirstAsync<{ title: string }>(
      "SELECT title FROM threads WHERE id = ?",
      [threadId],
    );
    const resolved = title ?? existing?.title ?? rows[0]!.content.slice(0, 60);
    await txn.runAsync(
      `INSERT INTO threads (id, title, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at`,
      [threadId, resolved, now],
    );
  });
}

/** Rename a thread. */
export async function renameThread(threadId: string, title: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("UPDATE threads SET title = ? WHERE id = ?", [title, threadId]);
}

/** Forget a conversation. The database cascades to its messages. */
export async function deleteThread(threadId: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM messages WHERE thread_id = ?", [threadId]);
  await db.runAsync("DELETE FROM threads WHERE id = ?", [threadId]);
}
