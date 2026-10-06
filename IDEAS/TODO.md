# NEXUS — TODO

Everything in this file is unfinished, stubbed, or known-wrong. Check items
off as they get built. New gaps go at the bottom of their section.

Last updated: 6 October 2026.

---

## Payments — not started

- [ ] **The buy button is inert.** `apps/web/src/lib/payments.ts` returns
      `{ redirectUrl: null, stubbed: true }` and the UI renders the button
      disabled with `aria-disabled`. Nothing charges anyone.
- [ ] **Pick a provider: Paystack or Yoco.** Both are viable in South Africa;
      Yoco is the cheaper of the two to start with.
- [ ] **Implement `startCheckout()`** in `payments.ts`. It should create a
      `purchases` row with `status: "pending"`, call the provider's
      initialise/transaction endpoint, and return the redirect URL.
- [ ] **Webhook endpoint.** The provider calls back on success or failure;
      the handler flips the row to `paid` or leaves it `pending`, and must
      verify the provider's signature rather than trusting the payload.
- [ ] **`purchases.providerRef` is never written.** It exists for webhook
      reconciliation and is currently always null.
- [ ] **Bundle checkout.** `BUNDLES.full` is priced at R250 in
      `packages/db/src/module-catalog.ts`, but nothing can buy it.
- [ ] **Refunds.** `purchaseStatus` includes `refunded`, but nothing sets it.
      Revoking module access on refund is untested because there are no real
      purchases to test against.

## The improvement form — no backend

- [ ] **"Tell me what to fix" sends nothing.** `improvement-form.tsx`
      validates and shows a confirmation, but that confirmation is local
      component state, not a server response. It appears on `/modules` and on
      `/dashboard/support`.
- [ ] **No destination address.** Nothing in the app says where feedback
      should go, and no mail provider is configured.
- [ ] **No provider.** Needs Resend or plain SMTP, plus a server action or
      route to POST to. There is currently no endpoint that accepts a form.

## Trial PDFs — placeholder only

- [ ] **`apps/web/public/sample-matt101.pdf` is a generated one-page stub**
      that says on its face that it is a placeholder. It is a valid PDF, so
      the gated download works end to end.
- [ ] **No real sample exists for any module.**
- [ ] **12 of 13 modules have `hasTrialPdf: false`** — only MATT101 does.
- [ ] **The PDF sits in `/public`, so it is also served statically.** The auth
      gate is on `/api/trial`, not on the file itself. Once real notes exist,
      move them to private storage — see `apps/web/src/app/api/trial/route.ts`.

## Topic PDFs — users must pay before they get any of them

The module page breaks a module's notes into per-topic PDFs
(`apps/web/src/content/module-topics.ts`) and lists them under the free
sample preview. A student downloads the one topic they are stuck on rather
than the whole module.

**Nothing here is finished. The gate is built; the content is not.**

- [ ] **No topic PDF exists.** All 78 topics across the 13 modules have
      `pdf: null`, so every row renders "coming soon". Adding a topic is one
      entry in `module-topics.ts` plus the file at `public/topics/`.
- [ ] **Every topic is behind a purchase that cannot happen yet.** Checkout
      does not exist (see Payments above), so no one can own a module, so
      `getOwnedCodes()` returns empty for every user and every topic is
      unreachable. The 403 path is the only one a real user can hit today.
- [ ] **Access is per-module, not per-topic, by design.** Paying for MATT101
      unlocks all six of its topics; there is no way to buy a single topic.
      If per-topic pricing is ever wanted, the check in
      `app/api/topics/[slug]/route.ts` is the seam — it currently tests
      `owned.has(moduleCode)` and nothing finer-grained exists.
- [ ] **Nothing stops a paid user downloading every topic.** Each request is
      gated independently, so a user who paid R50 can script six GETs and
      have the whole module. That matches what they paid for, but it means
      per-topic watermarking or signed per-request URLs would be needed
      before a topic could be sold on its own.
- [ ] **Topic PDFs will sit in `/public` and be fetchable directly.**
      `/api/topics/<slug>` is the intended way in and the only gated one, but
      `/topics/<file>.pdf` is served statically to anyone who guesses the
      name. This is the same gap as the sample above, and the same fix:
      private storage once real notes exist.
