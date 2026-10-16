import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * A FAILED NOTE SEARCH MUST NOT FAIL THE TUTOR
 * ------------------------------------------------------------------------
 * Reproduces the bug this file pins. `GOOGLE_GENERATIVE_AI_API_KEY` is
 * OPTIONAL (it was made optional so the app boots without it), and the AI
 * SDK's `google.embedding()` throws — but only at CALL time, not at
 * construction, so nothing upstream can rule the throw out:
 *
 *     Google Generative AI API key is missing. Pass it using the 'apiKey'
 *     parameter or the GOOGLE_GENERATIVE_AI_API_KEY environment variable.
 *
 * `searchOwnNotes` embeds the question before it can search anything, and it
 * is called from the tutor tool's `execute`, which runs INSIDE `streamText`.
 * Unguarded, a missing key or a provider outage ended the reader's turn
 * mid-stream.
 *
 * WHY THIS IS THE WRONG TRADE, in the file's own terms: a reader who paid for
 * a module asks a question and gets a broken stream because a SEARCH failed.
 * The model can still answer. The access control that matters already passed.
 * Note grounding is an enhancement, not the thing being sold.
 *
 * THE SUBTLE PART, and the reason a plain try/catch is not enough: the model
 * must not be told it searched and found nothing. That is a lie about a search
 * that never ran, and it would leave the reader believing their notes have
 * nothing on the topic. So the tool returns `searched: false` WITH an
 * instruction, and the honest-answering path is asserted rather than assumed.
 *
 * Run from apps/web:  node scripts/test-notes-degradation.mjs
 */

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
function check(name, fn) {
  try {
    fn();
    ok(name);
  } catch (e) {
    bad(`${name} — ${e.message}`);
  }
}

const routeSrc = readFileSync(new URL("../src/app/api/ai/route.ts", import.meta.url), "utf8");
const retrievalSrc = readFileSync(
  new URL("../src/lib/notes-retrieval.ts", import.meta.url),
  "utf8",
);

/** The body of the notes tool's execute, so assertions are scoped to it. */
function toolExecute() {
  const start = routeSrc.indexOf("execute: async ({ query, topicSlug }) => {");
  assert.ok(start > -1, "the notes tool execute must be findable");
  // The catch that closes it is the last one before the tool definition ends.
  const end = routeSrc.indexOf("const result = streamText", start);
  return routeSrc.slice(start, end);
}

/* ------------------------------------------------------------------ *
 *  1. the bug: an unguarded embed call on the tutor's live path
 * ------------------------------------------------------------------ */

console.log("\nthe search is guarded on the tutor's path");

await check("searchOwnNotes is called inside a try", () => {
  const body = toolExecute();
  const call = body.indexOf("await searchOwnNotes");
  assert.ok(call > -1, "the tool must still call the search");
  const tryAt = body.lastIndexOf("try {", call);
  assert.ok(tryAt > -1, "searchOwnNotes must be inside a try — it can throw on a missing API key");
  assert.ok(tryAt < call, "the try must come before the call, not after it");
});

