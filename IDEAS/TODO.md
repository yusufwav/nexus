# NEXUS — TODO

Everything in this file is unfinished, stubbed, or known-wrong. Check items
off as they get built. New gaps go at the bottom of their section.

Last updated: 18 October 2026.

---

# ROUND OF WORK — 18 October 2026

A UI and BYOK pass. Broken into segments so each can be done, verified and
landed on its own. Segments 1–8 are **this turn**. Segments 9 and 10 are
**deliberately not in scope this turn** — they are the two structural items and
they deserve their own plan, not a footnote.

## Status

| # | Segment | State |
| --- | --- | --- |
| 1 | Landing marquee spacing | [x] |
| 2 | Dashboard hover on every button | [x] |
| 3 | Dashboard mobile tiles 2-up + uniform type scale | [x] |
| 4 | Provider section: delete-icon centring | [x] |
| 5 | Provider section: custom routing | [x] |
| 6 | Modules page: drop the `~/` link | [x] |
| 7 | AI tutor: header nav removed | [x] |
| 8 | AI tutor: thinking-box, history pane, model search | [x] |
| 9 | User menu: add `/practice` | [x] |
| 10 | Favourited models in the picker | [x] |
| 11 | **Refined button system** — *not this turn* | [ ] |
| 12 | **Animation pass** — *not this turn* | [ ] |

### What has to be run before this works anywhere

- [x] **`packages/db/scripts/create-custom-provider-tables.mjs`** (or
      `neon-setup-8-custom-providers.sql`) adds `provider_keys.kind`,
      `.name`, `.base_url`, the two CHECK constraints, and the whole
      `provider_models` table with its RLS policy and its grant.
      **The local development database already has this applied.** Any
      other database — staging, production — does not, and saving a
      credential there returns a bare 500 until it is.

---

## Segment 1 — landing page marquee spacing

- [x] **The scrolling AI usecase tags have no gap between them.**
      `.nt-marquee__track` in `apps/web/src/styles/landing.css` is a bare flex
      row and `.nt-tag` carries padding but no margin, so adjacent pills touch
      and the track reads as one long dashed rule rather than as a list of
      use cases.
- [x] **Fixed with a trailing margin per tag, not `gap`.** The loop is
      `translateX(-50%)` over a track that contains two identical copies, and
      the shift has to land exactly on the seam. With `gap` there are `2N - 1`
      gaps on a track whose half-width is `sum(items) + (N - 0.5) * gap`, so
      the seam sits half a gap away from where the second copy begins and the
      loop visibly jumps once per revolution. A margin on every tag including
      the last gives `sum(items) + 2N * margin`, whose half is exactly the
      first pixel of the second copy. The arithmetic is the reason, not taste.
- [x] Narrowed from the default so the pills still read as a dense band and do
      not turn into a sparse, slow row.

## Segment 2 — every dashboard button gets the working hover

- [x] **`.nt-tile--soon` suppresses the hover outright.** `app.css` carries
      `.nt-tile--soon:hover { transform: none; border-color: var(--line); … }`
      and `:not-allowed`, so seven of the eight tiles on `/dashboard` are dead
      to the pointer while the eighth — "Study partner history", which has an
      `href` and renders as an `<a>` — carries the full treatment. Seven tiles
      look broken next to one that works.
- [x] Removed the suppression. Every tile now takes the same
      `translateY(--hover-lift)` / `--hover-edge` / `--hover-fill` /
      `--hover-glow` treatment as the working one, and `cursor` is a pointer
      rather than `not-allowed`.
- [x] **The tiles stay `disabled` and stay inert.** The hover is an affordance
      about the surface, not a claim that the feature exists. The "placeholders"
      badge and each tile's own `concept ·` line still say what is and is not
      built, and nothing was wired up that was not already wired up.
- [x] Audited the other dashboard controls (`nt-btn`, the tab bar, `nt-drow`,
      the feed, the settings controls, the practice module cards) for the same
      gap and closed the ones that had it.

## Segment 3 — mobile dashboard tiles, two per row

- [x] **One tile per row on a phone.** `.nt-tiles` is
      `repeat(auto-fill, minmax(260px, 1fr))`, so a 375–430px viewport gets one
      column and each card spans the full width.
- [x] Two columns below the mobile breakpoint, with the column floor reduced so
      two fit rather than one overflowing.
