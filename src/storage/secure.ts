/**
 * SECRETS
 * ---------------------------------------------------------------------------
 * expo-secure-store is the Keychain / EncryptedSharedPreferences equivalent,
 * and it is where anything secret goes.
 *
 * The app has two kinds of secret:
 *
 *   · the READER'S ACCOUNT — a name and an email that identify them inside
 *     this app. The web app kept these behind a Postgres session; on the
 *     device the identity is local, so it lives in the encrypted store
 *     rather than in AsyncStorage, because an email address is personal data
 *     and AsyncStorage is a plain file on disk.
 *   · any PROVIDER KEY the reader has saved. The web app sealed these with
 *     a server-side key (`lib/key-crypto.ts`); the device has no server-side
 *     key, so the device keychain is the strongest thing available and is
 *     the right place for it.
 *
 * The account's own rules — creating one, checking a password, holding the
 * session — live in `src/storage/auth.ts`. This module is the storage
 * underneath it, and nothing else.
 */
import * as SecureStore from "expo-secure-store";

const KEYS = {
  accounts: "nexus.accounts",
  session: "nexus.session",
  /**
   * A PROVIDER KEY, one per provider.
   *
   * This is a PREFIX, not a whole key: the reader may have a key for
   * OpenRouter and another for a model on their own machine, and each
   * belongs to the provider it was entered for.
   */
  providerKey: "nexus.providerKey.",
} as const;

/** Read a secret. Returns null when there is nothing, or on any failure. */
export async function readSecret(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

/** Write a secret. A failure here means the secret does not persist. */
export async function writeSecret(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // Nothing to do.
  }
}

/** Delete a secret. */
export async function deleteSecret(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Nothing to do.
  }
}

/** The key for one provider, if the reader has saved one. */
export async function readProviderKey(providerId: string): Promise<string | null> {
  return readSecret(`${KEYS.providerKey}${providerId}`);
}

export async function writeProviderKey(providerId: string, value: string): Promise<void> {
  await writeSecret(`${KEYS.providerKey}${providerId}`, value);
}

export async function clearProviderKey(providerId: string): Promise<void> {
  await deleteSecret(`${KEYS.providerKey}${providerId}`);
}

export { KEYS as SECRET_KEYS };
