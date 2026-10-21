/**
 * THE MODEL PROVIDER
 * ---------------------------------------------------------------------------
 * Bring your own key.
 *
 * The web app keeps the reader's provider keys on its server, sealed with a
 * server-side key, and the browser never sees one. A phone has no server to
 * hold them, and does not need one: the key goes into the device keychain,
 * and from there to the provider and nowhere else.
 *
 * So this screen asks for three things and stores a fourth:
 *
 *   name      what to call the provider, so the reader can tell them apart
 *   address   where the text completions live
 *   key       the secret, into the keychain, never written here
 *   model     which model to talk to — picked from the provider's own list
 *
 * SEVERAL PROVIDERS
 * ---------------------------------------------------------------------------
 * A reader may have a hosted provider and one running on their own machine,
 * and the chat needs to choose between them, so the list is a list. Each
 * provider carries its own key, its own model and its own name, and exactly
 * one of them is the one the tutor is talking to.
 *
 * THE MODEL FIELD IS ADVANCED ON PURPOSE
 * ---------------------------------------------------------------------------
 * The provider's own list is the good way to choose a model, so the screen
 * fetches it and offers it. But a provider that does not answer `/models`,
 * or a model that is not in the list, is a thing that happens — so the
 * field is there, under the list, for the reader who knows the name.
 */
import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { Body, Button, Card, Section, Select } from "@/components/ui";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon } from "@/components/icons";
import { listModels, type ModelInfo } from "@/lib/llm";
import { RADIUS } from "@/theme/radius";
import {
  deleteProvider,
  listProviders,
  newProviderId,
  normaliseBaseUrl,
  readActiveProviderId,
  saveProvider,
  writeActiveProviderId,
  type Provider,
} from "@/storage/provider";

