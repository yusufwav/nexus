"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme } from "@/lib/themes";

/**
 * APPEARANCE - THEME PICKER
 * ------------------------------------------------------------
 * A real setting, unlike its neighbours on this page. It reads the current
 * choice from next-themes and writes it to the reader's account, which is
 * what makes it survive signing out and signing back in, and following it
 * to another device.
 *
 * WHY A RADIO GROUP AND NOT A SWITCH
 *
 * The placeholder this replaced was an on/off "Light theme" switch, which
 * cannot express "follow my OS" - and that is one of three real answers.
 * With more palettes coming, a two-position switch is also the wrong shape
 * entirely: every new theme would need a switch. A radio group grows by
 * adding an option.
 *
 * WHY LOCAL STATE IS ALSO TRACKED
 *
 * next-themes owns the applied theme, but between a click and the resulting
 * re-render it still reports the previous value. Reading only from it makes
 * the radio jump back for a frame after each tap. `pending` tracks the
 * click so the selection stays where the reader put it, and it is dropped
 * as soon as next-themes agrees.
 *
 * NOTHING IS SAVED WHEN SIGNED OUT
 *
 * next-themes still applies a theme locally, because that works and a
 * visitor should not be told they cannot pick a colour. It simply is not
 * persisted anywhere beyond this browser, which is why the copy below says
 * so rather than implying the choice is being kept.
 */
export function ThemePicker(): React.JSX.Element {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { data: session, isPending } = authClient.useSession();

  const [pending, setPending] = useState<string | null>(null);
  const [saved, setSaved] = useState<"idle" | "ok" | "failed">("idle");

  // Match next-themes once it has read storage, so the row is right on
  // arrival instead of flashing the default.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const current = pending ?? (mounted && isTheme(theme) ? theme : DEFAULT_THEME);

  /*
   * "system" is not a palette, it is an instruction. Saying what it
   * currently resolves to is the difference between a reader who chose
   * "match system" knowing they are on light and one who has to go and
   * check their OS settings.
   */
  const described =
    current === "system"
      ? `currently ${resolvedTheme === "dark" ? "dark" : "light"}`
      : null;

  function choose(id: string): void {
    if (!isTheme(id)) return;
    setPending(id);
    setSaved("idle");
    setTheme(id);

    if (!session?.user) {
      // Applied locally by next-themes, kept in this browser only.
      setPending(null);
      return;
    }

    void authClient
      .updateUser({ theme: id })
      .then(({ error }) => {
        setSaved(error ? "failed" : "ok");
      })
      .catch(() => setSaved("failed"))
      .finally(() => setPending(null));
  }

  return (
    <fieldset className="nt-theme-picker">
      <legend className="nt-theme-picker__legend">
        theme
        {described && <span className="nt-theme-picker__note">{described}</span>}
      </legend>

      <div className="nt-theme-picker__options" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              className="nt-theme-picker__opt"
              data-active={active || undefined}
              onClick={() => choose(t.id)}
            >
              <span className="nt-theme-picker__label">{t.label}</span>
              <span className="nt-theme-picker__hint">{t.hint}</span>
            </button>
          );
        })}
      </div>

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
    </fieldset>
  );
}