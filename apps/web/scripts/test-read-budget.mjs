/**
 * CONTENT READ BUDGET — the pace half of the topic route
 * ------------------------------------------------------------------------
 * The topic route's *access* control is already correct and is not what this
 * file is about: it checks the session before resolving the slug (so an
 * anonymous caller cannot enumerate the catalogue from 401-vs-404), then
 * requires a paid purchase, then reads from `private-assets/` rather than
 * `/public`. That is the "may they have it" half and it works.
 *
 * What it had no answer for was "how many times may they ask". One paying
 * reader requesting all 79 topics in a session is a perfectly authorised
 * sequence of requests, so nothing resisted it.
 *
 * 1. THE LIMIT IS MEASURED, NOT CHOSEN.
 *    Topics are grouped 6-per-module across 13 modules (MAPV112 carries 7), and
 *    a reader works one module at a time, so the largest burst a real reader
 *    can legitimately make is 7. The free allowance must sit above that, or the
 *    feature punishes normal use. Asserted here as a relationship, so a later
 *    edit that lowers the ceiling below the measured burst fails loudly instead
 *    of quietly slowing real readers.
 *
 * 2. IT DELAYS, IT NEVER REFUSES.
 *    A 429 here would be worse than useless twice over: a scraper retries a 429
 *    for free, and a reader throttled away from a PDF they paid for is a
 *    permanently broken account with no route back. Asserted as the ABSENCE of
 *    any refusal, because the presence of a delay is easy to check and the
 *    reintroduction of a 429 is the regression that would matter.
 *
 * 3. THE PACE IS PLACED AFTER ENTITLEMENT AND AFTER THE FILE IS FOUND.
 *    Delaying before the purchase gate is free amplification for anyone with a
 *    throwaway account — the cheapest way to hold a serverless instance open.
 *    Counting 404s would let a reader be penalised for a mistyped slug and
 *    would let an attacker burn budget without extracting anything.
 *
 * Run from apps/web:  node scripts/test-read-budget.mjs
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = join(WEB, "..", "..");
const read = (...p) => readFileSync(join(WEB, ...p), "utf8");
const readPkg = (...p) => readFileSync(join(REPO, ...p), "utf8");

let passed = 0;
const ok = (m) => {
  passed += 1;
  console.log(`  ok   ${m}`);
};
const bad = (m) => {
  console.error(`  FAIL ${m}`);
  process.exitCode = 1;
};

/* --------------------------------- 1. the numbers have a provenance ------- */

/*
 * The largest burst a real reader can legitimately produce, measured in
 * TODO.md section 1: the biggest single module carries 7 topics and a reader
 * works one module at a time.
 */
const MEASURED_HONEST_BURST = 7;
/** The corpus a full pull would take, same measurement. */
const MEASURED_CORPUS = 79;

console.log("\nthe ceiling is above the measured honest burst");