export default function ProviderScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [providers, setProviders] = useState<ReadonlyArray<Provider>>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [key, setKey] = useState("");
  const [model, setModel] = useState("");
  const [models, setModels] = useState<ReadonlyArray<ModelInfo>>([]);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * FREE ONLY.
   *
   * A big provider lists hundreds of models and the reader usually wants
   * the handful that cost nothing, so the picker offers a filter rather
   * than making them scroll past a hundred paid models to find one.
   *
   * It is on by default, because a reader who is looking at a free tier
   * is nearly always looking for the free models, and a filter that has
   * to be turned on before it helps is a filter that gets in the way.
   */
  const [freeOnly, setFreeOnly] = useState(true);

  const load = useCallback(async () => {
    const [list, active] = await Promise.all([listProviders(), readActiveProviderId()]);
    setProviders(list);
    setActiveId(active ?? list[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const reset = useCallback(() => {
    setName("");
    setAddress("");
    setKey("");
    setModel("");
    setModels([]);
    setNote(null);
    setError(null);
  }, []);

  /**
   * THE PROVIDER'S OWN MODELS.
   *
   * The same `/models` call the web app makes for a custom provider: the
   * list comes from the provider, so it cannot go out of date.
   */
  const fetchModels = useCallback(async () => {
    setError(null);
    setNote(null);
    if (address.trim().length === 0) {
      setError("Give the address first.");
      return;
    }
    if (key.trim().length === 0) {
      setError("Give the key first.");
      return;
    }
    setBusy(true);
    try {
      const list = await listModels(address, key.trim());
      setModels(list);
      if (list.length === 0) {
        setNote("That provider did not list any models. Type the name in the field below.");
      } else {
        setNote(`${list.length} model${list.length === 1 ? "" : "s"} on that provider.`);
        if (model.length === 0) setModel(list[0]!.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The model list could not be read.");
    } finally {
      setBusy(false);
    }
  }, [address, key, model]);

  const save = useCallback(async () => {
    setError(null);
    setNote(null);

    const trimmedName = name.trim();
    const base = normaliseBaseUrl(address);
    const trimmedKey = key.trim();
    const trimmedModel = model.trim();

    if (trimmedName.length === 0) {
      setError("Give the provider a name, so you can tell your providers apart.");
      return;
    }
    if (base.length === 0) {
      setError("Give the address the text completions live at.");
      return;
    }
    if (!base.startsWith("https://")) {
      // The same rule the web app's server enforces, for the same reason: an
      // http endpoint would send the key in clear.
      setError("The address has to be https. An http endpoint would send your key in clear.");
      return;
    }
    if (trimmedKey.length < 8) {
      setError("That does not look like a key.");
      return;
    }
    if (trimmedModel.length === 0) {
      setError("Give a model — fetch the list, or type the name.");
      return;
    }

    setBusy(true);
    try {
      const provider: Provider = {
        id: newProviderId(),
        name: trimmedName,
        baseUrl: base,
        model: trimmedModel,
        lastFour: trimmedKey.slice(-4),
        updatedAt: new Date().toISOString(),
      };
      await saveProvider(provider, trimmedKey);
      await writeActiveProviderId(provider.id);
      reset();
      setAdding(false);
      await load();
      setNote("Saved. The study partner will use it.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That provider could not be saved.");
    } finally {
      setBusy(false);
    }
  }, [address, key, load, model, name, reset]);

  const remove = useCallback(
    async (provider: Provider) => {
      setError(null);
      setNote(null);
      setBusy(true);
      try {
        await deleteProvider(provider.id);
        await load();
        setNote(`${provider.name} removed.`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "That provider could not be removed.");
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const use = useCallback(
    async (provider: Provider) => {
      await writeActiveProviderId(provider.id);
      setActiveId(provider.id);
      setNote(`${provider.name} is the one the study partner talks to.`);
    },
    [],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.tokens.bg0 }]}>
      <ScreenHeader title="Provider" />
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

        <Body style={styles.lead}>
          The study partner is a language model, and a language model needs a provider. Bring your
          own key: it is kept in this device&apos;s keychain and goes from there to the provider, and
          nowhere else.
        </Body>

        {providers.length > 0 ? (
          <Section title="Your providers" subtitle="One of them is the one the tutor talks to.">
            <Card>
              {providers.map((provider, index) => {
                const active = provider.id === activeId;
                return (
                  <View
                    key={provider.id}
                    style={[
                      styles.provider,
                      index < providers.length - 1
                        ? { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.tokens.lineSoft }
                        : null,
                    ]}
                  >
                    <View style={styles.providerHead}>
                      <View style={styles.providerText}>
                        <Text style={[styles.providerName, { color: theme.tokens.fg }]}>
                          {provider.name}
                        </Text>
                        <Text style={[styles.providerMeta, { color: theme.tokens.fgDim }]} numberOfLines={1}>
                          {provider.baseUrl}
                        </Text>
                        <Text style={[styles.providerMeta, { color: theme.tokens.fgDim }]} numberOfLines={1}>
                          {provider.model} · key ending {provider.lastFour}
                        </Text>
                      </View>
                      {active ? (
                        <Text style={[styles.providerActive, { color: theme.tokens.accentA }]}>IN USE</Text>
                      ) : null}
                    </View>
                    <View style={styles.providerActions}>
                      {!active ? (
                        <Button
                          label="use this one"
                          tone="quiet"
                          onPress={() => void use(provider)}
                          style={styles.providerButton}
                        />
                      ) : null}
                      <Button
                        label="remove"
                        tone="quiet"
                        onPress={() => void remove(provider)}
                        style={styles.providerButton}
                      />
                    </View>
                  </View>
                );
              })}
            </Card>
          </Section>
        ) : null}

        {adding ? (
          <Section title="A new provider" subtitle="Three things, and the model to talk to.">
            <Card>
              <Text style={[styles.fieldLabel, { color: theme.tokens.fgDim }]}>NAME</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="my laptop"
                placeholderTextColor={theme.tokens.fgDim}
                autoCapitalize="none"
                style={[
                  styles.input,
                  { color: theme.tokens.fg, borderColor: theme.tokens.line, backgroundColor: theme.tokens.surfaceRaised },
                ]}
              />

              <Text style={[styles.fieldLabel, { color: theme.tokens.fgDim }]}>ADDRESS</Text>
              <TextInput
                value={address}
                onChangeText={setAddress}
                placeholder="https://api.openai.com/v1"
                placeholderTextColor={theme.tokens.fgDim}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[
                  styles.input,
                  { color: theme.tokens.fg, borderColor: theme.tokens.line, backgroundColor: theme.tokens.surfaceRaised },
                ]}
              />
              <Text style={[styles.hint, { color: theme.tokens.fgDim }]}>
                The address the text completions live at. The endpoint is added for you, and a
                full address with /chat/completions on the end is fine too.              </Text>

              <Text style={[styles.fieldLabel, { color: theme.tokens.fgDim }]}>API KEY</Text>
              <TextInput
                value={key}
                onChangeText={setKey}
                placeholder="paste your key"
                placeholderTextColor={theme.tokens.fgDim}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
                style={[
                  styles.input,
                  { color: theme.tokens.fg, borderColor: theme.tokens.line, backgroundColor: theme.tokens.surfaceRaised },
                ]}
              />

              <View style={styles.action}>
                <Button
                  label={busy ? "working…" : "fetch the models"}
                  tone="ghost"
                  disabled={busy}
                  onPress={() => void fetchModels()}
                />
              </View>

              {models.length > 0 ? (
                <View style={styles.modelPicker}>
                  <Select
                    label="MODELS ON THIS PROVIDER"
                    value={model.length > 0 ? model : null}
                    options={models.map((m) => ({
                      value: m.id,
                      label: m.label,
                      // The raw id under the readable label, the way the
                      // web app's model rows do it: the label is for
                      // choosing between them, the id is for typing one
                      // in by hand when the list is not there.
                      detail: m.free ? `${m.id}  ·  free` : m.id,
                    }))}
                    onChange={setModel}
                    placeholder="choose a model"
                    filter={{
                      label: "Free only",
                      active: freeOnly,
                      onToggle: () => setFreeOnly((prev) => !prev),
                      matches: (option) => {
                        const found = models.find((m) => m.id === option.value);
                        return found?.free === true;
                      },
                    }}
                  />
                </View>
              ) : null}

              {/*
                * THE ADVANCED FIELD.
                *
                * A provider that does not answer /models, or a model that is
                * not in the list, is a thing that happens — so the name can
                * be typed, and the list is only the easy way to fill it in.
                */}
              <Text style={[styles.fieldLabel, { color: theme.tokens.fgDim }]}>MODEL (ADVANCED)</Text>
              <TextInput
                value={model}
                onChangeText={setModel}
                placeholder="gpt-4o-mini"
                placeholderTextColor={theme.tokens.fgDim}
                autoCapitalize="none"
                autoCorrect={false}
                style={[
                  styles.input,
                  { color: theme.tokens.fg, borderColor: theme.tokens.line, backgroundColor: theme.tokens.surfaceRaised },
                ]}
              />

              {error !== null ? (
                <Text style={[styles.error, { color: theme.tokens.danger }]}>{error}</Text>
              ) : null}
              {note !== null ? (
                <Text style={[styles.note, { color: theme.tokens.fgDim }]}>{note}</Text>
              ) : null}

              <View style={styles.action}>
                <Button
                  label="save this provider"
                  disabled={busy}
                  onPress={() => void save()}
                />
                <Button
                  label="cancel"
                  tone="quiet"
                  onPress={() => {
                    reset();
                    setAdding(false);
                  }}
                  style={styles.cancel}
                />
              </View>
            </Card>
          </Section>
        ) : (
          <View style={styles.action}>
            <Button
              label={providers.length === 0 ? "add a provider" : "add another provider"}
              onPress={() => {
                reset();
                setAdding(true);
              }}
            />
          </View>
        )}
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
  lead: {
    marginTop: 8,
  },
  provider: {
    paddingVertical: 14,
  },
  providerHead: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  providerText: {
    flex: 1,
    paddingRight: 10,
  },
  providerName: {
    ...TYPE.subheading,
  },
  providerMeta: {
    ...TYPE.small,
    marginTop: 3,
  },
  providerActive: {
    ...TYPE.label,
  },
  providerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
  },
  providerButton: {
    minHeight: 34,
    paddingVertical: 4,
  },
  fieldLabel: {
    ...TYPE.label,
    marginTop: 14,
    marginBottom: 6,
  },
  hint: {
    ...TYPE.small,
    marginTop: 6,
  },
  input: {
    ...TYPE.body,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
  modelPicker: {
    marginTop: 12,
  },
  action: {
    marginTop: 16,
    alignItems: "flex-start",
  },
  cancel: {
    marginTop: 8,
  },
  error: {
    ...TYPE.small,
    marginTop: 12,
  },
  note: {
    ...TYPE.small,
    marginTop: 12,
  },
});
