import { toNextJsHandler } from "better-auth/next-js";
import { NextResponse, type NextRequest } from "next/server";

import { auth } from "../../../../services";

/*
 * EVERY AUTH ROUTE WAS FAILING SILENTLY
 * ------------------------------------------------------------
 * Every /api/auth/* request on the deployed site returned 500 with a
 * completely empty body. Sign-in and sign-up both showed
 * "Something went wrong signing you in" and nothing else — not an
 * error code, not a message, not a stack. That is the worst possible
 * shape for a failure: it says only that the request did not work,
 * which is something the reader already knew, and it tells whoever is
 * debugging nothing at all.
 *
 * WHY THE BODY WAS EMPTY
 *
 * toNextJsHandler forwards Better Auth's own errors, which are all
 * APIErrors carrying a status and a JSON body. That covers every
 * failure Better Auth anticipates. It does not cover a failure it does
 * not anticipate — a driver error, a malformed config, a bug in a
 * hook — and those escape as ordinary exceptions. An ordinary
 * exception crossing a route handler boundary is not serialised into
 * a response by Next; the request ends with no body. So the exact
 * failures most worth diagnosing were the ones that arrived mute.
 *
 * WHAT THIS DOES
 *
 * Catches what escapes, always answers in JSON, and never leaks the
 * detail to the reader. The full error goes to the server log, which
 * is where a stack trace belongs; the client gets a sentence it can
 * act on. Two separate concerns, deliberately not mixed: this file
 * decides what the reader sees, the log decides what the operator
 * knows.
 *
 * Note the same split as authErrorText on the client, and for the same
 * reason. A 4xx from Better Auth is authored for the reader and is
 * passed through untouched. A 5xx is ours, and ours is a sentence we
 * chose.
 */

type Handler = (req: NextRequest) => Promise<Response>;

function safeReaderMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);

  // Genuinely useful to state plainly, and safe: it says nothing about
  // the internals, and it is the difference between "try again" and
  // "this will never work until someone deploys a fix".
  if (/rate.?limit/i.test(message)) {
    return "Sign-in is temporarily unavailable. Please try again in a minute.";
  }
  if (/secret/i.test(message)) {
    return "Sign-in is unavailable because the server is not configured correctly.";
  }

  return "Sign-in failed on our end, not yours. Please try again in a moment.";
}

function withErrorReporting(name: string, handler: Handler): Handler {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (error) {
      /*
       * The stack trace goes to the log and only the log. The reader
       * gets a sentence; a driver message like "password authentication
       * failed for user nexus_app" says nothing useful to them and
       * hands an attacker the database role name.
       */
      console.error(`[auth:${name}] ${req.method} ${req.nextUrl.pathname} failed`, error);
      return NextResponse.json(
        { error: safeReaderMessage(error), code: "AUTH_UNAVAILABLE" },
        { status: 500 },
      );
    }
  };
}

const handlers = toNextJsHandler(auth);

export const GET = withErrorReporting("GET", handlers.GET as Handler);
export const POST = withErrorReporting("POST", handlers.POST as Handler);