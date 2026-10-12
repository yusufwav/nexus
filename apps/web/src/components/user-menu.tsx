"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@Main/ui/components/dropdown-menu";
import Link from "next/link";
import {
  BookOpenIcon,
  CompassIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  ReceiptIcon,
  SettingsIcon,
} from "lucide-react";
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
 * USER MENU — a horizontal bar of icons
 * ------------------------------------------------------------
 * It used to be a vertical dropdown: an identity block, an "Account"
 * heading, then five rows of text, dropping from the top of the screen.
 * That is a tall column hanging off a header to reach six destinations,
 * and most of those labels were repeating the icon already beside them.
 *
 * It is now a landscape bar: the avatar at one end, the destinations
 * side by side across it, and sign-out at the far end past a divider —
 * so the whole set reads in one glance instead of one row at a time, and
 * the bar is short enough not to cover the page.
 *
 * ICON-ONLY IS A REAL COST, so it is paid deliberately and then paid
 * back. Every item carries an `aria-label` (the visible text is gone,
 * the accessible name is not) and a `data-label` the stylesheet turns
 * into a tooltip on hover AND on :focus-visible. The second arm is not
 * optional: someone tabbing the bar has no pointer to hover with, so
 * without it the labels would be unreachable by keyboard — which is why
 * this pattern needs the aria-label and the tooltip together rather than
 * either one alone.
 *
 * The account's name and email are no longer written anywhere on screen.
 * The avatar carries the identity and the trigger's accessible name
 * still says whose it is, and the bar stays narrow enough to be read at
 * a glance rather than scanned.
 *
 * It signs the user out as well, because on the landing page it is the
 * only header there is: without this, being signed in on `/` meant there
 * was nowhere to sign out from.
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
      <DropdownMenuTrigger
        className="nt-menu__btn nt-menu__btn--icon"
        aria-label={`Account menu for ${session.user.name ?? "you"}`}
      >
        <Avatar name={session.user.name} image={session.user.image} size="sm" />
        <span className="nt-menu__caret" aria-hidden="true">
          ▼
        </span>
      </DropdownMenuTrigger>

      {/* Descends from the top of the viewport rather than from the
          trigger. `shift` on both axes rather than the default `flip` is
          the point: with flipping, a short window would send the panel
          upward, which is the opposite of what was asked for. The bar
          sizes itself from its own contents — see .nt-menu__bar — so it
          stays a slim, fixed-height strip on any screen instead of
          stretching to fill the viewport like the column did. */}
      <DropdownMenuContent
        align="center"
        anchor={anchor}
        collisionAvoidance={{ side: "shift", align: "shift", fallbackAxisSide: "none" }}
        positionMethod="fixed"
        side="bottom"
        sideOffset={0}
        className="nt-root nt-menu__bar"
      >
        <Avatar name={session.user.name} image={session.user.image} size="sm" />

        <span className="nt-menu__rule" aria-hidden="true" />

        {/* A base-ui Group rather than a bare div: the menu wires keyboard
            navigation through Group/Item roles, so wrapping the items in
            a plain element would leave the arrows and typeahead working
            by accident at best. The group is laid out as a row by
            .nt-menu__rail. */}
        <DropdownMenuGroup className="nt-menu__rail">
          <DropdownMenuItem
            render={<Link href="/dashboard" />}
            className="nt-menu__ico"
            aria-label="Dashboard"
            data-label="Dashboard"
          >
            <LayoutDashboardIcon aria-hidden="true" />
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/dashboard/modules" />}
            className="nt-menu__ico"
            aria-label="My modules"
            data-label="My modules"
          >
            <BookOpenIcon aria-hidden="true" />
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/dashboard/purchases" />}
            className="nt-menu__ico"
            aria-label="Purchases"
            data-label="Purchases"
          >
            <ReceiptIcon aria-hidden="true" />
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/dashboard/settings" />}
            className="nt-menu__ico"
            aria-label="Settings"
            data-label="Settings"
          >
            <SettingsIcon aria-hidden="true" />
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/modules" />}
            className="nt-menu__ico"
            aria-label="Browse catalogue"
            data-label="Browse catalogue"
          >
            <CompassIcon aria-hidden="true" />
          </DropdownMenuItem>
        </DropdownMenuGroup>

        {/* Its own divider, because signing out is not one of the places
            you can go and should not sit shoulder to shoulder with them.
            A span rather than DropdownMenuSeparator: that is a horizontal
            rule by construction, and a divider in a horizontal bar has to
            be vertical or it cuts the icons in half. The same hook the
            dashboard's sign-out button uses — a <SignOutButton /> in here
            would be a button nested inside the item's own button. */}
        <span className="nt-menu__rule" aria-hidden="true" />

        <DropdownMenuGroup className="nt-menu__rail">
          <DropdownMenuItem
            onClick={signOut}
            variant="destructive"
            className="nt-menu__ico nt-menu__ico--danger"
            aria-label="Sign out"
            data-label="Sign out"
          >
            <LogOutIcon aria-hidden="true" />
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}