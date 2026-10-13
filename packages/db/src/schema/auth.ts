import { defineRelationsPart } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, index, integer, bigint } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  /**
   * The reader's chosen palette, stored on the account rather than only in
   * the browser.
   *
   * Nullable on purpose: NULL means "never chose", which is different from
   * "chose light". That distinction is what lets a new reader fall through
   * to the site default instead of being pinned to whatever the last
   * device they used happened to be set to.
   *
   * Free text, NOT a database enum and NOT a CHECK constraint. More themes
   * are coming - gruvbox, dracula, and others - and an enum or a CHECK
   * would make every one of them a table migration, applied to production
   * while readers are signed in, purely to widen an allowed value list.
   *
   * The trade is that the database will happily store a value that is not a
   * real theme, which is what the registry in
   * apps/web/src/lib/themes.ts exists to catch: an unrecognised id is not
   * applied and falls back to the default. Adding a theme then costs one
   * entry in one array, and no migration at all.
   */
  theme: text("theme"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

/**
 * Rate limiting, back-ended by the database so the budget survives a
 * restart — an in-memory store would hand an attacker a fresh
 * allowance every time the process cycled. better-auth writes and
 * reads this table itself; it exists here because
 * `rateLimit: { storage: "database" }` in packages/auth fails closed
 * with SCHEMA_MISMATCH if the table is absent, which turns every
 * sign-in and sign-up into a 500 rather than leaving the limit off.
 */
export const rateLimit = pgTable(
  "rateLimit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    // better-auth stores this as a bigint millisecond epoch
    // (Date.now()), not a timestamp — see get-tables.mjs, where
    // lastRequest is { type: "number", bigint: true }. A timestamp
    // column here fails at runtime with "value.toISOString is not a
    // function".
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [index("rateLimit_key_idx").on(table.key)],
);

export const authRelations = defineRelationsPart(
  { user, session, account, verification, rateLimit },
  (r) => ({
  user: {
    sessions: r.many.session({
      from: r.user.id,
      to: r.session.userId,
    }),
    accounts: r.many.account({
      from: r.user.id,
      to: r.account.userId,
    }),
  },
  session: {
    user: r.one.user({
      from: r.session.userId,
      to: r.user.id,
    }),
  },
  account: {
    user: r.one.user({
      from: r.account.userId,
      to: r.user.id,
    }),
  },
}));
