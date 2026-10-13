/**
 * PALETTE GENERATOR
 * ------------------------------------------------------------------------
 * Turns five colours per theme into the 72 CSS custom properties a palette
 * block must define, and writes apps/web/src/styles/palettes.generated.css.
 *
 * WHY THIS EXISTS
 *
 * A palette block is 72 tokens. Thirty themes is 2,160 hand-written lines,
 * and the failure mode of every one of them is silent: a token you forget is
 * inherited from the dark base, whose values are tuned for #000, so the
 * theme renders slightly wrong and nothing reports it. Hand-writing does not
 * scale past two themes and does not review well at thirty.
 *
 * So each theme supplies the five colours it actually defines - background,
 * foreground, muted, and two accents - and everything else is derived by
 * rules written down here. The rules are the reviewable artefact: if a
 * derived token is wrong, it is wrong for every theme at once, and fixing
 * it is a one-line change rather than 30 edits.
 *
 * WHY GENERATED CSS IS COMMITTED
 *
 * Because tokens.css has to exist for the app to build, and a build step that
 * must run before `next dev` is a build step someone will forget. The
 * generated file is committed, checked in CI by check-palettes.mjs, and
 * regenerated only when the seeds change.
 *
 * THE RULES, and why each one is what it is
 *
 *   Hairlines are the foreground hue, never white.
 *     The dark base uses rgba(255,255,255,...) everywhere because its
 *     background is black. On a warm or coloured background a neutral white
 *     hairline reads as a cold line on warm paper - this is the single most
 *     common way a ported palette looks wrong, and it is invisible in a
 *     hex diff.
 *
 *   Shadows fall to a darker version of the background, never to black.
 *     Same reason. A pure black shadow under #282828 is visibly wrong.
 *
 *   Scrims are the background hue at an alpha.
 *     A modal over a coloured page should dim that page, not punch a black
 *     hole in the middle of it.
 *
 *   Surfaces step toward the foreground in small amounts.
 *     bg-1 and bg-2 are panel colours, not new backgrounds; a fixed step of
 *     lightness reads as banding on a dark, slightly-tinted bg.
 *
 *   The third accent is a hue rotation, not a mix.
 *     Mixing two accents lands between them on the wheel and gives mud. A
 *     rotation gives a third hue that is still in the same family.
 *
 *   Status colours are rotated toward their canonical hue, then pulled back
 *     toward the palette. "ok" should read green and "danger" should read
 *     red in every theme - a reader recognises success by hue regardless of
 *     the palette - but a pure #00ff00 in a warm theme looks pasted on.
 *
 * WHAT IT DOES NOT DO
 *
 * It does not check that a theme is legible. It reports contrast for fg on
 * bg and exits non-zero below 4.5:1, which is the one accessibility floor
 * worth gating on for a body-text colour, but it is not a full audit and
 * does not pretend to be.
 *
 * Usage, from apps/web:
 *   node scripts/build-palettes.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = join(HERE, "..", "src", "styles");

/* ---------------------------------------------------------------- colour -- */

const hex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

function parseHex(value) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(value).trim());
  if (!m) throw new Error(`not a 6-digit hex colour: ${JSON.stringify(value)}`);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear blend: t=0 returns a, t=1 returns b. */
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

const BLACK = [0, 0, 0];
const WHITE = [255, 255, 255];

/** Rotate hue by `deg` degrees, preserving saturation and lightness. */
function rotate(rgb, deg) {
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d !== 0) {
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  h = (h + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let rgbOut = [0, 0, 0];
  if (h < 60) rgbOut = [c, x, 0];
  else if (h < 120) rgbOut = [x, c, 0];
  else if (h < 180) rgbOut = [0, c, x];
  else if (h < 240) rgbOut = [0, x, c];
  else if (h < 300) rgbOut = [x, 0, c];
  else rgbOut = [c, 0, x];
  return rgbOut.map((v) => (v + m) * 255);
}

/** Pull a colour toward a target hue without abandoning the palette's own. */
function towardHue(from, targetHue, amount) {
  let h = 0;
  const [r, g, b] = from.map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }
  let delta = ((targetHue - h + 540) % 360) - 180;
  return rotate(from, delta * amount);
}

