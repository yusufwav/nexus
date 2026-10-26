# NEXUS MOBILE — VULNERABILITIES

Last updated: 2026-10-26
Scope: this Expo/React Native app (client only), `src/` and `app.json`.
Method: static review, dependency audit, live TLS/header check against the
production host, and stress tests against the parsers and the layout engine.

Status: **CLIENT-SIDE FINDINGS FIXED. ACCEPTED RISKS AND SERVER-SIDE ITEMS
ARE LISTED BELOW WITH THE REASON THEY CANNOT BE FIXED IN THIS REPO.**

## Summary

| Outcome | Count | Items |
|---|---|---|
| Fixed in this repo | 12 | cross-account leak, provider destination, SecureStore, Android backup, foreign keys, transactions/WAL, input validation, offline session expiry, request deadlines, SSE ceiling, maths layout DoS, CSPRNG ids |
| Accepted, documented | 3 | plaintext SQLite, bundled content + local unlock, screen capture/rooted device |
| Server-side, out of scope | 9 | RLS, MFA, brute force, password hashing, account enumeration, refresh tokens, CSP, HSTS, cert operations |
| Corrected from the first pass | 4 | SSRF framing, HTTP-address claim, FK/transaction claims, dependency severity |

---

## What was fixed

### 1. Cross-account data leak — FIXED

**Was:** `signOut` cleared the cached session but left purchases, progress,
attempts and chat threads in SQLite. The next person to sign in on the same
phone inherited all of it (`IDEAS/TODO.md` item 1).

**Now:** `src/storage/scope.ts` records the account that owns the local data
(`meta.owner_user_id`). Every accepted session calls `adoptUserScope`; if the
owner on record is a different account, `clearUserContent()` runs **before**
the new account sees anything. The first account after this ships adopts the
existing data rather than wiping it, because that data can only belong to the
reader upgrading the app.

`clearUserContent()` is one transaction and also removes the saved provider
keys from the keychain — "clear local data" now means what it says.

Sign-out deliberately does **not** wipe: the app is offline-first and the
data is the reader's notes. The wipe happens at the account boundary, which
is the moment that matters.

### 2. Provider destination — FIXED

**Was:** the form required `https://`, but a stored record was never
re-validated, and any HTTPS host was accepted. A reader talked into adding
"a free model endpoint" would send their API key there, and an address on
the local network could be used to reach the router or a metadata endpoint.

**Now:** `src/lib/provider-url.ts` exports `checkProviderUrl`, which rejects:

- any scheme other than `https:`;
- credentials embedded in the URL (`https://key@host/`);
- `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.home.arpa`;
- loopback, private, link-local, carrier-grade NAT, benchmarking, multicast
  and reserved IPv4 ranges (including `169.254.169.254`);
- IPv6 loopback, unspecified, link-local, unique-local and IPv4-mapped
  private addresses.

The check runs at **three** layers: the settings form, `saveProvider` (so a
restored or imported record cannot bypass the form), and `streamChat` /
`listModels` immediately before the key goes into the `Authorization`
header. Twenty test addresses were run through it; every private form was
blocked and public providers passed.

**Residual risk:** DNS rebinding. A public name that resolves to a private
address at request time cannot be detected before the connection in React
Native. The reader is adding a provider they chose, and the screen names the
host the key is going to; this is recorded as accepted.

### 3. Secrets at rest — FIXED (hardened)

`src/storage/secure.ts` now writes with
`keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY`. The session token and
provider keys are readable only while the device is unlocked and are **not**
restored onto a new device from an iCloud/iTunes backup. Android ignores the
option because the Keystore already refuses to export the key material.

### 4. Android backups — FIXED

`app.json` sets `android.allowBackup: false`. Without it, `adb backup` and
cloud backup could copy `nexus.db` off the device. (Also corrected the splash
and adaptive-icon background to `#050505`, which removes a white flash.)

### 5. Foreign keys, cascades and ordering — FIXED

The schema now declares `REFERENCES … ON DELETE CASCADE` for
`topics`, `lessons`, `questions`, `purchases`, `attempts`, `read_positions`
and `messages`, and the connection enables `PRAGMA foreign_keys = ON`.

