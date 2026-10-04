import "varlock/auto-load";

import { drizzle } from "drizzle-orm/node-postgres";

import { CATALOG } from "./module-catalog";
import { relations } from "./relations";
import { modules } from "./schema/modules";

/**
 * SEED
 * ------------------------------------------------------------
 * Writes the 13-module catalogue into the `modules` table. Safe to
 * run repeatedly: it upserts on `code`, so editing a price or
 * flipping a module to `coming-soon` takes effect on the next run
 * instead of duplicating rows.
 *
 *   pnpm db:seed          (from the repo root)
 *
 * Ids are derived from the code ("mod_MATT101") rather than random,
 * so re-seeding is idempotent and existing purchases keep pointing
 * at the same module rows.
 */

const DATABASE_URL = process.env.DATABASE_URL ?? "";

async function main(): Promise<void> {
  if (!DATABASE_URL) {
    console.error("DATABASE_URL is not set. Start the Supabase stack first.");
    process.exitCode = 1;
    return;
  }

  const db = drizzle(DATABASE_URL, { relations });

  const rows = CATALOG.map((m, i) => ({
    id: `mod_${m.code}`,
    code: m.code,
    name: m.name,
    description: m.description,
    priceCents: m.priceCents,
    hasTrialPdf: m.hasTrialPdf,
    status: m.status,
    sortOrder: i,
  }));

  // One statement per row rather than a batched upsert: `set` takes a
  // single object, so a batch would need the values inlined anyway,
  // and 13 round trips on a cold seed is not worth optimising away.
  for (const row of rows) {
    await db
      .insert(modules)
      .values(row)
      .onConflictDoUpdate({
        target: modules.code,
        set: {
          name: row.name,
          description: row.description,
          priceCents: row.priceCents,
          hasTrialPdf: row.hasTrialPdf,
          status: row.status,
          sortOrder: row.sortOrder,
          updatedAt: new Date(),
        },
      });
  }

  console.log(`seeded ${rows.length} modules`);
}

await main();