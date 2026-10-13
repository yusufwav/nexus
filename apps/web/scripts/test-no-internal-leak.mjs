/**
 * No internal columns may reach a prompt or a response.
 * ------------------------------------------------------------
 * `note_topics.source_path` and `purchases.provider_ref` sit in the
 * database. Neither is selected anywhere today — that is a property of
 * the code, not of the schema, which means the next person to write
 * `db.select().from(noteTopics)` (no field list) publishes the first
 * path in one commit and nobody notices.
 *
 * This is a guard, not a cleanup. It reads the query layer and the routes
 * that talk to it and asserts the two column names never appear in a
 * position that would put them on the wire.
 *
 * The check is deliberately blunt about what it can and cannot prove. It
 * proves the names are absent from the files it reads. It cannot prove
 * someone did not alias them, and it cannot follow a value through
 * drizzle's builder — what it does is put the two names in a test, so
 * that "where did that path come from?" has an answer that is a command
 * away rather than an afternoon.
 *
 * Run from apps/web:
 *   node scripts/test-no-internal-leak.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

/** Columns that must never be selected into anything a model or client sees. */
const FORBIDDEN = [
  {
    column: "source_path",
    camel: "sourcePath",
    why: "a filesystem path; a model shown a filename can be asked for it back and will answer",
  },
  {
    column: "provider_ref",
    camel: "providerRef",
    why: "a payment provider's own reference for this reader's transaction",
  },
];

/** Every .ts/.tsx under a directory, skipping build output. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.(ts|tsx|mjs)$/.test(entry)) yield full;
  }
}

const roots = [
  { dir: path.join(import.meta.dirname, "..", "src"), label: "apps/web/src" },
  { dir: path.join(import.meta.dirname, "..", "..", "..", "packages", "db", "src"), label: "packages/db/src" },
  { dir: path.join(import.meta.dirname, "..", "..", "..", "packages", "auth", "src"), label: "packages/auth/src" },
];

/*
 * A line that merely NAMES the column is fine and expected: the schema
 * declares it, the ingestion path writes it, and the comments explain why
 * it must not leak. Only a line that could put it on the wire is a
 * failure, so the patterns below are all selection-shaped.
 */
const SELECTION_PATTERNS = [
  // select({ sourcePath: ... }) / providerRef: ...
  { re: /\bsourcePath\s*:\s*noteTopics\./, what: "noteTopics.sourcePath into a select()" },
  { re: /\bproviderRef\s*:\s*purchases\./, what: "purchases.providerRef into a select()" },
  // select().from(x) with no field list, where x is a table holding one of them
  { re: /select\(\s*\)\s*\.from\(\s*noteTopics\s*\)/, what: "bare select() from noteTopics (publishes every column)" },
  { re: /select\(\s*\)\s*\.from\(\s*purchases\s*\)/, what: "bare select() from purchases (publishes every column)" },
];

for (const { column, why } of FORBIDDEN) {
  console.log(`${column} — ${why}`);
}
console.log("");

for (const { dir, label } of roots) {
  let checked = 0;
  const offenders = [];
  for (const file of walk(dir)) {
    const src = readFileSync(file, "utf8");
    checked++;
    for (const { re, what } of SELECTION_PATTERNS) {
      const lines = src.split(/\r?\n/);
      lines.forEach((line, i) => {
        if (re.test(line)) {
          offenders.push(`${file.replace(/^.*nexus[\\/]/, "")}:${i + 1} — ${what}`);
        }
      });
    }
  }
  if (offenders.length === 0) ok(`${label}: ${checked} file(s), no leaking selection`);
  else for (const o of offenders) bad(o);
}

/*
 * The bare-select() patterns are the real teeth, and they can only catch
 * a leak for tables whose schema is checked below. If a future migration
 * adds a third internal column to note_topics, the bare-select() check
 * still holds — which is the property worth having.
 */
console.log("\nbare select() from a table with internal columns");
const schemaSrc = readFileSync(
  path.join(import.meta.dirname, "..", "..", "..", "packages", "db", "src", "schema", "notes.ts"),
  "utf8",
);
if (/sourcePath: text\("source_path"\)/.test(schemaSrc)) {
  ok("note_topics still declares source_path, so the bare-select() guard has something to guard");
} else {
  bad("note_topics no longer declares source_path — re-check the bare-select() guard above");
}

console.log(failures === 0 ? "\nno internal column is on the wire path." : `\n${failures} problem(s).`);
process.exitCode = failures === 0 ? 0 : 1;