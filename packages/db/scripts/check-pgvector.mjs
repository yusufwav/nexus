/**
 * Does this database have pgvector, and can this role install it?
 *
 * Run it against whichever database you are about to depend on. It
 * answers the question by looking, not by guessing at the provider:
 * Supabase, Neon, RDS, Railway and Render all differ, and the only
 * reliable test is the one against your actual host.
 *
 *   local:    $env:DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
 *             node scripts/check-pgvector.mjs
 *
 *   hosted:   $env:DATABASE_URL="postgresql://...your hosted url..."
 *             node scripts/check-pgvector.mjs
 *
 * Reports only. To actually install it (a real change to the database),
 * pass --apply.
 *
 * Run from packages/db.
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const apply = process.argv.includes("--apply");

// Never echo the password back.
const masked = url.replace(/\/\/([^:]+):([^@]+)@/, "//$1:***@");

/*
 * `--apply` RUNS DDL AGAINST WHATEVER DATABASE_URL POINTS AT.
 *
 * The read-only path is safe anywhere, so only the writing path is
 * restricted. This is a smaller deal than grant-purchase.mjs — installing
 * pgvector is an intended production step, and refusing it on a hosted
 * database would mean the check could never be used for the deployment it
 * exists to verify.
 *
 * So the requirement is the opposite one: state the target, and require
 * the caller to name it. A typo in DATABASE_URL now fails loudly instead
 * of quietly creating an extension on the wrong server, and the decision
 * is recorded in the command rather than made by a flag someone passed in
 * a hurry.
 *
 *   node scripts/check-pgvector.mjs --apply --yes-host=db.example.com
 *
 * Reading (no --apply) needs neither.
 */
const applyHostArg = process.argv.find((a) => a.startsWith("--yes-host="));
const applyHost = applyHostArg?.slice("--yes-host=".length);

if (apply && !applyHost) {
  console.error(
    "\n--apply changes the database. Name the target you mean:\n" +
      "  node scripts/check-pgvector.mjs --apply --yes-host=<host-from-DATABASE_URL>\n",
  );
  process.exit(1);
}

if (applyHost) {
  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    console.error("DATABASE_URL is not a URL this script can parse; refusing to run.");
    process.exit(1);
  }
  if (host !== applyHost) {
    console.error(
      `\n--apply target mismatch.\n` +
        `  DATABASE_URL points at: ${host}\n` +
        `  --yes-host named:     ${applyHost}\n\n` +
        `  Re-run with --yes-host=${host} if that is what you meant.\n`,
    );
    process.exit(1);
  }
}

const client = new Client({ connectionString: url });
const results = [];
const ok = (m) => results.push(["ok", m]);
const bad = (m) => results.push(["BAD", m]);

/**
 * Turn a connection failure into something a person can act on.
 *
 * The bare `FAIL` this replaces WAS the whole diagnostic output when the
 * database was unreachable, which is the moment someone most needs to be
 * told what went wrong. Two shapes caused that:
 *
 *   · node's `AggregateError` — thrown when several addresses are tried
 *     (IPv4 and IPv6) and all fail. Its `.message` is EMPTY; the detail
 *     lives in `.errors`, so `err.message` printed nothing at all.
 *   · a wrong password, which surfaces as
 *     `SASL: SCRAM-SERVER-FIRST-MESSAGE-FAILED-METHOD: client password must be a string`
 *
 * So: unwrap the aggregate, and say plainly which likely cause it looks
 * like. A connection failure is almost never a pgvector problem, and
 * conflating the two sends people off to install an extension that is
 * already installed.
 */
