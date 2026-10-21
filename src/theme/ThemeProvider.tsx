/**
 * THE THEME PROVIDER
 * ---------------------------------------------------------------------------
 * The web app's theme came from `next-themes` plus a CSS custom-property
 * cascade on `.nt-root`. There is no cascade here, so the theme is a plain
 * object held in React state and read through a context.
 *
 * The CHOICE is persisted in AsyncStorage, which is where the web app kept
 * it in `localStorage`.
 *
 * "Match system" resolves to the OS's own light/dark preference, which is
 * what `next-themes` did with its `system` entry.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";

import { DEFAULT_THEME_ID, resolveTheme, type Theme } from "@/theme/themes";
import { readReducedMotion, readThemeId, writeReducedMotion, writeThemeId } from "@/storage/settings";

export type ThemeContextValue = {
  /** The active theme, fully resolved. */
  readonly theme: Theme;
  /** The id the reader picked, which may be "system". */
  readonly themeId: string;
  readonly setThemeId: (id: string) => void;
  /** Whether the OS asks for reduced motion. */
  readonly reducedMotion: boolean;
  readonly setReducedMotion: (value: boolean) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const SYSTEM_THEME_ID = "system";

export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const system = useColorScheme();
  const [themeId, setThemeIdState] = useState<string>(DEFAULT_THEME_ID);
  const [reducedMotion, setReducedMotionState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, reduced] = await Promise.all([readThemeId(), readReducedMotion()]);
      if (cancelled) return;
      if (stored !== null) setThemeIdState(stored);
      setReducedMotionState(reduced);
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(id);
    void writeThemeId(id);
  }, []);

  const setReducedMotion = useCallback((value: boolean) => {
    setReducedMotionState(value);
    void writeReducedMotion(value);
  }, []);

  const theme = useMemo(() => {
    if (themeId === SYSTEM_THEME_ID) {
      return resolveTheme(system === "light" ? "light" : "dark");
    }
    return resolveTheme(themeId);
  }, [themeId, system]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, themeId, setThemeId, reducedMotion, setReducedMotion }),
    [theme, themeId, setThemeId, reducedMotion, setReducedMotion],
  );

  // Before the stored choice is read the app paints with the default theme
  // rather than flashing the system one and then jumping.
  void ready;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (ctx === null) {
    throw new Error("useTheme must be used inside a ThemeProvider");
  }
  return ctx;
}

/** Just the active theme, for the many components that only need colours. */
export function useActiveTheme(): Theme {
  return useTheme().theme;
}
