This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md

## This app's rules

1. **Every screen has a `ScreenHeader`.** `src/components/ui/ScreenHeader.tsx` is the bar at the top of every screen: the terminal's three dots, a centred title, and the top safe-area inset, so the status bar's background is the header's. A new screen puts `<ScreenHeader title="…" />` above its scroll view and **drops its own `paddingTop: insets.top + n`** — the header owns the inset. See `STYLING.md` §1.4b.
2. **The gradient ASCII field is back, and it is a DOM component.** The other three live fields (horizon bloom, letter glitch, pixel blast) and the glassmorphism are still gone; the page is a flat `theme.tokens.bg0` and a panel is a flat `theme.tokens.bg1`. There is still **no blur and no `BlurTargetView` anywhere** — `expo-blur`'s `BlurTargetView` is Android-native and reparents children out of RN's hierarchy, which breaks the WebView tag lookup. The field is a `'use dom'` component (`src/components/dom/GradientAscii.tsx`), a different mechanism entirely: a WebView of its own, painting its own opaque background, with nothing ever reparented into it. There is **ONE field for the whole app**, mounted above the navigator in `src/components/GradientAsciiBackground.tsx` — never one per screen, because a field that reloads with every screen is a flash, not a background — so the screens are transparent, and the navigation theme's `background` and the tabs' `sceneStyle` are too. The **You** and **Provider** screens keep their flat `bg0` and no field. The field's strength and its fade are **the shader's own numbers**, never the opacity of the view that holds the WebView: a WebView is drawn into its own layer on Android and does not take the alpha of the view it is in. The field is **not** governed by the app's "Reduced motion" switch — that switch is the side menu's, and wiring the field to it stopped the field dead on any device that had it on. See `STYLING.md` §1.7 and `PORTING.md` §2a.
3. **One container.** Every panel is `GlassPanel` (`src/components/ui/GlassPanel.tsx`) — opaque `bg1`, grain, a hairline in `theme.tokens.line`, and rounded corners. See `STYLING.md` §1.3.
4. **Corners come from the scale.** `RADIUS` in `src/theme/radius.ts` — `RADIUS.panel` (12) for a surface that holds content, `RADIUS.control` (8) for something you press. Never set `borderRadius` at the call site. See `STYLING.md` §1.2.
5. **Type comes from the scale.** `TYPE` in `src/theme/typography.ts` — never set `fontSize`/`fontWeight` at the call site. `HEADER_TITLE` is the size for a screen header's title. See `STYLING.md` §1.1.
6. **The parts live in `src/components/ui/`.** One file per family — `Button`, `Card`, `Input`, `Parts`, `Interactive` — and `src/components/ui.tsx` is the door to them. A new control goes in a file, not in `ui.tsx`. The parts are modelled on HeroUI v3: the same anatomy, the same variant ladder, the same press behaviour, in this app's tokens. See `STYLING.md` §1.3a.
7. **Colour is semantic.** `useSemantic()` in `src/theme/semantic.ts` gives `accent`, `default`, `success`, `warning`, `danger`, `surface`, `field`, `separator` and the rest, resolved against the active palette. A component asks for a role, never for a hex value and never for a raw palette token. See `STYLING.md` §1.3a.
8. **The system bars belong to the app.** The status bar strip is the **native window**, and `react-native-screens` makes `statusBarBackgroundColor`/`statusBarTranslucent` no-ops on Android — so the window's colour is set at RUNTIME by `src/components/NativeWindowBackground.tsx`, from the active palette, to the header's flattened `surfaceRaised`. `app.json`'s `backgroundColor` is only the colour before JS runs. `expo-system-ui` must stay installed. See `STYLING.md` §1.4a.
9. **Never write a shared value during a render.** `shared.value = ...` inside a `setState` updater is a write during React's render phase — Reanimated warns about it, and on Android the animation silently never runs. Compute the next value from a ref, write the shared value outside the render phase, then call `setState`. See `src/app/(tabs)/index.tsx`.
