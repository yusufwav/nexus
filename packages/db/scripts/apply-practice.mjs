/**
 * APPLY THE PRACTICE DDL, then check it landed.
 *
 *   node scripts/apply-practice.mjs              (local, the default)
 *   node scripts/apply-practice.mjs --prod       (production; DATABASE_URL required)
 *
 * Safe to re-run: every statement is CREATE ... IF NOT EXISTS, and the
 * enums are guarded separately because CREATE TYPE has no such clause.
 *
 * It does NOT drop anything. There is a drop script for tearing the tables
 * down when developing, and requiring an explicit call for that is the
 * point.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

import { resolveTarget } from "./target.mjs";

const { url } = resolveTarget({ script: "apply-practice", write: true });

const client = new pg.Client({ connectionString: url });
await client.connect();

/* ---- enums, guarded --------------------------------------------------- */

for (const [name, values] of [
  ["practice_format", ["multiple-choice", "application", "proof-order"]],
  ["practice_outcome", ["correct", "incorrect", "partial"]],
]) {
  const exists = await client.query("select 1 from pg_type where typname = $1", [name]);
  if (exists.rowCount > 0) {
    console.log(`  skip  ${name} (exists)`);
    continue;
  }
  await client.query(`CREATE TYPE ${name} AS ENUM (${values.map((v) => `'${v}'`).join(", ")})`);
  console.log(`  made  ${name}`);
}

/* ---- tables and indexes ---------------------------------------------- */

const sql = readFileSync(new URL("./neon-setup-7-practice.sql", import.meta.url), "utf8");
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

/* ---- verify ------------------------------------------------------------ */

console.log("\nverification:");

const cols = await client.query(`
  select table_name, count(*)::int as n
  from information_schema.columns
  where table_schema = 'public' and table_name like 'practice%'
  group by table_name order by table_name`);
console.log("  columns per table:", JSON.stringify(cols.rows));

const idx = await client.query(`
  select indexname from pg_indexes
  where tablename like 'practice%' order by indexname`);
console.log(`  indexes: ${idx.rows.length} (${idx.rows.map((r) => r.indexname).join(", ")})`);

/*
 * The CHECK constraints are the part most likely to be silently wrong, so
 * they are exercised rather than trusted. Each probe is inserted and then
 * removed, and `shouldFail` states the intended outcome.
 */
const CHECKS = [
  {
    name: "difficulty 4 accepted",
    shouldFail: false,
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-d4', 'application', 'MATT101', 'matt101-limits', 4, 'p', ARRAY['t'], '{}'::jsonb)`,
  },
  {
    name: "difficulty 5 refused",
    shouldFail: true,
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-d5', 'application', 'MATT101', 'matt101-limits', 5, 'p', ARRAY['t'], '{}'::jsonb)`,
  },
  {
    name: "empty tags refused",
    shouldFail: true,
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-t0', 'application', 'MATT101', 'matt101-limits', 2, 'p', ARRAY[]::text[], '{}'::jsonb)`,
  },
  {
    name: "an unknown format refused",
    shouldFail: true,
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-f', 'essay', 'MATT101', 'matt101-limits', 2, 'p', ARRAY['t'], '{}'::jsonb)`,
  },
];

console.log("\n  the CHECK constraints, actually exercised:");
let failed = 0;
for (const c of CHECKS) {
  try {
    await client.query(c.sql);
    if (c.shouldFail) {
      failed++;
      console.log(`  FAIL ${c.name} — accepted but should be refused`);
    } else {
      console.log(`  ok   ${c.name} — accepted`);
    }
  } catch (e) {
    if (c.shouldFail) {
      console.log(`  ok   ${c.name} — refused`);
    } else {
      failed++;
      console.log(`  FAIL ${c.name} — refused but should be accepted: ${String(e.message).split("\n")[0]}`);
    }
  }
}

await client.query("delete from practice_questions where id like 'probe-%'");
const left = await client.query("select count(*)::int as n from practice_questions");
console.log(`\n  probes cleaned up; practice_questions holds ${left.rows[0].n} rows`);

await client.end();
process.exit(failed === 0 ? 0 : 1);