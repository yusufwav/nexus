/**
 * THE APPLICATION DATABASE ROLE
 *
 * Why this exists
 * ------------------------------------------------------------
 * Every RLS policy in this database was inert, because the role the app
 * connects as carries BYPASSRLS. Proven, not assumed:
 *
 *   select rolname, rolsuper, rolbypassrls from pg_roles
 *     where rolname = current_user;
 *     -> { rolname: 'postgres', rolsuper: false, rolbypassrls: TRUE }
 *
 * A plain `select * from provider_keys` with no reader identity set
 * returned every reader's row. The policies were installed, FORCE was on,
 * and none of it mattered. Isolation rested entirely on the `where
 * user_id = $1` clauses in queries.ts — which are correct, and are
 * load-bearing, but which mean a single forgotten clause is a full
 * cross-tenant read rather than a failed one.
 *
 * Why BYPASSRLS is on `postgres`
 * ------------------------------------------------------------
 * Supabase grants it so migrations, the dashboard and the service role
 * can do anything. That is right for an admin and wrong for the role a
 * web request runs as: this process handles strings from the internet.
 *
 * What this creates
 * ------------------------------------------------------------
 * `nexus_app` — NOSUPERUSER, NOBYPASSRLS, NOCREATEDB, NOCREATEROLE,
 * NOREPLICATION. It holds DML on the app's tables and nothing else: no
 * CREATE, no DROP, no ownership, no BYPASSRLS. Against it the policies
 * installed by create-rls-policies.mjs are actually in force, so a
 * forgotten `where user_id` returns nothing instead of another reader's
 * row.
 *
 * WHAT IT CANNOT DO, and this matters as much as what it can
 * ------------------------------------------------------------
 *   · no DDL — it cannot alter a table, add a column, or create an index.
 *     Migrations run as the owner, exactly as before.
 *   · no BYPASSRLS — so the RLS policies bind, which is the point.
 *   · no access to tables it was not granted. `supabase_vault` and the
 *     other extensions are not granted to it.
 *   · it cannot see the sealing key, because that is not in the database
 *     and never was.
 *
 * WHY GRANTING IS PER-TABLE AND EXPLICIT
 * ------------------------------------------------------------
 * `GRANT ALL ON ALL TABLES IN SCHEMA public` would hand it DDL on future
 * tables and quietly widen as the schema grows. Explicit grants mean a
 * new table is inaccessible until someone decides it should not be, which
 * is the correct default for a table holding paid content.
 *
 * `note_topics` / `note_chunks` ARE granted, deliberately: they hold no
 * user_id and no RLS policy (their entitlement is a join across purchases
 * and modules, which RLS cannot express cleanly — see
 * create-rls-policies.mjs). Their protection is the `module_code = any(...)`
 * filter inside the query, which is unchanged by this role. Granting read
 * on them is required for the tutor to work at all; granting WRITE is not,
 * and is not granted, so ingestion cannot run as this role.
 *
 * Run from packages/db, as the owner:
 *   node scripts/create-app-role.mjs
 *
 * Then point DATABASE_URL at it. It prints the exact URL at the end.
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const ROLE = "nexus_app";

/**
 * Tables the app reads and writes at runtime, and on what.
 *
 * READ+WRITE  the four per-reader tables RLS covers, plus the two chat
 *             tables. These are the ones the app legitimately mutates.
 * READ ONLY   the catalogue and the notes corpus. The app never inserts
 *             or updates a purchase, a module or a note — ingestion and
 *             migrations are separate, owner-run operations — so write
 *             access here would be pure attack surface.
 * NOT LISTED  supabase_vault and anything else. Absent means absent.
 */
const GRANTS = [
  { table: "provider_keys", mode: "READ WRITE" },
  { table: "purchases", mode: "READ" },
  { table: "chat_threads", mode: "READ WRITE" },
  { table: "chat_messages", mode: "READ WRITE" },
  { table: "ai_usage", mode: "READ WRITE" },
  // The content read budget's counter. Was MISSING here, which meant nexus_app
  // had no privilege on the table at all: the route's upsert raised
  // 42501 permission denied, the budget caught it, and every download sailed
  // through unpaced. The one defence against a bulk pull of paid PDFs did
  // nothing, on every request, and the only trace was one console.error.
  //
  // It was easy to miss because `read_usage` is the only table the app
  // grants that is not in `user`'s reach through Better Auth, is not part of
  // the catalogue, and was added after this list was last read top to bottom.
  // Both files must change together: check-grants.mjs asserts these two
  // matrices agree, which is the only thing that caught this at all — and
  // only if someone ran it.
  { table: "read_usage", mode: "READ WRITE" },
  // Better Auth owns these and needs full DML.
  { table: "user", mode: "READ WRITE" },
  { table: "session", mode: "READ WRITE" },
  { table: "account", mode: "READ WRITE" },
  { table: "verification", mode: "READ WRITE" },
  { table: "rateLimit", mode: "READ WRITE" },
  // Catalogue and corpus: read only.
  { table: "modules", mode: "READ" },
  { table: "note_topics", mode: "READ" },
  { table: "note_chunks", mode: "READ" },
  // Practice. Same split as the corpus above, and for the same reason:
  // questions are authored content that ingestion writes and the app never
  // mutates, while attempts are the reader's own history, written at
  // runtime and RLS-protected. Granting WRITE on the catalogue would let a
  // compromised app role rewrite the questions every other reader is
  // graded against.
  { table: "practice_questions", mode: "READ" },
  { table: "practice_attempts", mode: "READ WRITE" },
];

