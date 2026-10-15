import { defineRelationsPart } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * PRACTICE — the question catalogue and the reader's record of it
 * ------------------------------------------------------------
 * Two tables, and the split between them is the design.
 *
 * `practice_questions` is GLOBAL CONTENT, in the same category as
 * `note_topics` and `note_chunks`: written once by an author, identical
 * for every reader, never mutated at runtime. It is read-only to the app
 * role, and entitlement is a `module_code` filter in SQL rather than an
 * RLS policy — the same reasoning that keeps `note_chunks` out of
 * create-rls-policies.mjs, which explains at length why a policy that
 * could be bypassed with one set_config() is decoration.
 *
 * `practice_attempts` is PER-READER STATE, in the same category as
 * `chat_threads`: written at runtime, private, protected by an RLS
 * policy keyed on the reader.
 *
 * WHY NOT ONE TABLE, given the catalogue is the point of the feature:
 * the corpus and the reader's history have opposite lifecycles,
 * opposite privilege, and opposite ownership. Merging them would mean
 * either a nullable `user_id` on every question — so that "questions I
 * have not seen" needs `WHERE user_id IS NULL` to mean anything — or a
 * copy of the corpus per reader, which multiplies content by the user
 * count and makes an edit to a question a migration. Splitting them also
 * means a re-import of the catalogue cannot touch history, which is the
 * property that makes rolling updates safe at all.
 *
 * ------------------------------------------------------------------------
 * `practice_questions.id` IS STABLE FOREVER, and everything else here is
 * downstream of that.
 *
 * The id is authored in `apps/web/src/content/practice-questions.ts` and
 * is never generated. A reader's history is a list of these strings, and
 * B3's whole premise — a weakness profile that improves over time — is
 * meaningless if the identifiers move. Reordering the file, rewording a
 * prompt, changing a difficulty, or re-importing the whole catalogue must
 * all leave every reader's record intact, which is why the importer
 * upserts on this column and never on a surrogate.
 *
 * Renaming an id is deleting one question and adding another, which is
 * exactly what it is, and exactly what the reader's history will see.
 * ------------------------------------------------------------------------
 */

/**
 * The three formats.
 *
 * An enum rather than a free string so a typo is a write that fails
 * instead of a row the grading layer cannot interpret. Adding a fourth
 * format means adding a value here AND a branch in the grader; nothing
 * else changes.
 */
export const practiceFormat = pgEnum("practice_format", [
  "multiple-choice",
  "application",
  "proof-order",
]);

/**
 * How an attempt went.
 *
 * `partial` exists for proof-order, and it is the state the whole
 * three-colour design turns on: every piece the reader placed was
 * genuinely part of the proof, but not all of them were in the right
 * place. That is a sequencing failure, which is a DIFFERENT mistake from
 * choosing a line that does not belong, and collapsing the two into one
 * "incorrect" would teach the reader nothing about which went wrong.
 *
 * A multiple-choice or application attempt is never `partial`: there is
 * no partial credit on either, deliberately — see the grading note below.
 */
export const practiceOutcome = pgEnum("practice_outcome", ["correct", "incorrect", "partial"]);

export const practiceQuestions = pgTable(
  "practice_questions",
  {
    /**
     * The authored, permanent identifier. See the note above: this is the
     * column the whole rolling-update story rests on.
     */
    id: text("id").primaryKey(),

    /** Which grader applies. Read from the row, never inferred from the spec's shape. */
    format: practiceFormat("format").notNull(),

    /**
     * Denormalised from the module rather than joined in.
     *
     * Not a shortcut. Entitlement needs `WHERE module_code = ANY($owned)`
     * on EVERY question read, on the hot path, and a join to `purchases`
     * to answer it would put a purchase check in the middle of rendering a
     * practice set. The cost is that a module code rename needs a catalogue
     * edit, which is a pull request and therefore visible.
     */
    moduleCode: text("module_code").notNull(),

    /** The topic this question belongs to. Must exist in MODULE_TOPICS; checked by the importer. */
    topicSlug: text("topic_slug").notNull(),

    /** 1-4. See the schema in content/practice-questions.ts for why the scale has four points. */
    difficulty: integer("difficulty").notNull(),

    /** The question as shown to the reader. */
    prompt: text("prompt").notNull(),

    /**
     * Free-form topic labels, e.g. `["limits", "epsilon-delta"]`.
     *
     * NOT NULL with no default, and not nullable: B3a's weakness profile
     * is driven entirely by tags, so a question without them is invisible
     * to the feature that justifies the rest of this work.
     */
    tags: text("tags").array().notNull(),

    /**
     * The format-specific payload, holding the options with their
     * explanations, the accepted values with tolerances and the worked
     * solution, or the proof pieces and their true positions.
     *
     * JSONB rather than columns because the three shapes share nothing,
     * and a table wide enough to hold all of them is a table where most
     * cells are NULL and nothing is enforced. The trade is that the
     * contents are not schema-checked by Postgres, which is why the
     * importer validates with the same zod schema the author wrote
     * against — so an unvalidated payload cannot reach this column even
     * by hand.
     */
    spec: jsonb("spec").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Every practice read filters by module first: "questions for modules
    // this reader owns" is the query behind the whole page.
    index("practice_questions_module_idx").on(table.moduleCode),
    // The weakness profile asks for a reader's weak questions by module
    // and difficulty together, and sorts by difficulty to serve the
    // easiest first.
    index("practice_questions_module_difficulty_idx").on(table.moduleCode, table.difficulty),
    // Topic-level reporting and the "revise this lesson" view.
    index("practice_questions_topic_idx").on(table.topicSlug),
    // These two mirror the CHECKs in neon-setup-7-practice.sql, and are
    // written out rather than left to the DDL so a mismatch is visible in
    // a diff instead of at migration time.
    //
    // cardinality(), NOT array_length(): array_length('{}'::text[], 1) is
    // NULL, and a CHECK passes on NULL — so an untagged question went
    // straight through an array_length guard while the SQL still parsed and
    // the table still existed. Found by running the INSERT, not reading it.
    check("practice_questions_difficulty_range", sql`${table.difficulty} BETWEEN 1 AND 4`),
    check("practice_questions_tags_present", sql`cardinality(${table.tags}) >= 1`),
  ],
);

