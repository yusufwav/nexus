/**
 * THE ROOT LAYOUT
 * ---------------------------------------------------------------------------
 * Everything above the screens: the theme, the fonts, the local database, and
 * the session gate.
 *
 * THE DATABASE IS OPENED BEFORE THE FIRST SCREEN PAINTS.
 * ---------------------------------------------------------------------------
 * The web app's pages were server components that awaited their data. On the
 * phone the data is local, but it is still ASYNCHRONOUS — the SQLite
 * database has to be opened and the content seeded into it. So the splash
 * screen stays up until the seed is done, rather than a screen rendering
 * empty and filling in a moment later.
 *
 * THE GATE
 * ---------------------------------------------------------------------------
 * Nothing in the app is reachable without a session, and that is enforced
 * HERE rather than in each screen. A screen-level check is a check that can
 * be forgotten: one new route and the app has a hole in it. The root layout
 * knows the current route, so it knows the one route that is allowed to be
 * on screen without a session.
 */
import { Stack, useRouter, useSegments } from "expo-router";
import {
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme,
} from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { enableFreeze } from "react-native-screens";
import "react-native-reanimated";

import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { FONT_ASSETS, TYPE } from "@/theme/typography";
import { seedLibrary } from "@/storage/library";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { SideMenuProvider } from "@/components/SideMenu";
import { NativeWindowBackground } from "@/components/NativeWindowBackground";
import { GradientAsciiBackground } from "@/components/GradientAsciiBackground";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

/**
 * THE BLURRED SCREEN IS FROZEN, NOT JUST INVISIBLE.
 *
 * Every screen's root is transparent now, because the field is one WebView
 * for the whole app and it is what is behind them. A screen that is merely
 * hidden — the one below in a stack, the tab the reader has left — is still
 * in the hierarchy, and on Android its text came through the transparent
 * screen above it: two screens' words on top of each other.
 *
 * A frozen screen is taken out of the hierarchy entirely, which is what
 * stops it, and its React state is kept, so the tutor's conversation is
 * still on the screen when the reader comes back to it.
 */
enableFreeze();

