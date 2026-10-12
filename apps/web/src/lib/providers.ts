/**
 * PROVIDER REGISTRY
 * ------------------------------------------------------------
 * The allowlist of bring-your-own-key providers, and the only place a
 * stored `provider` slug becomes a base URL.
 *
 * THIS IS AN ALLOWLIST AND NOT A LOOKUP BY STRING ON PURPOSE. A row's
 * `provider` value came from a client. Interpolating it into a URL, or
 * dispatching on it, would let a reader point the tutor at any host
 * they liked and have the server send its request there — with the
 * server's network position, and potentially a credential attached.
 * Every provider is named here in source; nothing from the database
 * chooses a destination.
 *
 * OpenRouter is spoken to through its OpenAI-compatible endpoint rather
 * than a dedicated package, because there is no `@ai-sdk/openrouter` on
 * npm — OpenRouter exposes an OpenAI-shaped API and
 * `@ai-sdk/openai-compatible` is the supported way to reach it.
 *
 * Adding a provider means adding an entry here and a branch in
 * `resolveTutorModel`. Nowhere else needs to change.
 */

export type ProviderSlug = "openrouter";

export const PROVIDERS: Readonly<
  Record<ProviderSlug, { readonly label: string; readonly baseUrl: string; readonly keyHint: string }>
> = {
  openrouter: {
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    keyHint: "sk-or-v1-…",
  },
};

export function isProviderSlug(value: unknown): value is ProviderSlug {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}

/* ============================================================
   THE FREE MODEL CATALOGUE
   ============================================================

   THIS USED TO BE A HARDCODED LIST AND IT WAS WRONG WITHIN DAYS.

   The previous version shipped five `:free` model ids written from
   memory. Every one of them had been retired by the time a reader
   actually used them: OpenRouter answered 404 with "This model is
   unavailable for free. The paid version is available now — use this
   slug instead", and because that sentence contains the word
   "unavailable" the error mapper filed it under "the provider is
   busy" — so a dead id presented as a temporary outage and sent the
   reader off to retry something that would never work.

   The lesson is not "pick better ids". It is that a hardcoded list of
   someone else's free tier has a shelf life measured in days, and there
   is no way to test that from inside the repo. So the list is fetched
   from OpenRouter's public catalogue and filtered here, with a baked-in
   snapshot only as a fallback for when the network is unavailable.

   WHAT COUNTS AS ALLOWED, and why each part is a filter rather than a
   preference:

     · price exactly zero. `llama-3.3-70b-instruct:free` was priced at
       zero the day it was written and not after. Anything that costs
       money is refused, because the reader chose a *free* tier and a
       silent charge to their card is not a defensible surprise;
     · declares tool support. The tutor's entire grounding mechanism is
       a tool. A model that cannot call one answers from its own memory
       with no way for us to notice, which is the single worst failure
       this feature can have — worse than an error, because it looks
       like success.

   Note `inclusionai/ling-3.1-flash` has no `:free` suffix yet is
   priced at zero. The suffix was never the test; the price was.
   ============================================================ */

export type FreeModel = {
  readonly id: string;
  readonly label: string;
};

/**
 * A snapshot of the catalogue, taken when this was written. Used only
 * when the live fetch fails — a reader picking from a two-week-old list
 * is far better than a reader who cannot pick at all, and every id here
 * was verified free-with-tools at the time.
 */
const FALLBACK_FREE_MODELS: readonly string[] = [
  "openrouter/free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "nvidia/nemotron-3.5-lightning:free",
  "poolside/laguna-s-2.1:free",
  "poolside/laguna-xs-2.1:free",
  "thinkingmachines/inkling:free",
  "thinkingmachines/inkling-small:free",
  "dots-studio/dots-3-note-preview:free",
  "liquid/lfm-2.5-2.6b:free",
  "cohere/north-mini-code:free",
  "apodex/apodex-1.1-mini:free",
  "inclusionai/ling-3.1-flash",
];

