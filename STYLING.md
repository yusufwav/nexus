# STYLING — the Nexus design system

Everything visual in this app comes from here. It is a **living document**:
when a style changes, this file changes in the same commit, because the point
of writing it down is that the next person does not have to reverse-engineer
why a panel is tinted `0.58`.

---

## 1. The decisions

### 1.1 One typeface: JetBrains Mono

**Four weights, and nothing else.**

| Token | Family name | Used for |
| --- | --- | --- |
| `FONT.regular` | `JetBrainsMono-Regular` | body prose, worked examples |
| `FONT.medium` | `JetBrainsMono-Medium` | subheadings, labels, code |
| `FONT.bold` | `JetBrainsMono-Bold` | headings, titles, list-row titles |
| `FONT.extraBold` | `JetBrainsMono-ExtraBold` | the wordmark, the biggest title |

**Why monospace everywhere.** The web app paired Inter with JetBrains Mono,
which on a phone reads as two products on one screen. More importantly the
notes *are* mathematical — `lim(x→2) f(x)`, `f'(x) = 2x + h` — and a
monospace face sets them in a column. That column is what makes a worked
example legible. The hierarchy comes from weight, size and letter-spacing,
never from a second typeface.

**The weights are family names, not `fontWeight`.** Android resolves
`fontWeight` against the family, and a family registered from one file has
no bold variant to find — so `fontWeight: "700"` either does nothing or
smears. Each weight is registered under its own family name and selected
with `fontFamily` alone.

### 1.1a Two families, and the second one is only for numbers

**Nova Mono sets the numbers, and only the numbers.**

| Token | Family name | Used for |
| --- | --- | --- |
| `FONT.nova` | `NovaMono-Regular` | every figure the app shows |

A price, a count, a percentage, a date, a course code, a question number —
all of them are set in Nova Mono, and everything around them stays in
JetBrains Mono. The split is done by `splitNumericRuns` in
`src/theme/typography.ts`, and the shared text primitives in
`src/components/ui.tsx` apply it, so a screen gets it for free.

**A FIGURE IS NOT JUST ITS DIGITS.** The characters that name a number
travel with it:

| Written | Set in Nova Mono |
| --- | --- |
| `R50` | the whole thing — the rand sign is part of the amount |
| `STAS102` | the whole thing — a course code is one figure |
| `42%` | the whole thing — the percent sign belongs to the number |
| `12 Mar 2026` | `12` and `2026`; the month is a word |
| `3 questions` | `3`; the word is a word |

The letters only count when they are stuck to the digits with no space
between them, which is what separates `R50` and `STAS102` from a word that
happens to end in a number.

**Why a second family at all.** Nova Mono's cap height is 0.74em against
JetBrains Mono's 0.73em, so a figure set in it sits ON the line rather than in
it, and its advance is narrower — 0.562em against 0.6em — so a digit reads as
data rather than as a letter. It has ONE weight, so a number in a bold
heading is regular-weight Nova Mono; that is the trade the family asks for.

**Two exceptions.** The tutor's chat is left in the app's face, because a
message is something somebody wrote and the figures in it are part of the
sentence. And a worked example's code block stays in one face, because the
lines in it are aligned by hand and a second font would shift the columns.

