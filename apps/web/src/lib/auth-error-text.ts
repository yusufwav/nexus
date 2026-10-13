/**
 * AN AUTH FAILURE, IN WORDS A READER CAN ACT ON
 * ------------------------------------------------------------
 * The sign-in and sign-up forms showed an empty red box on every failed
 * attempt. Not an intermittent thing and not a styling problem: the
 * handler read the message from a place Better Auth does not put it.
 *
 *   onError: (error) => toast.error(error.error.message || error.error.statusText)
 *
 * The wire actually carries:
 *
 *   { "message": "Invalid email or password", "code": "INVALID_EMAIL_OR_PASSWORD" }
 *
 * — flat, at the top level. `error.error` is the Response-shaped part of
 * BetterAuthError (`{ status, statusText }`) and on a 401 both of those
 * are empty or generic, so the expression evaluated to `undefined` and the
 * toast rendered nothing.
 *
 * WHY THIS IS A SEPARATE MODULE
 *
 * It is used by two forms and the answer is the same for both, and the
 * reasoning below is worth writing down once rather than twice. It also
 * has no imports at all, which is what makes it testable — see
 * test-auth-error-text.mjs. The bug was invisible for as long as the code
 * lived inside a component where nothing could exercise it.
 */

/** The shapes Better Auth can hand the onError callback, in the wild. */
type MaybeNested = {
  message?: string | undefined;
  status?: number | undefined;
  statusText?: string | undefined;
  body?: unknown;
  data?: unknown;
};

function readString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  return null;
}

/** Dig a `message` out of whatever nesting it arrived in. */
function messageFrom(value: unknown, depth = 0): string | null {
  if (depth > 4 || value === null || typeof value !== "object") return null;
  const obj = value as MaybeNested & Record<string, unknown>;

  const direct = readString(obj.message);
  if (direct) return direct;

  // Better Auth puts the API's JSON body here on some paths, so the real
  // message is often one level down inside `body` rather than on the error.
  for (const key of ["body", "data", "error"] as const) {
    const nested = messageFrom(obj[key], depth + 1);
    if (nested) return nested;
  }
  return null;
}

/**
 * Turn any thrown auth error into one sentence.
 *
 * Ordered by how much the reader can act on it:
 *
 *   1. whatever message came back, at any depth — the API knows the real
 *      reason ("Invalid email or password", "User already exists") and it
 *      is more specific than anything invented here
 *   2. a status-specific fallback, so a bare `{ status: 429 }` still tells
 *      the reader to wait rather than showing an empty box
 *   3. a last resort, because an empty toast is never better than a dull one
 *
 * Deliberately does NOT surface raw error text for server faults. A 500 from
 * the auth layer can carry internal detail, and this string goes in the DOM.
 */
export function authErrorText(error: unknown): string {
  if (typeof error === "string") return authErrorText({ message: error });

  const status =
    typeof error === "object" && error !== null && "status" in error
      ? (error as { status?: unknown }).status
      : undefined;

  /*
   * A 5xx message is NOT shown, even when there is one.
   *
   * This is the part the first version of this file got wrong, and its own
   * test caught it: a driver failure reaches the client carrying
   * "connect ECONNREFUSED 10.0.0.5:5432 password authentication failed",
   * and pasting that into the DOM hands an attacker the hostname, the port
   * and the fact that the database is reachable another way. A 4xx from the
   * auth API is authored for the reader; a 5xx is a stack trace with a
   * sentence stapled on.
   */
  const isServerFault = typeof status === "number" && status >= 500;
  if (!isServerFault) {
    const fromApi = messageFrom(error);
    if (fromApi) return fromApi;
  }

  switch (status) {
    case 400:
      return "That request was not valid. Check the email and password and try again.";
    case 401:
      return "Invalid email or password.";
    case 403:
      return "This request was refused. If you keep seeing this, the site may be misconfigured.";
    case 409:
      return "An account with that email already exists. Try signing in instead.";
    case 429:
      return "Too many attempts. Wait a minute and try again.";
    case 500:
    case 502:
    case 503:
      return "The server could not complete that request. Try again in a moment.";
    default:
      return "Something went wrong signing you in. Try again, and if it persists the server may be misconfigured.";
  }
}