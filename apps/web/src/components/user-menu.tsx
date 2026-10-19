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
  HomeIcon,
  LayoutDashboardIcon,
  ListChecksIcon,
  LogOutIcon,
  ReceiptIcon,
  SettingsIcon,
  SparklesIcon,
  UserRoundIcon,
} from "lucide-react";
import { useMemo } from "react";

import { useIsNarrow } from "@/lib/use-is-narrow";
import { useHasMounted } from "@/lib/use-has-mounted";

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
export default function UserMenu(props: {
  /**
   * Drop the panel from the trigger instead of from the top edge of the
   * viewport.
   *
   * The top-edge anchor is right where this menu normally lives: a thin
   * header that the panel then covers, so descending from y=0 continues
   * a line rather than interrupting one. It is wrong on the dashboard,
   * whose floating control is also at the top — a panel from y=0 there
   * lands straight across the large avatar in the identity strip, so
   * the two read as two menus fighting for the same corner.
   *
   * Anchoring to the trigger also puts the panel where the finger
   * already is, which is the point of having the control float.
   *
   * BUT NOT ON A PHONE, and that is the whole reason this prop has a
   * companion. Below 640px the dashboard's control is `position: fixed`
   * at `top: calc(var(--sp-3) + env(safe-area-inset-top))` — inset on
   * purpose, because a button flush against the top edge sits under the
   * notch and the status bar. Anchoring to that rect puts the panel at
   * the same inset rather than at y=0, so on a phone it appeared as a
   * panel hanging just under the button instead of descending from the
   * top of the screen. The inset that makes the control tappable
   * becomes the offset that makes the panel look mispositioned.
   *
   * So the panel pins to the top edge on narrow screens even where the
   * trigger would be the better anchor, and the phone gets the shape the
   * landing page has always had. See useIsNarrow, and NARROW_QUERY for
   * why 640 is the number.
   */
  anchorToTrigger?: boolean;
} = {}): React.JSX.Element {
  const { anchorToTrigger = false } = props;
  const isNarrow = useIsNarrow();
  /*
   * One name for the decision rather than `anchorToTrigger && !isNarrow`
   * repeated at the two use sites. They have to agree: if the anchor
   * said "centre against the viewport" while `align` said "end against
   * the trigger", the panel would be centred on the full width and
   * clamped to the right edge, which is neither the old shape nor the
   * new one.
   */
  const pinToTopEdge = !anchorToTrigger || isNarrow;
  const { data: session, isPending } = authClient.useSession();

  // Above the early returns below: a hook after a conditional return is
  // a rules-of-hooks violation, and the count of hooks has to stay
  // stable across the pending / signed-out / signed-in renders.
  const mounted = useHasMounted();
  const anchor = useMemo(topEdgeAnchor, []);
  const signOut = useSignOut();

  /*
    THE MOUNT GATE IS THE FIX, AND `isPending` ALONE IS NOT.

    `isPending` reads an EXTERNAL STORE, and an external store can change
    while React is still hydrating — which is exactly what happened on
    /ai. The session atom starts pending on both sides, the fetch is
    scheduled in a `setTimeout(0)` on mount, and /ai takes longer than
    one round trip to a local server to hydrate. The fetch landed
    mid-walk, this branch flipped, and React reported a hydration
    mismatch and rebuilt the whole client tree.

    /practice is this same component over a much smaller tree and was
    clean, and so were /, /modules and /dashboard. That is not a reason
    to leave them: it is the reason the bug reads as "it happens
    sometimes, on the chat page".

    Both states render the same element, so the correction lands without
    a flicker — there is one placeholder before and after, and only the
    destination changes.
  */
  if (!mounted || isPending) {
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
      {/*
        AN ICON, NOT THE AVATAR.

        The trigger was the account's profile photo with a caret beside
        it. Two problems with that: a photo is a different shape from
        every other control in the header, so the row read as "identity
        block plus toolbar" rather than as one set of buttons; and it is
        the only control on any page whose appearance changes per user,
        which makes the header's rhythm impossible to keep consistent.

        A person glyph is the same square as everything else in the row
        and carries the same accessible name, so nothing is lost —
        `aria-label` still says whose menu it is.
      */}
      <DropdownMenuTrigger
        className="nt-btn nt-btn--ghost nt-btn--icon nt-menu__btn"
        aria-label={`Account menu for ${session.user.name ?? "you"}`}
      >
        <UserRoundIcon aria-hidden="true" />
      </DropdownMenuTrigger>

      {/* Descends from the top of the viewport rather than from the
          trigger. `shift` on both axes rather than the default `flip` is
          the point: with flipping, a short window would send the panel
          upward, which is the opposite of what was asked for. The bar
          sizes itself from its own contents — see .nt-menu__bar — so it
          stays a slim, fixed-height strip on any screen instead of
          stretching to fill the viewport like the column did. */}
      <DropdownMenuContent
        align={pinToTopEdge ? "center" : "end"}
        anchor={pinToTopEdge ? anchor : undefined}
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
          {/*
            Home first. The dashboard is the only signed-in surface with
            no site header, and its tab bar links only to other dashboard
            pages — so without this there is no way back to the landing
            page from inside it except the browser's back button, which
            on a deep link is a dead end rather than a parent.
          */}
          <DropdownMenuItem
            render={<Link href="/" />}
            className="nt-menu__ico"
            aria-label="Home"
            data-label="Home"
          >
            <HomeIcon aria-hidden="true" />
          </DropdownMenuItem>
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
          {/*
            Practice sits beside the tutor and directly after the
            catalogue rather than among the account links, because it is
            neither of them: it is the third study destination, the one
            a reader opens when they do not know what to ask.

            It was unreachable from here, which is the same shape of gap
            as the tutor's absence from every nav before it had an icon:
            the route existed, the menu existed, and nothing joined them.
            A feature only reachable by typing it is one nobody opens.
          */}
          <DropdownMenuItem
            render={<Link href="/practice" />}
            className="nt-menu__ico"
            aria-label="Practice"
            data-label="Practice"
          >
            <ListChecksIcon aria-hidden="true" />
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<Link href="/ai" />}
            className="nt-menu__ico"
            aria-label="AI tutor"
            data-label="AI tutor"
          >
            <SparklesIcon aria-hidden="true" />
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