function describe(err) {
  const parts = [];
  if (err instanceof Error) {
    if (Array.isArray(err.errors)) {
      for (const e of err.errors) parts.push(e instanceof Error ? e.message : String(e));
    } else if (err.message) {
      parts.push(err.message);
    } else {
      parts.push(err.code ?? err.name ?? "unknown error");
    }
  } else {
    parts.push(String(err));
  }

  const text = [...new Set(parts)].filter(Boolean);
  if (text.length === 0) return "could not connect, and the driver gave no reason";

  const joined = text.join("; ");
  let advice = "";
  if (/password must be a string|SCRAM-SERVER-FIRST|password authentication failed/i.test(joined)) {
    advice =
      "\n  -> the credentials are wrong. Check DATABASE_URL for a literal\n" +
      "     <YOUR-PASSWORD> placeholder left in the connection string.";
  } else if (/ENOTFOUND|EAI_AGAIN/i.test(joined)) {
    advice = "\n  -> the hostname does not resolve. Check the endpoint hostname.";
  } else if (/ETIMEDOUT|ECONNREFUSED|EHOSTUNREACH|ENETUNREACH/i.test(joined)) {
    advice =
      "\n  -> could not reach the port. Either this network blocks it (some campus\n" +
      "     and corporate Wi-Fi allow only 443), or an IP allow list on the branch\n" +
      "     is excluding this machine.";
  } else if (/certificate|self.signed/i.test(joined)) {
    advice = "\n  -> TLS failed. Check sslmode in DATABASE_URL.";
  }

  return `${joined}${advice}`;
}

try {
  await client.connect();

  const db = await client.query("select current_database() as n, current_user as u, version() as v");
  console.log(`target   ${masked}`);
  console.log(`database ${db.rows[0].n}   role ${db.rows[0].u}`);
  console.log(`server   ${db.rows[0].v.split(" ").slice(0, 2).join(" ")}\n`);

  // 1. Already installed?
  const inst = await client.query("select extversion from pg_extension where extname = 'vector'");
  if (inst.rows.length > 0) {
    ok(`pgvector is INSTALLED (version ${inst.rows[0].extversion}) — nothing to do.`);
    console.log(results.map(([k, m]) => `  ${k === "ok" ? "PASS" : "FAIL"}  ${m}`).join("\n"));
    await client.end();
    process.exit(0);
  }

  // 2. Offered by this server at all?
  const avail = await client.query(
    "select default_version from pg_available_extensions where name = 'vector'",
  );
  if (avail.rows.length === 0) {
    bad("pgvector is NOT offered by this server at all.");
    console.log(
      "\n  The host cannot do it. This is not a permissions problem and no\n" +
        "  amount of retrying will change it. Fall back: store embeddings as\n" +
        "  float8[] and rank with a cosine expression in SQL. Slower, but it\n" +
        "  needs nothing — see IDEAS/TODO.md.",
    );
    await client.end();
    process.exit(1);
  }
  ok(`pgvector is available to install (default version ${avail.rows[0].default_version})`);

  // 3. Can this role install it? Checked without changing anything.
  const canCreate = await client.query(
    "select has_database_privilege(current_user, current_database(), 'CREATE') as can",
  );
  if (!canCreate.rows[0].can) {
    bad(`role ${db.rows[0].u} cannot CREATE on this database, so cannot add an extension.`);
    console.log(
      "\n  The extension is there but your role may not install it. Run this\n" +
        "  once as the database owner or an admin:\n\n" +
        "    CREATE EXTENSION vector;\n\n" +
        "  On a managed host, 'postgres' or a similar admin role usually has\n" +
        "  the grant, while the role your app connects with does not.",
    );
    await client.end();
    process.exit(1);
  }
  ok(`role ${db.rows[0].u} has CREATE on this database`);

  if (apply) {
    await client.query("CREATE EXTENSION IF NOT EXISTS vector");
    const now = await client.query("select extversion from pg_extension where extname = 'vector'");
    ok(`pgvector installed (version ${now.rows[0].extversion})`);
  } else {
    console.log(
      "\n  Re-run with --apply to install it. This changes the database.",
    );
  }
} catch (err) {
  bad(describe(err));
} finally {
  await client.end().catch(() => {});
}

console.log(results.map(([k, m]) => `  ${k === "ok" ? "PASS" : "FAIL"}  ${m}`).join("\n"));
process.exitCode = results.some(([k]) => k === "BAD") ? 1 : 0;