"use client";

import { useEffect } from "react";

/**
 * A LOUD WARNING WHEN THE FONTS DID NOT LOAD
 * ------------------------------------------------------------
 * next/font/google downloads the font files from Google Fonts at BUILD
 * time. When that download fails it does not fail the build — it falls
 * back to a system face and logs a WARN to a file nobody opens:
 *
 *   Failed to download Playfair Display from Google Fonts.
 *   Using a fallback font instead.
 *
 * The site then renders in Arial instead of Inter, in Times instead of
 * Playfair, and nothing on the page says so. It looks like a design
 * change rather than a broken download, which is how a dev server that
 * started on a bad network minute can sit there for two days quietly
 * serving the wrong typography.
 *
 * That is exactly what happened here, so this guard exists to make the
 * next one loud.
 *
 * THE CHECK IS `document.fonts.load()`, NOT `document.fonts.check()`.
 * `check()` answers "is this font loaded right now", and a webfont that
 * no rendered text happens to use is never loaded — so `check()` reports
 * `false` for a perfectly healthy font. `load()` explicitly asks for the
 * font and RESOLVES WITH AN EMPTY ARRAY when no face matches, which is
 * the signal we want: next/font fell back, so the family was never
 * registered at all.
 *
 * DEV ONLY. In production the fonts are fetched at build time on Vercel,
 * where the download either works or the build says so.
 */
const FAMILIES = ["Inter", "JetBrains Mono", "Playfair Display"] as const;

export default function FontGuard(): null {
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;

    let cancelled = false;

    const run = async (): Promise<void> => {
      try {
        await document.fonts.ready;
      } catch {
        /* fonts.ready does not reject in practice; the checks below are the real test. */
      }
      if (cancelled) return;

      const missing: string[] = [];
      for (const family of FAMILIES) {
        try {
          const faces = await document.fonts.load(`16px "${family}"`);
          if (faces.length === 0) missing.push(family);
        } catch {
          missing.push(family);
        }
      }
      if (cancelled || missing.length === 0) return;

      console.error(
        `[fonts] THESE FONTS DID NOT LOAD: ${missing.join(", ")}\n` +
          `[fonts] next/font/google could not reach Google Fonts, so the page is ` +
          `[fonts] rendering in a system fallback — not the design.\n` +
          `[fonts] Fix: stop the dev server and start it again. The download is ` +
          `[fonts] retried on start, and the fallback is cached until then.`,
      );
    };

    // A short delay first: `fonts.ready` can resolve before the browser has
    // fetched a face that no visible text needed yet, and a false alarm is
    // worse than no alarm.
    const timer = setTimeout(() => void run(), 2500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return null;
}
