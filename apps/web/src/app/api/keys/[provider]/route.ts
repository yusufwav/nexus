import { NextResponse } from "next/server";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { isProviderSlug } from "@/lib/providers";
import { requireUser } from "@/lib/require-user";

/**
 * DELETE /api/keys/<provider> — remove one of this reader's credentials.
 *
 * Scoped by user in the query, not by an id from the URL, so one reader
 * cannot delete another's key even by guessing. A provider that is not
 * the reader's answers 404 rather than 403, for the same reason the chat
 * history does: "not yours" and "does not exist" must be
 * indistinguishable, or this endpoint becomes an oracle for which keys
 * exist.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ provider: string }> },
): Promise<Response> {
  // Origin-checked: this destroys a credential. Removing someone else's
  // is the outcome that matters, and while the `user_id` scoping below
  // already prevents that, it is the reason to be explicit about the
  // request's origin rather than relying on one browser default.
  const user = await requireUser(req);
  if (user instanceof NextResponse) {
    return user;
  }

  const { provider } = await ctx.params;
  if (!isProviderSlug(provider)) {
    return NextResponse.json({ error: "No such key." }, { status: 404 });
  }

  try {
    const removed = await q.deleteProviderKey(db, user.id, provider);
    if (!removed) {
      return NextResponse.json({ error: "No such key." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[keys] delete failed:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ error: "Could not remove that key." }, { status: 500 });
  }
}