import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import type { Database } from ".";
import { withReader } from "./reader";
import { chatMessages, chatThreads } from "./schema/chat";
import { modules, purchases } from "./schema/modules";
import { noteChunks, noteTopics } from "./schema/notes";
import { practiceAttempts, practiceQuestions } from "./schema/practice";
import { providerKeys } from "./schema/provider-keys";

/**
 * READS
 * ------------------------------------------------------------
 * Catalogue queries live here rather than in the app, because this
 * package owns the drizzle dependency. Callers pass the Database
 * returned by createDb().
 *
 * Every function can be treated by a caller as "throw means fall
 * back to the bundled list" — see apps/web/src/lib/modules.ts, which
 * swallows errors so the public pages render with Docker off.
 */

export async function listModules(db: Database) {
  return db.select().from(modules).orderBy(asc(modules.sortOrder));
}

export async function getModuleByCode(db: Database, code: string) {
  const rows = await db.select().from(modules).where(eq(modules.code, code)).limit(1);
  return rows[0] ?? null;
}

/**
 * Course codes the user has paid for. Pending and refunded rows do not count.
 *
 * Runs inside `withReader`, so the RLS identity is set for this query and
 * `purchases` is unreadable to this connection without it. The `where` is
 * still here and still load-bearing: it is what makes the function correct,
 * where RLS is what makes a mistake in it fail closed instead of wide.
 */
export async function getOwnedCodes(db: Database, userId: string) {
  return withReader(db, userId, async (tx) => {
    const rows = await tx
      .select({ code: modules.code })
      .from(purchases)
      .innerJoin(modules, eq(purchases.moduleId, modules.id))
      .where(and(eq(purchases.userId, userId), eq(purchases.status, "paid")));
    return new Set(rows.map((r) => r.code));
  });
}

/** A user's purchases with the module joined in, oldest first. */
export async function listPurchases(db: Database, userId: string) {
  return withReader(db, userId, (tx) =>
    tx
      .select({
        id: purchases.id,
        amountCents: purchases.amountCents,
        status: purchases.status,
        provider: purchases.provider,
        createdAt: purchases.createdAt,
        code: modules.code,
        name: modules.name,
      })
      .from(purchases)
      .innerJoin(modules, eq(purchases.moduleId, modules.id))
      .where(eq(purchases.userId, userId))
      .orderBy(asc(purchases.createdAt)),
  );
}

/* ============================================================
   PROVIDER KEYS — a reader's own model credential
   ============================================================
   Every function takes `userId` as its FIRST argument and filters on
   it, including the ones that take a key id. Same reason as the chat
   history above, and the stakes are higher: a key id is guessable, so
   looking one up by id alone would hand one reader's credential to
   another. Scoping by user means the worst a wrong id can do is look
   like a key that does not exist.

   `listProviderKeys` deliberately selects NO credential column. The
   settings page has no reason to hold key material, so it never
   receives it — a leak prevented by the query rather than by
   remembering not to use the value.
   ============================================================ */

/** What the settings page is shown: enough to recognise a key, never to use one. */
export type ProviderKeySummary = {
  readonly id: string;
  readonly provider: string;
  readonly label: string;
  readonly lastFour: string;
  readonly modelId: string;
  readonly updatedAt: Date;
};

/** This reader's credentials, most recently touched first. No key material. */
export async function listProviderKeys(
  db: Database,
  userId: string,
): Promise<ReadonlyArray<ProviderKeySummary>> {
  return withReader(db, userId, (tx) =>
    tx
      .select({
        id: providerKeys.id,
        provider: providerKeys.provider,
        label: providerKeys.label,
        lastFour: providerKeys.lastFour,
        modelId: providerKeys.modelId,
        updatedAt: providerKeys.updatedAt,
      })
      .from(providerKeys)
      .where(eq(providerKeys.userId, userId))
      .orderBy(desc(providerKeys.updatedAt)),
  );
}

/**
 * Store or replace one credential.
 *
 * Keyed on (userId, provider) so pasting a rotated key replaces the old
 * one instead of accumulating rows nobody can tell apart.
 */
