"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { DEFAULT_THEME, isTheme, nextTheme, themeGlyph, themeLabel } from "@/lib/themes";

/**
 * THEME TOGGLE
 * ------------------------------------------------------------
 * A cycling control — the next palette, then the one after that — matching
 * the terminal vocabulary the rest of the chrome uses rather than the
 * shadcn dropdown this replaces. The site has more than two palettes (see
 * styles/tokens.css), so the control has to be able to name "system" as
 * well as a specific palette, and reach all of them.
 *
 * DERIVED, NOT HARDCODED
 *
 * The cycle used to be a literal three-entry map. That was correct only for
 * three themes, and adding a fourth would not have thrown an error — the
 * button would simply have cycled light, dark, system forever, making the
 * new palette reachable only from the dashboard. The order now comes from
 * THEMES, so the button and the picker cannot disagree about what exists.
 *
 * Nothing renders before mount: the stored theme is unknown until
 * next-themes has read localStorage, and rendering the wrong icon first
 * causes a hydration mismatch. Until then it reports light, which is the
 * same default ThemeProvider is given, so the pre-mount icon and the first
 * painted palette agree.
 */
export default function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted && isTheme(theme) ? theme : DEFAULT_THEME;

  return (
    <button
      type="button"
      className="nt-theme-btn"
      onClick={() => {
        setTheme(nextTheme(current));
      }}
      title={`theme: ${themeLabel(current)}`}
      aria-label={`Switch theme (currently ${themeLabel(current)})`}
    >
      <span className="nt-theme-btn__glyph" aria-hidden="true">
        {themeGlyph(current)}
      </span>
    </button>
  );
}