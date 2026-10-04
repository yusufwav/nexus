import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/dashboard-shell";
import PlaceholderTile from "@/components/placeholder-tile";
import { formatWhen, formatZar } from "@/lib/money";
import { listPurchases } from "@/lib/modules";
import { requireSession } from "@/lib/session";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Purchases · Nexus",
  description: "Your receipts and payment history.",
};

const BADGE = {
  paid: "nt-badge--ok",
  pending: "nt-badge--warn",
  refunded: "nt-badge--soon",
} as const;

/**
 * PURCHASES — /dashboard/purchases
 * ------------------------------------------------------------
 * The fourth sub-page: the receipt trail, split from "my modules"
 * so the two can grow independently.
 *
 * This table stays empty until checkout exists — no provider is
 * connected, so nothing writes a `paid` row. The query is real, so
 * once payments land the page fills in with no changes here.
 */
export default async function PurchasesPage(): Promise<React.JSX.Element> {
  const user = await requireSession("/dashboard/purchases");
  const purchases = await listPurchases(user.id);

  const paid = purchases.filter((p) => p.status === "paid");
  const total = paid.reduce((sum, p) => sum + p.amountCents, 0);

  const TILES = [
    {
      glyph: "⇩",
      title: "Download receipt",
      description: "A PDF per purchase, with your billing details on it.",
      concept: "Generate a VAT receipt server-side once billing details exist.",
    },
    {
      glyph: "↩",
      title: "Refund request",
      description: "Ask for a module back, and see what happens to access.",
      concept: "Flip the purchase to refunded and revoke the module.",
    },
    {
      glyph: "⧉",
      title: "Invoice a bundle",
      description: "One receipt covering several modules at once.",
      concept: "Group purchases into a single charge when the bundle is bought.",
    },
    {
      glyph: "⚑",
      title: "Report a problem",
      description: "Charged but not given, or charged twice.",
      concept: "Log a dispute against the provider reference for manual review.",
    },
  ];

  return (
    <DashboardShell user={user} active="/dashboard/purchases">
      <div className="nt-pagehead">
        <div className="nt-pagehead__path">
          <b>~/nexus</b>
          <span>/dashboard/purchases</span>
        </div>
        <h2 className="nt-pagehead__title">Purchases</h2>
        <p className="nt-pagehead__lead">
          {purchases.length === 0
            ? "Nothing here yet — checkout is not connected, so nothing can be bought."
            : `${purchases.length} purchase${purchases.length === 1 ? "" : "s"} on record.`}
        </p>
      </div>

      <div className="nt-stats" data-reveal="rise">
        <div className="nt-stat">
          <div className="nt-stat__k">lifetime spend</div>
          <div className="nt-stat__v">{formatZar(total)}</div>
          <div className="nt-stat__foot">{paid.length} completed</div>
        </div>
        <div className="nt-stat">
          <div className="nt-stat__k">modules bought</div>
          <div className="nt-stat__v">{paid.length}</div>
          <div className="nt-stat__foot">R50 each, notes included</div>
        </div>
      </div>

      <div className="nt-block" data-reveal="rise" style={{ marginTop: "var(--sp-5)" }}>
        <div className="nt-block__head">
          <h3 className="nt-block__title">History</h3>
          <span className="nt-badge nt-badge--warn">checkout not connected</span>
        </div>
        <div className="nt-block__body" style={{ padding: 0 }}>
          {purchases.length === 0 ? (
            <div style={{ padding: "var(--sp-5)" }}>
              <p className="nt-note">
                This table reads real data — it just has nothing in it yet. Payment is stubbed: the
                buy button on the catalogue is inert until a provider like Paystack or Yoco is
                wired up. Tracked in IDEAS/TODO.md.
              </p>
              <div style={{ marginTop: "var(--sp-5)" }}>
                <Link className="nt-btn nt-btn--ghost" href="/modules">
                  see the catalogue anyway
                </Link>
              </div>
            </div>
          ) : (
            purchases
              .slice()
              .reverse()
              .map((p) => (
                <div key={p.id} className="nt-drow">
                  <div>
                    <div className="nt-drow__t">
                      <span style={{ color: "var(--accent-b)" }}>{p.code}</span> · {p.name}
                    </div>
                    <div className="nt-drow__d">
                      {formatWhen(p.createdAt)} · ref {p.id.slice(0, 8)} · via {p.provider}
                    </div>
                  </div>
                  <div className="nt-drow__actions">
                    <span className={BADGE[p.status]}>{p.status}</span>
                    <span style={{ fontWeight: 700 }}>{formatZar(p.amountCents)}</span>
                  </div>
                </div>
              ))
          )}
        </div>
      </div>

      <div className="nt-block" data-reveal="rise">
        <div className="nt-block__head">
          <div>
            <h3 className="nt-block__title">Billing tools</h3>
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
    </DashboardShell>
  );
}