/**
 * THE REMOTE AUTH CLIENT
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/lib/auth-client.ts and
 * apps/web/src/lib/auth-error-text.ts
 *
 * THE APP DOES NOT TALK TO NEON, AND NEVER WILL
 * ---------------------------------------------------------------------------
 * Neon is reached by the SERVER, and the server holds `DATABASE_URL`. This
 * app talks to the server's `/api/auth/*` endpoints and nothing else. That
 * is not a limitation — it is the whole design:
 *
 *   · the connection string is a password, and a React Native bundle ships
 *     inside the .ipa/.apk where anyone can read it;
 *   · the rate limiting, the email verification, the password hashing and
 *     the session lifetime are all server-side already, and duplicating them
 *     on a phone would be a second implementation of a security control;
 *   · the app works offline for everything except signing in, which is the
 *     one thing that genuinely cannot be done without a server.
 *
 * THE TWO WAYS A SESSION CAN BE CARRIED
 * ---------------------------------------------------------------------------
 * A browser carries a session in a cookie the browser manages. React
 * Native's `fetch` has no cookie jar, so the app holds the credential
 * itself and sends it in the request. There are two forms, and the app
 * carries BOTH:
 *
 *   · the BEARER TOKEN — the raw session token from the sign-in response
 *     body, sent as `Authorization: Bearer <token>`. The server's `bearer`
 *     plugin turns it back into a session cookie before the session
 *     lookup, so everything downstream is the same code path the website
 *     uses.
 *
 *   · the SESSION COOKIE — the signed cookie the server sets alongside it,
 *     sent back in a `Cookie` header. This is the form a browser uses, and
 *     it works against a server that has NOT got the bearer plugin.
 *
 * Carrying both means the app signs in against the server as it is TODAY,
 * and keeps working when the plugin is deployed — whichever one the server
 * understands, it uses.
 *
 * THE ORIGIN HEADER, AND WHY IT HAS TO BE SENT
 * ---------------------------------------------------------------------------
 * React Native's `fetch` sends `Origin: null` — it mirrors a browser's
 * cross-origin request shape, and a native client has no origin to offer.
 * Better Auth's CSRF check reads that as a MISSING origin and refuses the
 * request with MISSING_OR_NULL_ORIGIN.
 *
 * So the app names the server it is talking to. The server's own origin is
 * already in its `trustedOrigins` — it is `BETTER_AUTH_URL` — so the check
 * passes, and the check is still doing its job: a third-party origin is
 * still refused.
 *
 * And this is not a way around the check. The check exists so that a page
 * on another site cannot make the reader's browser send an authenticated
 * request. A native app has no ambient cookies and no ambient session: it
 * sends only what this code tells it to send, and the token is in the
 * device keychain. A hostile website cannot make the app send anything at
 * all, so the header is an assertion about who the client is, and the
 * server checks that assertion against its allowlist.
 *
 * THE WIRE
 * ---------------------------------------------------------------------------
 * Read off the deployed server, not guessed:
 *
 *   POST /api/auth/sign-in/email   { email, password }
 *     -> 200 { redirect, token, url, user }  + Set-Cookie: <session cookie>
 *     -> 4xx { message, code }              e.g. INVALID_EMAIL_OR_PASSWORD
 *
 *   POST /api/auth/sign-up/email   { name, email, password }
 *     -> 200 { token, user }                 + Set-Cookie: <session cookie>
 *     -> 4xx { message, code }              e.g. PASSWORD_TOO_SHORT
 *
 *   GET  /api/auth/get-session
 *     -> 200 { session, user }
 *     -> 200 null                           (not signed in)
 *
 *   POST /api/auth/sign-out
 *     -> 200 { success: true }
 *
 * The 4xx bodies are FLAT — `{ message, code }` at the top level, not
 * nested under `error`. The server authors those messages for the reader
 * ("Invalid email or password", "Password too short"), so they are shown
 * as they are.
 */

/**
 * Where the server is.
 *
 * The mobile app's build target is the deployed web app, because that is
 * what holds the database credentials and the auth configuration. Change
 * this and the app stops authenticating.
 */
export const AUTH_BASE_URL = "https://nexus-tutoring.vercel.app";

const API_BASE = `${AUTH_BASE_URL}/api/auth`;

/**
 * The server's minimum password length.
 *
 * `packages/auth` sets `minPasswordLength: 12`. The web form's own zod
 * validator says 8, which is the form being more permissive than the server
 * — and the server is what decides whether the account exists. So the app
 * uses the server's number, and says so, rather than letting somebody type
 * a nine-character password and be told it was too short.
 */
