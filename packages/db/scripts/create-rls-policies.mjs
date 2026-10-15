/**
 * ROW-LEVEL SECURITY on the per-reader tables
 *
 * `pnpm db:push` is the supported path and does not run on this machine
 * (see IDEAS/TODO.md). Every statement here is idempotent, so this is
 * safe to re-run and it touches no rows.
 *
 * WHY THIS IS A SEPARATE SCRIPT: RLS is not expressible in the drizzle
 * schema, and pretending otherwise hides it. The tables stay exactly as
 * declared in src/schema.
 *
 * WHICH TABLES, AND WHY NOT THE OTHERS
 *
 *   enabled here
 *     provider_keys   a credential per reader. Highest value target.
 *     purchases       entitlement. A bug here hands over paid content.
 *     chat_threads    private transcripts, personal to one reader.
 *     chat_messages   same, reached through its thread.
 *     practice_attempts
 *                     the reader's own answers, personal to one reader.
 *
 *   deliberately NOT enabled
 *     modules         the catalogue is meant to be readable. Gating it
 *                     would break the public pages for no gain.
 *     user, session, account, verification
 *                     RLS DISABLED here, deliberately. They arrive enabled
 *                     with NO policies, which denies everything to any role
 *                     without BYPASSRLS - and sign-up then fails with 'new
 *                     row violates row-level security policy for table user'.
 *                     They hold no credentials (a session row is keyed by a
 *                     hashed token; a user row is an email), and hand-written
 *                     policies would be silently wiped by the next
 *                     `auth:generate`.
 *     rateLimit         left alone: a counter keyed by a hashed path.
 *     note_topics,
 *     note_chunks
 *                     Entitlement here is a JOIN (purchases -> modules,
 *                     or has_trial_pdf for the free tier), and RLS cannot
 *                     express it cleanly: the ingestion scripts write
 *                     these as the table owner, and FORCE would lock
 *                     them out with no honest way back in. A policy that
 *                     could be bypassed with one set_config() would be
 *                     decoration. The queries filter inside SQL instead,
 *                     and this script says so out loud rather than
 *                     implying coverage it does not have.
 *
 * THE HONEST LIMIT
 *
 * RLS keyed on a session setting is not a defence against SQL injection:
 * anything that can run `set_config('app.user_id', ...)` can pick its own
 * identity. What it does buy is that a forgotten `where user_id` fails
 * CLOSED, and that a read-only process sees nothing. For the credential
 * itself the real protection is upstream and cryptographic - a dump of
 * provider_keys is ciphertext, and the sealing key is not in the database.
 *
 * Run from packages/db:
 *   node scripts/create-rls-policies.mjs
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const STATEMENTS = [
  // The identity a policy sees. NULL when no reader is set, which every
  // policy below treats as "nobody" - that is the fail-closed default.
  `CREATE OR REPLACE FUNCTION app_reader_id() RETURNS text
     LANGUAGE sql STABLE
     AS $$ SELECT nullif(current_setting('app.user_id', true), '') $$`,

  // ---- provider_keys -------------------------------------------------
  `ALTER TABLE "provider_keys" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "provider_keys" FORCE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS provider_keys_reader ON "provider_keys"`,
  `CREATE POLICY provider_keys_reader ON "provider_keys"
     FOR ALL TO public
     USING      (user_id = app_reader_id())
     WITH CHECK (user_id = app_reader_id())`,

  // ---- purchases -----------------------------------------------------
  `ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "purchases" FORCE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS purchases_reader ON "purchases"`,
  `CREATE POLICY purchases_reader ON "purchases"
     FOR ALL TO public
     USING      (user_id = app_reader_id())
     WITH CHECK (user_id = app_reader_id())`,

  // ---- chat_threads --------------------------------------------------
  `ALTER TABLE "chat_threads" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "chat_threads" FORCE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS chat_threads_reader ON "chat_threads"`,
  `CREATE POLICY chat_threads_reader ON "chat_threads"
     FOR ALL TO public
     USING      (user_id = app_reader_id())
     WITH CHECK (user_id = app_reader_id())`,

  // ---- chat_messages -------------------------------------------------
  // No user_id of its own: a message belongs to whoever owns its thread.
  // The subquery reads chat_threads, which is itself policy-guarded by the
  // identical condition, so there is no recursion and no widening.
  `ALTER TABLE "chat_messages" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "chat_messages" FORCE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS chat_messages_reader ON "chat_messages"`,
  `CREATE POLICY chat_messages_reader ON "chat_messages"
     FOR ALL TO public
     USING (
       EXISTS (SELECT 1 FROM "chat_threads" t
                WHERE t.id = thread_id AND t.user_id = app_reader_id())
     )
     WITH CHECK (
       EXISTS (SELECT 1 FROM "chat_threads" t
                WHERE t.id = thread_id AND t.user_id = app_reader_id())
     )`,

  // ---- practice_attempts ------------------------------------------------
  // Identical shape to chat_threads: one reader's record of their own
  // attempts, and nothing else. practice_questions is NOT listed, for the
  // same reason note_chunks is not -- it is global authored content whose
  // entitlement is a module filter in SQL, and a policy that one
  // set_config() could satisfy would be decoration.
  `ALTER TABLE "practice_attempts" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "practice_attempts" FORCE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS practice_attempts_reader ON "practice_attempts"`,
  `CREATE POLICY practice_attempts_reader ON "practice_attempts"
     FOR ALL TO public
     USING      (user_id = app_reader_id())
     WITH CHECK (user_id = app_reader_id())`,

  /*
   * ---- Better Auth's four tables -------------------------------------
   *
   * `user`, `session`, `account` and `verification` arrive with RLS
   * ALREADY ENABLED and NO POLICIES AT ALL. That was harmless while the
   * app connected as a role carrying BYPASSRLS, which ignores the whole
   * mechanism — and it is a trap rather than a protection: enabled with
   * nothing to satisfy it means DENY EVERYTHING to any other role.
   *
   * It surfaced the moment the app was pointed at nexus_app. Sign-up
   * failed with:
   *
   *   new row violates row-level security policy for table "user"
   *
   * and the sign-in/session tables would have failed the same way. So the
   * options are to write real policies for four tables Better Auth owns
   * (and which it may re-generate on the next `auth:generate`, wiping
   * them), or to turn RLS OFF on them and accept that they are unprotected
   * at the database layer.
   *
   * The second is chosen deliberately, and it is not a security
   * regression: these tables hold no credential material. A `session` row
   * is referenced by a token that is already hashed, a `user` row is an
   * email and a display name. The RLS that matters — provider_keys,
   * purchases, chat_* — is above, and note_chunks/note_topics are guarded
   * by their query filter with no policy at all.
   *
   * `rateLimit` never had RLS and is a counter table keyed by a hashed
   * request path; it is left as it is.
   *
   * The alternative — hand-written policies on Better Auth's tables — is
   * a trap for a different reason: `pnpm auth:generate` regenerates the
   * schema from Better Auth's CLI and would silently drop them, leaving
   * sign-in broken in production with nothing in the diff to explain it.
   */
  `ALTER TABLE "user" NO FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE "user" DISABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "session" NO FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE "session" DISABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "account" NO FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE "account" DISABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "verification" NO FORCE ROW LEVEL SECURITY`,
  `ALTER TABLE "verification" DISABLE ROW LEVEL SECURITY`,
];

