-- ---- content read budget -----------------------------------------------------
-- The counter is in the database for the same reason the tutor's is: a Vercel
-- instance is created constantly, so an in-memory counter hands back a fresh
-- allowance on every cold start and the limit is decorative.
--
-- Note what this table does NOT have: there is no "blocked" state and no
-- failure flag. The budget delays a reader, it never refuses one. A refusal
-- here would be unrecoverable -- there is no link to click, no admin, and no
-- path back in -- which is the failure this whole feature has to avoid. The
-- escalation lives in the returned delay, and a reader who is genuinely
-- misbehaving gets a slower session rather than a locked account.
CREATE TABLE IF NOT EXISTS "read_usage" (
  "id"                text PRIMARY KEY NOT NULL,
  "user_id"           text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "window_started_at" timestamp DEFAULT now() NOT NULL,
  "count"             integer DEFAULT 1 NOT NULL,
  "updated_at"        timestamp DEFAULT now() NOT NULL
);

-- The unique index is what makes the upsert in read-budget.ts safe: the whole
-- decision rides on conflict, so two concurrent requests cannot both read
-- "19 used" and both be admitted as the twentieth.
CREATE UNIQUE INDEX IF NOT EXISTS "read_usage_user_id_idx" ON "read_usage" ("user_id");

-- Supports the opportunistic cleanup of windows nobody is still inside.
CREATE INDEX IF NOT EXISTS "read_usage_updated_at_idx" ON "read_usage" ("updated_at");