"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { formatZar } from "@/lib/money";
import type { ModuleView } from "@/lib/modules";

export interface CatalogueRow extends ModuleView {
  /** The signed-in viewer has paid for this one. */
  readonly owned: boolean;
  /** There is a session at all, which is what unlocks the actions. */
  readonly signedIn: boolean;
}

/**
 * MODULE CATALOGUE
 * ------------------------------------------------------------
 * Public page. Prices and descriptions render for everyone; the two
 * gated actions — the trial preview and the purchase — become a
 * sign-in prompt when there is no session, so a logged-out visitor
 * can see what exists without seeing a button that would fail.
 *
 * This is a client component because the subject filter is
 * interactive. The data itself arrives as props from the server, so
 * nothing here fetches.
 */
export default function ModuleCatalogue({
  rows,
}: {
  readonly rows: ReadonlyArray<CatalogueRow>;
}): React.JSX.Element {
  const [subject, setSubject] = useState<string>("all");

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      const s = subjectFromCode(r.code);
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return [...counts.entries()];
  }, [rows]);

  const visible = useMemo(
    () => (subject === "all" ? rows : rows.filter((r) => subjectFromCode(r.code) === subject)),
    [rows, subject],
  );

  const available = rows.filter((r) => r.status === "available").length;
  const owned = rows.filter((r) => r.owned).length;

  return (
    <>
      <div className="nt-cat__meta">
        <span>{rows.length} modules</span>
        <span aria-hidden="true">·</span>
        <span>{available} available now</span>
        <span aria-hidden="true">·</span>
        <span>{rows.length - available} coming soon</span>
        {owned > 0 ? (
          <>
            <span aria-hidden="true">·</span>
            <span className="nt-cat__owned">{owned} in your account</span>
          </>
        ) : null}
      </div>

      <div className="nt-cat__filters" role="group" aria-label="Filter modules by subject">
        <button
          type="button"
          className="nt-chip"
          aria-pressed={subject === "all"}
          onClick={() => setSubject("all")}
        >
          all ({rows.length})
        </button>
        {subjects.map(([name, count]) => (
          <button
            key={name}
            type="button"
            className="nt-chip"
            aria-pressed={subject === name}
            onClick={() => setSubject(name)}
          >
            {name.toLowerCase()} ({count})
          </button>
        ))}
      </div>

      <div className="nt-cat">
        <div className="nt-cat__head" aria-hidden="true">
          <span>code</span>
          <span>module</span>
          <span>what it covers</span>
          <span style={{ textAlign: "right" }}>price</span>
          <span />
        </div>

        {visible.map((m) => (
          <Link key={m.code} className="nt-cat__row" href={`/modules/${m.code}`}>
            <span className="nt-cat__code">{m.code}</span>
            <span className="nt-cat__name">{m.name}</span>
            <p className="nt-cat__desc">{m.description}</p>
            <span className="nt-cat__price">{formatZar(m.priceCents)}</span>

            <span className="nt-cat__actions">
              {m.status === "coming-soon" ? (
                <span className="nt-badge nt-badge--soon">coming soon</span>
              ) : m.owned ? (
                <span className="nt-cat__owned">owned · open</span>
              ) : m.hasTrialPdf ? (
                m.signedIn ? (
                  <a className="nt-btn nt-btn--ghost" href="/api/trial">
                    preview
                  </a>
                ) : (
                  <span className="nt-gate">sign in to preview</span>
                )
              ) : null}

              {m.status === "available" && !m.owned ? (
                m.signedIn ? (
                  <span className="nt-btn nt-btn--off" aria-disabled="true">
                    buy
                  </span>
                ) : (
                  <span className="nt-gate">sign in to buy</span>
                )
              ) : null}
            </span>
          </Link>
        ))}
      </div>
    </>
  );
}

/** Mirrors subjectOf() in @/lib/modules, kept local so filtering
 *  needs no server round trip. */
function subjectFromCode(code: string): string {
  switch (code.slice(0, 4)) {
    case "MATT":
      return "Mathematics";
    case "MAPV":
      return "Applied Mathematics";
    case "WRAV":
    case "WRSC":
      return "Programming";
    case "WRFV":
      return "Fundamentals";
    case "STAS":
      return "Statistics";
    default:
      return "Other";
  }
}