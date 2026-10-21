/**
 * A RESOLVER FOR THE `@/` ALIAS, FOR NODE
 * ---------------------------------------------------------------------------
 * Node 24 runs TypeScript natively — type stripping is on by default — so
 * the app's own source can be imported and tested without a build step.
 *
 * The one thing Node does not know about is the app's path alias: `@/lib/latex`
 * means `src/lib/latex`. This hook teaches it, by rewriting the specifier
 * and trying the extensions TypeScript allows.
 *
 *   node --import ./scripts/register-ts.mjs scripts/test-latex.mjs
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

const EXTENSIONS = [".ts", ".tsx", ".mts", ".js", ".mjs"];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = join(root, "src", specifier.slice(2));
    for (const extension of EXTENSIONS) {
      if (existsSync(base + extension)) {
        return nextResolve(pathToFileURL(base + extension).href, context);
      }
    }
    for (const extension of EXTENSIONS) {
      const index = join(base, `index${extension}`);
      if (existsSync(index)) {
        return nextResolve(pathToFileURL(index).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