export async function upsertProviderKey(
  db: Database,
  key: {
    readonly id: string;
    readonly userId: string;
    readonly provider: string;
    readonly label: string;
    readonly encryptedKey: string;
    readonly lastFour: string;
    readonly modelId: string;
  },
): Promise<void> {
  // The WITH CHECK half of the policy is what makes this safe: even a
  // caller that somehow passed another reader's id could not write a row
  // for them, because the insert is rejected rather than stored.
  await withReader(db, key.userId, (tx) =>
    tx
      .insert(providerKeys)
      .values(key)
      .onConflictDoUpdate({
        target: [providerKeys.userId, providerKeys.provider],
        set: {
          label: key.label,
          encryptedKey: key.encryptedKey,
          lastFour: key.lastFour,
          modelId: key.modelId,
          updatedAt: new Date(),
        },
      }),
  );
}

/**
 * This reader's credential for one provider, WITH the sealed value —
 * the only query in this file that returns `encrypted_key`, and the
 * only reason it exists is to hand the credential to its provider.
 */
export async function getProviderKey(
  db: Database,
  userId: string,
  provider: string,
): Promise<{ readonly encryptedKey: string; readonly modelId: string } | null> {
  // The ONLY query in the codebase that returns ciphertext. It runs as the
  // reader, so RLS is a second barrier in front of the one function whose
  // result is a credential.
  return withReader(db, userId, async (tx) => {
    const rows = await tx
      .select({
        encryptedKey: providerKeys.encryptedKey,
        modelId: providerKeys.modelId,
      })
      .from(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
      .limit(1);
    return rows[0] ?? null;
  });
}

/** Remove one of this reader's credentials. False when there was nothing to remove. */
export async function deleteProviderKey(
  db: Database,
  userId: string,
  provider: string,
): Promise<boolean> {
  return withReader(db, userId, async (tx) => {
    const rows = await tx
      .delete(providerKeys)
      .where(and(eq(providerKeys.userId, userId), eq(providerKeys.provider, provider)))
      .returning({ id: providerKeys.id });
    return rows.length > 0;
  });
}

/* ============================================================
   NOTES RETRIEVAL — the tutor's corpus
   ============================================================
   THIS BLOCK IS THE ENTITLEMENT BOUNDARY. Everything below is written
   so that there is exactly one way to read note content and that one
   way requires a set of module codes the caller resolved themselves.

   The rule every function here obeys: `accessibleCodes` is a parameter,
   never derived inside from anything the caller supplied about itself.
   The caller resolves it from the session — see
   apps/web/src/lib/notes-access.ts — so a caller cannot widen it by
   passing a different argument, because there is no argument that does
   that. An empty set returns nothing rather than everything; the
   fail-closed direction is the only safe direction for paid content.

   Note what is NOT selected anywhere below: `noteTopics.sourcePath`.
   It exists so ingestion can re-read a file and an operator can trace a
   citation. It must never appear in a result bound for a prompt or a
   response — a model shown a filename can be asked for it back and will
   answer. Only display names leave this file.
   ============================================================ */

/** A retrieved passage, already reduced to what a model is allowed to see. */
export type RetrievedNote = {
  readonly topicId: string;
  readonly slug: string;
  /** Display name. The only title that ever leaves the server. */
  readonly title: string;
  /**
   * Course code, e.g. MATT101. A display name, so it is safe to return —
   * and carried explicitly rather than derived from the slug, which would
   * give "mapv112" where the catalogue says "MAPV112".
   */
  readonly moduleCode: string;
  readonly description: string;
  readonly heading: string | null;
  readonly content: string;
  /** Cosine distance; lower is closer. Carried so callers can show a score. */
  readonly distance: number;
};

/** What a caller needs to know about a topic without reading its content. */
export type NoteTopicSummary = {
  readonly id: string;
  readonly moduleCode: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string;
  readonly chunkCount: number;
};

/** Insert or update a topic from an ingestion run. */
export async function upsertNoteTopic(
  db: Database,
  topic: {
    readonly id: string;
    readonly moduleCode: string;
    readonly slug: string;
    readonly title: string;
    readonly description: string;
    /** Server-side only. Never selected into anything the client sees. */
    readonly sourcePath: string;
    readonly contentHash: string;
    readonly pageCount?: number | null;
  },
): Promise<void> {
  await db
    .insert(noteTopics)
    .values({
      id: topic.id,
      moduleCode: topic.moduleCode,
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      sourcePath: topic.sourcePath,
      contentHash: topic.contentHash,
      pageCount: topic.pageCount ?? null,
    })
    .onConflictDoUpdate({
      target: noteTopics.id,
      set: {
        moduleCode: topic.moduleCode,
        title: topic.title,
        description: topic.description,
        sourcePath: topic.sourcePath,
        contentHash: topic.contentHash,
        pageCount: topic.pageCount ?? null,
      },
    });
}

/**
 * Replace a topic's chunks wholesale.
 *
 * Wholesale rather than incremental because a chunk boundary moves
 * whenever the text above it is edited, so "insert chunk 3" is not a
 * meaningful operation — the only correct result of re-ingesting an
 * edited note is the new set, not the old set plus an insert. The unique
 * index on (topic_id, chunk_index) is what makes a re-run idempotent
 * instead of duplicating.
 */
export async function replaceTopicChunks(
  db: Database,
  topic: { readonly topicId: string; readonly moduleCode: string },
  chunks: ReadonlyArray<{
    readonly chunkIndex: number;
    readonly heading: string | null;
    readonly content: string;
    readonly tokenEstimate: number;
    readonly embedding: readonly number[];
  }>,
): Promise<void> {
  await db.delete(noteChunks).where(eq(noteChunks.topicId, topic.topicId));
  if (chunks.length === 0) {
    return;
  }
  await db.insert(noteChunks).values(
    chunks.map((c) => ({
      id: `${topic.topicId}#${c.chunkIndex}`,
      topicId: topic.topicId,
      // Denormalised deliberately — it is the column the entitlement
      // filter reads, so it has to be on the chunk row itself.
      moduleCode: topic.moduleCode,
      chunkIndex: c.chunkIndex,
      heading: c.heading,
      content: c.content,
      tokenEstimate: c.tokenEstimate,
      embedding: c.embedding as number[],
    })),
  );
}

/** Every topic with its chunk count, for the ingestion report. */
export async function listNoteTopics(db: Database): Promise<ReadonlyArray<NoteTopicSummary>> {
  const rows = await db
    .select({
      id: noteTopics.id,
      moduleCode: noteTopics.moduleCode,
      slug: noteTopics.slug,
      title: noteTopics.title,
      description: noteTopics.description,
      chunkCount: sql<number>`count(${noteChunks.id})::int`,
    })
    .from(noteTopics)
    .leftJoin(noteChunks, eq(noteChunks.topicId, noteTopics.id))
    .groupBy(noteTopics.id);
  return rows;
}

/**
 * Rank note chunks against a query embedding, restricted to modules the
 * reader may read.
 *
 * THE FILTER IS IN THE SQL AND IT IS NOT OPTIONAL. The obvious
 * alternative — take the global top-k and drop anything unauthorised in
 * JS — looks equivalent and is not. It leaks existence through result
 * counts and latency, and it silently returns nothing when the best
 * passages happen to belong to modules the reader has not bought, which
 * reads to the model as "these notes do not cover this" rather than "you
 * may not read these". Both failures are quiet, which is what makes them
 * dangerous.
 *
 * `accessibleCodes` empty returns no rows, never all of them.
 */
export async function searchNoteChunks(
  db: Database,
  accessibleCodes: ReadonlySet<string>,
  queryEmbedding: readonly number[],
  opts: {
    readonly topicSlug?: string | undefined;
    readonly limit?: number;
  } = {},
): Promise<ReadonlyArray<RetrievedNote>> {
  if (accessibleCodes.size === 0) {
    return [];
  }
  const limit = Math.min(Math.max(opts.limit ?? 6, 1), 20);

  const vector = `[${queryEmbedding.join(",")}]`;

  const rows = await db
    .select({
      topicId: noteTopics.id,
      slug: noteTopics.slug,
      title: noteTopics.title,
      moduleCode: noteTopics.moduleCode,
      description: noteTopics.description,
      heading: noteChunks.heading,
      content: noteChunks.content,
      // `<=>` is cosine distance in pgvector. The HNSW index is built on
      // vector_cosine_ops to match; an l2 index here would be wrong
      // rather than merely slower.
      distance: sql<number>`${noteChunks.embedding} <=> ${vector}::vector`,
    })
    .from(noteChunks)
    .innerJoin(noteTopics, eq(noteChunks.topicId, noteTopics.id))
    .where(
      and(
        inArray(noteChunks.moduleCode, [...accessibleCodes]),
        opts.topicSlug ? eq(noteTopics.slug, opts.topicSlug) : undefined,
      ),
    )
    .orderBy(sql`${noteChunks.embedding} <=> ${vector}::vector`)
    .limit(limit);

  return rows.map((r) => ({ ...r, distance: Number(r.distance) }));
}

/**
 * Topics the reader may read, for routing the question to a subject
 * before any chunk is read.
 *
 * Same filter as the search above, at topic grain, and for the same
 * reason: routing over ALL topics would let the citation UI name a
 * module the reader has never bought, which discloses both that it
 * exists and roughly what it covers.
 */
export async function listAccessibleTopics(
  db: Database,
  accessibleCodes: ReadonlySet<string>,
): Promise<ReadonlyArray<NoteTopicSummary>> {
  if (accessibleCodes.size === 0) {
    return [];
  }
  const rows = await db
    .select({
      id: noteTopics.id,
      moduleCode: noteTopics.moduleCode,
      slug: noteTopics.slug,
      title: noteTopics.title,
      description: noteTopics.description,
      chunkCount: sql<number>`count(${noteChunks.id})::int`,
    })
    .from(noteTopics)
    .innerJoin(noteChunks, eq(noteChunks.topicId, noteTopics.id))
    .where(inArray(noteTopics.moduleCode, [...accessibleCodes]))
    .groupBy(noteTopics.id)
    .orderBy(asc(noteTopics.moduleCode), asc(noteTopics.slug));
  return rows;
}

/* ============================================================
   CHAT HISTORY
   ------------------------------------------------------------
   Every function here takes `userId` as its FIRST argument and
   filters on it in the WHERE clause — including the ones that take a
   thread id. That is deliberate and is the entire access-control story
   for the history pane: a thread id is guessable (it comes from the
   URL of a request the caller made), so looking one up by id alone
   would hand over any transcript in the table to anyone who asked.
   Scoping by user means the worst a wrong thread id can do is look
   like a thread that does not exist.

   Callers get userId from getSession(). It is never a request
   parameter — see apps/web/src/app/api/chat/.
   ============================================================ */

/** How many threads the history pane shows before it stops asking. */
const THREAD_PAGE = 50;

/** One row of the history pane: an id to reopen, and a label. */
export type ChatThreadSummary = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: Date;
};

