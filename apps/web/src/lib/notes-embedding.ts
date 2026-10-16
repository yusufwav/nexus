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
 * WHY GOOGLE, AND NOT OPENROUTER: `@ai-sdk/google` against Google's own
 * endpoint, on GOOGLE_GENERATIVE_AI_API_KEY. OpenRouter's embeddings
 * catalogue LISTS this model, and these embeddings were routed through
 * OpenRouter on the strength of that listing. It does not serve them.
 * A catalogue entry means a slug is KNOWN, not that a ROUTE WORKS, and
 * those two were treated as the same thing across two rounds of
 * "correction" — first concluding from `/models` that no embeddings
 * existed, then concluding from `/embeddings/models` that they all did.
 * Neither reading was tested, and only one of them was true.
 *
 * So: the tutor's chat goes through OpenRouter because OpenRouter's chat
 * endpoint demonstrably works. The embeddings go through Google because
 * Google's embedding endpoint demonstrably works. Two providers, each
 * verified by use rather than by a list.
 *
 * THE MODEL WAS `nvidia/nemotron-3-embed-1b:free` briefly, and went back
 * to Gemini because the smaller free model measured worse. Worth
 * recording why, since "free" was the reason for that swap and it was the
 * wrong reason: retrieval quality is the entire point of an embedding, and
 * a cheaper vector that ranks worse makes the tutor confidently wrong.
 */

/**
 * The model.
 *
 * UNPREFIXED, and that is load-bearing. `google/gemini-embedding-001` is the
 * OPENROUTER slug; Google's own endpoint wants `gemini-embedding-001` and
 * answers the prefixed form with a bare 404. Measured against the live API,
 * not assumed:
 *
 *     google/gemini-embedding-001  ->  Not Found
 *     gemini-embedding-001         ->  OK, 768 dims
 *
 * The prefixed id survived the round trip through OpenRouter and came back
 * with the tutor, which is the worst way for it to survive. The module looked
 * correct, typechecked, and every layer above it reported a healthy search
 * that never once returned a passage — the degradation guard added around
 * this call turned a 404 into "note search is temporarily unavailable",
 * blaming a provider outage for what was a bad model id.
 *
 * Changing this invalidates every stored vector, which is why it is asserted
 * in test-notes-degradation.mjs rather than left to review.
 */
export const EMBEDDING_MODEL = "gemini-embedding-001";

/**
 * 768, not the model's native 3072.
 *
 * `gemini-embedding-001` is Matryoshka-trained, so `outputDimensionality`
 * truncates rather than discards: the leading 768 dimensions retain most of
 * the ranking quality at a quarter of the storage and a fraction of the index
 * size. Left unset it returns 3072, which would not fit the `vector(768)`
 * column at all. (Google names this parameter `outputDimensionality`; it is
 * OpenAI's API that calls the same idea `dimensions`.)
 *
 * That truncation is DOCUMENTED behaviour for this model, which is the
 * property the Nemotron swap did not have — its width could not be
 * established from any endpoint, so the column became an assertion to
 * verify rather than a known quantity. `assertDimensionality` below is
 * what makes swapping the model survivable either way.
 */
export const EMBEDDING_DIMENSIONS = 768;

/**
 * One vector for one question.
 *
 * Through `google.embedding()` against Google's OWN endpoint, keyed on
 * GOOGLE_GENERATIVE_AI_API_KEY. NOT OpenRouter.
 *
 * OpenRouter's embeddings catalogue LISTS `gemini-embedding-001`, and routing
 * through it was tried on the strength of that listing — it does not serve
 * embeddings. A catalogue entry says a slug is known, not that a route works,
 * and the two were treated as the same thing. `@ai-sdk/google` is a direct
 * dependency again for this one call.
 */
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