const rgba = (rgb, a) =>
  `rgba(${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v)))).join(", ")}, ${a})`;

/** WCAG relative luminance, for the one contrast floor worth gating on. */
function luminance([r, g, b]) {
  const f = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---------------------------------------------------------------- derive -- */

/**
 * Is this a bright canvas?
 *
 * Not a `light: true` flag on the seed. A flag is a promise, and a seed that
 * says light while carrying #282828 gets every one of the light rules applied
 * to a dark page - which renders, just wrongly. Measuring the background is
 * the fact itself, so it cannot be contradicted.
 *
 * The threshold is deliberately high. Half the palette list is dark, and a
 * mid-tone theme must keep the dark rules: the difference between the two
 * branches is mostly "does white glow or black glow", and applying it at 0.5
 * would flip a theme like solarized's dark teal into light-mode shadows.
 */
function isBright(bg) {
  return luminance(bg) > 0.72;
}

/**
 * Derive a theme's 72 tokens.
 *
 * THE BRANCH IS NOT COSMETIC
 * ------------------------------------------------------------------------
 * Both branches emit all 72, and they differ where the physics differ rather
 * than where a designer felt like being different. Three groups of token, and
 * only three:
 *
 *   1. Alphas over the foreground.
 *      --line, --panel, --grid-line and friends are `rgba(fg, a)`. On a dark
 *      page that is a white hairline; on a bright one it is a dark hairline,
 *      which is exactly what each wants. Same rule, correct both ways - these
 *      are untouched by the branch.
 *
 *   2. Alphas over the background.
 *      --scrim, --input-bg, --switch-track. On dark these are dark overlays
 *      and stay legible. On a bright page a *light* overlay disappears
 *      entirely, so a light rule has to darken instead. This is the flip.
 *
 *   3. Colour used as an ink.
 *      --ascii-high, --amb-high, --glow-accent-* are "the palette's own
 *      colour, where it is allowed to show". On dark, a light colour IS the
 *      ink. On bright, a light colour is invisible against the page, so these
 *      pull toward the foreground - which is dark, and so is now the ink.
 *
 * A fourth case is worth naming because it looks like it should be handled
 * here and is not: --hover-glow and --glow-* are decorative bloom. On a
 * bright page a bright bloom is invisible, so the bright branch tints them
 * with the background at low alpha and keeps the blur. The blur is the part
 * the eye actually reads.
 */
function derive(p) {
  const bg = parseHex(p.bg);
  const fg = parseHex(p.fg);
  const muted = parseHex(p.muted);
  const primary = parseHex(p.primary);
  const secondary = parseHex(p.secondary);
  const bright = isBright(bg);

  // A darker and a lighter step of the background, both toward the
  // foreground hue rather than toward black or white.
  const bg1 = mix(bg, fg, 0.04);
  const bg2 = mix(bg, fg, 0.09);

  /*
   * Surfaces, and why the bright branch inverts the direction.
   *
   * On a dark page a raised surface moves AWAY from the background, toward
   * white, or it is invisible. That is bg1/bg2 above, and it is why a dark
   * palette's panels look like panels.
   *
   * On a near-white page the same move produces a panel indistinguishable
   * from the page - and the fix is not to make it darker, which would read
   * as a hole, but to let the panel reach actual white and let the INSET
   * surface be the one that darkens. So bright reverses the pair: bg1 is
   * pushed toward true white (the card lifts off the page) and bg2 is
   * nudged toward the foreground (the well inside it).
   *
   * 0.04 and 0.09 are kept so a bright palette's two steps are as far apart
   * as a dark one's, rather than the two collapsing into one another.
   */
  const bg1Out = bright ? mix(bg, WHITE, 0.55) : bg1;
  const bg2Out = bright ? mix(bg, fg, 0.045) : bg2;

  /*
   * The deep step - the colour an input well is painted in, so it has to read
   * as a depression in the surface.
   *
   * "Mix the background toward black" is the obvious rule and it is wrong for
   * every palette whose background is already dark. Mixing #08080a toward
   * black yields #060607 - two levels out of 255 - and the resulting well
   * measured 1.006:1 against its own page. Nothing reported it: the token was
   * present, it was valid rgba, the theme rendered, and the input simply
   * could not be told apart from the surface it sat on.
   *
   * There is no colour "below" a near-black background, so the target of the
   * mix has to be chosen by how much room is left:
   *
   *   - bright page   -> toward the foreground, hard. Mixing toward black
   *                      would put a black rectangle on white paper.
   *   - dark page     -> toward a target that slides from black (plenty of
   *                      room below) up to the foreground (no room at all).
   *
   * The slide is on the TARGET, not on the mix strength, and that distinction
   * matters. An earlier attempt interpolated the target as
   * `mix(BLACK, fg, room)` and scaled by 0.02 luminance, which left every
   * near-black theme at 1.014-1.043:1 - worse than the 1.05 the simpler rule
   * produced, because interpolating black toward a light colour at a small
   * `room` still returns nearly-black. The target has to travel the whole
   * distance to the foreground once the page is at the floor.
   *
   * The bands are set from measured contrast, not taste. check-palettes.mjs
   * holds every palette to 1.06:1, the figure the hand-written `.light`
   * palette measures. 0.10 is the smallest near-floor mix at which the
   * darkest background in the set (pitch, luminance 0.0021) clears that bar:
   * 1.077:1, against 1.050:1 at 0.07.
   */
  const bgLum = luminance(bg);
  /*
   * One continuous interpolation, no bands.
   *
   * `room` runs 0 at absolute black to 1 once the page has real luminance to
   * give away. It drives BOTH the target and the strength, and both vary
   * smoothly, because a step anywhere in here is a visible discontinuity in
   * the token as a palette's background crosses the threshold.
   *
   * The two constants were solved for rather than chosen. Sweeping both
   * against every dark palette's measured well and keeping the settings where
   * the weakest one still clears 1.06:1 gives K = 0.12 and S0 = 0.10:
   *
   *   room = 0   (pitch, 0.0021)   -> target fg, strength 0.10 -> 1.071:1
   *   room = 1   (above 0.12)      -> target black, strength 0.28
   *
   * K = 0.02 is the intuitive-looking value and it does not work: it leaves
   * poimandres at 1.035:1. The reason is that a mid-dark palette is not the
   * same problem as a near-black one - it has room, just not much - and it
   * needs a lower `room` for longer before its target starts moving, not a
   * higher one. The curve has to stay shallow across the whole mid range.
   *
   * An intermediate version also switched the strength between two constants
   * at a threshold rather than interpolating it, which passed the near-black
   * themes and broke fourteen mid-dark ones - solarized fell to 1.024:1. That
   * is the reason there is no `? :` here.
   */
  const HAS_ROOM_BELOW = 0.12;
  const room = Math.min(1, bgLum / HAS_ROOM_BELOW);
  const deepTarget = bright ? fg : mix(BLACK, fg, 1 - room);
  const deepStrength = bright ? 0.28 : 0.1 + 0.18 * room;
  const bgDeep = mix(bg, deepTarget, deepStrength);

  const fgMuted = mix(fg, muted, 0.5);
  const accentC = rotate(primary, 150);

  /*
   * Shadow ink. A shadow on a dark page is black - it can be, because there
   * is nothing darker than the page to make it look wrong. On a white page a
   * black shadow at the same alpha reads as a grey smudge, so the ink moves
   * toward the foreground instead: still dark, but carrying the hue, so the
   * shadow reads as belonging to the palette rather than to the browser.
   */
  const shadowInk = mix(bg, BLACK, 0.2);

  // Status: canonical hues, pulled toward the palette's own accents so they
  // belong. Hue 135 green, 45 amber, 5 red.
  const ok = mix(towardHue(secondary, 135, 0.7), secondary, 0.2);
  const warn = mix(towardHue(secondary, 45, 0.75), primary, 0.25);
  const danger = mix(towardHue(primary, 5, 0.8), primary, 0.3);

  /*
   * Colour used as INK, and the one genuinely load-bearing inversion.
   *
   * The accent colours are the palette's identity, so they stay exactly as
   * seeded on both branches - a light theme with a dark primary would be a
   * different theme. What changes is where that colour is allowed to appear
   * against the page.
   *
   * On dark, `secondary` is a light colour and a light colour is legible
   * against a dark page, so it can be the ASCII field's bright end and the
   * glow's colour directly.
   *
   * On a near-white page the same colour is invisible. So every token whose
   * job is "the palette's own colour, showing" mixes toward the foreground
   * first. The foreground on a bright page is dark, so mixing toward it turns
   * a pastel accent into a deep one that reads on white - the accents keep
   * their hue, and only their lightness is traded for legibility.
   *
   * The mix amount is 0.45 rather than "as dark as it takes". Fully dark
   * would flatten every accent to the same near-black and lose the hue that
   * makes the theme recognisable; 0.45 keeps the colour identifiable while
   * clearing the page.
   */
  const inkAccent = bright ? mix(secondary, fg, 0.45) : secondary;
  const inkPrimary = bright ? mix(primary, fg, 0.45) : primary;
  const inkAccentC = bright ? mix(accentC, fg, 0.45) : accentC;

  /*
   * The ambient and ASCII LOW ends. On dark, "low" means dim, and dimming a
   * light colour gives a dark one that recedes. On bright it is reversed: the
   * low end has to be a colour that is barely THERE against white, so it is
   * pulled toward the background, not the foreground.
   *
   * This is the same inversion as bg1/bg2, one level down, and getting it
   * wrong is why a generated light theme tends to look like a dark theme with
   * the brightness turned up: the low end is too dark, so the whole field
   * reads as noise rather than as fog.
   */
  const asciiLow = bright ? mix(bg, fg, 0.07) : bg2;
  const ambLow = bright ? mix(bg, fg, 0.18) : muted;

  /*
   * Decorative bloom. On dark a coloured glow at low alpha over black is
   * visible and pretty. On white the same glow is a pale wash of a pale
   * colour over white - nothing. So on bright the glow keeps its blur but
   * takes the FOREGROUND's colour at low alpha, which is what produces the
   * soft grey lift the hand-written .light palette uses.
   */
  const glowInk = bright ? fg : secondary;
  const glowAlphaScale = bright ? 0.55 : 1;

  return {
    "--bg-0": hex(...bg),
    "--bg-1": hex(...bg1Out),
    "--bg-2": hex(...bg2Out),
    "--bg-fade": hex(...bg),

    "--fg": hex(...fg),
    "--fg-muted": hex(...fgMuted),
    "--fg-dim": hex(...muted),

    "--accent-a": hex(...primary),
    "--accent-b": hex(...secondary),
    "--accent-c": hex(...accentC),
    "--accent-dot": rgba(primary, 0.8),
    "--accent-line": rgba(bright ? inkAccent : secondary, 0.28),
    "--accent-soft": rgba(bright ? inkAccent : secondary, 0.08),

    "--syn-key": hex(...primary),
    "--syn-fn": hex(...secondary),
    "--syn-str": hex(...fgMuted),
    "--syn-num": hex(...accentC),
    "--syn-com": hex(...muted),
    "--syn-var": hex(...mix(primary, fg, 0.45)),
    "--syn-type": hex(...secondary),

    "--ok": hex(...ok),
    "--warn": hex(...warn),
    "--danger": hex(...danger),
    "--ok-fill": rgba(ok, 0.08),
    "--ok-line": rgba(ok, 0.3),
    "--warn-line": rgba(warn, 0.3),
    "--danger-fill": rgba(danger, 0.09),

    // rgba(fg, a) throughout: a white hairline on dark, a dark one on
    // light. Correct on both branches from the one rule.
    "--line": rgba(fg, 0.11),
    "--line-soft": rgba(fg, 0.055),
    "--panel": rgba(fg, 0.035),
    "--grid-line": rgba(fg, 0.05),

    "--shadow-console": `0 -20px 60px -30px ${hex(...shadowInk)}`,
    "--shadow-lg": `0 30px 80px -40px ${hex(...shadowInk)}`,
    "--shadow-md": `0 14px 40px -22px ${rgba(shadowInk, 0.8)}`,
    "--shadow-sm": `0 10px 34px -26px ${rgba(shadowInk, 0.9)}`,

    /*
     * Scrims, and the reason bgDeep is defined with the bright branch.
     *
     * rgba(bg, a) works on dark because a dark scrim dims a darker page. On
     * a white page a white scrim does not dim anything - it erases contrast
     * by flooding the page with its own colour, which is why the hand-written
     * light palette's scrim is near-opaque: it has to BE the dimming.
     *
     * Rather than special-case each alpha, the bright branch anchors scrims
     * to bgDeep, which was mixed toward the (dark) foreground above. One
     * changed variable gives every scrim the right behaviour, and the alphas
     * stay the numbers a reader can reason about.
     */
    "--scrim": rgba(bright ? bgDeep : bg, 0.7),
    "--scrim-bar": rgba(bright ? bgDeep : bg, 0.3),
    "--scrim-deep": rgba(bgDeep, 0.9),
    "--scrim-soft": rgba(bright ? bgDeep : bg, 0.45),

    "--hover-edge": rgba(bright ? inkAccent : secondary, 0.4),
    "--hover-fill": rgba(bright ? inkAccent : secondary, 0.05),
    "--hover-glow": `0 18px 50px -26px ${rgba(glowInk, 0.45 * glowAlphaScale + (bright ? 0.12 : 0))}`,

    "--input-bg": rgba(bgDeep, 0.5),
    "--input-bg-focus": rgba(bgDeep, 0.72),
    "--input-line-hover": rgba(fg, 0.16),

    "--surface-bar": rgba(fg, 0.018),
    "--surface-hover": rgba(fg, 0.022),
    "--surface-raised": rgba(fg, 0.02),
    "--switch-track": rgba(bgDeep, 0.45),

    "--glass-bg": rgba(fg, 0.028),
    "--glass-bg-hover": rgba(bright ? inkAccent : secondary, 0.05),
    "--glass-console": rgba(bg, 0.74),
    "--glass-edge": rgba(fg, 0.09),
    "--glass-sheen": rgba(fg, 0.05),
    "--glass-tint": rgba(fg, 0.3),
    "--glass-tint-hover": rgba(bg1Out, 0.72),

    "--glow-accent": rgba(glowInk, 0.16 * glowAlphaScale),
    "--glow-accent-a": rgba(bright ? inkPrimary : primary, 0.26 * glowAlphaScale),
    "--glow-accent-breathe": rgba(glowInk, 0.14 * glowAlphaScale),
    "--glow-accent-soft": rgba(glowInk, 0.05 * glowAlphaScale),
    "--glow-accent-strong": rgba(glowInk, 0.42 * glowAlphaScale),
    "--bundle-glow": `0 26px 70px -30px ${rgba(glowInk, 0.42 * glowAlphaScale)}`,

    // Hex only: hexToRgb() in ascii-field.tsx parses nothing else, and a
    // named colour here renders as a black field.
    "--ascii-op": "0.55",
    "--ascii-low": hex(...asciiLow),
    "--ascii-high": hex(...inkAccent),
    "--amb-op": "0.4",
    "--amb-low": hex(...ambLow),
    "--amb-high": hex(...inkAccentC),
    /*
     * The AI veil washes the field toward the page rather than darkening it.
     * rgba(bg, ...) is correct on both branches and is the one scrim-shaped
     * token that needs no branch: on a bright page a bright veil is already
     * the right gesture, fading content into white paper - which is what the
     * hand-written .light block calls "paper, not ink".
     */
    "--ai-veil": rgba(bg, 0.4),

    "--grad-from": hex(...primary),
    "--grad-mid": hex(...secondary),
    "--grad-to": hex(...mix(secondary, fg, 0.35)),
  };
}

/* ----------------------------------------------------------------- build -- */

const seeds = JSON.parse(readFileSync(join(STYLES, "palette-seeds.json"), "utf8"));
const palettes = seeds.palettes;

/*
 * The registry is generated from the same seeds, and that is the point.
 *
 * It used to be a hand-written array next to a hand-written stylesheet, which
 * is two lists of the same fact. They disagreed before: a theme present in one
 * and not the other renders as a class on <html> that nothing styles, or as a
 * picker option that silently does nothing - and neither is an error.
 *
 * Generating both from palette-seeds.json makes that state unreachable. A theme
 * cannot be offered without its CSS, because there is only one place to add it.
 */
/*
 * light and dark are the brand palettes and are NOT seeded or generated.
 *
 * dark is the base - held in .nt-root in tokens.css, tuned token by token for
 * the crimson identity - and light was written by hand against it. Folding
 * them into the generator would mean re-deriving values that were chosen
 * deliberately, and the two are the palettes every other one is judged
 * against, so they should stay reviewable as prose.
 *
 * They still belong in the registry, which is why they are added here rather
 * than left out: the picker has to offer them.
 */
const brandEntries = [
  `  { id: "light", label: "Light", hint: "Bright surfaces, dark text", glyph: "☀" },`,
  `  { id: "dark", label: "Dark", hint: "Dark surfaces, light text", glyph: "☾" },`,
].join("\n");

/*
 * `group` is carried through from the seed rather than decided here.
 *
 * The dropdown needs to know which palettes are light and which are dark so
 * it can put a heading between them, and it must be the SAME fact the
 * derivation used - otherwise the picker files a theme under one heading
 * while the stylesheet rendered it the other way, and the section labels lie.
 * So the seed is the single source and this only formats it.
 *
 * A palette with no `group` is emitted without the key at all rather than
 * with `group: undefined`, so the generated type stays honest about which
 * entries actually declare one.
 */
const entryFor = (p) => {
  const base = `id: ${JSON.stringify(p.id)}, label: ${JSON.stringify(p.label)}, hint: ${JSON.stringify(p.hint)}, glyph: ${JSON.stringify(p.glyph)}`;
  return p.group ? `{ ${base}, group: ${JSON.stringify(p.group)} },` : `{ ${base} },`;
};

const paletteEntries = palettes.map(entryFor).join("\n");

const registry = `/* GENERATED FILE - DO NOT EDIT.
 *
 * Source: apps/web/src/styles/palette-seeds.json
 * Regenerate: node scripts/build-palettes.mjs   (from apps/web)
 *
 * Generated rather than hand-written so it cannot drift from
 * palettes.generated.css - a theme the picker offers but no stylesheet
 * answers for renders as an unstyled page.
 *
 * light and dark are listed here but defined in tokens.css by hand: dark is
 * the base palette, and light was written against it. Only the palettes below
 * them are generated.
 */

export const GENERATED_THEMES = [
${brandEntries}
${paletteEntries}
  // Not a palette: an instruction to follow the OS. next-themes resolves it to
  // light or dark, and it therefore needs no block of its own.
  { id: "system", label: "Match system", hint: "Follow your operating system's setting", glyph: "⌘" },
] as const;
`;

writeFileSync(join(HERE, "..", "src", "lib", "themes.generated.ts"), registry, "utf8");

const REQUIRED = ["bg", "fg", "muted", "primary", "secondary"];
let failures = 0;

const seen = new Set();
const header = [
  "/* GENERATED FILE - DO NOT EDIT.",
  " *",
  " * Source:    apps/web/src/styles/palette-seeds.json",
  " * Generator: apps/web/scripts/build-palettes.mjs",
  " * Regenerate: node scripts/build-palettes.mjs   (from apps/web)",
  " *",
  " * Every token below is derived from that theme's five seed colours by the",
  " * rules documented in the generator. To change a palette, change its seed.",
  " * To change the derivation, change the rules - that is one edit rather than",
  " * thirty, which is the whole reason this file exists.",
  " */",
  "",
].join("\n");

const blocks = [];
const report = [];

for (const p of palettes) {
  for (const key of REQUIRED) {
    if (!p[key]) {
      console.log(`  FAIL ${p.id}: missing "${key}"`);
      failures++;
    }
  }
  if (seen.has(p.id)) {
    console.log(`  FAIL duplicate id: ${p.id}`);
    failures++;
  }
  seen.add(p.id);

  const tokens = derive(p);
  const count = Object.keys(tokens).length;

  const bg = parseHex(p.bg);
  const fg = parseHex(p.fg);
  const muted = parseHex(p.muted);
  const ratio = contrast(fg, bg);
  const mutedRatio = contrast(muted, bg);
  report.push({ id: p.id, group: p.group ?? null, tokens: count, ratio, mutedRatio, bright: isBright(bg) });

  if (ratio < 4.5) {
    console.log(`  FAIL ${p.id}: body text contrast ${ratio.toFixed(2)}:1 is below 4.5:1`);
    failures++;
  }

  /*
   * A bright theme's whole point is that it IS bright. A seed that looks
   * bright but measures dark would take the dark rule set and render a dark
   * page from a palette named "Paper" - and nothing else would complain,
   * because every other check passes on a correct dark palette too.
   *
   * So the group a palette is filed under is checked against the branch it
   * actually took. This is the check that keeps "light mode palettes" from
   * quietly containing a dark one.
   */
  const declaredBright = p.group === "light";
  if (declaredBright && !isBright(bg)) {
    console.log(`  FAIL ${p.id}: filed under "light" but bg ${p.bg} measures dark (luminance ${luminance(bg).toFixed(3)} < 0.72)`);
    failures++;
  }

  const lines = Object.entries(tokens).map(([k, v]) => `  ${k}: ${v};`);
  blocks.push(
    `/* ${p.label} - ${p.hint} */\n.${p.id} .nt-root {\n${lines.join("\n")}\n}`,
  );
}

const out = `${header}\n${blocks.join("\n\n")}\n`;
writeFileSync(join(STYLES, "palettes.generated.css"), out, "utf8");

// Verified rather than assumed.
const written = (out.match(/^  --/gm) ?? []).length;
const expected = palettes.length * 72;

const lightCount = report.filter((r) => r.bright).length;

console.log(`palettes      : ${palettes.length}`);
console.log(`blocks        : ${(out.match(/^\.\S+ \.nt-root \{/gm) ?? []).length}`);
console.log(`registry      : ${palettes.length + 1} entries (${palettes.length} palettes + system)`);
console.log(`token lines   : ${written} (expected ${expected})`);
console.log(`file size     : ${Math.round(out.length / 1024)} KB`);
console.log(`consistent    : ${written === expected && written === Object.keys(derive(palettes[0])).length * palettes.length}`);
console.log(`bright branch : ${lightCount} bright, ${palettes.length - lightCount} dark`);
if (written !== expected) failures++;

/*
 * Report the bright themes by name, not just a count.
 *
 * A count is satisfied by the wrong set. Ten dark themes derived with the
 * light rules would still report "10", so the reader has to be able to see
 * which ones took the bright branch and judge that against the seeds.
 */
if (lightCount > 0) {
  console.log("\nbright themes (took the light rule set):");
  for (const r of report.filter((x) => x.bright)) {
    console.log(`  ${r.id.padEnd(18)} ${r.group ?? "(no group)"}`);
  }
}

console.log("\nbody-text contrast, worst first:");
for (const r of [...report].sort((a, b) => a.ratio - b.ratio).slice(0, 6)) {
  console.log(`  ${r.id.padEnd(18)} fg ${r.ratio.toFixed(2)}:1   muted ${r.mutedRatio.toFixed(2)}:1`);
}

process.exitCode = failures === 0 ? 0 : 1;