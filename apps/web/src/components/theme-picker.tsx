"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import CenteredSelect from "@/components/centered-select";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme } from "@/lib/themes";

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
 * thirty-three. Thirty stacked rows is a scroll, and a scroll hides the point
 * of a palette picker: you cannot compare thirty things you cannot see. The
 * centered dropdown puts every option in the same reachable place whatever
 * the trigger position, which is the same reason the model picker uses it,
 * and it comes with the keyboard wiring, focus return and Escape handling
 * that a native <select> would have provided free.
 *
 * NO PREVIEW ON HOVER - TRIED, AND REMOVED
 * ------------------------------------------------------------------------
 * Moving the pointer over an option used to repaint the page in it, so a
 * palette could be judged before committing. It was a nice idea and it did
 * not work: next-themes writes the class onto <html>, so every hover restyled
 * the entire document - including the open panel's own backdrop, every
 * portal, and the scrollbar - and swapping thirty times in a few seconds made
 * the page visibly thrash. It read as a glitch rather than a feature.
 *
 * Worse, it had to be specially prevented from being saved, because a preview
 * is a theme change and ThemeSync saves theme changes. A second module
 * existed solely to keep the hover out of the database, which is a poor trade
 * for an effect that misbehaves.
 *
 * So the theme changes when the reader clicks, and only then.
 *
 * WHY THIS IS A .nt-switch-row AND NOT ITS OWN LAYOUT
 * ------------------------------------------------------------------------
 * It had a bespoke block with its own legend and its own status line, and it
 * rendered visibly wrong: both sat flush to the card's outer edge while every
 * neighbouring row indented to x≈71, so it read as though it belonged to a
 * different page. Reusing the row the switches use means it inherits the same
 * padding and the same label/description column, and adding a seventh control
 * to this page later needs no new layout at all.
 *
 * The save confirmation lives in the description rather than in a separate
 * line, which is why it is not lost.
 */
export function ThemePicker(): React.JSX.Element {
  const { theme, setTheme } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  const [mounted, setMounted] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "failed">("idle");

  useEffect(() => setMounted(true), []);

  const current = mounted && isTheme(theme) ? theme : DEFAULT_THEME;
  const options = THEMES.map((t) => ({ value: t.id, label: t.label, hint: t.hint }));

  function choose(id: string): void {
    const chosen = resolveTheme(id);
    setTheme(chosen);
    setSaved("idle");

    if (!session?.user) return;
    void authClient
      .updateUser({ theme: chosen })
      .then(({ error }) => setSaved(error ? "failed" : "ok"))
      .catch(() => setSaved("failed"));
  }

  const description = isPending
    ? "Loading your saved theme."
    : saved === "ok"
      ? "Saved to your account."
      : saved === "failed"
        ? "Could not save — your browser will remember for now."
        : session?.user
          ? "Applies on every device you sign in on."
          : "Sign in to keep this across devices.";

  return (
    <div className="nt-switch-row">
      <div className="nt-switch-text">
        <b>theme</b>
        <span>{description}</span>
      </div>
      {/*
        The trigger renders the field label AND the current value beside it,
        so the label is a static word. Passing the theme's own name here - the
        obvious thing - rendered "light Light" on every control.
      */}
      <CenteredSelect
        label="palette"
        value={current}
        options={options}
        listLabel="Theme"
        onChange={choose}
      />
    </div>
  );
}