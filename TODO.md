# Protecting the notes

Goal: **stop one paying reader bulk-downloading the notes and distributing them.**

Not the goal: stopping screenshots. That is a different, unwinnable problem and
nothing here pretends otherwise. Once content is on a screen the reader can
capture it. This file is about the *bulk* path — the one request that hands over
everything, and the automated loop that asks for it eighty times.

---

## Where things actually stand

Grounded by reading the code, not assumed. Each line is verifiable by opening
the file named.

| Surface | Gate today | Rate limited? |
| --- | --- | --- |
| `GET /api/topics/[slug]` (PDF) | session, then paid purchase | **no** |
| AI tutor over `searchNoteChunks` | session, paid modules, AI budget | yes — 20 turns/60s |
| Note text on a page | **does not exist yet** | n/a |

The PDF route is already built properly. `apps/web/src/app/api/topics/[slug]/route.ts`
checks the session *before* resolving the slug (so an anonymous caller cannot
enumerate the catalogue by watching 401 vs 404), then requires a `status = 'paid'`
purchase for the parent module, reads from `private-assets/` rather than `/public`,
and serves `no-store` + `attachment`. That ordering was a real bug once and is
deliberate.

What it does not have is any limit on *how many times* one paying reader may call
it in a minute. That is the entire remaining hole on this surface, and it is one
loop:

```
for slug in MODULE_TOPICS:  # 81 declared
    GET /api/topics/<slug>  with the reader's own cookie
```

### The good news, and why the order of this plan matters

**There is currently nothing to steal.** `apps/web/private-assets/` does not
exist (it is gitignored), so both PDF registry entries resolve to
`"That PDF has not been written yet."` — 79 topics across 13 modules, of which
77 carry `pdf: null` and the two real entries point at files not on disk.
Production holds 2 note topics and 12 chunks.

(79, not the 81 a `grep 'slug:'` suggests — two of those are examples inside a
doc comment. The count in this file came from a parse with comments stripped.)

So the controls below are being built **before** the content exists, which is the
cheapest possible time to add them. The first person to drop a PDF into
`private-assets/` is the moment this becomes a live loss instead of a fix.

### Why the notes text surface is the bigger risk later

`packages/db/src/queries.ts` `listAccessibleTopics` returns **metadata only** —
title, description, chunk count — never chunk content. The chunk text reaches a
reader through exactly one path today: the tutor, which summarises rather than
dumps and is bounded by the AI budget.

That is a good shape. It should stay that way. **Section 3 exists to make sure
that if a note-reading page is ever built, it inherits a watermark from day one
rather than getting one bolted on afterwards.**

---

## What this will not do

Stated up front so nobody measures success against the wrong thing.

- **It does not stop screenshots.** No browser API refuses a capture. WhatsApp
  can, because it is a native app with OS-level support.
- **It does not stop transcription.** A reader with eighty pages in front of
  them can retype. Everything here makes *automated bulk* hard and *leaks*
  attributable; it does not make copying impossible.
- **It does not un-leak.** No action here recovers a copy that left. That is why
  attribution matters more than prevention: without a watermark there is no
  evidence and no action is possible at all.
- **It does not make enforcement worthwhile.** At R50 a module nobody sues. The
  watermark is for the deterrent and the record, not for litigation.

---

## Sections

Ordered by value-per-hour. Each is pinned by assertions that are proven to fail
when the behaviour is reverted, following the existing convention in
`apps/web/scripts/`.

### 1. Baseline — measure the bulk path before limiting it

Everything here chooses numbers. A limit picked because it "felt about right"
is the same class of decision as the broken input-well threshold that broke
fourteen themes. So measure first:

- Enumerate the real request sequence a full-corpus pull makes, and its count.
- Establish what honest reading looks like (topics per minute, human pace) so
  the ceiling has a provenance and not just a value.
- Find the `/api/trial` preview path and confirm it cannot be walked to pull
  content it should not.
- Confirm there is no route that returns chunk text in bulk.

**Done when:** the numbers in Section 2 are traceable to a measurement, and the
gap analysis is written down here.

#### Findings

