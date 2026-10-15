-- ---- practice: the question catalogue and the reader's record of it ---------------
-- Two tables with deliberately different privilege, because they are different kinds
-- of thing.
--
--   practice_questions  GLOBAL CONTENT. Authored once, identical for every reader,
--                       never mutated at runtime. READ ONLY to the app role, and
--                       entitlement is a `module_code` filter in SQL rather than an
--                       RLS policy.
--   practice_attempts   PER-READER STATE. Written at runtime, private, RLS-protected.
--
-- The corpus carries no RLS policy, exactly as note_topics and note_chunks do not.
-- That is not an oversight and it is not a gap: create-rls-policies.mjs explains that
-- RLS cannot express the purchases -> modules join cleanly, that ingestion writes as
-- the table owner and FORCE would lock it out with no honest way back, and that "a
-- policy which could be bypassed with one set_config() would be decoration". The
-- queries filter inside SQL instead, and this file says so rather than implying
-- coverage it does not have.
--
-- practice_attempts DOES get a policy -- see create-rls-policies.mjs. It is the same
-- shape as chat_threads: `user_id = app_reader_id()`, and NULL means nobody.

CREATE TABLE IF NOT EXISTS "practice_questions" (
  "id"          text PRIMARY KEY NOT NULL,
  "format"      practice_format NOT NULL,
  -- Denormalised on purpose. Entitlement needs "questions for modules this reader
  -- owns" on every read, and joining purchases to answer it would put an entitlement
  -- check in the middle of rendering a practice set.
  "module_code" text NOT NULL,
  "topic_slug"  text NOT NULL,
  "difficulty"  integer NOT NULL,
  "prompt"      text NOT NULL,
  -- NOT NULL, no default: B3a's weakness profile is driven by tags, so an untagged
  -- question is invisible to the feature that justifies the rest of the work.
  "tags"        text[] NOT NULL,
  -- Format-specific payload. JSONB because the three formats share no shape and a
  -- table wide enough for all of them enforces nothing. Validated with the same zod
  -- schema the author wrote against, on the way in.
  "spec"        jsonb NOT NULL,

  -- Present because the drizzle schema declares them. An earlier draft of
  -- this file omitted them while schema/practice.ts had them, and nothing
  -- noticed until the importer's ON CONFLICT DO UPDATE named updated_at and
  -- Postgres refused the statement. The two must agree, so the timestamps
  -- live here rather than being invented at the call site.
  "created_at"  timestamp DEFAULT now() NOT NULL,
  "updated_at"  timestamp DEFAULT now() NOT NULL,

  CONSTRAINT "practice_questions_difficulty_range" CHECK ("difficulty" BETWEEN 1 AND 4),
  -- cardinality() and NOT array_length(): array_length('{}'::text[], 1) returns NULL,
  -- and a CHECK passes on NULL -- so an untagged question would sail straight
  -- through an array_length guard while the DDL looked correct. cardinality()
  -- returns 0 for the empty array, which is what "no tags" actually means.
  -- Found by running the INSERT rather than reading the SQL.
  CONSTRAINT "practice_questions_tags_present"     CHECK (cardinality("tags") >= 1)
);

CREATE INDEX IF NOT EXISTS "practice_questions_module_idx" ON "practice_questions" ("module_code");
CREATE INDEX IF NOT EXISTS "practice_questions_module_difficulty_idx" ON "practice_questions" ("module_code", "difficulty");
CREATE INDEX IF NOT EXISTS "practice_questions_topic_idx" ON "practice_questions" ("topic_slug");

CREATE TABLE IF NOT EXISTS "practice_attempts" (
  "id"          text PRIMARY KEY NOT NULL,
  "user_id"     text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  -- RESTRICT, not CASCADE. A cascade would delete a reader's history at the exact
  -- moment the author retires a question, which is the event history exists to
  -- survive. Removing a question requires clearing its attempts first -- a visible act.
  "question_id" text NOT NULL REFERENCES "practice_questions"("id") ON DELETE restrict,
  -- Copied so history survives the question being edited.
  "format"      practice_format NOT NULL,
  "outcome"     practice_outcome NOT NULL,
  -- The answer, not just the verdict, so a later grade can be recomputed without
  -- asking the reader again.
  "detail"      jsonb NOT NULL,
  "created_at"  timestamp DEFAULT now() NOT NULL
);

-- Append-only. Deliberately NOT unique on (user_id, question_id): three attempts at
-- one question are three data points, and collapsing them throws away the only
-- evidence B3c's spaced repetition has -- that the second attempt was needed.
CREATE INDEX IF NOT EXISTS "practice_attempts_user_idx" ON "practice_attempts" ("user_id");
CREATE INDEX IF NOT EXISTS "practice_attempts_user_question_idx" ON "practice_attempts" ("user_id", "question_id");
CREATE INDEX IF NOT EXISTS "practice_attempts_question_idx" ON "practice_attempts" ("question_id");