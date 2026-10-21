/**
 * THE SCREENS
 * ---------------------------------------------------------------------------
 * THERE USED TO BE A TAB BAR HERE.
 *
 * The web app navigated with a fixed top bar on the public pages and a
 * left-hand tab strip inside the dashboard console. Neither survives a
 * phone: the top bar is out of thumb reach and the side strip costs a third
 * of a narrow screen. So the two became ONE bottom tab bar, and the
 * dashboard's five sub-pages became sections on the **You** tab rather than
 * a second level of navigation.
 *
 * And then the bar went too, because a drawer that slides in from the
 * right edge — a thing a thumb reaches for, and can swipe open without
 * looking — is a better use of the bottom of the screen than five icons
 * that are always there. The side menu (`src/components/SideMenu.tsx`) is
 * the app's navigation now: the same five destinations, plus the two
 * pushed pages that are not tabs.
 *
 * So this file no longer draws anything. It is still a Tabs navigator, and
 * it has to be: the five screens keep their own state and their own place
 * in the back stack, and the drawer's `router.navigate("/modules")` needs
 * a route to navigate TO. What it does not do is show a bar.
 *
 *   Home      the overview the dashboard opened on
 *   Modules   the catalogue
 *   Practice  the question bank
 *   Tutor     the study partner
 *   You       the account, the theme and the storage
 */
import { Tabs } from "expo-router";

import { useActiveTheme } from "@/theme/ThemeProvider";

export default function TabLayout(): React.JSX.Element {
  const theme = useActiveTheme();

  return (
    <Tabs
      /**
       * NO BAR.
       *
       * The tab bar is the bottom of the screen, which is where the
       * keyboard is, and it was the only thing between the reader and the
       * field they were typing in. The drawer replaces it.
       */
      tabBar={() => null}
      screenOptions={{
        headerShown: false,
        sceneStyle: {
          backgroundColor: theme.tokens.bg0,
        },
      }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="modules" />
      <Tabs.Screen name="practice" />
      <Tabs.Screen name="tutor" />
      <Tabs.Screen name="profile" />
    </Tabs>
  );
}
