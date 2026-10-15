import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { embed, embedMany } from "ai";

import { PROVIDERS } from "@/lib/providers";

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
 * WHY OPENROUTER: it is already the app's only provider — the tutor's
 * server default and the reader's own key both go through it — so this
 * is what keeps that true rather than aspirational. Before this, the
 * embeddings were the last Google caller, which meant the owner's
 * personal Google key was still load-bearing.
 *
 * A WORTHWHILE CORRECTION: an earlier check concluded OpenRouter served
 * no embedding models at all, by searching `/api/v1/models` for the
 * string "embedding" and finding none. That check could not have found
 * them: `/models` lists CHAT models. Embeddings live behind a separate
 * router at `/api/v1/embeddings`, with its own catalogue at
 * `/api/v1/embeddings/models` — 33 models. The conclusion was wrong and
 * the evidence never supported it. The catalogue is the authority here,
 * and it does list the model below.
 *
 * THE MODEL CHANGED TWICE, and that has a consequence worth stating
 * plainly: changing the embedding model silently invalidates every stored
 * vector. Cosine similarity between vectors from two different models is
 * meaningless — not approximately right, meaningless — so stale chunks
 * would rank against garbage and retrieval would keep returning confident
 * nonsense. The first move was transport-only (Gemini's model served
 * *through* OpenRouter, same model, same vectors). The second was not.
 * `assertDimensionality` is the guard that makes the second one safe to
 * make at all, and `note_chunks` is empty, so the cost today is zero.
 */

/**
 * The model.
 *
 * Now `nvidia/nemotron-3-embed-1b:free` — free, and served through the
 * same router as everything else, so the app depends on exactly one
 * provider. Changing this invalidates every stored vector; see
 * `EMBEDDING_DIMENSIONS` for the trap that goes with it.
 */
export const EMBEDDING_MODEL = "nvidia/nemotron-3-embed-1b:free";

/**
 * 768 — and THIS NUMBER IS THE THING TO CHECK.
 *
 * `gemini-embedding-001` was Matryoshka-trained, so asking for 768
 * truncated 3072 cleanly and this column was written to match. Whether
 * this model behaves that way is **not established**: OpenRouter's
 * embeddings catalogue publishes no `dimensions` field for it, and
 * `supported_parameters` is empty for every embedding model there, so
 * neither endpoint can answer the question. It may truncate; it may
 * ignore the parameter; it may reject it.
 *
 * That uncertainty is why `assertDimensionality` below throws rather than
 * truncating client-side. A silently-truncated vector is WRONG in a way
 * that never surfaces: cosine similarity still returns numbers, retrieval
 * still returns chunks, and the tutor just quietly grounds on nonsense. A
 * thrown error costs one failed ingestion run and tells us the real width
 * on the first attempt.
 *
 * So: run one ingestion after this change and read the error. If it
 * reports a width other than 768, this constant AND the `vector(768)`
 * column both have to move together — there is no migration for that yet,
 * and `note_chunks` is empty (0 rows embedded), so re-ingesting is the
 * only cost.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * The one shared client.
 *
 * Built lazily and memoised at module scope: the key is read at CALL
 * time, never at import time, so a missing key cannot take the app down
 * at boot. It only ever matters if something actually asks for an
 * embedding.
 */
let cached: ReturnType<typeof createOpenAICompatible> | null = null;
function openRouter(): ReturnType<typeof createOpenAICompatible> {
  if (cached === null) {
    cached = createOpenAICompatible({
      name: "openrouter",
      baseURL: PROVIDERS.openrouter.baseUrl,
      apiKey: process.env.OPENROUTER_API_KEY ?? "",
    });
  }
  return cached;
}

/** One vector for one question. */
export async function embedQuery(text: string): Promise<readonly number[]> {
  const { embedding } = await embed({
    model: openRouter().embeddingModel(EMBEDDING_MODEL),
    value: text,
    // Provider options are keyed by the client's `name`, which is why the
    // client above is called "openrouter" and not "google" — the option
    // namespace and the route have to agree.
    providerOptions: {
      openrouter: { dimensions: EMBEDDING_DIMENSIONS },
    },
  });
  assertDimensionality(embedding);
  return embedding;
}

/** One vector per chunk of a note. Batched: ingestion is offline and can afford it. */
export async function embedDocuments(texts: ReadonlyArray<string>): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: openRouter().embeddingModel(EMBEDDING_MODEL),
    values: [...texts],
    providerOptions: {
      openrouter: { dimensions: EMBEDDING_DIMENSIONS },
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
 *
 * NOT client-side truncation. Padding or slicing to fit the column would
 * satisfy the type and produce a vector that means nothing: cosine
 * similarity keeps returning plausible numbers, retrieval keeps returning
 * chunks, and the tutor grounds its answers on noise with nothing in the
 * logs to say so. One loud failure is worth more than quiet wrong answers.
 */
function assertDimensionality(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `Embedding is ${embedding.length} dimensions, expected ${EMBEDDING_DIMENSIONS}. ` +
        `The note_chunks vector column and ${EMBEDDING_MODEL} must agree. ` +
        `Either set EMBEDDING_DIMENSIONS to ${embedding.length} and widen the column to ` +
        `vector(${embedding.length}), or pick a model that emits ${EMBEDDING_DIMENSIONS}. ` +
        `Truncating here instead would be wrong — it produces vectors that rank without erroring.`,
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