/** This user's threads, most recently touched first. */
export async function listChatThreads(
  db: Database,
  userId: string,
): Promise<Array<ChatThreadSummary>> {
  return withReader(db, userId, async (tx) => {
    const rows = await tx
      .select({
        id: chatThreads.id,
        title: chatThreads.title,
        updatedAt: chatThreads.updatedAt,
      })
      .from(chatThreads)
      .where(eq(chatThreads.userId, userId))
      .orderBy(desc(chatThreads.updatedAt))
      .limit(THREAD_PAGE);
    return rows;
  });
}

/** One stored message, as the transcript renders it back. */
export type StoredChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

/**
 * One thread and its messages, or null.
 *
 * Null covers both "no such thread" and "not yours" on purpose: the two
 * are the same answer from outside, so this cannot be used to probe
 * which thread ids exist.
 */
export async function getChatThread(
  db: Database,
  userId: string,
  threadId: string,
): Promise<{ id: string; title: string; messages: Array<StoredChatMessage> } | null> {
  // One transaction, one identity. The two queries below have to agree on
  // who the reader is, and they get that from the same transaction-local
  // setting rather than from two separate reads of the session.
  return withReader(db, userId, async (tx) => {
    // Ownership first. Without this the messages query would happily
    // return a transcript for a thread belonging to somebody else.
    const thread = await tx
      .select({ id: chatThreads.id, title: chatThreads.title })
      .from(chatThreads)
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
      .limit(1);
    const found = thread[0];
    if (!found) {
      return null;
    }

    const rows = await tx
      .select({
        id: chatMessages.id,
        role: chatMessages.role,
        content: chatMessages.content,
      })
      .from(chatMessages)
      .where(eq(chatMessages.threadId, found.id))
      .orderBy(asc(chatMessages.createdAt));

    return {
      id: found.id,
      title: found.title,
      messages: rows.map((r) => ({
        id: r.id,
        // Coerced rather than trusted: role is a free-text column, and a
        // value the tutor never wrote would otherwise render as a
        // user-authored bubble in someone else's transcript.
        role: r.role === "assistant" ? "assistant" : "user",
        content: r.content,
      })),
    };
  });
}

