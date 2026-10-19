import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4 } from "@ai-sdk/provider";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { assertPublicHost } from "@/lib/custom-provider-url";
import { openKey } from "@/lib/key-crypto";
import {
  DEFAULT_OPENROUTER_MODEL,
  isAllowedModel,
  isCustomProviderSlug,
  isProviderSlug,
  PROVIDERS,
} from "@/lib/providers";
import { getSession } from "@/lib/session";

/**
 * WHICH MODEL ANSWERS THIS TURN
 * ------------------------------------------------------------
 * The reader can now choose, per turn, and that choice is honoured
 * exactly or refused loudly. There is no third outcome.
 *
 * WHY AN EXPLICIT CHOICE MUST NOT SILENTLY DEGRADE: if a reader picks
 * a model and gets a different one, every conclusion they draw from the
 * answer is wrong — they are testing a model's tool-calling and
 * instead measuring ours. So when the chosen credential is missing or
 * unusable, this returns the server model with a `problem` the UI
 * shows, and never pretends the request was honoured.
 *
 * WHAT THIS FUNCTION IS CAREFUL NOT TO DO:
 *
 *   · log the key, or include it in any error. The AI SDK attaches
 *     request headers to some provider errors, and an `Authorization`
 *     header in a log file is a credential in a log file;
 *   · accept a provider from the caller. The slug is validated against
 *     our own registry and the base URL is looked up here rather than
 *     stored, so a crafted value cannot redirect the server's request.
 */

/** What the reader asked for this turn. Undefined means "your default". */
export type ModelSelection = {
  readonly provider: string;
  readonly modelId: string;
};

export type TutorModel = {
  /**
   * LanguageModelV4 rather than `ai`'s `LanguageModel` alias: the alias
   * unions V2 through V4, and `wrapLanguageModel` will not take it. Both
   * providers return V4, so naming it here is honest rather than a cast.
   */
  readonly model: LanguageModelV4;
  /** "user-key" or "server" — surfaced to the reader so they know which bill them. */
  readonly source: "user-key" | "server";
  readonly provider: string;
  readonly modelId: string;
  /** Set when the requested model could not be used, and why. */
  readonly problem?: string;
  /** True when the reader's explicit choice was NOT honoured. */
  readonly substituted?: boolean;
};

/**
 * A credential, opened. Everything a call needs and nothing more.
 *
 * `baseUrl` is null for a built-in — the allowlist supplies that — and a
 * validated public https address for a custom one.
 */
type Credential = {
  readonly provider: string;
  readonly apiKey: string;
  readonly modelId: string;
  readonly kind: "builtin" | "custom";
  readonly name: string;
  readonly baseUrl: string | null;
};

/**
 * Resolve the model for one turn.
 *
 * `wanted` comes from the request body and is treated as a hint about
 * INTENT, never as authority. For a built-in provider the slug is
 * checked against the registry and the model against the free-tool
 * catalogue, both server-owned lists. For a custom one the slug must
 * match the grammar this server mints, the row must belong to the
 * session's user, the model must be in that provider's catalogue, and
 * the host must still be public at the moment of the call.
 */
