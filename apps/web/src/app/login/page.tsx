import type { Metadata } from "next";

import AuthCard from "@/components/landing/auth-card";
import GradientAscii from "@/components/landing/gradient-ascii";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Sign in · Nexus",
  description: "Sign in or create an account to unlock the Nexus study notes.",
};

/**
 * AUTH — /login
 * ------------------------------------------------------------
 * Full-bleed gradient field with the form floating on it as glass. This
 * page lives outside the (app) route group so it can run full-bleed like
 * the landing page, and it mounts .nt-root so the shared tokens,
 * .nt-glass and .nt-btn all apply.
 *
 * ScrollReveal is deliberately not mounted here: it targets content
 * you scroll down to, and this screen is entirely above the fold.
 */
export default function LoginPage(): React.JSX.Element {
  return (
    <div className="nt-root nt-auth">
      <GradientAscii />
      <div className="nt-auth__veil" aria-hidden="true" />
      <AuthCard />
    </div>
  );
}