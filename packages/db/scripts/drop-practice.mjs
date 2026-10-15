import { readFileSync } from "node:fs";
import pg from "pg";

const url = readFileSync("../../apps/web/.env", "utf8").match(/^DATABASE_URL=(.*)$/m)[1].trim();
const c = new pg.Client({ connectionString: url });
await c.connect();

await c.query("drop table if exists practice_attempts cascade");
await c.query("drop table if exists practice_questions cascade");

const gone = await c.query(`
  select count(*)::int as n from information_schema.tables
  where table_schema='public' and table_name like 'practice%'`);
console.log(`  dropped; practice tables remaining: ${gone.rows[0].n}`);

await c.end();