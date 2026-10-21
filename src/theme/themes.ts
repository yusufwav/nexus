/**
 * THEMES
 * ---------------------------------------------------------------------------
 * The web app offers 52 palettes plus a "match system" instruction, all of
 * them defined as CSS custom properties in `styles/palettes.generated.css`.
 *
 * React Native has no cascade, so the palettes are plain data
 * (`palettes.generated.ts`, generated from that CSS by
 * `scripts/extract-palettes.mjs`) and this module turns them into a theme.
 *
 * A THEME IS TWO THINGS:
 *
 *   · a `PaletteTokens` record — the colours, used by the UI and by the four
 *     GL engines;
 *   · a CSS-name-keyed bag of the same values, because the web app's colour
 *     derivation (`lib/palette-colours.ts`) is written against token NAMES
 *     like `--accent-a`. Keeping that shape means the derivation ports over
 *     verbatim rather than being rewritten, which is the only way the four
 *     engines can be trusted to pick the same colours they picked on the web.
 */

/* GENERATED THEMES — id / label / hint / glyph, ported from the web app's
 * `lib/themes.generated.ts`. */
import { PALETTES, type PaletteTokens } from "@/theme/palettes.generated";

export type ThemeMeta = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly glyph: string;
  readonly group: "light" | "dark";
};