**The scale** lives in `src/theme/typography.ts` as `TYPE`. JetBrains Mono
is a wide face (~0.6em per character against Inter's 0.5em), so the sizes sit
a notch below where the proportional equivalents would, and the
letter-spacing is tightened to keep long headings from running wide.

| Role | Size / line | Weight |
| --- | --- | --- |
| `TYPE.display` | 30 / 36 | extraBold |
| `TYPE.title` | 23 / 29 | bold |
| `TYPE.heading` | 17 / 23 | bold |
| `TYPE.subheading` | 14 / 20 | medium |
| `TYPE.body` | 14 / 21 | regular |
| `TYPE.small` | 12 / 18 | regular |
| `TYPE.label` | 10 / 14, tracking 1.4, uppercase | medium |
| `TYPE.code` | 12 / 18, tracking 0.2 | medium |
| `TYPE.mono` | 13 / 21 | regular |

### 1.2 Rounded corners

Every surface in the app is rounded, and there are only **two** roundnesses.
They live in one place — `RADIUS` in `src/theme/radius.ts` — because the
moment corners are round the questions come back: how round is this one, is
this one the same as that one, is this button the same radius as that card. A
scale answers them once.

| Name | Points | What it is for |
| --- | --- | --- |
| `RADIUS.panel` | **12** | a surface that holds content — a card, a panel, a sheet, a list row |
| `RADIUS.control` | **8** | something you press — a button, an input, a chip, a segmented switch |

A surface takes `RADIUS.panel` unless it is something you press, in which
case it takes `RADIUS.control`. A chat bubble is neither: a conversation
has its own scale, and it is allowed to be its own thing.

**Why 8 and not 12 for a control.** A 48-point button with a 12-point radius
is a pill, and a pill is a shape with a meaning — a segmented control, a tab
bar. A button that looks like one is lying about what it is.

**The radius is still a PROP.** `GlassPanel`, `Card` and `TerminalPanel`
all take `radius`, and it defaults to `RADIUS.panel`. A container that
wants a different curve asks for one.
### 1.3 One container

Every panel in the app is `GlassPanel` (`src/components/ui/GlassPanel.tsx`).
The treatment is layered, bottom to top:

| # | Layer | What it is |
| --- | --- | --- |
| 1 | **Fill** | the palette's own `bg1` — the raised surface, one step off the page |
| 2 | **Grain** | the fractal-noise tile, tiled, at a strength-dependent opacity |
| 3 | **Edge** | a hairline in the palette's own `line` colour, plus a one-pixel sheen along the top |
| 4 | **Corners** | `RADIUS.panel`, unless the caller says otherwise |
| 5 | **Content** | the padding and whatever is inside |

**THE EDGE IS NOT IN THE ACCENT COLOUR.** It was, once, and it read as a
red rim drawn around every surface in the app — a hairline so small that on
most of the palettes it looked like a rendering fault rather than a
decision. The accent is for the things the accent is FOR: the thing that is
selected, the thing that is live, the one thing on a screen that matters. A
border on every panel is not that. The hairline is `line`, the same one
every input and every list row already uses.

**The fill is OPAQUE.** The page behind a panel is a flat colour, so there is
nothing behind it to show through: a translucent fill would have nothing to
transmit and would read as a smudge rather than as a material. The panel is
`bg1` and the page is `bg0` — the palette's own two surfaces, one step
apart, which is the whole of the separation.

**The `strength` prop is the step between them.** `soft` is a barely-there
step off the page, `solid` is the furthest the palette's own surfaces go.
The three names are kept because the panels are the same component whatever
they are sitting on, and the caller says how far it should stand out.

**The grain goes on the container and nowhere else.** That is the rule, and
it comes straight from the reference: https://hermes-agent.nousresearch.com/
overlays a fractal-noise tile on its containers and never on the page. Grain
over a large flat area reads as dirt; grain over a small panel reads as a
material.

**An SVG has to be told its size.** An `<svg>` has an *intrinsic* size —
300 by 150 on the web — and a browser will not stretch an absolutely
positioned one, because its aspect ratio has to be preserved. Every SVG in
the app therefore carries `width: "100%"` and `height: "100%"` as well as
its absolute position, or it renders as a 300 by 150 rectangle in the top
left of its container.

### 1.4 The terminal panel

`TerminalPanel` (`src/components/ui/TerminalPanel.tsx`) is the README
container from the web app's landing page, rebuilt for a phone. It is a
*shell* rather than a page:

* it carries **no text of its own** — the body is `children`, so the same
  container can hold the README, a lesson summary, a worked example or a
  test fixture;
* it has **no fixed height** — the bar is chrome and the body grows with
  what is put in it, so the container is exactly as tall as its content;
* the surface underneath is `GlassPanel`, so the panel is the app's one
  container treatment and this component only adds the terminal's chrome.

**The bar.** Three dots and nothing else. There is no path, no window
title, no filename — a desktop metaphor that means nothing on a phone, and
a second thing to keep in sync. The bar is deliberately small:

| | |
| --- | --- |
| Padding | 6 vertical, 8 horizontal |
| Dot | 5 × 5, radius 2.5 |
| Dot gap | 3 |
| Bar height | 6 + 5 + 6 + 1 hairline = **18** |

**The corners** are rounded at **12 points**, which is this container's one
exception to §1.2. The web app's terminal had a 10px radius; 12 is the same
idea at the app's own scale, and it matches the radius the tutor's message
bubbles already use, so the rounded surfaces in the app agree with each
other.

### 1.4a The system bars

The status bar is **the header's colour**, not a strip of its own. The reader
sees the clock, the battery and the signal sitting on the same surface as the
bar directly below them, with no seam between them.

**ON ANDROID THE NAVIGATION PROPS DO NOTHING.** React Navigation's native
stack has `statusBarTranslucent` and `statusBarBackgroundColor`, and they
look like the answer. They are not: `react-native-screens` implements both of
them as **no-ops on Android** —

```kotlin
// mark: iOS-only
override fun setStatusBarColor(view: Screen, value: Int?) = Unit
override fun setStatusBarTranslucent(view: Screen, value: Boolean) = Unit
```

— so on Android the strip belongs to the **native window**, and the native
window's colour is `android:windowBackground`.

**AND `android:windowBackground` IS A BUILD-TIME CONSTANT.** It comes from
`app.json`'s `android.backgroundColor`, which is baked into the APK. A
build-time constant cannot follow a palette the reader picks at runtime, and
this app has fifty-two of them — so a hard-coded colour in `app.json` is
wrong on fifty-one of them, which is exactly the bug this section used to
have: the window was `#000000` and every light palette showed a black strip
above a white app.

**So the colour is set AT RUNTIME.**
`src/components/NativeWindowBackground.tsx` watches the active theme and
writes the theme's colour into the window's decor view with
`SystemUI.setBackgroundColorAsync`. It is a component rather than a hook
because it has to live inside the `ThemeProvider` — the theme is the thing it
is watching.

**THE COLOUR IS THE HEADER'S, FLATTENED.**
`surfaceRaised` is a *translucent* white on a dark palette, and the native
window has nothing behind it to show through to, so it is **composited
against the page's `bg0`** first. What reaches the window is the flat
colour the reader would have seen on the screen anyway.

**`app.json` still sets a `backgroundColor`**, because it has to: it is what
the window is before the app's JavaScript has run, so it is what the reader
sees during the splash screen. It is the **default palette's** header colour
(`#050505` — `surfaceRaised` over `bg0` for the `dark` palette), and the
runtime call takes over from it as soon as the theme is known.

**The navigation theme is the app's theme.** React Navigation ships a
LIGHT theme and paints its `background` behind the screens — a pale grey,
`rgb(242, 242, 242)`. The app never overrode it, so that grey showed
through wherever the app did not paint, which on the web is the whole
page. Every colour in the navigation theme comes from the active palette,
so it is right on all fifty-two of them.

**`statusBarTranslucent` is iOS-only.** React Navigation's native stack
takes it, and it makes the content run under the status bar on iOS — but
`react-native-screens` implements it as a **no-op on Android**
(`setStatusBarTranslucent(...) = Unit`). It is set anyway, because it is
the correct thing to ask for on the platform that honours it, and it costs
nothing on the one that does not.

**On Android the screen's own root view is what covers the bar.** The
navigator's container lays its children out at the full window size, and
each screen's root is `flex: 1` in `bg0`, so the app's own colour reaches
the top of the window. What was showing through was the navigator's
background in the strip the app did not paint — which the navigation theme
fixes.

**The icons follow the theme.** Light icons on a dark page, dark icons on a
light one, from `expo-status-bar`'s `style`.

**The drawer is allowed to cover it.** The drawer's panel starts at the top
of the window, so when it is open the status bar sits on the drawer's own
surface — which is right, because the drawer is a page that has arrived
over the app.

### 1.4b The screen header

`ScreenHeader` (`src/components/ui/ScreenHeader.tsx`) is the bar at the top of
every screen. It is **the terminal's own bar, made bigger** — the same three
dots in the same place, the same raised surface, the same hairline along the
bottom edge — and it reaches **up into the status bar**, so the status bar's
background is the header's background and there is no seam between them.

| | Terminal panel's bar | Screen header |
| --- | --- | --- |
| Dot | 5 × 5, radius 2.5 | **8 × 8**, radius 4 |
| Dot gap | 3 | **5** |
| Bar height | 18 | **44** (+ the status bar's inset) |
| Surface | `surfaceRaised` | `surfaceRaised` |
| Edge | hairline along the bottom | hairline along the bottom |

**The title is centred across the WHOLE bar**, not across the space the dots
leave. The dots are in the row's own flow on the left and the title is an
absolutely-positioned overlay across the full width, so the title is in the
middle of the *screen* rather than in the middle of the gap.

**The title is a step down from the screen's own headline.** A bar is a bar
and not a headline: `TYPE.subheading` (14/20) rather than `TYPE.title`
(23/29), exported as `HEADER_TITLE` so the greeting on the home screen is set
in exactly the same way as every other screen's title.

**The header owns the top inset, so no screen pads for it.** Every screen
that has a header drops its own `paddingTop: insets.top + n`; the header is
outside the scroll view and carries the inset itself. The side menu's button
is aligned to the same line, so the dots, the title and the menu icon are all
on one row of chrome.

**The greeting collapses the home screen's README container.** Tapping the
greeting on the home screen animates the README container's height to zero —
the container is *put away* and the content below it moves up to take its
place, rather than sliding about. It is a height animation because the thing
that has to happen is the container **leaving the space it was in**.

### 1.5 The side menu

The drawer is a **full-height panel in the palette's own surface colour**,
and it is the one container in this app that is **not** a `GlassPanel`.
That is deliberate. A drawer is a page that happens to slide in, and the
reference it is built from (`IDEAS/components/staggered-menu`) is an opaque
slab too. So the panel is `bg1` — the palette's own surface, near-black on
the dark palettes and white on the light ones — with a hairline in the
accent colour down its leading edge.

The two slabs of colour behind it are the palette's own accents, and they
are only ever seen for the four hundred milliseconds it takes the panel to
land on top of them. That is the reference's trick and it is worth keeping:
the panel arrives on a wipe of the palette's own colour.

The items are **44 points of JetBrains Mono Bold, uppercase**, and the
number beside each one is the accent colour, small, and set just past the
end of the label — so the numbers do not line up in a column, which is the
look.

The drawer is a **global overlay**, mounted in the root layout rather than
in a screen, because it has to cover the tab bar: that bar is the thing
this menu is on its way to replacing, and a drawer that stopped short of it
would be replacing nothing.

**Its motion is Reanimated**, and the timings are the reference's: two
colour slabs 0.07s apart, the panel landing 0.08s after the last one over
0.65s, the items sliding up out of their own clipping boxes 0.1s apart,
the numbers fading in behind them, and the whole thing closing in 0.32s.

The items travel as ONE shared value and each takes the slice of it that
belongs to its own start time — which is what a stagger is, expressed as
arithmetic. `Animated` with the native driver cannot do that: it needs the
animated values attached to a view whose props do not change, and a
re-rendered component's props do change, so the drawer arrives in one frame
instead of over one second. Reanimated has no such problem, and the web
preview animates too.


---

### 1.6 The maths

The tutor's answers are written in LaTeX, and the maths is **set by the
app** — parsed, laid out and drawn here, not by a library.

**THE WEB APP USES KATEX.** Streamdown's math plugin runs KaTeX, which
makes HTML and CSS, and the browser draws it. That is the right answer
for a page.

**HERE IT IS A BOX LAYOUT ENGINE.** `src/lib/latex/` is a symbol table, a
parser and a layout engine, and `src/components/Math.tsx` draws the
result with `<Text>` and `<View>`. No WebView, no KaTeX, no
dependency.

**WHY, WHEN KATEX EXISTS.** The first reason is the whole answer:

* **React Native cannot lay maths out.** There is no `View` inside a
  `<Text>`, and in the New Architecture a nested `<Text>` is a SPAN —
  `TextProps` does not extend `ViewProps` — so it cannot be transformed
  or repositioned. A superscript cannot be raised inside a paragraph, and
  a fraction cannot be built out of one. Something has to do the layout.
* **A WebView per equation is a WebView per equation**, and a chat can
  have a dozen on the screen at once.
* **It is the app's rule**: everything is native, and nothing needs a
  network.

**THE UNLOCK IS THE TYPEFACE.** The app's face is monospace, so every
glyph has the same advance and a run of text has an EXACT width. The
layout is therefore ARITHMETIC rather than measurement: a fraction's
numerator is centred on a rule that was never measured, and there is no
`onTextLayout`, no second pass, and nothing to get wrong on a device
that is not there.

`scripts/generate-font-metrics.mjs` reads the font files and writes
`src/theme/font-metrics.ts`: the advance, the ascent, the descent, the
cap height — and **the characters the font does not have**, which is
fifteen of them. Every command that needs one has a documented fallback,
because a missing glyph comes out as a BOX and a page of boxes is worse
than a page of plain text.

**THE TWO SIZES.** Inline maths is set at the prose size, 14, so it
belongs to the sentence around it. A displayed equation is set at 15 and
given room above and below, because it is a thing the reader stops at.

**THE VARIABLES ARE ITALIC.** A letter is a quantity and `sin` is a
name, and the difference between them is a hundred years of convention.
JetBrains Mono has no italic file, so the slant is synthesised by the
platform; if a platform ever declines to, the run reads upright, which is
degraded but not broken.

**THE FIGURES ARE NOVA MONO**, because that is the app's rule for a run
of digits, and a digit in an equation is a figure.

**THE LINE WITH MATHS IN IT IS NOT A PARAGRAPH.** A paragraph is one
`<Text>`, which wraps. A line with an equation in it cannot be, because
an equation is a box of its own — so that line becomes a row of pieces,
each put on the prose's baseline by a computed margin. A line with no
maths is left exactly as it was.

**A PRICE IS NOT MATHS.** A dollar sign opens inline maths, so a price
written with one would open a formula that never closes. The splitter
refuses a span that is closed but does not look like maths — a bare
number, a span with a space at either end, a span that is not closed —
so the dollar sign stays a dollar sign and nothing after it is swallowed.

## 2. The grain

### 2.1 Where it came from

The reference site's stylesheet does it with an inline SVG:

```css
--hw-noise-tile: 12.8rem;
--hw-noise-bg: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' …%3E
  %3Cfilter id='n'%3E
    %3CfeTurbulence type='fractalNoise' baseFrequency='0.72'
      numOctaves='4' stitchTiles='stitch'/%3E
    %3CfeColorMatrix type='matrix'
      values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 1 1 0 -1.55'/%3E
  %3C/filter%3E
  %3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");

.hw-noise::after {
  background-image: var(--hw-noise-bg);
  background-repeat: repeat;
  background-size: var(--hw-noise-tile) var(--hw-noise-tile);
  opacity: .9;
  pointer-events: none;
  position: absolute;
  inset: 0;
}
```

### 2.2 What React Native does instead

React Native has no `feTurbulence` and no `background-repeat`. So the tile
is **generated once, at build time**, and tiled at runtime by an
`<Image resizeMode="repeat">`.

`scripts/generate-grain.mjs` reproduces the maths exactly:

* `fractalNoise` at `baseFrequency 0.72` with `numOctaves 4` is four
  octaves of gradient noise, each at twice the frequency and half the
  amplitude of the one below, summed, divided by the amplitude sum, and
  remapped from `[-1, 1]` to `[0, 1]`;
* `stitchTiles="stitch"` is what makes the tile seamless, so the Perlin
  lattice is wrapped at the period;
* the colour matrix maps the three noise channels to opaque white and sets
  **alpha** to `R + G + B - 1.55`, which is what turns noise into sparse
  bright specks rather than a grey wash;
* the PNG is written by a hand-rolled encoder (`zlib` + the four PNG
  chunks), so the app has no runtime image dependency.

```bash
npm run grain           # regenerate the tiles
npm run preview-grain   # composite them over a panel colour and look at them
```

### 2.3 The two tiles

| File | Colour | Used on |
| --- | --- | --- |
| `assets/images/grain-light.png` | white specks | a **dark** palette |
| `assets/images/grain-dark.png` | black specks | a **light** palette — white grain would be invisible, black grain reads as the tooth of the paper |

### 2.4 The opacity

| Palette | Overlay opacity |
| --- | --- |
| dark | 0.14 |
| light | 0.10 |

The reference site uses `0.9` on an overlay whose alpha is already sparse
and adds it with `mix-blend-mode: plus-lighter`. React Native has no
`plus-lighter`, so the grain is composited normally and the opacity is set
lower to compensate. The numbers above are tuned against the preview, not
guessed.

---

## 3. Colour

The palette is data, not CSS. `src/theme/palettes.generated.ts` holds the
52 palettes the web app defines, extracted from its stylesheets by
`scripts/extract-palettes.mjs`.

The tokens a screen uses:

| Token | Used for |
| --- | --- |
| `bg0` | the page |
| `bg1` | raised surfaces |
| `bg2` | the deepest surface |
| `fg` | primary text |
| `fgMuted` | secondary text |
| `fgDim` | tertiary text, labels |
| `accentA` | the accent: primary actions, the active state |
| `accentB` / `accentC` | the other two accents, for gradients and swatches |
| `ok` / `warn` / `danger` | semantic states |
| `line` | hairline borders |
| `lineSoft` | the hairline under a list row |
| `surfaceRaised` | a control's own fill |
| `surfaceHover` | a control's hover fill |

The four background engines read the **same** tokens, as a CSS-name-keyed
bag (`theme.css`), which is the shape the web app's own
`lib/palette-colours.ts` already expected.

### 3.1 The theme picker

The appearance screen's swatch is a **bar of the palette's three accents**,
side by side, filling it — 24 points tall, a third of what the swatch used
to be.

It used to be a miniature of the theme: the palette's own background, its
own little mark in the corner, and three dots of its accents, with the name
inside. That was a preview of a screen in order to sell a colour, and the
preview was three times the size of the thing it was selling. The bar is
what the palette actually is — three accents and a name — and the name sits
**underneath** it, where it has room to be read.

No background, no mark, no tick. The selected palette is called out by its
border and its name instead: a tick painted inside the bar would be a
fourth colour, and the bar is three of the palette's own.

### 3.2 Three groups, not two

The palettes are filed under **LIGHT**, **DARK** and **COLOURFUL**, and the
split is made from the palette's own background rather than from its name.

Eleven of the dark palettes are black — `#000000`, `#060709`, `#08080a`,
`#0a0b12`, the near-blacks. Thirty have a background that has become a
colour: a blue that is not black, a teal, a violet, a warm grey. Those are
not dark palettes, they are **coloured** ones, and filing them with the
near-blacks buried the one thing that tells them apart.

The line is a brightness of 14 out of 255 on the palette's `bg0`
(`src/theme/themes.ts`): graphite, the lightest of the near-blacks, sits at
14; vesper, the darkest of the coloured ones, at 16.

---

## 4. Icons

Every icon is a **lucide** icon, drawn through the one component in
`src/components/icons.tsx`. The web app draws its icons from lucide too,
through shadcn's registry, so this is the port keeping two platforms on one
set of shapes.

```tsx
import { Icon } from "@/components/icons";

<Icon name="chevronRight" size={18} tone="accent" />
```

**The registry is the catalogue.** `ICONS` in `src/components/icons.tsx` maps
a name that means something in this app (`trash`, not `Trash2`) to a lucide
component. A screen never imports from `lucide-react-native` directly, so
there is one place to look, one place to change, and no way for one screen
to drift off the shared sizing and stroke.

**No typographic glyphs.** This app used to draw its icons as characters —
`⌂`, `▤`, `✓`, `✦`, `◉`, `›`, `‹`, `☰`, `↻`, `⌫`, `↑` — typed into `Text`
nodes. A glyph is a character, so it inherits the font, so it inherits the
font's metrics, so it sits differently on every platform that draws JetBrains
Mono a slightly different way, and it cannot be tinted per theme. An icon is
a vector: one weight, one size, one colour, everywhere.

**The sizes.** Lucide draws on a 24-unit grid.

| Size | Used for |
| --- | --- |
| 14 | a mark inside a line of text |
| 16 | a list row's trailing mark, the eye on a password field |
| 18 | a chevron, the send arrow |
| 20 | a control in a header, a mark in the tab bar |

**The stroke is 1.75**, not lucide's default 2. The default is right for a
proportional UI; this one is monospaced and engineered, and a hair thinner
keeps a 20px mark from reading as a smudge. It is a default, not a rule —
pass `strokeWidth` when a mark has to carry more weight than its neighbours.

**The tones.** `tone` names a palette token rather than a colour: `fg`,
`muted`, `dim`, `accent`, `danger`, `ok`, `warn`, `inverse`. A mark that
needs a colour the palette does not name — a theme swatch's own accent —
passes `color` instead, which wins over the tone.

**Lucide has no brand marks.** The three sign-in providers are placeholders
that say so when tapped, so their icons are the nearest honest thing lucide
draws: a globe for Google, a branch for GitHub, a window for Microsoft.

**The theme swatches have lost their characters.** The little mark that used
to sit in the corner of each of the 52 palette swatches — `☾`, `❄`, `❂`, `◐`
— was a decorative character, not an icon, and it is gone: the swatch is
three colour bands and a name now, and the mark was decoration on top of
decoration. See §3.1.

---

## 5. Spacing and rhythm

| Token | Value | Used for |
| --- | --- | --- |
| screen gutter | 18 | the horizontal padding of a screen |
| panel padding | 22 | a `GlassPanel`'s inner padding |
| card padding | 16 | a `Card`'s inner padding |
| section gap | 26 | between sections |
| row gap | 10–14 | between list rows |
| control height | 48 | every button and input |
| icon control | 40 | square icon-only buttons |
| tab bar | 48 | the bottom bar, plus the safe area |
| theme swatch | 24 | the bar of three accents |

**Tap targets are 48 points.** Not 44 — 48, because these are small screens
held one-handed and a thumb is worse than a finger.

**There is no tab bar.** It was there, and it was icons only, and now it
is gone: the side menu is the app's navigation, and a drawer that slides in
from the right edge — a thing a thumb reaches for, and can swipe open
without looking — is a better use of the bottom of the screen than five
marks that are always there. The five screens keep their own state and
their own place in the back stack; what is gone is the bar.

**The side menu opens on a swipe from the right edge**, and it FOLLOWS the
finger while it happens. The edge is the right 48 points of the screen,
and the gesture is a horizontal pan that gives up if it turns out to be a
scroll. It is gesture-handler rather than a `PanResponder`, because a
`PanResponder` can only have a gesture that nothing else wanted — and a
screen is mostly buttons and list rows, which claim the touch first.

**Everything is a unitless number.** React Native's unit is the density-
independent pixel, so there are no `pt`, `dp` or `sp` suffixes anywhere.

---

## 6. Motion

* The GL fields animate; the UI does not. A panel that slides in over a
  moving background is two movements competing.
* The only UI motion is the press state: a `Pressable` at `opacity: 0.7`
  (or `0.65` on a list row), which is instant and reads as a physical
  surface.
* **Reduced motion** is honoured by all four engines — they freeze on a
  composed frame rather than stopping mid-animation. The flag is in the
  **You** tab.
* **The side menu still travels with reduced motion on**, briefly and
  without the flourishes: no tilt on the items, no spin on the mark. The
  flag's scope is the engines, which move constantly; a drawer is the
  response to a tap, and one that teleports is worse than one that slides.

---

## 7. Haptics

Sparse, and only for two things:

| Action | Feedback |
| --- | --- |
| Answering a practice question | `Medium` for right, `Light` for a miss |
| Sending a message to the study partner | `Selection` |
| Tapping a placeholder provider | `Notification: Warning` |

Nothing else. A haptic on every tap is a haptic you stop noticing, and a
haptic you stop noticing is a haptic that only annoys the people who did
notice.

---

## 8. Where things live

| Thing | File |
| --- | --- |
| The type scale and the font families | `src/theme/typography.ts` |
| The container | `src/components/ui/GlassPanel.tsx` |
| The terminal container | `src/components/ui/TerminalPanel.tsx` |
| The shared primitives | `src/components/ui.tsx` |
| The side menu | `src/components/SideMenu.tsx` |
| The icon registry | `src/components/icons.tsx` |
| The palettes | `src/theme/palettes.generated.ts` |
| The theme context | `src/theme/ThemeProvider.tsx` |
| The grain tiles | `assets/images/grain-{light,dark}.png` |
| The grain generator | `scripts/generate-grain.mjs` |
| The README preview | `scripts/preview-readme.mjs` |
| The maths renderer | `src/components/Math.tsx` |
| The maths engine | `src/lib/latex/` |
| The font's own metrics | `src/theme/font-metrics.ts` |
| The metrics generator | `scripts/generate-font-metrics.mjs` |
| The maths preview | `scripts/preview-latex.mjs` |

---

## 9. Changing something

**A new panel?** Use `GlassPanel` or `Card`. Do not hand-roll a background.
If the treatment needs to differ, add a `strength` — do not add a variant.

**A new text style?** Add a role to `TYPE`. Do not set `fontSize` and
`fontWeight` at the call site; the scale exists so that the hierarchy is
consistent, and a call-site override is how it stops being.

**A new colour?** It belongs in the palette, which means it belongs in the
web app's stylesheet and then in `palettes.generated.ts`. A colour that only
exists in the mobile app is a colour the two platforms will drift on.

**A new destination in the drawer?** Add it to `ITEMS` in
`src/components/SideMenu.tsx`. The drawer and the tab bar are meant to agree
about what the app contains, so a new tab is a new drawer item too.

**A new icon?** Add it to `ICONS` in `src/components/icons.tsx` under a name
that means something, and draw it with `<Icon />`. Do not import from
`lucide-react-native` at the call site, and do not reach for a character
that looks like the mark — see §4 for why.

**The grain changed?** Regenerate the tiles and look at the preview. The
numbers in §2.4 were tuned against it, not guessed.