- [ ] **The slugs are provisional.** Every one of the 78 was invented to show
      the structure — `matt101-limits`, `stas102-ttest`, and so on. They appear
      in download URLs, so renaming one after release orphans whatever links
      point at it.
- [ ] **Slugs must stay unique across ALL modules, not just within one.**
      `app/api/topics/[slug]/route.ts` resolves a slug by scanning the whole
      registry, so two modules claiming the same slug would make the download
      URL ambiguous and whichever came second would win. Every slug is
      therefore prefixed with its module code. `node scripts/check-topics.mjs`
      from `apps/web` asserts this and fails the build if it is ever broken.
- [ ] **Page counts in `module-topics.ts` are invented** and will not match
      the real files.

## Module content — 1 of 13 written

- [ ] **Only MATT101 has content.** `apps/web/src/content/module-content.ts`
      has one entry. The other 12 codes render the coming-soon state.
- [ ] **12 modules marked `coming-soon`** in `packages/db/src/module-catalog.ts`:
      MATT102, MAPV101, MAPV102, MAPV111, MAPV112, WRAV101, WRAV102, WRSC111,
      WRFV101, WRFV102, STAS101, STAS102.
- [ ] **Lesson content is not editable in-app** — it is a TypeScript file, so
      fixing a typo is a deploy.
- [ ] **Progress tracking is faked.** Every section shows `not started`
      because there is no read-position table.

## Avatars — initials only

- [ ] **`user.image` is never written.** The column exists
      (`packages/db/src/schema/auth.ts:9`) and `Avatar` renders an `<img>` when
      given one, but every account falls back to initials.
- [ ] **No upload route, no object storage, no resize.** The "upload" control
      on `/dashboard/settings` is a placeholder.

## Dashboard features — concepts only

Nothing below is implemented. Every tile renders disabled with its concept line
visible.

- [ ] Continue reading (per-lesson position)
- [ ] Practice problems (question bank, marked answers)
- [x] Study partner history (chat threads that survive a reload). Built in
      `packages/db/src/schema/chat.ts`, `/api/chat` and the save effect in
      `ai-tutor.tsx`. Verified: a question survives navigate-away-and-back even
      when the tutor fails to answer it. Open items are under AI tutor below.
- [ ] Weak spots (rank sections by wrong answers)
- [ ] Spaced revision (cards on a forgetting curve)
- [ ] Notes in your own words (summary compared to source)
- [ ] Annotations (private margin notes per lesson)
- [ ] Offline copies (per-user signed download)
- [ ] Download / re-download per module
- [ ] Library management tools

## AI tutor — chat history

- [x] **History is saved, and no longer waits on the turn.** The save effect
      was gated on `status === "ready"`, so a turn that errored wrote nothing
      and the whole conversation was lost. The newest message is now written as
      soon as it is complete — the question on the render it lands, the reply
      once no stream is running — keyed on `${threadId}:${last.id}` and sent one
      row at a time so a replay is a no-op rather than a full re-send.
- [x] **The truncated-answer guard is kept**, as the `isSending` early return:
      mid-stream the last message is a partial bubble, so nothing is written
      until the stream settles. An interrupted turn keeps its question.
- [x] **The `savedRef` reset effect is deleted rather than reordered.** It
      reset the guard a render *after* the save it protected, because effects
      run in declaration order. It was also unnecessary: the key carries the
      thread id, so switching threads changes the key by itself.
- [x] **Message ids are read back off the chat, never predicted.** An earlier
      attempt predicted the `<timestamp><random>` shape the SDK's ids read
      like and guessed wrong on every send, which wrote each question twice.
      `sendMessage` also ignores an `id` you pass it, so there is nothing to
      predict from. Both were found by watching the network, not by reading.
- [ ] **`gemini-2.5-flash` has been retired by Google for new keys.** Every
      turn fails with `AI_APICallError: This model ... is no longer available
      to new users`, so the tutor answers nothing at all on this project, and
      the error path is the only path this has ever exercised — the success
      path (question stored, then the reply stored alongside it) is unverified
      against a live model. Google names `gemini-3.8-flash` as the
      replacement; changing the literal at `apps/web/src/app/api/ai/route.ts:66`
      is the whole fix. It was left alone here rather than changed silently.
