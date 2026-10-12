import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { google } from "@ai-sdk/google";
import type { LanguageModelV4 } from "@ai-sdk/provider";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { openKey } from "@/lib/key-crypto";
import {
  DEFAULT_OPENROUTER_MODEL,
  isAllowedModel,
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
 * Resolve the model for one turn.
 *
 * `wanted` comes from the request body and is treated as a hint about
 * INTENT, never as authority: the provider is checked against the
 * registry and the model against the free-tool catalogue, both of which
 * are server-owned lists.
 */
export async function resolveTutorModel(wanted?: ModelSelection | null): Promise<TutorModel> {
  const user = await getSession();

  const stored = await readKey(user?.id);
  if (stored && "problem" in stored) {
    // Unreadable or undecryptable credential. Surface it; do not guess.
    return { ...serverModel(), problem: stored.problem, substituted: Boolean(wanted) };
  }

  const key = stored?.value ?? null;

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

/** The reader's OpenRouter credential, or the reason there isn't one. */
async function readKey(
  userId: string | undefined,
): Promise<
  | { value: { readonly apiKey: string; readonly modelId: string } }
  | { problem: string }
  | null
> {
  if (!userId) return null;

  let row: { readonly encryptedKey: string; readonly modelId: string } | null = null;
  try {
    row = await q.getProviderKey(db, userId, "openrouter");
  } catch {
    // An unreachable database is not a reason to spend the server's
    // key while the reader believes their own is in use.
    return { problem: "Your key could not be read just now, so the tutor fell back." };
  }

  if (!row) return null;

  const apiKey = openKey(row.encryptedKey);
  if (apiKey === null) {
    return {
      problem:
        "Your OpenRouter key could not be decrypted — the server's sealing key has changed. Re-enter it in Settings.",
    };
  }
  return { value: { apiKey, modelId: row.modelId } };
}

function serverModel(): TutorModel {
  return {
    model: google("gemini-3.8-flash"),
    source: "server",
    provider: "google",
    modelId: "gemini-3.8-flash",
  };
}