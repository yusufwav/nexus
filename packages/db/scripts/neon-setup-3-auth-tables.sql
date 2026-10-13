-- ============================================================================
-- NEXUS — PRODUCTION SCHEMA, PART 3 of 5: Better Auth's own tables
-- ============================================================================
--
-- Run AFTER part 2 and BEFORE part 5 (the app role).
--
-- WHY THIS EXISTS, AND IT IS AN ORDERING TRAP AVOIDED
--
-- Better Auth creates session / account / verification itself, on the first
-- request that needs them. That left two problems:
--
--   1. You cannot GRANT on a table that does not exist. So part 5 could not
--      grant nexus_app access to them, and the first sign-in would have
--      failed with "permission denied for table session" — after you had
--      already pointed DATABASE_URL at the restricted role.
--   2. To work around that by hand you would have to sign up once as the
--      owner, then grant, then switch. Doable, but it means the app briefly
--      runs over-privileged, and it is easy to forget the second step.
--
-- So they are created here instead, from the schemas Better Auth's CLI
-- generates. This is the same DDL `pnpm auth:generate` would emit — see
-- packages/db/src/schema/auth.ts, which stays the source of truth.
--
-- Better Auth's CREATE TABLE IF NOT EXISTS then makes these a no-op at
-- runtime: the app asks for a table that already exists and carries on.
--
-- RLS on these is explicitly NOT enabled. See part 4.
-- ============================================================================


-- ---- session ----------------------------------------------------------------
-- `token` is stored HASHED, not raw: the cookie carries the plaintext token
-- and the database holds only its hash, so a dump of this table cannot be
-- replayed as a session.
CREATE TABLE IF NOT EXISTS "session" (
  "id"         text PRIMARY KEY NOT NULL,
  "expires_at" timestamp NOT NULL,
  "token"      text NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "user_id"    text NOT NULL REFERENCES "user"("id") ON DELETE cascade
);
CREATE UNIQUE INDEX IF NOT EXISTS "session_token_key" ON "session" ("token");
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("user_id");


-- ---- account ----------------------------------------------------------------
-- Only used for OAuth/social providers. emailAndPassword is the only method
-- enabled in packages/auth, so every row here will be null today — the table
-- exists because Better Auth's session lookup joins against it.
CREATE TABLE IF NOT EXISTS "account" (
  "id"                       text PRIMARY KEY NOT NULL,
  "account_id"               text NOT NULL,
  "provider_id"              text NOT NULL,
  "user_id"                  text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "access_token"             text,
  "refresh_token"            text,
  "id_token"                 text,
  "access_token_expires_at"  timestamp,
  "refresh_token_expires_at" timestamp,
  "scope"                    text,
  "password"                 text,
  "created_at"               timestamp DEFAULT now() NOT NULL,
  "updated_at"               timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("user_id");


-- ---- verification -----------------------------------------------------------
-- Email verification tokens. Every account currently sits at
-- email_verified = false and no mail is sent, so this stays empty until an
-- email provider is wired up.
CREATE TABLE IF NOT EXISTS "verification" (
  "id"         text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value"      text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");


-- ---- rateLimit --------------------------------------------------------------
-- Better Auth's own limiter, backed by the database so the budget survives a
-- restart. This is NOT the tutor's budget — that is ai_usage, created in part 2.
--
-- last_request is BIGINT millisecond epoch, not a timestamp. Better Auth writes
-- Date.now() into it, and a timestamp column here fails at runtime with
-- "value.toISOString is not a function". That is a real error message from
-- Better Auth's own type helper, so it is worth being precise here.
CREATE TABLE IF NOT EXISTS "rateLimit" (
  "id"           text PRIMARY KEY NOT NULL,
  "key"          text NOT NULL,
  "count"        integer NOT NULL,
  "last_request" bigint NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "rateLimit_key_key" ON "rateLimit" ("key");
CREATE INDEX IF NOT EXISTS "rateLimit_key_idx" ON "rateLimit" ("key");