import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * APPLY THE PRACTICE DDL, then check it landed.
 *
 * Idempotent by construction -- everything is CREATE ... IF NOT EXISTS, and
 * the enums are guarded separately because CREATE TYPE has no such clause.
 */
const dbUrl = readFileSync("../../apps/web/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();

const client = new pg.Client({ connectionString: dbUrl });
await client.connect();

// ---- enums, guarded ---------------------------------------------------------
const ENUMS = [
  `CREATE TYPE practice_format AS ENUM ('multiple-choice', 'application', 'proof-order')`,
  `CREATE TYPE practice_outcome AS ENUM ('correct', 'incorrect', 'partial')`,
];

for (const stmt of ENUMS) {
  const exists = await client.query("select 1 from pg_type where typname = $1", [
    stmt.match(/CREATE TYPE (\w+)/)[1],
  ]);
  if (exists.rowCount > 0) {
    console.log(`  skip  ${stmt.match(/CREATE TYPE (\w+)/)[1]} (exists)`);
  } else {
    await client.query(stmt);
    console.log(`  made  ${stmt.match(/CREATE TYPE (\w+)/)[1]}`);
  }
}

// ---- tables -----------------------------------------------------------------
const sql = readFileSync(new URL("./neon-setup-7-practice.sql", import.meta.url), "utf8");
const statements = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n")
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

for (const stmt of statements) {
  await client.query(stmt);
  console.log(`  ran   ${stmt.split("\n")[0].slice(0, 62)}`);
}

// ---- verify -----------------------------------------------------------------
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
console.log("  indexes:", idx.rows.map((r) => r.indexname).join(", "));

// The CHECK constraints are the part most likely to be silently wrong, so
// test them rather than trusting the DDL parsed.
const checks = [
  {
    name: "difficulty 4 accepted",
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-d4', 'application', 'MATT101', 'matt101-limits', 4, 'p', ARRAY['t'], '{}'::jsonb)`,
    shouldFail: false,
  },
  {
    name: "difficulty 5 refused",
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-d5', 'application', 'MATT101', 'matt101-limits', 5, 'p', ARRAY['t'], '{}'::jsonb)`,
    shouldFail: true,
  },
  {
    name: "empty tags refused",
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-t0', 'application', 'MATT101', 'matt101-limits', 2, 'p', ARRAY[]::text[], '{}'::jsonb)`,
    shouldFail: true,
  },
  {
    name: "an unknown format refused",
    sql: `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
          values ('probe-f', 'essay', 'MATT101', 'matt101-limits', 2, 'p', ARRAY['t'], '{}'::jsonb)`,
    shouldFail: true,
  },
];

console.log("\n  the CHECK constraints, actually exercised:");
for (const c of checks) {
  try {
    await client.query(c.sql);
    const failed = c.shouldFail;
    console.log(`  ${failed ? "FAIL" : "ok  "}  ${c.name} — ${failed ? "ACCEPTED but should be refused" : "accepted"}`);
  } catch (e) {
    const passed = c.shouldFail;
    console.log(`  ${passed ? "ok  " : "FAIL"}  ${c.name} — refused (${String(e.message).split("\n")[0].slice(0, 48)})`);
  }
}

await client.query("delete from practice_questions where id like 'probe-%'");
const left = await client.query("select count(*)::int as n from practice_questions");
console.log(`\n  probes cleaned up; practice_questions now holds ${left.rows[0].n} rows`);

await client.end();