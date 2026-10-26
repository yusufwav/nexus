# NEXUS MOBILE — TODO

Everything in this file is unfinished, stubbed, known-wrong, or a decision the
app has not made yet. Check items off as they are built; new gaps go at the
bottom of their section.

It is the **mobile app's** list and only the mobile app's. The web app's two
TODOs are the source for sections 5, 9 and 10 — filtered to what a phone
actually changes, because most of what they describe (a Next.js route, a
Drizzle migration, a CSS hover) cannot port and is not repeated here.

- `C:\Users\yusuf\orca\projects\nexus\IDEAS\TODO.md` — the product TODO:
  features, payments, content, auth gaps, copy.
- `C:\Users\yusuf\orca\projects\nexus\TODO.md` — "Protecting the notes":
  the bulk-download/read-budget plan.

Last updated: 24 October 2026.

---

## 0. Where the app actually stands

Grounded by opening the files, not by reading the docs. Each row is verifiable
by following the reference.

| Area | State today |
| --- | --- |
| Auth | Real. Email + password against `https://nexus-tutoring.vercel.app/api/auth`, session cached in SecureStore, boots offline. No reset, no OAuth, no verification action. |
| Catalogue | 13 modules, all priced R5000 cents, **1 written** (MATT101), 12 marked `coming-soon`. |
| Entitlement | **Local and free.** "Unlock" writes a `paid` row into SQLite with `provider='local'`. No money, no server, no account state. |
| Notes | MATT101's whole lesson text ships in the binary (`src/content/module-content.ts`) and is seeded into SQLite. **No PDF of any kind exists.** |
| Practice | 11 questions seeded, **only the 7 multiple-choice ones are runnable** (`src/app/practice/[code].tsx:72`). Graded on device. |
| Tutor | Real, streamed, **BYOK only** — no server default, no key, no chat. Retrieval runs on device over the local database. |
| Themes | 52 palettes + match-system, device-local. |
| Tests | None. `npm run test:latex` is the only test entry point in `package.json`. |
| Build | No `eas.json`, no dev client, `com.anonymous.Nexus`, white splash. |

The short version: **the shell is finished and the content, the money and the
account are not.** Everything in section 1 is a defect in the shell.

---

## 1. Wrong today — fix these

Each of these is a fact in the current source, not a preference.

- [ ] **The practice card counts questions the session cannot run.**
      `src/app/(tabs)/practice.tsx:46` counts every seeded question with
      `getQuestions(m.code).length`, and `src/app/practice/[code].tsx:72`
      keeps only `format === "multiple-choice"`. There are 11 seeded questions
      (7 multiple-choice, 3 application, 1 proof-order), so MATT101's card
      advertises 11 and the session has 7. Either count what the session can
      run, or build the other two formats (§8). Do not leave the number lying.
- [ ] **The You tab shows "None yet" until something is saved.** The mount
      effect at `src/app/(tabs)/profile.tsx:94-121` re-implements `load()` and
      omits `setProviderCount(...)` (`:91`), which only runs after a name save
      or a wipe. Delete the duplicate effect and call `load()` on mount. Home
      carries the same duplication without the bug
      (`src/app/(tabs)/index.tsx:131-170`) — one loader per screen.
- [ ] **The sign-up password hint contradicts the rule.** `src/app/login.tsx:332`
      says "at least 6 characters"; `MIN_PASSWORD_LENGTH` is **12**
      (`src/lib/auth-client.ts:107`) and the form enforces it (`login.tsx:159`).
- [ ] **Coming-soon modules can be "bought".** `src/app/module/[code].tsx:155-174`
      branches only on `owned`, so the unlock button renders for all 12
      unwritten modules and writes a paid row for content that does not exist.
      Gate the button on `status === "available"` (or on there being content).
- [ ] **The privacy copy is false.** `src/app/settings/about.tsx` says
      "Nothing leaves this device" (`:86`), "the notes never leave the phone"
      (`:62-64`) and "Search — the notes are searched on the device, never
      sent" (`:97`). Sign-in posts credentials to the server; the tutor posts
      the retrieved note text to the reader's provider as a tool result
      (`src/lib/llm.ts:172-181, 203-210, 315-317`). Rewrite around what is
      actually true: progress, answers and notes stay local; sign-in and the
      tutor are network calls; the provider receives the passages it is asked
      about.
