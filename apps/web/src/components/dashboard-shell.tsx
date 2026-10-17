import Link from "next/link";

import ScrollReveal from "@/components/landing/scroll-reveal";
import LetterGlitch from "@/components/letter-glitch";

import { DASH_ACTIONS } from "@/lib/dash-actions";

import UserMenu from "./user-menu";
import type { Session } from "@Main/auth";

import Avatar from "./avatar";
import SignOutButton from "./sign-out-button";
import ThemeToggle from "./theme-toggle";

/**
 * THE DASHBOARD SHELL
 * ------------------------------------------------------------
 * Two pieces of the whole screen. The top fifth is left uncovered,
 * with the identity block floating in it. The remaining four fifths is
 * a single glass console holding the tabs and the page body.
 *
 * THE STRIP NOW HOLDS THE LETTER GLITCH FIELD.
 * It used to hold the flowing ASCII field on its ambient variant —
 * deliberately non-interactive, so nothing the user was trying to click
 * was ever intercepted by a canvas filling the strip. Letter Glitch
 * keeps that property — interactive is off and cursorRadius is 0 — and
 * replaces the drifting glyphs with a field that flickers and tears.
 *
 * The strip itself and .nt-dash__strip's scrims are unchanged. Those
 * scrims dissolve the strip's two ends against whatever field sits
 * behind them, and since the ASCII instance was removed they had been
 * dissolving an edge with nothing behind it. They have a field again.
 *
 * .nt-root carries the tokens the reveal engine reads; .nt-dash is the
 * layout shell defined in styles/app.css.
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
  return (
    <div className="nt-root nt-dash">
      {/* ---- The uncovered strip ----
          The Letter Glitch field, mounted as the first child so it paints
          under the identity block rather than over it. This is the asset
          the ASCII instance was removed to make room for; the two edge
          scrims on ::after read against it now, which is what they were
          written for. */}
      <div className="nt-dash__strip">
        <LetterGlitch />
        <div className="nt-dash__id">
          <Avatar name={user.name} image={user.image} size="lg" />

          <div className="nt-dash__who">
            <h1 className="nt-dash__name">{user.name}</h1>
          </div>

            <div className="nt-dash__id-actions">
              {/*
               * THE INLINE ROW — desktop only.
               *
               * Hidden below 640px in favour of a floating <UserMenu />
               * in the top-right corner. See `.nt-dash__float` in
               * app.css for why a row of five controls does not survive
               * a phone: it is three square icons beside two wide ones,
               * which reads as ragged boxes rather than a toolbar.
               *
               * Both presentations reach the same destinations. The
               * desktop row from DASH_ACTIONS; the floating menu through
               * UserMenu, which offers a superset.
               */}
              <div className="nt-dash__id-row">
                {DASH_ACTIONS.map(({ href, label, Icon }) => (
                  <Link
                    key={href}
                    className="nt-btn nt-btn--ghost nt-btn--icon"
                    href={href}
                    aria-label={label}
                    title={label}
                  >
                    <Icon aria-hidden="true" />
                  </Link>
                ))}
                <ThemeToggle />
                <SignOutButton />
              </div>

              {/* The compact menu — mobile only, floated clear of the strip.
                  See .nt-dash__float in app.css: it is deliberately the
                  top-right control on the page rather than one more item
                  in the identity row, because inside that row it sat on
                  the console's border and read as clutter. */}
              <div className="nt-dash__float">
                <UserMenu anchorToTrigger />
              </div>
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
