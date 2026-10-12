/**
 * NOTE INGESTION
 * ------------------------------------------------------------
 * Turns topic PDFs into embedded chunks. OFFLINE ONLY — this is a script,
 * never a route. Embedding per request would spend money and add latency
 * on content that does not change between deploys.
 *
 * Idempotent by construction: a topic is replaced wholesale, keyed on a
 * content hash, so re-running after an edit updates and re-running
 * without one is a no-op. That property is the reason a partial failure
 * is safe to retry.
 *
 * Run from apps/web, with the app's .env loaded:
 *   node --env-file=.env scripts/ingest-notes.ts
 *
 * PDF TEXT EXTRACTION IS THE KNOWN WEAK LINK, and deliberately so. There
 * is no PDF library in this project, so this script does not pretend to
 * read a PDF: it looks for a sidecar `<name>.md` beside the PDF and
 * ingests that. That sidecar IS the derived text layer the retrieval
 * design calls for — normalised Markdown with the mathematics intact,
 * which is what you want a model to read and what a generic extractor
 * cannot give you. Producing it is a separate, deliberate step: a model
 * pass over the PDF, output checked by a human.
 *
 * Refusing to guess here is the safe failure. A naive extractor would
 * happily return running headers, page numbers and hyphenation artifacts,
 * which poison the embedding silently — the ingestion would report
 * success and the tutor would quietly retrieve nonsense.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { createDb } from "@Main/db";
import * as q from "@Main/db/queries";

import { MODULE_TOPICS } from "../src/content/module-topics";
import { embedDocuments } from "../src/lib/notes-embedding";

/** Rough tokens per chunk. Chunks split on headings, this only bounds size. */
const TARGET_TOKENS = 450;
const OVERLAP_TOKENS = 60;

/**
 * topic slug -> file under private-assets/topics/.
 *
 * An explicit map, not a convention. `MODULE_TOPICS[].pdf` is a PUBLIC
 * url path and does not reliably match what is on disk — `matt101-limits`
 * claims `/topics/matt101-limits.pdf` and no such file exists. Guessing a
 * filename would ingest the wrong document under the right name, which is
 * the worst possible outcome for paid content. Anything not listed here is
 * skipped and reported.
 */
const SOURCE_FILES: Record<string, string> = {
  // The free tier (MATT101 has hasTrialPdf) — a placeholder stub today.
  "matt101-limits": "matt101-sample.pdf",
  // The paid tier. This is the red-team fixture.
  "mapv112-bisection-method": "Bisection_Method.pdf",
};

const PRIVATE_ROOT = path.join(process.cwd(), "private-assets", "topics");

/** Rough token count. Good enough for budgeting and spotting runaways. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Split on headings, then pack.
 *
 * Splitting on headings rather than a fixed width is the decision that
 * most affects answer quality: a chunk cut mid-section returns half an
 * argument, and the model will confidently reason from the wrong half.
 * Fixed-size splitting is the usual mistake and it is silent.
 */