/** What the caller wants to add to a thread. */
export type NewChatMessage = {
  readonly id: string;
  readonly role: "user" | "assistant";
  readonly content: string;
};

/**
 * Create the thread if it is new, then record one message.
 *
 * Returns false when the thread exists but belongs to somebody else.
 *
 * THE OWNERSHIP CHECK IS NOT OPTIONAL. The thread id comes from the
 * client and is the sole primary key of chat_threads, so it is entirely
 * caller-chosen — the upsert below matches on the id alone and would
 * happily accept it. Without the check, any signed-in user could POST
 * to /api/chat with somebody else's thread id and inject messages into
 * that transcript, where they then render inside their history pane.
 * Read and delete were already scoped by userId in their WHERE clause;
 * this write path had no equivalent, so it was the one hole.
 *
 * False rather than an error: from outside, "not yours" and "does not
 * exist" are the same thing, and telling them apart would turn thread
 * ids into a probe for what other users have.
 *
 * The title is set from the first user message only. Re-sending should
 * not rename a conversation the user has already started.
 */
export async function appendChatMessage(
  db: Database,
  userId: string,
  threadId: string,
  threadTitle: string,
  message: NewChatMessage,
): Promise<boolean> {
  // One transaction, so the ownership read, the thread claim and the
  // message insert cannot be interleaved with another reader's. The
  // policy's WITH CHECK is the backstop here too: a message can only be
  // written into a thread the reader's identity can already see.
  return withReader(db, userId, async (tx) => {
    // Ownership first, and it has to be a real read: the insert below is
    // an upsert on the id, so it cannot express "only if it is mine".
    const owned = await tx
      .select({ id: chatThreads.id })
      .from(chatThreads)
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
      .limit(1);

    if (owned.length === 0) {
      // Either genuinely new, or it belongs to someone else. The insert
      // decides which: if the row is already there under another user the
      // conflict fires, and we bail without having written the message.
      const claimed = await tx
        .insert(chatThreads)
        .values({ id: threadId, userId, title: threadTitle })
        // A concurrent tab can win the race to create this thread. Its
        // title is the same one we would have written, so taking it is
        // harmless — and cheaper than a select-then-insert.
        .onConflictDoNothing({ target: chatThreads.id })
        .returning({ id: chatThreads.id });

      if (claimed.length === 0) {
        return false;
      }
    }

    await tx
      .insert(chatMessages)
      .values({
        id: message.id,
        threadId,
        role: message.role,
        content: message.content,
      })
      // Replays happen: a stream that fails midway can be retried, and
      // the client resends the turn. Same id, so update rather than
      // inserting a second copy of the same message.
      //
      // The conflict target is deliberately NOT chatMessages.id. That
      // column is a global primary key, so a client that guessed or
      // reused another user's message id would collide with it and this
      // upsert would overwrite that user's message with attacker-chosen
      // text — a cross-user write that survives every userId check
      // above, because the collision happens below them. Scoping the
      // target to (threadId, id) means a message id can only ever be
      // updated within the thread that already contains it.
      //
      // DO NOT "simplify" this back to the bare id. It is the second
      // half of the ownership guarantee, not a stylistic choice.
      .onConflictDoUpdate({
        target: [chatMessages.threadId, chatMessages.id],
        set: { content: message.content, role: message.role },
      });

    // Touch the thread so it sorts to the top of the history pane.
    // updateAt has a $onUpdate hook, but that only fires through drizzle's
    // update builder — an insert does not trigger it.
    await tx
      .update(chatThreads)
      .set({ updatedAt: new Date() })
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)));

    return true;
  });
}

