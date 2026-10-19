import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Playfair_Display } from "next/font/google";

import "../index.css";
// The design tokens come first so landing.css and app.css both read
// the same variables off .nt-root regardless of bundle order.
import "../styles/palettes.generated.css";
import "../styles/tokens.css";
import "../styles/app.css";
import Providers from "@/components/providers";
import PwaRegistration from "@/components/pwa-registration";
import FontGuard from "@/components/font-guard";

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
          THE REVEAL GATE IS CSS-ONLY NOW.

          The gate used to be a <script> that added `.js-reveal` to <html>
          before first paint, gating the hide of [data-reveal] content.
          React 19 refuses to render a <script> as a component child and
          warns on every load, and the two supported next/script forms in
          this version of Next do not actually land a blocking script in
          <head> — one is serialised into the RSC flight payload (too
          late) and the other becomes a preload link (also too late). So
          the gate could not stay a script.

          It is now entirely in landing.css and app.css. [data-reveal]
          starts at low opacity and carries a three-second failsafe
          animation that forces it to full opacity. The failsafe is
          scoped to `html:not([data-reveal-ready])`, so it is dead as
          soon as ScrollReveal mounts and reports in; on a failed
          hydration nothing ever reports in, so it fires and the page is
          visible but un-animated instead of blank. No script, no class
          to coordinate, no console warning, and the hide is in effect
          from the very first frame because the rule lives in the
          stylesheet that is already in <head>.

          This does NOT mean the reveals are unconditional. Content
          stays dim until its block scrolls into view, which is the
          whole point of the effect. The failsafe is only the
          failure path.

          The exact selector shapes live in landing.css and app.css,
          and they are load-bearing in a way that is easy to undo by
          accident — read the note there before touching them.
        */}
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable} antialiased`}>
        <PwaRegistration />

        {/* Says so out loud when the webfonts did not load, which is a
            failure next/font handles by silently swapping in a system
            face. See the component for why it checks the way it does. */}
        <FontGuard />

        {/* The app shell (header + fixed-height grid) lives in the (app)
            route group, so the landing page at / can run full-bleed. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
