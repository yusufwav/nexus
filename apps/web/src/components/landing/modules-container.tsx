import type { CSSProperties } from "react";

export interface ModuleCard {
  readonly code: string;
  readonly name: string;
  readonly description: string;
}

export interface ModulesContainerProps {
  readonly heading: string;
  readonly pricingNotice: string;
  readonly modules: ReadonlyArray<ModuleCard>;
}

export default function ModulesContainer({
  heading,
  pricingNotice,
  modules,
}: ModulesContainerProps): React.JSX.Element {
  const split: ReadonlyArray<ReadonlyArray<ModuleCard>> = splitTwoRows(modules);

  return (
    <section
      aria-labelledby="nexus-modules-heading"
      className="relative w-full bg-black px-6 py-24 text-white"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <h2
          id="nexus-modules-heading"
          className="font-helvetica text-left text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
        >
          {heading}
        </h2>
        <p className="font-helvetica text-right text-sm uppercase tracking-[0.28em] text-[#00E5FF]">
          {pricingNotice}
        </p>
      </div>

      <div className="mt-12 flex flex-col gap-6">
        {split.map((row, rowIdx) => (
          <MarqueeRow
            key={rowIdx}
            modules={row}
            reverse={rowIdx % 2 === 1}
            duration={70 + rowIdx * 10}
          />
        ))}
      </div>
    </section>
  );
}

function MarqueeRow({
  modules,
  reverse,
  duration,
}: {
  readonly modules: ReadonlyArray<ModuleCard>;
  readonly reverse: boolean;
  readonly duration: number;
}): React.JSX.Element {
  const items: ReadonlyArray<ModuleCard> = [...modules, ...modules];
  const style: CSSProperties = { "--marquee-duration": duration + "s" } as CSSProperties;

  return (
    <div className="nexus-marquee-mask w-full overflow-hidden">
      <div
        className={["nexus-marquee items-stretch gap-5 px-2", reverse ? "nexus-marquee--reverse" : ""].join(" ")}
        style={style}
      >
        {items.map((m, i) => (
          <article key={m.code + "-" + i} className="glass flex w-72 shrink-0 flex-col gap-3 p-6 text-white">
            <span className="font-helvetica text-[11px] uppercase tracking-[0.32em] text-[#00E5FF]">
              {m.code}
            </span>
            <h3 className="font-helvetica text-lg font-semibold leading-tight text-white">{m.name}</h3>
            <p className="font-helvetica text-sm leading-relaxed text-white/70">{m.description}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

function splitTwoRows(modules: ReadonlyArray<ModuleCard>): ReadonlyArray<ReadonlyArray<ModuleCard>> {
  const even: ModuleCard[] = [];
  const odd: ModuleCard[] = [];
  modules.forEach((m, i) => {
    if (i % 2 === 0) {
      even.push(m);
    } else {
      odd.push(m);
    }
  });
  return [shuffle(even), shuffle(odd)];
}

function shuffle<T>(items: ReadonlyArray<T>): ReadonlyArray<T> {
  const arr: T[] = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp: T = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}