**The loop is 79 requests.** One `GET /api/topics/<slug>` per topic, same
session cookie, same purchase. Nothing in the route resists repetition. Today it
returns 404 for all of them, which is the only thing protecting the corpus.

**The honest burst is 7.** Topics per module: `MAPV112` 7, everything else 6,
13 modules, 79 total. A reader works one module at a time, so the largest burst
they can legitimately make is opening all 7 topics of that module in one sitting
— each a deliberate click on a list item followed by a full file transfer.

**That gives an 11x gap** (79 ÷ 7). Any per-minute ceiling above 7 and well
below 79 separates the two with room to spare, and does *not* depend on guessing
how fast a person reads — which is not measurable here, since production has
exactly one account. That gap is the provenance Section 2's numbers come from.

**`/api/trial` is not a second door.** It serves one fixed constant path with no
slug or path parameter — only `?download=1` toggles the filename — so it cannot
be walked. It is session-gated, `no-store`, and deliberately omits
`content-disposition` on the preview so the iframe does not turn into a download.

**The tutor is the only path to note text, and it is contained.**
`searchNoteChunks` does return `content` — but `source_path` is never selected,
and the single caller is `searchOwnNotes` in `apps/web/src/lib/notes-retrieval.ts`,
which resolves entitlements *inside* the function so no caller, including a
model building a tool call, can widen the set. 6 chunks per turn, 20 turns/60s.

Measured, from the local database:

| | |
| --- | --- |
| chunks seeded | 12 across 2 topics |
| chunk length | avg 287 chars (min 118, max 598) |
| one turn can surface | ~1,722 chars ≈ 431 tokens |
| sustained at the AI budget | ~34k chars/min ≈ 516k tokens/hour |

That bounds the tutor as a *worm*, not the corpus — and it is a slow one, since
each turn is a real model call the reader is paying for.

**No route returns note text in bulk.** `listAccessibleTopics` selects metadata
only. `/api/chat` and `/api/keys` both scope on `getSession()` and take no
userId from the request. The content path is: PDF (gated, unlimited) and tutor
(gated, limited).

### 2. Read budget on the content path — **done**

A DB-backed limiter on the content route, copying `packages/db/src/ai-rate-limit.ts`
rather than inventing a second shape:

- `packages/db/src/read-budget.ts`, plus `scripts/neon-setup-6-read-budget.sql`
- Free allowance **20/min**, delay **250ms per request over it**, capped at **6s**
- 26 assertions in `apps/web/scripts/test-read-budget.mjs` (arithmetic, placement,
  and the shape of the counter) and 12 in `packages/db/scripts/test-read-budget.ts`
  against a real database (increment, window reset, concurrency, agreement between
  the pure curve and the persisted one)

**A full 79-topic pull now costs ~285s of added delay; an honest reader's 7-topic
module burst costs exactly 0ms.** Both numbers are asserted, not asserted-about.

#### Two bugs this found

**1. A primary-key collision under concurrency, in the new code and in shipped code.**
`read_usage` has a PRIMARY KEY (`id`) and a UNIQUE (`user_id`), and the upsert names
only `user_id` as its arbiter. Two requests arriving before any row exists both
attempt an INSERT, and the loser collides on the *primary key* — a constraint the
clause does not cover — raising `23505`. The fix is to let the database generate `id`.

**`ai_usage` has the identical shape and the identical fault.** `consumeAiBudget`
inserted `ai:${userId}` as the primary key while arbiting on `user_id`. Measured at
roughly **1 in 120 concurrent calls**, which on `/api/ai` is an unhandled `23505` —
a 500 on the tutor, and not the documented behaviour, which is to fail *open* for
the reader's key and refuse only the server's. It had never fired because nothing
had ever hit a brand-new account with two tutor turns at the same instant.

Both are fixed, and `scripts/test-ai-budget.mjs` now pins it. That file also had two
defects of its own, worth recording because both would have made it a test that
passes while proving nothing:

- It re-implemented the SQL and called itself *"verbatim"*, so when the fix landed
  the test went on exercising a **copy of the bug**. It now reads the `id` expression
  out of the real source and rejects one derived from `userId`.
