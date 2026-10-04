"use client";

import { Toaster } from "@Main/ui/components/sonner";

import { ThemeProvider } from "./theme-provider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    /* Dark only for now. The palette was designed against black and
       has no light counterpart yet, so `enableSystem` is off — a light
       OS setting must not half-apply. Both are in IDEAS/TODO.md. */
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
      <Toaster richColors />
    </ThemeProvider>
  );
}
