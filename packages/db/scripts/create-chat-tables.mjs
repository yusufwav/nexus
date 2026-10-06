/**
 * Applies the chat_threads / chat_messages DDL directly.
 *
 * `pnpm db:push` is the supported path and is what should be used
 * wherever drizzle-kit runs. It does not run on this machine: it exits
 * with "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)" in
 * src/win/async.c, identically on a clean checkout with no schema
 * changes (see IDEAS/TODO.md). The schema files in src/schema stay the
 * source of truth either way; this script only materialises them in a
 * database, and every statement is IF NOT EXISTS, so it is safe to
 * re-run and touches no existing rows.
 *
 * Run from packages/db:
 *   node scripts/create-chat-tables.mjs
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "chat_threads" (
     "id" text PRIMARY KEY NOT NULL,
     "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "title" text DEFAULT 'New chat' NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL,
     "updated_at" timestamp DEFAULT now() NOT NULL
   )`,
  // The history pane's one query: this user's threads, newest first.
  `CREATE INDEX IF NOT EXISTS "chat_threads_user_updated_idx"
     ON "chat_threads" ("user_id", "updated_at")`,

  `CREATE TABLE IF NOT EXISTS "chat_messages" (
     "id" text PRIMARY KEY NOT NULL,
     "thread_id" text NOT NULL REFERENCES "chat_threads"("id") ON DELETE cascade,
     "role" text NOT NULL,
     "content" text NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,
  // Loading one thread is the only read of this table, always ordered.
  `CREATE INDEX IF NOT EXISTS "chat_messages_thread_created_idx"
     ON "chat_messages" ("thread_id", "created_at")`,
  // Named so appendChatMessage's ON CONFLICT has a target.
  //
  // Per-thread, not global. "id" alone is already this table's primary
  // key, which made it look like the right conflict target — but
  // matching on it let a client that reused another user's message id
  // overwrite that user's message. (thread_id, id) is what actually
  // identifies a message inside a conversation, and it is what the
  // upsert now targets. This index has to exist for that target to be
  // valid, so it cannot simply be dropped.
  `CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_thread_id_idx"
     ON "chat_messages" ("thread_id", "id")`,
];

const client = new Client({ connectionString: url });
await client.connect();
try {
  for (const sql of STATEMENTS) {
    await client.query(sql);
  }
  const { rows } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'chat_%'
      ORDER BY table_name`,
  );
  console.log("chat tables present:", rows.map((r) => r.table_name).join(", ") || "none");
} finally {
  await client.end();
}