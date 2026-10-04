import Header from "@/components/header";

/**
 * The app shell for every route inside this group. It lives in the (app)
 * route group so the landing page at / can render full-bleed without the
 * header or the fixed viewport grid. Route groups do not affect URLs —
 * /login, /dashboard and /ai are unchanged.
 */
export default function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="grid h-svh grid-rows-[auto_1fr]">
      <Header />
      {children}
    </div>
  );
}
