import Link from "next/link";

export interface ModuleEntry {
  readonly code: string;
  readonly name: string;
  readonly description: string;
}

export interface ModuleListProps {
  readonly title: string;
  readonly lead: string;
  readonly modules: ReadonlyArray<ModuleEntry>;
}

/**
 * MODULES — a file listing, deliberately NOT cards. Hovering a row
 * expands its description. Ported from IDEAS/index.html, where the rows
 * were injected from a JSON script tag; here they arrive as props so
 * the page renders them server-side instead of after hydration.
 *
 * Each row links to that module's detail page. The row is the link
 * rather than something inside it, so the whole line is one hit
 * target — which is why the description expands on hover rather than
 * living behind its own control.
 */
export default function ModuleList({
  title,
  lead,
  modules,
}: ModuleListProps): React.JSX.Element {
  return (
    <section className="nt-modules" id="modules" aria-label="Modules">
      <div className="nt-wrap">
        <div className="nt-sec-head" data-reveal="rise">
          <div className="nt-sec-head__bar">
            <span className="nt-sec-head__path">~/nexus</span>
            <span>/modules/</span>
          </div>
          <h2 className="nt-sec-head__title">{title}</h2>
          <p className="nt-sec-head__lead">{lead}</p>
        </div>
        <div className="nt-modlist">
          {modules.map((m) => (
            <Link
              key={m.code}
              className="nt-modlist__row nt-hoverable"
              href={`/modules/${m.code}`}
            >
              <span className="nt-modlist__code">{m.code}</span>
              <span className="nt-modlist__name">{m.name}</span>
              <span className="nt-modlist__status">open</span>
              <p className="nt-modlist__desc">{m.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
