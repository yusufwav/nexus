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

### 2. Read budget on the content path

A DB-backed limiter on the content route, copying `packages/db/src/ai-rate-limit.ts`
rather than inventing a second shape:

- Per-reader, per-window, counter in the database so a restart does not hand
  back a fresh allowance. Same reasoning as the tutor's budget: serverless
  instances are created constantly, so in-memory would make the limit decorative.
- One upsert carrying the whole decision, no read-then-write race.
- **Degrade rather than 429.** A scraper retries a 429 for free. Serving slowed
  or throttled content costs them wall-clock and costs an honest reader nothing.
- Never auto-ban. A false positive punishes a real reader for reading fast, and
  the AI limiter's failure mode of refusing the server key is explicitly not to
  be copied here.

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

## Progress

- [x] Grounded in the code (surfaces, gates, and what exists)
- [x] 1. Baseline measurement — loop is 79 requests, honest burst is 7, gap is 11x
- [ ] 2. Read budget on the content path
- [ ] 3. Watermark
- [ ] 4. Read ledger
- [ ] 5. Terms

Nothing above is committed until its own section is verified. Each section is
verified the way this repo prefers: the artefact is observed, not the exit code.