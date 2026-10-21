/**
 * REGISTERS THE `@/` RESOLVER
 * ---------------------------------------------------------------------------
 *   node --import ./scripts/register-ts.mjs scripts/test-latex.mjs
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./ts-resolver.mjs", pathToFileURL(import.meta.filename));
