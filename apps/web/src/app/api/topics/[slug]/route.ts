import type { NextRequest } from "next/server";

import { MODULE_TOPICS, type ModuleTopic } from "@/content/module-topics";
import { getOwnedCodes } from "@/lib/modules";
import { assetFilename, readPrivateAsset } from "@/lib/private-assets";
import { getSession } from "@/lib/session";
import { consumeReadBudget } from "@Main/db/read-budget";
import { db } from "@/services";

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
 *
 *                  This runs BEFORE the slug is resolved, and that
 *                  ordering is the whole fix. findTopic() walks the
 *                  registry, so with this check third an anonymous
 *                  caller could enumerate every topic of every paid
 *                  module by watching for 401 versus 404 — the 401s
 *                  were the catalogue, for free and with no account.
 *   2. purchase  — getOwnedCodes() counts only status === "paid", so
 *                  a pending or refunded row unlocks nothing. This
 *                  is the gate that swaps the buy button for a
 *                  download button once checkout exists.
 *   3. the file  — pdf: null means the topic has no PDF yet, which is
 *                  a 404 rather than a 403: there is nothing to gate.
 *
 * The slug is looked up in the registry rather than joined onto a
 * path, so a request cannot escape the asset root by crafting "../..".
 * Only `topic.pdf` reaches the filesystem, and it is developer-set.
 *
 * The PDFs live in private-assets/, not /public. That is what makes
 * these gates real: a file under /public is served straight off disk
 * by URL, so the 401 and 403 below would not have applied to anyone
 * who simply asked for /topics/<file>.pdf.
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

  // --- gate 1: a session ---
  //
  // FIRST, before the slug is resolved. It used to run last, and the
  // reordering is the whole fix: `findTopic` walks the registry and
  // answers 404 for anything absent, so with the session check after it,
  // an anonymous caller could walk the entire slug list — every topic of
  // every paid module — with no account at all, simply by watching which
  // slugs returned 401 and which returned 404. The 401s were the
  // catalogue.
  //
  // With the order reversed, an anonymous caller gets one answer for
  // every slug and learns nothing about which exist.
  const user = await getSession();
  if (!user) {
    return new Response("Sign in to download this topic.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const found = findTopic(slug);
  if (!found || found.topic.pdf === null) {
    return new Response("That topic does not exist.", {
      status: 404,
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
  // cannot traverse; readPrivateAsset re-checks after resolving all
  // the same. These PDFs live in private-assets/, NOT /public — a
  // file under /public is served by URL with no handler in the path,
  // which would make both gates above decorative.
  const file = await readPrivateAsset(found.topic.pdf);
  if (file === null) {
    return new Response("That PDF has not been written yet.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  // --- gate 4: the pace ---
  //
  // Everything above answers "may this reader have this file". Nothing above
  // answers "how many times may they ask", and one paying reader requesting all
  // 79 topics in a session is a perfectly authorised sequence of requests. This
  // is that missing half, and it delays rather than refuses: see the long
  // note in packages/db/src/read-budget.ts for why a 429 here would be worse
  // than useless.
  //
  // PLACEMENT IS THE POINT, and it is deliberate:
  //
  //   AFTER the purchase gate, so only someone who has actually paid can make
  //   the server hold a connection open. Delaying before entitlement is a free
  //   amplification for anyone with a throwaway account — the cheapest possible
  //   way to tie up a serverless instance's execution time.
  //
  //   AFTER the file was found, so a 404 costs nothing. Counting requests that
  //   served no content would let a reader be penalised for a mistyped slug,
  //   and would hand an attacker a way to burn a budget without extracting
  //   anything.
  //
  // The only requests paced are therefore exactly the ones that returned real
  // bytes to someone entitled to them.
  const budget = await consumeReadBudget(db, user.id);
  if (budget.delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, budget.delayMs));
  }

  return new Response(file, {
    headers: {
      "content-type": "application/pdf",
      "cache-control": "private, no-store",
      // Topics are only ever fetched to be saved, so this is always
      // an attachment. The preview iframe deliberately points at
      // /api/trial instead, which serves with no filename at all —
      // Chrome downloads any PDF that carries one, which would turn
      // the preview into a download on page load.
      "content-disposition": `attachment; filename="${assetFilename(found.topic.pdf)}"`,
    },
  });
}