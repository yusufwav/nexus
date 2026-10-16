import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOwnedCodes } from "@/lib/modules";
import { InvalidPracticeQuestion, parseQuestion, publicQuestion } from "@/lib/practice-grading";
import { getSession } from "@/lib/session";
import * as q from "@Main/db/queries";
import { db } from "@/services";

/**
 * SERVE PRACTICE QUESTIONS
 * ------------------------------------------------------------
 * Returns questions for a module the reader has paid for, with the answers
 * REMOVED. See lib/practice-grading.ts for why stripping is this route's job
 * and not an optional extra: a `correct` flag in the payload means every
 * reader's practice is worth nothing.
 *
 * THE GATES, in order:
 *
 *   1. session  — getSession() returns null rather than throwing, so an
 *                 unreachable auth database reads as "logged out" and denies.
 *   2. purchase — getOwnedCodes() counts only status === 'paid'. The filter is
 *                 then applied in SQL by listPracticeQuestions, not here, so
 *                 the authoritative check is the one the database performs.
 *
 * The ORDER matters in the same way it does on the PDF route: resolving
 * questions before the session check would let an anonymous caller enumerate
 * the catalogue of every paid module by watching 401 versus 200.
 *
 * `?module=` is optional. Without it the reader gets every question in every
 * module they own, which is what the practice index page links to. With it,
 * one module.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in to practise." }, { status: 401 });
  }

  const moduleCode = req.nextUrl.searchParams.get("module") ?? undefined;

  // Gate 2. Resolved from the session, never from the request — a caller that
  // could name its own entitlement would make every other check decorative.
  const owned = await getOwnedCodes(user.id);

  let rows;
  try {
    rows = await q.listPracticeQuestions(db, owned, moduleCode ? { moduleCode } : {});
  } catch (err) {
    console.error("[practice] could not load questions:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "Practice is temporarily unavailable. Try again shortly." },
      { status: 503 },
    );
  }

  /*
   * One bad row must not take the page down for everyone.
   *
   * A spec can be malformed if somebody edited the jsonb by hand, or if a
   * migration reshaped it. parseQuestion throws in that case, and the
   * alternative — letting it escape — is that a single bad question returns a
   * 500 and the reader loses the whole module.
   *
   * It is skipped, logged, and the rest of the session still runs. The id is
   * in the log so the row can be found and fixed; the reader is not shown the
   * reason, because there is nothing they could do about it.
   */
  const questions = [];
  const skipped: string[] = [];
  for (const row of rows) {
    try {
      questions.push(publicQuestion(parseQuestion(row)));
    } catch (err) {
      if (err instanceof InvalidPracticeQuestion) {
        skipped.push(row.id);
        console.error(`[practice] skipping a bad question: ${err.message}`);
      } else {
        skipped.push(row.id);
        console.error(`[practice] skipping question ${row.id}:`, err instanceof Error ? err.message : String(err));
      }
    }
  }

  // A named module that has no questions is a 404 rather than an empty list,
  // so a typo'd code is distinguishable from a module that simply has none
  // written yet.
  if (moduleCode && !owned.has(moduleCode)) {
    return NextResponse.json({ error: "Buying that module unlocks its practice questions." }, { status: 403 });
  }

  return NextResponse.json(
    { questions, moduleCode: moduleCode ?? null, skipped: skipped.length },
    // Private and uncached: this response is per-reader, and a cached copy
    // would be one reader's questions served to the next.
    { headers: { "cache-control": "private, no-store" } },
  );
}