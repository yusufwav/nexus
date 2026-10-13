import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import type { auth } from "@/services";

/**
 * WHY inferAdditionalFields IS HERE
 * ------------------------------------------------------------------------
 * createAuthClient({}) is called with no options, so it has nothing to
 * infer the shape of the user from and falls back to Better Auth's
 * defaults: name and image. Adding `theme` as an additional field on the
 * server therefore made it work at runtime and fail to compile - both
 * `updateUser({ theme })` and `session.user.theme` were rejected by
 * TypeScript as unknown properties, which is the correct thing for the
 * compiler to do and a useless thing for a developer to hit.
 *
 * inferAdditionalFields takes the server's own inferred type and teaches
 * the client about it. The benefit is not just the theme: a future field
 * added to user.additionalFields in packages/auth is typed on the client
 * immediately, with no second declaration to keep in step.
 *
 * The `import type` is the load-bearing part. `auth` is the server
 * instance, which constructs the Better Auth config, the database pool
 * and the sealed-key helpers. Importing it for its type only means the
 * bundler still erases it - a value import would pull the entire server
 * graph, credentials and all, into the browser bundle.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});