- [ ] **"Wipe all of it" is not all of it.** `clearUserData()`
      (`src/storage/database.ts:187-205`) deletes purchases, attempts, read
      positions, threads, messages, the profile row, the cached session and
      the keychain keys — **the account on the server survives**. Say so, or
      add account deletion (§9).
- [x] **A shared device leaks progress between accounts.** Fixed in
      `src/storage/scope.ts`: the account that owns the local data is recorded
      in `meta.owner_user_id`, and a different account signing in wipes the
      previous account's purchases, progress, threads and provider keys before
      it sees anything. Sign-out still keeps the data, because the app is
      offline-first and the data is the reader's notes — the wipe happens at
      the account boundary, which is the moment that matters. See
      `VULNERABILITIES.md` §1.
- [ ] **The 404 screen is the only one with no header.** `src/app/+not-found.tsx:27`
      pads itself with `insets.top + 40` and uses no `ScreenHeader`, against
      `AGENTS.md` rule 1. Give it a header and drop the inset.
- [ ] **The "not built yet" lists disagree.** Home lists four items
      (`src/app/(tabs)/index.tsx:489-500`), About lists five and includes
      "a checkout that takes money" (`src/app/settings/about.tsx:69-81`).
      One list, or drop the lists and let the product say it.
- [ ] **Stale comments that will mislead the next reader.**
      `src/app/(tabs)/index.tsx:14` still describes a "Letter Glitch field"
      (that field is gone); `eslint.config.js:22-31` describes four generated
      DOM components and a `scripts/build-dom-components.mjs` that does not
      exist (the directory holds one hand-written file), and a
      `npm run typecheck` script that is not in `package.json`.
- [ ] **Home says you "spent" money you never spent.** `src/app/(tabs)/index.tsx:137-141`
      sums the local `paid` rows and shows the total as spend. Every one of
      those rows was written by a free, local unlock (§4), so the figure is a
      price list, not a payment history. Until checkout is real, call it
      something true or show nothing.

---

## 2. Stubs that already have a home

These are not "missing features" — they are half-built, with the seam already
in the code, which makes each one cheaper than it looks.

| Stub | Where | What is missing |
| --- | --- | --- |
| Email verification | `resendVerificationRemote` is exported and **never called** (`src/lib/auth-client.ts:438-443`); the You tab shows PENDING (`profile.tsx:171-179`) | A resend button, and a gate — the app works unverified and nothing says what verification buys |
| Social sign-in | `src/app/login.tsx:16-17, 200-203, 412-441` | Three buttons that only raise a notice. No client ids, no plugin, no deep-link return |
| Password reset | nowhere | No screen, no client call, no server endpoint (the web app has none either) |
| Trial PDF | `hasTrialPdf` is seeded into SQLite (`src/storage/library.ts:49, 76`) | Nothing reads the column. The module page has no preview, no sample, no "read before you buy" |
| Topic PDF | `src/content/module-topics.ts` — every `pdf` is `null`; `src/app/topic/[slug].tsx:169` prints a sentence instead | Files, a downloader, a viewer, and a gate |
| Checkout | `unlockModule` (`src/storage/library.ts:255-270`) writes `status='paid'`, `provider='local'` | A provider, a server purchase row, receipts, refunds (§4) |
| Chat history | `src/storage/chat.ts` — local threads only; `renameThread` (`:98`) is unused | Sync, rename UI, and cross-device history (the web app has `/api/chat` for this) |
| Favourite lessons | `readFavouriteLessons` / `writeFavouriteLessons` (`src/storage/settings.ts:80-93`) | A star on the lesson screen and a "revise what I starred" entry |
| Account theme | `RemoteUser.theme` (`src/lib/auth-client.ts:134`) declared, never read or written | Theme follows the account instead of the device |
| Search | `SearchField` exported (`src/components/ui.tsx:60`), no consumer | Catalogue search, or delete it |
| Bundles | `BUNDLES` (`src/content/module-catalog.ts:147-150`) — R250 for the catalogue, `wasAmountCents: 65000` | Nothing renders it, nothing can buy it, and the number disagrees with the catalogue (13 × R50 = R650) |
| Local identity | `readEmail` / `writeEmail` (`src/storage/settings.ts:105-111`) | Never used; the account email comes from the session |
| `profile` table | created and wiped (`src/storage/database.ts:143-146`) | Never read or written — either use it for the account mirror or drop it |
| `listAttempts` | `src/storage/progress.ts:60` | Never imported; the Home and Practice screens use the tally instead |
| `themeOverride` key | `src/storage/settings.ts:22` | No reader, no writer |

