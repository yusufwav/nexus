"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@Main/ui/components/dropdown-menu";
import Link from "next/link";
import { useMemo } from "react";

import { authClient } from "@/lib/auth-client";
import useSignOut from "@/lib/use-sign-out";

import Avatar from "./avatar";

/**
 * A virtual anchor pinned to the top edge of the viewport.
 *
 * Base UI positions a menu against an anchor *rect*, not against the
 * trigger specifically, and it accepts a plain object shaped like one.
 * Handing it a zero-height rect at y=0 spanning the full width turns
 * this dropdown into a panel that descends from the top edge, without
 * giving up the primitive's focus trapping, escape handling,
 * click-outside dismissal and typeahead — none of which a hand-rolled
 * fixed-position div would return for free.
 *
 * The rect is produced by a function rather than stored in state: base
 * ui calls the anchor getter every time it measures, so opening the
 * menu after the window was resized still lands against the real
 * viewport instead of one frozen at first render.
 *
 * width is the full viewport so the panel centres against it. Left at
 * 0 it would centre on x=0 and hang off the left edge instead.
 */
function topEdgeAnchor() {
  return {
    getBoundingClientRect: () =>
      new DOMRect(0, 0, globalThis.innerWidth ?? 0, 0),
  };
}

/**
 * USER MENU
 * ------------------------------------------------------------
 * The trigger shows the user's name and their initials avatar.
 * Clicking it opens a dropdown whose first item is the dashboard —
 * the identity block is the way into the app, so navigating from it
 * should not require hunting through a menu for the obvious choice.
 *
 * It signs the user out as well, because on the landing page it is the
 * only header there is: without this, being signed in on `/` meant
 * there was nowhere to sign out from.
 */
export default function UserMenu(): React.JSX.Element {
  const { data: session, isPending } = authClient.useSession();

  // Above the early returns below: a hook after a conditional return is
  // a rules-of-hooks violation, and the count of hooks has to stay
  // stable across the pending / signed-out / signed-in renders.
  const anchor = useMemo(topEdgeAnchor, []);
  const signOut = useSignOut();

  if (isPending) {
    return <span className="nt-menu__btn">···</span>;
  }

  if (!session) {
    return (
      <Link className="nt-btn nt-btn--ghost" href="/login">
        sign in
      </Link>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="nt-menu__btn">
        <Avatar name={session.user.name} image={session.user.image} size="sm" />
        <span className="nt-menu__name">{session.user.name}</span>
        <span className="nt-menu__caret" aria-hidden="true">
          ▼
        </span>
      </DropdownMenuTrigger>

      {/* Descends from the top of the viewport rather than from the
          trigger. `shift` on both axes rather than the default `flip` is
          the point: with flipping, a short window would send the panel
          upward, which is the opposite of what was asked for. Width comes
          from .nt-menu__panel, which is viewport-relative so it grows with
          the screen rather than sitting at one fixed size. */}
      <DropdownMenuContent
        align="center"
        anchor={anchor}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        positionMethod="fixed"
        side="bottom"
        sideOffset={0}
        className="nt-root nt-menu__panel"
      >
        <div className="nt-menu__head">
          <Avatar name={session.user.name} image={session.user.image} />
          <span style={{ minWidth: 0 }}>
            <span
              style={{
                display: "block",
                fontSize: "var(--fs-sm)",
                color: "var(--fg)",
              }}
            >
              {session.user.name}
            </span>
            <span
              style={{
                display: "block",
                fontSize: "var(--fs-xs)",
                color: "var(--fg-dim)",
                wordBreak: "break-all",
              }}
            >
              {session.user.email}
            </span>
          </span>
        </div>

        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuLabel style={{ fontSize: "var(--fs-xs)" }}>Account</DropdownMenuLabel>

          <DropdownMenuItem render={<Link href="/dashboard" />} className="nt-menu__item">
            Dashboard
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/modules" />} className="nt-menu__item">
            My modules
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/purchases" />} className="nt-menu__item">
            Purchases
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/dashboard/settings" />} className="nt-menu__item">
            Settings
          </DropdownMenuItem>
          <DropdownMenuItem render={<Link href="/modules" />} className="nt-menu__item">
            Browse catalogue
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* Below a separator and outside the Account group: signing out
            is not one of the places you can go, so it does not belong
            among the links. The same hook the dashboard's sign-out
            button uses — a <SignOutButton /> in here would be a button
            nested inside the menu item's own button. */}
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          <DropdownMenuItem
            onClick={signOut}
            variant="destructive"
            className="nt-menu__item nt-menu__item--danger"
          >
            Sign out
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}