import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getOwnedCodes } from "@/lib/modules";
import {
  InvalidPracticeQuestion,
  gradeAnswer,
  outcomeFor,
  parseQuestion,
} from "@/lib/practice-grading";
import { getSession } from "@/lib/session";
import * as q from "@Main/db/queries";
import { db } from "@/services";

/**
 * GRADE A PRACTICE ANSWER
 * ------------------------------------------------------------
 * The request carries only `questionId` and `chosenOptionId`. Never a claimed
 * verdict: the correct option is decided here, from the stored spec, so there
 * is nothing for a modified client to lie about.
 *
 * ------------------------------------------------------------------------
 * THE ORDERING IS THE WHOLE SECURITY MODEL
 *
 *   1. session
 *   2. load the question          <- from here on the answer is known to us
 *   3. CHECK THE PURCHASE, before grading
 *   4. grade
 *   5. record the attempt
 *
 * Step 3 comes after step 2 because the module lives on the question, and it
 * comes BEFORE step 4 because grading produces the answer. The other order —
 * grade, then check — would tell an unpaid caller the correct option and only
 * then refuse to record it, which is the exact leak this route exists to
 * prevent.
 *
 * This is why `getPracticeQuestionById` takes no entitlement filter and why
 * that is documented on it: the filter cannot be applied before the row is
 * read, so the check has to happen here, immediately after, and before
 * anything derived from the spec is returned.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Sign in to answer." }, { status: 401 });
  }

  let body: { questionId?: unknown; chosenOptionId?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  const { questionId, chosenOptionId } = body;
  if (typeof questionId !== "string" || questionId.length === 0) {
    return NextResponse.json({ error: "Which question was that?" }, { status: 400 });
  }

  // --- step 2: load it ---
  let row: q.PracticeQuestionRow | null;
  try {
    row = await q.getPracticeQuestionById(db, questionId);
  } catch (err) {
    console.error("[practice] could not load the question:", err instanceof Error ? err.message : String(err));
    return NextResponse.json({ error: "Practice is temporarily unavailable." }, { status: 503 });
  }

  if (row === null) {
    return NextResponse.json({ error: "That question does not exist." }, { status: 404 });
  }

  // --- step 3: entitlement, BEFORE the grade is computed ---
  //
  // A 404 and a 403 are told apart deliberately. 403 says "this exists, you
  // do not own it", which is a small disclosure about the catalogue; 404 does
  // not. The PDF route made the same call in the other direction because it
  // resolves the slug AFTER the session check, and here the id is
  // reader-supplied from a page they already hold, so the id space is not
  // being walked.

  // --- step 3: entitlement, BEFORE the grade is computed ---
  //
  // A 404 and a 403 are told apart deliberately. 403 says "this exists, you
  // do not own it", which is a small disclosure about the catalogue; 404 does
  // not. The PDF route made the same call in the other direction because it
  // resolves the slug AFTER the session check, and here the id is
  // reader-supplied from a page they already hold, so the id space is not
  // being walked.
  const owned = await getOwnedCodes(user.id);
  if (!owned.has(row.module_code)) {
    return NextResponse.json({ error: "Buying that module unlocks this question." }, { status: 403 });
  }

  // --- step 4: grade, against the validated spec ---
  let result;
  try {
    result = gradeAnswer(parseQuestion(row), chosenOptionId);
  } catch (err) {
    if (err instanceof InvalidPracticeQuestion) {
      console.error(`[practice] ${err.message}`);
      return NextResponse.json(
        { error: "That question could not be marked. It is being looked at." },
        { status: 503 },
      );
    }
    // A format this route does not grade. Refusing is right: it will be
    // implemented when the format ships, and until then an answer endpoint
    // that guessed would be worse than one that declines.
    console.error("[practice] cannot grade:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "That question type is not ready to be marked yet." },
      { status: 501 },
    );
  }
  // --- step 5: record it ---
  //
  // Best effort, and deliberately so. The reader has their answer whether or
  // not this write lands, and a failure here must not retract a verdict they
  // have already been shown — that would be a worse lie than losing one row of
  // history.
  try {
    await q.recordPracticeAttempt(db, user.id, {
      questionId: row.id,
      // From the ROW, not the request body: a client that files a
      // multiple-choice attempt under another format would poison the
      // per-format history the weakness profile will be built on.
      format: row.format,
      outcome: outcomeFor(result),
      detail: {
        chosenOptionId: result.chosenOptionId,
        unrecognised: result.unrecognised,
      },
    });
  } catch (err) {
    console.error(
      "[practice] the answer was graded but the attempt could not be recorded:",
      err instanceof Error ? err.message : String(err),
    );
  }

  return NextResponse.json(result, { headers: { "cache-control": "private, no-store" } });
}