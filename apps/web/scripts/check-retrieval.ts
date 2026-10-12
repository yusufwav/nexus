/**
 * Retrieval quality smoke test.
 *
 * The entitlement tests prove rows are SCOPED correctly. This proves the
 * ranking actually works — that a question about bisection retrieves the
 * bisection note and not the limits note. Scoped-but-garbage retrieval is
 * still a broken tutor.
 *
 * Deliberately not a benchmark: three questions and their expected topic
 * is a smoke test, and the honest way to judge quality is relevance
 * judgements over a real question set, which is a much larger piece of
 * work (see IDEAS/TODO.md).
 *
 * Run from apps/web:
 *   node --env-file=.env --import tsx scripts/check-retrieval.ts
 */
import { createDb } from "@Main/db";
import * as q from "@Main/db/queries";

import { embedDocuments, embedQuery } from "../src/lib/notes-embedding";

const CASES: ReadonlyArray<{ question: string; expectSlug: string }> = [
  {
    question: "How does the bisection method find a root of a function?",
    expectSlug: "mapv112-bisection-method",
  },
  {
    question: "What is the error after n iterations of bisection?",
    expectSlug: "mapv112-bisection-method",
  },
  {
    question: "Explain what continuity at a point means.",
    expectSlug: "matt101-limits",
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const db = createDb({ DATABASE_URL: url });

  const topics = await q.listNoteTopics(db);
  if (topics.length === 0) {
    throw new Error("No ingested notes. Run scripts/ingest-notes.ts first.");
  }

  const topicVecs = await embedDocuments(
    topics.map((t) => `${t.title}. ${t.description}`),
  );

  let passed = 0;
  for (const testCase of CASES) {
    const v = await embedQuery(testCase.question);

    // Rank in JS rather than through searchNoteChunks: this is testing
    // the embedding, and searching would apply the entitlement filter
    // and then blame it for a routing problem.
    const ranked = topics
      .map((t, i) => ({ t, s: cosine(v, topicVecs[i] ?? []) }))
      .sort((a, b) => b.s - a.s);

    const top = ranked[0]?.t.slug;
    const ok = top === testCase.expectSlug;
    if (ok) passed += 1;

    console.log(`${ok ? "PASS" : "FAIL"}  "${testCase.question}"`);
    console.log(`        expected ${testCase.expectSlug}, got ${top}`);
    console.log(
      `        ` +
        ranked
          .slice(0, 3)
          .map((r) => `${r.t.slug}=${r.s.toFixed(3)}`)
          .join("  "),
    );
  }

  console.log(`\n${passed}/${CASES.length} routed to the expected topic`);
  if (passed !== CASES.length) {
    process.exitCode = 1;
  }
}

function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});