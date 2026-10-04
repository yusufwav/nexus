export interface PriceRow {
  readonly label: string;
  readonly amount: string;
  readonly badge?: string;
  readonly bundle?: boolean;
}

export interface PriceTableProps {
  readonly title: string;
  readonly rows: ReadonlyArray<PriceRow>;
  readonly footnote: string;
  readonly cta: Readonly<{ readonly label: string; readonly href: string }>;
}

/**
 * PRICING — a table view. The bundle row is the one loud treatment on
 * the page: a rotating conic ring, a breathing glow, and a sheen that
 * sweeps on hover. Wipe + per-row stagger. Ported from
 * IDEAS/index.html, plus a closing CTA the design did not have — it
 * left the pricing section with no way through to the app.
 */
export default function PriceTable({
  title,
  rows,
  footnote,
  cta,
}: PriceTableProps): React.JSX.Element {
  return (
    <section className="nt-pricing" id="pricing" aria-label="Pricing">
      <div className="nt-wrap nt-wrap--narrow">
        <div className="nt-sec-head" data-reveal="rise">
          <div className="nt-sec-head__bar">
            <span className="nt-sec-head__path">~/nexus</span>
            <span>/pricing</span>
          </div>
          <h2 className="nt-sec-head__title">{title}</h2>
        </div>

        <div className="nt-price-table nt-glass nt-hoverable" data-reveal="wipe">
          {rows.map((r) => (
            <div
              key={r.label}
              className={`nt-price-row nt-hoverable nt-rv-line${r.bundle === true ? " nt-price-row--bundle" : ""}`}
            >
              {r.bundle === true ? (
                <span className="nt-price-row__sheen" aria-hidden="true" />
              ) : null}
              <span className="nt-price-row__label">{r.label}</span>
              <span className="nt-price-row__amount">
                {r.badge !== undefined ? <small>{r.badge}</small> : null}
                {r.amount}
              </span>
            </div>
          ))}
        </div>
        <p className="nt-price-note">{footnote}</p>

        <div className="nt-landing__cta">
          <a className="nt-btn" href={cta.href}>
            {cta.label}
          </a>
        </div>
      </div>
    </section>
  );
}
