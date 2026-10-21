/**
 * YOU — the account, the catalogue you own, and the app's own settings
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/dashboard/{modules,purchases,settings,support}
 *
 * THE DASHBOARD'S FIVE SUB-PAGES, FOLDED INTO ONE SCREEN
 * ---------------------------------------------------------------------------
 * The web app's dashboard had a tab strip: overview, my modules, purchases,
 * settings, support. On a phone that is five levels of navigation for
 * screens that each hold a handful of rows.
 *
 * So they become SECTIONS on one screen, in the order a reader meets them:
 * who you are, what you own, what you paid, how the app looks, what is
 * stored on the device, and where the notes came from.
 *
 * THE ACCOUNT IS LOCAL.
 * ---------------------------------------------------------------------------
 * There is no server, so there is no OAuth session and no Postgres user
 * row. The name and email live in expo-secure-store, which is the device's
 * encrypted store, and they identify the reader inside this app only. That
 * is said plainly on the screen rather than implied.
 */
import { useCallback, useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme, useTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, EmptyState, ListRow, Num, Section } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { getOwnedCodes, listModules, listPurchases } from "@/storage/library";
import { useAuth } from "@/auth/AuthProvider";
import { databaseSizeBytes, clearUserData } from "@/storage/database";
import { readFirstName, writeFirstName } from "@/storage/settings";
import { listProviders } from "@/storage/provider";
import { RADIUS } from "@/theme/radius";
import { formatZar, formatWhen } from "@/lib/money";

