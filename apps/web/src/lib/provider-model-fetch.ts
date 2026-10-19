import "server-only";

import { assertPublicHost } from "@/lib/custom-provider-url";
import { isFreeModelId, labelForCustomModel } from "@/lib/providers";

/**
 * READING A READER'S OWN MODEL CATALOGUE
 * ------------------------------------------------------------
 * `{baseUrl}/models` is the OpenAI-shaped list every OpenAI-compatible
 * server implements, and it is the only thing a custom endpoint offers
 * that we can ask a question about. This module turns it into a typed
 * result, and it is where the free-tier filter lives.
 *
 * WHY THE FILTER IS THE NAME AND NOT THE PRICE
 * ------------------------------------------------------------
 * The OpenRouter path in `lib/providers.ts` filters on
 * `pricing.prompt === "0"` because OpenRouter publishes pricing and
 * "is this free" is a fact about the model rather than about its name.
 * An OpenAI-shaped `/models` response is a list of ids and nothing
 * else — no price, no capability block, no tool-support declaration — so
 * on this path the `:free` suffix is the only signal there is. It is
 * the convention the ecosystem actually uses, and a self-hosted reader
 * whose models carry no suffix at all is exactly the case the
 * "add it by hand" button exists for.
 *
 * THE CONSEQUENCE, STATED PLAINLY: on a custom provider, the filter
 * trusts the provider's own naming. A provider that charges for a model
 * called `something:free` will be believed. That is inherent to routing
 * to somebody's endpoint with somebody's key — this module is not
 * spending the server's money, it is spending the reader's, on a host
 * the reader named — but it is the reason the pull is offered as a
 * button that reports what it found rather than as the only way models
 * can be added.
 */

export type FetchedModel = { readonly id: string; readonly label: string };

export type FetchModelsResult =
  | { readonly ok: true; readonly free: ReadonlyArray<FetchedModel>; readonly total: number }
  | { readonly ok: false; readonly problem: string };

/**
 * How many models to believe.
 *
 * A `/models` response is attacker-adjacent input — it comes from a host
 * the reader named, and a reader may name any public host. Without a
 * ceiling, pointing the server at something that returns a hundred
 * thousand ids would make one button into a very large INSERT and then a
 * very large dropdown. The real lists run from tens to a few hundred.
 */
const MAX_MODELS = 500;

const TIMEOUT_MS = 8000;

/**
 * Ask a reader's endpoint what models it has, and keep the `:free` ones.
 *
 * `redirect: "error"` is load-bearing and is the second thing that keeps
 * a validated URL from becoming an SSRF primitive: the host check in
 * `custom-provider-url.ts` validates the address the reader gave, and a
 * followed redirect would let the response move the request somewhere
 * that was never validated. A redirect is reported as a failure rather
 * than followed.
 */
export async function fetchProviderModels(
  baseUrl: string,
  apiKey: string,
): Promise<FetchModelsResult> {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return { ok: false, problem: "That provider's address is not a URL." };
  }

  // Re-checked here for the same reason it is re-checked before a chat
  // call: this is a second outbound request to a name that may have been
  // re-pointed since it was saved.
  try {
    await assertPublicHost(host);
  } catch {
    return { ok: false, problem: "That provider's address no longer resolves to a public host." };
  }

  // The SDK appends `/chat/completions` to the base, so the base is
  // `.../v1` and the list lives at `.../v1/models`. Built by string
  // concatenation rather than with `new URL(path, base)`, which would
  // discard a base path containing `/v1` — the single most common thing
  // about a provider address, and the thing the field's hint names.
  const endpoint = `${baseUrl.replace(/\/+$/, "")}/models`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(endpoint, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        // Some endpoints require no credential at all for `/models`;
        // others reject a request without one. Sending it is what makes
        // the second group work, and it is the reader's own key going
        // to the reader's own host.
        authorization: `Bearer ${apiKey}`,
        accept: "application/json",
      },
    });

    if (!res.ok) {
      return {
        ok: false,
        problem: `That provider answered ${res.status} for its model list.`,
      };
    }

    const body: unknown = await res.json();
    const rows = Array.isArray((body as { data?: unknown })?.data)
      ? ((body as { data: unknown[] }).data)
      : [];

    if (rows.length === 0) {
      return {
        ok: false,
        problem: "That provider's model list came back empty — check the address ends in /v1.",
      };
    }

    const ids: string[] = [];
    const seen = new Set<string>();
    for (const row of rows.slice(0, MAX_MODELS)) {
      const id = (row as { id?: unknown })?.id;
      if (typeof id !== "string" || id === "" || seen.has(id)) continue;
      seen.add(id);
      if (isFreeModelId(id)) {
        ids.push(id);
      }
    }

    return {
      ok: true,
      free: ids.map((id) => ({ id, label: labelForCustomModel(id) })),
      total: rows.length,
    };
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"))) {
      return { ok: false, problem: "That provider did not answer its model list in time." };
    }
    return {
      ok: false,
      problem: "That provider's model list could not be read. Check the address and the key.",
    };
  } finally {
    clearTimeout(timer);
  }
}