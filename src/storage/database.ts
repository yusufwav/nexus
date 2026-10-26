/**
 * THE LOCAL DATABASE
 * ---------------------------------------------------------------------------
 * THE OFFLINE STORAGE TRANSITION.
 *
 * The web app keeps its state in two places:
 *
 *   · a Postgres database (via Drizzle) holding modules, purchases, chat
 *     threads, practice attempts and notes;
 *   · `localStorage` holding the reader's preferences — the chosen theme,
 *     the model picker's choice and its favourites.
 *
 * A phone has neither a Postgres server nor a browser, and the app has to run
 * with no network at all. So:
 *
 *   · Postgres becomes a LOCAL SQLITE DATABASE. Same tables, same columns,
 *     same queries — just on the device. It is the source of truth for the
 *     catalogue, the lesson notes, the practice attempts, the chat history
 *     and the purchases.
 *   · `localStorage` becomes AsyncStorage for plain preferences, and
 *     expo-secure-store for anything that is a secret.
 *
 * The content itself is seeded from the bundled TypeScript modules on first
 * launch, so the app is fully functional on first open with no network and no
 * server.
 */
import * as SQLite from "expo-sqlite";

import { clearCachedSession } from "@/storage/auth";
import { clearAllProviders } from "@/storage/provider";

const DATABASE_NAME = "nexus.db";

/**
 * Bump this when the bundled content changes, so the seed runs again and the
 * database picks up the new notes.
 */
export const CONTENT_VERSION = 1;

let database: SQLite.SQLiteDatabase | null = null;
let opening: Promise<SQLite.SQLiteDatabase> | null = null;

/** Open (and, the first time, create and migrate) the local database. */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (database !== null) return database;
  if (opening !== null) return opening;
  opening = (async () => {
    const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
    await migrate(db);
    database = db;
    return db;
  })();
  return opening;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS modules (
  code         TEXT PRIMARY KEY NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT NOT NULL,
  price_cents  INTEGER NOT NULL,
  has_trial    INTEGER NOT NULL,
  status       TEXT NOT NULL,
  position     INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  slug        TEXT PRIMARY KEY NOT NULL,
  module_code TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL,
  pdf         TEXT,
  pages       INTEGER,
  position    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS lessons (
  id          TEXT PRIMARY KEY NOT NULL,
  module_code TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  n           INTEGER NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  points      TEXT NOT NULL,
  example     TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id          TEXT PRIMARY KEY NOT NULL,
  format      TEXT NOT NULL,
  module_code TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  topic_slug  TEXT NOT NULL,
  difficulty  INTEGER NOT NULL,
  tags        TEXT NOT NULL,
  prompt      TEXT NOT NULL,
  spec        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS purchases (
  id           TEXT PRIMARY KEY NOT NULL,
  module_code  TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  amount_cents INTEGER NOT NULL,
  status       TEXT NOT NULL,
  provider     TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id               TEXT PRIMARY KEY NOT NULL,
  question_id      TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  chosen_option_id TEXT NOT NULL,
  outcome          TEXT NOT NULL,
  explanation      TEXT NOT NULL,
  created_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS read_positions (
  lesson_key  TEXT PRIMARY KEY NOT NULL,
  module_code TEXT NOT NULL REFERENCES modules(code) ON DELETE CASCADE,
  lesson_n    INTEGER NOT NULL,
  opened_at   TEXT NOT NULL,
  completed   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS threads (
  id         TEXT PRIMARY KEY NOT NULL,
  title      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id         TEXT PRIMARY KEY NOT NULL,
  thread_id  TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role       TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile (
  key   TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_topics_module ON topics(module_code);
CREATE INDEX IF NOT EXISTS idx_lessons_module ON lessons(module_code, n);
CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module_code);
CREATE INDEX IF NOT EXISTS idx_attempts_question ON attempts(question_id);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
`;

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  /*
   * FOREIGN KEYS ARE OFF BY DEFAULT, per connection, and they stay off
   * unless they are asked for. The schema now declares them; without this
   * line the declarations would be decoration.
   *
   * WAL is the journal mode every modern SQLite app uses: a reader scrolling
   * a lesson while an attempt is written does not block on the write, and a
   * crash mid-write rolls back to the last committed transaction instead of
   * leaving a half-written database.
   */
  await db.execAsync("PRAGMA foreign_keys = ON;");
  await db.execAsync("PRAGMA journal_mode = WAL;");
  await db.execAsync(SCHEMA);
}

/** Read a value out of the `meta` table. */
export async function getMeta(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM meta WHERE key = ?",
    [key],
  );
  return row?.value ?? null;
}

/** Write a value into the `meta` table. */
export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, value],
  );
}

/**
 * WHO THE LOCAL DATA BELONGS TO.
 *
 * The phone can be shared, and signing out clears the session but not the
 * database. Without an owner, the next person to sign in inherits the last
 * reader's purchases, progress and chat threads. The owner is recorded here
 * so a DIFFERENT account can be detected and the previous account's data
 * wiped before the new one sees anything.
 */
const OWNER_KEY = "owner_user_id";

export async function readDataOwner(): Promise<string | null> {
  return getMeta(OWNER_KEY);
}

export async function writeDataOwner(userId: string): Promise<void> {
  await setMeta(OWNER_KEY, userId);
}

/**
 * Wipe everything scoped to a reader: their purchases, progress, answers,
 * conversations and saved provider keys. Content tables (`modules`,
 * `topics`, `lessons`, `questions`) and preferences (the theme) are not
 * personal and are left alone.
 *
 * The deletes are one transaction: a crash halfway through must not leave
 * half of one reader's history behind for the next reader to find.
 */
export async function clearUserContent(): Promise<void> {
  const db = await getDatabase();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync(`
      DELETE FROM purchases;
      DELETE FROM attempts;
      DELETE FROM read_positions;
      DELETE FROM threads;
      DELETE FROM messages;
      DELETE FROM profile;
    `);
  });
  /*
   * The provider keys live in the keychain, not in this database, so
   * "clear local data" would leave them behind — and a reader clearing the
   * app is not expecting their API key to still be in it.
   */
  await clearAllProviders();
}

/**
 * Wipe everything this device holds.
 *
 * The session is cleared too, and it has to be: the cached session is what
 * lets the app open without a network, so leaving it behind after "clear
 * local data" would leave the app signed in and unlocked — which is the
 * opposite of what the button says.
 */
export async function clearUserData(): Promise<void> {
  await clearUserContent();
  await clearCachedSession();
}

/** Rough on-disk size of the database, for the storage screen. */
export async function databaseSizeBytes(): Promise<number> {
  const db = await getDatabase();
  try {
    const row = await db.getFirstAsync<{ size: number }>(
      "SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()",
    );
    return row?.size ?? 0;
  } catch {
    // The pragma functions are not available on every SQLite build. The size
    // is a nicety, not a fact the app depends on.
    return 0;
  }
}