- Its new concurrency case used a single `pg.Client`, which **serialises** — it warns
  "Calling client.query() when the client is already executing a query" and queues
  the rest. 120 "concurrent" calls were a sequential loop that passed against the
  unfixed code. It now uses a `Pool`.

#### What this does not buy, stated plainly

It does not stop anyone. Someone willing to wait four minutes gets the corpus, and
nothing in this file changes that. What it does is make the naive loop take minutes
instead of seconds, and make it leave a row behind. Attribution — section 3 — is
what actually answers this problem.

### 3. Watermark

The one measure that changes what a leak *is*: it turns "someone leaked my notes"
from a mystery into a name.

- **Visible** footer per reader — deters casual resale on its own.
- **Invisible** marker carrying the reader's id, surviving copy-paste so a
  re-uploaded copy still attributes.
- Both keyed off the user id that `getSession()` already returns.
- **Must land before any note-reading page ships.** Retrofitting a watermark
  across content that has already been rendered once does not attribute the
  copies that were made before it.

### 4. Read ledger

Per-reader volume of content served, so a bulk run is *visible* rather than
theoretical. Not an alerting system — a record that answers "who could have
produced this file?" when something surfaces.

Deliberately the cheapest of the four. It is worth building only because the
watermark's evidence is worthless without a matching access record.

### 5. Terms

A no-redistribution clause, written so it can be enforced rather than merely
quoted.

Being straight about the economics, because this is the part most easily
oversold: **refunding a leaker does not help.** They keep the content and you
take back the money; their position improves. A refund is worth considering only
for the buyer who paid, got value, and later shared it out of a sense of
entitlement. The honest lever is deterrence plus a traceable identity, and the
honest answer at R50 is that enforcement is mostly a cost of goodwill, not a
revenue plan.

---

# ROADMAP — what comes after

Brainstormed 2026-10-15. Two tracks, because they interleave badly: **A is
infrastructure** and everything in **B** depends on it.

---

## Track A — remove the server's Google key (do this first)

**Why it is first:** it is a prerequisite, not a feature. It changes who pays for
model calls, and B is a set of model-calling features.

**The coupling that is easy to miss.** `GOOGLE_GENERATIVE_AI_API_KEY` is not only
the tutor's server default. It is *also* the embedding model:

| Site | What |
| --- | --- |
| `apps/web/src/lib/tutor-model.ts:212` | `google("gemini-3.8-flash")` — the server default |
| `apps/web/src/lib/notes-embedding.ts:39,55` | `google.embedding("gemini-embedding-001")` — the RAG index |

So deleting the key takes out the tutor's server default **and** the embedding
pipeline together. Worth knowing before the deletion, not after. Mitigating
detail: `note_chunks.embedding` is 0/12 in production — the index was never
populated, so nothing user-visible regresses on the embeddings side today.

- [ ] **A1. Remove "Server default (gemini)" from the model picker**
      `model-picker.tsx:172`. The tutor becomes BYOK-only: the reader's own key,
      their own spend, no server exposure. This is also the anti-abuse story — a
      free account cannot drain the owner's quota, which is the same reason the
      AI budget exists, one level up.
- [ ] **A2. Make the absent key a state, not a 500.** Today a missing key throws
      from the provider at call time. It must instead read as "no model
      configured" and render the onboarding below.
- [ ] **A3. A first-run tutorial session, in place of a working default.** This
      is the replacement for the thing being removed, and it is better: the
      reader ends up owning the thing instead of borrowing it. Covers: what a
      key is, getting one from Google AI Studio, pasting it, what it costs them,
      and that the key is sealed at rest and never leaves their own calls.
- [ ] **A4. Delete the key from the account** and confirm the app runs with
      `GOOGLE_GENERATIVE_AI_API_KEY` absent — locally and on Vercel.

---

## Track B — practice, tests, and the foundations they build

The idea: **questions the reader has not seen, feedback that is specific, and a
record of what they are weak at that gets better over time.**

### B1. The question catalogue (the spine)

Everything else is downstream of this, and it is mostly *editorial*, not
engineering. A rolling supply of questions so practice never runs dry.

