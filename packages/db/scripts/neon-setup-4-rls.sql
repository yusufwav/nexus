-- ============================================================================
-- NEXUS — PRODUCTION SCHEMA, PART 4 of 5: row-level security
-- ============================================================================
-- Run AFTER part 3, and BEFORE part 5. Creating the app role first would leave
-- a window where the role exists but the policies do not.
--
-- WHAT THIS ACTUALLY BUYS, stated plainly so it is not oversold:
--
--   It makes an application BUG fail closed. A query that forgets its
--   `where user_id` returns nothing instead of another reader's rows.
--   That is the realistic accident, and it is the one worth defending against.
--
--   It makes a READ-ONLY leak useless. A read replica, a backup opened by a
--   support tool, or an analytics process sees no rows without an identity.
--
-- WHAT IT DOES NOT BUY: it is not a defence against SQL injection. Anything
-- able to run `set_config('app.user_id', ...)` can pick its own identity. For
-- the credential specifically that is acceptable, because the real protection
-- is upstream and cryptographic: provider_keys.encrypted_key is ciphertext and
-- the sealing key is not in this database.
--
-- The identity is a transaction-local setting, set by withReader() in
-- packages/db/src/reader.ts with set_config(..., true) so it is gone on commit
-- and cannot leak to the next borrower of a pooled connection.
-- ============================================================================


-- ---- the identity a policy sees ---------------------------------------------
-- Returns NULL when no reader is set, and every policy below treats NULL as
-- "nobody". That is the fail-closed default: a query that forgets to set an
-- identity returns nothing rather than everything.
--
-- Written on ONE LINE and without a trailing semicolon inside the body, because
-- this is the only statement in these four files that needs quoting at all. A
-- web SQL editor that splits pasted text on ";" would otherwise cut the body
-- in half and send the fragments separately. The body is a single expression
-- with no internal semicolon, so the statement can only end where it should.
CREATE OR REPLACE FUNCTION app_reader_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$;


-- ---- provider_keys ----------------------------------------------------------
-- A credential per reader. The WITH CHECK half is what stops a caller that
-- somehow passed another reader's id from writing a row for them: the insert
-- is rejected rather than stored.
--
-- This table now also carries a reader's own endpoints (kind/name/base_url),
-- so it decides where the server is willing to make requests. The shape is
-- unchanged; what it protects is bigger.
ALTER TABLE "provider_keys" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_keys" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_keys_reader ON "provider_keys";
CREATE POLICY provider_keys_reader ON "provider_keys"
  FOR ALL TO public
  USING      (user_id = app_reader_id())
  WITH CHECK (user_id = app_reader_id());


-- ---- provider_models --------------------------------------------------------
-- The catalogue a reader built for their own custom provider, and the table the
-- tutor's `hasProviderModel` check reads before it will call anything. A row
-- names a model id and a provider slug, so a reader who could read another
-- reader's catalogue could get their own model id onto another reader's
-- provider - which is the one thing custom routing must not allow.
--
-- Same shape as provider_keys, and the WITH CHECK half matters for the same
-- reason. The `provider` column has no foreign key on purpose (a built-in
-- provider's models live in OpenRouter's catalogue, not here), so this policy
-- is the only thing separating "my provider" from "somebody else's".
ALTER TABLE "provider_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provider_models" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS provider_models_reader ON "provider_models";
CREATE POLICY provider_models_reader ON "provider_models"
  FOR ALL TO public
  USING      (user_id = app_reader_id())
  WITH CHECK (user_id = app_reader_id());


-- ---- purchases -------------------------------------------------------------
-- Entitlement. A bug here hands over paid content, which is why this table is
-- policy-protected rather than relying on the query alone.
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "purchases" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS purchases_reader ON "purchases";
CREATE POLICY purchases_reader ON "purchases"
  FOR ALL TO public
  USING      (user_id = app_reader_id())
  WITH CHECK (user_id = app_reader_id());


