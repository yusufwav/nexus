/**
 * NOT FOUND
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/not-found.tsx
 *
 * Expo Router's catch-all. A route that does not exist lands here, and so
 * does a module code that is not in the catalogue.
 */
import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Num, Title } from "@/components/ui";

export default function NotFoundScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 40,
        },
      ]}
    >
      <Num style={[styles.code, { color: theme.tokens.accentA }]}>404</Num>
      <Title style={styles.title}>Nothing here</Title>
      <Body style={styles.body}>
        That address does not match anything in the app.
      </Body>
      {/*
       * THE ONE THING TO DO HERE.
       *
       * The screen is already centred, and the button says so too, so
       * that it stays the middle of the screen whatever happens to the
       * text above it.
       */}
      <View style={styles.action}>
        <Button
          label="open the catalogue"
          onPress={() => router.replace("/modules")}
          style={styles.centred}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  code: {
    ...TYPE.code,
    letterSpacing: 2,
  },
  title: {
    ...TYPE.title,
    marginTop: 10,
  },
  body: {
    marginTop: 10,
    textAlign: "center",
  },
  action: {
    marginTop: 18,
  },
  /**
   * A BUTTON, CENTRED.
   *
   * A button brings its own `alignSelf`, and the default would put it
   * against the left edge of whatever holds it.
   */
  centred: {
    alignSelf: "center",
  },
});
