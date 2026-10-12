/**
 * Applies the note_topics / note_chunks DDL directly.
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
 * `pgvector` is required and is NOT created here. It is a managed
 * extension on most hosts, and `CREATE EXTENSION` is a privilege the
 * application role often does not have — so it is the operator's call,
 * deliberately separated from this script rather than attempted and
 * quietly swallowed. Run it first, as an admin:
 *
 *   CREATE EXTENSION IF NOT EXISTS vector;
 *
 * To check before running anything: `SELECT name FROM
 * pg_available_extensions WHERE name = 'vector';`  An absent row means the
 * host cannot do it at all, which is a different problem from a
 * permission error and has a different fix (see IDEAS/TODO.md).
 *
 * Run from packages/db:
 *   node scripts/create-note-tables.mjs
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const STATEMENTS = [
  // Checked, not created — see the file header.
  `DO $$
   BEGIN
     IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
       RAISE EXCEPTION
         'pgvector is not installed. Run CREATE EXTENSION vector; as an admin on this database first.';
     END IF;
   END $$`,

  `CREATE TABLE IF NOT EXISTS "note_topics" (
     "id" text PRIMARY KEY NOT NULL,
     "module_code" text NOT NULL,
     "slug" text NOT NULL,
     "title" text NOT NULL,
     "description" text DEFAULT '' NOT NULL,
     "source_path" text NOT NULL,
     "content_hash" text NOT NULL,
     "page_count" integer,
     "created_at" timestamp DEFAULT now() NOT NULL,
     "updated_at" timestamp DEFAULT now() NOT NULL
   )`,

  // The entitlement filter's index: module-scoped, so the retrieval
  // query's `WHERE module_code = ANY(...)` rides on it before any ranking.
  `CREATE INDEX IF NOT EXISTS "note_topics_module_idx"
     ON "note_topics" ("module_code")`,

  `CREATE TABLE IF NOT EXISTS "note_chunks" (
     "id" text PRIMARY KEY NOT NULL,
     "topic_id" text NOT NULL REFERENCES "note_topics"("id") ON DELETE cascade,
     "module_code" text NOT NULL,
     "chunk_index" integer NOT NULL,
     "heading" text,
     "content" text NOT NULL,
     "token_estimate" integer,
     "embedding" vector(768),
     "created_at" timestamp DEFAULT now() NOT NULL
   )`,

  // Re-ingest upserts on (topic_id, chunk_index), so this is the index
  // that makes a re-run an update rather than a duplicate.
  `CREATE UNIQUE INDEX IF NOT EXISTS "note_chunks_topic_index_idx"
     ON "note_chunks" ("topic_id", "chunk_index")`,
  `CREATE INDEX IF NOT EXISTS "note_chunks_module_idx"
     ON "note_chunks" ("module_code")`,

  // HNSW over cosine distance. `<=>` in the retrieval query is cosine, so
  // an ivfflat/l2 index would be quietly wrong rather than merely slow.
  // Created CONCURRENTLY-safe: this is a fresh table, so a plain index is
  // correct here and CONCURRENTLY would fail inside the transaction block.
  `CREATE INDEX IF NOT EXISTS "note_chunks_embedding_idx"
     ON "note_chunks" USING hnsw ("embedding" vector_cosine_ops)`,
];

const client = new Client({ connectionString: url });

try {
  await client.connect();
  for (const stmt of STATEMENTS) {
    await client.query(stmt);
    console.log("ok:", stmt.trim().split("\n")[0].slice(0, 62));
  }
  console.log("\nnote tables are ready.");
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}