export async function resolveTutorModel(wanted?: ModelSelection | null): Promise<TutorModel> {
  const user = await getSession();

  /*
    WHICH CREDENTIAL IS EVEN CANDIDATE, DECIDED BEFORE ANY READ.

    OpenRouter unless a custom slug was asked for by name. A reader can
    have several custom providers, so there is no defensible implicit
    one — picking "the most recently used" would mean a turn silently
    changing provider because they saved a key in Settings five minutes
    ago, which is exactly the silent substitution this file exists to
    prevent. Custom therefore has to be chosen, and OpenRouter stays the
    default for a reader who has configured nothing else.
  */
  const requestedCustom = wanted !== undefined && wanted !== null && isCustomProviderSlug(wanted.provider);
  const stored = await readKey(user?.id, requestedCustom ? wanted.provider : "openrouter");

  /*
   * THE READER'S KEY IS THERE AND COULD NOT BE USED.
   *
   * This branch used to be reachable only as a fallthrough, and it
   * reported `substituted: Boolean(wanted)` — so when the reader had made
   * no per-turn choice (the ordinary case, they just open the tutor and
   * ask something) the flag was FALSE. They were answered by the server's
   * Gemini account while believing the tutor was on their OpenRouter
   * credit, and the one field whose entire job is "you did not get what
   * you asked for" said everything was fine.
   *
   * `substituted` is now unconditionally true whenever a stored credential
   * exists and the answer is coming off the server's account instead. If
   * the reader has saved a key, then answering from ours IS a substitution,
   * regardless of whether they picked a model this particular turn.
   */
  if (stored && "problem" in stored) {
    return {
      ...serverModel(),
      problem: stored.problem,
      substituted: true,
    };
  }

  const key = stored?.value ?? null;

  /*
    ---- explicit CUSTOM provider ----

    Three checks, and the order is the point.

    The grammar check already happened (it chose the row to read). What
    is left is that the row read is scoped on the session's user id —
    a reader cannot name a provider that is not theirs — and that the
    model is one they have actually listed on it.

    That second one is the check that is easy to leave out and hard to
    retrofit: `modelId` came from a request body, and without it a
    crafted id would be sent to whatever host the reader named,
    including a path on that host they never approved. The catalogue is
    what turns "a reader may point the tutor at an endpoint they named"
    into "…calling models they have listed there".
  */
  if (requestedCustom) {
    if (!key) {
      return {
        ...serverModel(),
        problem: "That provider is not one of yours — add its key in Settings first.",
        substituted: true,
      };
    }
    return customModel(key, wanted.modelId);
  }

  // ---- no explicit choice: the reader's key if they have one ----
  if (!wanted) {
    if (key) {
      return openRouterModel(key, key.modelId || DEFAULT_OPENROUTER_MODEL);
    }
    return serverModel();
  }

  // ---- explicit "server" ----
  if (wanted.provider === "server") {
    return serverModel();
  }

  // ---- explicit openrouter ----
  if (!isProviderSlug(wanted.provider)) {
    return {
      ...serverModel(),
      problem: "That provider is not available.",
      substituted: true,
    };
  }

  const modelId = wanted.modelId || DEFAULT_OPENROUTER_MODEL;
  if (!isAllowedModel(modelId)) {
    // Refused here rather than passed to the provider, because a paid
    // slug would charge the reader's card. The catalogue is the guard.
    return {
      ...serverModel(),
      problem: "That model is not in the free list any more. Pick another.",
      substituted: true,
    };
  }

  if (!key) {
    // Asking for your own key without having saved one is a setup gap,
    // not a reason to quietly answer from the server's account.
    return {
      ...serverModel(),
      problem: "Add an OpenRouter key in Settings first — that model needs your own account.",
      substituted: true,
    };
  }

  return openRouterModel(key, modelId);
}

function openRouterModel(
  key: { readonly apiKey: string },
  modelId: string,
): TutorModel {
  return {
    model: createOpenAICompatible({
      name: "openrouter",
      baseURL: PROVIDERS.openrouter.baseUrl,
      apiKey: key.apiKey,
    })(modelId),
    source: "user-key",
    provider: "openrouter",
    modelId,
  };
}

/**
 * A turn against a provider the reader named themselves.
 *
 * Returns a `problem` rather than throwing for every refusal, because
 * the caller is the route handler and every one of these is something
 * the reader can fix in Settings. The alternative - an exception -
 * would surface as "The tutor could not answer that", which tells them
 * nothing and is the failure mode this whole file was written to avoid.
 *
 * ASYNC WHERE IT USED TO BE SYNCHRONIC, for one reason: the host is
 * re-resolved and re-checked here, at the moment of the call, and not
 * only when the reader saved it. That is the second layer described at
 * the top of `custom-provider-url.ts`, and putting it here is what
 * makes it a control rather than a comment - a check that only runs at
 * save time is a check about the past.
 */
