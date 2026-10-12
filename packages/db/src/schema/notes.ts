import { defineRelationsPart } from "drizzle-orm";
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

import { modules } from "./modules";

/**
 * NOTES — the retrieval corpus behind the AI tutor
 * ------------------------------------------------------------
 * Two tables, and the split is the whole design. `note_topics` is a
 * subject a reader can be pointed at ("Limits and continuity"); a topic
 * is cut into `note_chunks` because an embedding is only useful over a
 * span small enough that one idea survives inside it.
 *
 * THE INVARIANT THIS SCHEMA EXISTS TO PROTECT is that no code path can
 * return a chunk belonging to a module the reader has not bought. It is
 * enforced in one place — the `moduleCode` filter in the retrieval query —
 * and it is why `moduleCode` is DENORMALISED onto `note_chunks` rather
 * than reached through a join to `note_topics`. The filter becomes an
 * indexed `WHERE module_code = ANY(...)` that runs before any ranking,
 * instead of a join evaluated across every candidate row. It is also why
 * nothing below is ever selected into a result the model or the client
 * sees except `title` and `content`.
 *
 * `sourcePath` is server-side bookkeeping. It records where a chunk came
 * from so ingestion can re-read the file and so an operator can trace a
 * bad citation — and it is the one column on this table that must never
 * reach a prompt or a response. A model that has been shown a filename
 * can be asked for it back, and will answer. The reader sees `moduleCode`
 * and `title`, which are display names.
 *
 * WHAT IS NOT HERE: a user id. Notes are global content, not per-user
 * rows. Who may read one is a property of `purchases`, and it is resolved
 * per request — never denormalised onto a note and never cached across
 * users, because a shared cache keyed wrongly here hands one reader
 * another's paid content.
 *
 * The vector column is 768 dimensions, which is what
 * `google.embedding("gemini-embedding-001")` returns. If that model is
 * ever swapped the column has to change and everything re-embedded, so it
 * is worth knowing before writing rather than after.
 */

export const noteTopics = pgTable(
  "note_topics",
  {
    id: text("id").primaryKey(),
    /**
     * Denormalised from `modules.code` deliberately: the retrieval query
     * filters on this, and it must not be a join. There is deliberately
     * no foreign key to `modules.id` — `modules.code` is the human-facing
     * key and is stable, and notes are ingested independently of the
     * catalogue.
     */
    moduleCode: text("module_code").notNull(),
    /** Stable, globally unique. Matches `MODULE_TOPICS[].slug`. */
    slug: text("slug").notNull(),
    /** What the reader is shown. The only name that leaves the server. */
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    /**
     * Where the source file sits, relative to apps/web/private-assets/.
     * NEVER sent to a model or rendered to a client.
     */
    sourcePath: text("source_path").notNull(),
    /** SHA-256 of the extracted text, so re-ingest can skip unchanged files. */
    contentHash: text("content_hash").notNull(),
    pageCount: integer("page_count"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("note_topics_slug_idx").on(table.slug),
    // The ownership filter's index. Module-scoped, so it is the one the
    // `WHERE module_code = ANY(...)` in the retrieval query rides on.
    index("note_topics_module_idx").on(table.moduleCode),
  ],
);

export const noteChunks = pgTable(
  "note_chunks",
  {
    id: text("id").primaryKey(),
    topicId: text("topic_id")
      .notNull()
      .references(() => noteTopics.id, { onDelete: "cascade" }),
    /**
     * Denormalised from `note_topics.moduleCode` on purpose — see the
     * file header. This is the column the entitlement filter reads.
     */
    moduleCode: text("module_code").notNull(),
    /** Position within its topic, so a tool can ask for "more from here". */
    chunkIndex: integer("chunk_index").notNull(),
    /** Nearest heading above the chunk. Gives the model some structure. */
    heading: text("heading"),
    content: text("content").notNull(),
    /**
     * Rough token count. An estimate is enough: it exists so the tool can
     * report how much was read and so ingestion can spot a runaway chunk,
     * not to bill anything.
     */
    tokenEstimate: integer("token_estimate"),
    /**
     * 768 dimensions — `google.embedding("gemini-embedding-001")`.
     * Cosine distance, which is what `<=>` means below.
     */
    embedding: vector("embedding", { dimensions: 768 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("note_chunks_topic_index_idx").on(table.topicId, table.chunkIndex),
    index("note_chunks_module_idx").on(table.moduleCode),
  ],
);

export const notesRelations = defineRelationsPart(
  { noteTopics, noteChunks, modules },
  (r) => ({
    noteTopics: {
      chunks: r.many.noteChunks({
        from: r.noteTopics.id,
        to: r.noteChunks.topicId,
      }),
      module: r.one.modules({
        from: r.noteTopics.moduleCode,
        to: r.modules.code,
      }),
    },
    noteChunks: {
      topic: r.one.noteTopics({
        from: r.noteChunks.topicId,
        to: r.noteTopics.id,
      }),
    },
    modules: {
      topics: r.many.noteTopics({
        from: r.modules.code,
        to: r.noteTopics.moduleCode,
      }),
    },
  }),
);