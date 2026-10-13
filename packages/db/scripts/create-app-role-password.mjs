/**
 * Set the app role's password, read from the environment.
 *
 * Split from create-app-role.mjs so the credential is never a literal in a
 * file that gets committed, printed, or pasted into a chat. The only place
 * it exists is the shell that runs this, and it is not echoed.
 *
 * Run from packages/db, as the owner:
 *   $env:NEXUS_APP_PASSWORD = (node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
 *   node scripts/create-app-role-password.mjs
 *
 * On Supabase you will NOT use this — the hosted dashboard issues the
 * password, or you set DATABASE_URL to a role Supabase created for you.
 * See the printed instructions at the end.
 */
import { Client } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const ROLE = "nexus_app";
const password = process.env.NEXUS_APP_PASSWORD;

if (!password) {
  console.error(
    "NEXUS_APP_PASSWORD is not set.\n" +
      "Generate one and set it in the same command so it stays out of history:\n\n" +
      '  $env:NEXUS_APP_PASSWORD = (node -e "console.log(require(\'crypto\').randomBytes(24).toString(\'base64url\'))")\n' +
      "  node scripts/create-app-role-password.mjs\n" +
      "  Remove-Item Env:NEXUS_APP_PASSWORD\n",
  );
  process.exit(1);
}

if (password.length < 24) {
  console.error("refusing a password under 24 characters; generate one rather than typing it.");
  process.exit(1);
}

const client = new Client({ connectionString: url });

try {
  await client.connect();

  const exists = await client.query(`select rolname from pg_roles where rolname = $1`, [ROLE]);
  if (exists.rows.length === 0) {
    console.error(`role ${ROLE} does not exist. Run create-app-role.mjs first.`);
    process.exit(1);
  }

  // format() with %L quotes the literal, so a password containing a quote
  // or a backslash is escaped rather than breaking the statement — and
  // cannot be used to inject SQL.
  const stmt = await client.query(
    `select format('ALTER ROLE %I PASSWORD %L', $1::text, $2::text) as s`,
    [ROLE, password],
  );
  await client.query(stmt.rows[0].s);

  console.log(`ok: password set on ${ROLE} (not printed anywhere)`);
  console.log("\nNext: verify the role is genuinely restricted before using it.");
  console.log("  node scripts/verify-app-role.mjs");
  console.log("\nThe DATABASE_URL for this role is:");
  console.log("  postgresql://nexus_app:<the password you just set>@<host>:<port>/<db>");
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await client.end();
}