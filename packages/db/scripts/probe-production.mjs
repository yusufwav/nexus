/**
 * READ-ONLY reconnaissance. Writes nothing.
 *
 *   node scripts/probe-production.mjs            (production, from .env.local)
 *   node scripts/probe-production.mjs --local    (local dev database)
 *
 * The URL is read INSIDE node from the env file. Passing it through the
 * shell instead produced an empty string once, and `process.env.X ?? file`
 * does not fall through on "" — only on null/undefined — so the client
 * silently fell back to libpq's default of localhost:5432 and looked like
 * a connection failure rather than a bad argument.
 */
import { readFileSync } from "node:fs";
import pg from "pg";

const LOCAL = process.argv.includes("--local");

function fromFile(relPath) {
  const raw = readFileSync(new URL(relPath, import.meta.url), "utf8")
    .match(/^DATABASE_URL=(.*)$/m)?.[1]
    .trim();
  if (raw === undefined) return undefined;
  // STRIP SURROUNDING QUOTES. The root .env.local stores its values quoted --
  // DATABASE_URL="postgresql://..." -- and passing that straight to pg does
  // not throw. It fails to parse as a URL, and libpq then quietly uses its
  // built-in default of localhost:5432, so the error is ECONNREFUSED on
  // 127.0.0.1 and looks like the database is down rather than like a
  // malformed argument. apps/web/.env is unquoted, which is why this only
  // ever bit on the production path.
  if (/^"(.*)"$|^\x27(.*)\x27$/s.test(raw)) {
    return raw.replace(/^["']|["']$/g, "");
  }
  return raw;
}

const url = LOCAL
  ? fromFile("../../../apps/web/.env")
  : (process.env.DATABASE_URL || fromFile("../../../.env.local"));

if (!url) {
  console.error("could not read a DATABASE_URL");
  process.exit(1);
}
console.log(`  target: ${LOCAL ? "LOCAL dev database" : "PRODUCTION (root .env.local)"}`);

const c = new pg.Client({ connectionString: url });
await c.connect();

console.log("  where am I:");
const me = await c.query(
  "select current_database() db, current_user u, inet_server_addr()::text host",
);
console.log(`    db=${me.rows[0].db} as ${me.rows[0].u}`);
const attrs = await c.query(
  "select rolsuper, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user",
);
console.log(
  `    super=${attrs.rows[0].rolsuper} createrole=${attrs.rows[0].rolcreaterole} bypassrls=${attrs.rows[0].rolbypassrls}`,
);

console.log("\n  tables present:");
const t = await c.query(
  `select table_name from information_schema.tables
    where table_schema='public' order by table_name`,
);
const names = t.rows.map((r) => r.table_name);
console.log(`    ${names.join(", ")}`);
console.log(`    practice tables: ${names.filter((n) => n.startsWith("practice")).join(", ") || "NONE"}`);

console.log("\n  practice enums:");
const e = await c.query(
  `select t.typname from pg_type t where t.typname like 'practice%'`,
);
console.log(`    ${e.rows.map((r) => r.typname).join(", ") || "NONE"}`);

console.log("\n  RLS state on the tables that have it:");
const rls = await c.query(
  `select c.relname, c.relrowsecurity, c.relforcerowsecurity
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname='public' and c.relkind='r'
    order by c.relname`,
);
for (const r of rls.rows) {
  if (r.relrowsecurity) {
    console.log(`    ${r.relname}: rls=${r.relrowsecurity} force=${r.relforcerowsecurity}`);
  }
}

console.log("\n  policies:");
const pol = await c.query(`select tablename, policyname from pg_policies where schemaname='public' order by tablename`);
for (const p of pol.rows) console.log(`    ${p.tablename}: ${p.policyname}`);

console.log("\n  app_reader_id function:");
const fn = await c.query(`select proname from pg_proc where proname='app_reader_id'`);
console.log(`    ${fn.rows.length ? "present" : "ABSENT"}`);

console.log("\n  roles:");
const r = await c.query(`select rolname, rolcanlogin, rolbypassrls from pg_roles where rolname like 'nexus%' or rolname='postgres'`);
for (const x of r.rows) console.log(`    ${x.rolname} login=${x.rolcanlogin} bypassrls=${x.rolbypassrls}`);

console.log("\n  grants nexus_app holds:");
const g = await c.query(
  `select table_name, string_agg(privilege_type, ',' order by privilege_type) privs
     from information_schema.role_table_grants where grantee='nexus_app'
    group by table_name order by table_name`,
);
if (g.rowCount === 0) console.log("    (none — nexus_app has no table grants)");
for (const x of g.rows) console.log(`    ${x.table_name}: ${x.privs}`);

console.log("\n  existing content counts:");
for (const tbl of ["modules", "purchases", "note_topics", "note_chunks", "user"]) {
  const n = await c.query(`select count(*)::int as n from "${tbl}"`).catch(() => null);
  console.log(`    ${tbl}: ${n ? n.rows[0].n : "(absent)"}`);
}

await c.end();