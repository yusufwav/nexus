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
  themeColor: "#000000",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${jetbrainsMono.variable} ${playfair.variable} antialiased`}>
        <PwaRegistration />

        {/* The app shell (header + fixed-height grid) lives in the (app)
            route group, so the landing page at / can run full-bleed. */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
