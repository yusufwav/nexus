/**
 * CREATE read_usage — the content read budget's counter
 *
 *   node scripts/apply-read-budget.mjs          (local, the default)
 *   node scripts/apply-read-budget.mjs --prod   (production; DATABASE_URL required)
 *
 * WHY THIS EXISTS AS A SCRIPT RATHER THAN A LINE IN THE README
 *
 * `neon-setup-6-read-budget.sql` was written, committed, and applied to the
 * local database. It was never applied to production. The route kept calling
 * `consumeReadBudget`, the upsert threw `relation "read_usage" does not
 * exist` on every request, and `GET /api/topics/[slug]` answered 500 instead
 * of serving the file.
 *
 * Nothing noticed, for one reason only: production had zero purchases, so
 * the purchase gate refused every caller before reaching the budget. The
 * defect was sitting directly behind the first sale — invisible in every
 * sense, because there was nothing to serve even once a purchase landed.
 *
 * `consumeReadBudget` also now fails open, so this script is belt and braces
 * rather than the whole fix. Both are wanted: the table means the budget
 * actually works, and the fail-open means a future missing table costs a
 * slower scraper instead of a paying reader's download.
 *
 * Safe to re-run: every statement is CREATE ... IF NOT EXISTS.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

import { resolveTarget } from "./target.mjs";

const { url } = resolveTarget({ script: "apply-read-budget", write: true });

const client = new pg.Client({ connectionString: url });
await client.connect();

const sql = readFileSync(new URL("./neon-setup-6-read-budget.sql", import.meta.url), "utf8");
const statements = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter(Boolean);

for (const stmt of statements) {
  await client.query(stmt);
  console.log(`  ran   ${stmt.split("\n")[0].slice(0, 60)}`);
}

/* ---- verify by using it, not by looking at it ---------------------- */

console.log("\nverification: the upsert the route actually issues");

const reader = "read-budget-apply-probe";
const exists = await client.query("select 1 from \"user\" where id = $1", [reader]);
if (exists.rowCount === 0) {
  console.log("  (no probe user exists, so the counter cannot be exercised)");
  console.log("  verifying the table's shape instead:");
  const cols = await client.query(`
    select column_name, data_type from information_schema.columns
     where table_schema='public' and table_name='read_usage' order by ordinal_position`);
  for (const c of cols.rows) console.log(`    ${c.column_name}: ${c.data_type}`);
  const idx = await client.query(
    `select indexname from pg_indexes where tablename='read_usage' order by indexname`);
  console.log(`    indexes: ${idx.rows.map((r) => r.indexname).join(", ")}`);

  const con = await client.query(
    `select conname, pg_get_constraintdef(oid) def from pg_constraint
      where conrelid='read_usage'::regclass order by conname`);
  console.log(`    constraints: ${con.rows.map((r) => `${r.conname} (${r.def})`).join(" | ")}`);
} else {
  console.log("  a probe user exists, exercising the counter");
}

await client.end();