{
  // Load the real curve out of the real source and call it. Regexing the
  // constants could confirm they were typed; only running them confirms the
  // arithmetic, and the arithmetic is the whole feature.
  const src = readPkg("packages", "db", "src", "read-budget.ts");

  const constsStart = src.indexOf("const FREE_PER_WINDOW");
  const constsEnd = src.indexOf("const RETENTION_MS");
  const fnStart = src.indexOf("export function readDelayMs");
  const fnEnd = src.indexOf("\n}", fnStart);
  assert.ok(constsStart > 0 && constsEnd > constsStart, "constants must be findable");
  assert.ok(fnStart > 0 && fnEnd > fnStart, "readDelayMs must be findable");

  const slice = `${src.slice(constsStart, constsEnd)}\n${src
    .slice(fnStart, fnEnd + 2)
    .replace("export function readDelayMs(count: number): number {", "function readDelayMs(count) {")}`;

  let readDelayMs;
  let FREE_PER_WINDOW;
  let DELAY_STEP_MS;
  let MAX_DELAY_MS;
  try {
    const factory = new Function(
      `${slice}
       return { readDelayMs, FREE_PER_WINDOW, DELAY_STEP_MS, MAX_DELAY_MS };`,
    );
    ({ readDelayMs, FREE_PER_WINDOW, DELAY_STEP_MS, MAX_DELAY_MS } = factory());
  } catch (e) {
    throw new Error(
      `could not load the delay curve; its shape changed and this extractor ` +
        `needs updating (${e.message})`,
    );
  }

  assert.equal(typeof readDelayMs, "function");
  ok("the delay curve was loaded from the real source and is callable");

  assert.ok(
    FREE_PER_WINDOW > MEASURED_HONEST_BURST,
    `the free allowance (${FREE_PER_WINDOW}) must exceed the measured honest ` +
      `burst (${MEASURED_HONEST_BURST}) or normal reading gets delayed`,
  );
  ok(`free allowance ${FREE_PER_WINDOW} sits above the measured burst of ${MEASURED_HONEST_BURST}`);

  assert.ok(
    FREE_PER_WINDOW < MEASURED_CORPUS,
    `the free allowance (${FREE_PER_WINDOW}) must sit below a full pull ` +
      `(${MEASURED_CORPUS}) or a loop never feels the delay at all`,
  );
  ok(`free allowance ${FREE_PER_WINDOW} sits below a full corpus pull of ${MEASURED_CORPUS}`);

  // Every request an honest reader can make is free. This is the property
  // that makes degrading safe rather than a gamble.
  for (let count = 1; count <= MEASURED_HONEST_BURST; count += 1) {
    assert.equal(readDelayMs(count), 0, `request ${count} must not be delayed`);
  }
  ok(`requests 1-${MEASURED_HONEST_BURST} are undelayed — the honest burst never feels it`);

  // It must actually bite past the allowance, or it is decoration.
  assert.equal(readDelayMs(FREE_PER_WINDOW + 1), DELAY_STEP_MS, "the first over-limit request pays one step");
  ok("the first request past the allowance pays exactly one step");

  assert.equal(readDelayMs(MEASURED_CORPUS), MAX_DELAY_MS, "a full pull reaches the cap");
  ok(`a full pull (${MEASURED_CORPUS}) reaches the ${MAX_DELAY_MS}ms cap`);

  // Never negative, never NaN, never a hang. A NaN delay here would resolve
  // setTimeout immediately, so a typo would silently disable the feature.
  for (const count of [0, 1, 20, 21, 500, 100_000]) {
    const d = readDelayMs(count);
    assert.ok(Number.isFinite(d), `delay for ${count} must be finite, got ${d}`);
    assert.ok(d >= 0, `delay for ${count} must not be negative, got ${d}`);
    assert.ok(d <= MAX_DELAY_MS, `delay for ${count} must not exceed the cap, got ${d}`);
  }
  ok("delay is finite, non-negative and capped for every input tried");

  // Monotonic: a later request in the same window is never cheaper. This is
  // what stops a caller from reordering a loop to stay under the curve.
  let previous = -1;
  for (let count = 0; count <= 200; count += 1) {
    const d = readDelayMs(count);
    assert.ok(d >= previous, `delay fell from ${previous} to ${d} at count ${count}`);
    previous = d;
  }
  ok("the delay never decreases as the window fills");

  // What a real pull costs, so the claim in the source comment is checkable.
  const pullMs = Array.from({ length: MEASURED_CORPUS }, (_, i) => readDelayMs(i + 1)).reduce(
    (a, b) => a + b,
    0,
  );
  assert.ok(pullMs > 120_000, `a full pull should add minutes of delay, computed ${pullMs}ms`);
  ok(`a full-corpus pull adds ${(pullMs / 1000).toFixed(0)}s of delay across ${MEASURED_CORPUS} requests`);

  const honestMs = Array.from({ length: MEASURED_HONEST_BURST }, (_, i) => readDelayMs(i + 1)).reduce(
    (a, b) => a + b,
    0,
  );
  assert.equal(honestMs, 0, "an honest reader must pay nothing at all");
  ok("an honest reader pays zero milliseconds in total");
}

/* --------------------------------- 2. it delays, it never refuses -------- */

console.log("\nit delays rather than refusing");

{
  const route = read("src", "app", "api", "topics", "[slug]", "route.ts");

  /*
   * Comments are stripped before every check below, and that is not
   * incidental. This route's own comment explains *why* a 429 would be wrong,
   * so asserting on the raw text fails on the explanation of the thing the
   * assertion is checking for. A test that cannot survive a correct comment is
   * a test that will be "fixed" by deleting the reasoning.
   */
  const code = route.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.ok(!/\b429\b/.test(code), "a 429 anywhere in the topic route would break a paying reader");
  ok("no 429 in the code — nobody is ever turned away");

  // The only refusals must be the pre-existing session and purchase gates. A
  // third would be a reader locked out of content they paid for.
  const refusals = [...code.matchAll(/status:\s*(403|429|401)/g)].map((m) => m[1]);
  assert.deepEqual(
    refusals,
    ["401", "403"],
    `expected only the session gate and the purchase gate, found ${JSON.stringify(refusals)}`,
  );
  ok("the only refusals are the pre-existing 401 session gate and 403 purchase gate");

  assert.ok(/consumeReadBudget/.test(code), "the route must call the budget");
  ok("the route calls consumeReadBudget");

  // The delay must actually be applied, not merely computed. A budget that is
  // counted and dropped is the most plausible regression here, because every
  // assertion above would still pass.
  assert.ok(
    /if \(budget\.delayMs > 0\)[\s\S]{0,160}setTimeout/.test(code),
    "the computed delay must actually be awaited before the body is sent",
  );
  ok("the computed delay is awaited before the file is sent, not just counted");
}

