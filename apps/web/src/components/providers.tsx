"use client";

import { Toaster } from "@Main/ui/components/sonner";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    /* Both palettes now exist (see styles/tokens.css), so a light OS
       setting can be honoured rather than pinned to dark. The toggle
       still names light and dark explicitly, and "system" tracks the
       OS from there. */
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
