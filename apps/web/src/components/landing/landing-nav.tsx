"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

const LINKS = [
  { href: "#mission", label: "~/readme" },
  { href: "#modules", label: "~/modules" },
  { href: "#partner", label: "~/partner" },
  { href: "#pricing", label: "~/pricing" },
] as const;

/**
 * The design's fixed nav, with its right side driven by the session:
 * "sign in" when logged out, a dashboard link when logged in. The
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
          <Link className="nt-btn nt-btn--ghost" href="/dashboard">
            dashboard
          </Link>
        ) : (
          <Link className="nt-btn nt-btn--ghost" href="/login">
            sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
