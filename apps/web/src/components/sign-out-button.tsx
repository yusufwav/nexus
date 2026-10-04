"use client";

import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

/**
 * SIGN OUT
 * Split out of user-menu.tsx so the dashboard's identity strip can
 * reuse the handler without pulling the whole dropdown along.
 */
export default function SignOutButton(): React.JSX.Element {
  const router = useRouter();

  return (
    <button
      type="button"
      className="nt-btn nt-btn--ghost"
      onClick={() => {
        authClient.signOut({
          fetchOptions: {
            onSuccess: () => {
              router.push("/");
              // The dashboard is server-rendered off the session, so
              // the tree has to be rebuilt rather than just navigated.
              router.refresh();
            },
          },
        });
      }}
    >
      sign out
    </button>
  );
}