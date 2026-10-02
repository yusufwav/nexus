import type { CSSProperties } from "react";

export interface TickerMarqueeProps {
  readonly items: ReadonlyArray<string>;
  readonly duration?: number;
  readonly reverse?: boolean;
}

export default function TickerMarquee({
  items,
  duration = 60,
  reverse = false,
}: TickerMarqueeProps): React.JSX.Element {
  const trackItems: ReadonlyArray<string> = [...items, ...items];
  const style: CSSProperties = { "--marquee-duration": duration + "s" } as CSSProperties;

  return (
    <div
      className="nexus-marquee-mask w-full overflow-hidden border-y border-white/10 bg-black py-3"
      aria-hidden="true"
    >
      <div
        className={[
          "nexus-marquee items-center gap-10 px-6 font-helvetica text-sm uppercase tracking-[0.28em] text-white/80",
          reverse ? "nexus-marquee--reverse" : "",
        ].join(" ")}
        style={style}
      >
        {trackItems.map((label, idx) => (
          <span key={idx + "-" + label} className="flex shrink-0 items-center gap-10 whitespace-nowrap">
            <span>{label}</span>
            <span className="text-[#00E5FF]">/</span>
          </span>
        ))}
      </div>
    </div>
  );
}
