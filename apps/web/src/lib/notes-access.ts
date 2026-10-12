import "server-only";

import * as q from "@Main/db/queries";
import { db } from "@/services";

import { getSession } from "@/lib/session";

/**
 * WHAT THE READER MAY READ
 * ------------------------------------------------------------
 * The only function in the app that decides which notes a request can
 * touch. Everything else takes the answer as a parameter and never
 * recomputes it — see the header on that block in packages/db/src/queries.ts.
 *
 * TWO TIERS, because one of them is not real yet.
 *
 *   `paid`      a row in purchases. The end state.
 *   `free`      any module whose catalogue row has hasTrialPdf. A stopgap,
 *               because purchases is empty until checkout exists, and a
 *               gate with no data behind it returns nothing for everyone
 *               — which reads as a broken tutor rather than an honest one.
 *
 * The free tier is a STAND-IN, not a pricing decision, and it is the
 * thing to delete first once payments land. It is scoped as narrowly as
 * it can be: a whole module marked as having a sample, not a whole
 * catalogue. Today that is MATT101 alone, which makes it a usable
 * red-team fixture — MATT101 is the free tier, MAPV112 (bisection) is
 * the paid one — rather than an accidental free copy of everything.
 *
 * WHY FAIL-CLOSED EVERYWHERE: an empty set means "this reader may read
 * nothing", which produces an honest "I don't have notes on that". The
 * opposite mistake — treating an unreachable database as "no
 * restrictions" — would hand over every paid note in the catalogue the
 * moment Postgres blipped. Note `getOwnedCodes` already swallows errors
 * and returns empty, which is the right direction for this and is why
 * that behaviour is inherited rather than overridden.
 *
 * SERVER ONLY: it reads the session and touches the database.
 */
export async function accessibleModuleCodes(): Promise<ReadonlySet<string>> {
  const user = await getSession();
  if (!user) {
    return new Set<string>();
  }

  const codes = new Set<string>();

  try {
    for (const code of await q.getOwnedCodes(db, user.id)) {
      codes.add(code);
    }
  } catch {
    // Fall through with whatever the free tier grants. Returning
    // everything on error is the one outcome this must never produce.
  }

  try {
    for (const m of await q.listModules(db)) {
      if (m.hasTrialPdf) {
        codes.add(m.code);
      }
    }
  } catch {
    // No catalogue, so no free tier. Still fail-closed.
  }

  return codes;
}