---

## 3. Shipping the app

Nothing in this section is product work, and every item is a reason a store
submission or a fresh clone fails.

- [ ] **The app cannot run in Expo Go.** `react-native-keyboard-controller` is
      a third-party native module, so the app needs `npx expo run:android` or a
      development build. There is no `expo-dev-client` and no `eas.json`, so
      there is no built artefact of any kind yet.
- [ ] **Identity is still the template's.** `app.json:23` — `com.anonymous.Nexus`;
      iOS has no `bundleIdentifier`; no `versionCode` / `buildNumber`. These
      are permanent once an app is published.
- [ ] **The launch colour is white.** `app.json:37` splash `#ffffff` against an
      app whose page is `#050505`; the adaptive icon background (`:17`) is the
      Expo template's `#E6F4FE` and belongs to no palette. The splash is the
      first frame the reader sees and it currently flashes.
- [ ] **No EAS configuration.** No `owner`, no `extra.eas.projectId`, no
      `runtimeVersion`, no `updates` block. OTA updates are the reason to use
      EAS; without them every typo in a lesson is a store release (§5).
- [ ] **No environment story.** `API_BASE` is hard-coded to production
      (`src/lib/auth-client.ts:96`); there is no `.env`, no `.env.example`,
      and no way to point the app at a local server. Do this before the next
      auth change, not after.
- [ ] **No tests and no CI.** No `*.test.*`, no `__tests__`, no `.github/`.
      The two cheapest first tests are pure and need no device:
      `gradeAnswer` (`src/lib/practice-grading.ts`) and `formatZar`/`shortDate`
      (`src/lib/money.ts`).
- [ ] **No `typecheck` script.** `AGENTS.md` asks every agent to run
      `npx tsc --noEmit`; `package.json` has `lint` but not this. Add it so the
      check is one command and CI can call it.
- [ ] **No crash reporting or analytics.** The only boundary is Expo Router's
      error export (`src/app/_layout.tsx`). A store build with no reporting is
      flying blind; pick one (Sentry, Bugsnag) before the first release.
- [ ] **Accessibility is unlabelled.** Back buttons carry `accessibilityRole`
      but no `accessibilityLabel` (`module/[code].tsx:117`,
      `topic/[slug].tsx:96`, `practice/[code].tsx:168`,
      `settings/provider.tsx:236`, and others); the header title has no
      `accessibilityRole="header"` (`src/components/ui/ScreenHeader.tsx`); the
      two You-tab switches have no label association (`profile.tsx:268-274`).
- [ ] **Portrait only, tablets claimed.** `app.json:6` locks portrait and
      `:12` enables iPad, with no layout that adapts. Either support it or turn
      it off.
- [ ] **Four installed dependencies are never imported** —
      `expo-constants`, `expo-linking`, `expo-symbols`, `expo-web-browser`
      (`package.json:8, 11, 17, 19`). `expo-linking` matters: the `nexus`
      scheme is declared (`app.json:8`) and nothing handles a link.
- [ ] **Keyboard handling is ad hoc.** Login has a keyboard-aware scroll view;
      the provider form does not (`src/app/settings/provider.tsx`), and the
      tutor measures the overlap by hand (`tutor.tsx:147-190`). One pattern.

---

## 4. Money and entitlements — the part that does not port

The web plan is "Paystack or Yoco, a `pending` purchase row, a webhook, then
`paid`". None of that can be lifted as written, and this is the biggest mobile
decision outstanding.

