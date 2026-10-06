"use client";

import useSignOut from "@/lib/use-sign-out";

/**
 * SIGN OUT, as a button.
 *
 * Kept for the dashboard's identity strip, which wants a plain ghost
 * button. The behaviour lives in useSignOut so the user menu can offer
 * the same thing as a dropdown item without nesting one button inside
 * another — see that hook for why the two cannot share a component.
 */
export default function SignOutButton(): React.JSX.Element {
  const signOut = useSignOut();

  return (
    <button type="button" className="nt-btn nt-btn--ghost" onClick={signOut}>
      sign out
    </button>
  );
}