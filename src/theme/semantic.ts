/**
 * THE SEMANTIC LAYER
 * ---------------------------------------------------------------------------
 * HeroUI's colour system is built around SEMANTIC INTENT — `accent`,
 * `default`, `danger`, `surface`, `field` — rather than around raw palette
 * entries, and it is the semantic layer that makes a component's job
 * possible: a button asks for "the accent" and not for a hex value.
 *
 * This app has its own problem, which is fifty-two palettes. A raw colour
 * is wrong on fifty-one of them, so every colour a component needs has to
 * be DERIVED from the active palette, and the derivation has to happen in
 * one place or two components end up disagreeing about what "a quiet
 * neutral button" looks like.
 *
 * So this is that place. It is HeroUI's semantic vocabulary, resolved
 * against the app's own palette tokens.
 *
 * WHERE THE DARK PALETTE'S NEUTRALS WERE A PROBLEM
 * ---------------------------------------------------------------------------
 * HeroUI's `default` is a solid neutral surface — a filled button that is
 * not the accent. This app's palettes have no such thing: their neutrals
 * are all very faint overlays (`surfaceRaised` is 2% white), which is right
 * for a hairline row on a panel and far too faint for a button you are
 * meant to press.
 *
 * So `default` is derived here instead: the palette's own `bg2`, which is
 * the third step of its background ramp and therefore a real, visible
 * neutral on every one of the fifty-two. The app's palette already has
 * the step; it just was not being used for this.
 */
import { useMemo } from "react";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { themeGroup } from "@/theme/themes";
import { inkFor, withAlpha } from "@/lib/palette-colours";

export type Semantic = {
  /* the accent */
  readonly accent: string;
  readonly accentForeground: string;
  /** A translucent accent, for a soft badge or a tinted row. */
  readonly accentSoft: string;
  /** The accent as TEXT on a soft background. */
  readonly accentSoftForeground: string;
  /** The accent with the foreground mixed in, for a pressed state. */
  readonly accentHover: string;

  /* the neutral */
  readonly default: string;
  readonly defaultForeground: string;
  readonly defaultHover: string;

  /* surfaces */
  readonly surface: string;
  readonly surfaceSecondary: string;
  readonly surfaceTertiary: string;
  readonly overlay: string;
  readonly backdrop: string;

  /* foreground */
  readonly foreground: string;
  readonly muted: string;
  readonly dim: string;
  readonly link: string;

  /* status */
  readonly success: string;
  readonly successSoft: string;
  readonly successSoftForeground: string;
  readonly successHover: string;
  readonly warning: string;
  readonly warningSoft: string;
  readonly warningSoftForeground: string;
  readonly warningHover: string;
  readonly danger: string;
  readonly dangerForeground: string;
  readonly dangerSoft: string;
  readonly dangerSoftForeground: string;
  readonly dangerHover: string;

  /* lines */
  readonly border: string;
  readonly separator: string;
  readonly focus: string;

  /* form fields */
  readonly field: string;
  readonly fieldForeground: string;
  readonly fieldPlaceholder: string;
  readonly fieldBorder: string;

  /* press feedback */
  /**
   * The wash a press lays over a control that is NOT filled with the accent.
   */
  readonly pressWash: string;
  /**
   * The wash a press lays over a control that IS filled with the accent.
   */
  readonly pressWashAccent: string;
};

/**
 * The semantic colours, resolved against the active palette.
 *
 * Every value here is either a token from the palette or a derivation from
 * one, so a component never hard-codes a colour and the whole app follows
 * the reader's palette.
 */
export function useSemantic(): Semantic {
  const theme = useActiveTheme();
  const t = theme.tokens;

  return useMemo<Semantic>(
    () => {
      /*
       * THE PRESS WASH.
       *
       * The wash that lays over a control while it is held down, and the
       * one place the rule for it is decided.
       *
       * On the two MONOCHROME groups — the black ones and the white ones —
       * the wash is the PAGE'S OWN COLOUR at thirty percent: a black
       * page's button goes black when it is pressed and a white page's
       * button goes white. So the control does not change colour when it
       * is pressed, it RECEDES INTO THE PAGE, and the press reads as a
       * surface being pushed rather than as a light being switched on.
       *
       * The thirty percent is the whole of it. At full strength a black
       * wash over a black button is a hole, and a white wash over a white
       * one is a hole the other way; at thirty it is a shading, which is
       * what a press should look like.
       *
       * The COLOURFUL palettes are the ones whose background has
       * brightened into a colour of its own, and they keep the wash they
       * had: the ink of the fill. Their page is a colour, so a
       * page-coloured wash on them would be a colour on a colour.
       */
      const group = themeGroup(theme);
      const monochrome = group === "dark" || group === "light";
      const pageWash = withAlpha(t.bg0, 0.3);

      return {
        accent: t.accentA,
        // The ink on an accent fill, CHOSEN against the fill rather than
        // inherited from the page — see `inkFor`. The app's accents are
        // designed to be fills, and some of them are nearly black.
        accentForeground: inkFor(t.accentA),
        accentSoft: withAlpha(t.accentA, 0.15),
        accentSoftForeground: t.accentA,
        accentHover: withAlpha(t.fg, 0.12),

        default: t.bg2,
        defaultForeground: t.fg,
        defaultHover: withAlpha(t.fg, 0.08),

        surface: t.bg1,
        surfaceSecondary: t.bg2,
        surfaceTertiary: t.surfaceRaised,
        overlay: t.bg1,
        backdrop: "rgba(0, 0, 0, 0.55)",

        foreground: t.fg,
        muted: t.fgMuted,
        dim: t.fgDim,
        link: t.accentA,

        success: t.ok,
        successSoft: withAlpha(t.ok, 0.15),
        successSoftForeground: t.ok,
        successHover: withAlpha(t.fg, 0.12),

        warning: t.warn,
        warningSoft: withAlpha(t.warn, 0.15),
        warningSoftForeground: t.warn,
        warningHover: withAlpha(t.fg, 0.12),

        danger: t.danger,
        // The ink on a danger fill, chosen against the fill — the same
        // reasoning as the accent's ink.
        dangerForeground: inkFor(t.danger),
        dangerSoft: withAlpha(t.danger, 0.15),
        dangerSoftForeground: t.danger,
        dangerHover: withAlpha(t.fg, 0.12),

        border: t.line,
        separator: t.lineSoft,
        focus: t.accentA,

        field: t.surfaceRaised,
        fieldForeground: t.fg,
        fieldPlaceholder: t.fgDim,
        fieldBorder: t.line,

        pressWash: monochrome ? pageWash : t.fg,
        pressWashAccent: monochrome ? pageWash : inkFor(t.accentA),
      };
    },
    [t, theme],
  );
}