- [ ] **Decide how digital content is sold in the app.** Google Play and the
      App Store both require their own billing for digital goods consumed in
      the app. The three real options:
      1. **In-app purchase** (RevenueCat or the store SDKs) — compliant
         everywhere, 15–30% goes to the store.
      2. **No in-app selling** — the app is a reader and "buy on the web" is a
         link out. Cheapest to build, and the policy risk is on Play, which is
         stricter than Apple about steering.
      3. **Web checkout opened in a browser**, unlocked by server entitlements
         — same risk as (2), better conversion.
      Do not build a checkout before this is chosen.
- [ ] **Entitlements have to come from the account, not from SQLite.**
      `getOwnedCodes()` reads the local `purchases` table
      (`src/storage/library.ts`), so today a reinstall loses every purchase, a
      second device has none, and "remove from your account" deletes the only
      record (`releaseModule`, `library.ts:273-276` — a refund with no refund
      trail). The server already has `purchases`; the app needs to fetch it
      and merge it with local rows.
- [ ] **`hasTrialPdf` is a second, silent free tier.** It is seeded, never
      read, and on the web it means "any signed-in reader may read MATT101".
      Pick one rule for "free" and implement it on both surfaces.
- [ ] **Prices ship inside the app.** `priceCents` lives in
      `src/content/module-catalog.ts`, which is bundled, so a price change is
      an app update. Prices belong to the catalogue on the server once
      checkout exists.
- [ ] **The bundle price is inconsistent.** `BUNDLES.full` is R250 against a
      "was" of R650, while the web landing page sells "all 7 modules" for the
      same R250 and the catalogue has 13. One number, one source.
- [ ] **Refunds.** `releaseModule` deletes the row. Even before a provider is
      wired, a refund should leave a `refunded` row rather than erase history.

---

## 5. Content, and the leak that is already shipped

- [ ] **1 of 13 modules is written.** `src/content/module-content.ts` has
      MATT101 only; the other 12 render the coming-soon state
      (`module/[code].tsx:245`). Lesson text is TypeScript, so a typo fix is a
      deploy — the same constraint the web app has, and on mobile it is an
      **app release**, not a deploy.
- [ ] **79 topic PDFs are all null.** `src/content/module-topics.ts:36-40` says
      so and points at this file. Page counts are invented and the slugs are
      provisional; the `module-code-` prefix is deliberate (`:24-28`) and
      should survive any future server lookup, because a slug is the key a
      download route would resolve against.
- [ ] **The paywall is decorative today, and that is worth naming.** MATT101's
      full lesson text is bundled (`src/content/module-content.ts`) and seeded
      into SQLite at first launch (`src/storage/library.ts:60-152`), and the
      unlock is free and local (§0). Extracting the APK gets the notes without
      paying. The web app's read budget and watermark protect an HTTP route
      the app never calls.
- [ ] **The same is true of practice answers.** `src/content/practice-questions.ts`
      ships every `correct` flag and `explanation`, because grading is on
      device (`src/lib/practice-grading.ts`). Its own header is honest that
      offline the answer/reveal split is "enforced by construction" — the
      screen cannot see the answer, but the bundle can.
- [ ] **Decide whether that matters yet.** The web TODO's position is that
      there is currently nothing to steal (one module, dummy PDFs). If that
      holds, write it down and move on; if not, the fix is not a watermark on
      the device — it is not shipping the text until entitlements are real.
- [ ] **If PDFs come to mobile**, `expo-file-system` is not installed, Android
      needs a share/content-URI path, and a downloaded PDF sits outside every
      gate the web app built. Plan that before the first file ships.
- [ ] **Content updates cannot be patched.** With no `expo-updates`, every
      lesson fix is a binary release. Either adopt EAS Update (§3) or accept
      that content is released with the app.

---

## 6. The tutor

- [ ] **BYOK is not onboarding, it is a cliff.** With no provider the chat is
      an empty state with an "add a provider" button
      (`src/app/(tabs)/tutor.tsx:737-760`). The web plan's A3 — collect a key
      at signup, impossible to miss, explain what it costs — applies here more
      strongly, because the app has no server default at all. A reader who
      signs up and taps the tutor currently gets a wall.