export const MIN_PASSWORD_LENGTH = 12;

/** The server's rate limits, mirrored so the app can explain a 429. */
export const RATE_LIMIT_NOTE =
  "Too many attempts. The server allows five sign-ins a minute and five sign-ups an hour.";

/**
 * THE SESSION CREDENTIAL.
 *
 * The raw token is always present. The cookie is present when the server
 * sent one, which it does on every sign-in — and which is what makes the
 * app work against a server that has not got the bearer plugin.
 */
export type SessionCredential = {
  /** The raw session token from the response body. */
  readonly token: string;
  /** The signed session cookie, when the server sent one. */
  readonly cookie?: { readonly name: string; readonly value: string };
};

export type RemoteUser = {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly image?: string | null;
  /** The reader's palette on the server. `null` means "never chose". */
  readonly theme?: string | null;
};

export type RemoteSession = {
  readonly token: string;
  readonly user: RemoteUser;
  /** ISO. The server expires sessions after seven days. */
  readonly expiresAt: string;
};

export type AuthErrorKind =
  /** The request never reached the server. */
  | "offline"
  /** The server answered, and the answer was no. */
  | "rejected"
  /** The server broke. */
  | "server";

export type AuthError = {
  readonly kind: AuthErrorKind;
  readonly message: string;
  readonly code?: string;
};

export type AuthOutcome<T> =
  | {
      readonly ok: true;
      readonly data: T;
      /** The session cookie the server set, when it set one. */
      readonly cookie?: { readonly name: string; readonly value: string };
    }
  | { readonly ok: false; readonly error: AuthError };

/* ------------------------------------------------------------------ *
 *  the session cookie
 * ------------------------------------------------------------------ */

/**
 * The session cookie's name and value, out of a `Set-Cookie` header.
 *
 * The header is matched with a pattern rather than split, because
 * `Set-Cookie` is the one header a client may hand back joined with commas
 * and a naive split breaks on `Expires=Wed, 21 Oct 2026 …`. The name comes
 * first in every cookie, and the value never contains a comma or a
 * semicolon, so matching the name and taking the run up to the first
 * delimiter is safe whichever way the platform joined them.
 */
const SESSION_COOKIE = /((?:__Secure-)?better-auth\.session_token)=([^;,\s]+)/;

export function readSessionCookie(
  header: string | null,
): { name: string; value: string } | null {
  if (header === null) {
    return null;
  }
  const match = SESSION_COOKIE.exec(header);
  if (match === null) {
    return null;
  }
  return { name: match[1]!, value: match[2]! };
}

/* ------------------------------------------------------------------ *
 *  the request
 * ------------------------------------------------------------------ */

type CallOptions = {
  readonly method?: "GET" | "POST";
  readonly body?: unknown;
  /** The session to carry, if there is one. */
  readonly credential?: SessionCredential | null;
};

