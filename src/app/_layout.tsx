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
import "react-native-reanimated";

import { ThemeProvider, useTheme } from "@/theme/ThemeProvider";
import { FONT_ASSETS, TYPE } from "@/theme/typography";
import { seedLibrary } from "@/storage/library";
import { AuthProvider, useAuth } from "@/auth/AuthProvider";
import { SideMenuProvider } from "@/components/SideMenu";
import { NativeWindowBackground } from "@/components/NativeWindowBackground";

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  anchor: "(tabs)",
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

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
        background: theme.tokens.bg0,
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
              contentStyle: { backgroundColor: theme.tokens.bg0 },
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
            <Stack.Screen name="login" options={{ animation: "fade" }} />
          </Stack>
        </SideMenuProvider>
      </AuthGate>
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