This exposed a real ordering bug: `persistMessages` wrote messages **before**
their thread. With enforcement on, a fresh thread would have failed its first
message. The thread is now upserted first, then its rows. `deleteThread`
deletes messages and thread in one transaction.

**Note on existing installs:** `CREATE TABLE IF NOT EXISTS` does not alter a
table that already exists, so devices upgrading keep the old table shape and
enforcement applies to new installs. The app-level cleanup remains in place,
so nothing depends on the cascade.

### 6. Transactions and journal mode — FIXED

`clearUserContent`, `deleteThread` and `persistMessages` are transactional;
`PRAGMA journal_mode = WAL` is set on open. A crash mid-delete can no longer
leave half of one reader's history behind for the next.

### 7. Input validation — FIXED

`src/app/login.tsx` replaced `email.includes("@")` with a shape check plus
length caps (254 for the address, 80 for a name, 1024 for a password). The
server remains the authority on whether an address exists; this stops typos,
junk, and oversized bodies before they are sent.

### 8. Offline session expiry — FIXED

A cached session is now rejected when its stored expiry is in the past, even
with no network. Previously a cache could keep the app in a signed-in shell
after the server had stopped honouring the token.

Sign-in also caches the **server's** expiry now: the sign-in response has no
expiry, so `toSession` guesses seven days, but the `get-session` confirmation
that follows carries the real one, and that is what is written.

### 9. Request deadlines — FIXED

Auth calls and `listModels` use a 20-second `AbortController` that covers the
body as well as the headers. An aborted body is reported as a timeout, not as
an empty successful response — a sign-in cannot "succeed" with no body.

### 10. Stream size ceiling — FIXED

`readFrames` in `src/lib/llm.ts` caps a single frame at 1,000,000 characters
and a whole response at 4 MB. An endpoint that never sends a blank line used
to grow the buffer until the app ran out of memory; it now stops with a
reader-facing error.

### 11. Maths layout denial of service — FIXED

`layoutMath` is O(n²). Measured before the fix:

| input | time |
|---|---|
| 10,000 characters | 0.85 s |
| 50,000 characters | 33 s |
| 100,000 characters | 132 s |
| 1,000,000 characters | did not finish in 3 minutes |

A tutor answer is model output, and the model can be any endpoint the reader
added, so an unbounded equation froze the UI. Two changes:

- `MAX_MATH_SOURCE = 2000` in `src/lib/latex/index.ts`. Longer sources are not
  laid out; `MathBox`, `Markdown`'s display block and inline maths all render
  the source as text instead of a half-drawn equation.
- The parser has a depth cap of 64 (`src/lib/latex/parse.ts`). Unclosed
  nesting (`{{{{…`, `\frac\frac\frac…`, `\left(\left(…`) used to recurse until
  the JavaScript stack overflowed; it now falls back to literal text.

After the fix, the same 1 MB input lays out in **46 ms**, and every
pathological input in the test set returns in under 120 ms with no crash.

### 12. Identifier generation — FIXED

Provider ids, thread ids, message ids and attempt ids were built from
`Date.now()` and `Math.random()`. They now come from `expo-crypto`'s
`randomUUID` (`src/lib/ids.ts`). These are not capability tokens, but they are
written to disk, restored from backups and used as keychain handle suffixes,
so guessing them should not be cheap.

---

## Accepted risks

### A. The SQLite database is not encrypted

`expo-sqlite` has no SQLCipher build; encrypting at rest means replacing the
database layer (op-sqlite + SQLCipher, or a custom build), which is a
dependency and native-build decision, not a code change.

What is in the database: module/lesson/question text (public content), the
reader's purchases, attempts, read positions, chat threads and messages.
Secrets — the session token and provider keys — are **not** in it; they are in
the Keychain/Keystore.

Mitigations already in place: app sandbox, Android backup disabled, iOS Data
Protection on the container, and no passwords or tokens in SQLite. A rooted
or jailbroken device with the app's files can still read progress and chat.
Recorded in `IDEAS/TODO.md` as the local-unlock/encryption work.

### B. Content and answers ship in the bundle; unlock is local