async function call<T>(path: string, options: CallOptions = {}): Promise<AuthOutcome<T>> {
  const headers: Record<string, string> = {
    accept: "application/json",
    /*
     * THE ORIGIN HEADER.
     *
     * React Native's `fetch` sends `Origin: null`, and Better Auth's CSRF
     * check reads that as a missing origin and refuses the request. Naming
     * the server we are talking to satisfies the check, and the check is
     * still doing its job: a third-party origin is still refused.
     */
    origin: AUTH_BASE_URL,
  };
  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }
  const credential = options.credential;
  if (credential !== undefined && credential !== null) {
    headers["authorization"] = `Bearer ${credential.token}`;
    if (credential.cookie !== undefined) {
      headers["cookie"] = `${credential.cookie.name}=${credential.cookie.value}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? (options.body === undefined ? "GET" : "POST"),
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    /*
     * THE REQUEST NEVER LEFT THE DEVICE.
     *
     * A fetch that throws is a transport failure: no DNS, no route, no
     * server, airplane mode. It is NOT a rejected sign-in, and telling the
     * reader their password was wrong would be a lie. The app's own rule is
     * that the notes work offline, so this message says that the CONNECTION
     * is what is missing.
     */
    return {
      ok: false,
      error: {
        kind: "offline",
        message:
          "You are offline. Signing in needs a connection — everything else in the app works without one.",
      },
    };
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (response.ok) {
    const cookie = readSessionCookie(response.headers.get("set-cookie"));
    return {
      ok: true,
      data: payload as T,
      ...(cookie === null ? {} : { cookie }),
    };
  }

  /*
   * A 4xx is the server answering the question, and its message was written
   * for the reader. A 5xx is a fault, and its body can carry internal
   * detail — a driver error naming the database host and the port. So a 5xx
   * message is never shown.
   */
  const body = (payload ?? {}) as { message?: unknown; code?: unknown };
  const message = typeof body.message === "string" ? body.message : null;
  const code = typeof body.code === "string" ? body.code : null;

  if (response.status >= 500) {
    return {
      ok: false,
      error: {
        kind: "server",
        message: "The server could not complete that request. Try again in a moment.",
      },
    };
  }

  return {
    ok: false,
    error: {
      kind: "rejected",
      message: message ?? fallbackMessage(response.status, code),
      ...(code === null ? {} : { code }),
    },
  };
}

function fallbackMessage(status: number, code: string | null): string {
  if (code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" || status === 409) {
    return "An account with that email already exists. Try signing in instead.";
  }
  if (code === "MISSING_OR_NULL_ORIGIN" || status === 403) {
    return "The server refused that request. If it keeps happening, the server's allowed origins may need updating.";
  }
  if (status === 429) return RATE_LIMIT_NOTE;
  if (status === 401) return "Invalid email or password.";
  if (status === 400) return "That request was not valid. Check the email and password and try again.";
  return "Something went wrong. Try again.";
}

/* ------------------------------------------------------------------ *
 *  the endpoints
 * ------------------------------------------------------------------ */

type SignInPayload = {
  readonly token?: string;
  readonly user?: RemoteUser;
  readonly redirect?: boolean;
  readonly url?: string | null;
};

type SignUpPayload = {
  readonly token?: string;
  readonly user?: RemoteUser;
};

type GetSessionPayload = {
  readonly session?: { id: string; token: string; expiresAt: string };
  readonly user?: RemoteUser;
} | null;

function toSession(
  payload: SignInPayload | SignUpPayload,
  cookie?: { readonly name: string; readonly value: string },
): AuthOutcome<RemoteSession> {
  if (typeof payload.token !== "string" || payload.user === undefined) {
    return {
      ok: false,
      error: { kind: "server", message: "The server did not return a session. Try again." },
    };
  }
  return {
    ok: true,
    data: {
      token: payload.token,
      user: payload.user,
      // The server's own expiry is seven days; the client does not need to
      // be more precise than that, because the server is the authority and
      // will reject an expired session on the next call.
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
    ...(cookie === undefined ? {} : { cookie }),
  };
}

/** Sign in with an email address and a password. */
export async function signInRemote(
  email: string,
  password: string,
): Promise<AuthOutcome<RemoteSession>> {
  const result = await call<SignInPayload>("/sign-in/email", {
    method: "POST",
    body: { email: email.trim().toLowerCase(), password },
  });
  if (!result.ok) return result;
  return toSession(result.data, result.cookie);
}

/** Create an account. */
export async function signUpRemote(
  name: string,
  email: string,
  password: string,
): Promise<AuthOutcome<RemoteSession>> {
  const result = await call<SignUpPayload>("/sign-up/email", {
    method: "POST",
    body: { name: name.trim(), email: email.trim().toLowerCase(), password },
  });
  if (!result.ok) return result;
  return toSession(result.data, result.cookie);
}

/**
 * The current session, or null when there is not one.
 *
 * A rejected answer here means the token is no longer good — the reader
 * signed out on the website, or the server expired the session — and the
 * app must sign them out too. An OFFLINE answer is different: the token may
 * be perfectly good, the phone just cannot ask.
 */
export async function fetchRemoteSession(
  credential: SessionCredential,
): Promise<AuthOutcome<RemoteSession | null>> {
  const result = await call<GetSessionPayload>("/get-session", { credential });
  if (!result.ok) return result;
  const payload = result.data;
  if (payload === null || payload === undefined) {
    return { ok: true, data: null };
  }
  if (payload.user === undefined) {
    return { ok: true, data: null };
  }
  return {
    ok: true,
    data: {
      token: credential.token,
      user: payload.user,
      expiresAt:
        payload.session?.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    },
  };
}

/**
 * Sign out.
 *
 * The caller clears its local session REGARDLESS of what this returns: a
 * reader who taps "sign out" is signed out on this device, and a network
 * failure must not leave them apparently still signed in.
 */
export async function signOutRemote(
  credential: SessionCredential,
): Promise<AuthOutcome<{ success: boolean }>> {
  return call<{ success: boolean }>("/sign-out", {
    method: "POST",
    body: {},
    credential,
  });
}

/** Ask the server to send a fresh verification email. */
export async function resendVerificationRemote(email: string): Promise<AuthOutcome<{ status: boolean }>> {
  return call<{ status: boolean }>("/send-verification-email", {
    method: "POST",
    body: { email: email.trim().toLowerCase() },
  });
}