/**
 * Delete one thread and its messages. Scoped by user, so this is a
 * no-op on somebody else's thread rather than a way to delete it.
 * The messages go with it via ON DELETE CASCADE.
 */
export async function deleteChatThread(
  db: Database,
  userId: string,
  threadId: string,
): Promise<boolean> {
  return withReader(db, userId, async (tx) => {
    const rows = await tx
      .delete(chatThreads)
      .where(and(eq(chatThreads.id, threadId), eq(chatThreads.userId, userId)))
      .returning({ id: chatThreads.id });
    return rows.length > 0;
  });
}
/* ============================================================
   PRACTICE — the question catalogue and the reader's record of it
   ============================================================

   Two shapes here, and the difference is the point.

   READING the catalogue is entitlement-filtered but NOT wrapped in
   `withReader`. That is deliberate and matches note_chunks: practice_questions
   is global authored content, the reader's identity is irrelevant to which
   questions exist, and the RLS identity would only be a second, weaker copy of
   the `module_code = any(owned)` filter this function already applies. See
   create-rls-policies.mjs for why the corpus tables carry no policy.

   WRITING an attempt does go through `withReader`, because practice_attempts
   is per-reader state and its policy is keyed on the session identity.
   ============================================================ */

/** The enum, as a type, so nothing downstream needs an unchecked cast. */
export type PracticeFormat = "multiple-choice" | "application" | "proof-order";

