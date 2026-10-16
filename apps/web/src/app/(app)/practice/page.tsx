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
  const counts = await q
    .countPracticeQuestionsByModule(db, owned)
    .then((rows) =>
      rows
        .filter((r) => r.count > 0)
        .map((r) => ({ moduleCode: r.moduleCode, count: r.count })),
    )
    .catch((err: unknown) => {
      // Throwing here would 500 the whole page over a counter. The index is a
      // convenience; the API is the real gate.
      console.error(
        "[practice] could not count questions:",
        err instanceof Error ? err.message : String(err),
      );
      return [];
    });

  const modules = await q
    .listModules(db)
    .then((rows) =>
      rows
        .filter((m) => counts.some((c) => c.moduleCode === m.code))
        .map((m) => ({
          code: m.code,
          name: m.name,
          count: counts.find((c) => c.moduleCode === m.code)?.count ?? 0,
        })),
    )
    .catch(() => [] as ReadonlyArray<{ code: string; name: string; count: number }>);

  return <Practice modules={modules} />;
}