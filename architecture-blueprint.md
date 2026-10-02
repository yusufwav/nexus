# Nexus Architecture Blueprint

This document records the file locations and design-token mapping for the Nexus landing page so the next features can build on a known surface.

---

## 1. File map

### 1.1 Shared design tokens

| Path | Purpose |
| --- | --- |
| `packages/ui/src/styles/globals.css` | All design tokens, glassmorphism variables, Helvetica scale, matrix/marquee/numbered-list/scrollbar utilities, strict `#000`/`#FFF`/`#00E5FF` palette. |
| `apps/web/src/index.css` | Single re-export of `packages/ui` globals. The only CSS file `app/layout.tsx` pulls in. |

> Per project rule #1, no global CSS or Tailwind theme lives inside `apps/web/`.

### 1.2 Landing-page components

| Path | Role | Type |
| --- | --- | --- |
| `apps/web/src/components/landing/hero.tsx` | Split-front hero. Right-side centered glassmorphism pane over a video + cyan radial fallback. Bottom fade-to-black gradient transitions into the next section. | Server component. |
| `apps/web/src/components/landing/ticker-marquee.tsx` | AI-usages ticker with edge fade masks and infinite horizontal scroll. | Server component. |
| `apps/web/src/components/landing/mission-body.tsx` | Centered mission text. Numbered list uses `.nexus-numbered` so item text stays centered despite markers. | Server component. |
| `apps/web/src/components/landing/modules-container.tsx` | Two-row staggered horizontal scroller of glassmorphic module cards, randomized so consecutive codes never sit in the same row. | Server component. |
| `apps/web/src/components/landing/reviews-section.tsx` | Slow-scrolling glassmorphic review cards (avatar, stars, 2-6 word headline, 3-line body). | Server component. |
| `apps/web/src/components/landing/matrix-rain.tsx` | Slow-falling Matrix digital rain overlay behind the page. DPR-aware canvas. | Client component. |

### 1.3 Page assembly

| Path | Role |
| --- | --- |
| `apps/web/src/app/page.tsx` | `/` route. Renders `MatrixRain` once at the root, then `Hero -> TickerMarquee -> MissionBody -> ModulesContainer -> ReviewsSection` inside a scrollable container with hidden scrollbar. |
| `apps/web/src/app/layout.tsx` | Root layout. Provides `<Header />` and `<Providers />`. The landing page is `{children}`. |

---

## 2. Design-token map (strict palette)

| Token | Value | Used by |
| --- | --- | --- |
| `--background` | `#000000` | Every section base. |
| `--foreground` | `#FFFFFF` | All body text. |
| `--nexus-cyan` | `#00E5FF` | Single accent. Headlines, badges, stars, hover, divider strokes. |
| `--nexus-cyan-soft` | `rgba(0, 229, 255, 0.6)` | Hover-only strokes. |
| `--nexus-cyan-faint` | `rgba(0, 229, 255, 0.15)` | Subtle accents (e.g. avatar fill). |
| `--glass-border` | `rgba(255, 255, 255, 0.08)` | `.glass` borders. |
| `--glass-border-strong` | `rgba(0, 229, 255, 0.18)` | `.glass-strong` borders. |

Tailwind v4 reads them through arbitrary values like `text-[#00E5FF]` or `bg-[#00E5FF]/10`.

### Utility classes added

| Class | Purpose |
| --- | --- |
| `.glass` / `.glass-strong` | Glassmorphism surfaces on pure black. |
| `.nexus-bg-video` + `.nexus-bg-video__fallback` + `::after` radial cyan-to-black gradient | Hero background video wrapper with fallback. |
| `.nexus-hero-fade` | Absolute bottom-edge fade-to-black so the hero transitions cleanly into the next section. |
| `.nexus-marquee` + `.nexus-marquee--reverse` | Infinite horizontal scroll, controlled via `--marquee-duration`. |
| `.nexus-marquee-mask` | Edge fade mask on the marquee containers. |
| `.nexus-scroll-hidden` | Hides scrollbar on the page-level scroll container while preserving scroll. |
| `.nexus-numbered` | Centered counter list that keeps item text centered despite numeric markers. |
| `.nexus-star` | Cyan star color token hook. |
| `.font-helvetica`, `.nexus-h1..3`, `.nexus-hero-text`, `.nexus-body`, `.nexus-small` | Helvetica type scale. |

---

## 3. Component contracts

| Component | Key props | Notes |
| --- | --- | --- |
| `Hero` | `headline`, `subhead`, `primaryCta`, `videoSrc?`, `videoPoster?` | Server component. |
| `TickerMarquee` | `items: ReadonlyArray<string>`, `duration?`, `reverse?` | Server component. CSS-only animation. |
| `MissionBody` | `introLine`, `contextParagraph`, `points`, `closingParagraph` | Server component. `points` is `ReadonlyArray<{ title, body }>`. |
| `ModulesContainer` | `heading`, `pricingNotice`, `modules: ReadonlyArray<ModuleCard>` | Server component. Splits modules into two staggered rows. |
| `ReviewsSection` | `reviews: ReadonlyArray<Review>` | Server component. Body is line-clamped to 3 via inline `-webkit-line-clamp`. |
| `MatrixRain` | `speed?`, `density?`, `color?` | Client component. |

---

## 4. Spec compliance notes

- **Palette:** only `#000000`, `#FFFFFF`, and `#00E5FF` appear in the user-visible rendered output. No other accent color is referenced.
- **Punctuation:** no em dashes in any rendered copy.
- **Alignment:** typographic elements are centered by default. The modules heading is the only left-aligned exception, per spec.
- **Background:** slow-falling Matrix digital rain overlay (`MatrixRain`) is mounted once at the root.
- **Scrollbar:** hidden globally via base-layer CSS in `globals.css`; functional scroll preserved.
- **Typography:** Helvetica stack. Bold reserved for headings, the hero CTA, star ratings, and one-word eyebrow labels.
- **Glassmorphism:** every card (pricing modules, reviews, hero pane) uses `.glass` or `.glass-strong` with `backdrop-filter: blur()` and a low-opacity cyan/white border.

---

## 5. How to extend

1. **Adding a new landing section.** Create `apps/web/src/components/landing/<name>.tsx`, export a default function, type its props with a `Readonly` interface, and import it into `apps/web/src/app/page.tsx`.
2. **Adding a new token.** Add it inside `:root` in `packages/ui/src/styles/globals.css`. Mirror it under `.dark` if it should change with theme.
3. **Editing copy.** All copy lives in `apps/web/src/app/page.tsx` as `HERO_*`, `TICKER_ITEMS`, `MISSION_*`, `MODULES`, `REVIEWS` constants. Edit there.
4. **Wiring real data.** Replace the in-file constants with a server fetch in a Server Component. Every section already accepts a `ReadonlyArray<…>`, so no shape change is needed.
