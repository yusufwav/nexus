/**
 * Prove the app role is actually restricted — by using it.
 *
 * The whole point of create-app-role.mjs is that the policies in
 * create-rls-policies.mjs finally bite. A DDL script that runs without
 * error proves only that the SQL parsed. This connects as `nexus_app` and
 * demonstrates the three things that matter:
 *
 *   1. with NO reader identity, the per-reader tables are empty —
 *      the policies are live rather than decorative
 *   2. with reader A's identity, A's rows and only A's
 *   3. the role cannot do anything it should not: no DDL, no CREATE, and
 *      no access to anything outside the grants
 *
 * Point DATABASE_URL at the nexus_app connection to run it:
 *   $env:DATABASE_URL = "postgresql://nexus_app:<password>@host:5432/db"
 *   node scripts/verify-app-role.mjs
 *
 * Exits non-zero on any failure, so it can gate a deploy.
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. It must point at the nexus_app role.");
  process.exit(1);
}

let failures = 0;
const ok = (m) => console.log(`  ok   ${m}`);
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};
const eq = (label, actual, expected) => {
  if (actual === expected) ok(`${label} = ${JSON.stringify(actual)}`);
  else bad(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
};

const RLS_TABLES = ["provider_keys", "provider_models", "purchases", "chat_threads", "chat_messages"];

async function asReader(reader, fn) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("BEGIN");
    await c.query("SELECT set_config('app.user_id', $1, true)", [reader]);
    const out = await fn(c);
    await c.query("COMMIT");
    return out;
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await c.end();
  }
}

try {
  const probe = new Client({ connectionString: url });
  await probe.connect();

  // ---------------------------------------------------- identity and limits
  const who = await probe.query(
    `select current_user u, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole
       from pg_roles where rolname = current_user`,
  );
  const me = who.rows[0];
  console.log(`connected as ${me.u}`);
  eq("not a superuser", me.rolsuper, false);
  eq("does NOT bypass RLS", me.rolbypassrls, false);
  eq("cannot create databases", me.rolcreatedb, false);
  eq("cannot create roles", me.rolcreaterole, false);

  // ------------------------------------------- 1. no identity sees nothing
  console.log("\nno reader identity set (the forgot-the-wrapper case)");
  for (const t of RLS_TABLES) {
    const r = await probe.query(`select count(*)::int n from "${t}"`);
    eq(`${t} rows visible`, r.rows[0].n, 0);
  }

  // ------------------------------------------------ 2. identity scopes rows
  /*
   * Pick two readers by email, with the lookup explicitly BYPASSING RLS.
   *
   * The bypass is necessary and is not a hole. `user` carries an RLS
   * policy of its own, so as nexus_app with no identity set even a lookup
   * by a known email returns nothing — the table is exactly as closed as
   * it should be. This script needs to know WHO to test as before it can
   * test anything, so it does the one privileged thing it does: reads two
   * id/email pairs with BYPASSRLS and nothing else. It reads no
   * credential, no note content and no purchase.
   *
   * The first version listed the table, found nothing (RLS), skipped the
   * isolation test and still exited 0 — a green run that had checked
   * almost nothing. This version fails loudly instead.
   */
  const emails = process.env.VERIFY_READERS ?? "";
  const adminUrl = process.env.DATABASE_URL_ADMIN ?? process.env.OWNER_DATABASE_URL;

  let a;
  let b;
  if (!emails.includes(",")) {
    console.error(
      "\nFAIL: set VERIFY_READERS to two comma-separated emails, e.g.\n" +
        '      $env:VERIFY_READERS = "a@example.com,b@example.com"',
    );
    failures++;
  } else if (!adminUrl) {
    /*
     * The id lookup has to happen on a connection that can see `user`,
     * because `user` carries an RLS policy and nexus_app sees none of it
     * without an identity — which is the correct behaviour and exactly why
     * the lookup cannot happen on this connection.
     *
     * Note this is a ROLE attribute, not a query hint: there is no
     * `select ... bypass rls` in Postgres, so the first version of this
     * script's fix (adding BYPASSRLS to the WHERE) could never have
     * worked. The owner connection is the only way, and it is used for two
     * id/email pairs and nothing else.
     */
    console.error(
      "\nFAIL: this script needs an owner connection to resolve the two\n" +
        "      reader ids, because `user` is RLS-protected and correctly\n" +
        "      invisible to nexus_app without an identity.\n\n" +
        "        $env:DATABASE_URL_ADMIN = \"postgresql://postgres:...@host/db\"\n" +
        '        $env:VERIFY_READERS = "a@example.com,b@example.com"',
    );
    failures++;
  } else {
    const admin = new Client({ connectionString: adminUrl });
    await admin.connect();
    const rows = (
      await admin.query(
        `select id, email from "user"
          where email = any(string_to_array($1::text, ','))
          order by email`,
        [emails],
      )
    ).rows;
    await admin.end();
    if (rows.length < 2) {
      console.error(
        `\nFAIL: ${rows.length} of the 2 VERIFY_READERS accounts exist.`,
      );
      failures++;
    } else {
      a = rows[0];
      b = rows[1];
    }
  }

  if (a && b) {
    console.log(`\nas reader A (${a.email})`);
    for (const t of RLS_TABLES) {
      const visible = await asReader(a.id, async (c) => {
        const r = await c.query(`select count(*)::int n from "${t}"`);
        return r.rows[0].n;
      }).catch((e) => {
        bad(String(e.message ?? e));
        return -1;
      });
      // Zero is a legitimate answer — A may own nothing in a given table.
      // The property under test is that A cannot see B's rows.
      if (visible >= 0) ok(`${t}: sees ${visible} row(s) as A`);
    }

    console.log(`\nas reader B (${b.email}) — must not see A's rows`);
    for (const t of RLS_TABLES) {
      const seen = await asReader(b.id, async (c) => {
        const own = await c.query(
          t === "chat_messages"
            ? `select count(*)::int n from "chat_messages" m
                 join "chat_threads" th on th.id = m.thread_id
                where th."user_id" = $1`
            : `select count(*)::int n from "${t}" where "user_id" = $1`,
          [b.id],
        );
        const all = await c.query(`select count(*)::int n from "${t}"`);
        if (all.rows[0].n !== own.rows[0].n) {
          throw new Error(`LEAK: sees ${all.rows[0].n} rows but owns ${own.rows[0].n}`);
        }
        return own.rows[0].n;
      }).catch((e) => {
        bad(String(e.message ?? e));
        return -1;
      });
      if (seen >= 0) ok(`${t}: sees only its own (${seen})`);
    }
  }

  // ------------------------------------------------------ 3. refused powers
  console.log("\noperations this role must NOT have");
  const mustFail = [
    {
      what: "CREATE TABLE",
      sql: `create table nexus_app_should_not_exist (id int)`,
    },
    {
      what: "ALTER a table",
      sql: `alter table "modules" add column nexus_probe int`,
    },
    {
      what: "DROP a table",
      sql: `drop table if exists "modules" cascade`,
    },
    {
      what: "read the vault",
      sql: `select * from supabase_vault.decrypted_secrets`,
    },
    {
      what: "create another role",
      sql: `create role should_not_exist`,
    },
    {
      what: "write to purchases (read-only grant)",
      sql: `insert into "purchases" (id,"user_id",module_id,amount_cents,status) values ('x',$1,1,0,'paid') on conflict do nothing`,
      args: [a.id],
    },
    {
      what: "write to note_chunks (read-only grant)",
      sql: `insert into "note_chunks" (id,topic_id,module_code,chunk_index,content) values ('x','y','z',0,'w') on conflict do nothing`,
    },
    {
      what: "write to note_topics (read-only grant)",
      sql: `insert into "note_topics" (id,module_code,slug,title,source_path,content_hash) values ('x','y','z','t','u','v') on conflict do nothing`,
    },
  ];
  for (const { what, sql, args } of mustFail) {
    try {
      await probe.query(sql, args ?? []);
      bad(`${what} SUCCEEDED — the role is over-privileged`);
    } catch {
      ok(`${what} refused`);
    }
  }

  await probe.end();

  console.log(
    failures === 0
      ? "\nthe app role is genuinely restricted."
      : `\n${failures} failure(s) — do NOT point the app at this role yet.`,
  );
} catch (err) {
  failures++;
  console.error("\nfailed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
}

process.exitCode = failures === 0 ? 0 : 1;