const client = new Client({ connectionString: url });

try {
  await client.connect();

  for (const stmt of STATEMENTS) {
    await client.query(stmt);
    console.log("ok:", stmt.trim().split("\n")[0].slice(0, 64));
  }

  // ---- is any of it actually in force? ------------------------------
  // Two different roles bypass RLS and it is easy to check only the
  // first: superusers always bypass, and so does any role carrying the
  // BYPASSRLS attribute — which is exactly what Supabase's `postgres`
  // role has. A check that only looks at rolsuper reports "in force" on
  // a database where the policies are doing nothing at all.
  const me = await client.query(
    `select current_user as u, rolsuper, rolbypassrls
       from pg_roles where rolname = current_user`,
  );
  const role = me.rows[0];
  const bypasses = role?.rolsuper === true || role?.rolbypassrls === true;

  const flags = await client.query(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('provider_keys','purchases','chat_threads','chat_messages',
                          'note_chunks','note_topics','modules')
      order by c.relname`,
  );
  console.log("\ntable                 rls   forced");
  for (const r of flags.rows) {
    console.log(
      `  ${r.relname.padEnd(20)} ${String(r.relrowsecurity).padEnd(5)} ${r.relforcerowsecurity}`,
    );
  }

  console.log();
  if (bypasses) {
    const why = role.rolsuper ? "a SUPERUSER" : "carries BYPASSRLS";
    console.log(
      `NOTE: this connection is ${why}, which bypasses RLS entirely.\n` +
        "      The policies are installed and correct, but inert while the app\n" +
        "      connects as this role. They bite once DATABASE_URL uses a role\n" +
        "      that is neither a superuser nor BYPASSRLS - which is the normal\n" +
        "      case on a hosted database. Nothing to do here; just do not read\n" +
        "      this as 'armed'.",
    );
  } else {
    console.log("Connected as a role subject to RLS, so these policies are in force.");
  }

  console.log("\nrow-level security is in place.");
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}