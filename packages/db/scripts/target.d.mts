/**
 * Types for target.mjs, which is plain ESM JavaScript.
 *
 * This exists so apps/web/scripts/import-practice-questions.ts can reuse
 * the ONE implementation of "which database, and may we write to it"
 * without a local copy. Duplicating that logic in a second file means two
 * implementations of a production-safety check, and the second one is the
 * one nobody updates.
 */

export interface ResolvedTarget {
  /** The connection string, with any surrounding quotes stripped. */
  readonly url: string;
  /** True when the host is loopback. */
  readonly local: boolean;
  /** The hostname, for logging. */
  readonly host: string;
  /** Whether --prod was passed. */
  readonly prod: boolean;
}

/**
 * Resolve the target database, printing which one it is, or exit(1) if the
 * request is ambiguous or unsafe.
 */
export declare function resolveTarget(options: {
  readonly script: string;
  /** True when the script writes. Affects the warning printed, not the guard. */
  readonly write?: boolean;
}): ResolvedTarget;

/** Strip surrounding quotes from an env-file value. */
export declare function unquote(value: string): string;

/** The hostname of a postgres URL, or "" if unreadable. */
export declare function hostOf(url: string): string;

/** True when the host is loopback. */
export declare function isLocal(url: string): boolean;