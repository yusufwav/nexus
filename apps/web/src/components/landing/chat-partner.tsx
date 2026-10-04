export interface ChatMessage {
  readonly who: "student" | "partner";
  /** Split on "\n" and rendered as line breaks, as the design does. */
  readonly text: string;
}

export interface ChatPartnerProps {
  readonly title: string;
  readonly lead: string;
  readonly messages: ReadonlyArray<ChatMessage>;
  readonly footnote: string;
}

/**
 * PARTNER — a chat transcript, not a feature grid. Wipe + per-message
 * stagger, so the exchange lands turn by turn. Ported from
 * IDEAS/index.html.
 */
export default function ChatPartner({
  title,
  lead,
  messages,
  footnote,
}: ChatPartnerProps): React.JSX.Element {
  return (
    <section className="nt-partner" id="partner" aria-label="AI study partner">
      <div className="nt-wrap nt-wrap--narrow">
        <div className="nt-sec-head" data-reveal="rise">
          <div className="nt-sec-head__bar">
            <span className="nt-sec-head__path">~/nexus</span>
            <span>/partner</span>
          </div>
          <h2 className="nt-sec-head__title">{title}</h2>
          <p className="nt-sec-head__lead">{lead}</p>
        </div>

        <div className="nt-chat nt-glass nt-hoverable" data-reveal="wipe">
          {messages.map((m, i) => (
            <div
              key={i}
              className={`nt-chat__msg nt-rv-line${m.who === "partner" ? " nt-chat__msg--you" : ""}`}
            >
              <span className="nt-chat__who">{m.who}</span>
              <span className="nt-chat__text">
                {m.text.split("\n").map((line, j, all) => (
                  <span key={j}>
                    {line}
                    {j < all.length - 1 ? <br /> : null}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <p className="nt-price-note">{footnote}</p>
      </div>
    </section>
  );
}