/**
 * The default, and the reason this catalogue cannot repeat the last
 * bug: OpenRouter routes this to whichever free model is actually
 * serving. A specific `:free` slug is a promise someone else has to
 * keep; this one cannot go stale, because there is nothing to retire.
 */
export const DEFAULT_OPENROUTER_MODEL = "openrouter/free";

/** Long enough to survive a burst, short enough to notice a retirement. */
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;
const CATALOGUE_URL = "https://openrouter.ai/api/v1/models";

type Catalogue = { models: readonly string[]; fetchedAt: number };

let cache: Catalogue | null = null;
/**
 * Set when the live fetch fails. The settings page surfaces this so a
 * stale list is never presented as though it were current.
 */
let staleReason: string | null = null;

/** Human-friendly name from an OpenRouter id: "vendor/model:free" -> "Model". */
function labelFor(id: string): string {
  const withoutVendor = id.split("/").pop() ?? id;
  return withoutVendor
    .replace(/:free$/, "")
    .replace(/-it$/, " (instruct)")
    .replace(/-/g, " ");
}

function isAllowedByPolicy(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const m = raw as {
    id?: unknown;
    pricing?: { prompt?: unknown; completion?: unknown };
    supported_parameters?: unknown;
  };
  if (typeof m.id !== "string") return false;
  // Strictly zero, not "less than some epsilon": a model priced at
  // 0.0000001 per token is a paid model with a very small number on it.
  if (m.pricing?.prompt !== "0" || m.pricing?.completion !== "0") return false;
  if (!Array.isArray(m.supported_parameters)) return false;
  return m.supported_parameters.includes("tools");
}

/**
 * The free, tool-capable models, from OpenRouter's public catalogue.
 *
 * Never throws: a failed fetch falls back to the snapshot and records
 * why, because a catalogue outage must not take the tutor down with it.
 */
export async function getFreeModels(): Promise<{
  models: readonly FreeModel[];
  live: boolean;
  note: string | null;
}> {
  const now = Date.now();

  if (cache && now - cache.fetchedAt < CATALOGUE_TTL_MS) {
    return {
      models: cache.models.map((id) => ({ id, label: labelFor(id) })),
      live: staleReason === null,
      note: staleReason,
    };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(CATALOGUE_URL, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) throw new Error(`catalogue returned ${res.status}`);

    const body = (await res.json()) as { data?: unknown };
    const rows = Array.isArray(body.data) ? body.data : [];
    const ids = rows.filter(isAllowedByPolicy).map((m) => (m as { id: string }).id);

    if (ids.length === 0) throw new Error("catalogue contained no free tool-capable models");

    cache = { models: ids, fetchedAt: now };
    staleReason = null;
    return { models: ids.map((id) => ({ id, label: labelFor(id) })), live: true, note: null };
  } catch (err) {
    staleReason = `could not reach the OpenRouter catalogue (${err instanceof Error ? err.message : "unknown error"}), showing the last known list`;
    if (!cache) {
      cache = { models: FALLBACK_FREE_MODELS, fetchedAt: 0 };
    }
    return {
      models: cache.models.map((id) => ({ id, label: labelFor(id) })),
      live: false,
      note: staleReason,
    };
  }
}

/**
 * Is this a model id the server will actually call?
 *
 * Deliberately SYNCHRONOUS and deliberately NOT consulting the cache.
 * It checks the last list the server resolved — which is the live one
 * whenever the catalogue has been reachable, and the snapshot otherwise
 * — and nothing else. A caller cannot widen this by sending a crafted
 * value: the comparison is against a list this module produced from
 * OpenRouter's own pricing fields, never from the request.
 *
 * `openrouter/free` is always accepted because it is the default and
 * cannot be retired; without that carve-out a catalogue outage would
 * make the default unusable.
 */
export function isAllowedModel(modelId: unknown): modelId is string {
  if (typeof modelId !== "string" || modelId.length === 0) return false;
  if (modelId === DEFAULT_OPENROUTER_MODEL) return true;
  const list = cache?.models ?? FALLBACK_FREE_MODELS;
  return list.includes(modelId);
}