- [x] **Type scale reduced by 1px, uniformly, across the whole dashboard.**
      Two cards side by side is half the width for the same content, and the
      tile's own `description` and `concept` lines are what get squeezed. Done
      once, at the dashboard scope, by overriding the font-size tokens rather
      than by patching individual rules — so every dashboard page shifts
      together and a rule added tomorrow inherits the reduced scale instead of
      reverting one piece of it.
- [x] Padded down in step, and the tap target kept at or above 44px so
      two-across does not become hard to hit.

## Segment 4 — provider section, delete icon centring

- [x] **The delete button's glyph is not centred in its own box.**
      `.nt-keys__del` sets `width/height: 2rem` and `display: inline-flex` with
      centring, but the button also carries `.nt-btn`, whose `::before`
      (`content: "$ "`) is a flex item ahead of the icon — so the glyph is
      pushed right of centre. `.nt-btn--icon` already solves this with
      `::before { content: none }`; `.nt-keys__del` was simply never given the
      class, so the fix is to apply it rather than to re-derive it.
- [x] Verified the icon box, not just the button box, is centred, and that the
      glyph keeps its own hit target.

## Segment 5 — custom routing (the big one)

The reader names their own OpenAI-compatible endpoint, pulls its free models,
adds any the pull misses, and routes the tutor through it.

- [x] **The allowlist is deliberately being widened, and that is a real trade.**
      `lib/providers.ts` exists so a stored `provider` cannot point the server
      at an arbitrary host. Custom routing removes that guarantee for user
      rows. What replaces it is stated rather than assumed, below.
- [x] **`custom-provider-url.ts` — validation, server-side only.** https only;
      no credentials in the URL; no query or fragment; host must not be
      `localhost`/`.local`/`.internal` or any other suffix that cannot be
      public; **every** A and AAAA record must be a global unicast address —
      loopback, private, CGNAT, link-local, unique-local, multicast, reserved
      and unspecified are all refused, and *one* bad record fails the whole
      host rather than being averaged away; IPv6 is checked with the embedded
      IPv4 forms (`::ffff:127.0.0.1`) included, because that is the spelling
      that defeats a naive check.
- [x] **Documented honestly: DNS is checked at save time, so a rebind between
      the check and the call is still possible.** The mitigation is layered
      rather than claimed as absolute — the resolved address set is re-checked
      on the call path, redirects are refused rather than followed, and a
      custom provider can only ever carry *its own reader's* credential.
- [x] **Schema.** `provider_keys` gains `kind`, `name`, `base_url`; a new
      `provider_models` table holds the per-provider model catalogue. DDL in
      `packages/db/scripts/` (since `db:push` is still broken — see Database and
      tooling), RLS in `create-rls-policies.mjs` and both `neon-setup-*.sql`,
      grants in `create-app-role.mjs` / `neon-setup-5-app-role.sql`, and both
      audit scripts updated so the new table is actually checked.
- [x] **The provider slug for a custom row is server-generated** (`custom_<n>`),
      so the name the reader typed is display-only and never reaches a URL, a
      log, or a provider. The existing (user, provider) uniqueness index and the
      existing delete route both keep working unchanged.
- [x] **Pull free models** hits `{baseUrl}/models` with the reader's own
      credential, keeps ids ending in `:free`, and upserts. It reports what it
      kept rather than silently replacing the list, so a provider that renamed
      its free tier is visible rather than discovered.
- [x] **Add a custom model** by id, for the ones the pull cannot see — which is
      every self-hosted endpoint, and any provider whose free tier is priced at
      zero without carrying the suffix.
- [x] **Server-side re-validation before the call.** A crafted request naming a
      model that is not in that reader's catalogue is refused with a stated
      reason, exactly as a paid OpenRouter slug is. The client cannot widen the
      set.
- [x] Custom models appear in the tutor's dropdown, grouped under the
      provider's name — see Segment 10.

## Segment 6 — modules page

- [x] **Drop the `~/` link from `/modules`.** It is a second route to the
      landing page in a row that already has the `nexus_` mark doing exactly
      that, one item above it.

## Segment 7 — AI tutor header

- [x] **Delete the `~/`, `~/modules`, `~/dashboard`, `~/practice` and sparkles
      buttons.** `components/header.tsx` is shared by `/ai` and `/practice`, so
      all five come out of both. The header keeps the `nexus_` mark, the user
      menu and the theme toggle.
