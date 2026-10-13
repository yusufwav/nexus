import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * KEY CRYPTOGRAPHY — for reader-supplied provider credentials
 * ------------------------------------------------------------
 * AES-256-GCM. The credential is sealed under a server key that lives
 * only in the environment, so what sits in `provider_keys.encrypted_key`
 * is ciphertext with no key beside it.
 *
 * WHY GCM AND NOT PLAIN AES: GCM is authenticated. Plain AES-CBC (or a
 * bare encrypt) would let anyone with write access to the database
 * tamper with a row and have it decrypt to content of their choosing —
 * which, for a credential the server later hands to a provider, is a
 * way to redirect the tutor's traffic somewhere else. GCM's tag makes
 * that fail closed.
 *
 * WHY A DEDICATED SECRET AND NOT BETTER_AUTH_SECRET: the two have
 * different lifetimes. `BETTER_AUTH_SECRET` is documented as
 * rotatable — rotating it invalidates sessions, which is a normal thing
 * to do. If it also sealed every stored credential, a routine session
 * rotation would silently break the tutor's model access for every
 * reader, with no way to tell that from a revoked key. Separate keys,
 * separate blast radius.
 *
 * The format is one base64 string: iv(12) || authTag(16) || ciphertext.
 * Single-column so the row stays simple, and the lengths are fixed so a
 * truncated or mangled value fails the same check everywhere.
 */
const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * The server's sealing key.
 *
 * Throws rather than falling back. The tempting alternative - deriving
 * from something already present, or generating one at boot - is much
 * worse than failing: a random per-boot key makes every stored
 * credential permanently unreadable after a restart, and a derived one
 * quietly ties credentials to a secret that was never meant to protect
 * them. A loud failure at first use beats either.
 */
function serverKey(): Buffer {
  const secret = readSecret();
  if (!secret.ok) {
    throw new Error(secret.problem);
  }
  return secret.key;
}

/** Why the sealing key is unusable, or the 32 bytes that seal with it. */
export type SecretStatus =
  | { readonly ok: true; readonly key: Buffer }
  | { readonly ok: false; readonly problem: string };

const MIN_SECRET_CHARS = 32;

const SECRET_PROBLEM =
  "PROVIDER_KEYS_SECRET is not set, or is shorter than " +
  `${MIN_SECRET_CHARS} characters. Provider credentials cannot be stored without it. ` +
  "Generate one with `openssl rand -base64 32` and add it to apps/web/.env and Vercel.";

/**
 * Read and validate the sealing key, or say precisely why it cannot be read.
 *
 * This exists because of a failure that was invisible for hours. The var
 * is read straight from process.env rather than through the generated env
 * module, so nothing validated it: varlock's hot-reload of .env failed
 * once, the var never reached process.env, and the app carried on. The
 * tutor quietly answered from the server's key while the reader believed
 * their own was in use, and saving a key returned a bare 500. Every one of
 * those symptoms pointed somewhere else.
 *
 * The fix is not to stop reading process.env - it is to CHECK it, at boot
 * and at every failure point, so the cause is named instead of inferred.
 */
export function readSecret(): SecretStatus {
  const secret = process.env.PROVIDER_KEYS_SECRET;
  if (!secret || secret.length < MIN_SECRET_CHARS) {
    return { ok: false, problem: SECRET_PROBLEM };
  }
  // 32 bytes exactly. scrypt-style stretching is deliberately NOT used:
  // this secret is machine-generated random, not a human password, so
  // there is no low-entropy guessing to slow down.
  return {
    ok: true,
    key: Buffer.from(secret.slice(0, 32).padEnd(32, "0"), "utf8"),
  };
}

/**
 * Is the app configured to store reader credentials at all?
 *
 * Called at boot so a missing secret is a line in the server log at
 * startup rather than a mystery discovered when a reader tries to save
 * their key. Returns the problem text so the caller can log something
 * actionable instead of "config error".
 */
export function providerKeysConfigured(): { readonly ok: boolean; readonly detail: string } {
  const status = readSecret();
  return status.ok ? { ok: true, detail: "provider key sealing is configured" } : {
    ok: false,
    detail: status.problem,
  };
}

/** Seal a credential. A fresh IV per call — never reused. */
export function sealKey(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, serverKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, sealed]).toString("base64");
}

/**
 * Open a credential.
 *
 * Returns null rather than throwing for a value it cannot read. A
 * credential that fails to decrypt — wrong server key, tampered row,
 * truncated value — is indistinguishable from one that was never valid,
 * and must be treated that way rather than surfacing as a crash on the
 * request path. The caller turns null into "re-enter your key", which is
 * the only action that can fix any of the causes.
 */
export function openKey(envelope: string): string | null {
  try {
    const raw = Buffer.from(envelope, "base64");
    if (raw.length <= IV_BYTES + TAG_BYTES) {
      return null;
    }
    const iv = raw.subarray(0, IV_BYTES);
    const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
    const sealed = raw.subarray(IV_BYTES + TAG_BYTES);

    const decipher = createDecipheriv(ALGORITHM, serverKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(sealed), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * The last four characters, for the settings list.
 *
 * Taken from the SEALED value's plaintext, never from the envelope — the
 * envelope is ciphertext and its tail carries no meaning. Trimmed so a
 * key padded with spaces shows those spaces rather than nothing.
 */
export function lastFour(plaintext: string): string {
  return plaintext.trim().slice(-4);
}