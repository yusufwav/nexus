"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { authClient } from "@/lib/auth-client";

import ThemeToggle from "./theme-toggle";
import UserMenu from "./user-menu";

const LINKS = [
  { to: "/", label: "~/" },
  { to: "/modules", label: "~/modules" },
  { to: "/dashboard", label: "~/dashboard" },
  { to: "/ai", label: "~/ai" },
] as const;

/**
 * THE APP HEADER
 * ------------------------------------------------------------
 * Was the cyan Better-TStack bar. Restyled to the terminal theme so
 * the one route that still mounts this shell (/ai) matches the rest
 * of the product. The dashboard brings its own header, so this is
 * only used by routes inside the (app) group.
 */
export default function Header(): React.JSX.Element {
  const pathname = usePathname();
  const { data: session } = authClient.useSession();

  return (
    <header className="nt-head">
      <Link className="nt-head__mark" href="/">
        nexus<span className="nt-caret">_</span>
      </Link>

      <nav className="nt-head__links" aria-label="Main">
        {LINKS.map(({ to, label }) => (
          <Link
            key={to}
            className={`nt-head__link${pathname === to ? " nt-head__link--on" : ""}`}
            href={to}
          >
            {label}
          </Link>
        ))}
      </nav>

      <div className="nt-head__actions">
        {session ? (
          <UserMenu />
        ) : (
          <Link className="nt-btn nt-btn--ghost" href="/login">
            sign in
          </Link>
        )}
        <ThemeToggle />
      </div>
    </header>
  );
}