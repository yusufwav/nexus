/**
 * THE CACHED SESSION
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/lib/session.ts
 *
 * THE WEB APP'S SESSION WAS A COOKIE
 * ---------------------------------------------------------------------------
 * On the web, the session was a signed, `httpOnly` cookie: the browser
 * managed it, and the server decided whether it was still valid.
 *
 * On the phone, the app holds the session itself — in the device's
 * encrypted keychain, never in AsyncStorage — and the server remains the
 * authority on whether it is still good.
 *
 * WHY THE SESSION IS CACHED AT ALL
 * ---------------------------------------------------------------------------
 * Because the app has to open with no network. A reader on a plane, in a
 * lift, or on a train must be able to open the app and read the notes they
 * already have. So the session is cached, and the app falls back to the
 * cache when the server cannot be reached.
 *
 * WHAT THE CACHE IS NOT
 * ---------------------------------------------------------------------------
 * It is not a licence. The server still decides. A cached session only
 * survives until the server says otherwise, and the app asks the server on
 * every launch — it just does not LOCK the reader out when the question
 * cannot be answered.
 */
import { deleteSecret, readSecret, writeSecret } from "@/storage/secure";
import type { RemoteSession, SessionCredential } from "@/lib/auth-client";

const KEY = "nexus.session";

/**
 * What is cached.
 *
 * The cookie is kept alongside the token because the app carries BOTH — see
 * `lib/auth-client.ts` for why. A server that has the bearer plugin uses
 * the token; one that has not uses the cookie.
 */
export type CachedSession = RemoteSession & {
  readonly cookie?: { readonly name: string; readonly value: string };
};

/** The credential to send with a request, or null when there is none. */
export function credentialOf(session: CachedSession | null): SessionCredential | null {
  if (session === null) {
    return null;
  }
  return {
    token: session.token,
    ...(session.cookie === undefined ? {} : { cookie: session.cookie }),
  };
}

/**
 * Read the cached session.
 *
 * A malformed cache is treated as no cache at all: a half-written record
 * must not be able to lock the reader out of their own app.
 */
export async function readCachedSession(): Promise<CachedSession | null> {
  const raw = await readSecret(KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const session = parsed as Partial<CachedSession>;
    if (typeof session.token !== "string" || session.token.length === 0) return null;
    if (typeof session.user !== "object" || session.user === null) return null;
    const user = session.user as Partial<RemoteSession["user"]>;
    if (typeof user.id !== "string" || typeof user.email !== "string") return null;

    const cookie =
      typeof session.cookie === "object" &&
      session.cookie !== null &&
      typeof (session.cookie as { name?: unknown }).name === "string" &&
      typeof (session.cookie as { value?: unknown }).value === "string"
        ? {
            name: (session.cookie as { name: string }).name,
            value: (session.cookie as { value: string }).value,
          }
        : undefined;

    return {
      token: session.token,
      user: {
        id: user.id,
        name: typeof user.name === "string" ? user.name : user.email,
        email: user.email,
        emailVerified: user.emailVerified === true,
        image: user.image ?? null,
        theme: user.theme ?? null,
      },
      expiresAt: typeof session.expiresAt === "string" ? session.expiresAt : "",
      ...(cookie === undefined ? {} : { cookie }),
    };
  } catch {
    return null;
  }
}

/** Cache a session. */
export async function writeCachedSession(session: CachedSession): Promise<void> {
  await writeSecret(KEY, JSON.stringify(session));
}

/** Forget the session on this device. */
export async function clearCachedSession(): Promise<void> {
  await deleteSecret(KEY);
}