function chunkMarkdown(markdown: string): Array<{
  heading: string | null;
  content: string;
  tokenEstimate: number;
}> {
  const blocks: Array<{ heading: string | null; body: string }> = [];
  let heading: string | null = null;
  let buffer: string[] = [];

  for (const line of markdown.split("\n")) {
    if (/^#{1,3}\s/.test(line)) {
      if (buffer.join("\n").trim().length > 0) {
        blocks.push({ heading, body: buffer.join("\n").trim() });
      }
      heading = line.replace(/^#{1,3}\s+/, "").trim();
      buffer = [];
      continue;
    }
    buffer.push(line);
  }
  if (buffer.join("\n").trim().length > 0) {
    blocks.push({ heading, body: buffer.join("\n").trim() });
  }

  const out: Array<{ heading: string | null; content: string; tokenEstimate: number }> = [];
  let carry: string | null = null;

  for (const block of blocks) {
    const tokens = estimateTokens(block.body);
    if (tokens > TARGET_TOKENS * 2) {
      // One oversized section: split it on blank lines, keeping the heading.
      const parts = block.body.split(/\n{2,}/).filter((p) => p.trim().length > 0);
      let buf: string[] = [];
      let bufTokens = 0;
      const flush = () => {
        if (buf.length === 0) return;
        const content = buf.join("\n\n");
        out.push({ heading: block.heading, content, tokenEstimate: estimateTokens(content) });
        // Carry a tail so a sentence spanning the cut is not lost.
        const tail = content.split(/\s+/).slice(-OVERLAP_TOKENS).join(" ");
        buf = [tail];
        bufTokens = estimateTokens(tail);
      };
      for (const part of parts) {
        const t = estimateTokens(part);
        if (bufTokens + t > TARGET_TOKENS && buf.length > 0) flush();
        buf.push(part);
        bufTokens += t;
      }
      flush();
    } else {
      const prefix = carry ? `${carry}\n\n` : "";
      carry = null;
      const content = `${prefix}${block.body}`;
      out.push({ heading: block.heading, content, tokenEstimate: estimateTokens(content) });
    }
  }
  return out;
}

async function main() {
  const env = process.env.DATABASE_URL;
  if (!env) throw new Error("DATABASE_URL is not set. Run with --env-file=.env");

  const db = createDb({ DATABASE_URL: env });

  const wanted: Array<{ moduleCode: string; slug: string; title: string; description: string }> = [];
  for (const [moduleCode, topics] of Object.entries(MODULE_TOPICS)) {
    for (const t of topics) {
      if (SOURCE_FILES[t.slug]) {
        wanted.push({
          moduleCode,
          slug: t.slug,
          title: t.title,
          description: t.description,
        });
      }
    }
  }

  if (wanted.length === 0) {
    console.log("No topics have a source file mapped. Nothing to ingest.");
    return;
  }

  let ingested = 0;
  let skipped = 0;

  for (const topic of wanted) {
    const file = SOURCE_FILES[topic.slug]!;
    const base = file.replace(/\.pdf$/i, "");
    const sidecar = path.join(PRIVATE_ROOT, `${base}.md`);

    let text: string;
    try {
      text = await readFile(sidecar, "utf8");
    } catch {
      console.log(
        `SKIP  ${topic.slug}: no derived text at ${path.relative(process.cwd(), sidecar)}\n` +
          `      (the PDF is there, but retrieval reads the .md — see the header of this script)`,
      );
      skipped += 1;
      continue;
    }

    const chunks = chunkMarkdown(text);
    if (chunks.length === 0) {
      console.log(`SKIP  ${topic.slug}: derived text is empty`);
      skipped += 1;
      continue;
    }

    const hash = createHash("sha256").update(text).digest("hex");
    const topicId = `nt_${topic.slug}`;
    const sourcePath = path.posix.join("topics", file);

    const embeddings = await embedDocuments(chunks.map((c) => c.content));

    await q.upsertNoteTopic(db, {
      id: topicId,
      moduleCode: topic.moduleCode,
      slug: topic.slug,
      title: topic.title,
      description: topic.description,
      sourcePath,
      contentHash: hash,
      pageCount: null,
    });

    await q.replaceTopicChunks(
      db,
      { topicId, moduleCode: topic.moduleCode },
      chunks.map((c, i) => ({
        chunkIndex: i,
        heading: c.heading,
        content: c.content,
        tokenEstimate: c.tokenEstimate,
        embedding: embeddings[i] ?? [],
      })),
    );

    console.log(
      `OK    ${topic.moduleCode}/${topic.slug}: ${chunks.length} chunks, ` +
        `${chunks.reduce((n, c) => n + c.tokenEstimate, 0)} tokens`,
    );
    ingested += 1;
  }

  console.log(`\ningested ${ingested}, skipped ${skipped}`);
  if (skipped > 0) {
    console.log("Skipped topics need a derived .md beside their PDF. Write one and re-run.");
  }
}

// Not top-level await: apps/web has no "type": "module", so tsx compiles
// this to CJS and would refuse it. Keeping the entry point a promise
// chain means the script runs identically whether or not that changes.
void main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});

export {};