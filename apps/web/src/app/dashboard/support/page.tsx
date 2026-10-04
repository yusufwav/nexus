import type { Metadata } from "next";
import Link from "next/link";

import DashboardShell from "@/components/dashboard-shell";
import ImprovementForm from "@/components/landing/improvement-form";
import PlaceholderTile from "@/components/placeholder-tile";
import { requireSession } from "@/lib/session";

import "@/styles/landing.css";

export const metadata: Metadata = {
  title: "Support · Nexus",
  description: "Get help, report a problem, or tell me what to fix.",
};

const FAQ = [
  {
    q: "I paid and I still cannot see the notes.",
    a: "Checkout is not connected yet, so nothing can actually be charged. If you are reading this after money moved, email me directly and I will sort it out by hand.",
  },
  {
    q: "Do I keep the notes if I stop paying?",
    a: "Yes. They are yours once bought. There is no subscription and nothing expires.",
  },
  {
    q: "Can I share them with a classmate?",
    a: "Please do not — a handful of buyers is the only reason the price can stay at R50. If the price is the problem, tell me and I will look at a bundle.",
  },
  {
    q: "Why is only MATT101 ready?",
    a: "I write them one at a time and I am also sitting the exams. The order follows what I am actually studying. Tell me what you need next and I will move it up.",
  },
  {
    q: "The AI partner gave me a wrong answer.",
    a: "Tell me which module and which section. That is exactly what the form below is for, and I fix it in the source notes rather than patching the prompt.",
  },
] as const;

/**
 * SUPPORT — /dashboard/support
 * ------------------------------------------------------------
 * Three ways to get help: an FAQ, the same improvement form the
 * public catalogue uses, and placeholders for what a real support
 * system would have.
 *
 * The form is the placeholder one — it validates and confirms, and
 * sends nothing. See IDEAS/TODO.md.
 */
export default async function SupportPage(): Promise<React.JSX.Element> {
  const user = await requireSession("/dashboard/support");

  const TILES = [
    {
      glyph: "✉",
      title: "Email support",
      description: "A real inbox with a real reply time.",
      concept: "Pick an address and a provider, then route messages into it.",
    },
    {
      glyph: "◔",
      title: "Report a bug",
      description: "Something on this site is broken.",
      concept: "Capture the route, the browser, and the error into a report.",
    },
    {
      glyph: "⌸",
      title: "Report a wrong answer",
      description: "The AI partner said something incorrect.",
      concept: "Tie the chat turn to the module section so the fix lands in the notes.",
    },
    {
      glyph: "⌨",
      title: "Keyboard shortcuts",
      description: "Jump between modules, search, and open the partner.",
      concept: "A shortcuts dialog bound to the keys it names.",
    },
  ];

  return (
    <DashboardShell user={user} active="/dashboard/support">
      <div className="nt-pagehead">
        <div className="nt-pagehead__path">
          <b>~/nexus</b>
          <span>/dashboard/support</span>
        </div>
        <h2 className="nt-pagehead__title">Support</h2>
        <p className="nt-pagehead__lead">
          The short answers first. Anything else goes in the form at the bottom — which is a
          placeholder, so it does not send yet.
        </p>
      </div>

      <div className="nt-split">
        <div className="nt-block" data-reveal="rise" style={{ margin: 0 }}>
          <div className="nt-block__head">
            <h3 className="nt-block__title">Common questions</h3>
          </div>
          <div className="nt-block__body">
            {FAQ.map((f) => (
              <div
                key={f.q}
                style={{ padding: "var(--sp-4) 0", borderBottom: "1px solid var(--line-soft)" }}
              >
                <div style={{ fontSize: "var(--fs-sm)", color: "var(--fg)", marginBottom: 6 }}>
                  {f.q}
                </div>
                <p className="nt-note" style={{ margin: 0 }}>
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="nt-block" data-reveal="rise" style={{ margin: 0 }}>
          <div className="nt-block__head">
            <h3 className="nt-block__title">Other ways to reach me</h3>
          </div>
          <div className="nt-block__body">
            <div className="nt-tiles">
              {TILES.map((t) => (
                <PlaceholderTile key={t.title} {...t} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div
        className="nt-sec-head"
        data-reveal="rise"
        style={{ marginTop: "var(--sp-8)", marginBottom: "var(--sp-5)" }}
      >
        <div className="nt-sec-head__bar">
          <span className="nt-sec-head__path">~/nexus</span>
          <span>/support</span>
        </div>
        <h3 className="nt-sec-head__title" style={{ fontSize: "var(--fs-h2)" }}>
          Tell me what to fix
        </h3>
        <p className="nt-sec-head__lead">
          Wrong answer, unclear explanation, missing topic — all of it helps. This is the same form
          as on the{" "}
          <Link href="/modules" style={{ color: "var(--accent-b)" }}>
            modules page
          </Link>
          .
        </p>
      </div>

      <div className="nt-panel nt-glass" data-reveal="wipe">
        <div className="nt-panel__bar">
          <span className="nt-sec-head__path">~/support</span>
          <span>placeholder</span>
        </div>
        <div className="nt-panel__body">
          <ImprovementForm />
        </div>
      </div>
    </DashboardShell>
  );
}