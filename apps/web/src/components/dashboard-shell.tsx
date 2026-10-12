import Link from "next/link";

import AsciiField from "@/components/landing/ascii-field";
import ScrollReveal from "@/components/landing/scroll-reveal";
import { SparklesIcon } from "lucide-react";
import type { Session } from "@Main/auth";

import Avatar from "./avatar";
import SignOutButton from "./sign-out-button";
import ThemeToggle from "./theme-toggle";

/**
 * THE DASHBOARD SHELL
 * ------------------------------------------------------------
 * Two pieces of the whole screen. The top fifth is left uncovered:
 * moving, non-interactive ASCII with the identity block floating on
 * it. The remaining four fifths is a single glass console holding
 * the tabs and the page body.
 *
 * The ASCII uses the ambient variant deliberately — it ignores the
 * pointer, so nothing the user is trying to click is ever
 * intercepted by a canvas filling the strip.
 *
 * .nt-root carries the tokens AsciiField and the reveal engine read;
 * .nt-dash is the layout shell defined in styles/app.css.
 *
 * ScrollReveal is mounted here, and it has to be. styles/app.css hides
 * every [data-reveal] inside .nt-dash at opacity: 0 and only lifts it
 * for elements carrying .is-in — a class this component adds. It used
 * to be mounted solely on the landing page, so on every dashboard
 * route the hide had no matching reveal: overview, my modules,
 * purchases, settings and support all rendered their headings and then
 * nothing at all. The markup was correct the whole time; the CSS was
 * simply waiting for an engine that was not there.
 */

export const DASH_TABS = [
  { href: "/dashboard", label: "overview" },
  { href: "/dashboard/modules", label: "my modules" },
  { href: "/dashboard/purchases", label: "purchases" },
  { href: "/dashboard/settings", label: "settings" },
  { href: "/dashboard/support", label: "support" },
] as const;

export default function DashboardShell({
  user,
  active,
  children,
}: {
  readonly user: Session["user"];
  readonly active: string;
  readonly children: React.ReactNode;
}): React.JSX.Element {
  const joined = new Date(user.createdAt).toLocaleDateString("en-ZA", {
    month: "short",
    year: "numeric",
  });

  return (
    <div className="nt-root nt-dash">
      {/* ---- The uncovered strip: moving, non-interactive ASCII ---- */}
      <div className="nt-dash__strip">
        <AsciiField variant="ambient" />
        <div className="nt-dash__id">
          <Avatar name={user.name} image={user.image} size="lg" />

          <div className="nt-dash__who">
            <h1 className="nt-dash__name">{user.name}</h1>
            <p className="nt-dash__email">
              {user.email} · joined {joined}
            </p>
          </div>

          <div className="nt-dash__id-actions">
            {/* The tutor had no way in from anywhere in the dashboard:
                five pages, none of them linking to it, so the only route
                to /ai was typing the path or arriving from another nav.
                Here rather than in the tab bar below, because the tabs
                are this console's own sections and the tutor is a
                destination outside the dashboard — the same distinction
                that keeps "browse modules" up here too.

                Icon rather than a `~/ai` label, with the name on
                aria-label: an icon on its own announces nothing, and the
                spark is the glyph the tutor's own heading uses.

                Unconditional, unlike the public pages: this shell only
                renders for a signed-in user, so there is no state in
                which the link would be a dead end. */}
            <Link
              className="nt-btn nt-btn--ghost nt-btn--icon"
              href="/ai"
              aria-label="AI tutor"
              title="AI tutor"
            >
              <SparklesIcon aria-hidden="true" />
            </Link>
            <Link className="nt-btn nt-btn--ghost" href="/modules">
              browse modules
            </Link>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* ---- The console over the lower four fifths ---- */}
      <div className="nt-dash__console">
        <nav className="nt-dash__tabs" aria-label="Dashboard sections">
          {DASH_TABS.map((t) => (
            <Link
              key={t.href}
              className={`nt-dash__tab${active === t.href ? " nt-dash__tab--on" : ""}`}
              href={t.href}
              aria-current={active === t.href ? "page" : undefined}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {/* Renders nothing. Lives here because the .nt-dash reveal rules
            in styles/app.css are gated on the .is-in class it adds —
            without it the page body below stays at opacity 0. */}
        <ScrollReveal />

        <div className="nt-dash__body">{children}</div>
      </div>
    </div>
  );
}