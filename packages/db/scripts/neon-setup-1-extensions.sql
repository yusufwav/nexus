-- ============================================================================
-- NEXUS — PRODUCTION SCHEMA, PART 1 of 4: extensions, types, base tables
-- ============================================================================
--
-- WHY FOUR FILES
--
-- Web SQL editors split pasted text into statements naively, and a `DO $$ ...
-- $$` block contains semicolons inside it. Several editors therefore cut such
-- a block in half and send the fragments separately, which produces
-- `syntax error at or near ...` pointing at something innocent. Nothing in
-- these four files uses dollar-quoting, FOR loops, or DO blocks, so each
-- statement is self-contained and can be split anywhere.
--
-- Conditional work — granting on tables Better Auth has not created yet — is
-- deliberately NOT done here. It needs a DO block, and it is not needed yet:
-- run `create-app-role.mjs` after the first sign-up and it grants them.
--
-- Order across the four files matters:
--   1. extensions + enum types   (note_chunks needs `vector`, modules needs the enums)
--   2. the tables                (children reference parents)
--   3. row-level security        (before the role, never after)
--   4. the application role
--
-- Run each file separately, in order. Every statement is IF NOT EXISTS or
-- equivalent, so a re-run is harmless.
--
-- Columns were read off the local database rather than typed by hand.
-- ============================================================================


-- ---- 1. pgvector ------------------------------------------------------------
-- Required by note_chunks.embedding vector(768) and by the HNSW index.
-- On Neon this is usually already available; if it is, this is a no-op.
CREATE EXTENSION IF NOT EXISTS vector;


-- ---- 2. enum types ----------------------------------------------------------
-- CREATE TYPE has no IF NOT EXISTS. On a fresh database these both succeed.
-- If you re-run and one errors with "already exists", that is fine — carry on.
CREATE TYPE module_status AS ENUM ('available', 'coming-soon');
CREATE TYPE purchase_status AS ENUM ('pending', 'paid', 'refunded');

-- The practice formats and outcomes. Here rather than in
-- neon-setup-7-practice.sql, because a CREATE TABLE naming a type that
-- does not exist yet fails, and the convention in this directory is that
-- setup-1 owns every type.
--
-- `partial` is the state the proof-order design turns on: every piece the
-- reader placed belonged to the proof, but not all were in the right
-- place. That is a different mistake from choosing a line that does not
-- belong, and one "incorrect" value would have thrown the difference away.
CREATE TYPE practice_format AS ENUM ('multiple-choice', 'application', 'proof-order');
CREATE TYPE practice_outcome AS ENUM ('correct', 'incorrect', 'partial');


-- ---- 3. Better Auth's user table -------------------------------------------
-- session / account / verification are created by Better Auth on first
-- sign-up, not here.
CREATE TABLE IF NOT EXISTS "user" (
  "id"             text PRIMARY KEY NOT NULL,
  "name"           text NOT NULL,
  "email"          text NOT NULL,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image"          text,
  -- The reader's chosen palette. Nullable so that NULL can mean "never
  -- chose", which is what lets a new reader fall through to the site
  -- default instead of being pinned to a value nobody picked.
  --
  -- Free text, deliberately NOT an enum or a CHECK constraint. More
  -- palettes are coming and either would make adding one a table
  -- migration applied to production while readers are signed in, purely
  -- to widen an allowed value list. The allowlist lives in
  -- apps/web/src/lib/themes.ts, and a value naming no real theme falls
  -- back to the default rather than being applied.
  "theme"          text,
  "created_at"     timestamp DEFAULT now() NOT NULL,
  "updated_at"     timestamp DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "user_email_key" ON "user" ("email");