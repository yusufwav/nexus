/**
 * THE CORNER SCALE
 * ---------------------------------------------------------------------------
 * Every surface in this app is rounded, and there are only TWO roundnesses:
 * a panel's and a control's. That is the whole scale.
 *
 * WHY A SCALE AND NOT A NUMBER AT EACH SITE
 * ---------------------------------------------------------------------------
 * The app used to have `borderRadius: 0` everywhere, and the radius was a
 * PROP — `GlassPanel` and `Card` both took one, and it defaulted to `0`.
 * That was a good rule for a house style of square corners: there was
 * nothing to decide and nothing to get wrong.
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
 *   PANEL. A surface that holds content: a card, a panel, a sheet, a list
 *   row. Twelve points, which is the radius the app's own README terminal
 *   and its code blocks have always used, so the rounded surfaces that
 *   were already here agree with the ones that are new.
 *
 *   CONTROL. Something you press: a button, an input, a chip, a segmented
 *   switch. Eight points, which is soft enough to read as friendly and
 *   tight enough that a 48-point button is a soft rectangle rather than a
 *   pill. A pill is a shape with a meaning — a segmented control, a tab
 *   bar — and a button that looks like one is lying about what it is.
 *
 * THE LADDER
 * ---------------------------------------------------------------------------
 * HeroUI — the library this app's components are modelled on — has a
 * ladder of its own, derived from a single 8-point base: 4, 6, 8, 12, 16,
 * 24, 32. The two values above are two of its steps, and the rest of the
 * ladder is here too, because a switch wants to be a pill and a small
 * chip wants to be tighter than a button.
 *
 * `pill` is the roundest thing a rectangle can be, and it is a SHAPE, not
 * a size: a switch, a segmented control, a tag.
 */
export const RADIUS = {
  /* ---- the ladder ---- */
  /** Four points. A hairline chip, a tiny badge. */
  xs: 4,
  /** Six points. A small tag, a compact control. */
  sm: 6,
  /** Eight points. A control you press. */
  md: 8,
  /** Twelve points. A surface that holds content. */
  lg: 12,
  /** Sixteen points. A sheet, a large control. */
  xl: 16,
  /** Twenty-four points. A dialog, a hero surface. */
  "2xl": 24,
  /** Thirty-two points. The largest surface there is. */
  "3xl": 32,
  /** A pill. A shape, not a size: a switch, a segmented control. */
  pill: 999,

  /* ---- the two house roles ---- */
  /**
   * A surface that holds content.
   *
   * A card, a panel, a sheet, a list row, a chat bubble. Anything the
   * reader reads something INSIDE.
   */
  panel: 12,
  /**
   * Something you press.
   *
   * A button, an input, a chip. Anything the reader acts ON.
   */
  control: 8,

  /**
   * A field you type INTO.
   *
   * Its own radius, and not the control's, because a field is a surface
   * you put something in and a control is a thing you act on. HeroUI
   * gives fields 1.75× the base radius for exactly this reason, and the
   * distinction is worth keeping: a form whose fields and buttons are
   * the same shape reads as a form made of buttons.
   */
  field: 14,
} as const;
