import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/dashboard-shell";
import PlaceholderTile from "@/components/placeholder-tile";
import { contentFor } from "@/content/module-content";
import { formatWhen, formatZar } from "@/lib/money";
import { getOwnedCodes, listModules, listPurchases } from "@/lib/modules";
import { requireSession } from "@/lib/session";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Dashboard · Nexus",
  description: "Your Nexus account: modules, progress, and settings.",
};

/**
 * OVERVIEW — /dashboard
 * ------------------------------------------------------------
 * Auth required. The identity strip and the tab bar come from the
 * shell; everything below is this page.
 *
 * The numbers are real where they can be — modules owned, sections
 * reachable, money spent all come from the session and the database.
 * Everything under "what you can do from here" is a placeholder with
 * its concept written out, because none of it is built yet.
 */
export default async function DashboardPage(): Promise<React.JSX.Element> {
  const user = await requireSession("/dashboard");

  const [all, owned, purchases] = await Promise.all([
    listModules(),
    getOwnedCodes(user.id),
    listPurchases(user.id),
  ]);

  const myModules = all.filter((m) => owned.has(m.code));
  const ready = all.filter((m) => m.status === "available").length;
  const spent = purchases
    .filter((p) => p.status === "paid")
    .reduce((sum, p) => sum + p.amountCents, 0);

  // Counted from the module content so the figure tracks what is
  // actually written rather than a number typed into the page.
  const sections = myModules.reduce(
    (sum, m) => sum + (contentFor(m.code)?.lessons.length ?? 0),
    0,
  );

  const TILES = [
    {
      glyph: "▤",
      title: "Continue reading",
      description: "Pick up where you left off in a module you own.",
      concept: "Store a per-lesson read position and resume from it.",
    },
    {
      glyph: "◈",
      title: "Practice problems",
      description: "Worked problems per section, with your answers checked.",
      concept: "A question bank per lesson that marks answers against the worked solution.",
    },
    {
      glyph: "◑",
      title: "Study partner history",
      description: "Every conversation you have had with the AI tutor.",
      concept: "Persist chat threads so a session survives closing the tab.",
      href: "/ai",
    },
    {
      glyph: "⌗",
      title: "Weak spots",
      description: "Which sections you keep getting wrong, ranked.",
      concept: "Aggregate wrong answers per section and surface the worst three.",
    },
    {
      glyph: "⌸",
      title: "Spaced revision",
      description: "Cards from sections you have read, scheduled on a forgetting curve.",
      concept: "Turn each section into cards and schedule reviews from your answer history.",
    },
    {
      glyph: "◫",
      title: "Notes in your own words",
      description: "Write a summary of a section and get it checked against the source.",
      concept: "Accept a typed summary, compare it to the module content, flag gaps.",
    },
    {
      glyph: "✎",
      title: "Annotations",
      description: "Highlight and margin-note the notes without leaving the page.",
      concept: "Let you attach private notes to a section, stored per user and module.",
    },
    {
      glyph: "⇩",
      title: "Offline copies",
      description: "Download a module to read without a connection.",
      concept: "Serve a per-user zip of the notes, signed so it cannot be shared by URL.",
    },
  ];

  return (
    <DashboardShell user={user} active="/dashboard">
      <div className="nt-pagehead">
        <div className="nt-pagehead__path">
          <b>~/nexus</b>
          <span>/dashboard</span>
        </div>
        <h2 className="nt-pagehead__title">Overview</h2>
        <p className="nt-pagehead__lead">
          Where you are, and everything you can pick up from here.
        </p>
      </div>

      {/* ---- The numbers ---- */}
      <div className="nt-stats" data-reveal="rise">
        <div className="nt-stat">
          <div className="nt-stat__k">modules owned</div>
          <div className="nt-stat__v">
            {myModules.length}
            <small>of {all.length}</small>
          </div>
          <div className="nt-stat__foot">
            {myModules.length === 0 ? (
              <Link href="/modules" style={{ color: "var(--accent-b)" }}>
                browse the catalogue →
              </Link>
            ) : (
              `${ready} ready in the catalogue`
            )}
          </div>
        </div>

        <div className="nt-stat">
          <div className="nt-stat__k">sections in reach</div>
          <div className="nt-stat__v">{sections}</div>
          <div className="nt-stat__foot">
            {myModules.length === 0 ? "buy a module to unlock" : "across what you own"}
          </div>
        </div>

        <div className="nt-stat">
          <div className="nt-stat__k">progress</div>
          <div className="nt-stat__v">
            0<small>%</small>
          </div>
          {/* Placeholder: progress needs a read-position table. */}
          <div className="nt-stat__meter">
            <div className="nt-seg" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <span key={i} className="nt-seg__cell" />
              ))}
            </div>
          </div>
        </div>

        <div className="nt-stat">
          <div className="nt-stat__k">total spent</div>
          <div className="nt-stat__v">{formatZar(spent)}</div>
          <div className="nt-stat__foot">
            {purchases.length === 0 ? "no purchases yet" : "lifetime, notes included"}
          </div>
        </div>
      </div>

      {/* ---- Everything below is a placeholder ---- */}
      <div className="nt-block" data-reveal="rise" style={{ marginTop: "var(--sp-5)" }}>
        <div className="nt-block__head">
          <div>
            <h3 className="nt-block__title">What you can do from here</h3>
            <p className="nt-block__sub">
              Every tile below is a plan, not a feature. The concept line says what it would do.
            </p>
          </div>
          <span className="nt-badge nt-badge--warn">placeholders</span>
        </div>
        <div className="nt-block__body">
          <div className="nt-tiles">
            {TILES.map((t) => (
              <PlaceholderTile key={t.title} {...t} />
            ))}
          </div>
        </div>
      </div>

      {/* ---- Activity + owned modules ---- */}
      <div className="nt-split" style={{ marginTop: "var(--sp-4)" }}>
        <div className="nt-block" data-reveal="rise" style={{ margin: 0 }}>
          <div className="nt-block__head">
            <h3 className="nt-block__title">Recent activity</h3>
          </div>
          <div className="nt-block__body">
            {purchases.length === 0 ? (
              <p className="nt-note">Nothing yet. Buying a module will show up here.</p>
            ) : (
              <ul className="nt-feed">
                {purchases
                  .slice()
                  .reverse()
                  .slice(0, 5)
                  .map((p) => (
                    <li key={p.id}>
                      <span className="nt-feed__when">{formatWhen(p.createdAt)}</span>
                      <span className="nt-feed__what">
                        bought <b>{p.code}</b> — {formatZar(p.amountCents)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>

        <div className="nt-block" data-reveal="rise" style={{ margin: 0 }}>
          <div className="nt-block__head">
            <h3 className="nt-block__title">Your modules</h3>
            <Link
              className="nt-btn nt-btn--ghost"
              href="/dashboard/modules"
              style={{ padding: "var(--sp-2) var(--sp-3)", fontSize: "var(--fs-xs)" }}
            >
              open
            </Link>
          </div>
          <div className="nt-block__body" style={{ padding: 0 }}>
            {myModules.length === 0 ? (
              <div style={{ padding: "var(--sp-5)" }}>
                <p className="nt-note">
                  You have not bought anything yet. The catalogue is one click away.
                </p>
                <div style={{ marginTop: "var(--sp-4)" }}>
                  <Link className="nt-btn" href="/modules">
                    open the catalogue
                  </Link>
                </div>
              </div>
            ) : (
              myModules.map((m) => (
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
                  <span className="nt-badge nt-badge--ok">owned</span>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}