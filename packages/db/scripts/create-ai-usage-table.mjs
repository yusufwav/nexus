/**
 * The tutor's spending budget table.
 *
 * `pnpm db:push` is the supported path and does not run on this machine
 * (see IDEAS/TODO.md). Idempotent, so safe to re-run, and it creates
 * nothing but an empty table.
 *
 * WHY NOT BETTER AUTH'S `rateLimit` TABLE
 *
 *   · Different key namespace. Better Auth keys are path-shaped
 *     (`/sign-in/email:127.0.0.1`) and it writes `last_request` as BIGINT
 *     millisecond epoch. Sharing the table means two writers reasoning
 *     about the same rows with different assumptions, and a collision
 *     silently resets one of the two limits.
 *   · Different failure semantics. Better Auth's limiter must fail CLOSED
 *     (it guards credentials); this one must fail OPEN for a reader using
 *     their own key. Encoding both in one table makes that a foot-gun.
 *
 * Run from packages/db:
 *   node scripts/create-ai-usage-table.mjs
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS "ai_usage" (
     "id" text PRIMARY KEY NOT NULL,
     "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
     "window_started_at" timestamp DEFAULT now() NOT NULL,
     "count" integer DEFAULT 1 NOT NULL,
     "updated_at" timestamp DEFAULT now() NOT NULL
   )`,

  // The upsert targets user_id, and it has to be unique for ON CONFLICT
  // to work at all. It is also the only index that matters: the counter
  // is read and written by user_id on every tutor turn.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ai_usage_user_id_idx"
     ON "ai_usage" ("user_id")`,

  // Supports the opportunistic cleanup in consumeAiBudget, which deletes
  // by updated_at. Without it that delete is a sequential scan of every
  // reader's row on every single model call.
  `CREATE INDEX IF NOT EXISTS "ai_usage_updated_at_idx"
     ON "ai_usage" ("updated_at")`,
];

const client = new Client({ connectionString: url });

try {
  await client.connect();
  for (const stmt of STATEMENTS) {
    await client.query(stmt);
    console.log("ok:", stmt.trim().split("\n")[0].slice(0, 60));
  }
  console.log("\nai_usage is ready.");
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}