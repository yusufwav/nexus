import { readFileSync } from "node:fs";
import pg from "pg";

import { MODULE_TOPICS } from "../src/content/module-topics";
import { PRACTICE_QUESTIONS } from "../src/content/practice-questions";

/**
 * IMPORT THE CATALOGUE
 * ------------------------------------------------------------------------
 * Reads the authored questions and makes the database match them. Run as
 * the table OWNER, not as nexus_app — the app role holds READ on
 * practice_questions precisely so it cannot rewrite the questions every
 * other reader is graded against.
 *
 *   node apps/web/scripts/import-practice-questions.ts        (dry run)
 *   node apps/web/scripts/import-practice-questions.ts --write (apply)
 *
 * WHY IT IS SAFE TO RUN EVERY WEEK, which is the whole of B1c:
 *
 * The import upserts on `id` and NEVER DELETES. A question the author has
 * removed from the file stays in the database, because `practice_attempts`
 * has a RESTRICT foreign key to it and the alternative — cascading the
 * attempts away — would delete every reader's record of that question at
 * exactly the moment the author retired it. Retiring a question is
 * therefore a two-step, deliberate act: the importer marks it retired, and
 * a human drops the row once the history attached to it has been dealt
 * with. The importer will TELL you what is still referenced rather than
 * doing it for you.
 *
 * What the import DOES change in place is the question body. That is
 * intended: fixing a typo in a solution, or correcting a difficulty, should
 * not orphan a reader's history. `format` is deliberately NOT updated in
 * place — changing a question's format changes how its attempts are graded,
 * and silently reinterpreting history is not something an import should do
 * on its own. It is reported instead.
 *
 * ------------------------------------------------------------------------
 * DRY RUN IS THE DEFAULT, and that is the point. A catalogue import that
 * silently rewrites the rows every reader is graded against is the same
 * shape as the bulk-leak this whole project is built to prevent: one
 * command, wide effect, no review. So the default prints a plan and
 * changes nothing.
 */

const APPLY = process.argv.includes("--write");

/**
 * Wrapped in main() rather than running at the top level because this
 * package is CommonJS, and top-level await does not compile there. The
 * other scripts in this directory avoid await for the same reason; this
 * one needs it for every database call, so the body moves instead.
 */
