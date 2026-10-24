/**
 * SIGN IN
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/app/login/page.tsx
 *
 * THE FIRST SCREEN, AND THE ONLY ONE THAT IS NOT BEHIND A SESSION.
 * ---------------------------------------------------------------------------
 * The web app's login was a card on a landing page, behind a fixed nav bar,
 * with the gradient ASCII field running underneath it.
 *
 * On a phone the nav bar goes, the card comes forward, and the field goes
 * EDGE TO EDGE behind it. The panel is the web app's card, rebuilt with the
 * app's shared panel treatment: sharp corners, a blurred and tinted
 * background, and grain over the container only.
 *
 * The three third-party buttons are PLACEHOLDERS, and they say so when
 * tapped rather than pretending. There is no OAuth client, no client id and
 * no redirect URI in this app, and there is not going to be one — the whole
 * product is offline.
 */
import { useCallback, useRef, useState, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import { GlassPanel } from "@/components/ui/GlassPanel";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Icon, type IconName } from "@/components/icons";
import { useActiveTheme } from "@/theme/ThemeProvider";
import { TYPE } from "@/theme/typography";
import { RADIUS } from "@/theme/radius";
import { useAuth } from "@/auth/AuthProvider";
import { inkFor } from "@/lib/palette-colours";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-client";

type Mode = "sign-in" | "sign-up";

/**
 * The TextInput's instance type.
 *
 * React Native 0.88 types `TextInput` as a function component, so the
 * instance — the thing with `focus()` and `setNativeProps()` on it — is
 * reached through `ComponentRef` rather than by naming the class.
 */
type TextInputInstance = React.ComponentRef<typeof TextInput>;

const PROVIDERS = [
  { id: "google", icon: "google", label: "Google" },
  { id: "github", icon: "github", label: "GitHub" },
  { id: "microsoft", icon: "microsoft", label: "Microsoft" },
] as const satisfies ReadonlyArray<{ id: string; icon: IconName; label: string }>;

