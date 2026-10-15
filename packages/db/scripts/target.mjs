import { readFileSync } from "node:fs";

/**
 * WHICH DATABASE IS THIS, AND MAY WE TOUCH IT
 * ------------------------------------------------------------------------
 * Every script that writes needs to answer two questions before it runs:
 * what is the connection string, and is it production? Both have bitten.
 *
 *   1. THE CONNECTION STRING. The root .env.local stores values QUOTED --
 *      DATABASE_URL="postgresql://..." -- and handing that to pg does not
 *      throw. It fails to parse, and libpq quietly falls back to its
 *      built-in default of localhost:5432. The result is ECONNREFUSED on
 *      127.0.0.1, which reads as "the database is down" rather than "you
 *      passed a malformed argument", and the real target is never named.
 *      apps/web/.env is unquoted, so this only ever bit on the production
 *      path -- which is the worst place for it to be subtle.
 *
 *   2. PRODUCTION vs LOCAL. A script whose default is "the production
 *      database" is one careless invocation away from being a production
 *      incident. Nothing here defaults to production: without an explicit
 *      flag and an explicit URL, a writing script gets the LOCAL database,
 *      and `--prod` is required before anything reaches Neon.
 *
 * The rule this file exists to enforce, stated once so the scripts can
 * stay short:
 *
 *      LOCAL      -> apps/web/.env, no flag needed.
 *      PRODUCTION -> only with --prod AND an explicit DATABASE_URL in the
 *                    environment, which is never read from a file.
 */

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]", "0.0.0.0"]);

/** Strip the surrounding quotes some env files use. */
export function unquote(value) {
  const v = value.trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    return v.slice(1, -1);
  }
  return v;
}

/** The host portion of a postgres URL, or "" if it cannot be read. */
export function hostOf(url) {
  try {
    // Strip any scheme-relative form first so URL() does not complain about
    // the absence of a password-less authority.
    const withScheme = url.replace(/^postgres(ql)?:\/\//, "https://");
    return new URL(withScheme).hostname;
  } catch {
    return "";
  }
}

export function isLocal(url) {
  return LOCAL_HOSTS.has(hostOf(url));
}

/**
 * Resolve the target, or exit with an explanation.
 *
 * `--prod` is required before a remote host is accepted, and the resolved
 * host is printed either way so nobody can be unsure which database a
 * command just touched.
 */
export function resolveTarget({ script, write = false }) {
  const prod = process.argv.includes("--prod");

  // PRODUCTION is only ever taken from the environment, never from a file.
  // A file-backed default is how a local convenience becomes a production
  // write with no intent expressed anywhere.
  const fromEnv = process.env.DATABASE_URL ? unquote(process.env.DATABASE_URL) : undefined;

  let url;
  let source;

  if (fromEnv) {
    url = fromEnv;
    source = "process.env.DATABASE_URL";
  } else {
    if (prod) {
      console.error(
        "--prod needs DATABASE_URL set in the environment.\n" +
          "  The production URL is in the root .env.local, quoted, and is\n" +
          "  deliberately NOT read from a file here: a writing script should\n" +
          "  never acquire a production target by default.",
      );
      process.exit(1);
    }
    const local = readFileSync(
      new URL("../../../apps/web/.env", import.meta.url),
      "utf8",
    ).match(/^DATABASE_URL=(.*)$/m)?.[1];
    url = unquote(local ?? "");
    source = "apps/web/.env (local)";
  }

  if (!url) {
    console.error(`${script}: could not determine a DATABASE_URL`);
    process.exit(1);
  }

  const local = isLocal(url);
  const host = hostOf(url);

  if (!local && !prod) {
    console.error(
      `${script}: refusing to touch a REMOTE database without --prod.\n` +
        `  target: ${host}\n\n` +
        "  If this really is production, re-run with --prod and DATABASE_URL set.\n" +
        "  If it is not, unset DATABASE_URL to fall back to the local database.",
    );
    process.exit(1);
  }

  console.log(
    `  ${script}: ${local ? "LOCAL" : "PRODUCTION"} database at ${host} (from ${source})`,
  );
  if (write && !local) {
    console.log("  WRITING. Take the dry run first.");
  }

  return { url, local, host, prod };
}