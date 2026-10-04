import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/dashboard-shell";
import PlaceholderTile from "@/components/placeholder-tile";
import { contentFor } from "@/content/module-content";
import { formatZar } from "@/lib/money";
import { getOwnedCodes, listModules, subjectOf } from "@/lib/modules";
import { requireSession } from "@/lib/session";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "My modules · Nexus",
  description: "The modules you own, and where you are in each one.",
};

/**
 * MY MODULES — /dashboard/modules
 * ------------------------------------------------------------
 * Auth required. Purchased modules with their progress and downloads.
 *
 * Progress renders as a placeholder: there is no read-position table
 * yet, so every bar is empty rather than inventing a number.
 */
export default async function MyModulesPage(): Promise<React.JSX.Element> {
  const user = await requireSession("/dashboard/modules");

  const [all, owned] = await Promise.all([listModules(), getOwnedCodes(user.id)]);
  const mine = all.filter((m) => owned.has(m.code));
  const available = all.filter((m) => m.status === "available" && !owned.has(m.code));

  const TILES = [
    {
      glyph: "⇩",
      title: "Download",
      description: "Take a module offline as a zip or a PDF.",
      concept: "Sign a per-user URL so the notes cannot be passed around by link.",
    },
    {
      glyph: "↺",
      title: "Re-download",
      description: "Get the latest build of a module you already own.",
      concept: "Version the notes and always hand out the newest one.",
    },
    {
      glyph: "✎",
      title: "Your annotations",
      description: "Margin notes and highlights you made while reading.",
      concept: "Store notes against a lesson id and show them inline on re-read.",
    },
    {
      glyph: "◷",
      title: "Reading position",
      description: "Which section you were on when you last closed the tab.",
      concept: "One row per lesson with a timestamp, updated as you scroll.",
    },
  ];

  return (
    <DashboardShell user={user} active="/dashboard/modules">
      <div className="nt-pagehead">
        <div className="nt-pagehead__path">
          <b>~/nexus</b>
          <span>/dashboard/modules</span>
        </div>
        <h2 className="nt-pagehead__title">My modules</h2>
        <p className="nt-pagehead__lead">
          {mine.length === 0
            ? "Nothing owned yet. The catalogue is one click away."
            : `${mine.length} module${mine.length === 1 ? "" : "s"} in your account.`}
        </p>
      </div>

      {mine.length === 0 ? (
        <div className="nt-block" data-reveal="rise">
          <div className="nt-block__body">
            <p className="nt-note">
              Once you buy a module it appears here with your progress and its downloads. You do
              not have any yet — the notes are R50 each, and they are yours either way.
            </p>
            <div style={{ marginTop: "var(--sp-5)" }}>
              <Link className="nt-btn" href="/modules">
                open the catalogue
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <div data-reveal="rise">
          {mine.map((m) => {
            const content = contentFor(m.code);
            const total = content?.lessons.length ?? 0;

            return (
              <div key={m.code} className="nt-block" style={{ marginBottom: "var(--sp-4)" }}>
                <div className="nt-block__head">
                  <div>
                    <h3 className="nt-block__title" style={{ color: "var(--accent-b)" }}>
                      {m.code} · {m.name}
                    </h3>
                    <p className="nt-block__sub">
                      {subjectOf(m.code)} · {formatZar(m.priceCents)} · {total} sections
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "var(--sp-2)" }}>
                    <Link className="nt-btn nt-btn--ghost" href={`/modules/${m.code}`}>
                      open
                    </Link>
                    <span className="nt-btn nt-btn--off" aria-disabled="true">
                      download
                    </span>
                  </div>
                </div>

                <div className="nt-block__body">
                  {content === null ? (
                    <p className="nt-note">Content is not written yet.</p>
                  ) : (
                    <>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--sp-4)",
                          marginBottom: "var(--sp-4)",
                        }}
                      >
                        <span className="nt-label" style={{ minWidth: "8rem" }}>
                          progress
                        </span>
                        <div className="nt-seg" style={{ flex: 1 }} aria-hidden="true">
                          {content.lessons.map((l) => (
                            <span key={l.n} className="nt-seg__cell" />
                          ))}
                        </div>
                        <span className="nt-note">not tracked yet</span>
                      </div>

                      {content.lessons.map((l) => (
                        <div key={l.n} className="nt-lesson">
                          <span className="nt-lesson__n">{String(l.n).padStart(2, "0")}</span>
                          <span className="nt-lesson__title">
                            <b>{l.title}</b>
                          </span>
                          <span className="nt-lesson__meta">
                            <span className="nt-badge nt-badge--soon">not started</span>
                          </span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="nt-block" data-reveal="rise">
        <div className="nt-block__head">
          <div>
            <h3 className="nt-block__title">Library tools</h3>
            <p className="nt-block__sub">Concepts only — none of this is built.</p>
          </div>
        </div>
        <div className="nt-block__body">
          <div className="nt-tiles">
            {TILES.map((t) => (
              <PlaceholderTile key={t.title} {...t} />
            ))}
          </div>
        </div>
      </div>

      {available.length > 0 ? (
        <div className="nt-block" data-reveal="rise">
          <div className="nt-block__head">
            <h3 className="nt-block__title">Also finished, not yours yet</h3>
          </div>
          <div className="nt-block__body" style={{ padding: 0 }}>
            {available.map((m) => (
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
                <span className="nt-drow__actions">
                  <span className="nt-badge nt-badge--live">{formatZar(m.priceCents)}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </DashboardShell>
  );
}