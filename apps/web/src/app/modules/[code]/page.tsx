import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ScrollReveal from "@/components/landing/scroll-reveal";
import TopicList from "@/components/landing/topic-list";
import ThemeToggle from "@/components/theme-toggle";
import { topicsFor } from "@/content/module-topics";
import { getModuleByCode, getOwnedCodes } from "@/lib/modules";
import { getSession } from "@/lib/session";
import { TRIAL_PDFS } from "@/lib/trial-pdf";

import "@/styles/landing.css";

type Params = { readonly params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { code } = await params;
  const mod = await getModuleByCode(code.toUpperCase());
  if (!mod) {
    return { title: "Module not found · Nexus" };
  }
  return {
    title: `${mod.code} ${mod.name} · Nexus`,
    description: mod.description,
  };
}

/**
 * MODULE PAGE — /modules/[code]
 * ------------------------------------------------------------
 * One glass panel: what the module is, a page of the notes, and a
 * download. The lesson list, the outcomes and the price lived here
 * once and read as a wall — the sample is the thing worth showing
 * someone who has not paid yet, and it is what they can judge.
 *
 * A code that is not in the catalogue at all is a genuine 404. A
 * code that is in the catalogue but has no sample yet is not — that
 * would tell a student the module does not exist, when it simply
 * is not finished.
 */
export default async function ModuleDetailPage({
  params,
}: Params): Promise<React.JSX.Element> {
  const { code: raw } = await params;
  const code = raw.toUpperCase();

  const mod = await getModuleByCode(code);
  if (!mod) {
    notFound();
  }

  const user = await getSession();
  const owned = await getOwnedCodes(user?.id ?? null);
  const isOwned = owned.has(mod.code);

  const trial = TRIAL_PDFS[mod.code];
  const topics = topicsFor(mod.code);

  return (
    <div className="nt-root">
      <div className="nt-ambient-bg" aria-hidden="true" />
      <div className="nt-grid-bg" aria-hidden="true" />
      <ScrollReveal />

      <nav className="nt-nav" aria-label="Main">
        <Link className="nt-nav__mark" href="/">
          nexus<span className="nt-caret">_</span>
        </Link>
        <div className="nt-nav__links">
          <Link className="nt-nav__link" href="/modules">
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
          <ThemeToggle />
        </div>
      </nav>

      <main className="nt-app__main" style={{ paddingTop: "var(--sp-8)" }}>
        <div className="nt-wrap nt-wrap--narrow" style={{ paddingBottom: "var(--sp-9)" }}>
          <div className="nt-pagehead" data-reveal="rise">
            <div className="nt-sec-head__bar">
              <Link className="nt-sec-head__path" href="/modules">
                ~/nexus
              </Link>
              <span>/modules/</span>
              <span>{mod.code}</span>
            </div>
            <div className="nt-detail__head">
              <h1 className="nt-detail__title">{mod.name}</h1>
              {isOwned ? (
                <span className="nt-badge nt-badge--ok">in your account</span>
              ) : null}
            </div>
          </div>

          {trial ? (
            /* ---- A sample exists: show it ---- */
            <div className="nt-panel nt-glass nt-trial" data-reveal="rise">
              <div className="nt-panel__bar">
                <span className="nt-sec-head__path">~/modules/{mod.code}</span>
                <span>{trial.label}</span>
              </div>

              <div className="nt-panel__body">
                {/* The only prose on the page. */}
                <p className="nt-trial__lead">
                  {mod.description} This is {trial.size} of the notes, free, so you can see how
                  they read before you spend anything.
                </p>

                {user ? (
                  <>
                    <iframe
                      className="nt-trial__frame"
                      src="/api/trial"
                      title={`${trial.label} — PDF preview`}
                    />

                    <div className="nt-trial__actions">
                      <a className="nt-btn" href="/api/trial?download=1">
                        download the sample
                      </a>
                      <Link className="nt-btn nt-btn--ghost" href="/modules">
                        all modules
                      </Link>
                    </div>
                  </>
                ) : (
                  <div className="nt-trial__locked">
                    <span className="nt-gate">sign in to preview the sample</span>
                    <p className="nt-note">
                      The sample sits behind the same account as the notes. It is free either
                      way — an account is all it takes, and there is no card until you buy
                      something.
                    </p>
                    <div className="nt-trial__actions">
                      <Link className="nt-btn" href={`/login?next=/modules/${mod.code}`}>
                        sign in
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ---- No sample yet: announced, not written ---- */
            <div className="nt-panel nt-glass nt-trial" data-reveal="rise">
              <div className="nt-panel__bar">
                <span className="nt-sec-head__path">~/modules/{mod.code}</span>
                <span>coming soon</span>
              </div>

              <div className="nt-panel__body">
                <p className="nt-trial__lead">
                  {mod.description} I write one module at a time, in the order of the ones I am
                  actually sitting in, so there is no sample of this one yet.
                </p>

                <div className="nt-trial__actions">
                  <Link className="nt-btn" href="/modules">
                    see what is ready
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* The module's notes, topic by topic. Each row is one PDF,
              behind the module's purchase rather than its own. */}
          <div style={{ marginTop: "var(--sp-8)" }}>
            <TopicList
              moduleCode={mod.code}
              topics={topics}
              priceCents={mod.priceCents}
              owned={isOwned}
              signedIn={user !== null}
            />
          </div>
        </div>
      </main>

      <footer className="nt-footer">
        <Link href="/modules">back to all modules</Link> · built by a first year CS student at NMU
      </footer>
    </div>
  );
}