import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { lastFour, sealKey } from "@/lib/key-crypto";
import {
  DEFAULT_OPENROUTER_MODEL,
  getFreeModels,
  isAllowedModel,
  isProviderSlug,
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
 */

export const BodySchema = z.object({
  provider: z.string(),
  apiKey: z.string().min(8).max(200),
  label: z.string().max(60).optional(),
  modelId: z.string().optional(),
});

/** GET — this reader's keys. */
export async function GET(): Promise<Response> {
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
    return NextResponse.json({
      keys,
      // Sent rather than hardcoded on the client so the allowlist has
      // one definition and the client cannot drift into offering
      // something the server refuses.
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
    });
  } catch (err) {
    console.error("[keys] list failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Could not read your keys." }, { status: 500 });
  }
}

/** POST — store or replace one credential. */
export async function POST(req: Request): Promise<Response> {
  const user = await requireUser();
  if (user instanceof NextResponse) {
    return user;
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // The provider slug is checked against the registry rather than used.
  // It came from a client, and it decides which host the server talks to.
  if (!isProviderSlug(parsed.provider)) {
    return NextResponse.json({ error: "Unknown provider." }, { status: 400 });
  }
  const provider = parsed.provider;

  const modelId = parsed.modelId ?? DEFAULT_OPENROUTER_MODEL;
  if (!isAllowedModel(modelId)) {
    return NextResponse.json({ error: "That model is not available." }, { status: 400 });
  }

  // Trimmed before sealing so a pasted newline does not become part of
  // the credential and produce a baffling 401 from the provider later.
  const apiKey = parsed.apiKey.trim();

  // A shape check, not a validity check. Actually calling the provider
  // would turn "save" into "spend", and a wrong key is discovered on
  // first use with a clear message instead.
  if (provider === "openrouter" && !apiKey.startsWith("sk-or-v1-")) {
    return NextResponse.json(
      { error: "That does not look like an OpenRouter key (expected sk-or-v1-…)." },
      { status: 400 },
    );
  }

  try {
    await q.upsertProviderKey(db, {
      id: randomUUID(),
      // From the session. Not from the body — the body has no such field.
      userId: user.id,
      provider,
      label: (parsed.label ?? "").slice(0, 60),
      encryptedKey: sealKey(apiKey),
      lastFour: lastFour(apiKey),
      modelId,
    });
    return NextResponse.json({ ok: true, provider, lastFour: lastFour(apiKey) });
  } catch (err) {
    // Deliberately does not include the error's own text in the response.
    // A driver error can carry the bound parameter values, and one of
    // those values is the credential.
    console.error("[keys] save failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not save that key." }, { status: 500 });
  }
}