/** One row of the catalogue, exactly as stored. */
export type PracticeQuestionRow = {
  id: string;
  format: PracticeFormat;
  module_code: string;
  topic_slug: string;
  difficulty: number;
  prompt: string;
  tags: string[];
  spec: unknown;
};

/** How many questions a module holds, for the practice index page. */
export type PracticeModuleCount = {
  moduleCode: string;
  count: number;
};

/**
 * Questions the reader may practise.
 *
 * `accessibleCodes` comes from the caller and is the ONLY thing standing
 * between a paying reader and a question they have not paid for. It is a
 * parameter rather than something derived here so that this function cannot
 * accidentally read entitlement from a request-supplied value — the caller
 * resolves it from `getOwnedCodes(user.id)`, which counts only
 * status === 'paid'.
 *
 * Questions the reader has already answered are still returned. Suppressing
 * them would make a session impossible to finish on a small module, and
 * re-answering is how a reader consolidates rather than how they cheat.
 */
export async function listPracticeQuestions(
  db: Database,
  accessibleCodes: ReadonlySet<string>,
  opts: { readonly moduleCode?: string; readonly limit?: number } = {},
): Promise<ReadonlyArray<PracticeQuestionRow>> {
  if (accessibleCodes.size === 0) {
    return [];
  }
  const codes = opts.moduleCode ? [...accessibleCodes].filter((c) => c === opts.moduleCode) : [...accessibleCodes];
  if (codes.length === 0) {
    return [];
  }

  const rows = await db
    .select({
      id: practiceQuestions.id,
      format: practiceQuestions.format,
      module_code: practiceQuestions.moduleCode,
      topic_slug: practiceQuestions.topicSlug,
      difficulty: practiceQuestions.difficulty,
      prompt: practiceQuestions.prompt,
      tags: practiceQuestions.tags,
      spec: practiceQuestions.spec,
    })
    .from(practiceQuestions)
    .where(inArray(practiceQuestions.moduleCode, codes))
    /*
     * EASIEST FIRST, and the comment used to claim the opposite — it said a
     * session should open "at the level the reader is least likely to already
     * know" while `asc(difficulty)` opens at 1, which the schema defines as
     * "the definition itself". Easiest-first is the choice being made here:
     * a session that opens on the hardest question in the module reads as the
     * app being wrong about the reader, and the explanations are where the
     * learning happens, so starting where they are most likely to succeed is
     * what gets them there.
     *
     * The id tie-break is LEXICAL, which is only stable because authored ids
     * zero-pad their suffix: `-02` before `-10`, not after. Past ten questions
     * in one module at one difficulty that silently breaks, so the padding is
     * a convention the schema documents rather than an accident.
     */
    .orderBy(asc(practiceQuestions.difficulty), asc(practiceQuestions.id))
    .limit(opts.limit ?? DEFAULT_PRACTICE_LIMIT);

  return rows;
}

/**
 * How many questions one session may hold.
 *
 * A cap rather than no cap, because a module with thousands of questions would
 * otherwise ship a multi-megabyte payload of prompts the reader will never
 * reach. It is REPORTED rather than silent — `questions/route.ts` returns the
 * module's true count alongside the served slice, so the progress line can say
 * how many exist rather than implying the reader has seen everything.
 */
export const DEFAULT_PRACTICE_LIMIT = 50;

/** Attempts listAttemptsForQuestion returns. Stated so the cap is not mistaken for a whole history. */
const ATTEMPT_HISTORY_LIMIT = 20;

/**
 * Per-module question counts, for the index page. Never for unowned modules.
 *
 * `formats` MUST match what the serving route will actually send, and it
 * defaults to multiple choice because that is the only format B2a serves.
 *
 * It defaults that way on purpose rather than counting everything, because
 * counting everything is how the index advertised modules it then refused to
 * serve: MAPV112 showed "1 question" and delivered none, since its only
 * question is an application one. MATT101 showed 3 and delivered 1. The page's
 * own comment claimed it never offers a dead end, and the count was the thing
 * that made that false.
 *
 * Both sides filtering is the durable fix; `test-practice-integration` asserts
 * they agree on the same module.
 */