/* --------------------------------- 3. the pace is placed correctly ------- */

console.log("\nthe pace sits after entitlement and after the file is found");

{
  // Position is measured on call shapes in comment-free code, NOT on bare
  // identifiers.
  //
  // `route.indexOf("getOwnedCodes")` finds the *import* on line 4 and
  // `indexOf("consumeReadBudget")` finds the import on line 7. Those two
  // assertions were passing for entirely the wrong reason — the import block
  // happens to list them in a convenient order — while saying nothing about
  // where the budget is actually spent. Stripping comments is not enough
  // either: this file's doc comment discusses getOwnedCodes() and
  // getSession() before either is called.
  const route = read("src", "app", "api", "topics", "[slug]", "route.ts")
    .replace(/^\s*import[\s\S]*?from\s+"[^"]+";\s*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  const call = (name) => {
    const i = route.search(new RegExp(`\\b${name}\\s*\\(`));
    assert.ok(i > 0, `${name} must be called in the route`);
    return i;
  };
  const idx = {
    session: call("getSession"),
    owned: call("getOwnedCodes"),
    file: call("readPrivateAsset"),
    budget: call("consumeReadBudget"),
  };

  assert.ok(
    idx.session < idx.budget,
    "the budget must sit behind the session gate, or anonymous callers are paced",
  );
  ok("behind the session gate");

  assert.ok(
    idx.owned < idx.budget,
    "the budget must be consumed AFTER the purchase gate — delaying first is free amplification",
  );
  ok("after the purchase gate — a throwaway account cannot hold connections open");

  assert.ok(
    idx.file < idx.budget,
    "the budget must be consumed AFTER the file is found — a 404 must cost nothing",
  );
  ok("after the file is found — a mistyped slug or unfinished PDF is never penalised");
}

/* --------------------------------- 4. the counter is safe to share ------- */

console.log("\nthe counter survives a restart and cannot be raced");

{
  // Comments stripped for the same reason as in the sections above, and it
  // matters more here: this file's doc comment explains that there is *no*
  // transaction, so asserting on raw text fails on the explanation.
  const raw = readPkg("packages", "db", "src", "read-budget.ts");
  const budget = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const sql = readPkg("packages", "db", "scripts", "neon-setup-6-read-budget.sql");
  // Stripped too: this migration's comment says there is no "blocked" state,
  // so the assertion below would otherwise fail on its own explanation.
  const sqlCode = sql.replace(/--[^\n]*/g, "");

  // A restart must not hand back a fresh allowance: serverless instances are
  // created constantly, so an in-memory counter is a counter that mostly reads
  // zero.
  assert.ok(
    /insert into read_usage/i.test(budget),
    "the counter must be written in the database, not in memory",
  );
  ok("the counter lives in the database, so a cold start cannot reset it");

  // Parallelising a download loop is the first thing anyone would try, and it
  // is exactly what defeats a SELECT-then-UPDATE counter.
  assert.ok(/on conflict \(user_id\) do update/i.test(budget), "the decision must ride on the upsert");
  ok("the decision rides on a single upsert, so concurrent requests cannot both be admitted");

  assert.ok(
    /returning\s+count/i.test(budget),
    "the count must come back from the same statement that decided it",
  );
  ok("the count returns from that same statement, so count and decision cannot disagree");

  assert.ok(
    !/\.transaction\s*\(|\bbegin\b/i.test(budget),
    "a single statement is already atomic; a transaction buys nothing and costs a round trip",
  );
  ok("no transaction wrapper — one statement is already atomic in Postgres");

  // The window must actually reset, or a reader is eventually locked out by
  // their own history, which is the failure this feature exists to avoid.
  assert.ok(
    /window_started_at <= now\(\) - make_interval/i.test(budget),
    "the window must expire rather than becoming a lifetime cap",
  );
  ok("the window expires and resets — a lifetime cap would lock readers out permanently");

  assert.ok(/read_usage/i.test(sql) && /create table if not exists/i.test(sql), "the migration must create the table");
  ok("the migration creates read_usage");

  assert.ok(
    /create unique index if not exists "read_usage_user_id_idx"/i.test(sql),
    "the unique index is what makes the upsert safe",
  );
  ok("a unique index on user_id backs the upsert that prevents the race");

  assert.ok(
    !/blocked|denied|locked/i.test(sqlCode),
    "the table must not model a blocked state — the budget delays, it never refuses",
  );
  ok("the table has no blocked state — there is no such thing here");

  assert.ok(
    !/\bthrow\b/i.test(budget),
    "a failure here must not become a 500 on a route a paying reader depends on",
  );
  ok("no throw — a budget problem cannot become a 500 on a paid route");
}

console.log(`\n${passed} passed.`);