- [x] **The AI tutor button moves into the actions group** beside the user menu
      and the theme toggle, with the same glass-morphed container the other
      icon buttons use. It is hidden on `/ai` itself, where it would be a link
      to the page you are on.

## Segment 8 — AI tutor behaviour

- [x] **Two boxes instead of one while thinking.** `useChat` appends the
      assistant message on submit, before any text exists, and the component
      rendered a *separate* `thinking` bubble beneath the list — so the empty
      bubble was the answer's slot and the second bubble was the status. On
      success the first filled and the second vanished; on failure the first
      stayed empty forever and the error landed in the second. Fixed by
      rendering the status **in** the pending slot and rendering nothing for a
      message with no text, so there is exactly one bubble in every state.
- [x] **Sending with the history pane open collapsed the header and left the
      pane hanging.** The pane is a sibling of the header, so collapsing the
      header did not touch it. Sending now closes it outright.
- [x] **Search box in the model dropdown.** Added to `CenteredSelect` as an
      opt-in, since the feedback form shares the component and has five
      options. Filtering is on label, hint and group; the keyboard contract
      (arrows, Home/End, Enter, Escape, `aria-activedescendant`) is preserved
      over the filtered set.

## Segment 9 — user menu

- [x] **`/practice` is reachable from nowhere.** It is in `DASH_ACTIONS` only as
      a route, has no tab, and is not in the menu. Added to `UserMenu` with its
      own icon, which is the menu every surface already reaches.

## Segment 10 — favourited models

Raised during this pass, after the first list was written.

- [x] **Star a model from the picker; starred models sort to the top**, shown as
      `model · provider` so two starred entries from different providers can
      both be identified at a glance.
- [x] Stored per browser in `localStorage` next to the existing model
      preference, wrapped in try/catch like it — a preference is never worth
      breaking the chat over.
- [x] Stars survive a provider being deleted and come back when it returns.

---

# SEGMENT 11 — refined buttons (NOT this turn)

Not started, and deliberately so: a change to the site's primary control
should not ride along inside a bug-fix pass. Needs its own plan, its own
review, and eyes on every surface at once.

- [ ] **Inventory first.** Every control the product renders, listed by family:
      `.nt-btn` (+ `--ghost` / `--icon`), `.nt-tile`, `.nt-drow`, `.nt-ai__tool`,
      `.nt-ai__starter`, `.nt-ai__send`, `.nt-sel__btn`, `.nt-keyboard__*`,
      `.nt-menu__ico`, the practice option buttons, the module rows, the
      dropdown-menu items from `@Main/ui`. One list, before one line changes.
- [ ] **Decide the families.** How many buttons are there, and which of those
      are genuinely distinct controls rather than the same control at two
      sizes? "Refined" is not a spec — a scale is.
- [ ] **One implementation, not forty call sites.** The terminal aesthetic
      (`"$ "` prompt, mono face, glass shell, `--hover-grow`) is carried by a
      pseudo-element and a class today, which means every variant restates it.
      Decide whether it moves into a component with real props.
- [ ] **States.** Default, hover, focus-visible, active, disabled, loading,
      destructive. Two of those are currently done well and four are
      improvised per call site.
- [ ] **Tap targets.** 44px minimum, enforced rather than remembered. The
      icon buttons are `--nt-icon-btn` (2.25rem) and there is at least one
      2rem square delete control.
- [ ] **Reduced motion.** `--dur-hover` is 520ms and several transitions ride
      it. Honour `prefers-reduced-motion` across the whole control set, not
      only where someone remembered.
- [ ] **Light mode.** The hover tokens were hand-picked per palette
      (`audit-key-colours.mjs` covers contrast, not interaction), so no
      control has been looked at in light mode on hover.

# SEGMENT 12 — animation pass (NOT this turn)

Same reasoning as Segment 11, and it is the larger of the two: motion that is
not designed is indistinguishable from jank.

- [ ] **What already animates, and what should.** The ASCII/horizon fields, the
      caret, the scroll reveal, the marquee, the hero morph, the collapse. Set
      the rule first: what earns motion is a change of state the reader caused,
  or a change of state they need to notice.
- [ ] **Everything that currently snaps.** Page transitions, tab changes,
      menu open/close, dropdown entry, toast entry, list insert, tile hover
      (present), skeleton→content swap, error appearance.
