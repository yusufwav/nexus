import { google } from "@ai-sdk/google";
import { embed, embedMany } from "ai";

/**
 * EMBEDDINGS — pure computation, no database and no session
 * ------------------------------------------------------------
 * Deliberately NOT `server-only`. It is called from both the request
 * path (api/ai/route.ts) and the offline ingestion script, and the
 * `server-only` marker throws outside a Server Component — which is the
 * package working correctly, not a problem to work around. Separating
 * "turn text into a vector" from "decide who may read what" keeps both
 * honest: this module cannot reach the database or a session, so it is
 * incapable of leaking anything, and the ingestion script needs none of
 * the entitlement machinery because it writes global content.
 *
 * WHY THE EXISTING PROVIDER: `@ai-sdk/google` is already a dependency
 * with a working key, and it exports `google.embedding()`. A separate
 * vector service would mean a second key, a second vendor, a second
 * thing to leak, and a second failure mode — for the same numbers.
 */

/** The model. Changing it changes the dimension and invalidates every stored vector. */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * 768, not the model's native 3072.
 *
 * `gemini-embedding-001` is Matryoshka-trained, so `outputDimensionality`
 * truncates rather than discards: the leading 768 dimensions retain most
 * of the ranking quality at a quarter of the storage and a fraction of
 * the index size. Left unset it returns 3072, which would not fit the
 * `vector(768)` column at all.
 */
export const EMBEDDING_DIMENSIONS = 768;

/** One vector for one question. */
export async function embedQuery(text: string): Promise<readonly number[]> {
  const { embedding } = await embed({
    model: google.embedding(EMBEDDING_MODEL),
    value: text,
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_QUERY",
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    },
  });
  assertDimensionality(embedding);
  return embedding;
}

/** One vector per chunk of a note. Batched: ingestion is offline and can afford it. */
export async function embedDocuments(texts: ReadonlyArray<string>): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: google.embedding(EMBEDDING_MODEL),
    values: [...texts],
    providerOptions: {
      google: {
        taskType: "RETRIEVAL_DOCUMENT",
        outputDimensionality: EMBEDDING_DIMENSIONS,
      },
    },
  });
  for (const e of embeddings) {
    assertDimensionality(e);
  }
  return embeddings as number[][];
}

/**
 * Fail loudly on a dimension mismatch rather than letting the INSERT do it.
 *
 * Postgres rejects a vector of the wrong width with an opaque error a long
 * way from its cause, and the cause — the model or the column changing —
 * is the thing worth naming.
 */
function assertDimensionality(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding is ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. ` +
        `The note_chunks vector column and ${EMBEDDING_MODEL} must agree.`,
    );
  }
}

/** Cosine similarity between two equal-length vectors. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length === 0 || a.length !== b.length) {
    return 0;
  }
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
  if (na === 0 || nb === 0) {
    return 0;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}