export default function RootLayout(): React.JSX.Element | null {
  const [loaded, fontError] = useFonts(FONT_ASSETS);
  const [libraryReady, setLibraryReady] = useState(false);

  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await seedLibrary();
      } catch {
        // A failed seed is not a reason to refuse to open the app: the
        // bundled content is still reachable through the library's
        // fallbacks, and the next launch will try again.
      }
      if (!cancelled) setLibraryReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loaded && libraryReady) {
      void SplashScreen.hideAsync();
    }
  }, [loaded, libraryReady]);

  if (!loaded || !libraryReady) {
    return null;
  }

  return (
    /*
     * THE KEYBOARD PROVIDER, FIRST.
     *
     * Every screen that takes text needs to know where the keyboard is, and
     * this is where it learns. It has to wrap the navigator rather than a
     * screen, because a screen that is pushed while the keyboard is open
     * needs to know about it too.
     *
     * The gesture handler's root goes around that, because it has to be
     * the outermost thing on the screen for the edge swipe to be heard.
     */
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <SafeAreaProvider>
          <ThemeProvider>
            <AuthProvider>
              {/*
               * THE NATIVE WINDOW'S BACKGROUND.
               *
               * It has to be INSIDE the theme provider, because it is
               * watching the theme: the strip where the reader sees the
               * clock, the battery and the signal is painted by the
               * SYSTEM, over the native window, and the native window's
               * colour is a build-time constant that cannot follow a
               * palette the reader picks at runtime.
               *
               * So the colour is pushed down into the window at runtime,
               * and it is the header's colour — the header and the strip
               * above it are one surface as far as the eye is concerned.
               *
               * See `src/components/NativeWindowBackground.tsx`.
               */}
              <NativeWindowBackground />
              <AppFrame />
            </AuthProvider>
          </ThemeProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * The navigator, with a status bar that follows the theme and a gate in
 * front of it.
 */
function AppFrame(): React.JSX.Element {
  const { theme } = useTheme();
  const dark = theme.group === "dark";

  /*
   * THE NAVIGATION'S OWN THEME.
   *
   * React Navigation has a theme of its own, and it ships a LIGHT one: its
   * `background` is `rgb(242, 242, 242)`, which is a very pale grey. The
   * navigator paints that colour behind the screens, so on the web — and
   * in the strip the status bar occupies on a phone — the reader got a pale
   * band that belonged to the navigation library rather than to the app.
   *
   * So the navigation theme is the app's theme. Every colour in it comes
   * from the active palette, which means the navigator's background is the
   * page's background on every one of the fifty-two palettes, and the
   * status bar strip is the same colour as the page below it.
   */
  const navigationTheme = useMemo<Theme>(
    () => ({
      dark,
      colors: {
        primary: theme.tokens.accentA,
        /*
         * TRANSPARENT, because the field is the page's background now.
         *
         * The navigator paints its own background behind the screens, and
         * an opaque one is a lid over the field: the screens are
         * transparent so the field shows through them, and this is the
         * last opaque thing between the field and the reader.
         */
        background: "transparent",
        card: theme.tokens.bg1,
        text: theme.tokens.fg,
        border: theme.tokens.line,
        notification: theme.tokens.accentA,
      },
      fonts: DefaultTheme.fonts,
    }),
    [dark, theme.tokens],
  );

  return (
    <NavigationThemeProvider value={navigationTheme}>
      <StatusBar style={dark ? "light" : "dark"} />
      {/*
       * THE FIELD, AND THE APP UNDER IT.
       *
       * One WebView, above the navigator, painted once and never again: a
       * background that reloads with every screen is not a background, it
       * is a flash. The screens themselves are transparent, so this is
       * what is behind them, except on **You** and **Provider**, which
       * keep their own flat background.
       */}
      <View style={styles.root}>
        <GradientAsciiBackground>
          <AuthGate>
            {/*
             * THE SIDE MENU.
             *
             * It wraps the navigator rather than sitting beside it, because it
             * is an ancestor of the app and that is what lets the edge swipe
             * work: a touch is offered to the view that was actually pressed
             * FIRST, and the app has already had its chance by the time the
             * menu is asked — so a tap goes to the app, and a swipe from the
             * right edge is claimed only once it is clearly a swipe.
             *
             * The drawer itself is drawn over the whole app, so it covers the
             * tab bar that used to be here: the drawer is the app's navigation
             * now. It stays off the login screen on its own, because the
             * component knows whether there is a session.
             */}
            <SideMenuProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  /*
                   * THE SCREEN BELOW IS FROZEN, NOT DRAWN OVER.
                   *
                   * The screens are transparent, so a screen that is still
                   * in the hierarchy shows through the one above it.
                   */
                  freezeOnBlur: true,
                  contentStyle: { backgroundColor: "transparent" },
                  /*
                   * NO TRANSITION, AND IT IS NOT A STYLE CHOICE.
                   *
                   * Every screen is transparent, because the field is the
                   * page and it is mounted once behind the navigator. A
                   * native transition — Android's is a 450ms slide-and-fade
                   * — draws the outgoing screen and the incoming one IN THE
                   * SAME FRAME for the length of the animation, then
                   * destroys the outgoing one.
                   *
                   * With opaque screens that is invisible: the new screen
                   * covers the old. With this app's transparent ones the new
                   * screen is a window onto the old, so for half a second
                   * the reader sees two screens' headers and two screens'
                   * text laid over each other — the old one not yet
                   * unloading, exactly as it looks. It is not a rendering
                   * fault and there is no opacity that fixes it: any
                   * animation in which both screens are drawn at once is a
                   * double exposure when the one on top is see-through.
                   *
                   * So the screens swap in one frame and the FIELD carries
                   * the continuity instead — it never moves, never reloads
                   * and never fades, and it is the thing that makes the app
                   * feel like one place rather than a sequence of pages.
                   *
                   * The rejected alternatives: a JS fade of the incoming
                   * screen after the swap trades a ghost for a flash (the
                   * field shows through the two screens that are meant to
                   * be opaque, and on a back-navigation the screen is
                   * already painted before the fade can start), and making
                   * every screen opaque again is a lid over the field, which
                   * is the thing the whole arrangement exists for.
                   */
                  animation: "none",
                  /*
                   * THE STATUS BAR, DRAWN OVER THE PAGE.
                   *
                   * `statusBarTranslucent` makes the screen's content run UNDER
                   * the status bar instead of starting below it, and
                   * `statusBarBackgroundColor` gives the bar itself the page's
                   * colour.
                   *
                   * Together they are what stop the pale band: with the content
                   * inset, the strip the bar sits on belongs to the native
                   * window rather than to the app, and the window's own
                   * background is what the reader sees there.
                   */
                  statusBarTranslucent: true,
                  statusBarBackgroundColor: theme.tokens.bg0,
                }}
              >
                <Stack.Screen name="(tabs)" />
                {/*
                 * THE LOGIN SCREEN HAS NO TRANSITION EITHER.
                 *
                 * It used to fade. It does not need to: the gate above holds
                 * the whole navigator off screen until it knows whether
                 * there is a session, so `/login` is the FIRST and only
                 * screen in the stack whenever it appears — and the first
                 * screen is never animated, by either platform. A fade here
                 * would only ever cross-fade the boot screen, which is the
                 * double exposure this file has just ruled out.
                 */}
                <Stack.Screen name="login" />
              </Stack>
            </SideMenuProvider>
          </AuthGate>
        </GradientAsciiBackground>
      </View>
    </NavigationThemeProvider>
  );
}

/**
 * THE GATE.
 *
 * `/login` is the only route that may be on screen without a session.
 * Everything else redirects to it, and `/login` redirects to the app once
 * there IS a session — so the two can never both be true.
 */
function AuthGate({ children }: { children: ReactNode }): React.JSX.Element {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  const onLogin = segments[0] === "login";

  useEffect(() => {
    if (status === "loading") return;
    if (status === "signed-out" && !onLogin) {
      router.replace("/login");
    } else if (status === "signed-in" && onLogin) {
      router.replace("/");
    }
  }, [onLogin, router, status]);

  if (status === "loading") {
    return <BootScreen />;
  }

  /*
   * NOTHING IS RENDERED UNTIL THE GATE HAS DECIDED.
   *
   * Letting the Stack mount and then redirecting would flash the app's
   * content to a reader who is not signed in — and on a slow device that
   * flash is long enough to see. So the gate holds the screen until it
   * knows, and the screen it shows while it is deciding is the same one it
   * shows while it is loading.
   */
  if (status === "signed-out" && !onLogin) {
    return <BootScreen />;
  }

  return <>{children}</>;
}

/**
 * The hold screen, while the session is being read out of the keychain.
 */
function BootScreen(): React.JSX.Element {
  const { theme } = useTheme();
  return (
    <View style={[styles.boot, { backgroundColor: theme.tokens.bg0 }]}>
      <ActivityIndicator color={theme.tokens.accentA} />
      <Text style={[styles.bootText, { color: theme.tokens.fgDim }]}>NEXUS_</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bootText: {
    ...TYPE.label,
    marginTop: 14,
    letterSpacing: 2,
  },
});
