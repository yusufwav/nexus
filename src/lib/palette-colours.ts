/**
 * COLOURS DERIVED FROM THE ACTIVE PALETTE
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/lib/palette-colours.ts
 *
 * A reader can be on any of fifty-two palettes, and a hard-coded colour is
 * wrong on fifty-one of them. So the colours that cannot be hard-coded are
 * DERIVED from the active theme here, once, and the callers that need them
 * ask.
 *
 * The one that survives is `inkFor`: the ink on a filled control has to be
 * chosen against the FILL rather than inherited from the page, because the
 * base palette's accent is nearly black and the page background is black.
 * Black on that is not a button — it is a slightly different black.
 *
 * This file is pure and DOM-free on purpose, exactly as it was on the web:
 * the colour derivation has to be bit-identical between the two platforms,
 * because a differently-derived accent is a differently-coloured thing.
 *
 * THE OKLAB MATHS IS GONE
 * ---------------------------------------------------------------------------
 * The file used to carry the OKLab conversion and the "brightest" and "most
 * saturated" policies, because the four visual engines needed them: the
 * tutor's horizon wanted the palette's brightest colour and its most
 * saturated one, and the profile's glitch wanted a single accent.
 *
 * Those engines are gone — see `PORTING.md` §2 — and with them the policies
 * that existed only to serve them. The WCAG luminance below is all that is
 * left, because `inkFor` needs it.
 */

/** An RGB triple in 0-255, and the alpha it was written with. */
export type Rgba = { readonly r: number; readonly g: number; readonly b: number; readonly a: number };

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

/* ------------------------------------------------------------------ */
/* parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Read a CSS colour value into RGB.
 *
 * Handles what the stylesheets actually contain: 3- and 6-digit hex, 8-digit
 * hex with an alpha byte, and rgb()/rgba(). Anything else returns null, and
 * the caller skips it. Nothing here throws, because a palette that fails to
 * parse must cost one colour and not the whole background.
 */
export function parseColor(value: string | undefined | null): Rgba | null {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (raw.length === 0) return null;

  if (raw.startsWith("#")) {
    const h = raw.slice(1);
    let body: string;
    if (h.length === 3 || h.length === 4) body = [...h].map((c) => c + c).join("");
    else if (h.length === 6 || h.length === 8) body = h;
    else return null;
    if (!/^[0-9a-fA-F]+$/.test(body)) return null;
    const n = Number.parseInt(body, 16);
    return body.length === 6
      ? { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 }
      : { r: (n >>> 24) & 255, g: (n >>> 16) & 255, b: (n >>> 8) & 255, a: (n & 255) / 255 };
  }

  const fn = /^rgba?\(([^)]+)\)$/i.exec(raw);
  if (fn === null) return null;
  const parts = fn[1]!.split(/[\s,/]+/).filter((p) => p.length > 0);
  if (parts.length < 3) return null;

  const channel = (p: string): number | null => {
    if (p.endsWith("%")) {
      const v = Number.parseFloat(p);
      return Number.isFinite(v) ? (v / 100) * 255 : null;
    }
    const v = Number.parseFloat(p);
    return Number.isFinite(v) ? v : null;
  };

  const r = channel(parts[0]!);
  const g = channel(parts[1]!);
  const b = channel(parts[2]!);
  if (r === null || g === null || b === null) return null;

  let a = 1;
  if (parts.length > 3) {
    const p = parts[3]!;
    a = p.endsWith("%") ? Number.parseFloat(p) / 100 : Number.parseFloat(p);
    if (!Number.isFinite(a)) a = 1;
  }
  return { r, g, b, a: Math.min(1, Math.max(0, a)) };
}

/**
 * THE INK FOR A GIVEN BACKGROUND.
 *
 * A control filled with the accent has to put something on it that can be
 * read, and "the page background" is not that something: the base palette's
 * accent is #8b0000, whose relative luminance is 0.05, and the page
 * background is #000000. Black on that is a contrast ratio of about 1.1:1,
 * which is not text on a button — it is a slightly different black.
 *
 * So the ink is CHOSEN against the fill rather than inherited from the
 * page: white on a fill dark enough to need it, black on a fill light
 * enough to carry it.
 *
 * The threshold is the WCAG one. A fill at or above 3:1 against black takes
 * black ink; anything darker takes white.
 */
export function inkFor(background: string): string {
  const parsed = parseColor(background) ?? { r: 0, g: 0, b: 0, a: 1 };
  const againstBlack = relativeLuminance(parsed);
  const againstWhite = 1.05 / (againstBlack + 0.05);
  return againstWhite >= againstBlack ? "#ffffff" : "#000000";
}

/**
 * A COLOUR AT A GIVEN ALPHA.
 *
 * The semantic layer needs a dozen translucent versions of the palette's
 * own colours — a soft accent, a hover tint, a backdrop — and there is no
 * way to get them without mixing the colour by hand, once per palette,
 * per token.
 *
 * So the mixing happens here, once, and every caller asks for a colour and
 * an alpha and gets the palette's own hue back with that opacity.
 *
 * The input may already be translucent, in which case the new alpha
 * REPLACES the old one rather than multiplying into it. A colour that is
 * already 30% opaque and is asked for at 15% should be 15% opaque, not
 * 4.5% — the request is for how transparent the result is, not for how
 * much to fade what is already there.
 */
export function withAlpha(color: string, alpha: number): string {
  const parsed = parseColor(color);
  if (parsed === null) {
    // A colour that cannot be parsed is returned as it is, rather than
    // becoming transparent and disappearing.
    return color;
  }
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${a})`;
}