- [ ] **Nothing verifies the reader.** The web route refuses unverified email
      with 403. The app has no gate and no resend (§2).
- [ ] **The retrieval is not the web's retrieval.** On device it is term
      overlap over the seeded notes, a handful of passages ranked best-first
      (`src/lib/tutor-engine.ts:283-300`),
      no embeddings, no owned-module scope — it searches whatever is in the
      local database, which is MATT101 regardless of purchase. The web
      invariant ("no code path can return an unpaid-for chunk") has no mobile
      equivalent yet.
- [ ] **Threads do not leave the device.** `src/storage/chat.ts` is SQLite;
      the web has `/api/chat` and per-account history. Decide whether the
      phone's history is meant to meet the desktop's.
- [ ] **No usage accounting.** The reader pays their provider directly, so a
      stolen key is their bill and there is no way to see the spend in the app.
- [ ] **Provider addresses are unvalidated beyond https.**
      `src/app/settings/provider.tsx:161-164` — correct for a device (the key
      goes only where the reader points it), but say so in the UI, next to the
      endpoint the screen already displays.
- [ ] **No moderation, no attachments, no voice, no export of a conversation.**
      Not blockers; listed so they are not mistaken for finished.

---

## 7. Practice

- [ ] **Only multiple choice runs.** 3 `application` and 1 `proof-order`
      question are seeded and unreachable (`practice/[code].tsx:72`). The web
      plan's B2b (tolerance check → worked solution → optional model) and B2c
      (proof pieces, green/yellow/red) are the intended formats.
- [ ] **Port B2c before B2b.** Proof-order is the format a phone is *better* at
      than the web: no LaTeX typing, just taps. B2b needs a numeric answer
      field and a tolerance rule, which is more work for less certainty.
- [ ] **The counts and the session must agree** (§1).
- [ ] **The weakness profile is a tally, not a profile.** Attempts are real
      (`src/storage/progress.ts`), and Home/Practice show weakest modules — but
      there is no per-topic accuracy, no error type, and nothing feeds the
      tutor. That last part is the feature the web TODO calls the point of the
      whole thing.
- [ ] **No spaced repetition.** The attempts table is the natural input; there
      is no schedule, no due list, no card.
- [ ] **The session is ungated.** On the web, grading is a paid action and the
      entitlement check sits before it. On mobile every reader can practise
      every module, consistent with local unlocks (§4).

---

## 8. Account and auth

- [ ] **Password reset** — no screen and no client call. The server has no
      endpoint yet either, so this is a two-repo item.
- [ ] **Change password, delete account, active sessions, sign out
      everywhere** — none exist. The You tab ends at name, email, sign out and
      a local wipe (`src/app/(tabs)/profile.tsx`).
- [ ] **Email verification** — displayed, never actionable (§2).
- [ ] **The name is local only.** `writeFirstName` (`src/storage/settings.ts:101`)
      never reaches the server, so the web and the phone disagree about who
      the reader is.
- [ ] **The session expires in seven days with no refresh.**
      `src/lib/auth-client.ts:353-356` invents the expiry the server set, and
      there is no renewal call. A reader offline for a week is signed out. Fine
      or not — decide and write it in the login copy.
- [ ] **No export.** The web lists it as a placeholder; on mobile the data is
      one SQLite file and a keychain entry, which makes an export cheap.
- [ ] **No offline banner.** Only the cached session path
      (`src/auth/AuthProvider.tsx:77-128`) and one line on the You tab know
      about connectivity. A tutor request that fails offline says what the
      provider said.

---

## 9. From the web TODO — what actually applies

Not a copy of their list: the mobile consequence of each item.

