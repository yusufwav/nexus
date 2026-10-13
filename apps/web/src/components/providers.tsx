"use client";

import { Toaster } from "@Main/ui/components/sonner";

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
    >
      {children}
      {/* Applies the account's saved theme once the session resolves, and
          writes changes back. Renders nothing. */}
      <ThemeSync />
      <Toaster richColors />
    </ThemeProvider>
  );
}