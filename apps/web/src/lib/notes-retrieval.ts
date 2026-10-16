import "server-only";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { accessibleModuleCodes } from "@/lib/notes-access";
import { cosine, embedDocuments, embedQuery } from "@/lib/notes-embedding";

/**
 * NOTE RETRIEVAL — server side, entitlement-aware
 * ------------------------------------------------------------
 * The two halves of the tutor's grounding: turning a question into a
 * vector, and turning that vector into passages the reader is allowed
 * to have. The embedding arithmetic lives in notes-embedding.ts, which
 * has no database access; this module owns everything that must not be
 * reachable from a client.
 *
 * The task type is not cosmetic. `RETRIEVAL_DOCUMENT` and
 * `RETRIEVAL_QUERY` are asymmetric by design — a note and a question are
 * not the same kind of text, and embedding both as plain text measurably
 * costs recall. Getting it right is free.
 */

/**
 * Search the current reader's notes.
 *
 * `accessibleModuleCodes()` is resolved HERE and is not a parameter.
 * That is the point: there is no argument a caller — including a model
 * constructing a tool call — can pass to widen the set. The tool in
 * api/ai/route.ts closes over this function and can only ever ask it.
 *
 * Returns display names and content. `source_path` is never selected
 * upstream of here, so there is nothing to strip — a leak that has to be
 * remembered to be prevented is a leak that eventually ships.
 */
export async function searchOwnNotes(
  query: string,
  opts: { readonly topicSlug?: string | undefined } = {},
): Promise<ReadonlyArray<q.RetrievedNote>> {
  const codes = await accessibleModuleCodes();
  if (codes.size === 0) {
    return [];
  }
  const vector = await embedQuery(query);
  return q.searchNoteChunks(db, codes, vector, {
    topicSlug: opts.topicSlug,
    limit: 6,
  });
}

/**
 * Which subjects the reader can be routed to.
 *
 * Scoped the same way as the search, and for the same reason: a router
 * that saw every topic would let the citation UI name a module the
 * reader has never bought, which discloses both that it exists and
 * roughly what it covers.
 */
export async function ownTopics(): Promise<ReadonlyArray<q.NoteTopicSummary>> {
  const codes = await accessibleModuleCodes();
  return q.listAccessibleTopics(db, codes);
}

/**
 * Route a question to the subjects most likely to answer it.
 *
 * Deliberately simple: embed the question, embed every topic title and
 * description, rank by cosine. One extra round trip, no new dependency,
 * deterministic, and — unlike an LLM — it cannot be talked into a topic.
 *
 * If this misroutes in practice, that is the measurement that would
 * justify a real classifier (see JEV in IDEAS/TODO.md). Adopting one
 * before there is data on the error rate would be buying a dependency on
 * faith.
 *
 * THE EMBEDDING CALLS CAN THROW, and this is guarded for the same reason
 * the tutor's tool call is: an external provider being unavailable must not
 * become a failure of whatever asked for a routing. Returning no topics is
 * a meaningful, non-destructive answer — the caller falls back to whatever it
 * would have done without routing — whereas propagating takes down the
 * caller.
 *
 * It currently has no callers outside this module, so this is insurance
 * rather than a fix for a live incident. It is here because the next person
 * to call it will not read the internals first.
 */
export async function routeQuestion(
  question: string,
  k = 3,
): Promise<ReadonlyArray<q.NoteTopicSummary>> {
  const topics = await ownTopics();
  if (topics.length === 0) {
    return [];
  }

  let qVec: readonly number[];
  let topicVecs: ReadonlyArray<readonly number[]>;
  try {
    [qVec, topicVecs] = await Promise.all([
      embedQuery(question),
      embedDocuments(topics.map((t) => `${t.title}. ${t.description}`)),
    ]);
  } catch (err) {
    console.error(
      "[notes-retrieval] routing unavailable, returning no topics:",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }

  return topics
    .map((topic, i) => ({ topic, score: cosine(qVec, topicVecs[i] ?? []) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map((r) => r.topic);
}