/**
 * THE READER'S PREFERENCES
 * ---------------------------------------------------------------------------
 * The web app keeps its preferences in `localStorage`:
 *
 *   · the theme choice and the theme override      (lib/theme-override.ts)
 *   · the model picker's selection and favourites   (components/model-picker.tsx)
 *   · next-themes' own copy of the theme           (next-themes writes it)
 *
 * `localStorage` has no native equivalent, so the split is:
 *
 *   · AsyncStorage for plain preferences — the theme id, the reduced-motion
 *     flag, the favourite lesson ids. It is unencrypted, which is right for
 *     a colour scheme and wrong for a secret.
 *   · expo-secure-store for anything that IS a secret — the local account
 *     identity and any provider key the reader has saved. See secure.ts.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  theme: "nexus.theme",
  themeOverride: "nexus.themeOverride",
  reducedMotion: "nexus.reducedMotion",
  firstName: "nexus.firstName",
  email: "nexus.email",
  favLessons: "nexus.favLessons",
  lastModule: "nexus.lastModule",
} as const;

export async function readSetting(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    // AsyncStorage throws on some devices when the store is unavailable.
    // A preference that cannot be read is a preference that keeps its
    // default, which is the correct outcome.
    return null;
  }
}

export async function writeSetting(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {
    // Nothing to do: the preference simply does not persist.
  }
}

export async function removeSetting(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // As above.
  }
}

/* ---- theme ---- */

export async function readThemeId(): Promise<string | null> {
  return readSetting(KEYS.theme);
}

export async function writeThemeId(id: string): Promise<void> {
  await writeSetting(KEYS.theme, id);
}

/* ---- reduced motion ---- */

export async function readReducedMotion(): Promise<boolean> {
  const raw = await readSetting(KEYS.reducedMotion);
  return raw === "1";
}

export async function writeReducedMotion(value: boolean): Promise<void> {
  await writeSetting(KEYS.reducedMotion, value ? "1" : "0");
}

/* ---- favourite lessons ---- */

export async function readFavouriteLessons(): Promise<ReadonlyArray<string>> {
  const raw = await readSetting(KEYS.favLessons);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export async function writeFavouriteLessons(ids: ReadonlyArray<string>): Promise<void> {
  await writeSetting(KEYS.favLessons, JSON.stringify(ids));
}

/* ---- identity (a local, offline account) ---- */

export async function readFirstName(): Promise<string | null> {
  return readSetting(KEYS.firstName);
}

export async function writeFirstName(name: string): Promise<void> {
  await writeSetting(KEYS.firstName, name);
}

export async function readEmail(): Promise<string | null> {
  return readSetting(KEYS.email);
}

export async function writeEmail(email: string): Promise<void> {
  await writeSetting(KEYS.email, email);
}

/** Everything the storage screen reports as "your local data". */
export async function readAllPreferences(): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    Object.entries(KEYS).map(async ([name, key]) => [name, await readSetting(key)] as const),
  );
  return Object.fromEntries(entries);
}

export { KEYS as SETTING_KEYS };
