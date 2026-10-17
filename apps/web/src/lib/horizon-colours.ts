/**
 * THE HORIZON BLOOM PALETTE
 * ------------------------------------------------------------------------
 * The tutor chat's background is the Horizon Bloom effect, and it takes two
 * light colours and one page colour. All three are taken from the active
 * theme rather than hard-coded, so the background belongs to whichever of the
 * fifty palettes a reader has chosen instead of being a foreign object
 * sitting behind their text.
 *
 *   warm  = the BRIGHTEST colour in the palette
 *   cool  = the MOST SATURATED colour in the palette
 *   page  = the palette's own background
 *
 * WHY OKLAB AND NOT HSL
 * ------------------------------------------------------------------------
 * "Brightest" and "most saturated" are both perceptual judgements, and neither
 * is perceptual in HSL. HSL lightness is the midpoint between the min and max
 * channel, so #7a2e12 and #b45309 - visibly different browns - can share a
 * lightness, and #ff7b72 is "fully saturated" at a pale 78% lightness while
 * #6b0024 is the same 100% at a very dark one. Ranking on HSL picks whichever
 * accent happened to sit near mid-grey, which is not what either word means.
 *
 * OKLab is used because L is a perceptual lightness and a,b are the two
 * opponent axes; OKLCh's C is exactly "how far from grey" and is therefore
 * what "most saturated" is asking for. Both come out of the same conversion,
 * so the two rankings are computed from one pass over the palette.
 *
 * WHY THE POOL IS EXPLICIT
 * ------------------------------------------------------------------------
 * The alternative - feed the effect every token and let it rank them - picks
 * --fg on every single theme. --fg is near-white in the dark palettes and
 * near-black in the light ones, so it wins "brightest" on dark and also wins
 * on light, and the effect renders as a white line on a white line on every
 * palette in the registry. --fg is the colour of TEXT. It is not one of the
 * palette's lights.
 *
 * So the pool is the chromatic tokens, named. Two further rules apply to it:
 *
 *   · a candidate must actually have some chroma (C >= MIN_CHROMA). This is
 *     what keeps --grad-mid out: it is #ffffff in the base palette and would
 *     be "the brightest colour" by a wide margin, and it is white. The rule is
 *     about the colour rather than its name, so a future palette cannot slip
 *     a neutral in through a token nobody thought to exclude.
 *
 *   · translucent values are composited over the palette's own background
 *     before ranking. --accent-dot is rgba(139,0,0,0.8), which over black is
 *     a dark red and over paper is a mid red; the same token is two different
 *     colours and ranking the raw rgba would rank an alpha.
 *
 * Pure and DOM-free on purpose: the audit in scripts/audit-horizon-colours.mjs
 * imports this module directly and runs it over every generated palette, which
 * is the only way to know all fifty still produce a usable pair.
 */

/** An RGB triple in 0-255, and the alpha it was written with. */
export type Rgba = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };

/**
 * The tokens ranked for the effect.
 *
 * Order is the tiebreak, and it is a deliberate one: the brand accents come
 * first, so a palette where two accents tie on lightness resolves to the one
 * the identity was built from rather than to whichever the generator happened
 * to emit first.
 *
 * The ASCII and ambient ramp endpoints are NOT here, and that is a measured
 * exclusion rather than a tidy one. They look like palette colours and in most
 * of the registry they are - in the base palette --amb-high and --accent-b are
 * the same #fdd3ae, and --ascii-high and --accent-c are the same #6b0024.
 *
 * They are excluded because of what they are FOR. A ramp endpoint exists to be
 * pulled toward the page background so the ASCII field recedes behind text
 * rather than competing with it, and in the light palette that has been carried
 * all the way: --amb-low is #c9a0a0, a pale pink that measures 2.20:1 against
 * #faf8f6. It is the BRIGHTEST thing in that palette by OKLab lightness, so with
 * it in the pool the effect's warm colour - the light along the surface of the
 * planet - became a colour that is essentially invisible on the page it is
 * drawn on. A control value was being used as an identity value.
 *
 * So the pool is the tokens that say what the palette IS.
 */