export default function ProfileScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const { reducedMotion, setReducedMotion, themeId, setThemeId } = useTheme();
  const { session, signOut, offline } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [name, setName] = useState("");
  const [owned, setOwned] = useState<ReadonlyArray<{ code: string; name: string }>>([]);
  const [purchases, setPurchases] = useState<
    ReadonlyArray<{ id: string; code: string; name: string; amountCents: number; createdAt: string }>
  >([]);
  const [size, setSize] = useState(0);
  const [providerCount, setProviderCount] = useState(0);

  const load = useCallback(async () => {
    setName((await readFirstName()) ?? "");
    const ownedCodes = await getOwnedCodes();
    const all = await listModules();
    setOwned(all.filter((m) => ownedCodes.has(m.code)).map((m) => ({ code: m.code, name: m.name })));
    const list = await listPurchases();
    setPurchases(
      list.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        amountCents: p.amountCents,
        createdAt: p.createdAt,
      })),
    );
    setSize(await databaseSizeBytes());
    setProviderCount((await listProviders()).length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const displayName = await readFirstName();
      const ownedCodes = await getOwnedCodes();
      const all = await listModules();
      const list = await listPurchases();
      const bytes = await databaseSizeBytes();
      if (cancelled) return;
      setName(displayName ?? "");
      setOwned(
        all.filter((m) => ownedCodes.has(m.code)).map((m) => ({ code: m.code, name: m.name })),
      );
      setPurchases(
        list.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          amountCents: p.amountCents,
          createdAt: p.createdAt,
        })),
      );
      setSize(bytes);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveName = useCallback(async () => {
    await writeFirstName(name.trim());
    await load();
  }, [load, name]);

  const wipe = useCallback(async () => {
    await clearUserData();
    // The cached session is gone, so the in-memory one has to go too —
    // otherwise the app still believes it is signed in after the reader
    // has just wiped the device.
    await signOut();
    await load();
  }, [load, signOut]);

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title="You" />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 28 },
        ]}
      >
        <Body style={styles.lead}>
          {offline
            ? "Running offline. Your session is cached on this device, and everything in the app works."
            : "Signed in to your Nexus account. The notes, the practice bank and the study partner all work with the data off."}
        </Body>

        <Section
          title="Your account"
          subtitle="A real account on the Nexus server. The session token lives in this device's encrypted keychain."
        >
          <Card>
            <ListRow title="Email" subtitle={session?.user.email ?? "not signed in"} />
            <ListRow title="Name" subtitle={session?.user.name ?? "—"} />
            <ListRow
              title="Email verified"
              subtitle={
                session?.user.emailVerified === true
                  ? "confirmed — the whole account is unlocked"
                  : "not confirmed yet. Some things stay locked until it is."
              }
              badge={
                session?.user.emailVerified === true
                  ? { label: "VERIFIED", tone: "ok" }
                  : { label: "PENDING", tone: "warn" }
              }
            />
            <ListRow title="Signed in with" subtitle="an email address and a password" />
            <Text style={[styles.fieldLabel, { color: theme.tokens.fgDim }]}>
              WHAT THE NOTES CALL YOU
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="your name"
              placeholderTextColor={theme.tokens.fgDim}
              style={[
                styles.input,
                {
                  color: theme.tokens.fg,
                  borderColor: theme.tokens.line,
                  backgroundColor: theme.tokens.surfaceRaised,
                },
              ]}
            />
            <View style={styles.action}>
              <Button label="save" onPress={() => void saveName()} />
            </View>
          </Card>
        </Section>

        <Section
          title="Session"
          subtitle="Signing out locks every screen in the app, and you will need a connection to sign back in."
        >
          <Card>
            <Button
              label="sign out"
              tone="danger"
              onPress={() => void signOut()}
              style={styles.signOut}
            />
          </Card>
        </Section>

        <Section
          title="Study partner"
          subtitle="The tutor is a language model, and it needs a provider of your own."
        >
          <Card>
            <ListRow
              title="Model provider"
              subtitle={
                providerCount === 0
                  ? "None yet"
                  : `${providerCount} provider${providerCount === 1 ? "" : "s"}`
              }
              detail={
                providerCount === 0
                  ? "Add one with the key it gave you."
                  : "Which provider, and which model."
              }
              onPress={() => router.push("/settings/provider")}
            />
          </Card>
        </Section>

        <Section title="Appearance" subtitle="Fifty-two palettes, all of them offline.">
          <Card>
            <ListRow
              title="Theme"
              subtitle={theme.label}
              detail={theme.hint}
              onPress={() => router.push("/settings/appearance")}
            />
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={[styles.switchTitle, { color: theme.tokens.fg }]}>Reduced motion</Text>
                <Text style={[styles.switchSub, { color: theme.tokens.fgDim }]}>
                  Freezes the animated backgrounds.
                </Text>
              </View>
              <Switch
                value={reducedMotion}
                onValueChange={setReducedMotion}
                trackColor={{ true: theme.tokens.accentA, false: theme.tokens.surfaceRaised }}
                thumbColor={theme.tokens.fg}
              />
            </View>
            <ListRow
              title="Match the system"
              subtitle="Follow the operating system's light or dark setting"
              onPress={() => setThemeId(themeId === "system" ? "dark" : "system")}
              trailing={
                <Text style={[styles.state, { color: theme.tokens.accentA }]}>
                  {themeId === "system" ? "ON" : "OFF"}
                </Text>
              }
            />
          </Card>
        </Section>

        <Section title="Your modules" subtitle="Everything you have unlocked.">
          <Card>
            {owned.length === 0 ? (
              <EmptyState
                title="Nothing yet"
                body="The catalogue is one tap away."
              />
            ) : (
              owned.map((m) => (
                <ListRow
                  key={m.code}
                  title={m.name}
                  subtitle={m.code}
                  onPress={() =>
                    router.push({ pathname: "/module/[code]", params: { code: m.code } })
                  }
                />
              ))
            )}
          </Card>
        </Section>

        <Section title="Purchases" subtitle="Unlocking a module is a local purchase.">
          <Card>
            {purchases.length === 0 ? (
              <EmptyState title="No purchases yet" body="Buying a module shows up here." />
            ) : (
              purchases.map((p) => (
                <ListRow
                  key={p.id}
                  title={`${p.code} — ${p.name}`}
                  subtitle={formatWhen(p.createdAt)}
                  trailing={
                    <Num style={[styles.state, { color: theme.tokens.fg }]}>
                      {formatZar(p.amountCents)}
                    </Num>
                  }
                />
              ))
            )}
          </Card>
        </Section>

        <Section title="On this device" subtitle="Everything the app stores, and how to clear it.">
          <Card>
            <ListRow title="Local database" detail={`${Math.max(1, Math.round(size / 1024))} KB of notes, attempts and history`} />
            <ListRow title="Attempts" detail="Every question you have answered" />
            <ListRow title="Chat history" detail="Every conversation with the study partner" />
            <View style={styles.action}>
              <Button label="clear local data" tone="danger" onPress={() => void wipe()} />
            </View>
          </Card>
        </Section>

        <Section title="Support" subtitle="Built by a first-year CS student at NMU.">
          <Card>
            <Body>
              The notes are written by hand and the questions are marked by a fixed rule, not by a
              model — so the same question always gets the same answer.
            </Body>
            <View style={styles.action}>
              <Button label="about this app" tone="ghost" onPress={() => router.push("/settings/about")} />
            </View>
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
  lead: {
    marginTop: 8,
  },
  fieldLabel: {
    ...TYPE.label,
    marginBottom: 6,
  },
  input: {
    ...TYPE.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
    minHeight: 48,
  },
  action: {
    marginTop: 10,
    alignSelf: "flex-start",
  },
  signOut: {
    alignSelf: "stretch",
  },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
  },
  switchText: {
    flex: 1,
    paddingRight: 12,
  },
  switchTitle: {
    ...TYPE.subheading,
  },
  switchSub: {
    ...TYPE.small,
    marginTop: 2,
  },
  state: {
    ...TYPE.small,
  },
});
