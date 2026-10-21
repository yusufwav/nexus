/**
 * ABOUT
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/dashboard/support/page.tsx
 *
 * The web app's support page was a form that posted to a mail server. There
 * is no network here, so a form that cannot be delivered is worse than no
 * form: this page says what the app is, what it deliberately does not do,
 * and where the content came from.
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Card, ListRow, Prose, Section, Title } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";

export default function AboutScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title="About" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          onPress={() => router.back()}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <View style={styles.backRow}>
            <Icon name="chevronLeft" size={16} tone="accent" />
            <Text style={[styles.backText, { color: theme.tokens.accentA }]}>you</Text>
          </View>
        </Pressable>

        <Title style={styles.title}>Nexus</Title>
        <Body style={styles.lead}>
          First-year Computer Science notes for Nelson Mandela University students, rebuilt from
          the ground up and carried entirely on your phone.
        </Body>

        <Section title="What this app is">
          <Card>
            <Prose>
              The notes are written by hand, one module at a time, and the practice questions are
              marked by a fixed rule rather than by a model. That is deliberate: a grader whose
              verdict can differ between two runs teaches the student to argue with the tool rather
              than with the maths.
            </Prose>
            <View style={styles.gap} />
            <Prose>
              The study partner reads the same notes you do. It searches them on your device,
              so every answer it gives is quoted from the notes rather than written fresh — and
              the notes never leave the phone. The model is one you chose and paid for, with a
              key that stays in this device&apos;s keychain.
            </Prose>
          </Card>
        </Section>

        <Section title="What it does not do yet">
          <Card>
            {[
              "Spaced revision cards",
              "Notes in your own words",
              "Annotations on the notes",
              "Offline PDF bundles",
              "A checkout that takes money",
            ].map((item) => (
              <ListRow key={item} title={item} detail="planned, not shipped" />
            ))}
          </Card>
        </Section>

        <Section title="Your data">
          <Card>
            <Prose>
              Nothing leaves this device. Your details sit in the encrypted keychain, your progress
              and your answers sit in a local SQLite database, and your theme preference sits in
              plain storage. You can wipe all of it from the You tab.
            </Prose>
          </Card>
        </Section>

        <Section title="Colophon">
          <Card>
            <ListRow title="Notes" detail="13 modules across mathematics, programming, fundamentals and statistics" />
            <ListRow title="Themes" detail="52 palettes, all local" />
            <ListRow title="Backgrounds" detail="Four OpenGL ES 3.0 engines, all local" />
            <ListRow title="Built by" detail="a first-year CS student at NMU" />
          </Card>
        </Section>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 18,
  },
  back: {
    paddingVertical: 8,
    alignSelf: "flex-start",
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  backText: {
    fontSize: 15,
    fontWeight: "700",
  },
  title: {
    ...TYPE.title,
    marginTop: 8,
  },
  lead: {
    marginTop: 8,
  },
  gap: {
    height: 12,
  },
});