export async function countPracticeQuestionsByModule(
  db: Database,
  accessibleCodes: ReadonlySet<string>,
  opts: { readonly formats?: ReadonlyArray<PracticeFormat> } = {},
): Promise<ReadonlyArray<PracticeModuleCount>> {
  if (accessibleCodes.size === 0) {
    return [];
  }
  const formats = opts.formats ?? (["multiple-choice"] as ReadonlyArray<PracticeFormat>);
  const rows = await db
    .select({
      moduleCode: practiceQuestions.moduleCode,
      count: sql<number>`count(*)::int`,
    })
    .from(practiceQuestions)
    .where(
      and(
        inArray(practiceQuestions.moduleCode, [...accessibleCodes]),
        inArray(practiceQuestions.format, formats as PracticeFormat[]),
      ),
    )
    .groupBy(practiceQuestions.moduleCode)
    .orderBy(asc(practiceQuestions.moduleCode));

  return rows;
}

/**
 * One question by id, with NO entitlement filter.
 *
 * Used by the grading route, which MUST load the row before it can grade it,
 * and which therefore cannot filter by module first. The entitlement check is
 * applied by that route immediately after loading, against this row's own
 * `module_code`.
 *
 * That ordering is deliberate and is the only safe one here: a route that
 * graded before checking would have already told the reader the answer.
 */
export async function getPracticeQuestionById(
  db: Database,
  id: string,
): Promise<PracticeQuestionRow | null> {
  const rows = await db
    .select({
      id: practiceQuestions.id,
      format: practiceQuestions.format,
      module_code: practiceQuestions.moduleCode,
      topic_slug: practiceQuestions.topicSlug,
      difficulty: practiceQuestions.difficulty,
      prompt: practiceQuestions.prompt,
      tags: practiceQuestions.tags,
      spec: practiceQuestions.spec,
    })
    .from(practiceQuestions)
    .where(eq(practiceQuestions.id, id))
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Record one attempt.
 *
 * `format` is copied from the question rather than taken from the request, so
 * a client cannot file a multiple-choice attempt under some other format and
 * poison the per-format history the weakness profile will be built on.
 *
 * `detail` stores the ANSWER, not just the verdict, so a later change to the
 * grading rule can recompute history without asking the reader again. That is
 * the only reason the column exists rather than a bare outcome.
 */
export async function recordPracticeAttempt(
  db: Database,
  userId: string,
  input: {
    questionId: string;
    /**
     * Checked, not cast.
     *
     * This used to be typed `string` and narrowed at the write with
     * `as PracticeAttemptFormat` — a cast that stops the check rather than
     * performing one, sitting on the one write path whose failure the route
     * swallows as best-effort. A lie there would vanish the attempt with no
     * reader-visible symptom and silently under-count B3's history.
     */
    format: PracticeFormat;
    outcome: "correct" | "incorrect" | "partial";
    detail: Record<string, unknown>;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  return withReader(db, userId, async (tx) => {
    await tx.insert(practiceAttempts).values({
      id,
      userId,
      questionId: input.questionId,
      format: input.format,
      outcome: input.outcome,
      detail: input.detail,
    });
    return id;
  });
}

/**
 * A reader's attempts on one question, newest first, up to a cap.
 *
 * The cap used to be absent from the doc, which said "every attempt" while the
 * query returned 20. B3c's spaced repetition wants the MOST RECENT, so the cap
 * is the right shape — but it has to be stated, or a caller reading the
 * comment thinks it is getting a complete history and silently reasons from a
 * truncated one.
 */
export async function listAttemptsForQuestion(
  db: Database,
  userId: string,
  questionId: string,
): Promise<ReadonlyArray<{ outcome: string; detail: unknown; createdAt: Date }>> {
  return withReader(db, userId, async (tx) => {
    const rows = await tx
      .select({
        outcome: practiceAttempts.outcome,
        detail: practiceAttempts.detail,
        createdAt: practiceAttempts.createdAt,
      })
      .from(practiceAttempts)
      .where(
        and(
          eq(practiceAttempts.userId, userId),
          eq(practiceAttempts.questionId, questionId),
        ),
      )
      .orderBy(desc(practiceAttempts.createdAt))
      .limit(ATTEMPT_HISTORY_LIMIT);
    return rows;
  });
}