- [ ] **Durations and easings from tokens.** `--dur-fast` / `--dur-hover` /
      `--dur-slow` exist; confirm the set is coherent, that nothing exceeds
      ~300ms for a response to a tap, and that a state change the reader caused
      is never slower than a state change they did not.
- [ ] **`prefers-reduced-motion` everywhere, not per-component.** The field
      honours it, the reveal honours it, and at least three other transitions
      do not.
- [ ] **No layout-shifting animation, and nothing that animates on load that
      delays the first read of the page.**
- [ ] **Sequencing.** Entry staggers on lists are the most likely to be done
      badly and the first thing to cut if they are.

---

### What verification actually found

Not by reading the code. Each of these looked correct, passed `tsc`, and
passed a markup assertion; each was caught by running the thing.

- [x] **The model search field rendered READ-ONLY.** `value={query}` with
      no `onChange` — React renders a controlled field with no handler as
      read-only, and says so in development. The box took focus, showed
      the right placeholder, looked perfect, and refused every keystroke.
- [x] **Two React keys collided the moment anything was starred.** A
      starred model is listed twice on purpose — once under "favourites",
      once in its provider's own section — and both rows carried the same
      `value`, which was the React key. `SelectOption.rowKey` now
      separates the two; `value` stays the identity of the CHOICE.
- [x] **Every load of /ai and /practice threw a hydration mismatch.** The
      server has no session, so it rendered the "sign in" link; the first
      client render had the session and rendered the user menu instead.
      Pre-existing, and it lived in the header this round rewrote — which
      now waits for `isPending` instead of branching around `UserMenu`'s
      own pending state.
- [x] **The custom-provider POST schema required `provider`, which a
      custom request has no value for**, because the server mints the slug.
      Every save came back "Malformed request." before any of the real
      validation ran, so the message named neither the kind nor the
      address.
- [x] **The new models route origin-checked its GET.** A GET has nothing
      to forge — `/api/keys` GET already argues that at length — and the
      sub-route was quietly the only read under `/api/keys` that a script
      or a monitor could not call. `checkOrigin` is a parameter now, so
      each method has to choose.
- [x] **Two bugs in the address validator**, both caught by
      `apps/web/scripts/test-custom-provider-url.ts` (~150 assertions):
      `new URL().hostname` keeps its brackets for IPv6, so `[::1]` slipped
      past every range check and fell through to the bare-hostname rule;
      and the range table listed three addresses in both the blocked and
      the allowed set, which is how `172.15.255.255` and `100.63.255.255`
      came to be asserted both ways at once.

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

- [ ] **`apps/web/private-assets/topics/matt101-sample.pdf` is a generated
      one-page stub** that says on its face that it is a placeholder. It is a
      valid PDF, so the gated download works end to end.
- [ ] **No real sample exists for any module.**
- [ ] **12 of 13 modules have `hasTrialPdf: false`** — only MATT101 does.
- [x] **The PDFs are no longer in `/public`, where they were served
      statically.** The sample moved to `apps/web/private-assets/`, which Next
      never serves, so the only way in is the gated route handler. Verified:
      `/api/trial` still answers 401 logged out, and the file is no longer
      reachable by URL. See `apps/web/src/lib/private-assets.ts`.
- [ ] **The PDFs were also in Git, which is a different exposure.** Being
      outside `/public` keeps them off the deployed site but says nothing
      about the repository. Both were untracked and `private-assets/` ignored,
      but they remain in history at `60c4a25` — harmless while the repo is
      private, not so if it ever goes public. Move them to blob storage when
      real content exists.

## Topic PDFs — users must pay before they get any of them

The module page breaks a module's notes into per-topic PDFs
(`apps/web/src/content/module-topics.ts`) and lists them under the free
sample preview. A student downloads the one topic they are stuck on rather
than the whole module.

**Nothing here is finished. The gate is built; the content is not.**

- [ ] **One topic PDF now exists; 78 of 79 do not.** `MODULE_TOPICS` declares
      13 modules and 79 topics. `mapv112-bisection-method` has a real file
      (`private-assets/topics/Bisection_Method.pdf`, 3.1 MB); the other 78 carry
      `pdf: null` and render "coming soon". Adding a topic is one entry in
      `module-topics.ts` plus the file beside it.
