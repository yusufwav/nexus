/**
 * IDS
 * ---------------------------------------------------------------------------
 * Local records — a provider, a conversation — need an id that two rows
 * cannot share, and one that a reader cannot guess into existence.
 *
 * `Math.random()` is not that: it is seeded from the clock, it is not
 * cryptographically random, and two devices that start at the same
 * millisecond can produce the same run. These ids are not capability tokens
 * today, but they are written to disk, restored from backups and used as
 * keychain handles, so the cheap fix is to use the platform's CSPRNG and
 * never think about it again.
 */
import { randomUUID } from "expo-crypto";

/** A prefixed 128-bit random id, e.g. `pv_3f2b…`. */
export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}
