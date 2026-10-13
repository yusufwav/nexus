/**
 * PREVIEW IS NOT A CHOICE
 * ------------------------------------------------------------------------
 * The theme picker previews: moving the pointer over an option repaints the
 * page in it, and only clicking commits. That is the behaviour asked for and
 * it is the nicest way to choose between thirty palettes.
 *
 * It is also a trap, and the trap is in the saving layer rather than here.
 *
 * ThemeSync saves whenever the theme changes after the page settles - that is
 * how the header toggle persists a choice. A preview is a change too. So
 * without a gate, sweeping the pointer down the list would write every palette
 * the mouse passed over to the reader's account, and the last one hovered
 * before the panel closed would be their saved theme. Thirty palettes would
 * mean thirty writes, and a reader who opened the picker to look around would
 * come back to find it had remembered the wrong one.
 *
 * The gate is a module-level flag rather than context because the two sides
 * live in different components but need to agree within a single tick: the
 * picker sets previewing synchronously BEFORE calling setTheme, and ThemeSync
 * reads it in the effect that runs after that state change. Context would
 * work too, but it would put a provider in the tree for one boolean.
 *
 * Deliberately not stored in sessionStorage or localStorage. A reload
 * mid-preview would then resurrect a preview as if it were a choice, and the
 * reader would have no way back.
 */
let previewing = false;

export function setPreviewing(next: boolean): void {
  previewing = next;
}

export function isPreviewing(): boolean {
  return previewing;
}