- [ ] **`matt101-limits` has a `pdf` path pointing at a file that is not
      there.** The entry says `/topics/matt101-limits.pdf`, but the only MATT101
      file on disk is the unrelated trial stub `matt101-sample.pdf`. Anyone
      trusting the registry today gets a 404 on that row.
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
- [x] **`gemini-2.5-flash` has been retired by Google for new keys.** Moved to
      `gemini-3.8-flash` at `apps/web/src/app/api/ai/route.ts`. Verified against
      a live model: the route streams SSE, renders display math through KaTeX,
      and persists the question and the reply as separate rows.
- [x] **Reopening a thread raced the chat instance.** `loadThread` called
      `setThreadId` then `setMessages`, and `useChat` is keyed by `id` — so the
      captured `setMessages` belonged to the *outgoing* chat and the restored
      transcript never appeared, which is why opening a stored chat needed two
      clicks. The `setTimeout(0)` that briefly sat between them could never
      have worked: a closure does not rebind itself. Replaced by handing the
      rows to `useChat` as `messages`, which seeds a chat at construction and
      constructs exactly once per distinct `id`. Verified: one click restores a
      stored thread, and switching threads loads the one that was clicked.
- [ ] **`chat_threads` / `chat_messages` were created by hand** with
      `packages/db/scripts/create-chat-tables.mjs`, not by `db:push`, which is
      still broken — see Database and tooling.

## AI tutor — retrieval over purchased notes

The tutor answers from the reader's own notes, and only from notes they are
entitled to. Nothing here exists yet beyond this description.

**The invariant everything else serves: no code path can return an
unpaid-for chunk to the model.** Not "the filter is applied" — it cannot be
bypassed.

- [ ] **`note_topics` / `note_chunks` schema.** `module_code` denormalised onto
      chunks so the ownership filter is an indexed `WHERE module_code = ANY(...)`
      rather than a join per row. `source_path` is server-side only and is never
      selected into anything the model or client sees.
- [ ] **`ownedModuleCodes()` — the ownership boundary.** One join over
      `purchases` where `status = 'paid'`. Derived per request, never
      denormalised, never cached across users. The user id comes from
      `getSession()` and nowhere else.
- [ ] **Free tier while payments do not exist.** `purchases` is empty, so
      gating on it alone makes the tutor answer nothing. Until checkout lands,
      a module with `hasTrialPdf` is readable by any signed-in user and
      everything else needs a `paid` row. This is also the red-team fixture:
      MATT101 is the free tier, MAPV112 (bisection) is the paid one.
- [ ] **Retrieval tool, defined inside the route handler.** `ownedCodes` is
      captured in its closure, so the model has no argument it could pass to
      widen the set. One narrow tool — never filesystem or vector-store access.
- [ ] **Filter inside the SQL, not after it.** Fetching top-k and filtering in
      JS leaks existence through result counts and latency, and starves results
      when the top-k are all unpaid-for.
- [ ] **Ingestion, offline and idempotent.** A script, never a route —
      embedding per request costs money and adds latency for content that does
      not change. Re-running after an edit must update, not duplicate.
- [ ] **Two tests that outlive the refactor.** (1) Retrieval for an unpaid-for
      module returns zero rows, even queried directly by slug. (2) A tool call
      carrying a module the reader does not own is ignored.
- [ ] **Routing is scoped to owned modules before ranking.** Otherwise the
      citation UI names a module the reader has never bought, which leaks both
      its existence and its subject matter.
- [ ] **Citations in the UI via `messageMetadata`,** built from an allowlist of
      fields — `moduleCode`, `moduleName`, topic `title`. Never spread a chunk
      row. Display names only; no filenames, no directories.
- [ ] **Retrieved text is untrusted input.** It is content arriving through our
      own store. Delimit it, tell the model it is reference and never
      instruction, and let the tool closure carry the hard boundary so a
      manipulated tool call still cannot reach unpaid-for content.
- [ ] **Red team the whole thing before real content exists.** The two PDFs on
      disk are dummies precisely so the paid and unpaid experiences can be
      attacked now, rather than after a student has paid.

### The derived text layer

- [ ] **Notes need a retrieval representation that is not the PDF.** Raw PDFs
      carry running headers, page numbers, hyphenation artifacts, broken reading
      order and mangled LaTeX — all of which poison embeddings and waste
      context. Keep the PDF for display; generate normalised Markdown as the
      retrieval artifact.
- [ ] **Extract to Markdown, ideally through a model pass** that preserves the
      mathematics. Equations are the whole reason these notes exist and cannot
      be allowed through a generic text extractor.