export const HORIZON_CANDIDATES: readonly string[] = [
  "--accent-b",
  "--accent-c",
  "--accent-a",
  "--grad-from",
  "--grad-to",
  "--syn-fn",
  "--syn-type",
  "--syn-key",
  "--syn-num",
  "--syn-str",
  "--ok",
  "--warn",
  "--danger",
];

/** How chromatic a token has to be before it counts as one of the palette's colours. */
export const MIN_CHROMA = 0.03;

/**
 * Above this relative luminance the palette is a light one.
 *
 * The effect switches to ink rendering past this, which is the same threshold
 * the shader branch uses - so "is this theme light" is answered in exactly one
 * place and the two cannot disagree about where the line is.
 */
export const LIGHT_LUMA = 0.42;

/** The palette used when a theme yields nothing usable. Matches the effect's own default. */
export const FALLBACK = {
  warm: "#fdd3ae",
  cool: "#8b0000",
  background: "#0a0a0a",
  light: false,
} as const;

export type HorizonPalette = {
  /** The brightest chromatic colour. */
  readonly warm: string;
  /** The most saturated chromatic colour. */
  readonly cool: string;
  /** The palette's own page background. */
  readonly background: string;
  /** Is this a light palette? Decides additive light vs. ink. */
  readonly light: boolean;
};

/* ------------------------------------------------------------------ */
/* colour maths                                                        */
/* ------------------------------------------------------------------ */

/** One sRGB channel, 0-255, to linear-light 0-1. */
function toLinear(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance, 0-1. This is what the light/dark decision uses. */
export function relativeLuminance({ r, g, b }: Rgba): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/**
 * sRGB to OKLab. Returns L, a, b.
 *
 * This is the Björn Ottosson matrix. It is not an approximation of anything
 * here - it is the definition, and the effect's shader converts back out of it,
 * so a colour that survives this round trip is the colour the shader blends.
 */
export function srgbToOklab({ r, g, b }: Rgba): { readonly L: number; readonly a: number; readonly bb: number } {
  const R = toLinear(r);
  const G = toLinear(g);
  const B = toLinear(b);

  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    bb: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLCh chroma. This is "distance from grey", which is what saturation means. */
export function chroma({ a, bb }: { readonly a: number; readonly bb: number }): number {
  return Math.sqrt(a * a + bb * bb);
}

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Read a CSS colour value into RGB.
 *
 * Handles what the stylesheets actually contain: 3- and 6-digit hex, 8-digit
 * hex with an alpha byte, and rgb()/rgba(). Anything else - oklch(), a colour
 * function from a future palette, a `var()` that did not resolve, an empty
 * string from a token the theme does not define - returns null, and the
 * caller skips it. Nothing here throws, because a palette that fails to parse
 * must cost one colour and not the whole background.
 */
export function parseColor(value: string | undefined | null): Rgba | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length === 0) return null;

  if (raw.startsWith("#")) {
    const h = raw.slice(1);
    const expand = (c: string) => c + c;
    let body: string;
    if (h.length === 3 || h.length === 4) body = [...h].map(expand).join("");
    else if (h.length === 6 || h.length === 8) body = h;
    else return null;
    if (!/^[0-9a-fA-F]+$/.test(body)) return null;
    const n = Number.parseInt(body, 16);
    // 6 digits:  rgb. 8 digits: rgb + alpha byte.
    return body.length === 6
      ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
      : { r: (n >>> 24) & 255, g: (n >>> 16) & 255, b: (n >>> 8) & 255, a: (n & 255) / 255 };
  }

  const fn = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (fn === null) return null;
  const parts = fn[1].split(/[\s,/]+/).filter((p) => p.length > 0);
  if (parts.length < 3) return null;

  const channel = (p: string): number | null => {
    if (p.endsWith("%")) {
      const v = Number.parseFloat(p);
      return Number.isFinite(v) ? (v / 100) * 255 : null;
    }
    const v = Number.parseFloat(p);
    return Number.isFinite(v) ? v : null;
  };

  const r = channel(parts[0]);
  const g = channel(parts[1]);
  const b = channel(parts[2]);
  if (r === null || g === null || b === null) return null;

  let a = 1;
  if (parts.length > 3) {
    const p = parts[3];
    a = p.endsWith("%") ? Number.parseFloat(p) / 100 : Number.parseFloat(p);
    if (!Number.isFinite(a)) a = 1;
  }
  return { r, g, b, a: Math.min(1, Math.max(0, a)) };
}

