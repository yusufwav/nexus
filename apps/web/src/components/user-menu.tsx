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

import { authClient } from "@/lib/auth-client";

import Avatar from "./avatar";

/**
 * USER MENU
 * ------------------------------------------------------------
 * The trigger shows the user's name and their initials avatar.
 * Clicking it opens a dropdown whose first item is the dashboard —
 * the identity block is the way into the app, so navigating from it
 * should not require hunting through a menu for the obvious choice.
 */
export default function UserMenu(): React.JSX.Element {
  const { data: session, isPending } = authClient.useSession();

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

      <DropdownMenuContent align="end" className="nt-root">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}