- [ ] **Reopening a thread has a timing hazard worth knowing about.**
      `loadThread` calls `setThreadId` then `setMessages`, and `useChat` is
      keyed by `id` — so the `setMessages` captured by that callback belongs to
      the *outgoing* chat until React commits the rekey. There is now a
      `setTimeout(0)` between them. It works and it is fragile: it relies on a
      macrotask being long enough for the commit. The durable fix is to own the
      `Chat` instance (`useChat({ chat })`), so there is one instance and no
      rekey to race.
- [ ] **`chat_threads` / `chat_messages` were created by hand** with
      `packages/db/scripts/create-chat-tables.mjs`, not by `db:push`, which is
      still broken — see Database and tooling.

## Dashboard Settings — every option is a placeholder

- [ ] **Display name** looks editable, only changes until reload.
- [ ] **Email** looks editable, only changes until reload.
- [ ] **Profile picture upload** — dead control.
- [ ] **Delete account** — dead control.
- [ ] **Change password** — not implemented, no form.
- [ ] **Social auth connections** — not implemented.
- [ ] **Two-factor auth** — not implemented.
- [ ] **Active sessions / sign out everywhere** — not implemented.
- [ ] **All notification toggles** — local state only, no preferences table.
- [ ] **Notification email address** — no store behind it.
- [ ] **Payment methods** — no provider, nothing to store.
- [ ] **Billing details / VAT receipts** — not implemented.
- [ ] **Refund request** — not implemented.
- [ ] **Export your data** — not implemented.
- [ ] **Light theme** — dark only, see below.

## Auth gaps

- [ ] **Social auth is not implemented.** The Google and GitHub buttons on
      `/login` are `disabled` placeholders. Adding it means a Better Auth
      social plugin plus OAuth credentials.
- [ ] **Password reset** — not implemented. The "forgot?" hint on the sign-in
      tab is decoration.
- [ ] **Email verification** — `user.emailVerified` is read on the settings
      page and never checked.
- [ ] **Sign-in does not validate on blur.** Errors appear on submit only,
      which is a deliberate choice, not an oversight.

## Database and tooling

- [ ] **`pnpm db:generate` and `pnpm db:push` do not run on this machine.**
      `drizzle-kit` crashes with `Assertion failed: !(handle->flags &
      UV_HANDLE_CLOSING)` in `src/win/async.c` — it fails identically on a
      clean checkout with no schema changes, so it is an environment problem,
      not a schema problem. The tables are written and typecheck; they have
      not been pushed to a database.
- [ ] **`next build` fails the same way**, on the same libuv assertion.
      `next dev` is unaffected. Nothing in this app has been verified through
      a production build.
- [ ] **`pnpm db:seed` is untested** for the same reason — it has never
      reached a live database. Until it runs, `packages/db/src/module-catalog.ts`
      edits do NOT show up in the app: `lib/modules.ts` only falls back to the
      bundled catalogue when the `modules` table is **empty**, so a table
      holding one stale row silently wins over the file. The 13 module rows
      currently in the database were written by hand to work around this. Run
      the seed once it is unblocked and the two agree again.
- [ ] **Catalogue changes need two edits, not one.** `apps/web/src/app/page.tsx`
      keeps a second hardcoded copy of the 13 modules as a plain array (`MODULES`,
      ~line 66) so the landing page renders with no database. `module-catalog.ts`
      and that array are kept in step by hand. See `apps/web/MODULES-GUIDE.md`.
- [ ] **The `modules` fallback is silent.** If Postgres is unreachable,
      `apps/web/src/lib/modules.ts` falls back to the bundled catalogue
      without saying so. Log it once in development.
- [ ] **Add `import "server-only"` to `lib/session.ts` and `lib/modules.ts`.**
      Both import the database driver. `initialsOf` used to live in
      `session.ts`, and importing it from the client-side `Avatar` pulled
      `pg` into the browser bundle — which failed at runtime with "Can't
      resolve 'dns'". It now lives in `lib/initials.ts`. The `server-only`
      package is not installed; adding it would turn that class of mistake
      into a build error instead of a runtime one.

