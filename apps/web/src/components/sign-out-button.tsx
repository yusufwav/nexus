"use client";

import { LogOutIcon } from "lucide-react";
import useSignOut from "@/lib/use-sign-out";

/**
 * SIGN OUT, as a button.
 *
 * Kept for the dashboard's identity strip, which wants a plain ghost
 * button. The behaviour lives in useSignOut so the user menu can offer
 * the same thing as a dropdown item without nesting one button inside
 * another — see that hook for why the two cannot share a component.
 *
 * Carries an icon and a label, and the stylesheet keeps one and drops
 * the other by width. It used to be label-only and hidden outright below
 * 640px, which meant a signed-in reader on a phone had NO way to sign
 * out of the dashboard at all: no menu there, and the one button was
 * display:none. `aria-label` keeps the name on both presentations, so
 * the icon-only version still announces as "Sign out".
 */
export default function SignOutButton(): React.JSX.Element {
  const signOut = useSignOut();

  return (
    <button
      type="button"
      className="nt-btn nt-btn--ghost nt-signout"
      onClick={signOut}
      aria-label="Sign out"
    >
      <LogOutIcon className="nt-signout__icon" aria-hidden="true" />
      <span className="nt-signout__label">sign out</span>
    </button>
  );
}