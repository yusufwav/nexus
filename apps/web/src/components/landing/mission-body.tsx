export interface MissionBodyProps {
  readonly introLine: string;
  readonly contextParagraph: string;
  readonly points: ReadonlyArray<{ readonly title: string; readonly body: string }>;
  readonly closingParagraph: string;
}

export default function MissionBody({
  introLine,
  contextParagraph,
  points,
  closingParagraph,
}: MissionBodyProps): React.JSX.Element {
  return (
    <section
      aria-labelledby="nexus-mission-heading"
      className="relative w-full bg-black px-6 py-24 text-white sm:py-32"
    >
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-8 text-center">
        <h2
          id="nexus-mission-heading"
          className="font-helvetica text-3xl font-bold leading-tight tracking-tight sm:text-4xl"
        >
          {introLine}
        </h2>

        <p className="nexus-body text-pretty text-white/75">{contextParagraph}</p>

        <ol className="nexus-numbered mt-6 flex w-full max-w-2xl flex-col gap-12">
          {points.map((p) => (
            <li key={p.title}>
              <h3 className="font-helvetica text-base font-bold uppercase tracking-[0.22em] text-white">
                {p.title}
              </h3>
              <p className="nexus-body mx-auto mt-3 max-w-xl text-pretty text-white/80">{p.body}</p>
            </li>
          ))}
        </ol>

        <p className="nexus-body mt-10 max-w-2xl text-pretty text-white/80">{closingParagraph}</p>
      </div>
    </section>
  );
}
