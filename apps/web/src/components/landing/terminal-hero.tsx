export interface TerminalHeroProps {
  readonly tagline: ReadonlyArray<string>;
  readonly cta: Readonly<{ readonly label: string; readonly href: string }>;
}

/** A real MATLAB snippet. Showing the product beats describing it. */
const SNIPPET: ReadonlyArray<string> = [
  "// Simpson's rule: integral of sin(x) from 0 to pi",
  "function I = traps(a, b, n)",
  "    if mod(n, 2) ~= 0",
  '        error("n must be even");',
  "    end",
  "    h = (b - a) / n;",
  "    x = linspace(a, b, n + 1);",
  "    y = sin(x);",
  "",
  "    I = (h / 3) * (y(1) + y(end) ...",
  "            + 4 * sum(y(2:2:end-1)) ...",
  "            + 2 * sum(y(3:2:end-1)));",
  "end",
];

/**
 * HERO — a terminal session, then a syntax-highlighted snippet.
 * Ported from IDEAS/index.html. Wipe + per-line stagger, so the README
 * box and the code box both resolve line by line.
 */
export default function TerminalHero({
  tagline,
  cta,
}: TerminalHeroProps): React.JSX.Element {
  return (
    <section className="nt-hero" id="hero">
      <div className="nt-wrap">
        <div className="nt-term nt-glass nt-hoverable" data-reveal="wipe">
          <div className="nt-term__bar">
            <span className="nt-term__dot" />
            <span className="nt-term__dot" />
            <span className="nt-term__dot" />
            <span className="nt-term__title">nexus ~/zsh 120x40</span>
          </div>
          <div className="nt-term__body">
            <span className="nt-term__line nt-rv-line nt-t-com">
              # Computer Science, Nelson Mandela University
            </span>
            <span className="nt-term__line nt-term__prompt nt-rv-line">
              $ cat manifesto.md
            </span>
            <span className="nt-term__line nt-term__h1 nt-term__h1--sm nt-rv-line">
              the <em>readme</em>
            </span>
            {tagline.map((line) => (
              <span key={line} className="nt-term__line nt-term__out nt-rv-line">
                {line}
              </span>
            ))}
            {/* nt-term__cta is also a nt-term__line, so the CSS opts it
                back out of white-space: pre — otherwise the JSX
                indentation between the two links becomes real
                whitespace and pushes the second button onto its own row. */}
            <span className="nt-term__line nt-term__cta nt-rv-line">
              <a className="nt-btn" href={cta.href}>
                {cta.label}
              </a>
              <a className="nt-btn nt-btn--ghost" href="#mission">
                why this exists
              </a>
            </span>
          </div>
        </div>

        <div className="nt-sample nt-glass nt-hoverable" data-reveal="wipe">
          <div className="nt-sample__bar">
            <span>MATLAB / traps.m</span>
          </div>
          <pre className="nt-sample__body">
            <code>
              {SNIPPET.map((line, i) => (
                <span key={i} className="nt-sample__line nt-rv-line">
                  {highlight(line)}
                </span>
              ))}
            </code>
          </pre>
        </div>
      </div>
    </section>
  );
}

/* ============================================================
   TINY SYNTAX HIGHLIGHTER
   Regex-only, not a real parser. Enough to colour a short snippet
   convincingly without pulling in a dependency. Emits React nodes
   rather than HTML strings, so nothing is ever injected as markup.
   ============================================================ */

type TokenKind = "com" | "str" | "num" | "key" | "typ" | "fn" | "pun";

const RULES: ReadonlyArray<readonly [TokenKind, RegExp]> = [
  ["com", /\/\/[^\n]*/y],
  ["str", /"(?:[^"\\]|\\.)*"/y],
  ["num", /\b\d+(?:\.\d+)?\b/y],
  ["key", /\b(?:function|return|for|if|else|while|end)\b/y],
  ["typ", /\b(?:nargin|nargout|varargin|error|fprintf|linspace|length|size|zeros)\b/y],
  ["fn", /\b[a-zA-Z_]\w*(?=\s*\()/y],
  ["pun", /[{}();,.<>+\-*/=]/y],
];

function highlight(src: string): React.ReactNode {
  const out: React.ReactNode[] = [];
  let plain = "";
  let i = 0;
  let key = 0;

  const flush = (): void => {
    if (plain) {
      out.push(plain);
      plain = "";
    }
  };

  while (i < src.length) {
    let matched = false;
    for (const [kind, re] of RULES) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m !== null && m.index === i && m[0].length > 0) {
        flush();
        out.push(
          <span key={key++} className={`nt-t-${kind}`}>
            {m[0]}
          </span>,
        );
        i += m[0].length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += src[i];
      i += 1;
    }
  }
  flush();
  return out;
}