- [ ] **Chunk on heading boundaries, never fixed size.** 81 topics are already
      declared in `module-topics.ts`, each one a coherent subject and therefore
      the natural chunk boundary. Splitting mid-section returns half an
      argument.
- [ ] **Both sides embedded with the right task type.** `@ai-sdk/google`
      exposes `RETRIEVAL_DOCUMENT` for notes and `RETRIEVAL_QUERY` for the
      question. Embedding both the same way is a free, measurable quality loss.
- [ ] **No new provider or API key for embeddings.** `@ai-sdk/google`, already
      a dependency, exports `google.embedding('gemini-embedding-001')`. Vector
      column is 768 dimensions for that model — confirm before writing it,
      since changing it later means re-embedding everything.

### Routing model — evaluate, do not adopt yet

- [ ] **Start with embedding similarity, not a classifier.** 81 topic titles and
      descriptions already exist; one `RETRIEVAL_QUERY` embedding ranked against
      pre-embedded topic descriptors is deterministic, needs no new dependency,
      and is one round trip.
- [ ] **JEV (TypeSafe AI) — evaluate as the refusal gate, not the router.**
      A "System One" decision model: typed choice/score/noul outputs, no prose,
      calibrated confidence, ~70–500ms. Module routing is a closed-vocabulary
      choice, which is exactly its stated strength, and the case for a
      discriminative model over an LLM is sound. But adopt it only if the
      embeddings misroute in practice — measure first. The place it would earn
      its keep is *"is this answerable from this reader's notes at all?"*, where
      a calibrated probability gives a threshold for saying "I don't have that"
      instead of guessing. Note the latency argument is weak either way: 500ms
      is noise against responses already measured at 18s–2min. Argue it on cost
      and calibration.
- [ ] **Do not trust its calibration blindly.** It degrades under distribution
      shift — new modules, differently-worded questions. Validate the threshold
      against real queries before relying on it.
- [ ] **`pgvector` must exist on the hosted database, not just local.** Installed
      locally (0.8.2, from `pg_available_extensions`). Check the host supports it
      before committing to this design — `CREATE EXTENSION vector` failing with
      a permission error is the test. Fallback if it does not: store embeddings as
      `float8[]` and rank in SQL with a cosine expression, which is slower but
      needs nothing.

## Model providers — bring-your-own-key

- [x] **One provider is hardcoded.** `resolveTutorModel()` picks per request from a
      validated allowlist in `apps/web/src/lib/providers.ts`. The provider slug
      arrives from the database but is validated against a literal list in source
      before it is allowed to select a base URL, so a stored row cannot point the
      server at an arbitrary host. Reached from `/api/ai/route.ts`; the chosen model
      is echoed back in `messageMetadata` so a reader can see whose key paid.
- [x] **A user's key must never reach the server's own env.** Sealed with
      AES-256-GCM under a dedicated `PROVIDER_KEYS_SECRET` — deliberately not
      derived from `BETTER_AUTH_SECRET`, since rotating that is a normal act and
      would otherwise silently break every stored key. Every query filters on the
      `user_id` from `getSession()`; there is no `userId` field in the POST schema.
      `listProviderKeys` selects no credential column at all. Verified: the
      plaintext is absent from the DB row, from the GET response, from the stream,
      and from the server log.
- [ ] **Usage must be attributed per key**, so one reader's traffic cannot spend
      another's quota — and so a free tier cannot be trivially bypassed. The
      resolution order today is the reader's key, then the server's, which means a
      reader with no key spends the server's quota. The allowlist also admits only
      `:free` OpenRouter tiers, which limits the damage but is not attribution.
- [x] **A rejected key must not fall back silently.** A 401 from the reader's
      provider now says so and names the credential they can actually fix, instead
      of naming `GOOGLE_GENERATIVE_AI_API_KEY`. Status is read off the error rather
      than the message, because OpenRouter rejects a bad key with `"User not
      found."` and nothing that mentions auth.
- [x] **The reader can pick the model, from inside the chat.** A header control
      sends an explicit provider + model per turn (`model-picker.tsx`). The server
      re-validates against its own free catalogue, so the pick is a hint and cannot
      widen what gets called — a paid slug is refused before any request is made,
      which is what stops a mistake here charging the reader's card.
