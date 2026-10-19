-- ============================================================================
-- NEXUS — PRODUCTION SCHEMA, PART 2 of 4: the application tables
-- ============================================================================
-- Run AFTER part 1. No dollar-quoting, no DO blocks: every statement stands
-- alone so a naive statement splitter cannot mangle it.
--
-- Ordering inside this file is the dependency order:
--   user -> modules -> purchases
--   user -> provider_keys, chat_threads -> chat_messages
--   note_topics -> note_chunks
-- ============================================================================


-- ---- catalogue --------------------------------------------------------------
-- has_trial_pdf is the free tier: notes-access.ts treats every module with this
-- flag as readable without a purchase. It is the ONLY entitlement mechanism
-- that does not involve a purchase row, so it is security-relevant.
CREATE TABLE IF NOT EXISTS "modules" (
  "id"            text PRIMARY KEY NOT NULL,
  "code"          text NOT NULL,
  "name"          text NOT NULL,
  "description"   text NOT NULL,
  "price_cents"   integer DEFAULT 0 NOT NULL,
  "has_trial_pdf" boolean DEFAULT false NOT NULL,
  "status"        module_status DEFAULT 'available' NOT NULL,
  "sort_order"    integer DEFAULT 0 NOT NULL,
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "modules_code_idx" ON "modules" ("code");


-- ---- entitlement ------------------------------------------------------------
-- status = 'paid' is the ONLY value that unlocks content; pending and refunded
-- unlock nothing (getOwnedCodes in packages/db/src/queries.ts).
-- provider_ref is the payment provider's own reference and is never selected
-- into anything a client or model sees.
CREATE TABLE IF NOT EXISTS "purchases" (
  "id"           text PRIMARY KEY NOT NULL,
  "user_id"      text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "module_id"    text NOT NULL REFERENCES "modules"("id") ON DELETE cascade,
  "amount_cents" integer NOT NULL,
  "status"       purchase_status DEFAULT 'pending' NOT NULL,
  "provider"     text DEFAULT 'stub' NOT NULL,
  "provider_ref" text,
  "created_at"   timestamp DEFAULT now() NOT NULL,
  "updated_at"   timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "purchases_user_module_idx"
  ON "purchases" ("user_id", "module_id");


-- ---- reader credentials ----------------------------------------------------
-- encrypted_key is AES-256-GCM ciphertext (apps/web/src/lib/key-crypto.ts).
-- A dump of this table is not a credential dump: the sealing key lives in the
-- environment, never in the database.
--
-- kind / name / base_url are what custom routing adds; part 8 creates them
-- on an existing database. They are declared here too, with the same
-- defaults, so a database built from this file in one pass matches the
-- drizzle schema and part 8's ALTERs land as no-ops.
CREATE TABLE IF NOT EXISTS "provider_keys" (
  "id"            text PRIMARY KEY NOT NULL,
  "user_id"       text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "provider"      text NOT NULL,
  "label"         text DEFAULT '' NOT NULL,
  "encrypted_key" text NOT NULL,
  "last_four"     text NOT NULL,
  "model_id"      text NOT NULL,
  -- 'builtin' rows take their base URL from the allowlist in code; 'custom'
  -- rows carry one the reader named, validated by
  -- apps/web/src/lib/custom-provider-url.ts before it was ever stored.
  "kind"          text NOT NULL DEFAULT 'builtin',
  -- The reader's own name for a custom provider. Display only. The slug in
  -- `provider` is minted by the server precisely so this text is never used
  -- as an identifier.
  "name"          text NOT NULL DEFAULT '',
  "base_url"      text,
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "provider_keys_user_provider_idx"
  ON "provider_keys" ("user_id", "provider");
CREATE INDEX IF NOT EXISTS "provider_keys_user_idx" ON "provider_keys" ("user_id");


-- ---- chat history -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS "chat_threads" (
  "id"         text PRIMARY KEY NOT NULL,
  "user_id"    text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "title"      text NOT NULL DEFAULT 'New chat',
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "chat_threads_user_updated_idx"
  ON "chat_threads" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "chat_messages" (
  "id"         text PRIMARY KEY NOT NULL,
  "thread_id"  text NOT NULL REFERENCES "chat_threads"("id") ON DELETE cascade,
  "role"       text NOT NULL,
  "content"    text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "chat_messages_thread_created_idx"
  ON "chat_messages" ("thread_id", "created_at");
-- Scoped to the thread deliberately. A bare unique index on `id` would let a
-- client that reused another reader's message id overwrite that message,
-- which is a cross-reader write that survives every userId check in the app
-- because the collision happens below them.
CREATE UNIQUE INDEX IF NOT EXISTS "chat_messages_thread_id_idx"
  ON "chat_messages" ("thread_id", "id");


-- ---- notes corpus -----------------------------------------------------------
-- source_path is server-side bookkeeping for ingestion and operator tracing.
-- It is never selected into anything bound for a prompt or a response.
CREATE TABLE IF NOT EXISTS "note_topics" (
  "id"           text PRIMARY KEY NOT NULL,
  "module_code"  text NOT NULL,
  "slug"         text NOT NULL,
  "title"        text NOT NULL,
  "description"  text DEFAULT '' NOT NULL,
  "source_path"  text NOT NULL,
  "content_hash" text NOT NULL,
  "page_count"   integer,
  "created_at"   timestamp DEFAULT now() NOT NULL,
  "updated_at"   timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "note_topics_slug_idx" ON "note_topics" ("slug");
CREATE INDEX IF NOT EXISTS "note_topics_module_idx" ON "note_topics" ("module_code");

CREATE TABLE IF NOT EXISTS "note_chunks" (
  "id"             text PRIMARY KEY NOT NULL,
  "topic_id"       text NOT NULL REFERENCES "note_topics"("id") ON DELETE cascade,
  "module_code"    text NOT NULL,
  "chunk_index"    integer NOT NULL,
  "heading"        text,
  "content"        text NOT NULL,
  "token_estimate" integer,
  -- 768 dimensions is what google.embedding("gemini-embedding-001") returns.
  -- Changing this width means re-ingesting every chunk.
  "embedding"      vector(768),
  "created_at"     timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "note_chunks_topic_index_idx"
  ON "note_chunks" ("topic_id", "chunk_index");
CREATE INDEX IF NOT EXISTS "note_chunks_module_idx" ON "note_chunks" ("module_code");
-- HNSW over COSINE distance, because retrieval ranks with the <=> operator.
-- An ivfflat or l2 index here would be quietly wrong rather than merely slow.
CREATE INDEX IF NOT EXISTS "note_chunks_embedding_idx"
  ON "note_chunks" USING hnsw ("embedding" vector_cosine_ops);


-- ---- tutor spending budget --------------------------------------------------
-- The counter is in the database so the budget survives a restart or a cold
-- start; in memory it would hand back a fresh allowance every time the
-- process cycled.
CREATE TABLE IF NOT EXISTS "ai_usage" (
  "id"                text PRIMARY KEY NOT NULL,
  "user_id"           text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "window_started_at" timestamp DEFAULT now() NOT NULL,
  "count"             integer DEFAULT 1 NOT NULL,
  "updated_at"        timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_user_id_idx" ON "ai_usage" ("user_id");
CREATE INDEX IF NOT EXISTS "ai_usage_updated_at_idx" ON "ai_usage" ("updated_at");