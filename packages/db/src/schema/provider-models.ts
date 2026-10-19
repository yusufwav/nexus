import { defineRelationsPart } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { user } from "./auth";

/**
 * THE MODEL CATALOGUE OF A CUSTOM PROVIDER
 * ------------------------------------------------------------
 * One row per (reader, provider, model id). Two sources feed it:
 *
 *   'free'    ids ending in `:free` that the reader's own endpoint
 *             returned from `{baseUrl}/models`. Refreshable, and a
 *             refresh REPLACES the free rows for that provider rather
 *             than merging into them — a provider that has retired a
 *             free tier has to be able to say so.
 *
 *   'custom'  ids a reader typed by hand, for the models the pull
 *             cannot see. Every self-hosted endpoint is this case, and
 *             so is any provider whose free models are priced at zero
 *             without carrying the suffix. A refresh must never delete
 *             these, which is why they are a separate source rather
 *             than "anything not currently free".
 *
 * WHY A TABLE AND NOT A COLUMN
 * ------------------------------------------------------------
 * A JSON array on `provider_keys` would have been one fewer thing to
 * migrate. It would also have made the one check that matters
 * impossible to state in SQL: that a model id the tutor is about to
 * call is one this reader actually has on this provider. With rows,
 * that is `select 1 from provider_models where user_id = $1 and
 * provider = $2 and model_id = $3`, and a model id arriving in a
 * request body has to match it or the turn is refused before anything
 * is sent anywhere.
 *
 * THAT CHECK IS THE WHOLE REASON CUSTOM ROUTING IS NOT HOLE-PERSONAL.
 * A reader can point the tutor at an endpoint they name; they cannot
 * make the server call a model that is not in the catalogue they built,
 * so a crafted `modelId` cannot reach an arbitrary path on someone
 * else's server.
 *
 * WHY IT SCOPES ON `user_id` AND NOT ON THE PROVIDER ALONE
 * ------------------------------------------------------------
 * Same reason `chat_threads` and `provider_keys` do: the provider slug
 * is reader-supplied for custom rows, so it is not a safe lookup key on
 * its own. Every query filters on the id from `getSession()`.
 */
export const providerModels = pgTable(
  "provider_models",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      /* Cascade, for the same reason provider_keys cascades: a row that
         outlives its owner is a configuration nobody can revoke. */
      .references(() => user.id, { onDelete: "cascade" }),
    /**
     * The `provider_keys.provider` slug this model belongs to. Not a
     * foreign key on purpose — a built-in provider has models in the
     * OpenRouter catalogue rather than in this table, and the two
     * sources are resolved in `lib/providers.ts` rather than joined.
     */
    provider: text("provider").notNull(),
    /** Exactly the string that will be sent as the model id. */
    modelId: text("model_id").notNull(),
    /**
     * 'free' (came from the `:free` pull) or 'custom' (typed by hand).
     * A refresh replaces the first and never touches the second.
     */
    source: text("source").notNull().default("custom"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // One row per model per provider per reader, so re-pulling the free
    // tier is an upsert rather than an accumulating pile of duplicates
    // the picker then has to de-duplicate in the browser.
    uniqueIndex("provider_models_user_provider_model_idx").on(
      table.userId,
      table.provider,
      table.modelId,
    ),
    // The read path: "every model on this provider for this reader".
    index("provider_models_user_provider_idx").on(table.userId, table.provider),
  ],
);

export const providerModelsRelations = defineRelationsPart(
  { providerModels, user },
  (r) => ({
    providerModels: {
      user: r.one.user({
        from: r.providerModels.userId,
        to: r.user.id,
      }),
    },
    user: {
      providerModels: r.many.providerModels({
        from: r.user.id,
        to: r.providerModels.userId,
      }),
    },
  }),
);