import type { Metadata } from "next";
import Link from "next/link";

import ImprovementForm from "@/components/landing/improvement-form";
import ModuleCatalogue, {
  type CatalogueRow,
} from "@/components/landing/module-catalogue";
import ScrollReveal from "@/components/landing/scroll-reveal";
import { getOwnedCodes, listModules } from "@/lib/modules";
import { getSession } from "@/lib/session";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Modules · Nexus",
  description:
    "Every Nexus module: what it covers, what it costs, and a free sample of the one that is ready.",
};

/**
 * THE CATALOGUE — /modules
 * ------------------------------------------------------------
 * Public. Everything except the two gated actions is visible to
 * anyone, signed in or not: the module list, the descriptions, the
 * prices, and whether a sample exists. The preview and buy controls
 * become a sign-in prompt without a session.
 *
 * .nt-root is required — ScrollReveal scopes itself to it, and it
 * carries the tokens, .nt-glass and .nt-btn.
 */
export default async function ModulesPage(): Promise<React.JSX.Element> {
  const user = await getSession();
  const [modules, owned] = await Promise.all([
    listModules(),
    getOwnedCodes(user?.id ?? null),
  ]);

  const rows: ReadonlyArray<CatalogueRow> = modules.map((m) => ({
    ...m,
    owned: owned.has(m.code),
    signedIn: user !== null,
  }));

  const ready = modules.filter((m) => m.status === "available").length;

  return (
    <div className="nt-root">
      {/* Fixed ambient layer, same as the landing page. */}
      <div className="nt-ambient-bg" aria-hidden="true" />
      <div className="nt-grid-bg" aria-hidden="true" />
      <ScrollReveal />

      <nav className="nt-nav" aria-label="Main">
        <Link className="nt-nav__mark" href="/">
          nexus<span className="nt-caret">_</span>
        </Link>
        <div className="nt-nav__links">
          <Link className="nt-nav__link" href="/">
            ~/
          </Link>
          <Link className="nt-nav__link" href="/#modules">
            ~/modules
          </Link>
          {user ? (
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

      <main className="nt-app__main" style={{ paddingTop: "var(--sp-8)" }}>
        <div className="nt-wrap" style={{ paddingBottom: "var(--sp-9)" }}>
          <div className="nt-sec-head" data-reveal="rise">
            <div className="nt-sec-head__bar">
              <span className="nt-sec-head__path">~/nexus</span>
              <span>/modules</span>
            </div>
            <h1 className="nt-sec-head__title">
              {modules.length} modules, {ready} of them ready
            </h1>
            <p className="nt-sec-head__lead">
              Every module is R50 and the notes stay yours either way. Sign in to preview the
              sample on the one that is finished — the rest are still being written.
            </p>
          </div>

          <div data-reveal="wipe">
            <ModuleCatalogue rows={rows} />
          </div>

          {/* ---- Improvement requests ---- */}
          <div
            className="nt-sec-head"
            data-reveal="rise"
            style={{ marginTop: "var(--sp-9)", marginBottom: "var(--sp-5)" }}
          >
            <div className="nt-sec-head__bar">
              <span className="nt-sec-head__path">~/nexus</span>
              <span>/feedback</span>
            </div>
            <h2 className="nt-sec-head__title">Tell me what to fix</h2>
            <p className="nt-sec-head__lead">
              If something is wrong, unclear, or missing, say so. I am the one writing these, so
              the fastest route is straight to me.
            </p>
          </div>

          <div className="nt-panel nt-glass" data-reveal="wipe">
            <div className="nt-panel__bar">
              <span className="nt-sec-head__path">~/feedback</span>
              <span>new</span>
            </div>
            <div className="nt-panel__body">
              <ImprovementForm />
            </div>
          </div>
        </div>
      </main>

      <footer className="nt-footer">
        <Link href="/">back to the landing page</Link> · built by a first year CS student at NMU
      </footer>
    </div>
  );
}