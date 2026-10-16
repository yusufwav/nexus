/**
 * IS THE DATABASE ACTUALLY AT THE SCHEMA THE REPO DESCRIBES?
 *
 *   node scripts/check-schema-drift.mjs           (local)
 *   node scripts/check-schema-drift.mjs --prod    (production)
 *
 * WHY THIS EXISTS
 *
 * Two production incidents had the same shape, and neither was a code bug:
 *
 *   1. `read_usage` — the DDL was written, committed, applied locally, and
 *      never applied to production. `GET /api/topics/[slug]` called
 *      `consumeReadBudget`, which threw `relation "read_usage" does not
 *      exist` on every request, so topic downloads 500ed.
 *
 *   2. The practice tables — same story, one release behind.
 *
 * Both were invisible for the same reason, and it is the part worth naming:
 * **nothing in the test suite touches production.** Every assertion in
 * `apps/web/scripts` runs against a source file or a local database. A
 * migration that was never run is indistinguishable from a migration that
 * was run and is fine, right up until the first reader hits the route.
 *
 * A CI check would not have caught either: the tests do not run against
 * Neon. This script is the thing that does, and it is deliberately read-only
 * so it is safe to run anywhere, including on a deploy.
 *
 * WHAT IT COMPARES
 *
 * Every `CREATE TABLE IF NOT EXISTS "x"` and `CREATE TYPE x AS ENUM` across
 * `neon-setup-*.sql`, against what the target database actually has.
 *
 * Reading the SQL with a regex is legitimate HERE specifically because the
 * directory's own convention demands it: neon-setup-2-tables.sql says "No
 * dollar-quoting, no DO blocks: every statement stands alone so a naive
 * statement splitter cannot mangle it." That constraint exists so a file can
 * be pasted into the Neon SQL editor, and it is also what makes the files
 * parseable by a script. The convention is load-bearing for both tools.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *
 * It does not check columns, indexes or constraints — `verify-practice-ddl.mjs`
 * does that for the practice tables, against a known column list. Diffing the
 * whole schema is a migration tool's job, and a half-correct version of one
 * would report "fine" while missing the thing that matters. This answers one
 * question precisely: has every table and type the repo declares been created
 * in this database?
 *
 * Exits non-zero when something is missing, so it is usable as a gate.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

import { resolveTarget } from "./target.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------ *
 *  what the repo declares
 * ------------------------------------------------------------------ */

const sqlFiles = readdirSync(HERE)
  .filter((f) => /^neon-setup-\d+.*\.sql$/.test(f))
  .sort((a, b) => {
    // Sort by the NUMBER, not lexically, so -10 follows -9.
    const na = Number(/(\d+)/.exec(a)[1]);
    const nb = Number(/(\d+)/.exec(b)[1]);
    return na - nb;
  });

const declaredTables = new Map(); // table -> file that declares it
const declaredTypes = new Map();
const declaredExtensions = new Set();

for (const file of sqlFiles) {
  const src = readFileSync(join(HERE, file), "utf8");
  // Comments stripped first. The header of every one of these files contains
  // example DDL in prose, and a commented-out CREATE TABLE would otherwise
  // be reported as a missing table forever.
  const code = src.replace(/--[^\n]*/g, "");

  for (const m of code.matchAll(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+"?([a-zA-Z0-9_]+)"?/gi)) {
    if (!declaredTables.has(m[1])) declaredTables.set(m[1], file);
  }
  for (const m of code.matchAll(/CREATE\s+TYPE\s+"?([a-zA-Z0-9_]+)"?\s+AS\s+ENUM/gi)) {
    if (!declaredTypes.has(m[1])) declaredTypes.set(m[1], file);
  }
  for (const m of code.matchAll(/CREATE\s+EXTENSION\s+IF\s+NOT\s+EXISTS\s+"?([a-zA-Z0-9_]+)"?/gi)) {
    declaredExtensions.add(m[1]);
  }
}

console.log(`\n  declared by ${sqlFiles.length} setup file(s):`);
console.log(`    ${sqlFiles.join(", ")}`);
console.log(`    tables: ${declaredTables.size}   types: ${declaredTypes.size}   extensions: ${declaredExtensions.size}`);

/* ------------------------------------------------------------------ *
 *  what the database has
 * ------------------------------------------------------------------ */

const { url, local } = resolveTarget({ script: "check-schema-drift" });
const client = new pg.Client({ connectionString: url });
await client.connect();

const tables = await client.query(
  `select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'`,
);
const haveTables = new Set(tables.rows.map((r) => r.table_name));

/**
 * Only ENUM types, rather than "everything in pg_type".
 *
 * The first version filtered with `typname not like '\_%'` to skip Postgres's
 * internal `_int4`-style array types. Inside a JavaScript template literal
 * `\_` is NOT a recognised escape, so the backslash was silently dropped and
 * Postgres received `NOT LIKE '_%'` — where `_` is a single-character
 * wildcard, so the pattern matches every non-empty string and the filter
 * excluded EVERY row. The result was a present enum reported missing, on the
 * very first run against the very database it had just verified.
 *
 * `typtype = 'e'` says exactly what is meant, contains no escaping, and
 * cannot drift when Postgres adds another internal type.
 */
const types = await client.query(`select typname from pg_type where typtype = 'e'`);
const haveTypes = new Set(types.rows.map((r) => r.typname));

const exts = await client.query("select extname from pg_extension");
const haveExts = new Set(exts.rows.map((r) => r.extname));

/* ------------------------------------------------------------------ *
 *  the comparison
 * ------------------------------------------------------------------ */

let missing = 0;

console.log(`\n  comparing against ${local ? "the local database" : "PRODUCTION"}:`);

const missingTables = [...declaredTables.entries()].filter(([t]) => !haveTables.has(t));
const missingTypes = [...declaredTypes.entries()].filter(([t]) => !haveTypes.has(t));
const missingExts = [...declaredExtensions].filter((e) => !haveExts.has(e));

for (const [table, file] of missingTables) {
  missing++;
  console.log(`  MISSING table "${table}"  — declared in ${file}`);
}
for (const [type, file] of missingTypes) {
  missing++;
  console.log(`  MISSING type  "${type}"  — declared in ${file}`);
}
for (const ext of missingExts) {
  missing++;
  console.log(`  MISSING extension "${ext}"`);
}

if (missing === 0) {
  console.log(`  ok   all ${declaredTables.size} tables, ${declaredTypes.size} types and ${declaredExtensions.size} extensions are present`);
} else {
  console.log(`\n  ${missing} object(s) the repo declares do not exist in this database.`);
  console.log("  Applying them is usually the apply script for that file, e.g.:");
  for (const [table, file] of missingTables.slice(0, 3)) {
    console.log(`    node scripts/apply-*.mjs --prod        # for ${file}`);
  }
  console.log("\n  This is what a never-run migration looks like, and it is invisible to");
  console.log("  every test in this repo because none of them touch this database.");
}

await client.end();
process.exit(missing === 0 ? 0 : 1);