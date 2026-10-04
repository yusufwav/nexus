export interface PlaceholderTileProps {
  readonly glyph: string;
  readonly title: string;
  /** What this is, plainly. */
  readonly description: string;
  /** The one-line concept of what it should do. Always shown. */
  readonly concept: string;
  /** Renders the tile as a live link instead of a disabled control. */
  readonly href?: string;
}

/**
 * A TILE ON THE DASHBOARD
 * ------------------------------------------------------------
 * Every feature on the dashboard is a placeholder. Each one carries
 * its own concept line — what the button is meant to do — so the
 * layout can be judged on its own before any of it is built.
 *
 * A tile without an href renders inert and says so: the cursor and
 * the hover lift both come off, so it stays obvious which parts of
 * the page are real and which are a plan.
 */
export default function PlaceholderTile({
  glyph,
  title,
  description,
  concept,
  href,
}: PlaceholderTileProps): React.JSX.Element {
  const inner = (
    <>
      <span className="nt-tile__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="nt-tile__t">{title}</span>
      <span className="nt-tile__d">{description}</span>
      <span className="nt-tile__concept">
        <b>concept · </b>
        {concept}
      </span>
    </>
  );

  if (href !== undefined) {
    return (
      <a className="nt-tile" href={href} style={{ textDecoration: "none" }}>
        {inner}
      </a>
    );
  }

  return (
    <button type="button" className="nt-tile nt-tile--soon" disabled>
      {inner}
    </button>
  );
}