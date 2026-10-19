"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SparklesIcon } from "lucide-react";

import ThemeToggle from "./theme-toggle";
import UserMenu from "./user-menu";

/**
 * THE APP HEADER
 * ------------------------------------------------------------
 * Was the cyan Better-TStack bar, then a row of paths. Restyled to
 * the terminal theme so the routes that still mount this shell (/ai and
 * /practice) match the rest of the product. The dashboard brings its own
 * header, so this is only used by routes inside the (app) group.
 *
 * THE PATH NAV IS GONE
 * ------------------------------------------------------------
 * It used to render five destinations: `~/`, `~/modules`, `~/dashboard`,
 * `~/practice`, and the tutor as a spark. All five are removed.
 *
 * The tutor button and the four paths were not removed because they
 * pointed anywhere unreachable - they were removed because on a page
 * whose entire subject IS the AI tutor, a nav offering "AI tutor" is the
 * page telling you where it is, and on /practice the same row was four
 * path-shaped labels over a question the reader was already answering.
 * The header's job on both routes is to get out of the way.
 *
 * NOTHING IS LOST, and the argument for that is not "they were
 * redundant", it is where each destination went:
 *
 *   · the tutor is one icon in the actions group on /practice, and on
 *     /ai it is absent because you are already there;
 *   · the dashboard, the modules list, the purchases, the settings and
 *     sign-out are all in `UserMenu`, which sits in that same actions
 *     group and is on both pages.
 *
 * So every destination this header used to offer is still one tap away,
 * and the row is three controls instead of eight.
 *
 * WHY THE MARK STAYS
 * ------------------------------------------------------------
 * `nexus_` is the only remaining route out of /ai and /practice toward
 * the landing page, and it is the product's home indicator on every
 * other surface. Removing it as well would leave a full-bleed chat with
 * no exit.
 */

/** True when the reader is already on the page this icon would link to. */
function isTutorRoute(pathname: string): boolean {
  return pathname === "/ai" || pathname.startsWith("/ai/");
}

export default function Header(): React.JSX.Element {
  const pathname = usePathname();

  return (
    <header className="nt-head">
      <Link className="nt-head__mark" href="/">
        nexus<span className="nt-caret">_</span>
      </Link>

      <div className="nt-head__actions">
        {/*
          THE TUTOR, IN THE ACTIONS GROUP.

          It was a path in a nav that no longer exists. It belongs here
          instead of being dropped, because /practice is the one page in
          the app with no other way to ask a question — and "still don't
          get it?" on an unanswered option is exactly the moment the
          tutor is worth opening.

          `nt-btn nt-btn--ghost nt-btn--icon` is the same glass square
          the catalogue page already uses for this control, rather than
          a bare path label, so it reads as an action beside the user
          menu and the theme toggle rather than as a destination among
          other destinations.

          Hidden on /ai itself. A button whose entire job is to take you
          to the page you are already on is noise, and on the one page
          where the tutor is the subject it is the most obvious noise of
          all.

          The visible text is an icon, so `aria-label` carries the name
          — an icon on its own announces nothing.
        */}
        {!isTutorRoute(pathname) && (
          <Link
            className="nt-btn nt-btn--ghost nt-btn--icon nt-head__tutor"
            href="/ai"
            aria-label="AI tutor"
            title="AI tutor"
          >
            <SparklesIcon aria-hidden="true" />
          </Link>
        )}

        {/*
          THE ACCOUNT SLOT IS `UserMenu`, ALWAYS — AND THAT IS THE FIX
          FOR A HYDRATION MISMATCH, NOT A SIMPLIFICATION.

          This header used to branch on the session itself:

              {session ? <UserMenu /> : <Link href="/login">sign in</Link>}

          which reads well and cannot work. The server has no session — it
          never runs the client fetch — so it rendered the "sign in" link,
          and if the client's first render had a session it rendered the
          menu instead. React reported a mismatch and threw the tree away.

          Gating that branch on `isPending` moved the problem rather than
          fixing it: `isPending` reads an external store, and a store that
          resolves while React is still walking the tree produces exactly
          the same mismatch. On /ai it did, every load — the chat is the
          biggest client tree in the app, so its fetch lands before
          hydration finishes. /practice and /ai share this header and
          practice was clean, which is exactly what makes this the kind of
          bug that gets reported as intermittent.

          Rendering `UserMenu` unconditionally removes the decision from
          here entirely: it already has a pending state, a signed-out
          state and a signed-in state, and it now waits for mount before
          choosing between them. This is also what `dashboard-shell.tsx`
          has always done, so the two surfaces that share this header stop
          behaving differently for no reason.

          THE COST, stated plainly: an anonymous visitor's server-rendered
          header shows `···` rather than "sign in" until hydration
          finishes. It was already showing a branch the server could not
          actually know, so this makes a flicker predictable rather than
          inventing one.
        */}
        <UserMenu />

        <ThemeToggle />
      </div>
    </header>
  );
}