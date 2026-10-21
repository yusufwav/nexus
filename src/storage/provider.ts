/**
 * MODEL PROVIDERS
 * ---------------------------------------------------------------------------
 * BRING YOUR OWN KEY.
 *
 * The web app keeps the reader's provider keys on its server, sealed with a
 * server-side key, and the browser never sees one. A phone has no server to
 * hold them, and does not need one: the device keychain is the right place
 * for a key the reader typed in, and the key goes from the keychain to the
 * provider and nowhere else.
 *
 * So a provider here is four things the reader typed:
 *
 *   name      what to call it, so they can tell their providers apart
 *   address   where the text completions live
 *   key       the secret, and it never leaves the keychain
 *   model     which model to talk to
 *
 * THE SPLIT
 * ---------------------------------------------------------------------------
 * The name, the address and the model are not secret — they are a web
 * address and a label — so they live in AsyncStorage with the rest of the
 * preferences, and the whole list of them travels in one JSON blob. The KEY
 * is secret, so it lives in expo-secure-store, one entry per provider, and
 * it is fetched at the moment it is needed and never held anywhere else.
 *
 * The web app's rule is the same one, and it is worth repeating because it
 * is the reason the two are in different places: "AsyncStorage for plain
 * preferences ... and expo-secure-store for anything that IS a secret."
 *
 * WHY THE ADDRESS IS NORMALISED HERE
 * ---------------------------------------------------------------------------
 * A reader will type the address they were given, and providers are not
 * consistent about what they call it. OpenRouter's is
 * `https://openrouter.ai/api/v1`; somebody's own server might be
 * `http://192.168.1.9:1234/v1`; and a reader who copied the address out
 * of a browser bar might have the FULL endpoint, with `/chat/completions`
 * already on the end. So the address is accepted in either shape and
 * reduced to the base the request is built from.
 */
import { readSetting, writeSetting, removeSetting } from "@/storage/settings";
import {
  clearProviderKey,
  readProviderKey,
  writeProviderKey,
} from "@/storage/secure";

const KEY = "nexus.providers";
const ACTIVE_KEY = "nexus.provider.active";
const MODEL_KEY = "nexus.provider.model.";

/**
 * A provider, without its key.
 *
 * The key is not on this record at all: it is fetched from the keychain
 * when a request is made, and it is never written into the list.
 */
export type Provider = {
  /** Minted on the device, and the handle the key is stored under. */
  readonly id: string;
  /** What the reader calls it. */
  readonly name: string;
  /** The base address, without the endpoint on the end. */
  readonly baseUrl: string;
  /** The model used unless the reader picks another in the chat. */
  readonly model: string;
  /** The last four of the key, so the list can show which key is saved. */
  readonly lastFour: string;
  readonly updatedAt: string;
};

/** A provider and its key, together — what a request actually needs. */
export type ProviderWithKey = {
  readonly provider: Provider;
  readonly apiKey: string;
};

/** A provider id, minted on the device. */
export function newProviderId(): string {
  return `pv_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** The last four characters of a key, which is all the list shows. */
export function lastFourOf(key: string): string {
  return key.length <= 4 ? key : key.slice(-4);
}

/**
 * REDUCE AN ADDRESS TO A BASE.
 *
 * The request is built as `{base}/chat/completions`, so the base is the
 * address with that endpoint taken off the end if it is there, and with any
 * trailing slashes removed — a provider that answers on
 * `https://host/v1/` must not be asked for `https://host/v1//chat/completions`.
 */
export function normaliseBaseUrl(raw: string): string {
  let url = raw.trim();
  if (url.length === 0) return "";
  // A reader who pasted the whole endpoint gets the base back.
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/chat\/completions$/i, "");
  url = url.replace(/\/completions$/i, "");
  return url.replace(/\/+$/, "");
}

/**
 * THE ENDPOINT A REQUEST GOES TO.
 *
 * Always the chat-completions one: this is the shape every provider the
 * app can talk to speaks, and it is the one the web app's tutor speaks.
 */
export function completionsUrl(baseUrl: string): string {
  return `${normaliseBaseUrl(baseUrl)}/chat/completions`;
}

/** Every provider the reader has saved. */
export async function listProviders(): Promise<ReadonlyArray<Provider>> {
  const raw = await readSetting(KEY);
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // A record that is not shaped like a provider is dropped rather than
    // trusted: a half-written list must not take the tutor down with it.
    return parsed.filter(isProvider);
  } catch {
    return [];
  }
}

function isProvider(value: unknown): value is Provider {
  if (value === null || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === "string" &&
    typeof p.name === "string" &&
    typeof p.baseUrl === "string" &&
    typeof p.model === "string" &&
    typeof p.lastFour === "string" &&
    typeof p.updatedAt === "string"
  );
}

/** One provider, or null. */
export async function getProvider(id: string): Promise<Provider | null> {
  const all = await listProviders();
  return all.find((p) => p.id === id) ?? null;
}

/**
 * SAVE A PROVIDER, AND ITS KEY.
 *
 * The key goes to the keychain and the rest goes to the preferences, and
 * the two are written separately because they are stored separately: a
 * failure to write the list must not leave a key in the keychain with
 * nothing pointing at it.
 */
export async function saveProvider(
  provider: Provider,
  apiKey: string,
): Promise<void> {
  const all = await listProviders();
  const next = all.filter((p) => p.id !== provider.id);
  next.push(provider);
  await writeSetting(KEY, JSON.stringify(next));
  await writeProviderKey(provider.id, apiKey);
}

/** Remove a provider and its key. */
export async function deleteProvider(id: string): Promise<void> {
  const all = await listProviders();
  await writeSetting(
    KEY,
    JSON.stringify(all.filter((p) => p.id !== id)),
  );
  await clearProviderKey(id);
}

/** A provider and its key, ready for a request. */
export async function getProviderWithKey(
  id: string,
): Promise<ProviderWithKey | null> {
  const provider = await getProvider(id);
  if (provider === null) return null;
  const apiKey = await readProviderKey(id);
  if (apiKey === null) return null;
  return { provider, apiKey };
}

/**
 * FORGET EVERYTHING.
 *
 * "Clear local data" in the You tab wipes the database; the keys live in the
 * keychain, which that button does not touch, so this is called alongside it
 * or the reader's keys would outlive the thing they were trying to clear.
 */
export async function clearAllProviders(): Promise<void> {
  const all = await listProviders();
  for (const provider of all) {
    await clearProviderKey(provider.id);
  }
  await removeSetting(KEY);
  await removeSetting(ACTIVE_KEY);
}

/**
 * THE PROVIDER THE TUTOR TALKS TO.
 *
 * The reader may have several — a hosted one and one on their own machine —
 * and the chat needs to know which one it is using. When there is only one
 * it is the one, whatever the preference says.
 */
export async function readActiveProviderId(): Promise<string | null> {
  return readSetting(ACTIVE_KEY);
}

export async function writeActiveProviderId(id: string): Promise<void> {
  await writeSetting(ACTIVE_KEY, id);
}

/**
 * THE MODEL THE CHAT IS USING.
 *
 * The provider's own default is the starting point, and the reader can
 * pick another one in the chat without changing the default.
 */
export async function readModelChoice(providerId: string): Promise<string | null> {
  return readSetting(`${MODEL_KEY}${providerId}`);
}

export async function writeModelChoice(
  providerId: string,
  model: string,
): Promise<void> {
  await writeSetting(`${MODEL_KEY}${providerId}`, model);
}