`src/content/module-content.ts` and `src/content/practice-questions.ts` are in
the JS bundle, and `unlockModule` writes a local purchase row. Anyone with the
IPA/APK can read the lessons and the answers, and can unlock every module.

This is a product boundary, not a bug that can be patched on the client: the
offline-first design requires the content to be on the device, and a paywall
that runs on the device cannot be authoritative. Real enforcement needs the
content delivered per entitlement from the server. Tracked in `IDEAS/TODO.md`.

### C. Screen capture and compromised devices

Nothing prevents a screenshot of a lesson or a chat. Blocking it needs
`expo-screen-capture` (`FLAG_SECURE` on Android), which also blocks the
reader's own screenshots and does not stop a camera. Out of scope, as
recorded in the web TODO.

---

## Server-side items (cannot be fixed here)

The app talks only to `https://nexus-tutoring.vercel.app`; it never touches
Postgres, and it implements no authentication of its own.

| Item | Why it is server-side |
|---|---|
| Row Level Security | Postgres policies; the client never queries the database |
| MFA | Needs server support and a UI contract; the client has no second factor to offer |
| Brute-force protection | Rate limiting belongs at the edge; the client already surfaces `429` |
| bcrypt/argon2, salting | Passwords never reach the client |
| Account enumeration | The server decides whether `USER_ALREADY_EXISTS` is disclosed; the client shows its message |
| Refresh tokens | The session lifetime is the server's; the client now honours it and revalidates on launch |
| CSP | No HTML is served by the client |
| HSTS / security headers | Server response headers |
| Certificate operations | Renewal is the host's job |

**Live check (2026-10-26, `https://nexus-tutoring.vercel.app`):**

- certificate `*.vercel.app`, issued by Google Trust Services, valid
  2026-08-29 → **2026-11-27** (32 days remaining at the time of the check);
- `strict-transport-security: max-age=63072000; includeSubDomains; preload`;
- `x-content-type-options: nosniff`, `x-frame-options: DENY`,
  `referrer-policy: strict-origin-when-cross-origin`;
- **no** `content-security-policy` — the server should add one.

The certificate is short-lived and renews automatically on Vercel; the note is
here so that a failed renewal is a known failure mode rather than a surprise.

---

## Dependencies

`npm audit` reports 5 high advisories after the SDK patch updates. `npm ls`
shows where they live:

```
expo@58.0.19
└─ @expo/cli@58.1.13
   ├─ @expo/code-signing-certificates → node-forge@1.4.0
   ├─ node-forge@1.4.0
   └─ zod@3.25.76
```

**Every one is build-time or lint-time tooling.** None is in the app bundle:
the CLI and the code-signing helpers run on the developer machine, and `zod`
here is the CLI's config validator, not an input parser in the shipped code.

`npm audit fix` cannot resolve them: the only offered fix is
`npm audit fix --force`, which installs `expo@44.0.6` — a downgrade of four
SDK generations that would break the app. The correct response is to track the
upstream packages; `npx expo install --check` now reports the app's own
dependencies as up to date.

The three moderate advisories that were present in the first pass
(`@expo/config-plugins`, `xcode`, `uuid`) were resolved by the SDK patch
updates (`npx expo install --fix`), which also moved `expo` to 58.0.19.

`expo-crypto` was added (`npx expo install expo-crypto`) for the CSPRNG ids.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npx expo lint` — clean.
- `npx expo config --type public` — accepts `allowBackup: false`.
- `npx expo install --check` — dependencies up to date.
- Provider-URL guard: 20 cases, all private/plain/credential forms blocked,
  public providers allowed, endpoint suffixes normalised away.
- Maths layout: 13 pathological inputs (1 MB plain, unclosed braces, `\frac`
  chains, `\left` chains, matrix, accents, surrogates) — no crash, no input
  above 120 ms.
- SSE ceiling, request deadlines and the account-scope wipe are covered by
  code review; they need a device to exercise end to end.

**Not verified at runtime:** no Android device or development build is in the
loop for this pass. SecureStore accessibility, Android backup exclusion,
foreign-key enforcement on a fresh install and the account-switch wipe should
be confirmed on a device before release.
