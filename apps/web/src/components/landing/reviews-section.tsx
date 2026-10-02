import type { CSSProperties } from "react";

export interface Review {
  readonly id: string;
  readonly avatarInitials: string;
  readonly headline: string;
  readonly body: string;
  readonly rating: 1 | 2 | 3 | 4 | 5;
}

export interface ReviewsSectionProps {
  readonly reviews: ReadonlyArray<Review>;
}

function Stars({ rating }: { readonly rating: Review["rating"] }): React.JSX.Element {
  return (
    <div className="flex items-center gap-1" aria-label={rating + " out of 5 stars"}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          className={[
            "h-3.5 w-3.5",
            i <= rating ? "fill-[#00E5FF] text-[#00E5FF]" : "fill-transparent text-white/30",
          ].join(" ")}
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 2.5l2.95 6.6 7.05.65-5.3 4.85L18.3 22 12 18.2 5.7 22l1.6-7.4L2 9.75l7.05-.65L12 2.5z" />
        </svg>
      ))}
    </div>
  );
}

export default function ReviewsSection({ reviews }: ReviewsSectionProps): React.JSX.Element {
  const items: ReadonlyArray<Review> = [...reviews, ...reviews];
  const style: CSSProperties = { "--marquee-duration": "120s" } as CSSProperties;

  return (
    <section
      aria-labelledby="nexus-reviews-heading"
      className="relative w-full border-t border-white/10 bg-black px-6 py-20 text-white"
    >
      <div className="mx-auto max-w-6xl">
        <h2
          id="nexus-reviews-heading"
          className="font-helvetica text-center text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
        >
          What students are saying
        </h2>
        <p className="nexus-body mx-auto mt-3 max-w-xl text-center text-pretty text-white/65">
          Early feedback from first-year Computer Science students at NMU.
        </p>
      </div>

      <div className="nexus-marquee-mask mt-12 w-full overflow-hidden">
        <div className="nexus-marquee items-stretch gap-5 px-2" style={style}>
          {items.map((r, i) => (
            <article key={r.id + "-" + i} className="glass flex w-80 shrink-0 flex-col gap-3 p-6 text-white">
              <header className="flex items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#00E5FF]/40 bg-[#00E5FF]/10 font-helvetica text-xs font-bold text-[#00E5FF]"
                  aria-hidden="true"
                >
                  {r.avatarInitials}
                </span>
                <Stars rating={r.rating} />
              </header>
              <h3 className="font-helvetica text-base font-semibold leading-tight text-white">
                {r.headline}
              </h3>
              <p
                className="font-helvetica text-sm leading-relaxed text-white/75"
                style={{
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {r.body}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
