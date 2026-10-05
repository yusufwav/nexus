import Link from "next/link";

import type { ModuleTopic } from "@/content/module-topics";
import { formatZar } from "@/lib/money";

export interface TopicListProps {
  readonly moduleCode: string;
  readonly topics: ReadonlyArray<ModuleTopic>;
  /** The module's price in cents, for the buy affordance. */
  readonly priceCents: number;
  /** The viewer has paid for the module: buy becomes download. */
  readonly owned: boolean;
  readonly signedIn: boolean;
}

/**
 * TOPICS — the module's notes, split into downloadable pieces.
 * ------------------------------------------------------------
 * Deliberately the same file-listing design as the landing page's
 * module list (component/landing/module-list.tsx): rows expand on
 * hover rather than sitting behind a disclosure, and they carry
 * .nt-hoverable for the lift. Same grid, same transitions, so it
 * reads as the same product rather than a second design language.
 *
 * Rows are NOT links here, unlike the landing list. A topic row is
 * not a page — it holds an action — so making the whole row a link
 * would put an <a> inside an <a>. The row carries tabIndex instead,
 * which also gives keyboard users the same hover-reveal the landing
 * list gives them through :focus-visible.
 *
 * The action is the pay-gate seam. Today it renders "buy", and once
 * `owned` is true the same slot becomes a download link to
 * /api/topics/<slug>. Nothing else has to change when checkout lands.
 */
export default function TopicList({
  moduleCode,
  topics,
  priceCents,
  owned,
  signedIn,
}: TopicListProps): React.JSX.Element | null {
  if (topics.length === 0) {
    return null;
  }

  return (
    <section className="nt-topics" aria-label={`${moduleCode} topics`}>
      <div className="nt-sec-head" data-reveal="rise">
        <div className="nt-sec-head__bar">
          <span className="nt-sec-head__path">~/modules/{moduleCode}</span>
          <span>/topics</span>
        </div>
        <h2 className="nt-sec-head__title">{topics.length} topics, one PDF each</h2>
        <p className="nt-sec-head__lead">
          Take the one you are stuck on instead of the whole module. Hover a row to see what it
          covers.
        </p>
      </div>

      <div className="nt-modlist" data-reveal="rise">
        {topics.map((t) => {
          // The gate, as one expression, so there is a single place to
          // look when checkout exists. Written? then signed in? then paid?
          const written = t.pdf !== null;
          const canDownload = written && owned;

          return (
            <div
              key={t.slug}
              className="nt-modlist__row nt-modlist__row--static nt-hoverable"
              tabIndex={0}
            >
              {/* The slug carries the download path, so it belongs in
                  the row, but it is longer than a course code and the
                  title is what a reader actually scans for. */}
              <span className="nt-modlist__code nt-topics__slug">{t.slug}</span>
              <span className="nt-modlist__name">{t.title}</span>
              <span className="nt-modlist__status">
                {t.pages === null ? "pdf" : `${t.pages} pages`}
              </span>

              {/* the action slot — the pay-gate seam */}
              <span className="nt-topics__action">
                {canDownload ? (
                  <a className="nt-btn nt-btn--ghost" href={`/api/topics/${t.slug}`} download>
                    download
                  </a>
                ) : !written ? (
                  <span className="nt-btn nt-btn--off" aria-disabled="true">
                    coming soon
                  </span>
                ) : signedIn ? (
                  <span className="nt-btn nt-btn--off" aria-disabled="true">
                    buy {formatZar(priceCents)}
                  </span>
                ) : (
                  <Link
                    className="nt-btn nt-btn--ghost"
                    href={`/login?next=/modules/${moduleCode}`}
                  >
                    buy {formatZar(priceCents)}
                  </Link>
                )}
              </span>

              <p className="nt-modlist__desc">{t.description}</p>
            </div>
          );
        })}
      </div>

      <p className="nt-note" style={{ marginTop: "var(--sp-4)" }}>
        Every topic on {moduleCode} unlocks with the module — one payment, all of them. Checkout is
        not wired up yet.
      </p>
    </section>
  );
}