import { defineRelationsPart } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * MODULES + PURCHASES
 * ------------------------------------------------------------
 * `modules` is the source of truth for /modules and /modules/[code].
 * The landing page still carries its own hardcoded list so the
 * homepage renders without a database — see
 * apps/web/src/lib/modules.ts, which falls back to it.
 *
 * `purchases` exists ahead of the payment integration. Nothing
 * writes to it yet (see IDEAS/TODO.md); the shape is here so the
 * eventual Paystack/Yoco webhook has somewhere to land.
 */

/** Whether a module can be bought, or is announced but unwritten. */
export const moduleStatus = pgEnum("module_status", ["available", "coming-soon"]);

/** Where a purchase is in its lifecycle. `paid` is the only one that grants access. */
export const purchaseStatus = pgEnum("purchase_status", ["pending", "paid", "refunded"]);

export const modules = pgTable(
  "modules",
  {
    id: text("id").primaryKey(),
    /** NMU course code, e.g. MATT101. Human-facing, so it is the natural key. */
    code: text("code").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    /** Stored in cents to keep arithmetic exact. R50 is 5000. */
    priceCents: integer("price_cents").notNull().default(0),
    /** Whether a free sample PDF exists for this module. */
    hasTrialPdf: boolean("has_trial_pdf").notNull().default(false),
    status: moduleStatus("status").notNull().default("available"),
    /** Manual display order. The seed writes the catalogue order. */
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("modules_code_idx").on(table.code),
    index("modules_sort_idx").on(table.sortOrder),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    moduleId: text("module_id")
      .notNull()
      .references(() => modules.id, { onDelete: "cascade" }),
    /** What was charged at the time of purchase, copied from modules.price_cents. */
    amountCents: integer("amount_cents").notNull(),
    status: purchaseStatus("status").notNull().default("pending"),
    /** Payment provider slug. Reserved for "paystack" / "yoco" once wired. */
    provider: text("provider").notNull().default("stub"),
    /** The provider's own transaction id, for webhook reconciliation. */
    providerRef: text("provider_ref"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // One purchase per user per module. A re-purchase after a refund
    // updates the existing row rather than inserting a second one.
    uniqueIndex("purchases_user_module_idx").on(table.userId, table.moduleId),
    index("purchases_user_idx").on(table.userId),
  ],
);

// `user` has to be in the scope object even though its relations are
// declared in auth.ts — defineRelationsPart only exposes the tables it
// is handed, so r.user is needed to build purchases -> user. The
// counterpart (user -> purchases) is declared here rather than in
// auth.ts so the two halves stay in one place.
export const modulesRelations = defineRelationsPart({ user, modules, purchases }, (r) => ({
  user: {
    purchases: r.many.purchases({
      from: r.user.id,
      to: r.purchases.userId,
    }),
  },
  modules: {
    purchases: r.many.purchases({
      from: r.modules.id,
      to: r.purchases.moduleId,
    }),
  },
  purchases: {
    user: r.one.user({
      from: r.purchases.userId,
      to: r.user.id,
    }),
    module: r.one.modules({
      from: r.purchases.moduleId,
      to: r.modules.id,
    }),
  },
}));