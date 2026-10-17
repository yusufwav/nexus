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
 * ICON-ONLY, MATCHING THE USER MENU'S SIGN OUT.
 *
 * It used to carry a "sign out" label beside the icon, dropped below
 * 640px. The label is gone: the header is a row of squares, and a wide
 * text button in a row of square icon buttons is the one control whose
 * width is not the width of its icon. It is also a duplicate of what the
 * icon already says, which is what the labels were for in the first
 * place — the icon-only row reads as one set only if every member is
 * the same shape. The user menu made the same call for the same reason;
 * see the note on UserMenu's ICON-ONLY IS A REAL COST paragraph.
 *
 * `aria-label` carries the accessible name, so this still announces as
 * "Sign out" with the text gone from the screen, and `title` gives it a
 * hover tooltip so it is discoverable with a pointer too. Both arms, for
 * the same reason the menu's items carry both.
 *
 * `nt-btn--icon` is what makes it a square at --nt-ctl-h alongside the
 * other controls. The red edge is in the stylesheet, on .nt-signout.
 */
export default function SignOutButton(): React.JSX.Element {
  const signOut = useSignOut();

  return (
    <button
      type="button"
      className="nt-btn nt-btn--ghost nt-btn--icon nt-signout"
      onClick={signOut}
      aria-label="Sign out"
      title="Sign out"
    >
      <LogOutIcon aria-hidden="true" />
    </button>
  );
}