const client = new Client({ connectionString: url });

let failures = 0;
const bad = (m) => {
  failures++;
  console.log(`  FAIL ${m}`);
};

try {
  await client.connect();

  const who = await client.query(
    `select current_user as u, rolsuper, rolbypassrls, rolcreaterole
       from pg_roles where rolname = current_user`,
  );
  const me = who.rows[0];
  if (!me) {
    console.error("could not identify the current role.");
    process.exit(1);
  }
  if (!me.rolcreaterole && !me.rolsuper) {
    console.error(
      `the current role (${me.u}) cannot create roles. Run this as the database\n` +
        `owner — on Supabase that is the postgres role in the SQL editor.`,
    );
    process.exit(1);
  }

  // A password is NOT set here on purpose. Creating a role with a known or
  // empty password would be worse than not creating it: it invites someone
  // to connect with it. The password is supplied by whoever runs
  // `create-app-role-password.mjs`, which reads it from the environment so
  // it never appears in a shell history or a script.
  //
  // If the role already exists (re-run), ALTER rather than CREATE so the
  // privileges below are re-applied idempotently.
  const existing = await client.query(`select rolname from pg_roles where rolname = $1`, [ROLE]);
  if (existing.rows.length === 0) {
    await client.query(
      `CREATE ROLE ${ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`,
    );
    console.log(`ok: created role ${ROLE} (no password set yet)`);
  } else {
    /*
     * Re-running must be safe.
     *
     * ALTER ROLE ... NOCREATEROLE requires ADMIN OPTION, and Postgres
     * refuses to grant ADMIN back to the role that created it ("ADMIN
     * option cannot be granted back to your own grantor"), so the obvious
     * self-grant workaround is a dead end rather than a fix.
     *
     * It is also unnecessary: the attributes that matter are set by the
     * CREATE above and verified at the end of this script. A second run
     * re-applies the grants — which is the part that actually drifts — and
     * re-checks the attributes. If a human changed them, the check says so
     * rather than pretending the run repaired it.
     */
    try {
      await client.query(
        `ALTER ROLE ${ROLE} LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION`,
      );
      console.log(`ok: role ${ROLE} exists; attributes re-asserted`);
    } catch (err) {
      console.log(
        `note: could not ALTER ${ROLE} (${err instanceof Error ? err.message.split("\n")[0] : String(err)})`,
      );
      console.log(
        "      that is expected on a re-run — the attributes are verified below, and the",
      );
      console.log("      grants are re-applied either way. Treat the check as the authority.");
    }
  }

  await client.query(`GRANT USAGE ON SCHEMA public TO ${ROLE}`);

  for (const { table, mode } of GRANTS) {
    // to_regclass takes a REGCLASS argument, and the table name has to be
    // quoted inside it or Postgres folds it to lowercase — which is why the
    // first run reported `rateLimit does not exist` for a table that does.
    // The $1::text cast is required for the same reason the password script
    // needs it: Postgres cannot infer a parameter's type inside format(),
    // and reports "could not determine data type of parameter $1".
    const exists = await client.query(
      `select to_regclass(format('%I.%I', 'public', $1::text)) as t`,
      [table],
    );
    if (!exists.rows[0].t) {
      bad(`table "${table}" does not exist — a grant was skipped, and the app will fail at runtime`);
      continue;
    }
    const verb = mode === "READ" ? "SELECT" : "SELECT, INSERT, UPDATE, DELETE";
    await client.query(`GRANT ${verb} ON "${table}" TO ${ROLE}`);
    console.log(`ok: GRANT ${verb} on ${table}`);
  }

  // Belt and braces: revoke anything a previous run or a `GRANT ALL ON ALL
  // TABLES` might have left behind. Only tables the app should not touch
  // are named, so this cannot remove a grant from GRANTS above.
  await client.query(`
    DO $$
    DECLARE t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY[
        'supabase_vault'
      ] LOOP
        IF to_regclass('public.' || t) IS NOT NULL THEN
          EXECUTE format('REVOKE ALL ON public.%I FROM %I', t, '${ROLE}');
        END IF;
      END LOOP;
    END $$;
  `);
  console.log("ok: revoked vault access");

  // Verify, rather than reporting success on the strength of the DDL.
  const check = await client.query(
    `select rolsuper, rolbypassrls, rolcreatedb, rolcreaterole from pg_roles where rolname = $1`,
    [ROLE],
  );
  const r = check.rows[0];
  const safe = !r.rolsuper && !r.rolbypassrls && !r.rolcreatedb && !r.rolcreaterole;
  console.log(
    `\n${ROLE}: super=${r.rolsuper} bypassrls=${r.rolbypassrls} createdb=${r.rolcreatedb} createrole=${r.rolcreaterole}`,
  );
  console.log(safe ? "least privilege confirmed." : "*** NOT least privilege — do not use this role.");

  if (!safe) failures++;

  if (failures > 0) {
    console.error(
      `\n${failures} problem(s) — do not point the app at this role until they are fixed.`,
    );
    process.exitCode = 1;
  } else {
    console.log("\nNext: set a password, then verify the role before using it.");
    console.log(
      '  $env:NEXUS_APP_PASSWORD = (node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))")',
    );
    console.log("  node scripts/create-app-role-password.mjs");
    console.log(
      "  node scripts/verify-app-role.mjs   # with DATABASE_URL pointed at nexus_app",
    );
  }
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}