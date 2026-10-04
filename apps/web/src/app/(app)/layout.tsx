import "@/styles/landing.css";

import Header from "@/components/header";

/**
 * The app shell for every route inside this group. It lives in the
 * (app) route group so the landing page at / and the full-bleed auth
 * screen at /login render without the header. Route groups do not
 * affect URLs — /ai is unchanged.
 *
 * Only /ai is left in this group now: the module pages and the whole
 * dashboard bring their own chrome, and the old fixed-height grid
 * would fight the dashboard's full-height glass console.
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="nt-app">
      <Header />
      <div className="nt-app__main">{children}</div>
    </div>
  );
}