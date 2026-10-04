export interface AiMarqueeProps {
  readonly tags: ReadonlyArray<string>;
}

/**
 * MARQUEE — where AI is already used, scrolling past.
 *
 * The track is duplicated once so the -50% keyframe lands on a seam
 * that looks identical to the start, which is what makes the loop
 * invisible. Rendering the copy twice in JSX rather than cloning nodes
 * keeps it server-rendered; the second set is aria-hidden so screen
 * readers do not announce every tag twice.
 */
export default function AiMarquee({ tags }: AiMarqueeProps): React.JSX.Element {
  return (
    <section className="nt-ticker" aria-label="Where AI is already used">
      <div className="nt-marquee">
        <div className="nt-marquee__track">
          {tags.map((tag, i) => (
            <span key={`a-${i}`} className="nt-tag">
              {tag}
            </span>
          ))}
          {tags.map((tag, i) => (
            <span key={`b-${i}`} className="nt-tag" aria-hidden="true">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
