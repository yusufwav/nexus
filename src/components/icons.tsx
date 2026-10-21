/**
 * THE ICONS
 * ---------------------------------------------------------------------------
 * Every icon in this app is a lucide icon, and every lucide icon in this app
 * is registered here.
 *
 * WHY ONE FILE
 * ---------------------------------------------------------------------------
 * The web app draws its icons from lucide, through shadcn's icon registry.
 * This app used to use neither: it used typographic glyphs — `⌂`, `▤`, `✓`,
 * `✦`, `◉`, `›`, `☰` — typed into `Text` nodes as if a monospace font were
 * an icon set. That works until it does not: a glyph is a character, so it
 * inherits the font, so it inherits the font's metrics, so it sits differently
 * on every platform that draws JetBrains Mono a slightly different way. It
 * also cannot be tinted per theme, scaled without breaking the line, or given
 * an accessible name.
 *
 * Lucide is SVG, so an icon is a vector: one weight everywhere, one size
 * everywhere, one colour everywhere, and a name a screen reader can read.
 *
 * THE RULE
 * ---------------------------------------------------------------------------
 * Icons are imported from HERE and nowhere else:
 *
 *     import { Icon } from "@/components/icons";
 *     <Icon name="chevronRight" size={18} tone="accent" />
 *
 * If a screen needs an icon that is not registered, add it to `ICONS` below
 * with a NAME THAT MEANS SOMETHING ("trash", not "Trash2"), and use the name.
 * The registry is the whole catalogue: one place to look, one place to
 * change, and no screen importing from `lucide-react-native` directly and
 * drifting off the shared sizing and stroke.
 *
 * THE SIZING
 * ---------------------------------------------------------------------------
 * Lucide draws on a 24-unit grid. The sizes here are the ones the app uses:
 * 14 for a mark inside a line of text, 16 for a list row's trailing mark,
 * 18 for a chevron, 20 for a control in a header or a tab bar. Anything
 * larger than 22 is a picture, not an icon, and belongs in the DOM fields.
 *
 * The stroke is 1.75 rather than lucide's default 2. The default is right
 * for a proportional UI; this app is monospaced and engineered, and a hair
 * thinner keeps a 20px mark from reading as a smudge at the density this app
 * is designed for. It is a default, not a rule — pass `strokeWidth` when a
 * mark needs to carry more weight than its neighbours (a selected tick, say).
 */
import {
  AppWindow,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleUserRound,
  Eye,
  EyeOff,
  GitBranch,
  Globe,
  House,
  Library,
  ListChecks,
  MessagesSquare,
  Menu,
  MonitorSmartphone,
  RotateCcw,
  Server,
  Sparkles,
  Square,
  Trash,
  X,
  type LucideIcon,
} from "lucide-react-native";
import type { ColorValue, StyleProp, ViewStyle } from "react-native";

import { useActiveTheme } from "@/theme/ThemeProvider";
import type { Theme } from "@/theme/themes";

/**
 * THE CATALOGUE.
 *
 * The key is what the icon IS in this app, not what lucide happens to call
 * it: `trash` rather than `Trash2`, so the registry survives lucide
 * renaming an icon between versions.
 */
export const ICONS = {
  /* ---- the tab bar ---- */
  /** Home — the overview. */
  home: House,
  /** Modules — the catalogue. */
  modules: Library,
  /** Practice — the question bank. */
  practice: ListChecks,
  /** Tutor — the study partner. */
  tutor: Sparkles,
  /** You — the account, the theme and the storage. */
  account: CircleUserRound,

  /* ---- navigation ---- */
  /** The chevron on a back link. */
  chevronLeft: ChevronLeft,
  /** The chevron that says "this row opens something". */
  chevronRight: ChevronRight,
  /** The menu — three lines, and the way into the side menu. */
  menu: Menu,
  /** The cross that closes it. */
  close: X,

  /* ---- actions ---- */
  /** Chat history — the list of saved conversations. */
  history: MessagesSquare,
  /** Start a new conversation. */
  newChat: RotateCcw,
  /** Delete this conversation. */
  trash: Trash,
  /** Stop what is being streamed. */
  stop: Square,
  /** A tick. */
  check: Check,
  /** Show what is hidden — a password, mostly. */
  eye: Eye,
  /** Hide what is shown. */
  eyeOff: EyeOff,
  /** The send arrow. */
  arrowUp: ArrowUp,
  /** "Go" — somewhere this takes you. */
  arrowUpRight: ArrowUpRight,

  /* ---- settings ---- */
  /** "Match system" — the operating system's own setting. */
  system: MonitorSmartphone,
  /** A model provider — somewhere the tutor's key is sent. */
  provider: Server,

  /* ---- sign-in providers ---- */
  /** Google. Lucide has no brand marks, so this is the globe it started as. */
  google: Globe,
  /** GitHub. The branch, which is what the name comes from. */
  github: GitBranch,
  /** Microsoft. The window of the desktop it runs on. */
  microsoft: AppWindow,
} as const satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/**
 * The colours an icon may take, named after the palette's own tokens.
 *
 * `tone` is a shortcut for "the obvious token for this mark": an accent
 * chevron, a dim caption, a danger delete. A mark that needs a colour the
 * palette does not name — a theme swatch's own accent, say — passes `color`
 * instead, and that wins over the tone.
 */
export type IconTone =
  | "fg"
  | "muted"
  | "dim"
  | "accent"
  | "danger"
  | "ok"
  | "warn"
  | "inverse";

function toneColor(tone: IconTone, tokens: Theme["tokens"]): string {
  switch (tone) {
    case "muted":
      return tokens.fgMuted;
    case "dim":
      return tokens.fgDim;
    case "accent":
      return tokens.accentA;
    case "danger":
      return tokens.danger;
    case "ok":
      return tokens.ok;
    case "warn":
      return tokens.warn;
    case "inverse":
      // The ink on a filled control: the page background, which is what the
      // button behind an accent mark is painted with.
      return tokens.bg0;
    case "fg":
    default:
      return tokens.fg;
  }
}

/**
 * THE ICON.
 *
 * One component for every mark in the app, so the size, the stroke and the
 * colour are decided in one place rather than at each call site.
 */
export function Icon({
  name,
  size = 20,
  color,
  tone = "fg",
  strokeWidth = 1.75,
  style,
}: {
  /** The registered name of the mark. */
  name: IconName;
  /** The edge of the square it is drawn in, in points. */
  size?: number;
  /** An explicit colour, which wins over the tone. */
  color?: ColorValue;
  /** Which of the palette's tokens to draw it in. */
  tone?: IconTone;
  /** The weight of the line. */
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
}): React.JSX.Element {
  const theme = useActiveTheme();
  const Glyph = ICONS[name];

  return (
    <Glyph
      size={size}
      color={color ?? toneColor(tone, theme.tokens)}
      strokeWidth={strokeWidth}
      style={style}
    />
  );
}
