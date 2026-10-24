/**
 * THE GRADIENT ASCII BACKGROUND
 * ---------------------------------------------------------------------------
 * The field, behind every screen.
 *
 * A DOM component, so the WebGL2 pipeline is the web app's own rather
 * than a reimplementation of it in a different graphics API — see
 * `src/components/dom/GradientAscii.tsx`, which is a port of
 * `apps/web/src/components/landing/gradient-ascii.tsx` in the web repo.
 *
 * ONE FIELD FOR THE WHOLE APP
 * ---------------------------------------------------------------------------
 * It used to be mounted per screen, as the first child of each screen's
 * root. That reads well and it is a lie: every screen is its own WebView,
 * so every screen pays for a WebView booting, a set of shaders compiling
 * and a 2.4 second intro wiping in — and the reader sees the flat page
 * colour for all of it, every time they open a screen. A background that
 * reloads is not a background.
 *
 * So there is ONE field, mounted once, above the navigator, and the
 * screens are transparent so it shows through them. It is painted once,
 * at the start of the app, and it stays painted for the whole session.
 *
 * WHY THE SCREENS ARE TRANSPARENT
 * ---------------------------------------------------------------------------
 * The field is the page's background now, so a screen's own root must not
 * paint one over it. The two screens that are NOT transparent are **You**
 * and **Provider** — they are the two places where the reader is dealing
 * with a secret or a setting rather than with the material, and they keep
 * their flat background and no field.
 *
 * WHY THE STRENGTH AND THE FADE LIVE IN THE WEBVIEW
 * ---------------------------------------------------------------------------
 * Both of them are the shader's own numbers — the composite's scale, and
 * the clock that walks that scale down — rather than the opacity of the
 * native view that holds the WebView.
 *
 * That is not a style preference. A WebView is drawn into its own layer
 * on Android, and a layer does not take the alpha of the view it is in:
 * an opacity on the native side is a fade that silently does not happen,
 * on the platform where the fade matters most. Doing it in the shader is
 * the same picture going away, on both platforms, and the only thing that
 * crosses the bridge is a boolean.
 *
 * A SCREEN ASKS FOR THE FIELD
 * ---------------------------------------------------------------------------
 * One field means one strength, so a screen that wants the field to be
 * different says so: `useFieldLevel` claims the field while that screen is
 * the one on top, and gives it back when it is not. The tutor is at
 * ninety per cent, and fades away once the reader has said something.
 */
import { useIsFocused } from "expo-router";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { StyleSheet, View } from "react-native";

import GradientAscii from "@/components/dom/GradientAscii";
import { useActiveTheme } from "@/theme/ThemeProvider";

/** What a screen asks the field for while it is the screen on top. */
export type FieldLevel = {
  /** How much of the field the reader sees. */
  readonly intensity: number;
  /** Fade the field away. */
  readonly dim: boolean;
};

/** The field's own strength, when no screen has asked for anything else. */
const DEFAULT_INTENSITY = 0.6;

/** How long the tutor's fade takes. Slow on purpose. */
const DIM_DURATION = 2600;

const FieldLevelContext = createContext<(level: FieldLevel | null) => void>(() => {});

export function GradientAsciiBackground({
  children,
}: {
  children: ReactNode;
}): React.JSX.Element {
  const theme = useActiveTheme();
  const [level, setLevel] = useState<FieldLevel | null>(null);

  /*
   * THE CLAIM.
   *
   * One setter, held in a ref-free callback so that a screen's effect
   * does not re-run every time the level changes. The level is state
   * because the field has to re-render when it changes — the intensity
   * and the dim are props of the DOM component.
   */
  const claim = useCallback((next: FieldLevel | null) => {
    setLevel(next);
  }, []);

  return (
    <FieldLevelContext.Provider value={claim}>
      {/*
       * THE FIELD, FIRST.
       *
       * It is the first child, so it is painted before everything the
       * provider's children draw, and everything they draw is painted
       * over it. The provider has to wrap the children as well as the
       * field, because a screen that asks for a different strength has
       * to be able to reach the setter — and the screens are not
       * children of the field, they are its SIBLINGS.
       */}
      <View style={styles.fill} pointerEvents="none">
        {/*
         * THE FIELD IS NOT GOVERNED BY THE APP'S "REDUCED MOTION" SWITCH.
         *
         * That switch says what it does — "Calms the side menu's slide" —
         * and the field is not the side menu. It was wired here anyway, and
         * the effect was that the field stopped DEAD on any device with the
         * switch on: the intro still played, because the intro's clock is
         * not the motion's clock, and after that nothing moved at all —
         * no flicker, no characters changing, no drift.
         *
         * A background that is not moving is a background that is a
         * picture, and the reader is entitled to the field they were given.
         * The DOM component still takes a `reduced` prop for a caller that
         * has a reduce-motion preference of its own; this caller does not.
         */}
        <GradientAscii
          bg={theme.tokens.bg0}
          accent={theme.tokens.accentA}
          intensity={level?.intensity ?? DEFAULT_INTENSITY}
          dim={level?.dim ?? false}
          dimDuration={DIM_DURATION}
        />
      </View>
      {children}
    </FieldLevelContext.Provider>
  );
}

/**
 * CLAIM THE FIELD, FOR AS LONG AS THIS SCREEN IS THE ONE ON TOP.
 *
 * The claim is given back when the screen loses focus, so the field goes
 * back to being the app's background for the screen the reader has moved
 * to, and the reader's own theme of it — the tutor's conversation fading
 * the field away — is a thing of the tutor's screen and not of the app's.
 */
export function useFieldLevel(level: FieldLevel): void {
  const claim = useContext(FieldLevelContext);
  const focused = useIsFocused();
  const { intensity, dim } = level;

  useEffect(() => {
    if (!focused) {
      return;
    }
    claim({ intensity, dim });
    return () => {
      claim(null);
    };
  }, [claim, dim, focused, intensity]);
}

const styles = StyleSheet.create({
  fill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
