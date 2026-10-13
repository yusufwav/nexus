"use client";

import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";

import CenteredSelect from "@/components/centered-select";
import { authClient } from "@/lib/auth-client";
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme } from "@/lib/themes";
import type { ThemeEntry } from "@/lib/themes";

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

  /*
   * The list, ordered and grouped.
   *
   * The registry already carries a `group` on each generated palette, so this
   * does not invent a classification - it only decides the ORDER of the
   * sections and names them.
   *
   * Order is set here rather than read from the registry because the seeds
   * file is a build input, not a UI decision: reordering it to suit the
   * dropdown would make the generated CSS order follow the UI, which is the
   * wrong way round. One place decides what the reader sees first.
   *
   * "Light mode palettes" leads because these are the themes people reach for
   * when they want brightness, and a list of forty that starts with thirty
   * dark ones buries them.
   *
   * light and dark are deliberately NOT grouped. They are the brand pair, not
   * a family, and the reader who wants "the bright one" wants the actual
   * Light rather than a heading that has to be read to find it.
   *
   * `system` stays last and ungrouped: it is an instruction, not a palette,
   * and giving it a heading would imply it belongs to a family.
   */
  const options = useMemo(() => {
    const entry = (t: ThemeEntry, group?: string) => ({
      value: t.id,
      label: t.label,
      hint: t.hint,
      ...(group ? { group } : {}),
    });

    const isBrand = (t: ThemeEntry) => t.id === "light" || t.id === "dark";

    const light = THEMES.filter((t) => t.group === "light").map((t) => entry(t, "Light mode palettes"));

    const dark = THEMES.filter((t) => t.group === undefined && !isBrand(t) && t.id !== "system").map((t) =>
      entry(t, "Dark mode palettes"),
    );

    const brand = THEMES.filter(isBrand).map((t) => entry(t));

    const system = THEMES.filter((t) => t.id === "system").map((t) => entry(t));

    /*
     * Every generated palette must land in exactly one section.
     *
     * The dark filter above is `group === undefined`, so a palette given a
     * group this file does not handle would match neither it nor `light` and
     * would vanish from the picker: a theme that exists, has a full CSS
     * block, and cannot be selected. Nothing else would report that, because
     * check-palettes only compares the registry against the stylesheet.
     * Throwing is the point.
     */
    const grouped = new Set([...light, ...dark].map((o) => o.value));
    const orphans = THEMES.filter((t) => !isBrand(t) && t.id !== "system" && !grouped.has(t.id));
    if (orphans.length > 0) {
      throw new Error(
        `theme-picker: ${orphans.length} palette(s) are in no section and would be unselectable: ${orphans
          .map((t) => t.id)
          .join(", ")}. Add a group to them in palette-seeds.json and a section here.`,
      );
    }

    return [...brand, ...light, ...dark, ...system];
  }, []);

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