/**
 * What one reader did with one question.
 *
 * Append-only, and deliberately NOT unique on (user_id, question_id): a
 * reader may attempt the same question three times, and those three rows
 * are three data points about what they found difficult. Collapsing them
 * to one row would throw away the only evidence the spaced-repetition
 * feature in B3c has to work with — which is that the second attempt was
 * needed at all.
 */
export const practiceAttempts = pgTable(
  "practice_attempts",
  {
    id: text("id").primaryKey(),

    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /**
     * No foreign key to practice_questions ON DELETE RESTRICT semantics
     * are not expressible here as a cascade, and this is deliberate: a
     * cascade would delete a reader's history when the author retires a
     * question, which is the exact event that history exists to survive.
     * The referential constraint still holds, so a row can never point at
     * a question that does not exist; removing one requires clearing its
     * attempts first, which is a visible act.
     */
    questionId: text("question_id")
      .notNull()
      .references(() => practiceQuestions.id, { onDelete: "restrict" }),

    /** Copied from the question so history survives the question being edited. */
    format: practiceFormat("format").notNull(),

    outcome: practiceOutcome("outcome").notNull(),

    /**
     * What the reader actually did, format-shaped: the option id chosen,
     * the numeric value typed, or the per-piece placement that produced a
     * three-colour result.
     *
     * Stored so a later grade can be RECOMPUTED without asking the reader
     * again. If the grading rule improves, attempts graded under the old
     * rule can be re-judged from this — which is only possible because the
     * answer is kept rather than only the verdict.
     */
    detail: jsonb("detail").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // The weakness profile is "every attempt by this reader", newest first.
    index("practice_attempts_user_idx").on(table.userId),
    // B3c's spaced repetition: "which of this reader's questions did they
    // get wrong, and when was the last attempt". Both columns together,
    // because the query filters on one and sorts on the other.
    index("practice_attempts_user_question_idx").on(table.userId, table.questionId),
    // Aggregate coverage: how many readers have attempted this question.
    index("practice_attempts_question_idx").on(table.questionId),
  ],
);

/**
 * The reader-facing relation set.
 *
 * Only the user -> attempts direction is declared here, for the same
 * reason modules.ts declares only half of its own pair: the question ->
 * attempts direction is not read anywhere yet, and declaring it would
 * invite a query that walks from a global question into a reader's
 * history without going through an entitlement check.
 */
export const practiceRelations = defineRelationsPart(
  { user, practiceQuestions, practiceAttempts },
  (r) => ({
    user: {
      practiceAttempts: r.many.practiceAttempts({
        from: r.user.id,
        to: r.practiceAttempts.userId,
      }),
    },
    practiceQuestions: {},
    practiceAttempts: {
      user: r.one.user({
        from: r.practiceAttempts.userId,
        to: r.user.id,
      }),
    },
  }),
);

/* Re-exported so callers never import drizzle internals for these. */
export type PracticeQuestionsRow = typeof practiceQuestions.$inferSelect;
export type PracticeAttemptsRow = typeof practiceAttempts.$inferSelect;
export type NewPracticeAttempt = typeof practiceAttempts.$inferInsert;
export type PracticeFormatValue = (typeof practiceFormat.enumValues)[number];
export type PracticeOutcomeValue = (typeof practiceOutcome.enumValues)[number];