export default function LoginScreen(): React.JSX.Element {
  const theme = useActiveTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { error, signIn, signUp, clearError } = useAuth();

  const [mode, setMode] = useState<Mode>("sign-in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const passwordRef = useRef<TextInputInstance | null>(null);

  const passwordSelection = useRef<{ start: number; end: number } | null>(null);

  /**
   * THE TOGGLE, AND THE KEYBOARD.
   *
   * The reader is checking what they JUST typed, so the keyboard has to
   * survive the tap — a keyboard that disappears on every toggle makes the
   * toggle useless, because you cannot read the password and keep writing
   * it at the same time.
   *
   * React Native does not blur a TextInput when another view is pressed, so
   * the keyboard usually stays on its own. This is the belt to that
   * braces: if the field had focus, it is given it back, and the caret is
   * put back where it was, because a caret that jumps to the end is its own
   * small annoyance.
   */
  const togglePassword = useCallback(() => {
    setPasswordVisible((v) => !v);
    if (!passwordFocused) return;
    requestAnimationFrame(() => {
      const input = passwordRef.current;
      if (input === null) return;
      input.focus();
      const selection = passwordSelection.current;
      if (selection !== null) {
        input.setNativeProps({ selection });
      }
    });
  }, [passwordFocused]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /*
   * A signed-in reader has no business on this screen — but the REDIRECT
   * for that lives in the root layout's gate, not here. One place owns the
   * question "may this route be on screen", and a second answer to it is a
   * second chance to be wrong.
   */

  const switchMode = useCallback(
    (next: Mode) => {
      setMode(next);
      setNotice(null);
      setLocalError(null);
      setConfirm("");
      clearError();
    },
    [clearError],
  );

  const submit = useCallback(async () => {
    if (busy) return;
    setNotice(null);
    setLocalError(null);
    clearError();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    /*
     * THE CHECKS THE CLIENT MAKES, AND WHY.
     *
     * These are not the server's rules duplicated. The server is the
     * authority — it decides whether the account exists — but a client
     * that knows the rules does not spend a round trip finding out, and
     * more importantly it can say WHICH rule was broken.
     *
     * THE LENGTH RULE IS A SIGN-UP RULE, NOT A SIGN-IN RULE.
     *
     * The server enforces a minimum when a password is CREATED. It
     * does not enforce it when one is ENTERED, and it must not: a
     * reader whose password predates a policy change still has to be
     * able to sign in with it. So the client holds the same line — the
     * rule guards the account, and the sign-in form lets the server
     * answer.
     */
    if (email.trim().length === 0 || !email.includes("@")) {
      setLocalError("That does not look like an email address.");
      return;
    }
    if (mode === "sign-up") {
      if (password.length < MIN_PASSWORD_LENGTH) {
        setLocalError(
          `Your password needs to be at least ${MIN_PASSWORD_LENGTH} characters.`,
        );
        return;
      }
      if (name.trim().length < 2) {
        setLocalError("Your name needs to be at least 2 characters.");
        return;
      }
      if (confirm !== password) {
        setLocalError("Those two passwords are not the same.");
        return;
      }
    }

    setBusy(true);
    try {
      const ok =
        mode === "sign-in"
          ? await signIn(email, password)
          : await signUp(name, email, password);
      if (ok) {
        router.replace("/");
      }
    } finally {
      setBusy(false);
    }
  }, [
    busy,
    clearError,
    confirm,
    email,
    mode,
    name,
    password,
    router,
    signIn,
    signUp,
  ]);

  const pressProvider = useCallback((label: string) => {
    setNotice(`${label} sign-in is not wired up yet. Use an email address.`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }, []);

  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (mode === "sign-in" || (name.trim().length > 0 && confirm.length > 0)) &&
    !busy;

  return (
    <View style={styles.root}>
      {/*
       * THE HEADER.
       *
       * The login screen has no side menu — there is nothing to open — but
       * the status bar still has to belong to the app rather than to the
       * window, so the bar is here too. It carries only the dots.
       */}
      <ScreenHeader />
      <View
        style={[styles.scrim, { backgroundColor: `${theme.tokens.bg0}55` }]}
        pointerEvents="none"
      />

      {/*
       * THE KEYBOARD-AWARE SCROLL VIEW.
       *
       * React Native's own `KeyboardAvoidingView` does not work on Android
       * once the app draws edge to edge, which is the default now: the
       * window is not resized, so there is nothing for it to avoid with, and
       * the keyboard simply covers the field you are typing in.
       *
       * `KeyboardAwareScrollView` knows the keyboard's real height, and it
       * scrolls the focused field into view above it — on both platforms,
       * with no per-platform configuration. That is the difference between
       * "sometimes obstructed" and "never obstructed".
       */}
      <KeyboardAwareScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: 16, paddingBottom: insets.bottom + 32 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bottomOffset={insets.bottom + 12}
      >
          <GlassPanel strength="medium" padding={24} style={styles.panel}>
            {/* ---- the wordmark ---- */}
            <Text style={[styles.mark, { color: theme.tokens.fg }]}>
              NEXUS<Text style={{ color: theme.tokens.accentA }}>_</Text>
            </Text>
            <Text style={[styles.eyebrow, { color: theme.tokens.fgDim }]}>
              COMPUTER SCIENCE · NMU
            </Text>

            {/* ---- the mode switch ---- */}
            <View style={[styles.segment, { borderColor: theme.tokens.line }]}>
              {(
                [
                  { id: "sign-in", label: "SIGN IN" },
                  { id: "sign-up", label: "SIGN UP" },
                ] as const
              ).map((option) => {
                const active = mode === option.id;
                return (
                  <Pressable
                    key={option.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => switchMode(option.id)}
                    style={({ pressed }) => [
                      styles.segmentItem,
                      {
                        backgroundColor: active ? theme.tokens.accentA : "transparent",
                        opacity: pressed ? 0.75 : 1,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.segmentText,
                        {
                          color: active ? inkFor(theme.tokens.accentA) : theme.tokens.fgDim,
                        },
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* ---- the fields ---- */}
            {mode === "sign-up" ? (
              <Field
                label="NAME"
                value={name}
                onChangeText={(next) => {
                  setName(next);
                  clearError();
                }}
                placeholder="what should the notes call you"
                autoCapitalize="words"
                textContentType="name"
                theme={theme}
              />
            ) : null}

            <Field
              label="EMAIL"
              value={email}
              onChangeText={(next) => {
                setEmail(next);
                clearError();
              }}
              placeholder="you@nmu.ac.za"
              autoCapitalize="none"
              keyboardType="email-address"
              textContentType="emailAddress"
              theme={theme}
            />

            <Field
              label="PASSWORD"
              value={password}
              onChangeText={(next) => {
                setPassword(next);
                clearError();
              }}
              placeholder={mode === "sign-up" ? "at least 6 characters" : "your password"}
              secureTextEntry={!passwordVisible}
              textContentType={mode === "sign-up" ? "newPassword" : "password"}
              theme={theme}
              inputRef={passwordRef}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              onSelectionChange={(event) => {
                passwordSelection.current = event.nativeEvent.selection;
              }}
              trailing={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
                  accessibilityState={{ selected: passwordVisible }}
                  hitSlop={10}
                  onPress={togglePassword}
                  style={({ pressed }) => [styles.eye, { opacity: pressed ? 0.55 : 1 }]}
                >
                  <Icon
                    name={passwordVisible ? "eyeOff" : "eye"}
                    size={16}
                    tone="dim"
                  />
                </Pressable>
              }
            />

            {mode === "sign-up" ? (
              <Field
                label="CONFIRM PASSWORD"
                value={confirm}
                onChangeText={(next) => {
                  setConfirm(next);
                  clearError();
                }}
                placeholder="type it again"
                secureTextEntry={!confirmVisible}
                theme={theme}
                trailing={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={confirmVisible ? "Hide password" : "Show password"}
                    accessibilityState={{ selected: confirmVisible }}
                    hitSlop={10}
                    onPress={() => setConfirmVisible((v) => !v)}
                    style={({ pressed }) => [styles.eye, { opacity: pressed ? 0.55 : 1 }]}
                  >
                    <Icon
                      name={confirmVisible ? "eyeOff" : "eye"}
                      size={16}
                      tone="dim"
                    />
                  </Pressable>
                }
              />
            ) : null}

            {localError !== null ? (
              <Text style={[styles.error, { color: theme.tokens.danger }]}>{localError}</Text>
            ) : null}

            {error !== null ? (
              <Text style={[styles.error, { color: theme.tokens.danger }]}>{error}</Text>
            ) : null}

            {notice !== null ? (
              <Text style={[styles.notice, { color: theme.tokens.warn }]}>{notice}</Text>
            ) : null}

            {/* ---- the primary action ---- */}
            <Button
              label={mode === "sign-in" ? "SIGN IN" : "CREATE ACCOUNT"}
              onPress={() => void submit()}
              disabled={!canSubmit}
              size="lg"
              fullWidth
              style={styles.primary}
            />

            {/* ---- the provider placeholders ---- */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.tokens.line }]} />
              <Text style={[styles.dividerText, { color: theme.tokens.fgDim }]}>
                OR CONTINUE WITH
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.tokens.line }]} />
            </View>

            <View style={styles.providers}>
              {PROVIDERS.map((provider) => (
                <Pressable
                  key={provider.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue with ${provider.label}`}
                  accessibilityState={{ disabled: true }}
                  onPress={() => pressProvider(provider.label)}
                  style={({ pressed }) => [
                    styles.provider,
                    {
                      borderColor: theme.tokens.line,
                      backgroundColor: theme.tokens.surfaceRaised,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Icon name={provider.icon} size={19} tone="muted" />
                </Pressable>
              ))}
            </View>

            <Text style={[styles.foot, { color: theme.tokens.fgDim }]}>
              Signing in needs a connection.
            </Text>
          </GlassPanel>
      </KeyboardAwareScrollView>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 *  one field
 * ------------------------------------------------------------------ */

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  autoCapitalize = "none",
  keyboardType = "default",
  textContentType,
  theme,
  trailing,
  inputRef,
  onFocus,
  onBlur,
  onSelectionChange,
}: {
  label: string;
  value: string;
  onChangeText: (next: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "words" | "sentences" | "characters";
  keyboardType?: "default" | "email-address";
  textContentType?: "name" | "emailAddress" | "password" | "newPassword";
  theme: ReturnType<typeof useActiveTheme>;
  /** A control that sits inside the field, on the right. */
  trailing?: ReactNode;
  inputRef?: React.Ref<TextInputInstance>;
  onFocus?: () => void;
  onBlur?: () => void;
  onSelectionChange?: NonNullable<React.ComponentProps<typeof TextInput>["onSelectionChange"]>;
}): React.JSX.Element {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: focused ? theme.tokens.accentA : theme.tokens.fgDim }]}>
        {label}
      </Text>
      <Input
        ref={inputRef}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        keyboardType={keyboardType}
        textContentType={textContentType}
        onFocus={() => {
          setFocused(true);
          onFocus?.();
        }}
        onBlur={() => {
          setFocused(false);
          onBlur?.();
        }}
        onSelectionChange={onSelectionChange}
        endContent={
          trailing !== undefined ? (
            <View style={styles.trailing} pointerEvents="box-none">
              {trailing}
            </View>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  scroll: {
    /*
     * TOP-ALIGNED, NOT CENTRED.
     *
     * A ScrollView content container that is both `flexGrow: 1` and
     * `justifyContent: "center"` centres its content when the content is
     * shorter than the screen and OVERFLOWS IT UNREACHABLY when it is
     * longer. The sign-up form adds a field, and on a small phone that is
     * exactly the case: the wordmark would scroll off the top and there
     * would be no way to get it back.
     *
     * Top-aligned with a generous inset is the safe version, and it puts
     * the form where the thumb is anyway.
     */
    flexGrow: 1,
    justifyContent: "flex-start",
    paddingHorizontal: 20,
  },
  panel: {
    width: "100%",
    maxWidth: 460,
    alignSelf: "center",
  },

  mark: {
    ...TYPE.display,
    letterSpacing: 2,
  },
  eyebrow: {
    ...TYPE.label,
    marginTop: 6,
    marginBottom: 18,
  },

  segment: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    overflow: "hidden",
    marginBottom: 18,
  },
  segmentItem: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: RADIUS.control,
  },
  segmentText: {
    ...TYPE.label,
    letterSpacing: 1.6,
  },

  field: {
    marginBottom: 14,
  },
  fieldLabel: {
    ...TYPE.label,
    marginBottom: 6,
  },
  input: {
    minHeight: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputWithTrailing: {
    paddingRight: 46,
  },
  trailing: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  eye: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },

  error: {
    ...TYPE.small,
    marginBottom: 12,
  },
  notice: {
    ...TYPE.small,
    marginBottom: 12,
  },

  primary: {
    marginTop: 4,
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    ...TYPE.label,
    marginHorizontal: 12,
  },

  providers: {
    flexDirection: "row",
    justifyContent: "center",
  },
  provider: {
    width: 58,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: RADIUS.control,
    marginHorizontal: 6,
  },

  foot: {
    ...TYPE.small,
    marginTop: 18,
    fontSize: 11,
    lineHeight: 17,
  },
});
