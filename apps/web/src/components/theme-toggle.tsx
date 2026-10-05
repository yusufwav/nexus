"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

/**
 * THEME TOGGLE
 * ------------------------------------------------------------
 * A three-state switch — light, dark, system — matching the
 * terminal vocabulary the rest of the chrome uses rather than the
 * shadcn dropdown this replaces. The site has two palettes (see
 * styles/tokens.css), so the control has to be able to say
 * "whatever the OS says" as well as name one outright.
 *
 * Nothing renders before mount: the stored theme is unknown until
 * next-themes has read localStorage, and rendering the wrong icon
 * first causes a hydration mismatch. Until then it reports dark,
 * the palette the product launched with.
 */
type Choice = "light" | "dark" | "system";

const NEXT: Record<Choice, Choice> = {
  system: "light",
  light: "dark",
  dark: "system",
};

const GLYPH: Record<Choice, string> = {
  light: "☀",
  dark: "☾",
  system: "⌘",
};

const LABEL: Record<Choice, string> = {
  light: "light",
  dark: "dark",
  system: "system",
};

export default function ThemeToggle(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current: Choice =
    mounted && (theme === "light" || theme === "dark" || theme === "system")
      ? theme
      : "dark";

  return (
    <button
      type="button"
      className="nt-theme-btn"
      onClick={() => {
        setTheme(NEXT[current]);
      }}
      title={`theme: ${LABEL[current]}`}
      aria-label={`Switch theme (currently ${LABEL[current]})`}
    >
      <span className="nt-theme-btn__glyph" aria-hidden="true">
        {GLYPH[current]}
      </span>
    </button>
  );
}