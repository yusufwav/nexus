"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { writeQuickTheme } from "@/lib/theme-override";
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
 * WHAT IT REMEMBERS, AND WHAT IT DOES NOT
 * ------------------------------------------------------------------------
 * Pressing this writes the choice to localStorage under its own key and
 * touches NOTHING on the account. It used to overwrite the reader's default
 * theme - see lib/theme-override for why that was destructive and what the
 * two slots are for. The account's palette is reachable from here, because
 * the cycle includes it as its third stop, but arriving there is a press of
 * this button and not a change of preference.
 *
 * That is why writeQuickTheme runs on every press including the one that
 * lands on the reader's own theme: the key means "the reader has said which
 * one they want", and it must not mean "the reader has said something other
 * than their default" or the two cannot be told apart.
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
 * mismatch. Until then it reports DEFAULT_THEME, which is the same default
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
        const next = nextTheme(current, isPending ? undefined : saved);
        setTheme(next);
        writeQuickTheme(next);
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