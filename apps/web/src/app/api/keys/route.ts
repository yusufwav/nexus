import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { validateCustomProviderUrl } from "@/lib/custom-provider-url";
import { lastFour, readSecret, sealKey } from "@/lib/key-crypto";
import {
  customProviderSlug,
  DEFAULT_OPENROUTER_MODEL,
  getFreeModels,
  isAllowedModel,
  isProviderSlug,
  labelForCustomModel,
  PROVIDERS,
} from "@/lib/providers";
import { requireUser } from "@/lib/require-user";

/**
 * THE READER'S OWN MODEL CREDENTIALS
 * ------------------------------------------------------------
 * GET     this reader's keys — no key material, ever
 * POST    store or replace one
 *
 * The credentials belong to the reader and are usable by nobody else.
 * That is enforced in three places which must all hold: the session gate
 * here, `userId` coming from getSession() and never from the body, and
 * every query in packages/db/src/queries.ts filtering on it.
 *
 * WHAT THIS ROUTE NEVER DOES, because each was a way to leak a key:
 *   · return key material in a response. GET selects no credential
 *     column at all — the settings page has no reason to hold one;
 *   · accept a userId. There is no such field in the schema below, and
 *     adding one would be the whole vulnerability;
 *   · log the value. The one place it appears outside memory is the
 *     encrypted column.
 *
 * CUSTOM PROVIDERS
 * ------------------------------------------------------------
 * A `kind: "custom"` row is a provider the reader pointed at
 * themselves. Three things about it are worth stating at the route
 * rather than in a helper nobody reads:
 *
 *   · the SLUG IS MINTED HERE. The reader's name goes to the `name`
 *     column and is never used as an identifier, because the slug is a
 *     URL path segment in DELETE /api/keys/<provider> and a reader will
 *     eventually type a `/` into whatever they call their provider.
 *   · the ADDRESS IS VALIDATED BEFORE IT IS STORED, by
 *     `validateCustomProviderUrl` — https, no credentials in the URL,
 *     and every address the host resolves to globally routable. A
 *     rejected address is a 400 with the reason, not a row.
 *   · a custom provider is created WITHOUT a model. The reader pulls
 *     the free list or types the ids they want afterwards, and picking
 *     one is a catalogue action (`/api/keys/<provider>/models`). An
 *     empty `model_id` is the honest state of a provider whose model
 *     list has not been fetched yet, and custom providers are never
 *     used implicitly, so nothing tries to call it before then.
 */

export const BodySchema = z.object({
  /** "builtin" (the default) or "custom". */
  kind: z.enum(["builtin", "custom"]).default("builtin"),
  /**
   * REQUIRED FOR `builtin` AND IGNORED FOR `custom`.
   *
   * Optional rather than branched, because it is genuinely absent from a
   * custom request: there is no slug to send, because the server mints
   * one. Making it required here meant every custom save was refused with
   * "Malformed request." before any of the validation below ran — the
   * kind was understood, the shape was not, and the message pointed at
   * neither.
   */
  provider: z.string().optional(),
  apiKey: z.string().min(8).max(200),
  label: z.string().max(60).optional(),
  modelId: z.string().max(120).optional(),
  /** The reader's own name for a custom provider. Display only. */
  name: z.string().trim().max(60).optional(),
  /** OpenAI-shaped base URL for a custom provider. */
  baseUrl: z.string().max(300).optional(),
});

type CustomProviderSummary = {
  readonly provider: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly lastFour: string;
  readonly modelId: string;
  readonly models: ReadonlyArray<{ readonly id: string; readonly label: string; readonly source: string }>;
};

/** GET — this reader's keys. */
export async function GET(req: Request): Promise<Response> {
  // `req` is taken but deliberately NOT used for an origin check. A GET
  // has nothing to forge: forging matters when the victim's browser is
  // made to perform a state change, and a read cannot be made to do that.
  // Adding the check here would break every legitimate non-browser reader
  // (the settings page's own fetch is fine, but scripts and monitoring
  // are not) in exchange for closing nothing.
  const user = await requireUser();
  if (user instanceof NextResponse) {
    return user;
  }

  try {
    const keys = await q.listProviderKeys(db, user.id);
    // The catalogue the UI renders. Fetched live from the provider and
    // filtered to free-and-tool-capable on the server, rather than sent
    // as a hardcoded list that goes stale the way the last one did.
    const catalogue = await getFreeModels();

    /*
      THE CUSTOM PROVIDERS, WITH THEIR MODEL LISTS.

      Read as one query rather than one per provider: a reader with four
      custom endpoints would otherwise be four round trips before the
      settings page could render, and the list has to be correct before
      the model picker on /ai can show anything at all.
    */
    const customKeys = keys.filter((k) => k.kind === "custom");
    const allModels = customKeys.length === 0 ? [] : await q.listProviderModels(db, user.id);

    const custom: CustomProviderSummary[] = customKeys.map((k) => ({
      provider: k.provider,
      name: k.name === "" ? k.provider : k.name,
      baseUrl: k.baseUrl ?? "",
      lastFour: k.lastFour,
      modelId: k.modelId,
      models: allModels
        .filter((m) => m.provider === k.provider)
        .map((m) => ({
          id: m.modelId,
          label: labelForCustomModel(m.modelId),
          source: m.source,
        })),
    }));

    return NextResponse.json({
      keys,
      // Sent rather than hardcoded on the client so the allowlist has
      // one definition and the client cannot drift into offering
      // something the server refuses. Built-ins only — a custom
      // provider's "label" is the reader's own name and its "hint" is
      // whatever key format they use, neither of which is ours to know.
      available: Object.entries(PROVIDERS).map(([slug, p]) => ({
        provider: slug,
        label: p.label,
        keyHint: p.keyHint,
      })),
      models: catalogue.models,
      defaultModel: DEFAULT_OPENROUTER_MODEL,
      // If the fetch failed the UI says so, rather than presenting a
      // week-old list as though it were current.
      catalogueLive: catalogue.live,
      catalogueNote: catalogue.note,
      custom,
    });
  } catch (err) {
    console.error("[keys] list failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not read your keys." }, { status: 500 });
  }
}

