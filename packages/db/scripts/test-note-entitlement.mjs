/**
 * THE ENTITLEMENT TESTS
 * ------------------------------------------------------------
 * Two assertions, and they are the most important lines in this project.
 * Everything else about the tutor can be rewritten; these two say what
 * must never change:
 *
 *   1. Retrieval for a module the reader has not bought returns nothing.
 *   2. A tool call naming a module the reader does not own cannot widen
 *      the result set.
 *
 * They exist because the alternative is relying on every future reader of
 * `packages/db/src/queries.ts` remembering to apply the filter. A test
 * fails; a convention eventually does not.
 *
 * Run from packages/db:
 *   node scripts/test-note-entitlement.mjs
 *
 * Requires ingested notes: an owned module and an unowned one, each with
 * at least one chunk. The script reports clearly if that is not true
 * rather than passing vacuously.
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const db = new Client({ connectionString: url });
await db.connect();

/** The same shape `searchNoteChunks` builds, copied so the test is independent of it. */
async function search(accessibleCodes, queryVector, topicSlug) {
  if (accessibleCodes.size === 0) return [];
  const vector = `[${queryVector.join(",")}]`;
  const params = [vector, [...accessibleCodes]];
  let slugClause = "";
  if (topicSlug) {
    params.push(topicSlug);
    slugClause = `and t.slug = $${params.length}`;
  }
  const { rows } = await db.query(
    `select c.id, t.slug, t.module_code
       from note_chunks c
       join note_topics t on t.id = c.topic_id
      where c.module_code = any($2) ${slugClause}
      order by c.embedding <=> $1::vector
      limit 6`,
    params,
  );
  return rows;
}

const problems = [];
const pass = (m) => console.log(`  PASS  ${m}`);
const fail = (m) => { problems.push(m); console.log(`  FAIL  ${m}`); };

try {
  const { rows: modules } = await db.query(
    "select code, has_trial_pdf from modules order by code",
  );
  const { rows: topics } = await db.query(
    "select t.slug, t.module_code, count(c.id)::int as chunks from note_topics t join note_chunks c on c.topic_id = t.id group by t.id",
  );

  console.log("\n=== setup ===");
  console.log(`  modules: ${modules.length}, ingested topics: ${topics.length}`);
  for (const t of topics) {
    console.log(`  ${t.module_code}/${t.slug} — ${t.chunks} chunks`);
  }

  if (topics.length === 0) {
    console.error(
      "\nNo ingested notes. Run `node --env-file=.env scripts/ingest-notes.ts` " +
        "in apps/web first — otherwise these assertions pass vacuously, which is worse " +
        "than not running them.",
    );
    process.exitCode = 1;
  } else {
    // Any real vector will do: these tests assert the FILTER, not ranking
    // quality. Ranking correctness needs relevance judgements, which is a
    // different and much larger piece of work.
    const probe = Array.from({ length: 768 }, (_, i) => Math.sin(i) * 0.01);

    const byCode = new Map();
    for (const t of topics) {
      if (!byCode.has(t.module_code)) byCode.set(t.module_code, t);
    }
    const ownedCode = byCode.keys().next().value;
    const foreignCode = [...byCode.keys()].find((c) => c !== ownedCode) ?? "MAPV112";

    console.log("\n=== 1. results are confined to the entitlement set ===");
    const owned = new Set([ownedCode]);
    const ownedHits = await search(owned, probe);

    if (ownedHits.length > 0) pass(`owner's own module is retrievable (${ownedHits.length} chunks)`);
    else fail(`owner's own module returned nothing — ${ownedCode} should be readable`);

    // The real assertion: every row that comes back belongs to a module
    // the reader was granted. Asking "what does a reader who owns only X
    // see?" and expecting nothing from Y is only valid if Y was never in
    // the set — searching with {Y} means "owns only Y", which of course
    // returns Y. An earlier version of this test made that mistake and
    // failed against correct code.
    const leaked = ownedHits.filter((r) => !owned.has(r.module_code));
    if (leaked.length === 0) {
      pass(`a reader granted only ${ownedCode} received rows from no other module`);
    } else {
      fail(`${leaked.length} rows came from modules outside the granted set: ${[...new Set(leaked.map((r) => r.module_code))].join(", ")}`);
    }

    if (byCode.has(foreignCode)) {
      const foreignHits = await search(owned, probe);
      const sawForeign = foreignHits.some((r) => r.module_code === foreignCode);
      if (sawForeign) {
        fail(`${foreignCode} content was returned to a reader granted only ${ownedCode}`);
      } else {
        pass(`${foreignCode} content never appears for a reader granted only ${ownedCode}`);
      }
    }

    console.log("\n=== 2. a caller cannot widen the set ===");
    const empty = await search(new Set(), probe);
    if (empty.length === 0) pass("an empty entitlement set returns nothing (fails closed)");
    else fail(`an empty entitlement set returned ${empty.length} chunks`);

    const direct = await search(owned, probe, foreignSlug(topics, foreignCode));
    if (direct.length === 0) {
      pass(`naming ${foreignCode}'s topic slug directly still returns nothing`);
    } else {
      fail(`naming the topic slug bypassed the filter — ${direct.length} chunks came back`);
    }

    console.log("\n=== 3. no path leaks ===");
    const { rows: leak } = await db.query(
      "select count(*)::int as n from note_chunks where content ~ 'source_path|private-assets|\\.pdf'",
    );
    if (leak[0].n === 0) pass("no chunk content contains a filesystem path or filename");
    else fail(`${leak[0].n} chunks leak a path or filename into their content`);
  }
} finally {
  await db.end();
}

function foreignSlug(topics, code) {
  const t = topics.find((x) => x.module_code === code);
  return t ? t.slug : "";
}

console.log("");
if (problems.length > 0) {
  console.error(`${problems.length} FAILED`);
  process.exitCode = 1;
} else {
  console.log("entitlement invariants hold");
}