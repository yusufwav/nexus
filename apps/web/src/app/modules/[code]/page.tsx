import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import ScrollReveal from "@/components/landing/scroll-reveal";
import { contentFor } from "@/content/module-content";
import { formatZar } from "@/lib/money";
import { getModuleByCode, getOwnedCodes, listModules } from "@/lib/modules";
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
 * MODULE DETAIL — /modules/[code]
 * ------------------------------------------------------------
 * Two states, both public:
 *
 *   written      the full page: overview, outcomes, every lesson
 *   coming soon  the module is announced and priced, but the notes
 *                do not exist yet
 *
 * A code that is not in the catalogue at all is a genuine 404. A code
 * that is in the catalogue but unwritten is not — that would tell a
 * student the module does not exist, when it simply is not finished.
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
  const [owned, all] = await Promise.all([
    getOwnedCodes(user?.id ?? null),
    listModules(),
  ]);

  const content = contentFor(mod.code);
  const isOwned = owned.has(mod.code);
  const trial = TRIAL_PDFS[mod.code];
  const written = content !== null;
  const sold = mod.status === "available";

  // A way back into the catalogue from a dead end.
  const siblings = all.filter((m) => m.code !== mod.code).slice(0, 4);

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
        </div>
      </nav>

      <main className="nt-app__main" style={{ paddingTop: "var(--sp-8)" }}>
        <div className="nt-wrap" style={{ paddingBottom: "var(--sp-9)" }}>
          <div className="nt-pagehead" data-reveal="rise">
            <div className="nt-sec-head__bar">
              <Link className="nt-sec-head__path" href="/modules">
                ~/nexus
              </Link>
              <span>/modules/</span>
              <span>{mod.code}</span>
            </div>
            <div className="nt-detail__head">
              <span className="nt-detail__code">{mod.code}</span>
              <h1 className="nt-detail__title">{mod.name}</h1>
              {isOwned ? (
                <span className="nt-badge nt-badge--ok">in your account</span>
              ) : mod.status === "available" ? (
                <span className="nt-badge nt-badge--live">available</span>
              ) : (
                <span className="nt-badge nt-badge--soon">coming soon</span>
              )}
            </div>
            <p className="nt-sec-head__lead">{mod.description}</p>
          </div>

          {!written ? (
            /* ---- COMING SOON: the module exists, the notes do not yet ---- */
            <div data-reveal="wipe">
              <div
                className="nt-soon"
                style={{ padding: "var(--sp-8)", marginBottom: "var(--sp-5)" }}
              >
                <p style={{ margin: "0 0 var(--sp-3)", color: "var(--fg-muted)" }}>
                  These notes are not written yet.
                </p>
                <p className="nt-note" style={{ maxWidth: "34rem", margin: "0 auto" }}>
                  I write one module at a time, in the order of the ones I am actually sitting
                  in. MATT101 is the only one finished so far. If you tell me what you need, I
                  will move it up the list — there is a form on the{" "}
                  <Link href="/modules" style={{ color: "var(--accent-b)" }}>
                    modules page
                  </Link>
                  .
                </p>
              </div>

              <div className="nt-panel nt-glass">
                <div className="nt-panel__bar">
                  <span className="nt-sec-head__path">~/modules/{mod.code}</span>
                  <span>status</span>
                </div>
                <div className="nt-panel__body">
                  <div className="nt-kv">
                    <span className="nt-kv__k">status</span>
                    <span className="nt-kv__v">announced, unwritten</span>
                  </div>
                  <div className="nt-kv">
                    <span className="nt-kv__k">price</span>
                    <span className="nt-kv__v">
                      <strong>{formatZar(mod.priceCents)}</strong> once written
                    </span>
                  </div>
                  <div className="nt-kv">
                    <span className="nt-kv__k">sample</span>
                    <span className="nt-kv__v">not written, so none yet</span>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ---- WRITTEN: the full page ---- */
            <div className="nt-detail">
              <div>
                <div className="nt-prose" data-reveal="rise">
                  {content.overview.map((p) => (
                    <p key={p}>{p}</p>
                  ))}
                </div>

                {/* What you should be able to do afterwards */}
                <div
                  className="nt-panel"
                  data-reveal="rise"
                  style={{ marginTop: "var(--sp-6)" }}
                >
                  <div className="nt-panel__bar">
                    <span className="nt-sec-head__path">outcomes</span>
                    <span>by the end</span>
                  </div>
                  <div className="nt-panel__body">
                    <ul className="nt-mission__points" style={{ margin: 0 }}>
                      {content.outcomes.map((o, i) => (
                        <li key={o}>
                          <span className="nt-mission__idx">{String(i + 1).padStart(2, "0")}</span>
                          <span>{o}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                {/* The lessons */}
                <div style={{ marginTop: "var(--sp-7)" }}>
                  {content.lessons.map((l) => (
                    <article
                      key={l.n}
                      id={`lesson-${l.n}`}
                      style={{ marginBottom: "var(--sp-6)", scrollMarginTop: "var(--sp-6)" }}
                      data-reveal="rise"
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "baseline",
                          gap: "var(--sp-3)",
                          marginBottom: "var(--sp-3)",
                        }}
                      >
                        <span className="nt-mission__idx" style={{ paddingTop: 0 }}>
                          {String(l.n).padStart(2, "0")}
                        </span>
                        <h2
                          style={{
                            margin: 0,
                            fontSize: "var(--fs-lg)",
                            fontWeight: 600,
                            letterSpacing: "-0.01em",
                          }}
                        >
                          {l.title}
                        </h2>
                      </div>

                      <p className="nt-prose" style={{ paddingLeft: "3rem" }}>
                        {l.body}
                      </p>

                      {l.points ? (
                        <ul className="nt-mission__points" style={{ paddingLeft: "3rem" }}>
                          {l.points.map((p) => (
                            <li key={p}>
                              <span className="nt-mission__idx">·</span>
                              <span>{p}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}

                      {l.example ? (
                        <div className="nt-example" style={{ marginTop: "var(--sp-4)" }}>
                          <div className="nt-example__bar">
                            <span>{l.example.caption}</span>
                          </div>
                          <pre className="nt-example__body">
                            <code>
                              {l.example.lines.map((line, i) => (
                                <span key={i} className="nt-example__line">
                                  {line}
                                </span>
                              ))}
                            </code>
                          </pre>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>

                {/* Prerequisites */}
                <div className="nt-panel" data-reveal="rise">
                  <div className="nt-panel__bar">
                    <span className="nt-sec-head__path">before you start</span>
                  </div>
                  <div className="nt-panel__body">
                    <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--fg-muted)" }}>
                      {content.prerequisites.map((p) => (
                        <li
                          key={p}
                          style={{ marginBottom: "var(--sp-2)", fontSize: "var(--fs-sm)" }}
                        >
                          {p}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* ---- The buy column ---- */}
              <aside className="nt-detail__aside">
                <div className="nt-panel nt-glass" data-reveal="rise">
                  <div className="nt-panel__bar">
                    <span className="nt-sec-head__path">{mod.code}</span>
                  </div>
                  <div className="nt-panel__body">
                    <div
                      style={{
                        fontSize: "2rem",
                        fontWeight: 700,
                        letterSpacing: "-0.03em",
                        lineHeight: 1,
                      }}
                    >
                      {formatZar(mod.priceCents)}
                    </div>
                    <p className="nt-note" style={{ marginTop: "var(--sp-2)" }}>
                      one module, one semester. the notes stay yours.
                    </p>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "var(--sp-2)",
                        marginTop: "var(--sp-5)",
                      }}
                    >
                      {isOwned ? (
                        <span className="nt-badge nt-badge--ok">you own this</span>
                      ) : trial !== undefined ? (
                        user ? (
                          <a className="nt-btn" href={trial.path} rel="noreferrer">
                            preview the sample
                          </a>
                        ) : (
                          <span className="nt-gate">sign in to preview the sample</span>
                        )
                      ) : null}

                      {sold && !isOwned ? (
                        user ? (
                          <>
                            <span className="nt-btn nt-btn--off" aria-disabled="true">
                              buy this module
                            </span>
                            <p className="nt-note">
                              Checkout is not wired up yet — no payment provider is connected.
                              Tracked in IDEAS/TODO.md.
                            </p>
                          </>
                        ) : (
                          <>
                            <span className="nt-gate">sign in to buy</span>
                            <p className="nt-note">
                              An account is all it takes. No card until you actually buy
                              something.
                            </p>
                          </>
                        )
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Contents — only worth showing on a written module */}
                <div className="nt-panel" data-reveal="rise">
                  <div className="nt-panel__bar">
                    <span className="nt-sec-head__path">contents</span>
                    <span>{content.lessons.length} sections</span>
                  </div>
                  <div className="nt-panel__body">
                    <nav className="nt-toc" aria-label="On this page">
                      {content.lessons.map((l) => (
                        <a key={l.n} href={`#lesson-${l.n}`}>
                          <span className="nt-toc__n">{String(l.n).padStart(2, "0")}</span>
                          <span>{l.title}</span>
                        </a>
                      ))}
                    </nav>
                  </div>
                </div>

                {/* Back into the catalogue */}
                <div className="nt-panel" data-reveal="rise">
                  <div className="nt-panel__bar">
                    <span className="nt-sec-head__path">also in the catalogue</span>
                  </div>
                  <div className="nt-panel__body" style={{ padding: 0 }}>
                    {siblings.map((m) => (
                      <Link
                        key={m.code}
                        href={`/modules/${m.code}`}
                        className="nt-drow"
                        style={{ textDecoration: "none" }}
                      >
                        <span>
                          <span className="nt-drow__t" style={{ color: "var(--accent-b)" }}>
                            {m.code}
                          </span>
                          <span className="nt-drow__d">{m.name}</span>
                        </span>
                        <span className="nt-badge nt-badge--soon">
                          {m.status === "available" ? "available" : "soon"}
                        </span>
                      </Link>
                    ))}
                  </div>
                </div>
              </aside>
            </div>
          )}
        </div>
      </main>

      <footer className="nt-footer">
        <Link href="/modules">back to all modules</Link> · built by a first year CS student at NMU
      </footer>
    </div>
  );
}