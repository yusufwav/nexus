/**
 * Applies the custom-routing DDL directly.
 *
 * `pnpm db:push` is the supported path and is what should be used
 * wherever drizzle-kit runs; it does not run on this machine (see
 * IDEAS/TODO.md). The schema in src/schema stays the source of truth
 * either way, and this file mirrors neon-setup-8-custom-providers.sql so
 * the local database and a hosted one end up identical.
 *
 * Every statement is IF NOT EXISTS, so re-running is safe and touches no
 * existing rows. The two ADD CONSTRAINT statements drop before they add,
 * which is what makes them re-runnable too - a bare ADD CONSTRAINT has no
 * IF NOT EXISTS and fails the second time.
 *
 * The one thing that is NOT negotiable is that no column here holds a
 * plaintext credential. If you find yourself adding one, the answer is
 * to stop.
 *
 * Run from packages/db:
 *   node scripts/create-custom-provider-tables.mjs
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const STATEMENTS = [
  // ---- provider_keys: the reader's own endpoint --------------------------
  `ALTER TABLE "provider_keys" ADD COLUMN IF NOT EXISTS "kind" text NOT NULL DEFAULT 'builtin'`,
  `ALTER TABLE "provider_keys" ADD COLUMN IF NOT EXISTS "name" text NOT NULL DEFAULT ''`,
  `ALTER TABLE "provider_keys" ADD COLUMN IF NOT EXISTS "base_url" text`,

  /*
   * The relationship between the three columns, stated in the database
   * rather than only in the route handler. It is the one invariant that
   * stops a row from being a custom provider with nowhere to send
   * requests, or a built-in one carrying a URL that never went through
   * validateCustomProviderUrl.
   */
  `ALTER TABLE "provider_keys" DROP CONSTRAINT IF EXISTS "provider_keys_kind_address"`,
  `ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_kind_address" CHECK (
     ("kind" = 'custom' AND "base_url" IS NOT NULL AND "base_url" <> '')
     OR ("kind" = 'builtin' AND "base_url" IS NULL)
   )`,

  // https only, as a cheap second line. NOT a substitute for the app's
  // check, which resolves DNS and rejects private ranges - neither of
  // which a CHECK can do - but worth having against anything that wrote
  // the row without going through the route.
  `ALTER TABLE "provider_keys" DROP CONSTRAINT IF EXISTS "provider_keys_base_url_https"`,
  `ALTER TABLE "provider_keys" ADD CONSTRAINT "provider_keys_base_url_https" CHECK (
     "base_url" IS NULL OR "base_url" LIKE 'https://%'
   )`,

  // ---- provider_models: the catalogue on that endpoint --------------------
  `CREATE TABLE IF NOT EXISTS "provider_models" (
     "id"         text PRIMARY KEY NOT NULL,
     "user_id"    text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "provider"   text NOT NULL,
     "model_id"   text NOT NULL,
     "source"     text NOT NULL DEFAULT 'custom',
     "created_at" timestamp DEFAULT now() NOT NULL,
     CONSTRAINT "provider_models_source_known" CHECK ("source" IN ('free', 'custom'))
   )`,

  // Re-pulling the free tier is an upsert rather than an accumulating pile
  // of duplicates the picker then has to de-duplicate in the browser.
  `CREATE UNIQUE INDEX IF NOT EXISTS "provider_models_user_provider_model_idx"
     ON "provider_models" ("user_id", "provider", "model_id")`,
  `CREATE INDEX IF NOT EXISTS "provider_models_user_provider_idx"
     ON "provider_models" ("user_id", "provider")`,

  /*
   * No foreign key from `provider` to provider_keys on purpose: a built-in
   * provider's models live in OpenRouter's catalogue rather than here, and
   * the two sources are resolved in apps/web/src/lib/providers.ts rather
   * than joined. That leaves the column able to name a provider that does
   * not exist, which is exactly why the policy below is load-bearing
   * rather than belt-and-braces - a reader who could see another reader's
   * rows could put a model id of their own onto a provider of theirs.
   *
   * `app_reader_id()` is created by create-rls-policies.mjs and by
   * neon-setup-4-rls.sql. If it does not exist yet, this fails with
   * "function does not exist", which is a useful failure: it means the
   * RLS pass has not been run, and creating this table without it would
   * leave the catalogue readable by anything holding a connection.
   */
  `ALTER TABLE "provider_models" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "provider_models" FORCE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS provider_models_reader ON "provider_models"`,
  `CREATE POLICY provider_models_reader ON "provider_models"
     FOR ALL TO public
     USING      (user_id = app_reader_id())
     WITH CHECK (user_id = app_reader_id())`,
];

const client = new Client({ connectionString: url });

try {
  await client.connect();
  for (const stmt of STATEMENTS) {
    await client.query(stmt);
    console.log("ok:", stmt.trim().split("\n")[0].slice(0, 62));
  }

  /*
   * The privilege the app role needs. Granted here rather than only in
   * create-app-role.mjs because a reader who runs this against their own
   * database should not then have to discover the missing grant as a 42501
   * on the first button they press.
   */
  await client.query(
    `DO $$ BEGIN
       IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_app') THEN
         EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON "provider_models" TO nexus_app';
         RAISE NOTICE 'granted on provider_models to nexus_app';
       END IF;
     END $$`,
  );

  const flags = await client.query(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in ('provider_keys','provider_models')
      order by c.relname`,
  );
  console.log("\ntable                rls   forced");
  for (const r of flags.rows) {
    console.log(`  ${r.relname.padEnd(18)} ${String(r.relrowsecurity).padEnd(5)} ${r.relforcerowsecurity}`);
  }

  console.log("\ncustom routing is ready.");
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}