/** POST — store or replace one credential. */
export async function POST(req: Request): Promise<Response> {
  // `req` passed: this route stores a credential, so where the request
  // came from is part of the check. GET above deliberately omits it —
  // there is nothing to forge about a read.
  const user = await requireUser(req);
  if (user instanceof NextResponse) {
    return user;
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // Trimmed before sealing so a pasted newline does not become part of
  // the credential and produce a baffling 401 from the provider later.
  const apiKey = parsed.apiKey.trim();

  /*
    RESOLVE (kind, provider slug, base URL) BEFORE SEALING.

    Doing the validation first means a rejected request never reaches
    the AES path at all, so the failure is reported as the thing that is
    actually wrong — a bad address — rather than surfacing later as a 500
    from inside the encryption.
  */
  let provider: string;
  let kind: "builtin" | "custom" = "builtin";
  let name = "";
  let baseUrl: string | null = null;
  let modelId: string;

  if (parsed.kind === "custom") {
    const label = (parsed.name ?? "").trim();
    if (label.length === 0) {
      return NextResponse.json(
        { error: "Give the provider a name so you can tell your providers apart." },
        { status: 400 },
      );
    }
    const checked = await validateCustomProviderUrl(parsed.baseUrl);
    if (!checked.ok) {
      return NextResponse.json({ error: checked.problem }, { status: 400 });
    }

    /*
      REUSING AN EXISTING CUSTOM ROW RATHER THAN ADDING A SECOND ONE.

      The reader editing the key on a provider they already have should
      rotate it, not end up with two rows pointing at the same address
      and have to work out which one the tutor is using. Matched on the
      validated base URL, scoped on this reader — the same scoping rule
      every other query in the app obeys.
    */
    const existing = await q.listProviderKeys(db, user.id);
    const prior = existing.find(
      (k) => k.kind === "custom" && k.baseUrl === checked.baseUrl,
    );

    kind = "custom";
    name = label;
    baseUrl = checked.baseUrl;
    provider = prior?.provider ?? customProviderSlug();

    // No model on creation. `model_id` is NOT NULL, so an empty string is
    // what "this provider has no model chosen yet" looks like in the
    // column — and it is never resolved against, because a custom
    // provider is only ever used when a turn names it explicitly.
    modelId = "";
    if (prior !== undefined) {
      modelId = prior.modelId;
    }
  } else {
    // The provider slug is checked against the registry rather than
    // used. It came from a client, and it decides which host the server
    // talks to.
    if (!isProviderSlug(parsed.provider)) {
      return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
    }
    provider = parsed.provider;

    modelId = parsed.modelId ?? DEFAULT_OPENROUTER_MODEL;
    if (!isAllowedModel(modelId)) {
      return NextResponse.json({ error: "That model is not available." }, { status: 400 });
    }

    // A shape check, not a validity check. Actually calling the provider
    // would turn "save" into "spend", and a wrong key is discovered on
    // first use with a clear message instead.
    if (provider === "openrouter" && !apiKey.startsWith("sk-or-v1-")) {
      return NextResponse.json(
        { error: "That does not look like an OpenRouter key (expected sk-or-v1-…)." },
        { status: 400 },
      );
    }
  }

  // Checked BEFORE sealing, so a missing secret is reported as what it
  // is. It used to be discovered as a bare 500 from inside sealKey,
  // which pointed at the database rather than at the configuration and
  // cost an afternoon to trace.
  const sealing = readSecret();
  if (!sealing.ok) {
    console.error("[keys] refusing to store a credential:", sealing.problem);
    return NextResponse.json(
      { error: "Model keys cannot be saved right now — the server is misconfigured." },
      { status: 503 },
    );
  }

  try {
    await q.upsertProviderKey(db, {
      id: randomUUID(),
      // From the session. Not from the body — the body has no such field.
      userId: user.id,
      provider,
      kind,
      name,
      baseUrl,
      label: (parsed.label ?? "").slice(0, 60),
      encryptedKey: sealKey(apiKey),
      lastFour: lastFour(apiKey),
      modelId,
    });
    return NextResponse.json({ ok: true, provider, kind, lastFour: lastFour(apiKey) });
  } catch (err) {
    // Deliberately does not include the error's own text in the response.
    // A driver error can carry the bound parameter values, and one of
    // those values is the credential.
    console.error("[keys] save failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not save that key." }, { status: 500 });
  }
}