async function main(): Promise<void> {
const url = readFileSync(new URL("../.env", import.meta.url), "utf8").match(
  /^DATABASE_URL=(.*)$/m,
)?.[1].trim();

if (!url) {
  console.error("DATABASE_URL is not set in apps/web/.env");
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 *  1. cross-check the catalogue against MODULE_TOPICS BEFORE touching
 *     the database at all
 * ------------------------------------------------------------------ */

/**
 * Every question must name a topic that exists.
 *
 * An orphaned question is invisible: it sits in the catalogue, satisfies
 * every zod rule, and is served to nobody because the page that would list
 * it is generated from MODULE_TOPICS. So it is a question nobody can
 * practise with and nobody notices is missing. This check is the only
 * thing standing between a typo'd topicSlug and a silently dead question.
 */
const knownTopics = new Set<string>();
const topicOwners = new Map<string, string>();
for (const [code, topics] of Object.entries(MODULE_TOPICS)) {
  for (const t of topics) {
    knownTopics.add(t.slug);
    topicOwners.set(t.slug, code);
  }
}

const problems: string[] = [];
for (const q of PRACTICE_QUESTIONS) {
  if (!knownTopics.has(q.topicSlug)) {
    problems.push(`${q.id}: topic "${q.topicSlug}" does not exist in MODULE_TOPICS`);
    continue;
  }
  const owner = topicOwners.get(q.topicSlug);
  if (owner !== q.moduleCode) {
    problems.push(
      `${q.id}: moduleCode "${q.moduleCode}" does not own "${q.topicSlug}" (it belongs to ${owner})`,
    );
  }
}

if (problems.length > 0) {
  console.error("the catalogue does not match MODULE_TOPICS; nothing was imported:");
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`cross-checked ${PRACTICE_QUESTIONS.length} questions against MODULE_TOPICS: all resolve`);

/* ------------------------------------------------------------------ *
 *  2. dry run against the live table
 * ------------------------------------------------------------------ */

const client = new pg.Client({ connectionString: url });
await client.connect();

try {

/**
 * One row as it is stored, so the comparison below is typed rather than
 * `any`. pg returns `Record<string, unknown>` by default, which turns
 * `before.format` into an error and, worse, would let a typo in a column
 * name pass the comparison and silently mark every question as changed.
 */
type StoredQuestion = {
  id: string;
  format: string;
  module_code: string;
  topic_slug: string;
  difficulty: number;
  prompt: string;
  tags: string[];
  spec: unknown;
};

/**
 * A JSON value serialised so that two EQUAL values always produce the same
 * string, whatever order their keys happen to be in.
 *
 * This exists because `JSON.stringify` does not have that property, and
 * jsonb actively breaks it: Postgres reorders object keys on storage, so a
 * row read back has its keys sorted while the authored source has them in
 * reading order. Comparing the two with JSON.stringify therefore reported
 * three questions as "updated" on every single run, forever — a catalogue
 * that could never be in sync with itself, and a weekly batch that rewrote
 * rows which had not changed.
 *
 * Sorting keys recursively is the fix. Arrays keep their order, because
 * order in an array is data: reordering proof pieces or answer options
 * would be a real change and must not be normalised away.
 */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
  return `{${entries.join(",")}}`;
}

const existing = await client.query(
  `select id, format, module_code, topic_slug, difficulty, prompt, tags, spec
     from practice_questions`,
);
const existingById = new Map<string, StoredQuestion>(
  existing.rows.map((r) => [r.id, r as StoredQuestion]),
);

const toInsert: string[] = [];
const toUpdate: string[] = [];
const unchanged: string[] = [];
const formatConflicts: string[] = [];

for (const q of PRACTICE_QUESTIONS) {
  const before = existingById.get(q.id);
  if (!before) {
    toInsert.push(q.id);
    continue;
  }
  if (before.format !== q.format) {
    // Refuse silently. Reinterpreting a reader's past attempts under new
    // rules is a decision for a human, not a side effect of an import.
    formatConflicts.push(`${q.id}: stored as "${before.format}", file says "${q.format}"`);
    continue;
  }

  const changed =
    before.module_code !== q.moduleCode ||
    before.topic_slug !== q.topicSlug ||
    before.difficulty !== q.difficulty ||
    before.prompt !== q.prompt ||
    canonical(before.tags) !== canonical([...q.tags]) ||
    canonical(before.spec) !== canonical(q.spec);

  if (changed) toUpdate.push(q.id);
  else unchanged.push(q.id);
}

// Questions in the database that the file no longer contains.
const authored = new Set(PRACTICE_QUESTIONS.map((q) => q.id));
const retired = existing.rows.filter((r) => !authored.has(r.id)).map((r) => r.id);

console.log(`\nplan (${APPLY ? "APPLYING" : "dry run — pass --write to apply"}):`);
console.log(`  new:       ${toInsert.length}`);
console.log(`  updated:   ${toUpdate.length}`);
console.log(`  unchanged: ${unchanged.length}`);
console.log(`  retired:   ${retired.length}`);

if (retired.length > 0) {
  const withHistory = await client.query(
    `select q.id, count(a.id)::int as attempts
       from practice_questions q
       left join practice_attempts a on a.question_id = q.id
      where q.id = any($1::text[])
      group by q.id having count(a.id) > 0`,
    [retired],
  );
  console.log("\n  retired questions are KEPT, not deleted:");
  for (const id of retired) console.log(`    ${id}`);
  if ((withHistory.rows?.length ?? 0) > 0) {
    console.log("  these still have reader history attached and cannot be removed yet:");
    for (const r of withHistory.rows) console.log(`    ${r.id}: ${r.attempts} attempt(s)`);
  }
}

if (formatConflicts.length > 0) {
  console.log("\n  SKIPPED — changing a format would re-grade past attempts:");
  for (const f of formatConflicts) console.log(`    ${f}`);
}

if (!APPLY) {
  console.log("\nnothing was written.");
  await client.end();
  return;
}

/* ------------------------------------------------------------------ *
 *  3. apply
 * ------------------------------------------------------------------ */

/**
 * One statement for the whole batch rather than a loop.
 *
 * A loop would be a round trip per question, and at a few hundred rows
 * that is minutes of holding a connection open on a serverless database.
 *
 * jsonb_to_recordset rather than unnest over parallel arrays. `unnest`
 * cannot be used here at all: passing a `text[][]` makes Postgres treat
 * each ROW as a single text element rather than spreading it, so the tags
 * array arrives as its own string representation and the INSERT fails with
 * "column tags is of type text[] but expression is of type text". A single
 * JSONB parameter carrying typed columns sidesteps that entirely, and
 * interpolates nothing — the rows travel as one bound parameter.
 */
if (toInsert.length > 0 || toUpdate.length > 0) {
  const payload = [...toInsert, ...toUpdate].map((id) => {
    const q = PRACTICE_QUESTIONS.find((x) => x.id === id)!;
    return {
      id: q.id,
      format: q.format,
      module_code: q.moduleCode,
      topic_slug: q.topicSlug,
      difficulty: q.difficulty,
      prompt: q.prompt,
      tags: [...q.tags],
      spec: q.spec,
    };
  });

  await client.query(
    `insert into practice_questions (id, format, module_code, topic_slug, difficulty, prompt, tags, spec)
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
       updated_at  = now()`,
    [JSON.stringify(payload)],
  );
  console.log(`\nwrote ${payload.length} question(s)`);
}

const after = await client.query(`select count(*)::int as n from practice_questions`);
const formats = await client.query(
  `select format, count(*)::int as n from practice_questions group by format order by format`,
);

console.log(`practice_questions now holds ${after.rows[0].n} rows:`);
for (const f of formats.rows) console.log(`  ${f.format}: ${f.n}`);

await client.end();
} finally {
  await client.end().catch(() => {});
}
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});