-- ---- chat_threads -----------------------------------------------------------
ALTER TABLE "chat_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_threads" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_threads_reader ON "chat_threads";
CREATE POLICY chat_threads_reader ON "chat_threads"
  FOR ALL TO public
  USING      (user_id = app_reader_id())
  WITH CHECK (user_id = app_reader_id());


-- ---- chat_messages ----------------------------------------------------------
-- No user_id of its own: a message belongs to whoever owns its thread. The
-- subquery reads chat_threads, which is itself policy-guarded by the identical
-- condition, so there is no recursion and no widening.
ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS chat_messages_reader ON "chat_messages";
CREATE POLICY chat_messages_reader ON "chat_messages"
  FOR ALL TO public
  USING (
    EXISTS (SELECT 1 FROM "chat_threads" t
             WHERE t.id = thread_id AND t.user_id = app_reader_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM "chat_threads" t
             WHERE t.id = thread_id AND t.user_id = app_reader_id())
  );


-- ---- practice_attempts ------------------------------------------------------
-- The reader's own answers. Which questions someone got wrong is exactly the
-- kind of thing that follows a person around, and the weakness profile in
-- TODO.md's Track B is built on top of this table, so it is worth protecting
-- before the first row is written rather than after.
--
-- Identical shape to chat_threads: a user_id of its own, keyed on the session
-- identity, NULL meaning nobody.
--
-- It was MISSING from this file while existing in create-rls-policies.mjs,
-- which meant the two deployment paths disagreed. An operator following these
-- SQL files -- the documented Neon SQL-editor route -- created the table with
-- no RLS at all, while check-schema-drift.mjs reported the database as
-- correct, because it compares object NAMES and a policy is not one it looks
-- for.
--
-- ANY future per-reader table needs its policy in BOTH files. They are two
-- copies of one list and nothing asserts they agree, which is why this drifted.
ALTER TABLE "practice_attempts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "practice_attempts" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS practice_attempts_reader ON "practice_attempts";
CREATE POLICY practice_attempts_reader ON "practice_attempts"
FOR ALL TO public
USING (user_id = app_reader_id())
WITH CHECK (user_id = app_reader_id());
-- ---- Better Auth's tables: RLS DISABLED, deliberately -----------------------
-- On a Supabase-shaped database these arrive ENABLED with NO POLICIES. That is
-- harmless while the app connects as a role carrying BYPASSRLS, and it is a
-- trap rather than a protection: enabled with nothing to satisfy it means
-- DENY EVERYTHING to any other role. Pointing the app at nexus_app made
-- sign-up fail with:
--     new row violates row-level security policy for table "user"
-- So they are turned OFF here.
--
-- This is not a security regression. These tables hold no credential material:
-- a session row is keyed by a token that is already hashed, and a user row is
-- an email and a display name.
--
-- The alternative - hand-written policies on Better Auth's tables - is a trap
-- for a different reason: `pnpm auth:generate` regenerates them from Better
-- Auth's own CLI and would silently drop them, leaving sign-in broken in
-- production with nothing in the diff to explain it.
--
-- These statements are safe to run even when session / account / verification
-- do not exist yet, because that is what IF EXISTS is for.
ALTER TABLE IF EXISTS "user" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "user" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "session" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "session" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "account" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "account" DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "verification" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS "verification" DISABLE ROW LEVEL SECURITY;


-- ---- DELIBERATELY NO POLICY -------------------------------------------------
-- modules      the catalogue is meant to be readable; gating it would break
--               the public pages for no gain.
-- note_topics  entitlement here is a JOIN across purchases and modules.
-- note_chunks  same, plus the ingestion scripts write these as the owner and
--               FORCE would lock them out of their own tables. Their access is
--               the `module_code = ANY(...)` filter inside the query.
--
-- A policy that could be bypassed with one set_config() would be decoration,
-- so these are left to the query layer and named here rather than implied.