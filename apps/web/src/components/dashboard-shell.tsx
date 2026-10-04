import Link from "next/link";

import AsciiField from "@/components/landing/ascii-field";
import type { Session } from "@Main/auth";

import Avatar from "./avatar";
import SignOutButton from "./sign-out-button";

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
            <Link className="nt-btn nt-btn--ghost" href="/modules">
              browse modules
            </Link>
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

        <div className="nt-dash__body">{children}</div>
      </div>
    </div>
  );
}