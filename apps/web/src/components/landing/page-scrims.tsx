"use client";

import { useEffect } from "react";

/**
 * THE PAGE SCRIMS
 * ------------------------------------------------------------
 * A wash of the page's own background colour, over the top of a
 * section, so the section's heading is readable against the pixel
 * field behind it.
 *
 * The colour is the THEME's background, so it is different in every
 * palette and it is the right colour for the theme the reader is
 * actually wearing. Nothing here names a colour.
 *
 * WHY IT IS MEASURED RATHER THAN DECLARED
 * ------------------------------------------------------------
 * Because the four scrims end in four different places, and three
 * of those places are "the top of a glass panel" - which is a
 * position no CSS can name. A scrim that stops at the wrong
 * height either leaves the heading exposed or eats the panel
 * below it, and neither is something a fixed percentage can be
 * trusted to get right across fifty palettes and every screen
 * size.
 *
 * So each scrim names the element it ends at, and the height is
 * measured from it. The edge tells it which edge: the partner's
 * scrim stops at the TOP of its glass panel, because it is there
 * for the heading above it and the panel has its own glass.
 *
 * It re-measures on resize and whenever the page changes size,
 * because the font size, the viewport and the content all move
 * the target.
 */
export default function PageScrims(): null {
  useEffect(() => {
    const scrims = Array.from(
      document.querySelectorAll<HTMLElement>("[data-nt-scrim]"),
    );
    if (scrims.length === 0) return;

    const measure = (): void => {
      for (const scrim of scrims) {
        const host = scrim.parentElement;
        if (!host) continue;
        const selector = scrim.dataset.ntScrimEnd;
        const edge = scrim.dataset.ntScrimEdge ?? "bottom";
        // The LAST match, not the first. A selector that names a list -
        // the review cards - means the END of that list, and a selector
        // that names one thing means that thing.
        const matches = selector
          ? Array.from(host.querySelectorAll<HTMLElement>(selector))
          : [];
        const target = matches.length > 0 ? matches[matches.length - 1] : null;
        if (!target) {
          scrim.style.setProperty("--nt-scrim-h", "0px");
          continue;
        }
        const hostTop = host.getBoundingClientRect().top;
        const box = target.getBoundingClientRect();
        const end = edge === "top" ? box.top : box.bottom;
        scrim.style.setProperty(
          "--nt-scrim-h",
          `${Math.max(0, Math.round(end - hostTop))}px`,
        );
      }
    };

    measure();

    // The images and the fonts settle after the first paint, and both move
    // the target, so measure again once things have settled.
    const settle = window.setTimeout(measure, 400);

    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    window.addEventListener("resize", measure);
    window.addEventListener("load", measure);

    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("load", measure);
    };
  }, []);

  return null;
}
