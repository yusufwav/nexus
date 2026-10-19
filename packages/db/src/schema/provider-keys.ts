import { defineRelationsPart } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * PROVIDER KEYS — bring your own model credential
 * ------------------------------------------------------------
 * One row per (user, provider). The point of the table is that a reader
 * can point the tutor at a model they pay for, and the credential that
 * does it never becomes the server's problem.
 *
 * THE PLAINTEXT KEY IS NOT HERE. What is stored is
 * `encrypted_key`, which is AES-256-GCM over the credential under a key
 * that exists nowhere in the database — see
 * apps/web/src/lib/key-crypto.ts. Three consequences follow, and all
 * three are the reason for the design:
 *
 *   · a database dump is not a credential dump. Anyone who reaches the
 *     database still holds ciphertext, and GCM is authenticated, so a
 *     tampered row fails to decrypt rather than decrypting to something
 *     an attacker chose;
 *   · the key cannot be rotated per user, because there is only one
 *     server key. Rotating it does invalidate every stored credential,
 *     which is the correct and visible failure — better than a silent
 *     mix of working and broken keys;
 *   · `last_four` is stored in the clear ON PURPOSE. The UI has to
 *     show enough of a key for the reader to recognise which one it is,
 *     and four trailing characters identify a credential to its owner
 *     while being useless to anyone else.
 *
 * `label` is the reader's own name for the credential. It is never used
 * for routing and never sent to a provider.
 *
 * SCOPING IS NOT OPTIONAL AND NOT CONVENTIONAL. Every read and write
 * filters on `user_id`, which comes from getSession() and is never a
 * request parameter — the same rule the chat history obeys, and the same
 * reason: a key id is a guessable value, so looking one up by id alone
 * would hand any reader's credential to anyone who asked. See
 * packages/db/src/queries.ts.
 */
export const providerKeys = pgTable(
  "provider_keys",
  {
    id: text("id").primaryKey(),
    /**
     * Cascade: deleting an account must take its credentials with it.
     * A row that outlives its owner is a credential nobody can revoke.
     */
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * Provider slug, e.g. "openrouter". An allowlist in code, never a
     * free string: this value selects the code that talks to the
     * provider, so an unknown value must not reach a URL builder.
     *
     * EXCEPT FOR `kind = 'custom'`, where the slug is a server-minted
     * opaque token (`custom_<random>`) rather than a name from the
     * reader. See the `kind` column for why that matters — the short
     * version is that the name a reader types for their provider is
     * display-only and never becomes part of a URL, a slug, or a log
     * line.
     */
    provider: text("provider").notNull(),
    /**
     * Built-in, or one the reader pointed at themselves.
     *
     * The allowlist in `apps/web/src/lib/providers.ts` covers
     * `builtin`. `custom` rows carry `base_url` and are validated by
     * `apps/web/src/lib/custom-provider-url.ts` — https only, no
     * credentials in the URL, and every address the host resolves to
     * must be globally routable.
     *
     * Adding this column rather than widening the allowlist is the
     * point: a built-in row still cannot name a host from the database,
     * and the custom case is scoped to the reader who created it.
     */
    kind: text("kind").notNull().default("builtin"),
    /**
     * The reader's own name for a custom provider. Display only.
     *
     * NEVER used to build a URL, derive a slug, or pick a code path.
     * The slug is server-generated precisely so that a name a reader
     * typed — which is arbitrary text, possibly 60 characters of it —
     * cannot end up in a request the server makes.
     */
    name: text("name").notNull().default(""),
    /**
     * Where a `kind = 'custom'` row's requests go. Null for built-ins,
     * whose base URL comes from the in-code allowlist.
     *
     * Nullable rather than defaulted to "" so that "has a base URL" is
     * answerable with a plain `IS NOT NULL` and a row can never carry an
     * empty string that a URL builder would happily accept.
     */
    baseUrl: text("base_url"),
    /**
     * The reader's name for it. Display only.
     */
    label: text("label").notNull().default(""),
    /** AES-256-GCM. Base64 of iv || authTag || ciphertext. */
    encryptedKey: text("encrypted_key").notNull(),
    /** Never enough to reconstruct a key; enough to recognise one. */
    lastFour: text("last_four").notNull(),
    /**
     * Which model to call with it. Stored per credential so a reader can
     * keep a cheap one for testing beside an expensive one, and so the
     * default is theirs to change rather than ours.
     */
    modelId: text("model_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // One credential per provider per reader: re-saving replaces rather
    // than accumulating, which is what someone pasting a rotated key
    // expects to happen.
    uniqueIndex("provider_keys_user_provider_idx").on(table.userId, table.provider),
    index("provider_keys_user_idx").on(table.userId),
  ],
);

export const providerKeysRelations = defineRelationsPart({ providerKeys, user }, (r) => ({
  providerKeys: {
    user: r.one.user({
      from: r.providerKeys.userId,
      to: r.user.id,
    }),
  },
  user: {
    providerKeys: r.many.providerKeys({
      from: r.user.id,
      to: r.providerKeys.userId,
    }),
  },
}));