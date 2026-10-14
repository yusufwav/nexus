import { sql } from "drizzle-orm";

import type { Database } from ".";

/**
 * THE CONTENT READ BUDGET
 * ------------------------------------------------------------
 * `GET /api/topics/[slug]` is correctly gated -- it checks the session before
 * resolving the slug, then requires a paid purchase for the parent module, and
 * reads from `private-assets/` rather than `/public`. That is the access
 * control. This is the *pace*.
 *
 * Gating answers "may this reader have this file". It does not answer "how
 * many times may they ask", and one paying reader asking for all 79 topics in
 * a single session is a perfectly authorised sequence of requests. So the
 * remaining hole was never an auth bug. It was that nothing resisted
 * repetition.
 *
 * WHY DELAY AND NOT A REFUSAL
 *
 * The obvious design is a 429 once the ceiling is passed, and it is the wrong
 * one here for a reason specific to this product. The gate exists to keep
 * unverified readers out of the tutor. A reader who is throttled away from a
 * PDF they have paid for has been caught by a defence aimed at a different
 * crime, and there is no route back: the account is simply broken. A 429 is
 * also free for a scraper to retry -- refusal costs them nothing, so refusing
 * is the one response that buys no time at all.
 *
 * Delaying costs a loop real wall-clock and costs an honest reader nothing,
 * because the free allowance is measured (see FREE_PER_WINDOW) to sit far
 * above anything one reader can legitimately do. Nobody hits the delay. A
 * scraper hits every step of it.
 *
 * WHAT THIS ACTUALLY BUYS, STATED PLAINLY
 *
 * It does not stop anyone. Someone willing to wait four minutes gets the
 * corpus, and no version of this file changes that -- there is no browser
 * mechanism and no server mechanism that can make delivered content
 * undeliverable. What it does is make the naive loop (79 requests, one thread,
 * no pacing) take minutes instead of seconds, which is the difference between
 * a script anyone can write and an afternoon of deliberate effort that leaves
 * a record. Attribution, not prevention, is what actually answers this
 * problem -- see TODO.md section 3.
 */

/**
 * Free requests per window, per reader.
 *
 * NOT a guess about how fast a human reads. Measured, in TODO.md section 1:
 * topics are grouped 6-per-module across 13 modules (MAPV112 carries 7), and a
 * reader works one module at a time, so the largest burst a real reader can
 * legitimately produce is 7 downloads in a sitting. 20 sits at nearly three
 * times that, covering someone skimming across several modules in a minute,
 * while a full-corpus pull of 79 is still four times past it.
 *
 * The consequence worth stating: because the allowance exceeds the honest
 * burst by design, the delay is unreachable for a legitimate reader. That is
 * the whole reason degrading is safe here.
 */
const FREE_PER_WINDOW = 20;

/** Window length. Short enough that a burst is bounded, long enough not to matter to a reader. */
const WINDOW_MS = 60_000;

/** Milliseconds added per request beyond the free allowance. */
const DELAY_STEP_MS = 250;

/**
 * Ceiling on the delay for a single request.
 *
 * This is a guard against a hung request, not a tuning knob. At the step above
 * the cap is reached 24 requests into the overage, so a 79-request pull spends
 * its first over-limit requests ramping and everything after that at the cap --
 * about four minutes of added delay against roughly one minute of actual
 * transfers. Raising this would slow a loop further, but it would also be the
 * first thing a real reader on a bad connection notices, and the honest burst
 * is what this number exists to protect.
 */
const MAX_DELAY_MS = 6_000;

/** Slightly longer than the window so rows are cleaned, not just ignored. */
const RETENTION_MS = 30 * 60_000;

export type ReadBudget = {
  /** Milliseconds the caller should wait before sending the body. */
  readonly delayMs: number;
  /** Requests counted in the current window, including this one. */
  readonly count: number;
  /** How far past the free allowance this request is. */
  readonly overFree: number;
};

