import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";
import { z } from "zod";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { openKey } from "@/lib/key-crypto";
import { isCustomProviderSlug, labelForCustomModel } from "@/lib/providers";
import { fetchProviderModels } from "@/lib/provider-model-fetch";
import { requireUser } from "@/lib/require-user";

/**
 * THE MODEL CATALOGUE OF ONE CUSTOM PROVIDER
 * ------------------------------------------------------------
 *   GET     what is on it now
 *   POST    refresh the free list · add one by hand · choose the default
 *   DELETE  remove one added by hand
 *
 * Three actions on one route rather than three routes, because they all
 * need the same thing first: proof that the provider named in the path
 * is a custom provider belonging to this reader. That check is written
 * once, below, and everything else is downstream of it.
 *
 * WHY ONLY `custom_*` SLUGS GET IN HERE
 * ------------------------------------------------------------
 * OpenRouter's models come from its public catalogue, filtered on price
 * and tool support in `lib/providers.ts`, and are cached for six hours.
 * There is nothing here to refresh, nothing to hand-add — a paid slug
 * typed in by hand would be a paid slug — and letting the path reach
 * `openrouter` would make "add a custom model" a way to bypass the free
 * filter that every other path enforces. So the grammar check is a gate
 * rather than a branch.
 */

const BodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("refresh") }),
  z.object({ action: z.literal("add"), modelId: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("select"), modelId: z.string().trim().min(1).max(120) }),
  z.object({ action: z.literal("remove"), modelId: z.string().trim().min(1).max(120) }),
]);

type Params = { params: Promise<{ provider: string }> };

/**
 * The provider this reader owns, named by `slug`, or the response that
 * says there isn't one.
 *
 * A provider that is not the reader's answers 404 rather than 403, for
 * the same reason the chat history does: "not yours" and "does not
 * exist" must be indistinguishable, or this endpoint is an oracle for
 * which providers exist.
 *
 * `checkOrigin` IS A PARAMETER, and every method gets it right by having
 * to pass it. The first version took the request unconditionally, which
 * origin-checked the GET as well as the writes - and a GET has nothing
 * to forge, so that made this the only read under /api/keys that a
 * script or a monitor could not call. `/api/keys` GET already argues this
 * at length; this is the same decision applied to the sub-route rather
 * than a new one being invented here.
 */
async function requireOwnProvider(
  req: Request,
  provider: string,
  checkOrigin: boolean,
): Promise<{ userId: string; baseUrl: string } | NextResponse> {
  const user = checkOrigin ? await requireUser(req) : await requireUser();
  if (user instanceof NextResponse) return user;

  if (!isCustomProviderSlug(provider)) {
    return NextResponse.json({ error: "No such provider." }, { status: 404 });
  }

  const row = await q.getProviderKey(db, user.id, provider);
  if (row === null || row.kind !== "custom" || row.baseUrl === null || row.baseUrl === "") {
    return NextResponse.json({ error: "No such provider." }, { status: 404 });
  }

  return { userId: user.id, baseUrl: row.baseUrl };
}

/** GET — what is on this provider right now. */
export async function GET(req: Request, ctx: Params): Promise<Response> {
  const { provider } = await ctx.params;
  const owner = await requireOwnProvider(req, provider, false);
  if (owner instanceof NextResponse) return owner;

  try {
    const models = await q.listProviderModels(db, owner.userId, provider);
    return NextResponse.json({
      models: models.map((m) => ({
        id: m.modelId,
        label: labelForCustomModel(m.modelId),
        source: m.source,
      })),
    });
  } catch (err) {
    console.error("[provider-models] list failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not read the model list." }, { status: 500 });
  }
}