/** Composite a translucent colour over an opaque one. */
function over(fg: Rgba, bg: Rgba): Rgba {
  if (fg.a >= 1) return fg;
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  };
}

/** Back to a `#rrggbb` string. The shader and the DOM both want hex. */
export function toHex({ r, g, b }: Rgba): string {
  const c = (v: number) => Math.min(255, Math.max(0, Math.round(v))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/* ------------------------------------------------------------------ */
/* the derivation                                                      */
/* ------------------------------------------------------------------ */

/** A CSS custom-property read off the theme. Names carry their leading `--`. */
export type ThemeTokens = Readonly<Record<string, string>>;

/**
 * The effect's colours for one theme.
 *
 * `tokens` is whatever `getComputedStyle` reports off `.nt-root`, which is
 * what the other canvas engines in this app already read - so this module and
 * the theme cannot disagree about what a palette contains.
 */
export function horizonPalette(tokens: ThemeTokens): HorizonPalette {
  const backgroundRaw = parseColor(tokens["--bg-0"]) ?? { r: 0, g: 0, b: 0, a: 1 };
  const background = { ...backgroundRaw, a: 1 };
  const light = relativeLuminance(background) > LIGHT_LUMA;

  type Scored = { readonly name: string; readonly hex: string; readonly L: number; readonly C: number };
  const scored: Scored[] = [];

  for (const name of HORIZON_CANDIDATES) {
    const parsed = parseColor(tokens[name]);
    if (parsed === null) continue;

    // Rank the colour, not the alpha.
    const flat = over(parsed, background);
    const ok = srgbToOklab(flat);
    const C = chroma(ok);
    if (C < MIN_CHROMA) continue;

    scored.push({ name, hex: toHex(flat), L: ok.L, C });
  }

  if (scored.length === 0) {
    return { ...FALLBACK, background: toHex(background), light };
  }

  // Brightest. Strictly-greater keeps the earlier token on a tie, which is
  // why HORIZON_CANDIDATES is ordered by preference.
  let warm = scored[0]!;
  for (const s of scored) if (s.L > warm.L) warm = s;

  /*
   * Most saturated, EXCLUDING the warm colour.
   *
   * This is the one place the derivation departs from a literal reading of
   * "warm is the brightest, cool is the most saturated", and it departs only
   * when those two are the same colour - which seven palettes in the registry
   * are, all of them single-hue greens: solarized, everforest, kanagawa,
   * oxocarbon, sonokai, material and github all rank one token first on both
   * measures.
   *
   * Picking it twice is not harmless. The effect blends warm into cool across
   * its whole atmosphere in OKLab, and that blend is where its depth comes
   * from; hand it the same colour at both ends and the atmosphere renders as
   * one flat hue. So the saturated colour is the best of what is left.
   *
   * Whenever the two are genuinely different - every palette not on that list -
   * this is exactly the most saturated colour in the palette.
   *
   * Eleven palettes in the registry are single-hue in this sense: solarized,
   * everforest, kanagawa, oxocarbon, sonokai, material and github rank one
   * colour first on both measures.
   */
  let cool: Scored | null = null;
  for (const s of scored) {
    // Excluded by COLOUR, not by token name. Several palettes assign one hex
    // to several tokens - github alone uses one for five - so skipping by name
    // leaves four registries still handing the effect the same colour twice.
    // What matters downstream is that the two ends differ, not that they came
    // from different names.
    if (s.hex.toLowerCase() === warm.hex.toLowerCase()) continue;
    if (cool === null || s.C > cool.C) cool = s;
  }
  // One chromatic colour and nothing else. Better a monochrome atmosphere
  // than a fallback palette that belongs to no theme at all.
  if (cool === null) cool = warm;

  return {
    warm: warm.hex,
    cool: cool.hex,
    background: toHex(background),
    light,
  };
}
