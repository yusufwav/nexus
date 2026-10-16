import { sql } from "drizzle-orm";

import type { Database } from ".";

/**
 * THE TUTOR'S SPENDING BUDGET
 * ------------------------------------------------------------
 * /api/ai is the most expensive thing in the app to leave open: every
 * call is a real model invocation billed to whoever holds the key, and
 * with BYOK a refused or substituted call still lands on the server's
 * account. There was no limit at all — thirty consecutive POSTs returned
 * 200 — so a free account was a way to drain the quota.
 *
 * WHY A SEPARATE TABLE AND NOT BETTER AUTH'S `rateLimit`
 *
 *   · Different key namespace. Better Auth keys are path-shaped
 *     (`/sign-in/email:127.0.0.1`) and it also writes `last_request` in
 *     BIGINT millisecond epoch. Sharing the table means two writers
 *     reasoning about the same rows with different assumptions, and a
 *     collision would silently reset one of the two limits.
 *   · Different failure mode. Better Auth's limits are about credential
 *     endpoints; its absence is a 500 (SCHEMA_MISMATCH). Ours must be
 *     able to fail OPEN for the reader's own key while still refusing
 *     the server's — see `consumeAiBudget`.
 *
 * WHY THE COUNTER IS IN THE DATABASE
 *
 *   A restart or a cold start must not hand back a fresh allowance. On a
 *   serverless platform a new instance is created constantly, so an
 *   in-memory counter would make the limit close to meaningless. This is
 *   the same reasoning as Better Auth's `storage: "database"`, applied to
 *   the route that actually costs money.
 */

/** Turns per window, per reader. */
const MAX_TURNS = 20;
/** Window length. */
const WINDOW_MS = 60_000;

/** Slightly longer than the window so rows are cleaned, not just ignored. */
const RETENTION_MS = 10 * 60_000;

export type AiBudget = {
  readonly allowed: boolean;
  readonly remaining: number;
  /** 0 when allowed; milliseconds until the window frees up when not. */
  readonly retryAfterMs: number;
  /**
   * True when the counter could not be reached.
   *
   * `allowed` is then ALWAYS true and means nothing on its own — this budget
   * deliberately does not decide alone. A degraded budget means "we do not
   * know how many turns this reader has used", and whether that is survivable
   * depends entirely on WHO PAYS for the next call:
   *
   *   · the reader's own key — survivable. It is their money and their rate,
   *     and this counter exists to protect the server's account, not theirs.
   *   · the server's key    — NOT survivable. That spend is the owner's, and
   *     an unlimited counter is precisely the hole this table was built to
   *     close. Thirty unguarded POSTs returning 200 is the situation this
   *     whole file was written in response to.
   *
   * So the caller decides, using this flag. /api/ai checks it immediately
   * after `resolveTutorModel`, because the source is not known any earlier.
   */
  readonly degraded: boolean;
};

/**
 * Count one turn against `userId`'s budget, in a single round trip.
 *
 * The upsert carries the whole decision so there is no read-then-write
 * race: two concurrent requests cannot both observe "19 turns used" and
 * both be admitted as the twentieth. That race is not theoretical — it is
 * exactly what an attacker sends when they want more than the limit.
 *
 * `count` is only incremented when the window is open, and RESET to 1
 * when it has expired. So the window is a real window rather than a
 * lifetime cap that eventually locks a reader out permanently.
 *
 * `id` IS A FRESH RANDOM VALUE, AND IT WAS NOT ALWAYS
 *
 * `ai_usage` has two unique constraints: `id` is the primary key and `user_id`
 * is unique. This clause names only one arbiter, so when two requests arrived
 * before any row existed, both attempted an INSERT and the loser collided on
 * the *primary key* instead of taking the update path:
 *
 *   duplicate key value violates unique constraint "ai_usage_pkey"
 *
 * A throw here is not recoverable for this route's own contract, which is
 * written to fail OPEN for the reader's key and refuse only the server's. An
 * unhandled 23505 is neither — it is a 500 on the tutor. Measured at roughly
 * 1 in 120 concurrent first-turns, so it was real and had simply never been
 * seen because nothing had ever fired two tutor turns at the same instant for
 * a brand-new account.
 *
 * Found while building the read budget in packages/db/src/read-budget.ts, which
 * had the identical shape and the identical fault; that one is now pinned by
 * scripts/test-read-budget.ts.
 *
 * ONE STATEMENT, NOT TWO, AND NOT IN A TRANSACTION
 *
 * The obvious shape is an upsert followed by a SELECT for the retry
 * delay. That is a transaction around two round trips for something a
 * single statement can return, and on the hot path for every tutor turn
 * that is the wrong trade. Both the new count and the delay come back
 * from the RETURNING clause, computed against the same `now()` that
 * decided the increment — so the two cannot disagree, which they could
 * if the window expired between two separate statements.
 *
 * Note there is no transaction wrapper here either. A single statement is
 * already atomic in Postgres; wrapping it would buy nothing and would
 * turn a per-turn database round trip into a BEGIN/COMMIT pair.
 */