/** POST — refresh, add, or choose. Every action here changes state. */
export async function POST(req: Request, ctx: Params): Promise<Response> {
  const { provider } = await ctx.params;
  const owner = await requireOwnProvider(req, provider, true);
  if (owner instanceof NextResponse) return owner;

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  if (parsed.action === "refresh") {
    return refresh(req, owner.userId, provider, owner.baseUrl);
  }

  if (parsed.action === "add") {
    try {
      const added = await q.addProviderModel(db, {
        id: randomUUID(),
        userId: owner.userId,
        provider,
        modelId: parsed.modelId,
        source: "custom",
      });
      const models = await q.listProviderModels(db, owner.userId, provider);
      return NextResponse.json({
        ok: true,
        added,
        models: models.map((m) => ({ id: m.modelId, label: labelForCustomModel(m.modelId), source: m.source })),
      });
    } catch (err) {
      console.error("[provider-models] add failed:", err instanceof Error ? err.name : "unknown");
      return NextResponse.json({ error: "Could not add that model." }, { status: 500 });
    }
  }

  if (parsed.action === "select") {
    // The model has to be in the catalogue before it can be chosen. This
    // is the same rule the tutor route enforces, applied at the point
    // where a reader could otherwise set a default to a value the server
    // would later refuse — which would leave the picker showing a model
    // that can never answer.
    const known = await q.hasProviderModel(db, owner.userId, provider, parsed.modelId);
    if (!known) {
      return NextResponse.json(
        { error: "Add that model to this provider first." },
        { status: 400 },
      );
    }
    try {
      await q.setProviderKeyModel(db, owner.userId, provider, parsed.modelId);
      return NextResponse.json({ ok: true, modelId: parsed.modelId });
    } catch (err) {
      console.error("[provider-models] select failed:", err instanceof Error ? err.name : "unknown");
      return NextResponse.json({ error: "Could not set that model." }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}

/** DELETE — drop one hand-added model. */
export async function DELETE(req: Request, ctx: Params): Promise<Response> {
  const { provider } = await ctx.params;
  const owner = await requireOwnProvider(req, provider, true);
  if (owner instanceof NextResponse) return owner;

  let modelId = "";
  try {
    const body = (await req.json()) as { modelId?: unknown };
    if (typeof body.modelId === "string") modelId = body.modelId.trim();
  } catch {
    // An empty body is not worth a 400 on its own; the check below is the
    // one that matters.
  }
  if (modelId === "" || modelId.length > 120) {
    return NextResponse.json({ error: "Which model?" }, { status: 400 });
  }

  try {
    const removed = await q.deleteProviderModel(db, owner.userId, provider, modelId);
    if (!removed) {
      return NextResponse.json({ error: "No such model." }, { status: 404 });
    }
    const models = await q.listProviderModels(db, owner.userId, provider);
    return NextResponse.json({
      ok: true,
      models: models.map((m) => ({ id: m.modelId, label: labelForCustomModel(m.modelId), source: m.source })),
    });
  } catch (err) {
    console.error("[provider-models] remove failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not remove that model." }, { status: 500 });
  }
}

/**
 * Pull `{baseUrl}/models` and replace the reader's free rows with what
 * came back.
 *
 * Reports the total alongside the kept count, because "found 3 of 210"
 * and "found 210 of 210" are different situations and the reader needs
 * to be able to tell them apart. A provider that serves every model with
 * a `:free` suffix is either generous or mislabelled, and the number is
 * the only evidence either way.
 */
async function refresh(
  req: Request,
  userId: string,
  provider: string,
  baseUrl: string,
): Promise<Response> {
  const row = await q.getProviderKey(db, userId, provider);
  if (row === null) {
    return NextResponse.json({ error: "No such provider." }, { status: 404 });
  }
  const apiKey = openKey(row.encryptedKey);
  if (apiKey === null) {
    return NextResponse.json(
      { error: "That provider's key could not be read — re-enter it in Settings." },
      { status: 409 },
    );
  }

  const found = await fetchProviderModels(baseUrl, apiKey);
  if (!found.ok) {
    return NextResponse.json({ error: found.problem }, { status: 502 });
  }

  try {
    await q.replaceFreeProviderModels(
      db,
      userId,
      provider,
      found.free.map((m) => m.id),
    );
    const models = await q.listProviderModels(db, userId, provider);
    return NextResponse.json({
      ok: true,
      found: found.free.length,
      total: found.total,
      models: models.map((m) => ({
        id: m.modelId,
        label: labelForCustomModel(m.modelId),
        source: m.source,
      })),
    });
  } catch (err) {
    console.error("[provider-models] refresh failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not save the model list." }, { status: 500 });
  }
}