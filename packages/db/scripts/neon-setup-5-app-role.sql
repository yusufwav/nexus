-- ============================================================================
-- NEXUS — PRODUCTION SCHEMA, PART 5 of 5: the application role
-- ============================================================================
-- Run LAST, after part 4. This role is what DATABASE_URL should point at on
-- Vercel, NOT neondb_owner.
--
-- WHY THIS EXISTS
--
-- Every RLS policy in part 3 is INERT unless the connecting role is subject to
-- RLS. Proven locally rather than assumed: the local `postgres` role carries
-- BYPASSRLS, so a plain `select * from provider_keys` with no reader identity
-- set returned every reader's row while every policy sat in place, enforced,
-- and did nothing.
--
-- Supabase grants BYPASSRLS to postgres for migrations and the dashboard.
-- That is right for an admin and wrong for the role a web request runs as:
-- this process handles strings from the internet.
--
-- WHAT IT CANNOT DO, which matters as much as what it can:
--   no DDL            it cannot alter a table, add a column, or create an index
--   no BYPASSRLS      so the part 3 policies actually bind
--   no CREATE ROLE    so it cannot escalate
--   no vault access   supabase_vault is not granted
--
-- Migrations therefore run as the OWNER connection string, not this one.
-- That is intentional: `db:push` and `create-rls-policies.mjs` both need DDL.
-- ============================================================================


-- ---- create the role --------------------------------------------------------
-- No password is set here on purpose, so the credential never passes through
-- a web form or a shared file. Set it afterwards in Roles, or with
-- create-app-role-password.mjs.
--
-- CREATE ROLE has no IF NOT EXISTS. If it errors with "already exists", that is
-- fine: the grants below are plain GRANTs and re-applying them is harmless.
CREATE ROLE nexus_app LOGIN
  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION;

GRANT USAGE ON SCHEMA public TO nexus_app;


-- ---- read + write -----------------------------------------------------------
-- The per-reader tables the app legitimately mutates. "user" is here because
-- Better Auth writes it.
GRANT SELECT, INSERT, UPDATE, DELETE ON "user" TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "provider_keys" TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "chat_threads" TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "chat_messages" TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ai_usage" TO nexus_app;


-- ---- read only --------------------------------------------------------------
-- purchases is READ ONLY deliberately. There is no checkout, so the app never
-- inserts or updates a purchase; grant-purchase.mjs does that as the owner.
-- Write access here would be pure attack surface for no benefit.
--
-- modules / note_topics / note_chunks are read only for the same reason: the
-- app never ingests notes and never edits the catalogue.
GRANT SELECT ON "purchases" TO nexus_app;
GRANT SELECT ON "modules" TO nexus_app;
GRANT SELECT ON "note_topics" TO nexus_app;
GRANT SELECT ON "note_chunks" TO nexus_app;


-- ---- Better Auth's remaining tables -----------------------------------------
-- These exist already: part 3 creates them, so this GRANT can run.
-- session / account / verification / rateLimit are all read-write for the app,
-- because Better Auth writes sessions on every sign-in and reads rateLimit on
-- every credential request.
GRANT SELECT, INSERT, UPDATE, DELETE ON "session" TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "account" TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "verification" TO nexus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "rateLimit" TO nexus_app;


-- ---- verification -----------------------------------------------------------
-- Expected: nexus_app | super=false | bypassrls=false | createdb=false | createrole=false
--
-- If bypassrls is TRUE, stop. Every policy in part 3 is decorative until it is
-- false, and the whole of this file has achieved nothing.
SELECT rolname, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
  FROM pg_roles WHERE rolname = 'nexus_app';

-- Expected: provider_keys, purchases, chat_threads, chat_messages = true/true
SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS forced
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public' AND c.relkind = 'r'
 ORDER BY c.relname;

-- Expected: vector present
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';