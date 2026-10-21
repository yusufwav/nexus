/**
 * THE CORNER SCALE
 * ---------------------------------------------------------------------------
 * Every surface in this app is rounded, and there are only TWO roundnesses:
 * a panel's and a control's. That is the whole scale.
 *
 * WHY A SCALE AND NOT A NUMBER AT EACH SITE
 * ---------------------------------------------------------------------------
 * The app used to have `borderRadius: 0` everywhere, and the radius was a
 * PROP — `GlassPanel`, `Card` and `TerminalPanel` all took one, and it
 * defaulted to `0`. That was a good rule for a house style of square
 * corners: there was nothing to decide and nothing to get wrong.
 *
 * Rounded corners are the opposite of that. A rounded corner says "this is
 * friendly" and a square one says "this is engineered", and once the
 * corners are round the questions come back: how round is this one, is this
 * one the same as that one, is this button the same radius as that card.
 * A scale answers them once.
 *
 * So there are two numbers, and every surface picks the one that matches
 * what it IS rather than how big it happens to be.
 *
 *   PANEL. A surface that holds content: a card, a panel, a sheet, a row of
 *   a list. Twelve points, which is the radius the app's own README
 *   terminal and its code blocks have always used, so the rounded surfaces
 *   that were already here agree with the ones that are new.
 *
 *   CONTROL. Something you press: a button, an input, a chip, a segmented
 *   switch. Eight points, which is soft enough to read as friendly and
 *   tight enough that a 48-point button is a soft rectangle rather than a
 *   pill. A pill is a shape with a meaning — a segmented control, a tab
 *   bar — and a button that looks like one is lying about what it is.
 * THE RULE
 * ---------------------------------------------------------------------------
 * A surface takes `RADIUS.panel` unless it is something you press, in
 * which case it takes `RADIUS.control`. The tutor's chat bubbles are
 * surfaces, so they take the panel radius like everything else — the
 * composer they sit above is a control, so it takes the other one, and
 * the two are told apart by what they are rather than by how big they
 * happen to be.
 */
export const RADIUS = {
  /** A surface that holds content. */
  panel: 12,
  /** Something you press. */
  control: 8,
} as const;
