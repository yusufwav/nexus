export interface ReviewEntry {
  readonly name: string;
  readonly module: string;
  readonly rating: number;
  readonly summary: string;
  readonly body: string;
}

export interface ReviewsListProps {
  readonly title: string;
  readonly lead: string;
  readonly reviews: ReadonlyArray<ReviewEntry>;
}

function Stars({ rating }: { readonly rating: number }): React.JSX.Element {
  return (
    <span className="nt-rev__stars" role="img" aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= rating ? undefined : "nt-off"}>
          ★
        </span>
      ))}
    </span>
  );
}

/**
 * REVIEWS — stacked cards, each revealing on its own. Ported from
 * IDEAS/index.html, where the rows were injected from a JSON script tag
 * after load.
 */
export default function ReviewsList({
  title,
  lead,
  reviews,
}: ReviewsListProps): React.JSX.Element {
  return (
    <section className="nt-reviews" id="reviews" aria-label="Reviews">
      <div className="nt-wrap nt-wrap--narrow">
        <div className="nt-sec-head" data-reveal="rise">
          <div className="nt-sec-head__bar">
            <span className="nt-sec-head__path">~/nexus</span>
            <span>/reviews</span>
          </div>
          <h2 className="nt-sec-head__title">{title}</h2>
          <p className="nt-sec-head__lead">{lead}</p>
        </div>

        {reviews.map((r) => (
          <div key={r.module + r.summary} className="nt-rev nt-glass nt-hoverable" data-reveal="rise">
            <div className="nt-rev__head">
              <span className="nt-rev__name">{r.name}</span>
              <span className="nt-rev__module">{r.module}</span>
              <Stars rating={r.rating} />
            </div>
            <div className="nt-rev__summary">{r.summary}</div>
            <p className="nt-rev__body">{r.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
