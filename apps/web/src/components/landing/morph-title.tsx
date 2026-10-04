"use client";

import { useEffect, useRef } from "react";

export interface MorphTitleProps {
  readonly phrases: ReadonlyArray<string>;
}

/**
 * Morph text
 * ------------------------------------------------------------
 * Ported from IDEAS/index.html. Two phrases sharing ONE timeline
 * would cross-fade — both half visible at the midpoint, which reads as
 * a dissolve rather than a morph. To get a real hand-off, each phrase
 * gets its OWN cycle of length `total`, and the delay is staggered so
 * phrase n's hold ends exactly where phrase n+1's hold begins, plus
 * the --morph-stagger overlap that controls the gap between them.
 *
 *   0% .............. hold .............. 100%
 *   phrase 0:  [======= visible =======]...........
 *   phrase 1:  ................[======= visible =======]
 *
 * The keyframe percentages are computed from the CSS tokens so the
 * crossfade gap stays tunable from the top of landing.css.
 */
export default function MorphTitle({ phrases }: MorphTitleProps): React.JSX.Element {
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    const title = titleRef.current;
    if (title === null || phrases.length === 0) {
      return;
    }
    const words = Array.from(title.querySelectorAll<HTMLElement>("[data-morph-word]"));
    if (words.length === 0) {
      return;
    }
    const n = words.length;

    const host = document.querySelector<HTMLElement>(".nt-root");
    const cs = getComputedStyle(host ?? document.documentElement);
    const tok = (name: string): string => cs.getPropertyValue(name).trim();

    const interval = (Number.parseFloat(tok("--morph-interval")) || 2.6) * 1000;
    const stagger = Math.max(0, Math.min(0.98, Number.parseFloat(tok("--morph-stagger")) || 0));
    const blurIn = tok("--morph-blur-in") || "14px";
    const blurOut = tok("--morph-blur-out") || "16px";
    const scaleIn = tok("--morph-scale-in") || "0.88";
    const scaleOut = tok("--morph-scale-out") || "1.12";
    const grad = Number.parseFloat(tok("--grad-dur")) || 9;
    const gradHover = Number.parseFloat(tok("--grad-dur-hover")) || 2.6;

    // Each phrase owns a slot of 1/n of the cycle. Its fade-in and
    // fade-out together must fill exactly one interval, otherwise the
    // stops invert and both words sit on screen at once.
    //
    //   stagger 0    -> fade-in and fade-out are instant, so each
    //                    phrase simply replaces the last (hard cut)
    //   stagger 0.55 -> the outgoing phrase is still visible as the
    //                    incoming one arrives (a true dissolve)
    //   stagger 1    -> a full dissolve, never fully opaque
    const total = interval * n;
    const fade = stagger * interval; // each of fade-in/out
    const hold = interval - fade; // steady, fully opaque
    const fadeInEnd = (fade / total) * 100;
    const holdEnd = ((fade + hold) / total) * 100;

    // Build the opacity ramp. The mid stop only exists when there is a
    // fade to shape — at stagger 0 the ramp is a hard cut and three
    // stops would all collapse onto 0%, which is invalid CSS.
    const stops = [
      ` 0%   { opacity: 0; filter: blur(${blurIn}); transform: scale(${scaleIn}); }`,
    ];
    if (fadeInEnd > 0.5) {
      stops.push(` ${(fadeInEnd / 2).toFixed(2)}% { opacity: .5; }`);
      stops.push(` ${fadeInEnd.toFixed(2)}% { opacity: 1; filter: blur(0); transform: scale(1); }`);
      stops.push(` ${holdEnd.toFixed(2)}% { opacity: 1; filter: blur(0); transform: scale(1); }`);
    } else {
      stops.push(` ${holdEnd.toFixed(2)}% { opacity: 1; filter: blur(0); transform: scale(1); }`);
    }
    stops.push(` 100% { opacity: 0; filter: blur(${blurOut}); transform: scale(${scaleOut}); }`);

    // Rewrite the keyframes with the computed stops. The style element
    // is removed on cleanup so navigating away and back does not stack
    // up duplicate rules.
    const style = document.createElement("style");
    style.textContent = `@keyframes nt-morph-word-rotate {\n${stops.join("\n")}\n}`;
    document.head.appendChild(style);

    function apply(rate: number): void {
      words.forEach((w, i) => {
        // Two animations on one element: the morph and the gradient
        // flow. Declared in one shorthand so they stay in sync.
        w.style.animation =
          `nt-morph-word-rotate ${total * rate}ms linear ${i * interval * rate}ms infinite both, ` +
          `nt-grad-flow ${grad * rate}s linear infinite`;
      });
    }

    // Hovering tightens the morph and the gradient together, so the
    // whole line reacts at once.
    function onEnter(): void {
      const rate = 0.4;
      words.forEach((w, i) => {
        w.style.animation =
          `nt-morph-word-rotate ${total * rate}ms linear ${i * interval * rate}ms infinite both, ` +
          `nt-grad-flow ${gradHover * rate}s linear infinite`;
      });
    }

    function onLeave(): void {
      apply(1);
    }

    apply(1);
    title.addEventListener("mouseenter", onEnter);
    title.addEventListener("mouseleave", onLeave);

    return () => {
      title.removeEventListener("mouseenter", onEnter);
      title.removeEventListener("mouseleave", onLeave);
      style.remove();
    };
  }, [phrases]);

  return (
    <h1 className="nt-landing__title nt-landing__title--morph" id="morph-title" ref={titleRef}>
      {phrases.map((phrase) => (
        <span key={phrase} className="nt-morph__word nt-grad" data-morph-word>
          {phrase}
        </span>
      ))}
    </h1>
  );
}