export const THEME_LIST: ReadonlyArray<ThemeMeta> = [
  { id: "dark", label: "Dark", hint: "Dark surfaces, light text", glyph: "☾", group: "dark" },
  { id: "light", label: "Light", hint: "Bright surfaces, dark text", glyph: "☀", group: "light" },
  { id: "paper", label: "Paper", hint: "Warm white, ink black", glyph: "▤", group: "light" },
  { id: "linen", label: "Linen", hint: "Soft off-white, woven warm", glyph: "▦", group: "light" },
  { id: "porcelain", label: "Porcelain", hint: "Cool white, clean slate", glyph: "◻", group: "light" },
  { id: "snow", label: "Snow", hint: "Blue-white, bright and cold", glyph: "❅", group: "light" },
  { id: "butter", label: "Butter", hint: "Cream yellow, honey accent", glyph: "▨", group: "light" },
  { id: "mint", label: "Mint", hint: "Pale green, fresh and calm", glyph: "▩", group: "light" },
  { id: "blush", label: "Blush", hint: "Faint rose, rose and plum", glyph: "▧", group: "light" },
  { id: "sky", label: "Sky", hint: "Pale blue, azure accent", glyph: "▢", group: "light" },
  { id: "lemon", label: "Lemon", hint: "Brightest white, sharp accents", glyph: "▬", group: "light" },
  { id: "ivory", label: "Ivory", hint: "Warm white, classic serif ink", glyph: "▥", group: "light" },
  { id: "void", label: "Void", hint: "Near-black, truly neutral", glyph: "◘", group: "dark" },
  { id: "pitch", label: "Pitch", hint: "The darkest here", glyph: "●", group: "dark" },
  { id: "obsidian", label: "Obsidian", hint: "Cool black, glassy sheen", glyph: "◆", group: "dark" },
  { id: "carbon", label: "Carbon", hint: "Blue-black, electric accents", glyph: "◼", group: "dark" },
  { id: "ink", label: "Ink", hint: "Indigo black, deep blue", glyph: "◉", group: "dark" },
  { id: "char", label: "Char", hint: "Warm black, ember accents", glyph: "◍", group: "dark" },
  { id: "basalt", label: "Basalt", hint: "Stone black, steady grey", glyph: "⬒", group: "dark" },
  { id: "umber", label: "Umber", hint: "Brown-black, aged and warm", glyph: "◐", group: "dark" },
  { id: "nocturne", label: "Nocturne", hint: "Violet black, low and moody", glyph: "◑", group: "dark" },
  { id: "graphite", label: "Graphite", hint: "Even black, one step up", glyph: "■", group: "dark" },
  { id: "gruvbox", label: "Gruvbox", hint: "Warm retro dark", glyph: "◍", group: "dark" },
  { id: "dracula", label: "Dracula", hint: "Deep gothic purple", glyph: "◈", group: "dark" },
  { id: "nord", label: "Nord", hint: "Frost arctic night", glyph: "❄", group: "dark" },
  { id: "solarized", label: "Solarized", hint: "Deep oceanic teal", glyph: "◐", group: "dark" },
  { id: "catppuccin", label: "Catppuccin", hint: "Mocha, soothing velvet", glyph: "☕", group: "dark" },
  { id: "tokyo-night", label: "Tokyo Night", hint: "Midnight blue", glyph: "🗼", group: "dark" },
  { id: "monokai", label: "Monokai", hint: "Dark volcanic ash", glyph: "◆", group: "dark" },
  { id: "one-dark", label: "One Dark", hint: "Flat neutral dark", glyph: "◐", group: "dark" },
  { id: "everforest", label: "Everforest", hint: "Deep forest earth", glyph: "🌲", group: "dark" },
  { id: "rose-pine", label: "Rosé Pine", hint: "Dusky lavender", glyph: "❀", group: "dark" },
  { id: "night-owl", label: "Night Owl", hint: "Twilight abyssal blue", glyph: "🦉", group: "dark" },
  { id: "kanagawa", label: "Kanagawa", hint: "Sumi ink dark", glyph: "⛩", group: "dark" },
  { id: "ayu", label: "Ayu", hint: "Mirage, dark steel blue", glyph: "◐", group: "dark" },
  { id: "zenburn", label: "Zenburn", hint: "Heavy industrial gray", glyph: "☯", group: "dark" },
  { id: "iceberg", label: "Iceberg", hint: "Frigid oceanic asphalt", glyph: "❄", group: "dark" },
  { id: "oxocarbon", label: "Oxocarbon", hint: "Stark pitch industrial", glyph: "⬢", group: "dark" },
  { id: "edge", label: "Edge", hint: "Geometric clean dark", glyph: "◇", group: "dark" },
  { id: "sonokai", label: "Sonokai", hint: "Smooth black charcoal", glyph: "◑", group: "dark" },
  { id: "nightfox", label: "Nightfox", hint: "Stealth fighter black", glyph: "🦊", group: "dark" },
  { id: "oceanic-next", label: "Oceanic Next", hint: "Deep sub-sea base", glyph: "≈", group: "dark" },
  { id: "material", label: "Material", hint: "Flat matte slate", glyph: "◉", group: "dark" },
  { id: "horizon", label: "Horizon", hint: "Burnt interstellar night", glyph: "◔", group: "dark" },
  { id: "poimandres", label: "Poimandres", hint: "Moody electrical dark", glyph: "◇", group: "dark" },
  { id: "cobalt2", label: "Cobalt2", hint: "Vibrant deep sapphire", glyph: "◆", group: "dark" },
  { id: "vesper", label: "Vesper", hint: "True charcoal blackout", glyph: "◐", group: "dark" },
  { id: "shades-of-purple", label: "Shades of Purple", hint: "Maximalist royal violet", glyph: "❂", group: "dark" },
  { id: "synthwave", label: "Synthwave '84", hint: "Retro outrun purple grid", glyph: "≋", group: "dark" },
  { id: "github", label: "GitHub", hint: "Familiar dark gray", glyph: "◐", group: "dark" },
  { id: "jellybeans", label: "Jellybeans", hint: "Vintage terminal dark", glyph: "◍", group: "dark" },
  { id: "base16", label: "Base16", hint: "Tomorrow Night", glyph: "▤", group: "dark" },
];

export const DEFAULT_THEME_ID = "dark";

/* ------------------------------------------------------------------ *
 *  THE GROUPS
 * ------------------------------------------------------------------ */

/**
 * THREE GROUPS, NOT TWO.
 *
 * The web app filed the palettes as light and dark, and that is the honest
 * split of the DATA — but on a phone it is not the split a reader sees.
 * Eleven of the dark palettes are black: `#000000`, `#060709`, `#08080a`,
 * `#0a0b12`, the near-blacks. The other twenty-six have a background that
 * has become a colour — a blue that is not black, a teal, a violet, a warm
 * grey. Those are not dark palettes, they are COLOURED ones, and filing
 * them with the near-blacks buried the one thing that tells them apart.
 *
 * So the split is made from the palette's own background rather than from
 * its name: a dark palette whose background is still black goes under DARK,
 * and one whose background has brightened into a colour goes under
 * COLOURFUL.
 */
export type ThemeGroup = "light" | "dark" | "colourful";

/**
 * Below this, a background still reads as black.
 *
 * Measured on the perceived brightness of the palettes' own `bg0`: graphite,
 * the lightest of the near-blacks, sits at 13; vesper, the darkest of the
 * coloured ones, at 16. So 14 is the line — and it is a line between two
 * neighbouring palettes rather than a round number pretending to be one.
 */
