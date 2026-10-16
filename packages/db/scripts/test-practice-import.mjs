import { readFileSync } from "node:fs";
import pg from "pg";

/**
 * THE IMPORT IS IDEMPOTENT, AND RE-IMPORTING NEVER ROBS A READER
 * ------------------------------------------------------------------------
 * B1c is one sentence in the plan: "rolling updates, where a question's id
 * is stable forever, so a reader's history never robs when the catalogue is
 * re-imported". Everything else in the practice feature rests on that, so
 * it is tested against the real database rather than asserted in a comment.
 *
 * Each property below is a way the feature could quietly lose data:
 *
 *   1. Importing twice is a no-op the second time. If it were not, every
 *      weekly batch would rewrite every row and the change-detection the
 *      importer relies on would be worthless.
 *   2. Editing a question's body UPDATES in place and keeps the same id,
 *      so history survives a typo fix.
 *   3. A question removed from the file is KEPT, because attempts reference
 *      it with ON DELETE RESTRICT. A cascading delete would wipe a reader's
 *      record at the exact moment the author retired the question.
 *   4. The referential guarantee holds: no attempt can point at a question
 *      that does not exist.
 *
 * IT USES ITS OWN FIXTURES, not the authored catalogue. This is a
 * packages/db test and cannot import from apps/web without inverting the
 * dependency, and it does not need to: what is under test is the upsert's
 * behaviour, not which questions happen to exist. The authored catalogue
 * has its own test, apps/web/scripts/test-practice-catalogue.ts.
 *
 * The upsert statement below is a COPY of the one in
 * apps/web/scripts/import-practice-questions.ts, which is a known hazard
 * in this repo -- test-ai-budget.mjs once re-implemented its SQL, called it
 * "verbatim", and went on passing against a copy of the bug it was meant to
 * catch. So the copy is marked as one, and the check that matters is that
 * it fails if the real importer's shape changes.
 *
 * Run from packages/db:
 *   node scripts/test-practice-import.mjs
 */

