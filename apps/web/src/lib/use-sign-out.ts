"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * SIGN OUT
 * ------------------------------------------------------------
 * The sign-out handler, with no button attached.
 *
 * It is a hook rather than a component because the two places that
 * sign a user out want different *markup*: the dashboard's identity
 * strip wants a ghost button, and the user menu wants a dropdown item.
 * A shared <SignOutButton /> would have to be rendered inside a menu
 * item, which nests a button inside a button — the menu item is
 * already a focusable control, so that breaks keyboard navigation and
 * gives a screen reader two nested controls where one is meant. Sharing
 * the behaviour and letting each caller own the element is the way out.
 *
 * The refresh is not optional: the dashboard is a server component that
 * reads the session, so navigating away would otherwise leave the
 * cached server tree still holding the signed-in one. Both have to
 * happen.
 */
export default function useSignOut(): () => void {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return useCallback(() => {
    // The menu closes on click, so a second click before the request
    // settles would fire it twice. Neither caller disables its control,
    // so this is what makes a double-fire harmless.
    if (pending) {
      return;
    }
    setPending(true);

    void authClient
      .signOut({
        fetchOptions: {
          onSuccess: () => {
            router.push("/");
            // The dashboard is server-rendered off the session, so the
            // tree has to be rebuilt rather than just navigated.
            router.refresh();
          },
        },
      })
      // fetchOptions carries onSuccess only — there is no onError to
      // hook, so the failure path is read off the resolved result.
      // Without it `pending` would stay stuck true and the control
      // would be dead for the rest of the session.
      .then((result) => {
        if (result?.error) {
          setPending(false);
        }
      })
      .catch(() => {
        setPending(false);
      });
  }, [pending, router]);
}