export async function consumeAiBudget(db: Database, userId: string): Promise<AiBudget> {
  const windowSeconds = Math.round(WINDOW_MS / 1000);

  /*
   * THE COUNTER MUST NOT THROW, BUT IT MUST NOT DECIDE ALONE EITHER.
   *
   * This function's own header promises that the budget "must be able to
   * fail OPEN for the reader's own key while still refusing the server's".
   * That was documented and not implemented: the upsert below sat bare, so
   * a missing `ai_usage` table — or any other failure — propagated out of
   * `/api/ai` as a 500. The promise in the comment was aspirational, which
   * is the worst kind of documentation, because it reads as a guarantee.
   *
   * The failure is now caught and reported as `degraded`, and the DECISION
   * moves to the caller, which is the only place that knows whose money is
   * about to be spent. Failing open unconditionally would be wrong here in a
   * way it is right on the content route: there, an uncounted request just
   * means a bulk loop runs fast. Here, an uncounted request on the SERVER's
   * key is a real drain of the owner's quota, and this table exists for no
   * other purpose.
   */
  try {
    const rows = await db.execute(sql`
      insert into ai_usage (id, user_id, window_started_at, count, updated_at)
      values (gen_random_uuid()::text, ${userId}, now(), 1, now())
      on conflict (user_id) do update set
        count = case
          when ai_usage.window_started_at <= now() - make_interval(secs => ${windowSeconds})
            then 1
          else ai_usage.count + 1
        end,
        window_started_at = case
          when ai_usage.window_started_at <= now() - make_interval(secs => ${windowSeconds})
            then now()
          else ai_usage.window_started_at
        end,
        updated_at = now()
      returning
        count,
        greatest(
          0,
          extract(epoch from (
            ai_usage.window_started_at + make_interval(secs => ${windowSeconds}) - now()
          )) * 1000
        )::bigint as retry_after_ms
    `);

    const row = rows.rows[0] as { count: number; retry_after_ms: number | string } | undefined;
    const count = Number(row?.count ?? 1);
    const retryAfterMs = Number(row?.retry_after_ms ?? 0);

  // Opportunistic cleanup: one statement, best effort, and it must never
  // fail the request. 1-in-N rather than every call, because an
  // unindexed-by-now() delete on the hot path is a tax on every honest
  // reader to pay for a rare housekeeping job.
  if (count % 25 === 1) {
    void db
      .execute(
        sql`
          delete from ai_usage
           where updated_at < now() - make_interval(secs => ${Math.round(RETENTION_MS / 1000)})
        `,
      )
      .catch(() => undefined);
  }

  return {
    allowed: count <= MAX_TURNS,
    remaining: Math.max(0, MAX_TURNS - count),
    retryAfterMs: count <= MAX_TURNS ? 0 : retryAfterMs,
    degraded: false,
  };
  } catch (err) {
    // Loud, and it names the consequence: the caller is about to decide
    // whether to refuse, and that decision should be traceable to this line.
    console.error(
      "[ai-budget] counter unavailable, decision deferred to the caller:",
      err instanceof Error ? err.message : String(err),
      "| check that ai_usage exists in this database (packages/db/scripts/create-ai-usage-table.mjs)",
    );
    return { allowed: true, remaining: 0, retryAfterMs: 0, degraded: true };
  }
}

/** What the route calls. Exported for the test. */
export const AI_BUDGET = { MAX_TURNS, WINDOW_MS, RETENTION_MS } as const;