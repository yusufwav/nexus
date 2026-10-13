"use client";

import { useTheme } from "next-themes";
import { useCallback, useEffect, useRef, useState } from "react";

import CenteredSelect from "@/components/centered-select";
import { authClient } from "@/lib/auth-client";
import { setPreviewing } from "@/lib/theme-preview";
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme, themeLabel } from "@/lib/themes";

/**
 * APPEARANCE - THEME PICKER
 * ------------------------------------------------------------------------
 * A real setting, unlike its neighbours on this page. It reads the current
 * choice from next-themes and writes it to the reader's account, which is
 * what makes it survive signing out and signing back in, and follow it to
 * another device.
 *
 * WHY CenteredSelect RATHER THAN A RADIO GROUP
 *
 * It was a radio grid, which is fine for three themes and absurd for
 * thirty-one. Thirty stacked rows is a scroll, and a scroll hides the point
 * of a palette picker: you cannot compare thirty things you cannot see. The
 * centered dropdown puts every option in the same reachable place whatever
 * the trigger position, which is the same reason the model picker uses it,
 * and it comes with the keyboard wiring, focus return and Escape handling
 * that a native <select> would have provided free.
 *
 * WHY HOVERING PREVIEWS, AND WHY THAT IS DANGEROUS
 *
 * Previewing on hover is the only practical way to choose between this many
 * palettes. It is also a change to the theme that the saving layer cannot
 * distinguish from a real choice - so it is gated in lib/theme-preview.ts,
 * and cancelling restores the theme that was actually chosen rather than
 * leaving the page wearing whatever the pointer left behind.
 *
 * PREVIEW FOLLOWS THE KEYBOARD TOO
 *
 * onPreview fires from the highlighted option, not from onMouseEnter, so
 * arrowing through the list previews as well. A preview that only worked with
 * a mouse would be the one control in the app unusable without one.
 *
 * NOTHING IS SAVED WHEN SIGNED OUT
 *
 * next-themes still applies a theme locally, because that works and a visitor
 * should not be told they cannot pick a colour. It simply is not persisted
 * anywhere beyond this browser, which is what the copy below says.
 */
export function ThemePicker(): React.JSX.Element {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "failed">("idle");

  /*
   * The theme to go back to when a preview is cancelled.
   *
   * Captured when the picker opens rather than read at cancel time, because by
   * then `theme` is whatever was last previewed and would restore the preview
   * instead of undoing it.
   */
  const committed = useRef<ReturnType<typeof resolveTheme>>(DEFAULT_THEME);

  useEffect(() => setMounted(true), []);

  // Never leave the flag set if the panel unmounts while previewing.
  useEffect(() => () => setPreviewing(false), []);

  const current = mounted && isTheme(theme) ? theme : DEFAULT_THEME;

  const options = THEMES.map((t) => ({ value: t.id, label: t.label, hint: t.hint }));

  const onPreview = useCallback(
    (next: string | null) => {
      if (next === null) {
        // Cancelled: put back what was actually chosen.
        setPreviewing(false);
        setTheme(committed.current);
        return;
      }
      // Order matters. The flag has to be set before the state change, because
      // ThemeSync's save effect runs after it and would otherwise commit the
      // preview it is supposed to be ignoring.
      setPreviewing(true);
      if (next !== theme) setTheme(next);
    },
    [setTheme, theme],
  );

  function choose(id: string): void {
    const chosen = resolveTheme(id);
    committed.current = chosen;

    // Commit before clearing the flag, so the resulting theme change is seen
    // as a real choice and is allowed to save.
    setPreviewing(false);
    setTheme(chosen);
    setSaved("idle");

    if (!session?.user) {
      // Applied locally by next-themes, kept in this browser only.
      return;
    }
    void authClient
      .updateUser({ theme: chosen })
      .then(({ error }) => setSaved(error ? "failed" : "ok"))
      .catch(() => setSaved("failed"));
  }

  /*
   * "system" is not a palette, it is an instruction. Saying what it resolves
   * to is the difference between a reader who chose "match system" knowing
   * they are on light, and one who has to go and check their OS.
   */
  const described =
    current === "system"
      ? `currently ${resolvedTheme === "dark" ? "dark" : "light"}`
      : null;

  return (
    <div className="nt-theme-picker">
      <div className="nt-theme-picker__legend">
        theme
        {described && <span className="nt-theme-picker__note">{described}</span>}
      </div>

      <CenteredSelect
        label={themeLabel(current)}
        value={current}
        options={options}
        listLabel="Theme"
        onChange={choose}
        onPreview={onPreview}
      />

      <p className="nt-theme-picker__status" role="status">
        {isPending
          ? null
          : saved === "ok"
            ? "saved to your account"
            : saved === "failed"
              ? "could not save — your browser will remember for now"
              : session?.user
                ? "applies on every device you sign in on"
                : "sign in to keep this across devices"}
      </p>
    </div>
  );
}