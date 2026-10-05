import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";

import "../index.css";
// The design tokens come first so landing.css and app.css both read
// the same variables off .nt-root regardless of bundle order.
import "../styles/tokens.css";
import "../styles/app.css";
import Providers from "@/components/providers";
import PwaRegistration from "@/components/pwa-registration";

/* The landing page is built out of code rather than described in prose,
   so it needs the mono face as its body font and a serif for the
   gradient headline. Both are self-hosted by next/font — no render-time
   request to Google. */
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  style: ["italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Nexus",
  description: "Nexus tutoring platform",
};

export const viewport: Viewport = {
  // Paired so the browser chrome follows the palette: a black bar over
  // the light theme reads as a rendering fault, not a design.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f6" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          The scroll-reveal effects hide content with opacity: 0 until
          JS drives them, which meant a slow — or never — hydration left
          the page blank. This opts in to hiding only when the browser
          can run the reveal. It executes before first paint, so there
          is no flash; and the timer guarantees the page becomes visible
          again even if React never hydrates at all, which is what a
          cold load on a LAN address or a phone would otherwise hit.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'document.documentElement.classList.add("js-reveal");' +
              // If React never hydrates, nothing will ever remove
              // .js-reveal, so the reveal styles would hide the page for
              // good. The marker below is set by ScrollReveal on mount;
              // its absence means hydration failed, and hiding must be
              // undone. Runs inline and before first paint, so there is
              // no flash of visible content on a healthy load.
              'setTimeout(function(){if(!document.documentElement.dataset.revealReady)' +
              '{document.documentElement.classList.remove("js-reveal")}},3000)',
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable} antialiased`}>
        <PwaRegistration />

        {/* The app shell (header + fixed-height grid) lives in the (app)
            route group, so the landing page at / can run full-bleed. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
