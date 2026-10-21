/**
 * THE AUTH PROVIDER
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/lib/session.ts
 *
 * THE SESSION, AND WHAT HAPPENS WHEN THE SERVER CANNOT BE ASKED
 * ---------------------------------------------------------------------------
 * There are three answers to "is this reader signed in?", and only one of
 * them is yes:
 *
 *   · the server says yes       — signed in, and the cache is refreshed
 *   · the server says no        — signed out, and the cache is destroyed
 *   · the server cannot be asked — the CACHE decides, because a reader on a
 *     plane must still be able to open the app and read their notes
 *
 * The third case is the one that matters, and it is the reason the app is
 * offline-first rather than offline-only: the notes, the practice bank and
 * the study partner all work with no connection, and only the ACCOUNT needs
 * one.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  fetchRemoteSession,
  signInRemote,
  signOutRemote,
  signUpRemote,
  type AuthError,
  type RemoteSession,
} from "@/lib/auth-client";
import {
  clearCachedSession,
  credentialOf,
  readCachedSession,
  writeCachedSession,
  type CachedSession,
} from "@/storage/auth";

export type AuthStatus = "loading" | "signed-out" | "signed-in";

export type AuthContextValue = {
  readonly status: AuthStatus;
  readonly session: RemoteSession | null;
  /** The last failure, in words a reader can act on. */
  readonly error: string | null;
  /** True when the app could not reach the server and is running on cache. */
  readonly offline: boolean;
  readonly signIn: (email: string, password: string) => Promise<boolean>;
  readonly signUp: (name: string, email: string, password: string) => Promise<boolean>;
  readonly signOut: () => Promise<void>;
  readonly clearError: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<RemoteSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  /**
   * THE BOOT.
   *
   * The cached session goes in FIRST, so the app opens instantly and works
   * offline. The server is asked afterwards, and its answer either refreshes
   * the cache or ends the session.
   */
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const cached = await readCachedSession();
      if (cancelled) return;

      if (cached === null) {
        setStatus("signed-out");
        return;
      }

      setSession(cached);
      setStatus("signed-in");

      const result = await fetchRemoteSession(credentialOf(cached)!);
      if (cancelled) return;

      if (result.ok) {
        setOffline(false);
        if (result.data === null) {
          // The server says this session is no longer good. It was revoked
          // on the website, or it expired. The server wins.
          await clearCachedSession();
          setSession(null);
          setStatus("signed-out");
          return;
        }
        const refreshed: CachedSession = { ...result.data, ...(cached.cookie === undefined ? {} : { cookie: cached.cookie }) };
        await writeCachedSession(refreshed);
        setSession(refreshed);
        return;
      }

      if (result.error.kind === "offline") {
        // The server could not be asked. The cache stands, and the app says
        // so, because a reader who cannot reach the network is not the same
        // as a reader who has been signed out.
        setOffline(true);
        return;
      }

      // The server answered, and the answer was no. The token is dead.
      await clearCachedSession();
      setSession(null);
      setStatus("signed-out");
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * ADOPT A FRESHLY MINTED SESSION.
   *
   * The server hands back the session token in the sign-in response body,
   * and the app holds it. But HOLDING it is not the same as the server
   * honouring it: the token only works if the server can read it back, and
   * the app carries BOTH the token and the signed cookie so that it works
   * whichever one the server understands.
   *
   * So the app asks the server to confirm the session it was just given,
   * once, at the moment the reader can still do something about it. A server
   * that honours neither answers `null` — which is indistinguishable from
   * "signed out" — and saying "you are signed in" there would be a lie the
   * reader only discovers at the next launch.
   */
  const adoptSession = useCallback(async (fresh: CachedSession): Promise<boolean> => {
    const verified = await fetchRemoteSession(credentialOf(fresh)!);
    if (verified.ok && verified.data === null) {
      await clearCachedSession();
      setSession(null);
      setStatus("signed-out");
      setError(
        "Signed in, but the server will not accept the app's session. If this keeps happening, the server's bearer plugin may not be deployed yet.",
      );
      return false;
    }
    await writeCachedSession(fresh);
    setSession(fresh);
    setStatus("signed-in");
    setOffline(false);
    return true;
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      setError(null);
      const result = await signInRemote(email, password);
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      const session: CachedSession = {
        ...result.data,
        ...(result.cookie === undefined ? {} : { cookie: result.cookie }),
      };
      if (!(await adoptSession(session))) {
        return false;
      }
      return true;
    },
    [adoptSession],
  );

  const signUp = useCallback(
    async (name: string, email: string, password: string): Promise<boolean> => {
      setError(null);
      const result = await signUpRemote(name, email, password);
      if (!result.ok) {
        setError(result.error.message);
        return false;
      }
      const session: CachedSession = {
        ...result.data,
        ...(result.cookie === undefined ? {} : { cookie: result.cookie }),
      };
      if (!(await adoptSession(session))) {
        return false;
      }
      return true;
    },
    [adoptSession],
  );

  const signOut = useCallback(async () => {
    const credential = credentialOf(session === null ? null : (session as CachedSession));
    // The local session is cleared FIRST and unconditionally. A reader who
    // taps "sign out" is signed out on this device, and a network failure
    // must not leave them apparently still signed in.
    await clearCachedSession();
    setSession(null);
    setStatus("signed-out");
    setError(null);
    if (credential === null) return;
    try {
      await signOutRemote(credential);
    } catch {
      // Nothing to do: the local session is already gone, and the server
      // expires the session on its own within seven days.
    }
  }, [session]);

  const clearError = useCallback(() => setError(null), []);

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, error, offline, signIn, signUp, signOut, clearError }),
    [status, session, error, offline, signIn, signUp, signOut, clearError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useAuth must be used inside an AuthProvider");
  }
  return ctx;
}

export type { AuthError, RemoteSession };