- [x] **A retired model must not present as a busy provider.** This actually
      shipped as a bug: the hardcoded allowlist named `llama-3.3-70b-instruct:free`,
      OpenRouter retired it, and the 404 "This model is unavailable for free" was
      matched by the *busy* branch because the sentence contains "unavailable" — so
      a model that could never work again was reported as a temporary outage. 404
      and the no-such-model wording are now checked **first**, because "try again"
      is only honest when trying again can help.
- [x] **Do not hardcode a free tier.** The `:free` slug list is fetched from
      OpenRouter's public catalogue and filtered to priced-at-exactly-zero plus
      declared tool support, cached 6h, with a snapshot fallback. The default is
      `openrouter/free` — a router rather than a hosted model, so there is no
      specific slug for someone else to retire. Verified by
      `apps/web/scripts/check-free-models.mjs`, which also asserts the five
      originally-shipped ids are genuinely gone.
- [ ] **A picker defaults to the reader's own key, not the server.** Done, and
      worth a regression test: because the client now sends an explicit choice on
      every request, defaulting to "server" would have silently retired BYOK for
      anyone with a working key saved.
- [ ] **OpenRouter, OpenCode Zen and others** are all just entries in the same
      allowlist. `PROVIDERS` is the single list; a new one is an entry plus a
      branch in `buildProviderModel`. The in-app walkthrough video and the "get
      more access" upsell are content tasks once the plumbing above exists.

## AI tutor — reliability

Not retrieval; the turn itself.

- [x] **`devToolsMiddleware()` threw on every production request.** It guards
      against shipping a tracing layer and throws when `NODE_ENV=production`,
      and it was being called inside the POST handler — so every chat request
      in a deployed build died with a 500. Now guarded so the factory is never
      *called* (a filter applied afterwards would still have thrown), and built
      once at module scope rather than per request, where it was re-registering
      process signal handlers and minting a disconnected run each time.
- [x] **`maxDuration` was 30s**, below the time real worked answers take. Raised
      to 60, which is Vercel's Hobby ceiling; a higher number there is silently
      ignored.
- [x] **A turn that never ended left the UI stuck.** The composer stayed disabled
      behind "thinking" with no way out — no error, no explanation. Easy to hit,
      because the AI SDK retries with exponential backoff for minutes on a
      rate-limited key. A 30s client watchdog now aborts and explains.
- [x] **Failures said "The tutor could not answer that. Try again."** for
      everything, which was actively misleading: an exhausted quota is not
      something retrying fixes. Provider failures are now mapped server-side in
      `toUIMessageStream({ onError })` — the only place the real cause still
      exists, since the SDK masks it to `"An error occurred."` before it crosses
      the wire. Upstream text is never passed through; it embeds request URLs
      and project ids.

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

- [ ] **`/practice` is not in the proxy's `PREFIXES`.** `apps/web/src/proxy.ts`
      lists `/dashboard` and `/ai` and the file argues that matching by
      prefix is the whole point — "a new route under /dashboard or /ai is
      covered the moment it exists, without anyone remembering to opt in".
      `/practice` moved into the `(app)` group after that list was written
      and never went into it. The page still calls `requireSession()` so it
      is not open; the belt is simply missing a pair of braces, which is
      exactly the failure the proxy exists to prevent. One line, not done
      here because nothing in this round touched the proxy and an
      unrequested change to an auth boundary should be its own commit.
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
- [ ] **`neon-setup-5-app-role.sql` is behind `create-app-role.mjs`.** The
      two privilege matrices are supposed to agree, and `check-grants.mjs`
      only compares the script against its own list — so the SQL file can
      drift from both without anything noticing. It already has: it never
      gained the grants for `read_usage` or for `practice_questions` /
      `practice_attempts`, so a database built by running the Neon parts in
      order has no privilege on any of them. `provider_models` was added to
      both because this round touched them; the other three were not, since
      nothing here exercised them. Worth a line each, and a check that
      reads the SQL rather than only the JS.
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

- [x] **Light mode exists.** `tokens.css` carries a full `.light .nt-root`
      palette (warm paper background, dark ink, a brown `--accent-b` rather
      than the cream one dark uses) and the header toggle switches it. The
      entry that said "dark only" was stale — `providers.tsx` still sets
      `defaultTheme="dark"`, but that is only the starting value.
- [ ] **The light palette was written for contrast, not audited.** Every value
      is a hand-picked counterpart to the dark one. Focus rings, the glass
      panels and the ASCII field's colour ramp were tuned against black and
      have had no contrast pass in light mode.

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