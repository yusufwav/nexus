import { and, asc, eq } from "drizzle-orm";

import type { Database } from ".";
import { modules, purchases } from "./schema/modules";

/**
 * READS
 * ------------------------------------------------------------
 * Catalogue queries live here rather than in the app, because this
 * package owns the drizzle dependency. Callers pass the Database
 * returned by createDb().
 *
 * Every function can be treated by a caller as "throw means fall
 * back to the bundled list" — see apps/web/src/lib/modules.ts, which
 * swallows errors so the public pages render with Docker off.
 */

export async function listModules(db: Database) {
  return db.select().from(modules).orderBy(asc(modules.sortOrder));
}

export async function getModuleByCode(db: Database, code: string) {
  const rows = await db.select().from(modules).where(eq(modules.code, code)).limit(1);
  return rows[0] ?? null;
}

/** Course codes the user has paid for. Pending and refunded rows do not count. */
export async function getOwnedCodes(db: Database, userId: string) {
  const rows = await db
    .select({ code: modules.code })
    .from(purchases)
    .innerJoin(modules, eq(purchases.moduleId, modules.id))
    .where(and(eq(purchases.userId, userId), eq(purchases.status, "paid")));
  return new Set(rows.map((r) => r.code));
}

/** A user's purchases with the module joined in, oldest first. */
export async function listPurchases(db: Database, userId: string) {
  return db
    .select({
      id: purchases.id,
      amountCents: purchases.amountCents,
      status: purchases.status,
      provider: purchases.provider,
      createdAt: purchases.createdAt,
      code: modules.code,
      name: modules.name,
    })
    .from(purchases)
    .innerJoin(modules, eq(purchases.moduleId, modules.id))
    .where(eq(purchases.userId, userId))
    .orderBy(asc(purchases.createdAt));
}