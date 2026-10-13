"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { DEFAULT_THEME, isTheme, nextTheme, themeGlyph, themeLabel } from "@/lib/themes";

/**
 * THEME TOGGLE
 * ------------------------------------------------------------------------
 * A small cycling control in the header, matching the terminal vocabulary the
 * rest of the chrome uses rather than the shadcn dropdown this replaces.
 *
 * THREE STATES, NOT THIRTY-THREE
 * ------------------------------------------------------------------------
 * It cycles light, dark, and the reader's own theme - and only those. There
 * are thirty-three palettes in the registry, but this button sits on every
 * page and has to be usable without looking: a cycle through the whole list
 * would put thirty-one clicks between light and dark, which is the journey
 * almost everyone takes. The full list is in Settings.
 *
 * It needs the session to know what "their" theme is, which is why this
 * component talks to authClient. Signed out, it offers two.
 *
 * DERIVED, NOT HARDCODED
 * ------------------------------------------------------------------------
 * The cycle was once a literal three-entry map, which was correct only for
 * three themes and became quietly wrong the moment a fourth existed - the
 * button would have cycled the same three forever. The set is now derived
 * from THEMES via headerThemes(), so the button and the picker cannot disagree
 * about what exists.
 *
 * Nothing renders before mount: the stored theme is unknown until next-themes
 * has read localStorage, and rendering the wrong icon first causes a hydration
 * mismatch. Until then it reports light, which is the same default
 * ThemeProvider is given, so the pre-mount icon and the first painted palette
 * agree.
 */
export default function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted && isTheme(theme) ? theme : DEFAULT_THEME;
  const saved = (session?.user as { theme?: unknown } | undefined)?.theme;

  return (
    <button
      type="button"
      className="nt-theme-btn"
      // Until the session resolves, cycle the two universal options. Acting on
      // a saved theme that may still be loading would make the button jump.
      onClick={() => {
        setTheme(nextTheme(current, isPending ? undefined : saved));
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