## React Compiler

- [ ] **`reactCompiler: false`** in `apps/web/next.config.ts`. Its Babel worker
      pool fails to spawn on this machine, exiting `0xc0000142`
      (STATUS_DLL_INIT_FAILED) and taking down every route's compilation.
      Investigate whether a newer Babel/React can be made to work; output is
      correct without it, just without automatic memoization.

## Secrets

- [ ] **`BETTER_AUTH_SECRET` is a placeholder.** `apps/web/.env` currently holds
      the literal string `change-me-to-32-plus-random-characters`. It passes the
      schema's 32-character minimum and is fine for local development, but it is
      public and predictable. Generate a real one before any deploy:
      `openssl rand -base64 32`. Rotating it invalidates existing sessions, so
      do it once, deliberately. Note `apps/web/.env` is gitignored, so it is not
      restored with the repo — it must be recreated by hand after a clone or a
      wipe. Only `.env.schema` is committed.

## Copy and content inconsistencies

- [ ] **The landing page's pricing says "all 7 modules, one semester" while
      the catalogue lists 13.** `apps/web/src/app/page.tsx` prices a bundle of
      7 at R250; the catalogue has 13 modules at R50 each, which is R650
      unbundled. `BUNDLES.full` in `packages/db/src/module-catalog.ts` is
      priced against 13 (R250 against a R650 "was"), which does not match the
      landing copy. Pick one: change the copy to 13, or price the bundle as 7.
- [ ] **The landing page's module list says every module is "available".**
      The catalogue marks 12 of 13 `coming-soon`. The landing page does not
      read the database, so the two cannot currently disagree visually — but
      it should once the homepage is wired to the catalogue.
- [ ] **The landing page's `MODULES` array and `CATALOG` are duplicated.**
      Both are the source of truth for their own surface and must be edited
      together. Only MATT101 is actually written.
- [ ] **The landing page claims 13 modules "for every semester I've done"**
      while the catalogue marks 12 as unwritten.
- [ ] **Reviewer placeholders** — every review on the landing page is
      "Placeholder Student" with invented quotes. These must not ship.
- [ ] **The auth page claims "1 ready today"** and the pricing table claims a
      R250 bundle. Neither is purchasable yet.

## Light mode

- [ ] **Dark only.** `providers.tsx` pins `defaultTheme="dark"` with
      `enableSystem={false}`. The palette was designed against black and has
      no light counterpart — `--bg-0: #000000`, glass tuned for a dark
      backdrop, and the ASCII field's colour ramp assumes darkness. A light
      theme needs its own token values, not an inversion.

## Audit

- [ ] **No Lighthouse pass.** Every page is new.
- [ ] **No accessibility audit.** Focus-visible states, roles, and the
      reduced-motion path were written by hand but never checked with a
      screen reader or an automated tool.
- [ ] **No responsive audit.** The breakpoints in `styles/app.css` are
      guessed, not tested. The dashboard's 4/5 glass console is the most
      likely to break on a short viewport.
- [ ] **No test suite.** Nothing in this app is covered by tests.

---

## Known-good

Things that work and should not be disturbed:

- The landing page at `/` is a finished design. Treat `styles/landing.css` and
  `components/landing/*` as the source of truth. Verified rendering with its
  13 module rows now linking to their detail pages.
- `/modules` and `/modules/[code]` render with the database down, by falling
  back to the bundled catalogue. Verified: 13 rows, 13 prices, signed-out
  visitors see sign-in prompts instead of the actions.
- `/modules/MATT101` renders all 6 lessons with worked examples; every other
  code renders the coming-soon state rather than a 404.
- `/login` works: real sign-up and sign-in through Better Auth, with
  `?next=` preserved across the round trip.
- The dashboard's auth gate works: all five routes redirect to
  `/login?next=<path>`.
- `/api/trial` correctly returns 401 when logged out.
- The ASCII engine respects `prefers-reduced-motion`.
- The landing nav shows `<UserMenu>` — identity block, the five account links,
  and sign out — for signed-in visitors, and exactly one `sign in` link when
  logged out. Sign-out works from both there and the dashboard's identity strip
  (`useSignOut` is shared; neither nests a button inside another).