async function customModel(key: Credential, modelId: string): Promise<TutorModel> {
  const fallback = (problem: string): TutorModel => ({
    ...serverModel(),
    problem,
    substituted: true,
  });

  if (key.kind !== "custom" || key.baseUrl === null || key.baseUrl === "") {
    return fallback("That provider has no address saved against it.");
  }
  if (!isCustomProviderSlug(key.provider)) {
    return fallback("That provider is not available.");
  }

  const wantedModel = modelId.trim();
  if (wantedModel === "") {
    return fallback("Pick a model on that provider first.");
  }

  /*
    THE CATALOGUE CHECK.

    `modelId` arrived in a request body. A body is a suggestion, and
    this is the line between a suggestion and an instruction the server
    will act on: not "is this a string we recognise" but "did this
    reader list this model on this provider". A crafted id cannot get
    past it, because the list it is checked against is rows this reader
    created in Settings - not anything the request supplied.
  */
  const user = await getSession();
  if (!user) {
    return fallback("Sign in to use your own provider.");
  }
  let known: boolean;
  try {
    known = await q.hasProviderModel(db, user.id, key.provider, wantedModel);
  } catch (err) {
    console.error(
      "[tutor] could not check the custom model catalogue:",
      err instanceof Error ? err.name : "unknown",
    );
    return fallback("Your provider's model list could not be read just now.");
  }
  if (!known) {
    return fallback(
      "That model is not on your provider's list any more. Pull the free models again, or add it by hand.",
    );
  }

  let host: string;
  try {
    host = new URL(key.baseUrl).hostname;
  } catch {
    return fallback("That provider's address is not a URL.");
  }
  try {
    await assertPublicHost(host);
  } catch (err) {
    // The host is the reader's own configuration and the failure is
    // theirs to fix, but the message names the host's problem rather
    // than a library's error type.
    console.error(
      "[tutor] refused a custom provider host:",
      err instanceof Error ? err.message : "unknown",
    );
    return fallback("That provider's address no longer resolves to a public host.");
  }

  return {
    model: createOpenAICompatible({
      name: key.provider,
      baseURL: key.baseUrl,
      apiKey: key.apiKey,
    })(wantedModel),
    source: "user-key",
    provider: key.provider,
    modelId: wantedModel,
  };
}

/**
 * The reader's credential for one provider, opened - or the reason there
 * isn't one.
 *
 * Takes the provider as an argument rather than always reading
 * OpenRouter, because a reader can have several custom providers and
 * the turn says which one it means.
 */
async function readKey(
  userId: string | undefined,
  provider: string,
): Promise<{ value: Credential } | { problem: string } | null> {
  if (!userId) return null;

  let row: {
    readonly encryptedKey: string;
    readonly modelId: string;
    readonly kind: string;
    readonly name: string;
    readonly baseUrl: string | null;
  } | null = null;
  try {
    row = await q.getProviderKey(db, userId, provider);
  } catch (err) {
    /*
     * An unreachable database is not a reason to spend the server's key
     * while the reader believes their own is in use - so this fails
     * toward the server model WITH a stated reason rather than pretending
     * the reader has no key at all. `substituted` is then set by the
     * caller, which is what stops the notice being mistaken for the
     * server quietly picking a model.
     *
     * It used to swallow the error entirely, which made this path
     * indistinguishable from "this reader never saved a key" in the
     * server log. The name is logged and nothing else: a driver error can
     * carry the bound parameter values, and one of those is the
     * credential.
     */
    console.error("[tutor] could not read the reader's stored key:", err instanceof Error ? err.name : "unknown");
    return { problem: "Your key could not be read just now, so the tutor fell back." };
  }

  if (!row) return null;

  const apiKey = openKey(row.encryptedKey);
  if (apiKey === null) {
    return {
      problem:
        "Your key could not be decrypted - the server's sealing key has changed. Re-enter it in Settings.",
    };
  }
  return {
    value: {
      provider,
      apiKey,
      modelId: row.modelId,
      kind: row.kind === "custom" ? "custom" : "builtin",
      name: row.name,
      baseUrl: row.baseUrl,
    },
  };
}

function serverModel(): TutorModel {
  /*
   * THE SERVER DEFAULT IS NOW OPENROUTER, not Google.
   *
   * It was `google("gemini-3.8-flash")`, which made the owner's personal
   * Google key a hard boot dependency: the app could not run without it,
   * and a tutor that quietly spends someone's key is not a default worth
   * keeping. This is the same `createOpenAICompatible` client the
   * READER'S OWN key already uses, so the server now speaks one provider
   * through one code path instead of two.
   *
   * The key is read at call time, not import time, so a missing one is a
   * value rather than a throw at module load — `resolveTutorModel` reports
   * it as something the reader can fix, instead of the provider
   * exploding on first use.
   */
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  return {
    model: createOpenAICompatible({
      name: "openrouter",
      baseURL: PROVIDERS.openrouter.baseUrl,
      apiKey,
    })(DEFAULT_OPENROUTER_MODEL),
    source: "server",
    provider: "openrouter",
    modelId: DEFAULT_OPENROUTER_MODEL,
  };
}

/**
 * Can the server answer at all?
 *
 * An absent key is a STATE, not a crash. A2 in TODO.md: the whole point of
 * removing the Google dependency is that a missing key has to read as
 * "nothing configured yet" and invite the reader to add one, rather than
 * taking the tutor down.
 */
export function serverHasKey(): boolean {
  return (process.env.OPENROUTER_API_KEY ?? "").length > 0;
}