/**
 * The delay curve, separated from the database so it can be tested as the pure
 * function it is.
 *
 * Exported because the number matters and "trust the route" is how a limit
 * silently stops being one. Exported for the test.
 */
export function readDelayMs(count: number): number {
  const over = count - FREE_PER_WINDOW;
  if (over <= 0) {
    return 0;
  }
  return Math.min(MAX_DELAY_MS, over * DELAY_STEP_MS);
}

/**
 * Count one content read against `userId`'s budget, in a single round trip.
 *
 * The upsert carries the whole decision, so there is no read-then-write race:
 * two concurrent requests cannot both observe "19 used" and both be admitted
 * as the twentieth. That race is not theoretical here -- parallelising a
 * download loop is the first thing anyone would try, and it is exactly what
 * would defeat a counter written as SELECT-then-UPDATE.
 *
 * WHY `id` IS A FRESH RANDOM VALUE EVERY TIME
 *
 * A bug that only appeared when this was run against a real database rather
 * than a real file:
 *
 *   duplicate key value violates unique constraint "read_usage_pkey"
 *   Key (id)=(read:uac8Ri...) already exists.
 *
 * The row has TWO unique constraints: `id` is the primary key and `user_id` is
 * unique. `ON CONFLICT (user_id)` names exactly one arbiter, so when two
 * requests arrive before any row exists, both attempt an INSERT and the loser
 * collides on the *primary key* -- a different constraint, which the clause
 * does not cover, so Postgres raises instead of taking the update path.
 *
 * A serialised download never finds this. Thirty fired at once find it every
 * time. So `id` gets a fresh value per attempt, leaving `user_id` as the only
 * constraint that can actually be contended -- which is what the clause was
 * already claiming to handle. `ON CONFLICT DO UPDATE` with no target would
 * also work but stops saying *which* conflict it expects, and the explicit
 * form is the one worth keeping.
 *
 * `count` resets to 1 when the window has expired, so this is a real window
 * rather than a lifetime cap that eventually locks a reader out permanently --
 * the failure this whole file is arranged to avoid.
 *
 * One statement, not two, and no transaction: a single statement is already
 * atomic in Postgres, and wrapping it would turn a per-request round trip into
 * a BEGIN/COMMIT pair. The delay comes back from the same statement that
 * decided the count, so the two cannot disagree.
 */
export async function consumeReadBudget(db: Database, userId: string): Promise<ReadBudget> {
  const windowSeconds = Math.round(WINDOW_MS / 1000);

  const rows = await db.execute(sql`
    insert into read_usage (id, user_id, window_started_at, count, updated_at)
    values (gen_random_uuid()::text, ${userId}, now(), 1, now())
    on conflict (user_id) do update set
      count = case
        when read_usage.window_started_at <= now() - make_interval(secs => ${windowSeconds})
          then 1
        else read_usage.count + 1
      end,
      window_started_at = case
        when read_usage.window_started_at <= now() - make_interval(secs => ${windowSeconds})
          then now()
        else read_usage.window_started_at
      end,
      updated_at = now()
    returning count
  `);

  const count = Number((rows.rows[0] as { count: number } | undefined)?.count ?? 1);
  const overFree = Math.max(0, count - FREE_PER_WINDOW);

  // Opportunistic cleanup: one statement, best effort, best-effort must never
  // fail the request. 1-in-N rather than every call, because an unindexed-by-
  // now() delete on the content path is a tax on every honest reader to pay
  // for rare housekeeping. Matches the tutor budget's reasoning.
  if (count % 25 === 1) {
    void db
      .execute(
        sql`
          delete from read_usage
           where updated_at < now() - make_interval(secs => ${Math.round(RETENTION_MS / 1000)})
        `,
      )
      .catch(() => undefined);
  }

  return { delayMs: readDelayMs(count), count, overFree };
}

/** What the route and the test use. */
export const READ_BUDGET = {
  FREE_PER_WINDOW,
  WINDOW_MS,
  RETENTION_MS,
  DELAY_STEP_MS,
  MAX_DELAY_MS,
} as const;