"use client";

import { useCallback, useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * EMAIL VERIFICATION NOTICE
 * ------------------------------------------------------------------------
 * Shown on the tutor to a reader whose address is unverified, with a way to
 * ask for another link.
 *
 * WHY IT IS A BANNER AND NOT A LOCKED PAGE
 * ------------------------------------------------------------
 * The gate is on AI messages, so this is the only thing standing between an
 * unverified reader and a dead end. Two failure modes are designed against:
 *
 *   · The reader sends a question and gets an opaque 403. The banner is here
 *     so that never happens — the restriction is stated before they try, not
 *     as an error after.
 *   · The reader never receives the first mail, or deletes it. Hence the
 *     resend, which is the only thing here that is genuinely necessary. A
 *     verification flow without a resend is a flow that can only be recovered
 *     from by creating another account.
 *
 * WHY IT FETCHES ITS OWN SESSION
 * ------------------------------------------------------------
 * `AiTutor` takes only `name`, and threading `emailVerified` down through
 * page.tsx would put an auth concern in a component that has nothing else to
 * do with auth. The client session is already cached by the auth client, so
 * this is not a second round trip in practice — and if it ever were, one cheap
 * request to a notice that renders in a few milliseconds is the right trade.
 *
 * WHY IT RENDERS NOTHING RATHER THAN AN ERROR WHEN THE SESSION IS MISSING
 * ------------------------------------------------------------
 * A signed-out reader sees no banner. `/ai` is behind `requireSession`, so
 * this only matters during the render before the session resolves, and a
 * banner that flashes "confirm your email" at someone who is not signed in
 * is worse than a brief absence.
 */

type ResendState =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "sent" }
  | { readonly kind: "failed"; readonly reason: string };

/** Cooldown, so the button cannot be used to hammer MailTrap's rate limit. */
const RESEND_COOLDOWN_SECONDS = 30;

export default function EmailVerifyNotice(): React.JSX.Element | null {
  const [unverified, setUnverified] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [state, setState] = useState<ResendState>({ kind: "idle" });
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let live = true;
    void authClient.getSession().then(({ data }) => {
      if (!live) return;
      const user = data?.user as { emailVerified?: boolean; email?: string } | undefined;
      // Absent `emailVerified` means verification is not in force on this
      // deploy (see emailVerificationRequired in packages/auth), so there is
      // nothing to say. Treating undefined as "verified" is what stops the
      // banner appearing on a deploy with no mail configured.
      if (user && user.emailVerified !== true) {
        setUnverified(true);
        setAddress(user.email ?? null);
      }
    });
    return () => {
      live = false;
    };
  }, []);

  // Countdown, so the button visibly disables itself rather than the click
  // simply being ignored.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((n) => n - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const resend = useCallback(async () => {
    /*
     * The endpoint takes the address as a required argument rather than
     * reading it from the session, so there has to be one to pass. It comes
     * from the session we already hold, never from user input: this is a
     * "send to YOU" action, and letting a caller name the recipient would
     * turn the resend button into an open relay that sends Nexus account mail
     * to any address typed into it.
     */
    if (!address) {
      setState({ kind: "failed", reason: "We do not have an address on this session to send to." });
      return;
    }

    setState({ kind: "sending" });
    const { error } = await authClient.sendVerificationEmail({ email: address });
    if (error) {
      /*
       * The server's message is used rather than a generic one. The two
       * failures a reader can actually cause are "too many requests" and
       * "no such account", and telling them "try again" for the second is
       * actively misleading — they already have an account, they are signed
       * in to it.
       */
      setState({
        kind: "failed",
        reason: error.message ?? "That did not go through. Try again in a moment.",
      });
      return;
    }
    setState({ kind: "sent" });
    setCooldown(RESEND_COOLDOWN_SECONDS);
  }, [address]);

  if (!unverified) {
    return null;
  }

  return (
    <aside className="nt-verify" role="status">
      <div className="nt-verify-text">
        <b>Confirm your email to use the tutor</b>
        {address && (
          <span>
            We sent a link to <code>{address}</code>. Everything else on Nexus works without it — the
            tutor is the only thing that needs it.
          </span>
        )}
        {!address && <span>The tutor is unavailable until your address is confirmed.</span>}
      </div>

      <div className="nt-verify-actions">
        {state.kind === "sent" ? (
          <span className="nt-verify-done">Sent. Check your inbox.</span>
        ) : (
          <button
            type="button"
            className="nt-btn nt-btn--ghost"
            onClick={() => void resend()}
            disabled={state.kind === "sending" || cooldown > 0}
          >
            {state.kind === "sending" ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
          </button>
        )}
      </div>

      {state.kind === "failed" && <p className="nt-verify-error">{state.reason}</p>}
    </aside>
  );
}
