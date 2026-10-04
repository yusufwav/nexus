export interface MissionPoint {
  readonly title: string;
  readonly body: string;
}

export interface MissionSectionProps {
  readonly paragraphs: ReadonlyArray<string>;
  readonly points: ReadonlyArray<MissionPoint>;
  readonly signature: string;
}

/**
 * MISSION — the "why this exists" block, laid out as prose plus a
 * numbered list. Each block reveals on its own so they load in
 * sequence as you scroll: reach point 02 and only what sits above it
 * has landed. Ported from IDEAS/index.html.
 */
export default function MissionSection({
  paragraphs,
  points,
  signature,
}: MissionSectionProps): React.JSX.Element {
  return (
    <section className="nt-mission" id="mission" aria-label="Why this exists">
      <div className="nt-wrap nt-wrap--narrow">
        <div className="nt-sec-head" data-reveal="rise">
          <div className="nt-sec-head__bar">
            <span className="nt-sec-head__path">~/nexus</span>
            <span>/README.md</span>
          </div>
          <h2 className="nt-sec-head__title">Why this exists</h2>
        </div>

        <div className="nt-mission__body">
          {paragraphs.map((p) => (
            <p key={p} data-reveal="rise">
              {p}
            </p>
          ))}
          <ul className="nt-mission__points">
            {points.map((p, i) => (
              <li key={p.title} data-reveal="rise">
                <span className="nt-mission__idx">{String(i + 1).padStart(2, "0")}</span>
                <span>
                  <strong>{p.title}</strong> {p.body}
                </span>
              </li>
            ))}
          </ul>
          <p data-reveal="rise">{signature}</p>
        </div>
      </div>
    </section>
  );
}
