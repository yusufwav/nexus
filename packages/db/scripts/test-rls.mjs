/**
 * Row-level security: proof, not assertion.
 *
 * The policies installed by create-rls-policies.mjs are easy to write and
 * easy to write WRONG, in ways that look correct in review. This exercises
 * them against the database rather than against the intention, and fails
 * loudly if any of them stops biting.
 *
 * WHY IT CREATES ITS OWN ROLE
 *
 * The obvious way to test this - connect as the app's own role and check
 * that rows are hidden - proves nothing on a Supabase database. That role
 * carries BYPASSRLS, so it sails straight past every policy and the test
 * would pass while the control does nothing. (That is not hypothetical:
 * the first version of this file did exactly that and "passed" against a
 * database where the policies were inert.)
 *
 * So this creates a role that is deliberately neither a superuser nor
 * BYPASSRLS - the weakest reasonable role - grants it only the table
 * privileges a reader's queries need, and proves the policies hold for it.
 * That is the strongest statement available: if the policies stop
 * containing a non-privileged role, they are not containing anything.
 *
 * The role is dropped again at the end, including on failure.
 *
 * Run from packages/db:
 *   node scripts/test-rls.mjs
 */
import { Client } from "pg";
import { randomBytes } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const ROLE = `rls_probe_${process.pid}`;
const PASSWORD = randomBytes(18).toString("base64url");

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

const admin = new Client({ connectionString: url });
let probe;

