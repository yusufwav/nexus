import { CATALOG } from "@Main/db/module-catalog";
import * as q from "@Main/db/queries";

import { db } from "@/services";

/**
 * MODULES
 * ------------------------------------------------------------
 * The catalogue reads from Postgres, which is the source of truth
 * once `pnpm db:seed` has run.
 *
 * Docker is frequently not up while the app is being worked on, so
 * every read here falls back to the bundled CATALOG rather than
 * throwing. The same list is duplicated as a plain array in
 * apps/web/src/app/page.tsx, because the landing page is meant to
 * render with no database at all — if you edit one, edit
 * packages/db/src/module-catalog.ts and that array too. Those two
 * files are the only places module copy lives.
 *
 * TODO: log once in development when the fallback fires, so a missing
 * seed does not silently look like a working database.
 */

/** The row shape the pages render from, database or fallback alike. */
export type ModuleView = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly priceCents: number;
  readonly hasTrialPdf: boolean;
  readonly status: "available" | "coming-soon";
};

/** A user's purchases with the module joined in. */
export type PurchaseView = {
  readonly id: string;
  readonly amountCents: number;
  readonly status: "pending" | "paid" | "refunded";
  readonly provider: string;
  readonly createdAt: Date;
  readonly code: string;
  readonly name: string;
};

/** The static catalogue, shaped like a database row. */
function fromCatalog(): ReadonlyArray<ModuleView> {
  return CATALOG.map((m) => ({
    // Matches the id scheme in packages/db/src/seed.ts, so a purchase
    // written against the fallback still points at a real row.
    id: `mod_${m.code}`,
    code: m.code,
    name: m.name,
    description: m.description,
    priceCents: m.priceCents,
    hasTrialPdf: m.hasTrialPdf,
    status: m.status,
  }));
}

/** Every module, in catalogue order. */
export async function listModules(): Promise<ReadonlyArray<ModuleView>> {
  try {
    const rows = await q.listModules(db);
    if (rows.length > 0) {
      return rows;
    }
  } catch {
    // Database unreachable — fall through to the bundled list.
  }
  return fromCatalog();
}

/** One module by its course code, or null if there is no such module. */
export async function getModuleByCode(code: string): Promise<ModuleView | null> {
  try {
    const row = await q.getModuleByCode(db, code);
    if (row !== null) {
      return row;
    }
  } catch {
    // fall through
  }
  return fromCatalog().find((m) => m.code === code) ?? null;
}

/**
 * Which modules the user has paid for, as a set of course codes.
 *
 * Only `paid` counts — a pending or refunded row must never unlock
 * the notes.
 */
export async function getOwnedCodes(
  userId: string | null,
): Promise<ReadonlySet<string>> {
  if (userId === null) {
    return new Set<string>();
  }
  try {
    return await q.getOwnedCodes(db, userId);
  } catch {
    // Nobody owns anything yet.
    return new Set<string>();
  }
}

/** A user's purchases, oldest first. */
export async function listPurchases(userId: string): Promise<ReadonlyArray<PurchaseView>> {
  try {
    return await q.listPurchases(db, userId);
  } catch {
    return [];
  }
}

/** The subject a module belongs to, derived from its code prefix. */
export function subjectOf(code: string): string {
  switch (code.slice(0, 4)) {
    case "MATT":
      return "Mathematics";
    case "MAPV":
      return "Applied Mathematics";
    case "WRAV":
    case "WRSC":
      return "Programming";
    case "WRFV":
      return "Fundamentals";
    case "STAS":
      return "Statistics";
    default:
      return "Other";
  }
}