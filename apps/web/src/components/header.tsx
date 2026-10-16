"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SparklesIcon } from "lucide-react";

import { authClient } from "@/lib/auth-client";

import ThemeToggle from "./theme-toggle";
import UserMenu from "./user-menu";

/**
 * Destinations, in the order they appear. `icon` is set on the one that
 * is a feature rather than a location: the tutor is not another
 * directory to `cd` into, and drawing it as a spark keeps it legible as
 * the thing it is instead of a fifth path competing with the other four.
 */
const LINKS = [
  { to: "/", label: "~/" },
  { to: "/modules", label: "~/modules" },
  { to: "/dashboard", label: "~/dashboard" },
  // Practice sits before the tutor, not after: it is where a reader is meant
  // to go when they do not know what to ask, and the tutor is where they go
  // when they do. The tutor is the icon at the end because it is the one that
  // costs them money to open.
  { to: "/practice", label: "~/practice" },
  { to: "/ai", label: "~/ai", icon: true },
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
        {LINKS.map(({ to, label, ...rest }) => {
          const on = pathname === to;
          const icon = "icon" in rest && rest.icon === true;

          return (
            <Link
              key={to}
              className={`nt-head__link${on ? " nt-head__link--on" : ""}${icon ? " nt-head__link--icon" : ""}`}
              href={to}
              /* An icon with no label announces nothing, so the name is
                 carried here. The visible text is swapped out below,
                 not merely hidden from layout. */
              aria-label={icon ? "AI tutor" : undefined}
              title={icon ? "AI tutor" : undefined}
            >
              {icon ? <SparklesIcon aria-hidden="true" /> : label}
            </Link>
          );
        })}
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