const BLACK_CEILING = 14;

/** The perceived brightness of a hex colour, 0–255. */
function brightness(hex: string): number {
  const match = /^#?([0-9a-f]{6})/i.exec(hex.trim());
  if (match === null || match[1] === undefined) return 0;
  const n = parseInt(match[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
}

/** The heading this palette is filed under on the appearance screen. */
export function themeGroup(meta: ThemeMeta): ThemeGroup {
  if (meta.group === "light") return "light";
  const bg = PALETTES[meta.id]?.bg0;
  if (bg === undefined) return "dark";
  return brightness(bg) <= BLACK_CEILING ? "dark" : "colourful";
}

/** The groups, in the order they are shown. */
export const THEME_GROUPS: ReadonlyArray<{ readonly id: ThemeGroup; readonly label: string }> = [
  { id: "light", label: "LIGHT" },
  { id: "dark", label: "DARK" },
  { id: "colourful", label: "COLOURFUL" },
];

export type Theme = {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
  readonly glyph: string;
  readonly group: "light" | "dark";
  /** The palette tokens, in the shape the UI consumes. */
  readonly tokens: PaletteTokens;
  /**
   * The SAME values keyed by their CSS custom-property names.
   *
   * This is what `lib/palette-colours.ts` reads, and it is what the four GL
   * engines read for their ramp and their accent derivation. It exists so
   * that the derivation ports over verbatim instead of being rewritten.
   */
  readonly css: ThemeTokens;
};

export type ThemeTokens = Readonly<Record<string, string>>;

/** CSS custom-property name for each token key. */
const CSS_NAMES: Readonly<Record<keyof PaletteTokens, string>> = {
  bg0: "--bg-0",
  bg1: "--bg-1",
  bg2: "--bg-2",
  fg: "--fg",
  fgMuted: "--fg-muted",
  fgDim: "--fg-dim",
  accentA: "--accent-a",
  accentB: "--accent-b",
  accentC: "--accent-c",
  accentInk: "--accent-ink",
  accentPure: "--accent-pure",
  accentDot: "--accent-dot",
  accentLine: "--accent-line",
  accentSoft: "--accent-soft",
  synKey: "--syn-key",
  synFn: "--syn-fn",
  synStr: "--syn-str",
  synNum: "--syn-num",
  synCom: "--syn-com",
  synVar: "--syn-var",
  synType: "--syn-type",
  ok: "--ok",
  warn: "--warn",
  danger: "--danger",
  line: "--line",
  lineSoft: "--line-soft",
  panel: "--panel",
  surfaceBar: "--surface-bar",
  surfaceHover: "--surface-hover",
  surfaceRaised: "--surface-raised",
  glassBg: "--glass-bg",
  glassConsole: "--glass-console",
  glassEdge: "--glass-edge",
  glassSheen: "--glass-sheen",
  glassTint: "--glass-tint",
  asciiLow: "--ascii-low",
  asciiHigh: "--ascii-high",
  asciiOp: "--ascii-op",
  ambLow: "--amb-low",
  ambHigh: "--amb-high",
  gradFrom: "--grad-from",
  gradMid: "--grad-mid",
  gradTo: "--grad-to",
  aiVeil: "--ai-veil",
  aiBloomVeil: "--ai-bloom-veil",
  glowAccent: "--glow-accent",
  glowAccentStrong: "--glow-accent-strong",
};

function toCssBag(tokens: PaletteTokens): ThemeTokens {
  const out: Record<string, string> = {};
  for (const key of Object.keys(CSS_NAMES) as (keyof PaletteTokens)[]) {
    out[CSS_NAMES[key]] = tokens[key];
  }
  return out;
}

export function themeMeta(id: string): ThemeMeta {
  return (
    THEME_LIST.find((t) => t.id === id) ??
    (THEME_LIST.find((t) => t.id === DEFAULT_THEME_ID) as ThemeMeta)
  );
}

/** Build the full theme for an id. Unknown ids fall back to the default. */
export function resolveTheme(id: string): Theme {
  const meta = themeMeta(id);
  const tokens = PALETTES[meta.id] ?? PALETTES[DEFAULT_THEME_ID]!;
  return {
    id: meta.id,
    label: meta.label,
    hint: meta.hint,
    glyph: meta.glyph,
    group: meta.group,
    tokens,
    css: toCssBag(tokens),
  };
}