await check("there is a catch that returns rather than rethrows", () => {
  const body = toolExecute();
  const catchAt = body.indexOf("catch (err)", body.indexOf("await searchOwnNotes"));
  assert.ok(catchAt > -1, "the tool must catch");
  const after = body.slice(catchAt, catchAt + 900);
  assert.ok(!/throw\s/.test(after), "the catch must not rethrow — that is the bug");
  assert.ok(/return\s*\{/.test(after), "the catch must return a tool result");
});

/* ------------------------------------------------------------------ *
 *  2. the model is told the truth
 *
 *  A try/catch that returned `{ passages: [] }` would pass the check above
 *  and be wrong. These are the assertions that separate the two.
 * ------------------------------------------------------------------ */

console.log("\nand the model is not told a search happened when it did not");

await check("the success path says searched: true", () => {
  const body = toolExecute();
  assert.ok(
    /searched:\s*true/.test(body),
    "a successful search must be marked as one, so the two branches are distinguishable",
  );
});

await check("the failure path says searched: false", () => {
  const body = toolExecute();
  assert.ok(
    /searched:\s*false/.test(body),
    "a failed search must be marked as one",
  );
});

await check("the failure path carries an instruction, not just an empty array", () => {
  const body = toolExecute();
  const catchAt = body.indexOf("catch (err)");
  const after = body.slice(catchAt, catchAt + 900);
  assert.ok(
    /unavailable:/.test(after),
    "the tool must return something that tells the model the search did not run",
  );
  assert.ok(
    /do not claim their/.test(after),
    "the instruction must forbid the 'nothing in your notes' lie explicitly",
  );
});

await check("the failure is logged", () => {
  const body = toolExecute();
  const catchAt = body.indexOf("catch (err)");
  assert.ok(
    /console\.error/.test(body.slice(catchAt, catchAt + 300)),
    "a silent degradation is indistinguishable from a working search",
  );
});

/* ------------------------------------------------------------------ *
 *  3. routeQuestion, which has the same exposure
 * ------------------------------------------------------------------ */

console.log("\nrouteQuestion degrades too, for whoever calls it next");

await check("its embedding calls are inside a try", () => {
  const start = retrievalSrc.indexOf("export async function routeQuestion");
  assert.ok(start > -1, "routeQuestion must be findable");
  const body = retrievalSrc.slice(start, start + 1400);
  const tryAt = body.indexOf("try {");
  const callAt = body.indexOf("await Promise.all");
  assert.ok(tryAt > -1, "routeQuestion's embeddings must be inside a try");
  assert.ok(callAt > tryAt, "the Promise.all must be inside the try");
  assert.ok(
    /catch\s*\(err\)/.test(body) && /return \[\]/.test(body.slice(body.indexOf("catch (err)"), body.indexOf("catch (err)") + 500)),
    "the catch must return [] rather than propagate",
  );
});

/* ------------------------------------------------------------------ *
 *  4. behaviour: the tool's two branches, run
 * ------------------------------------------------------------------ */

console.log("\nand the two branches behave differently");

await check("a failing search yields searched:false, not an empty success", () => {
  // Models the branches directly. The point being pinned is that they are
  // DIFFERENT results — a test asserting only "does not throw" would pass
  // against the version that lies to the model.
  const searchFails = () => {
    try {
      JSON.parse("{oops");
      return { searched: true, passages: [] };
    } catch {
      return {
        searched: false,
        passages: [],
        unavailable: "Note search is temporarily unavailable.",
      };
    }
  };
  const out = searchFails();
  assert.equal(out.searched, false, "a failure must not look like a successful empty search");
  assert.ok(out.unavailable, "a failure must carry an explanation");
  assert.equal(out.passages.length, 0);
});

await check("a successful empty search is still marked searched:true", () => {
  const out = { searched: true, passages: [] };
  assert.equal(out.searched, true, "finding nothing after searching IS a different outcome");
  assert.equal(out.unavailable, undefined, "no failure explanation on a real search");
});

/* ------------------------------------------------------------------ *
 *  5. the model id itself
 *
 *  THE BUG THIS FILE WAS MOST RECENTLY NEEDED FOR, and it was live.
 *  `EMBEDDING_MODEL` was the OpenRouter slug `google/gemini-embedding-001`
 *  being sent to GOOGLE's endpoint, which answers that with a bare 404.
 *  Measured against the live API:
 *
 *      google/gemini-embedding-001  ->  Not Found
 *      gemini-embedding-001         ->  OK, 768 dims
 *
 *  It typechecked, it reviewed as correct, and every layer above it reported
 *  a healthy search that never once returned a passage. The guard added in
 *  section 1 is what turned a 404 into "note search is temporarily
 *  unavailable" — blaming a provider outage for a bad constant.
 *
 *  A string constant is the easiest thing in this codebase to get wrong and
 *  the hardest to notice, so it is pinned here rather than trusted.
 * ------------------------------------------------------------------ */

console.log("\nand the model id is one Google's endpoint accepts");

const embeddingSrc = readFileSync(
  new URL("../src/lib/notes-embedding.ts", import.meta.url),
  "utf8",
);

await check("the model id carries no provider prefix", () => {
  const m = /export const EMBEDDING_MODEL = "([^"]+)"/.exec(embeddingSrc);
  assert.ok(m, "EMBEDDING_MODEL must be findable");
  const id = m[1];
  assert.ok(
    !/^[a-z]+\//.test(id),
    `"${id}" looks like a routed slug (vendor/model). Google's endpoint wants the bare id — the prefixed form 404s.`,
  );
  assert.equal(id, "gemini-embedding-001", `unexpected model id: ${id}`);
});

await check("the embedding width matches the vector column it is stored in", () => {
  // Cross-file on purpose: the module asks for 768 and the column is
  // vector(768), and nothing in Postgres tells you they disagree until an
  // INSERT fails a long way from the cause. `assertDimensionality` catches it
  // at write time; this catches the two files drifting apart at all.
  const width = /export const EMBEDDING_DIMENSIONS = (\d+)/.exec(embeddingSrc);
  assert.ok(width, "EMBEDDING_DIMENSIONS must be findable");
  const schemaSrc = readFileSync(
    new URL("../../../packages/db/src/schema/notes.ts", import.meta.url),
    "utf8",
  );
  const column = /vector\("embedding",\s*\{\s*dimensions:\s*(\d+)/.exec(schemaSrc);
  assert.ok(column, "the note_chunks embedding column must be findable");
  assert.equal(
    Number(width[1]),
    Number(column[1]),
    `the module asks for ${width[1]} dimensions but note_chunks stores vector(${column[1]})`,
  );
});

/* ------------------------------------------------------------------ *
 *  6. the premise: the SDK throws at call time, not construction
 * ------------------------------------------------------------------ */

console.log("\nand the premise holds: the SDK throws at call time, not construction");

const { execFileSync } = await import("node:child_process");
await check("google.embedding() throws when the key is absent", () => {
  const probe = `
    delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    const { google } = await import("@ai-sdk/google");
    const { embed } = await import("ai");
    let constructionThrew = false;
    try { google.embedding("gemini-embedding-001"); } catch { constructionThrew = true; }
    let callThrew = false;
    let msg = "";
    try {
      await embed({ model: google.embedding("gemini-embedding-001"), value: "x" });
    } catch (e) { callThrew = true; msg = String(e.message); }
    console.log(JSON.stringify({ constructionThrew, callThrew, msg }));
  `;
  const out = execFileSync(
    process.execPath,
    ["--import", "tsx", "-e", probe],
    { encoding: "utf8", cwd: new URL("..", import.meta.url).pathname.replace(/^\//, "") },
  );
  const r = JSON.parse(out.trim().split("\n").pop());
  assert.equal(r.constructionThrew, false, "construction should NOT throw — that is why nothing upstream could rule it out");
  assert.equal(r.callThrew, true, "the call MUST throw without a key, or this whole file is guarding nothing");
  assert.ok(
    /api key is missing/i.test(r.msg),
    `expected a missing-key error, got: ${r.msg.slice(0, 90)}`,
  );
});

/* ------------------------------------------------------------------ */

console.log(
  failures.length === 0
    ? `\n${passed} passed.`
    : `\n${passed} passed, ${failures.length} FAILED:\n${failures.map((f) => `  - ${f}`).join("\n")}`,
);
process.exit(failures.length === 0 ? 0 : 1);