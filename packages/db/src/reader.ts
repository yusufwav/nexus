import { sql, type SQL } from "drizzle-orm";

import type { Database } from ".";

/**
 * ROW-LEVEL SECURITY IDENTITY
 * ------------------------------------------------------------
 * Until this existed, every per-reader table was protected by exactly
 * one thing: a `where user_id = $1` that some future edit could forget.
 * Better Auth's own tables had RLS switched on; ours did not, so the
 * asymmetry was that the *least* sensitive tables were the defended ones.
 *
 * The identity is a transaction-local Postgres setting rather than a
 * function argument, because a policy cannot see an argument. It is set
 * with `set_config(..., true)` so it is scoped to the transaction and
 * reverts on commit - a pooled connection cannot carry one reader's
 * identity into the next reader's query, which is the failure mode that
 * would make this worse than having nothing.
 *
 * WHAT THIS ACTUALLY BUYS, stated plainly so it is not oversold:
 *
 *   · It makes an application BUG fail closed. A query that forgets its
 *     `where user_id` now returns nothing instead of another reader's
 *     rows. That is the realistic accident, and it is the one worth
 *     defending against.
 *   · It makes a READ-ONLY leak useless. A read replica, a backup opened
 *     by a support tool, or an analytics process running as this role
 *     sees no rows at all without a reader identity set.
 *
 * WHAT IT DOES NOT BUY, and this matters:
 *
 *   · It is NOT a defence against SQL injection. Anything able to run
 *     arbitrary SQL can also run `set_config('app.user_id', ...)`. If you
 *     are reasoning about an attacker who already has a SQL hole, this
 *     layer is not what stops them.
 *
 * For the credential specifically that is acceptable, because the real
 * protection is upstream and cryptographic: `provider_keys.encrypted_key`
 * is AES-256-GCM ciphertext and a database dump is not a credential dump.
 * This layer is the second lock on the door, not the only one.
 */

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Run `fn` as `userId`, inside one transaction, with the RLS identity set.
 *
 * Every query in `fn` therefore runs under that reader's policy. A query
 * that escapes this wrapper runs with NO identity set, and a policy written
 * against a null identity denies - so the default is closed.
 */
export async function withReader<T>(
  db: Database,
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // true = transaction-local, so the value is gone once the transaction
    // ends and cannot be inherited by the next borrower of this connection.
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/**
 * Run `fn` with no reader identity - for work that is not on behalf of a
 * reader: the catalogue, migrations, and the ingestion scripts.
 *
 * On tables that HAVE a policy this returns nothing, which is the point:
 * a reader-scoped table is unreachable from here by construction, and the
 * ingestion path that must write to it fails loudly rather than silently
 * running unscoped.
 */
export async function withSystem<T>(db: Database, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${''}, true)`);
    return fn(tx);
  });
}

/** The identity a policy sees, or NULL when none is set. */
export const READER_GUC: SQL = sql`app_reader_id()`;