const url = readFileSync("../../apps/web/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)?.[1].trim();

let passed = 0;
const failures = [];
const ok = (m) => {
  passed += 1;
  console.log(`  ok   ${m}`);
};
const bad = (m) => {
  failures.push(m);
  console.log(`  FAIL ${m}`);
};
const check = (name, cond, detail = "") => (cond ? ok(name) : bad(`${name}${detail ? ` — ${detail}` : ""}`));

const client = new pg.Client({ connectionString: url });
await client.connect();

const Q1 = "fixture-q-1";
const Q2 = "fixture-q-2";
const RETIRED = "fixture-retired";
const READER = "practice-import-probe-reader";
const FIXTURE_IDS = [Q1, Q2, RETIRED];

/** The importer's batch statement, verbatim from the real importer. */
const UPSERT = `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
     select id, format, module_code, topic_slug, difficulty, prompt, tags, spec
       from jsonb_to_recordset($1::jsonb) as x(
              id text, format practice_format, module_code text, topic_slug text,
              difficulty integer, prompt text, tags text[], spec jsonb)
     on conflict (id) do update set
       module_code = excluded.module_code,
       topic_slug  = excluded.topic_slug,
       difficulty  = excluded.difficulty,
       prompt      = excluded.prompt,
       tags        = excluded.tags,
       spec        = excluded.spec,
       updated_at  = now()`;

/** Import a batch, exactly as the importer does. */
async function importBatch(rows) {
  await client.query(UPSERT, [JSON.stringify(rows)]);
}

const fixture = (id, overrides = {}) => ({
  id,
  format: "application",
  module_code: "MATT101",
  topic_slug: "matt101-limits",
  difficulty: 2,
  prompt: `fixture ${id}`,
  tags: ["fixture"],
  spec: { accepted: [{ value: 1, tolerance: 0.01, relative: false }], solution: "s" },
  ...overrides,
});

async function reset() {
  await client.query(`delete from practice_attempts where question_id = any($1::text[])`, [FIXTURE_IDS]);
  await client.query(`delete from practice_questions where id = any($1::text[])`, [FIXTURE_IDS]);
  await client.query(`delete from "user" where id = $1`, [READER]);
  await client.query(
    `insert into "user" (id, name, email, email_verified, created_at, updated_at)
     values ($1, 'Probe', $2, true, now(), now())`,
    [READER, "practice-import-probe@example.invalid"],
  );
}

/* -- the importer's shape has not drifted ---------------------------- */

console.log("\nthe copy under test still matches the real importer");
const importerSrc = readFileSync(
  new URL("../../../apps/web/scripts/import-practice-questions.ts", import.meta.url),
  "utf8",
);
const shapes = [
  ["upsert target", "insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)"],
  ["arbiter is the stable id", "on conflict (id) do update set"],
  ["updated_at advanced", "updated_at  = now()"],
  ["jsonb_to_recordset, not unnest", "from jsonb_to_recordset($1::jsonb) as x("],
  ["tags read as text[]", "tags text[]"],
  // The pre-filter. Without it every weekly run rewrites the whole
  // catalogue, which the idempotency section below characterises.
  ["unchanged rows are excluded from the batch", "[...toInsert, ...toUpdate].map("],
  ["the batch is skipped entirely when there is nothing to write", "if (toInsert.length > 0 || toUpdate.length > 0) {"],
];
for (const [name, needle] of shapes) {
  check(name, importerSrc.includes(needle), `the importer no longer contains "${needle}"`);
}

/* -- 1. idempotency -------------------------------------------------- */

await reset();
console.log("\nidempotency");

await importBatch([fixture(Q1), fixture(Q2)]);
const first = await client.query(`select count(*)::int as n from practice_questions where id = any($1::text[])`, [FIXTURE_IDS]);
check("the first import inserts both fixtures", first.rows[0].n === 2, `got ${first.rows[0].n}`);

// Push the timestamps back, so a second import that rewrites identical
// values would visibly advance them.
await client.query(
  `update practice_questions set updated_at = updated_at - interval '1 hour' where id = any($1::text[])`,
  [FIXTURE_IDS],
);
const before = await client.query(
  `select id, updated_at from practice_questions where id = any($1::text[]) order by id`,
  [FIXTURE_IDS],
);

await importBatch([fixture(Q1), fixture(Q2)]);
const second = await client.query(
  `select id, updated_at from practice_questions where id = any($1::text[]) order by id`,
  [FIXTURE_IDS],
);

check(
  "a second import does not add rows",
  second.rows.length === 2,
  `got ${second.rows.length}`,
);

/*
 * A characterisation, and the reason the importer filters before it
 * writes. ON CONFLICT DO UPDATE rewrites every named column even when the
 * incoming values are identical, so this statement alone marks every row in
 * the catalogue dirty on every run. The importer therefore selects the rows
 * to write BEFORE building the batch — which is the assertion above that
 * guards, because a weekly batch that rewrote all 500 questions would make
 * updated_at meaningless and cost write amplification for nothing.
 */
const touched = before.rows.filter(
  (b) => second.rows.find((s) => s.id === b.id)?.updated_at.getTime() !== b.updated_at.getTime(),
);
check(
  "the upsert DOES rewrite identical rows (so the importer must pre-filter)",
  touched.length === 2,
  `only ${touched.length} timestamps moved — this characterisation no longer holds, and the pre-filtering assertion above is what actually matters`,
);

// Prove the counter-case: the rows really are byte-identical, so the
// movement is the upsert and not a genuine change.
const bodies = await client.query(
  `select id, module_code, topic_slug, difficulty, prompt, tags, spec
     from practice_questions where id = any($1::text[]) order by id`,
  [FIXTURE_IDS],
);
check(
  "the row bodies really are unchanged between the two imports",
  bodies.rows.every((r) => r.prompt === `fixture ${r.id}`),
);

/* -- 2. an edit keeps the id and the history ------------------------- */

console.log("\nhistory survives an edit");

await client.query(
  `insert into practice_attempts (id, user_id, question_id, format, outcome, detail)
   values ('probe-attempt-1', $1, $2, 'application', 'correct', '{}'::jsonb)`,
  [READER, Q1],
);

await importBatch([fixture(Q1, { prompt: "fixture q-1 (typo fixed)" }), fixture(Q2)]);
const edited = await client.query(`select prompt from practice_questions where id = $1`, [Q1]);
check("an edited prompt lands in place, on the same id", edited.rows[0].prompt.endsWith("(typo fixed)"), edited.rows[0].prompt);

const still = await client.query(`select id from practice_attempts where id = 'probe-attempt-1'`);
check("the reader's attempt is still attached after the edit", still.rowCount === 1);

const countAfterEdit = await client.query(
  `select count(*)::int as n from practice_questions where id = any($1::text[])`,
  [FIXTURE_IDS],
);
check("editing did not insert a duplicate row", countAfterEdit.rows[0].n === 2, `got ${countAfterEdit.rows[0].n}`);

/* -- 3. a retired question is KEPT ----------------------------------- */

console.log("\nretiring a question does not delete it");

await client.query(
  `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
   values ($1, 'application', 'MATT101', 'matt101-limits', 2, 'gone from the file', ARRAY['t'], '{}'::jsonb)`,
  [RETIRED],
);
await client.query(
  `insert into practice_attempts (id, user_id, question_id, format, outcome, detail)
   values ('probe-attempt-retired', $1, $2, 'application', 'correct', '{}'::jsonb)`,
  [READER, RETIRED],
);

// The batch names only ids present in the file, so a retired question is
// simply absent from the VALUES list.
await importBatch([fixture(Q1), fixture(Q2)]);
const survived = await client.query(`select id from practice_questions where id = $1`, [RETIRED]);
check("a question dropped from the file is still in the database", survived.rowCount === 1);

// And it cannot be deleted while history points at it. That constraint is
// what makes "never deletes" safe rather than merely cautious.
let deleted = false;
try {
  await client.query(`delete from practice_questions where id = $1`, [RETIRED]);
  deleted = true;
} catch {
  /* refused, which is the point */
}
check(
  "a retired question with history attached cannot be deleted",
  !deleted,
  "the DELETE succeeded — attempts would have been orphaned or cascaded away",
);

/* -- 4. integrity ---------------------------------------------------- */

console.log("\nintegrity");

const orphan = await client.query(
  `select count(*)::int as n from practice_attempts a
    left join practice_questions q on q.id = a.question_id
   where q.id is null`,
);
check("no attempt points at a question that does not exist", orphan.rows[0].n === 0, `${orphan.rows[0].n} orphaned`);

const dupes = await client.query(`select id from practice_questions group by id having count(*) > 1`);
check("ids are unique after an upsert", dupes.rowCount === 0);

// A question with no tags is refused by the CHECK, so an untagged question
// cannot reach the table even by hand -- which is what makes B3a's
// weakness profile able to rely on them.
let untagged = false;
try {
  await client.query(
    `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
     values ('fixture-untagged', 'application', 'MATT101', 'matt101-limits', 2, 'p', ARRAY[]::text[], '{}'::jsonb)`,
  );
  untagged = true;
} catch {
  /* refused */
}
check("an untagged question is refused by the database itself", !untagged);

/*
 * CLEAN UP BY DELETING, NOT BY CALLING reset().
 *
 * `reset()` clears the fixture tables and then RE-CREATES the probe user,
 * because the suite needs it for a fresh run. Calling it as the teardown
 * therefore deletes and immediately re-inserts the row it just reported
 * cleaning up — which is how a leftover `practice-import-probe` reader came to
 * sit in the local database long after this suite last ran.
 *
 * A test that prints "probes cleaned up" while leaving one behind is worse than
 * one that says nothing, because the next person to look at the database
 * trusts the message.
 */
await client.query(`delete from practice_attempts where question_id = any($1::text[])`, [FIXTURE_IDS]);
await client.query(`delete from practice_questions where id = any($1::text[])`, [FIXTURE_IDS]);
await client.query(`delete from "user" where id = $1`, [READER]);
const leftReader = await client.query(`select count(*)::int as n from "user" where id = $1`, [READER]);
check("the probe reader is actually gone", leftReader.rows[0].n === 0, `${leftReader.rows[0].n} left behind`);

console.log("\n  probes cleaned up");

await client.end();
console.log(
  failures.length === 0
    ? `\n${passed} passed.`
    : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);