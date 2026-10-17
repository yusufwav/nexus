"use client";

import { Toaster } from "@Main/ui/components/sonner";

import { DEFAULT_THEME, THEME_IDS } from "@/lib/themes";

import { ThemeProvider } from "./theme-provider";
import { ThemeSync } from "./theme-sync";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Dark is the default, and it is read from DEFAULT_THEME rather than typed
     * as a literal so this and every pre-mount fallback in ThemeToggle and
     * ThemePicker cannot drift apart. Those two components render a glyph
     * before next-themes has read storage; if this said "dark" and they said
     * "light", the first painted palette and the first painted icon would be
     * from two different themes for as long as storage took to answer.
     *
     * This value is used only when a visitor has no stored preference AND no
     * account preference AND has not pressed the header button - a first
     * visit, or anyone whose storage has been cleared.
     *
     * Three sources, consulted in this order:
     *
     *   1. the header button's override, in localStorage, if it has one
     *   2. next-themes' own storage, written by whoever called setTheme
     *   3. the signed-in account's saved theme, restored by <ThemeSync />
     *      once the session resolves
     *   4. this default
     *
     * So changing it here does not override anyone who has already picked a
     * theme; it only decides what someone who never has sees.
     *
     * enableSystem stays because "system" is still an option in the Settings
     * picker. It is NOT one of the header button's three states, contrary to
     * what this comment claimed for a while - headerThemes() returns light,
     * dark, and the reader's own theme, and nothing else. A reader on a dark
     * OS who has never chosen gets dark, because defaultTheme says so and not
     * because their machine says so.
     */
    <ThemeProvider
      attribute="class"
      defaultTheme={DEFAULT_THEME}
      enableSystem
      disableTransitionOnChange
      /*
       * Without this next-themes only knows how to remove "light" and "dark",
       * so switching between two of our own palettes left the previous one on
       * <html> as well as the new one - and the two then fought over .nt-root
       * at equal specificity, with source order deciding. THEME_IDS makes its
       * own remove-then-add do the right thing. See THEME_IDS in lib/themes.
       */
      themes={THEME_IDS}
    >
      {children}
      {/* Applies the account's default theme once the session resolves, unless
          the header button has overridden it. Renders nothing, and never
          writes. */}
      <ThemeSync />
      <Toaster richColors />
    </ThemeProvider>
  );
}