- [ ] **B1a. The schema.** One `practice_questions` table. The three formats
      below are different enough to warrant different storage for answers, but
      they share enough fields — module, topic, difficulty, tags — that one
      catalogue beats three tables.
- [ ] **B1b. An import path, not an admin UI.** Questions get written somewhere
      and added in batches. A file in the repo, validated on the way in
      (`check-topics.mjs` is the precedent for "validate a content file in
      tests"). An admin UI is a whole product and is not needed at this scale.
- [ ] **B1c. Rolling updates.** Weekly or monthly, a batch lands. The property
      that makes this work: a question's `id` is stable forever, so a reader's
      history never robs when the catalogue is re-imported.

### B2. Three question formats

- [ ] **B2a. Multiple choice.** 4–5 options, one correct.
      *Why first:* the cheapest to author, the cheapest to grade, and the
      **best at exposing a specific misconception** — a distractor is a claim
      about what the reader wrongly believes, and picking it names the
      misconception rather than just the score. That is the highest
      signal-per-second-of-feedback in the whole feature.
- [ ] **B2b. Formal working, typed by the reader, checked word for word.**
      Deviations highlighted red, hover explains *why*.
      *This is the differentiated one and the hardest.* The naive version is a
      string comparison and will be wrong constantly — LaTeX has many correct
      forms. The honest version grades in stages: a structural pass first (does
      a proof exist, is every variable defined, does every line follow), and
      only then the prose. **Build B2b second, not first** — a red-highlighted
      wrong answer is worse than no feedback, because a student who is told
      their correct proof is wrong learns to distrust the tool.
- [ ] **B2c. Application questions, then a full worked solution.** No red ink.
      The feedback is a complete worked answer *for that question*, which is the
      part that teaches — a worked example transfers; a score does not.

### B3. What makes it compound (the actual goal)

- [ ] **B3a. A weakness profile, not a score.** Per-topic accuracy and, once
      B2b lands, per-error-type. The output is "you lose marks on
      quantifier negation" rather than "68%".
- [ ] **B3b. Drive the tutor from it.** The profile steers what the AI tutor
      volunteers unprompted. This is the feature that justifies the rest.
- [ ] **B3c. Spaced repetition** over the questions already got wrong. Only
      meaningful once there is a history; deliberately last.

### B4. Adjacent features wanted in the same era

- [ ] **B4a. Flashcards** — term/definition pairs off the same catalogue.
      Cheap because the catalogue already exists.
- [ ] **B4b. Favourited sections** — a star per lesson. Trivial, and it becomes
      the input to "revise what I starred" in B3c.
- [ ] **B4c. Private notes** — a place to save tutor responses. Nearly free
      (it is the chat history, plus a pin), and it gives the reader a reason to
      keep the transcript that is theirs rather than the app's.

---

## Sequencing, and the honest risk

**Order:** A1–A4, then B1a/B1b, then B2a, then B2c, then B3a/B3b, then B2b.
Flashcards and favourites can be interleaved anywhere once B1a lands.

**The risk worth naming now:** B is a lot of surface area, and B2b in particular
can consume a long time while still being the least certain thing here — grading
open-ended maths rigorously is a research problem wearing a feature's clothes.
If it stalls, it should be *cut*, not half-shipped, because the other two
formats deliver most of the learning value without it.

**Dependencies already in place:** the tutor's streaming endpoint, the AI budget,
the entitlement gate (the practice feature is a paid thing, so it hangs off the
same purchase check as the PDFs), and `note_chunks` as the natural home for
question text that wants to be retrievable by the tutor.

---

## Progress

- [x] Grounded in the code (surfaces, gates, and what exists)
- [x] 1. Baseline measurement — loop is 79 requests, honest burst is 7, gap is 11x
- [x] 2. Read budget on the content path — found and fixed a live 500 in `consumeAiBudget`
- [ ] 3. Watermark
- [ ] 4. Read ledger
- [ ] 5. Terms

Nothing above is committed until its own section is verified. Each section is
verified the way this repo prefers: the artefact is observed, not the exit code.