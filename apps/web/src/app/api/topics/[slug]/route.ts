import { readFile } from "node:fs/promises";
import path from "node:path";

import type { NextRequest } from "next/server";

import { MODULE_TOPICS, type ModuleTopic } from "@/content/module-topics";
import { getOwnedCodes } from "@/lib/modules";
import { getSession } from "@/lib/session";

/**
 * TOPIC PDF — pay gated
 * ------------------------------------------------------------
 * Serves one topic's PDF, and only to someone who has paid for the
 * module it belongs to. A topic is never gated on its own: paying
 * for MATT101 unlocks every topic on MATT101, because the product is
 * sold per module and the topics are how that module is delivered.
 *
 * The three gates, in order:
 *
 *   1. session   — no account, nothing. getSession() returns null
 *                  rather than throwing, so an unreachable auth
 *                  database reads as "logged out" and denies.
 *   2. purchase  — getOwnedCodes() counts only status === "paid", so
 *                  a pending or refunded row unlocks nothing. This
 *                  is the gate that swaps the buy button for a
 *                  download button once checkout exists.
 *   3. the file  — pdf: null means the topic has no PDF yet, which is
 *                  a 404 rather than a 403: there is nothing to gate.
 *
 * The slug is looked up in the registry rather than joined onto a
 * path, so a request cannot escape /public by crafting "../..".
 * Only `topic.pdf` reaches the filesystem, and it is developer-set.
 *
 * TODO: move these out of /public into private storage. While they
 * sit there, /topics/<file>.pdf is fetchable by anyone who guesses
 * the name — this route is the intended way in, not the only one.
 * See IDEAS/TODO.md.
 */

type Params = { readonly params: Promise<{ slug: string }> };

type Located = { readonly code: string; readonly topic: ModuleTopic };

/** Find a topic by slug across every module, with its parent code. */
function findTopic(slug: string): Located | null {
  for (const [code, topics] of Object.entries(MODULE_TOPICS)) {
    const hit = topics.find((t) => t.slug === slug);
    if (hit) {
      return { code, topic: hit };
    }
  }
  return null;
}

export async function GET(_req: NextRequest, { params }: Params): Promise<Response> {
  const { slug } = await params;

  const found = findTopic(slug);
  if (!found || found.topic.pdf === null) {
    return new Response("That topic does not exist.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // --- gate 1: a session ---
  const user = await getSession();
  if (!user) {
    return new Response("Sign in to download this topic.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // --- gate 2: has paid for the parent module ---
  const owned = await getOwnedCodes(user.id);
  if (!owned.has(found.code)) {
    return new Response(`Buying ${found.code} unlocks this topic.`, {
      status: 403,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // --- gate 3: the file itself ---
  // The path comes from the registry, never from the request, so it
  // cannot traverse. The check is belt-and-braces anyway.
  const rel = found.topic.pdf.replace(/^\/+/, "");
  if (rel.includes("..")) {
    return new Response("Not found.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  try {
    const file = await readFile(path.join(process.cwd(), "public", rel));
    const filename = rel.split("/").pop() ?? `${found.topic.slug}.pdf`;

    return new Response(new Uint8Array(file), {
      headers: {
        "content-type": "application/pdf",
        "cache-control": "private, no-store",
        // Topics are only ever fetched to be saved, so this is always
        // an attachment. The preview iframe deliberately points at
        // /api/trial instead, which serves with no filename at all —
        // Chrome downloads any PDF that carries one, which would turn
        // the preview into a download on page load.
        "content-disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return new Response("That PDF has not been written yet.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}