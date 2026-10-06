"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

import ThemeToggle from "@/components/theme-toggle";
import UserMenu from "@/components/user-menu";

const LINKS = [
  { href: "#mission", label: "~/readme" },
  { href: "#modules", label: "~/modules" },
  { href: "#partner", label: "~/partner" },
  { href: "#pricing", label: "~/pricing" },
] as const;

/**
 * The design's fixed nav, with its right side driven by the session:
 * "sign in" when logged out, the user's own menu when logged in. The
 * design shipped without either, which left no way into the app from
 * the landing page.
 */
export default function LandingNav(): React.JSX.Element {
  const [stuck, setStuck] = useState(false);
  const { data: session } = authClient.useSession();

  useEffect(() => {
    const onScroll = (): void => setStuck(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`nt-nav${stuck ? " nt-nav--stuck" : ""}`} aria-label="Main">
      <span className="nt-nav__mark">
        nexus<span className="nt-caret">_</span>
      </span>
      <div className="nt-nav__links">
        {LINKS.map(({ href, label }) => (
          <a key={href} className="nt-nav__link" href={href}>
            {label}
          </a>
        ))}
        {session?.user ? (
          <>
            {/* The tutor was reachable only by typing /ai — nothing in
                the product linked to it. It is an app feature rather
                than a public page, so it appears for signed-in users
                only; /ai still redirects anyone else to the login. */}
            <Link className="nt-btn nt-btn--ghost" href="/ai">
              ~/ai
            </Link>
            {/* The identity block, not a bare "dashboard" link. The
                landing page is where people arrive first, so it is the
                one place worth saying who they are — and it puts the
                dashboard, the settings and sign-out one click away
                instead of on a separate nav bar the visitor has to
                find first.

                No sign-in branch alongside it: UserMenu renders its own
                when the session is still resolving or empty, so a
                second link here would be the same destination twice. */}
            <UserMenu />
          </>
        ) : (
          <Link className="nt-btn nt-btn--ghost" href="/login">
            sign in
          </Link>
        )}
        <ThemeToggle />
      </div>
    </nav>
  );
}