| Web item | Mobile |
| --- | --- |
| Payments — `startCheckout()` stub, webhook, `providerRef` | Cannot port; see §4. The provider choice is the same (Paystack/Yoco) only if the store allows it |
| Read budget on `GET /api/topics/[slug]` | Protects a route the app never calls. The app holds the notes instead (§5) |
| Watermark, read ledger, terms | Attribution only matters once content is served from the server. If the app keeps text locally, a device watermark is cosmetic |
| Topic PDFs, trial PDF | §5. `hasTrialPdf` is seeded and dead; no PDF path exists |
| Module content — 1 of 13 | Same file, same one module. On mobile it is an app release to fix |
| Improvement form — no backend | Mobile has no form and no endpoint. Add it beside About, or drop it from both |
| Dashboard features — continue reading, weak spots, practice | **Already built on mobile** (read positions, attempts, weak spots). The web is the one that is behind here |
| Spaced revision, notes in own words, annotations, offline copies | Still not built, and both "Not built yet" lists say so (§1) |
| Avatars — initials only, no upload | Mobile has initials only and no `image` prop (`src/components/ui/Parts.tsx:233-285`). Same gap, smaller surface |
| Light mode — written for contrast, not audited | 52 palettes, one field, no contrast audit. The mobile surface is bigger than the web's, so this is *more* work here |
| Auth gaps — social, reset, verification | Same three, §8 |
| Copy: "13 modules for every semester" vs 12 unwritten; R250 vs 7 modules | The catalogue ships in `src/content/module-catalog.ts`; fix the numbers there as well, or the phone and the site will disagree |
| React Compiler, Drizzle, Neon, secrets, RLS | Server-only. Nothing to do here |
| Verification culture — "the artefact is observed, not the exit code" | Applies directly: no device in the loop means no runtime claim. See §10 |

---

## 10. Verifying anything in this file

- `npx tsc --noEmit` and `npx expo lint` before calling anything done (add the
  missing `typecheck` script, §3). `npx expo-doctor` when config changes.
- **Previews are the only way to see the app without a device.** `node
  scripts/preview-readme.mjs`, `preview-tutor.mjs`, `preview-menu.mjs`,
  `preview-buttons.mjs`, `preview-picker.mjs`, `preview-latex.mjs` render real
  type, real palette tokens and real spacing to PNGs in `.expo-preview/`.
  They are mocks of screens, not screenshots.
- **Transition and gesture behaviour cannot be previewed.** Anything in §1
  that only shows at runtime (the practice count, the provider count, the
  coming-soon unlock, the two-screens-at-once fix) needs
  `npx expo run:android`.
- The only executable test is `npm run test:latex`. Nothing in the storage,
  auth, grading or routing layers has ever been executed by a machine.
- Do not trust a `tsc` pass as evidence that a screen works: the web TODO's
  "What verification actually found" section is a list of things that passed
  both the type checker and a markup assertion and still did nothing.

---

## Known-good — do not disturb

These work, are documented, and have already been argued about; a change here
is a regression until proven otherwise.

- Sign-in, sign-up and sign-out through Better Auth, with the session cached in
  SecureStore and a cached boot that survives offline.
- The streamed BYOK tutor: 30-second first-token watchdog, four-step tool loop,
  on-device retrieval, local threads, no provider empty state.
- The multiple-choice practice session: reveal only after answering, an
  unrecognised option id treated as a non-answer, the "ask the tutor" link
  seeding a draft rather than sending.
- Progress: read positions, attempts, weak spots, accuracy — the mobile app is
  ahead of the web here, and the web's `0%` / "not tracked yet" placeholders
  are the older design.
- 52 palettes, the semantic roles, one container (`GlassPanel`), the type and
  radius scales, one gradient ASCII field behind every screen, and the cut
  between screens (`animation: "none"`) that keeps the field continuous.
- `ScreenHeader` on every screen except `+not-found`, which is a defect (§1),
  and the home greeting's README collapse.
- The system bars, the runtime window colour and the header's shared surface.

---

## Open questions — decisions, not tasks

1. **Do we sell inside the app?** In-app purchase, or reader-with-a-web-store?
   Everything in §4 waits on this.
2. **Does the app ever hold note text?** Today it holds all of MATT101. If the
   answer is "yes, forever", the leak in §5 is a permanent product decision,
   not a bug.
3. **Is "everything is free and local" acceptable until checkout exists?** If
   yes, say it in the About copy and stop calling the unlock a price. If no,
   the unlock should not write a `paid` row at all.
4. **What ships first: payments, PDFs, or tutor onboarding?** They are the
   three things standing between this and a store build, and they are not
   independent — the onboarding is the only one that makes the app useful
   without money changing hands.
