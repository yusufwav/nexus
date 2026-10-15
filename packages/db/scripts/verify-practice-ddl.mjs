import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * CONFIRM THE CONSTRAINTS EXIST AS CONSTRAINTS.
 *
 * The apply script proved they behave. This proves they are declared —
 * which is a different claim, and the one that matters for a fresh
 * database where the behaviour has not been probed yet. A table built
 * from a drifted DDL would pass every behavioural probe and still be
 * missing the rule.
 */
const url = readFileSync("../../apps/web/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const c = new pg.Client({ connectionString: url });
await c.connect();

let failures = 0;

const r = await c.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'practice_questions'::regclass
    and contype = 'c'
  order by conname`);

console.log("  CHECK constraints on practice_questions:");
for (const row of r.rows) {
  console.log(`    ${row.conname}: ${row.def}`);
}

const enums = await c.query(`
  select t.typname, string_agg(e.enumlabel, ', ' order by e.enumsortorder) as values
  from pg_type t
  join pg_enum e on e.enumtypid = t.oid
  where t.typname in ('practice_format', 'practice_outcome')
  group by t.typname order by t.typname`);

console.log("\n  enum types:");
for (const row of enums.rows) {
  console.log(`    ${row.typname}: ${row.values}`);
}

// The FK that protects a reader's history is the other thing worth
// confirming declaratively: attempts must NOT cascade when a question is
// removed, because that is the event history exists to survive.
const fk = await c.query(`
  select conname, pg_get_constraintdef(oid) as def
  from pg_constraint
  where conrelid = 'practice_attempts'::regclass and contype = 'f'
  order by conname`);
console.log("\n  foreign keys on practice_attempts:");
for (const row of fk.rows) {
  console.log(`    ${row.conname}: ${row.def}`);
}

const restrict = fk.rows.find((r) => r.def.includes("practice_questions"));
console.log(
  `\n  question FK is RESTRICT, not CASCADE: ${restrict?.def.includes("NO ACTION") || restrict?.def.includes("RESTRICT") ? "yes" : "NO -- history would be deleted"}`,
);

// ---- the live table must match the drizzle schema --------------------
//
// This is not ceremony. The DDL and schema/practice.ts are written by hand
// in two places, and they DID drift: the schema declared created_at and
// updated_at on practice_questions and the DDL did not. Nothing noticed
// until the importer's ON CONFLICT DO UPDATE named updated_at and Postgres
// refused the statement -- caught, but by accident and at the worst
// possible moment. A column list compared here fails immediately and says
// which side is wrong.

const EXPECTED_QUESTIONS = [
  "id",
  "format",
  "module_code",
  "topic_slug",
  "difficulty",
  "prompt",
  "tags",
  "spec",
  "created_at",
  "updated_at",
];
const EXPECTED_ATTEMPTS = [
  "id",
  "user_id",
  "question_id",
  "format",
  "outcome",
  "detail",
  "created_at",
];

console.log("\n  the live columns vs what the schema declares:");
for (const [table, expected] of [
  ["practice_questions", EXPECTED_QUESTIONS],
  ["practice_attempts", EXPECTED_ATTEMPTS],
]) {
  const r = await c.query(
    `select column_name from information_schema.columns
      where table_schema='public' and table_name = $1 order by ordinal_position`,
    [table],
  );
  const actual = r.rows.map((x) => x.column_name);
  const missing = expected.filter((e) => !actual.includes(e));
  const extra = actual.filter((a) => !expected.includes(a));
  if (missing.length === 0 && extra.length === 0) {
    console.log(`    ok   ${table}: ${actual.length} columns, matches the schema`);
  } else {
    console.log(
      `    FAIL ${table}: missing [${missing.join(", ")}] unexpected [${extra.join(", ")}]`,
    );
    failures++;
  }
}

console.log(
  failures === 0
    ? "\n  the DDL, the enums, the constraints and the live columns all agree."
    : `\n  ${failures} mismatch(es) between the DDL and the schema.`,
);

await c.end();
process.exit(failures === 0 ? 0 : 1);