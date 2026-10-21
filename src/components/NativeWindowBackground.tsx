/**
 * THE NATIVE WINDOW'S BACKGROUND
 * ---------------------------------------------------------------------------
 * The app's own colour, pushed down into the native window.
 *
 * WHY THIS IS A SEPARATE PIECE OF CODE
 * ---------------------------------------------------------------------------
 * On Android the status bar and the navigation bar are drawn by the SYSTEM,
 * over the app's window. React Navigation's `statusBarBackgroundColor` and
 * `statusBarTranslucent` look like they would solve this, and they do not:
 * `react-native-screens` implements BOTH of them as no-ops on Android —
 *
 *   ```kotlin
 *   // mark: iOS-only
 *   override fun setStatusBarColor(view: Screen, value: Int?) = Unit
 *   override fun setStatusBarTranslucent(view: Screen, value: Boolean) = Unit
 *   ```
 *
 * — so on Android the strip where the reader sees the clock, the battery and
 * the signal belongs to the NATIVE WINDOW, and the native window's colour is
 * whatever `android:windowBackground` says.
 *
 * And `android:windowBackground` comes from `app.json`, which is baked into
 * the APK at build time. A build-time constant cannot follow a theme that
 * the reader picks at runtime, and the app has fifty-two of them.
 *
 * So the colour is set at RUNTIME instead, and this component is what does
 * it: it watches the active theme and writes the theme's own colour into the
 * window's decor view. The strip then carries the palette's colour, and it
 * changes when the reader changes palette.
 *
 * WHY THE COLOUR IS THE HEADER'S, NOT THE PAGE'S
 * ---------------------------------------------------------------------------
 * The reader is looking at the header, not at the page: the header is the
 * bar directly below the status bar, and the status bar is the strip
 * directly above it. The two are one surface as far as the eye is
 * concerned, so they are one colour — the header's `surfaceRaised`. A strip
 * in the page's `bg0` under a header in `surfaceRaised` would be a seam
 * across the top of every screen, which is the exact thing this is here to
 * avoid.
 *
 * THE COLOUR IS OPAQUE, AND IT IS THE PALETTE'S OWN
 * ---------------------------------------------------------------------------
 * `surfaceRaised` is a translucent white on a dark palette, so it cannot be
 * used as-is: the native window has no palette behind it to show through
 * to. It is COMPOSED against the page's `bg0` here — the same two steps the
 * panel treatment uses — so what reaches the window is the flat colour the
 * reader would see on the screen anyway.
 */
import { useEffect } from "react";
import * as SystemUI from "expo-system-ui";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { parseColor } from "@/lib/palette-colours";

/**
 * A flat, opaque RGB hex for a translucent token over an opaque one.
 *
 * The native window has nothing behind it, so a translucent token has to be
 * composited by hand: `over` is the colour UNDERNEATH, `over` is the
 * translucent colour ON TOP, and the result is what the reader would have
 * seen on the screen.
 */
function flatten(over: string, under: string): string {
  const top = parseColor(over);
  const bottom = parseColor(under);
  if (top === null || bottom === null) return under;

  const alpha = top.a;
  const r = Math.round(top.r * alpha + bottom.r * (1 - alpha));
  const g = Math.round(top.g * alpha + bottom.g * (1 - alpha));
  const b = Math.round(top.b * alpha + bottom.b * (1 - alpha));

  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/**
 * The colour the native window's background should be, for a theme.
 *
 * Exported so that the web can use the same rule for the page's own
 * background, and so the rule is testable without a device.
 */
export function windowBackgroundFor(tokens: {
  readonly bg0: string;
  readonly surfaceRaised: string;
}): string {
  return flatten(tokens.surfaceRaised, tokens.bg0);
}

/**
 * Keeps the native window's background on the theme's colour.
 *
 * Renders nothing. It is a component rather than a hook because it has to
 * live INSIDE the `ThemeProvider` — the theme is the thing it is watching.
 */
export function NativeWindowBackground(): React.JSX.Element | null {
  const theme = useActiveTheme();
  const color = windowBackgroundFor(theme.tokens);

  useEffect(() => {
    // `setBackgroundColorAsync` is a no-op on the web, and the web has no
    // native window to colour, so there is nothing to do there.
    if (process.env.EXPO_OS === "web") return;
    void SystemUI.setBackgroundColorAsync(color);
  }, [color]);

  return null;
}
