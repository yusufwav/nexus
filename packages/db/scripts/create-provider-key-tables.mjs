/**
 * Applies the provider_keys DDL directly.
 *
 * `pnpm db:push` is the supported path and is what should be used
 * wherever drizzle-kit runs; it does not run on this machine (see
 * IDEAS/TODO.md). The schema in src/schema stays the source of truth
 * either way. Every statement is IF NOT EXISTS, so this is safe to
 * re-run and touches no existing rows.
 *
 * The one thing that is NOT negotiable is that no column here holds a
 * plaintext credential. If you find yourself adding one, the answer is
 * to stop.
 *
 * THIS FILE CREATES THE ORIGINAL EIGHT COLUMNS. Custom routing added
 * `kind`, `name` and `base_url` plus the whole `provider_models` table,
 * and those live in create-custom-provider-tables.mjs - run it after this
 * one. They are split rather than folded in so that a reader whose
 * database predates the feature can apply them without recreating
 * anything, which is the only situation they are useful in.
 *
 * Run from packages/db:
 *   node scripts/create-provider-key-tables.mjs
 *   node scripts/create-custom-provider-tables.mjs
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "provider_keys" (
     "id" text PRIMARY KEY NOT NULL,
     "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "provider" text NOT NULL,
     "label" text DEFAULT '' NOT NULL,
     "encrypted_key" text NOT NULL,
     "last_four" text NOT NULL,
     "model_id" text NOT NULL,
     "created_at" timestamp DEFAULT now() NOT NULL,
     "updated_at" timestamp DEFAULT now() NOT NULL
   )`,

  // One credential per provider per reader, so pasting a rotated key
  // replaces the old one rather than accumulating indistinguishable rows.
  `CREATE UNIQUE INDEX IF NOT EXISTS "provider_keys_user_provider_idx"
     ON "provider_keys" ("user_id", "provider")`,
  `CREATE INDEX IF NOT EXISTS "provider_keys_user_idx"
     ON "provider_keys" ("user_id")`,
];

const client = new Client({ connectionString: url });

try {
  await client.connect();
  for (const stmt of STATEMENTS) {
    await client.query(stmt);
    console.log("ok:", stmt.trim().split("\n")[0].slice(0, 60));
  }
  console.log("\nprovider_keys is ready.");
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}