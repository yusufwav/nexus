/**
 * ARE THE GRANTS ACTUALLY THERE?
 * ------------------------------------------------------------------------
 * Every /api/auth/* route on the deployed site was returning 500 with an
 * empty body. The cause was one line in a stack trace:
 *
 *   [cause]: error: permission denied for table rateLimit   (SQLSTATE 42501)
 *
 * Better Auth's rate limiter queries `rateLimit` on every auth request,
 * so one missing GRANT took down sign-in, sign-up and every session check
 * at once - while the homepage, /modules, /api/keys and /api/topics all
 * returned normally. Nothing about the symptom pointed at permissions.
 *
 * WHY THE EXISTING CHECK DID NOT CATCH IT
 *
 * verify-app-role.mjs is thorough about what the role must NOT do: it
 * proves RLS hides other readers' rows, that DDL is refused, that writes
 * to the read-only tables are refused. All of that passed. But it never
 * asked whether the role can do the things it MUST do - and a role with
 * no grants whatsoever passes every one of its assertions, because an
 * empty result set is exactly what "correctly closed" looks like. The
 * test suite was structurally unable to notice a role that had been
 * stripped of everything.
 *
 * So this asks the other question directly, per table, and prints the
 * GRANT to run when the answer is no.
 *
 * WHY IT TALKS HTTPS INSTEAD OF A TCP SOCKET
 *
 * Postgres speaks TCP on 5432, and this machine's network blocks every
 * outbound port except 443 - which is why so much of the Neon setup had
 * to be done by hand in the SQL editor. Neon also serves the same SQL
 * over HTTPS at https://<endpoint>/sql, so this check runs here, from a
 * normal terminal, with no port exception. That matters for a check whose
 * entire purpose is to be run after a schema change.
 *
 * USAGE
 *
 *   $env:DATABASE_URL = "postgresql://nexus_app:<pw>@<endpoint>/neondb?sslmode=require"
 *   node packages/db/scripts/check-grants.mjs
 *
 * Exits non-zero if any privilege is missing, so it is usable in a gate.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * What the role is supposed to be able to do.
 *
 * Mirrors GRANTS in create-app-role.mjs, and the script asserts below that
 * the two still agree - two hand-maintained privilege lists that drift apart
 * is precisely the failure this file exists to prevent, so it would be
 * silly to introduce one.
 */
const EXPECTED = [
  { table: "provider_keys", mode: "READ WRITE" },
  { table: "purchases", mode: "READ" },
  { table: "chat_threads", mode: "READ WRITE" },
  { table: "chat_messages", mode: "READ WRITE" },
  { table: "ai_usage", mode: "READ WRITE" },
  { table: "read_usage", mode: "READ WRITE" },
  { table: "user", mode: "READ WRITE" },
  { table: "session", mode: "READ WRITE" },
  { table: "account", mode: "READ WRITE" },
  { table: "verification", mode: "READ WRITE" },
  { table: "rateLimit", mode: "READ WRITE" },
  { table: "modules", mode: "READ" },
  { table: "note_topics", mode: "READ" },
  { table: "note_chunks", mode: "READ" },
  { table: "practice_questions", mode: "READ" },
  { table: "practice_attempts", mode: "READ WRITE" },
];

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

/* -- 1. the two privilege lists must agree -------------------------------- */

function grantsFromSource() {
  const src = readFileSync(join(HERE, "create-app-role.mjs"), "utf8");
  const out = [];
  const re = /\{\s*table:\s*"([^"]+)",\s*mode:\s*"([^"]+)"\s*\}/g;
  for (const m of src.matchAll(re)) out.push({ table: m[1], mode: m[2] });
  return out;
}

console.log("the expected matrix matches create-app-role.mjs");
const fromSource = grantsFromSource();
const key = (x) => `${x.table}:${x.mode}`;
const sourceKeys = new Set(fromSource.map(key));
const hereKeys = new Set(EXPECTED.map(key));
for (const k of hereKeys) {
  if (!sourceKeys.has(k)) bad(`create-app-role.mjs no longer grants ${k} - this file expects it`);
}
for (const k of sourceKeys) {
  if (!hereKeys.has(k)) bad(`this file is missing ${k} which create-app-role.mjs grants`);
}
if (failures === 0) ok(`${EXPECTED.length} entries agree`);

/* -- 2. run the query ------------------------------------------------------ */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("\nDATABASE_URL is not set. It must point at the nexus_app role.");
  process.exit(1);
}

/** The pooled host answers /sql too, but the direct one is what we verified. */
function httpsEndpoint(connectionString) {
  const u = new URL(connectionString);
  return `https://${u.hostname.replace(/-pooler(?=\.|$)/, "")}/sql`;
}

async function sql(query) {
  const res = await fetch(httpsEndpoint(url), {
    method: "POST",
    headers: {
      "Neon-Connection-String": url,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

console.log("\nwhat the role can actually do");
let rows;
try {
  const r = await sql(`
    select t.tablename,
           has_table_privilege('nexus_app', format('public.%I', t.tablename), 'SELECT') as sel,
           has_table_privilege('nexus_app', format('public.%I', t.tablename), 'INSERT') as ins,
           has_table_privilege('nexus_app', format('public.%I', t.tablename), 'UPDATE') as upd,
           has_table_privilege('nexus_app', format('public.%I', t.tablename), 'DELETE') as del
    from pg_tables t
    where t.schemaname = 'public'
  `);
  rows = r.rows;
} catch (e) {
  console.error(`\ncould not reach Neon over HTTPS: ${e.message}`);
  process.exit(1);
}

const byName = new Map(rows.map((r) => [r.tablename, r]));
const repair = [];

for (const { table, mode } of EXPECTED) {
  const row = byName.get(table);
  if (!row) {
    bad(`${table} does not exist - the table is missing, not the grant`);
    continue;
  }

  const needWrite = mode === "READ WRITE";
  const sel = row.sel === true;
  const ins = row.ins === true;
  const upd = row.upd === true;
  const del = row.del === true;

  if (!sel) {
    bad(`${table}: cannot SELECT`);
    repair.push({ table, needWrite });
  } else if (needWrite && !(ins && upd && del)) {
    bad(
      `${table}: can read but not fully write (insert=${ins} update=${upd} delete=${del})`,
    );
    repair.push({ table, needWrite });
  } else if (!needWrite && (ins || upd || del)) {
    bad(`${table}: is granted WRITE but is meant to be read-only`);
  } else {
    ok(`${table.padEnd(16)} ${mode}`);
  }
}

if (repair.length > 0) {
  // The verb is per-table, not one blanket string. A single
  // "SELECT, INSERT, UPDATE, DELETE" for every repair hands nexus_app write
  // access to the catalogue and the corpus — the exact opposite of the
  // least-privilege argument this file's own header makes, generated by the
  // very tool whose job is to enforce it. A read-only table only ever needs
  // SELECT added back; anything more is the bug being repaired, re-applied.
  console.log("\nrun this as the database owner to repair:");
  for (const { table, needWrite } of repair) {
    const verb = needWrite ? "SELECT, INSERT, UPDATE, DELETE" : "SELECT";
    console.log(`  GRANT ${verb} ON "${table}" TO nexus_app;`);
  }
}

console.log(
  failures === 0
    ? "\ngrants match. every table the app touches is reachable."
    : `\n${failures} problem(s). the app WILL fail at runtime until these are fixed.`,
);
process.exitCode = failures === 0 ? 0 : 1;