/** Run `fn` in one transaction with `reader` as the RLS identity ('' = none). */
async function asReader(client, reader, fn) {
  await client.query("BEGIN");
  try {
    await client.query("SELECT set_config('app.user_id', $1, true)", [reader]);
    const out = await fn();
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

const TABLES = ["provider_keys", "purchases", "chat_threads", "chat_messages"];

try {
  await admin.connect();

  // ------------------------------------------------------------- the role
  await admin.query(`DROP ROLE IF EXISTS "${ROLE}"`);
  // CREATE ROLE takes no bind parameters for its password, so the whole
  // statement is composed with format() and executed as text. %I quotes
  // the identifier and %L quotes the literal, which is why this is not
  // string concatenation.
  const createRole = await admin.query(
    `select format(
       'CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE PASSWORD %L',
       $1::text, $2::text) as stmt`,
    [ROLE, PASSWORD],
  );
  await admin.query(createRole.rows[0].stmt);
  await admin.query(`GRANT USAGE ON SCHEMA public TO "${ROLE}"`);
  // Deliberately table-level GRANTs, matching what an app role would get.
  // No BYPASSRLS, no superuser: this is the honest test of the policies.
  for (const t of TABLES) {
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON "${t}" TO "${ROLE}"`);
  }

  const probeUrl = (() => {
    const u = new URL(url);
    u.username = ROLE;
    u.password = PASSWORD;
    return u.toString();
  })();

  probe = new Client({ connectionString: probeUrl });
  await probe.connect();

  const who = await probe.query(
    `select current_user u, rolsuper, rolbypassrls from pg_roles where rolname = current_user`,
  );
  const r = who.rows[0];
  if (r.rolsuper || r.rolbypassrls) {
    bad(`probe role can bypass RLS (super=${r.rolsuper} bypass=${r.rolbypassrls})`);
    throw new Error("probe role is not actually unprivileged");
  }
  console.log(`probe role ${r.u}: superuser=false, bypassrls=false — policies apply\n`);

  // -------------------------------------------------------------- fixtures
  const users = await admin.query(`select id, email from "user" order by email limit 2`);
  if (users.rows.length < 2) {
    console.log("SKIP: need two accounts to test isolation.");
    await admin.end();
    process.exit(1);
  }
  const [a, b] = users.rows;
  console.log(`reader A = ${a.email}\nreader B = ${b.email}\n`);

  const stamp = Date.now();
  const ids = {
    thread: `rls-thread-${stamp}`,
    msg: `rls-msg-${stamp}`,
    pur: `rls-pur-${stamp}`,
  };
  // provider_keys carries UNIQUE (user_id, provider), so a fixture there
  // cannot own its id: the insert collides with whatever credential the
  // reader already has, the conflict clause keeps the OLD id, and cleanup
  // then deletes a row that was never created. That is exactly how the
  // first version of this file left fixtures behind for two runs. The
  // fixture is identified by its label, which is the only part of it
  // guaranteed unique, and deleted by label.
  const LABEL = `rls-probe-${stamp}`;
  await admin.query(
    `insert into provider_keys (id,"user_id",provider,label,encrypted_key,last_four,model_id,created_at,updated_at)
     values ($1,$2,'openrouter',$3,'x','0000','openrouter/free',now(),now())
     on conflict ("user_id",provider) do update set label=excluded.label`,
    [`rls-${stamp}`, a.id, LABEL],
  );
  await admin.query(
    `insert into chat_threads (id,"user_id",title,created_at,updated_at)
     values ($1,$2,$3,now(),now())`,
    [ids.thread, a.id, LABEL],
  );
  await admin.query(
    `insert into chat_messages (id,thread_id,role,content,created_at)
     values ($1,$2,'user',$3,now())`,
    [ids.msg, ids.thread, LABEL],
  );
  await admin.query(
    `insert into purchases (id,"user_id",module_id,amount_cents,status,created_at,updated_at)
     select $1,$2,m.id,0,'paid',now(),now() from modules m where m.code='MATT101'`,
    [ids.pur, a.id],
  );

  const cleanup = async () => {
    const gone = [
      ["chat_messages", (await admin.query(`delete from chat_messages where id = $1`, [ids.msg])).rowCount],
      ["chat_threads", (await admin.query(`delete from chat_threads where id = $1`, [ids.thread])).rowCount],
      ["provider_keys", (await admin.query(`delete from provider_keys where label = $1`, [LABEL])).rowCount],
      ["purchases", (await admin.query(`delete from purchases where id = $1`, [ids.pur])).rowCount],
    ];
    for (const [t, n] of gone) {
      if (n !== 1) bad(`cleanup: expected to remove 1 ${t} row, removed ${n}`);
    }
    return gone.every(([, n]) => n === 1);
  };

  // ------------------------------------------- no identity: sees nothing
  console.log("no identity set (the default for any query that forgot the wrapper)");
  for (const t of TABLES) {
    const n = await asReader(probe, "", async () => {
      const res = await probe.query(`select count(*)::int n from "${t}"`);
      return res.rows[0].n;
    });
    eq(`${t} rows visible`, n, 0);
  }

  // -------------------------------- as A: sees A's rows, and only A's
  console.log(`\nas reader A (${a.email})`);
  for (const t of TABLES) {
    // "A sees exactly the rows A owns", which is the property. Measured
    // by counting the same table twice from different identities rather
    // than against a hardcoded total, so it holds whatever else is in
    // the database.
    const visible = await asReader(probe, a.id, async () => {
      const all = await probe.query(`select count(*)::int n from "${t}"`);
      return all.rows[0].n;
    });
    const ownedCol = t === "chat_messages" ? "thread_id" : "user_id";
    const mine =
      t === "chat_messages"
        ? await admin.query(
            `select count(*)::int n from "${t}" m join chat_threads th on th.id=m.thread_id where th."user_id"=$1`,
            [a.id],
          )
        : await admin.query(`select count(*)::int n from "${t}" where "${ownedCol}" = $1`, [a.id]);
    if (visible !== mine.rows[0].n) {
      bad(`${t}: A sees ${visible} rows but owns ${mine.rows[0].n} — LEAK`);
    } else {
      ok(`${t}: sees ${visible} row(s), all of them A's own`);
    }
  }

  /*
   * -------------------------------- as B: cannot see A's planted rows
   *
   * ASSERTED AGAINST THE FIXTURES, NOT AGAINST ZERO.
   *
   * This originally asserted that B sees no rows in these tables at all,
   * which is only true when B owns nothing. That was true of the
   * throwaway accounts the red-team created, and stopped being true the
   * moment those were deleted and B became a real reader with a real
   * credential — so the test failed while the policies were working
   * perfectly. The correct assertion is narrower and is what actually
   * matters: B must not see the rows planted for A. B seeing their OWN
   * rows is the policy working, not failing.
   */
  console.log(`\nas reader B (${b.email}) — must not see A's planted rows`);
  for (const t of TABLES) {
    const n = await asReader(probe, b.id, async () => {
      const res = await probe.query(
        `select count(*)::int n from "${t}" where id = any($1::text[])`,
        [[ids.thread, ids.msg, ids.pur, `rls-${stamp}`]],
      );
      return res.rows[0].n;
    });
    eq(`${t} of A's fixture rows visible to B`, n, 0);
  }

  // ------------------------------- writes: B cannot write into A's rows
  console.log("\nwrite attempts by reader B");
  await asReader(probe, b.id, async () => {
    try {
      await probe.query(
        `insert into chat_threads (id,"user_id",title,created_at,updated_at)
         values ($1,$2,'forged',now(),now())`,
        [`rls-forged-${stamp}`, a.id],
      );
      bad("B could insert a thread owned by A — WITH CHECK not enforced");
    } catch {
      ok("B cannot insert a thread owned by A — WITH CHECK rejects it");
    }
    try {
      await probe.query(`delete from provider_keys where "user_id" = $1`, [a.id]);
      bad("B could delete A's credential");
    } catch {
      ok("B cannot delete A's credential — USING rejects it");
    }
  });

  // ---------------------------------------- identity does not leak out
  const leaked = await probe.query(`select count(*)::int n from provider_keys`);
  eq("rows visible with no identity on a fresh query", leaked.rows[0].n, 0);

  await cleanup();
  console.log("\nfixtures removed");
} catch (err) {
  failures++;
  console.error("\nfailed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  try {
    if (probe) await probe.end();
  } catch {
    /* already closed */
  }
  try {
    // Membership first. DROP OWNED BY is only permitted to a role that
    // "has privileges of" the target — i.e. a member of it — and having
    // granted it a table privilege does not make you a member. Granting
    // membership is what makes the next two statements legal.
    await admin.query(`GRANT "${ROLE}" TO CURRENT_USER`);
    await admin.query(`DROP OWNED BY "${ROLE}"`);
    await admin.query(`DROP ROLE IF EXISTS "${ROLE}"`);
  } catch (err) {
    failures++;
    console.error(
      "could not drop the probe role (a leftover accumulates on every run):",
      err instanceof Error ? err.message : String(err),
    );
  }
  await admin.end();
}

console.log(failures === 0 ? "\nrow-level security holds." : `\n${failures} failure(s).`);
process.exitCode = failures === 0 ? 0 : 1;