"use client";

import { Toaster } from "@Main/ui/components/sonner";

import { THEME_IDS } from "@/lib/themes";

import { ThemeProvider } from "./theme-provider";
import { ThemeSync } from "./theme-sync";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    /*
     * Light is the default. This value is used only when a visitor has no
     * stored preference AND no account preference - a first visit, or
     * anyone whose storage has been cleared.
     *
     * Three sources, consulted in this order:
     *
     *   1. localStorage, written by next-themes the moment they choose
     *   2. the signed-in account's saved theme, restored by <ThemeSync />
     *      once the session resolves
     *   3. this default
     *
     * So changing it here does not override anyone who has already picked a
     * theme; it only decides what someone who never has sees.
     *
     * enableSystem stays, because "system" is still one of the three states
     * the toggle offers. A reader whose OS is dark and who never touches
     * the toggle still follows their machine - until they sign in, at which
     * point the account preference wins over the OS.
     */
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
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
      {/* Applies the account's saved theme once the session resolves, and
          writes changes back. Renders nothing. */}
      <ThemeSync />
      <Toaster richColors />
    </ThemeProvider>
  );
}