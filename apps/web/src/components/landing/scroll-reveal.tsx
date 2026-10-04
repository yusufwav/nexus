"use client";

import { useEffect } from "react";

/**
 * Scroll reveals
 * ------------------------------------------------------------
 * Ported from IDEAS/index.html. The page is a terminal, so content
 * arrives the way a terminal produces output rather than by sliding in
 * generically. Each element is tagged with a data-reveal effect and
 * re-runs every time it enters the viewport, so scrolling back up and
 * down replays the sequence instead of leaving static text.
 *
 *   wipe — a wipe-bar sweeps down, then the text lands
 *   rise — staggered lines lift into place
 *   scan — a scanline passes, then the block settles
 *
 * This component renders nothing; it just observes the subtree once
 * mounted and toggles the .is-in class the CSS is gated on.
 */
export default function ScrollReveal(): React.JSX.Element | null {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>(".nt-root");
    if (root === null) {
      return;
    }
    const items = Array.prototype.slice.call(
      root.querySelectorAll("[data-reveal]"),
    ) as HTMLElement[];

    if (items.length === 0) {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!("IntersectionObserver" in window) || reduced) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }

    // Lines inside an effect get their own stagger.
    items.forEach((el) => {
      el.classList.add("nt-rv-" + (el.dataset["reveal"] || "wipe"));
      const lines = el.querySelectorAll(".nt-rv-line");
      Array.prototype.forEach.call(lines, (ln: HTMLElement, i: number) => {
        ln.style.setProperty("--rv-i", String(i));
      });
    });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const el = e.target as HTMLElement;
        if (e.isIntersecting) {
          // Restart the animation even if it already ran, so the effect
          // replays on every pass.
          el.classList.remove("is-in");
          // Force a reflow so re-adding the class restarts the keyframes
          // instead of being coalesced away.
          void el.offsetWidth;
          el.classList.add("is-in");
        } else {
          // Leaving the viewport tears the state down, so the next entry
          // plays the whole sequence again rather than resuming
          // mid-way.
          el.classList.remove("is-in");
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -6% 0px" });

    items.forEach((el) => io.observe(el));

    return () => io.disconnect();
  }, []);

  return null;
}
