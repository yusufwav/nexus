import { getOwnedCodes } from "@/lib/modules";
import { requireSession } from "@/lib/session";
import * as q from "@Main/db/queries";
import { db } from "@/services";

import Practice from "./practice";

/**
 * PRACTICE — /practice
 * ------------------------------------------------------------
 * The practice index. A thin server component: it resolves the reader and
 * their purchases on the server, then hands a plain count list to the
 * interactive half. Nothing here renders a question, because the questions
 * come from the API with their answers stripped — see lib/practice-grading.ts
 * for why that matters and why it is not optional.
 *
 * Auth required, same reasoning as /ai: the check here stops an anonymous
 * visitor seeing the page, and the one in /api/practice/questions stops a
 * direct call to the endpoint. Either alone leaves a hole.
 *
 * WHY NO SUBSCRIPTION TIER: practice hangs off the SAME purchase check as the
 * PDFs. Buying a module unlocks its questions, exactly as it unlocks its notes,
 * because that is the deal the reader already bought. A separate "practice
 * pass" would be a second product rather than a feature of this one.
 */
export default async function PracticePage(): Promise<React.JSX.Element> {
  const user = await requireSession("/practice");
  const owned = await getOwnedCodes(user.id);

  // Modules the reader owns AND that have questions written. A module with no
  // practice questions is omitted rather than shown empty, so the index never
  // offers a dead end — the catalogue is young and most modules are empty.
  //
  // The COUNT filters to multiple choice, because that is all this route serves.
  // Counting every row is what made the index lie: MAPV112 advertised
  // "1 question" and delivered none, since its only question is an application
  // one. The two sides must filter identically or the promise on the card is
  // not the number the session delivers.
  //
  // A FAILURE IS NOT AN EMPTY LIST. Both queries used to `.catch(() => [])`,
  // which made a dead database and a catalogue with nothing in it look
  // identical — and the page said "No practice questions yet. They arrive with
  // your module as they are written", which is simply untrue during an outage,
  // with no retry and nothing on screen pointing at what happened. So the
  // failure is carried through and rendered as a failure.
  let counts: ReadonlyArray<{ moduleCode: string; count: number }> = [];
  let loadFailed = false;
  try {
    const rows = await q.countPracticeQuestionsByModule(db, owned);
    counts = rows.filter((r) => r.count > 0);
  } catch (err) {
    loadFailed = true;
    console.error(
      "[practice] could not count questions:",
      err instanceof Error ? err.message : String(err),
    );
  }

  let modules: ReadonlyArray<{ code: string; name: string; count: number }> = [];
  if (!loadFailed) {
    try {
      const rows = await q.listModules(db);
      modules = rows
        .filter((m) => counts.some((c) => c.moduleCode === m.code))
        .map((m) => ({
          code: m.code,
          name: m.name,
          count: counts.find((c) => c.moduleCode === m.code)?.count ?? 0,
        }));
    } catch (err) {
      loadFailed = true;
      console.error(
        "[practice] could not list modules:",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return <Practice modules={modules} loadFailed={loadFailed} />;
}