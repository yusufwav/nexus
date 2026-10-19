-- ---- custom routing: a reader's own endpoints and their model lists -----------
-- Two changes, and the order matters: the columns go on before the new table,
-- and the new table's policy goes on in part 4's territory but is created here
-- too so this part is safe to run on its own against a database that already
-- has the app working.
--
-- WHAT THIS BUYS
--   provider_keys.kind / name / base_url   a reader can point the tutor at an
--                                           OpenAI-compatible endpoint they
--                                           name themselves, with their own key
--   provider_models                        the catalogue of model ids on that
--                                           endpoint, which is what the tutor
--                                           route checks a requested model
--                                           against before it calls anything
--
-- WHY THE SLUG IS NOT THE NAME
-- `provider` is a URL path segment in DELETE /api/keys/<provider> and appears in
-- logs. A reader will eventually type a "/" into whatever they call their
-- provider, so the app mints `custom_<24 hex>` server-side and keeps the typed
-- text in `name`, which is never used as an identifier. The CHECK constraint
-- below enforces exactly that split: a custom row cannot carry a name that is
-- not accompanied by a base URL, and a built-in row cannot carry one at all.
--
-- NOTHING PLAINTEXT. The only credential column is `encrypted_key`, which is
-- AES-256-GCM ciphertext under a key that exists nowhere in this database. If
-- you are adding a column here that holds a key in the clear, the answer is to
-- stop.

ALTER TABLE "provider_keys" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'builtin';
ALTER TABLE "provider_keys" ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT '';
ALTER TABLE "provider_keys" ADD COLUMN IF NOT EXISTS "base_url" text;

-- The constraint is a statement about the relationship between the three
-- columns, and it is worth having in the database rather than only in the
-- route handler: it is the one invariant that stops a row from claiming to be
-- a custom provider with nowhere to send requests, or a built-in one with a
-- URL that never went through validateCustomProviderUrl.
ALTER TABLE "provider_keys" DROP CONSTRAINT IF EXISTS "provider_keys_kind_address";
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_kind_address" CHECK (
  ("kind" = 'custom' AND "base_url" IS NOT NULL AND "base_url" <> '')
  OR
  ("kind" = 'builtin' AND "base_url" IS NULL)
);

-- https only, enforced here as well as in the app. Not a substitute for
-- validateCustomProviderUrl - which resolves DNS and rejects private ranges,
-- neither of which a CHECK can do - but a cheap second line against a row
-- written by anything that skipped the route.
ALTER TABLE "provider_keys" DROP CONSTRAINT IF EXISTS "provider_keys_base_url_https";
ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_base_url_https" CHECK (
  "base_url" IS NULL OR "base_url" LIKE 'https://%'
);


-- ---- the model catalogue ----------------------------------------------------
-- One row per (reader, provider, model id).
--
-- `source` distinguishes the two ways a row gets here: 'free' came from a pull
-- of `{baseUrl}/models` filtered to ids ending in `:free`, and 'custom' was
-- typed by a reader for a model that pull cannot see. The refresh REPLACES the
-- free rows and never touches the custom ones, which is only expressible
-- because the two are distinguishable.
CREATE TABLE IF NOT EXISTS "provider_models" (
  "id"         text PRIMARY KEY NOT NULL,
  "user_id"    text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "provider"   text NOT NULL,
  "model_id"   text NOT NULL,
  "source"     text NOT NULL DEFAULT 'custom',
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "provider_models_source_known" CHECK ("source" IN ('free', 'custom'))
);

-- Re-pulling the free tier is an upsert, not an accumulating pile of duplicates
-- that the picker then has to de-duplicate in the browser.
CREATE UNIQUE INDEX IF NOT EXISTS "provider_models_user_provider_model_idx"
  ON "provider_models" ("user_id", "provider", "model_id");
-- The read path: "every model on this provider for this reader".
CREATE INDEX IF NOT EXISTS "provider_models_user_provider_idx"
  ON "provider_models" ("user_id", "provider");

-- No foreign key from `provider` to provider_keys on purpose. A built-in
-- provider's models live in OpenRouter's public catalogue rather than in this
-- table, and the two sources are resolved in apps/web/src/lib/providers.ts
-- rather than joined. The consequence is that this column can name a provider
-- that does not exist, which is why it is useless without the RLS policy below:
-- a reader who could see another reader's rows could put a model id of their
-- own onto a provider of theirs.
ALTER TABLE "provider_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_models" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_models_reader ON "provider_models";
CREATE POLICY provider_models_reader ON "provider_models"
  FOR ALL TO public
  USING      (user_id = app_reader_id())
  WITH CHECK (user_id = app_reader_id());