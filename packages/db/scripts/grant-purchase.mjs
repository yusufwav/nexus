/**
 * GRANT A PURCHASE — local development only
 * ------------------------------------------------------------
 * Gives one account a paid entitlement to one module, without going
 * through checkout. For testing the red-team cases: a reader who OWNS
 * a module must get its notes cited, and a reader who does not must be
 * refused, and the only way to have both is for the owning side to be
 * real rather than mocked in application code.
 *
 * NOT A PRODUCTION TOOL. It writes `status = 'paid'` directly with no
 * payment, no receipt and no provider reference. Checkout is the only
 * thing that should ever create a paid row in a real database, and this
 * script has no guard that would stop someone running it against one —
 * so it takes a --confirm flag and refuses to run without it.
 *
 * IDEMPOTENT. Re-running does not stack duplicate purchases: an
 * existing paid row is reported and left alone, a non-paid row (pending
 * or refunded) is promoted rather than duplicated, because the question
 * being asked is "does this account have access", and two rows for one
 * module would make that question ambiguous.
 *
 * Run from packages/db:
 *   node scripts/grant-purchase.mjs <email> <moduleCode> --confirm
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const args = process.argv.slice(2);
const confirmed = args.includes("--confirm");
const [email, moduleCode] = args.filter((a) => !a.startsWith("--"));

if (!email || !moduleCode) {
  console.error("usage: node scripts/grant-purchase.mjs <email> <moduleCode> --confirm");
  process.exit(1);
}

if (!confirmed) {
  console.error(
    "\nThis writes a PAID row with no payment behind it.\n" +
      "Re-run with --confirm if you mean it, and only against a local database.\n",
  );
  process.exit(1);
}

const db = new Client({ connectionString: url });

try {
  await db.connect();

  const user = await db.query(`select id, email from "user" where email = $1`, [email]);
  if (user.rowCount === 0) {
    console.error(`no account with email ${email}`);
    process.exitCode = 1;
  } else {
    const module = await db.query(
      `select id, code, name, price_cents from modules where code = $1`,
      [moduleCode],
    );
    if (module.rowCount === 0) {
      console.error(`no module with code ${moduleCode}`);
      process.exitCode = 1;
    } else {
      const uid = user.rows[0].id;
      const mod = module.rows[0];

      const existing = await db.query(
        `select id, status, amount_cents from purchases
          where "user_id" = $1 and module_id = $2`,
        [uid, mod.id],
      );

      if (existing.rowCount > 0) {
        const row = existing.rows[0];
        if (row.status === "paid") {
          console.log(`already paid: ${email} -> ${mod.code} (${mod.name})`);
          console.log(`  purchase id ${row.id}, R${(row.amount_cents / 100).toFixed(2)}`);
        } else {
          // Pending or refunded: promote the existing row rather than
          // adding a second one for the same module.
          await db.query(
            `update purchases set status = 'paid', updated_at = now() where id = $1`,
            [row.id],
          );
          console.log(`promoted ${row.status} -> paid: ${email} -> ${mod.code} (${mod.name})`);
        }
      } else {
        await db.query(
          `insert into purchases (id, "user_id", module_id, amount_cents, status, provider, provider_ref)
           values ($1, $2, $3, $4, 'paid', 'admin-grant', $5)`,
          [randomUUID(), uid, mod.id, mod.price_cents, `admin-grant-${Date.now()}`],
        );
        console.log(`granted: ${email} -> ${mod.code} (${mod.name})`);
        console.log(`  amount R${(mod.price_cents / 100).toFixed(2)}, provider 'admin-grant'`);
      }

      const after = await db.query(
        `select m.code, m.name, p.status, p.amount_cents
           from purchases p join modules m on m.id = p.module_id
          where p."user_id" = $1 order by m.code`,
        [uid],
      );
      console.log(`\n${email} now holds:`);
      for (const r of after.rows) {
        console.log(`  ${r.code.padEnd(10)} ${r.status.padEnd(9)} R${(r.amount_cents / 100).toFixed(2)}  ${r.name}`);
      }
    }
  }
} catch (err) {
  console.error("failed:", err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
} finally {
  await db.end();
}