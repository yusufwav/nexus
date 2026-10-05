# Changing modules, topics and purchases

Everything a module is made of lives in two files, plus one database table.

| What                | Where                                   |
| ------------------- | --------------------------------------- |
| Module list         | `packages/db/src/module-catalog.ts`     |
| Module's topics     | `apps/web/src/content/module-topics.ts` |
| Who paid for what   | `purchases` table                       |
| Free sample PDF     | `apps/web/src/lib/trial-pdf.ts` + `public/` |

Both `.ts` files are plain TypeScript, so editing them is editing code. There
is no admin UI and no database-backed editor. That is deliberate for now — see
`IDEAS/TODO.md`.

---

## The one thing to know first

**`packages/db/src/module-catalog.ts` is the source of truth, but the app
mostly does not read it.**

`apps/web/src/lib/modules.ts` reads the `modules` table first and only falls
back to `module-catalog.ts` when the database returns **zero** rows. So after
editing the catalogue you must also run the seed, or the change will not appear:

```
pnpm db:seed
```

The seed upserts on `code`, so it is safe to run repeatedly and will not
duplicate rows. If `pnpm db:seed` fails on your machine (it currently crashes on
a libuv assertion from the varlock plugin — see `IDEAS/TODO.md`), the fallback
equivalent is to delete the `modules` table rows so the app falls back to the
bundled catalogue.

---

## Renaming a topic, or editing its description

`apps/web/src/content/module-topics.ts`. Find the module's block, edit the
entry:

```ts
MATT101: [
  {
    slug: "matt101-limits",          // ← rename this and the link changes
    title: "Limits and continuity",  // ← the name shown in the row
    description: "Approach rather than substitution…",  // ← hover text
    pdf: null,                       // ← see "Setting a PDF" below
    pages: 14,                       // ← page count, or null for unknown
  },
],
```

**About `slug`:** it appears in the download URL (`/api/topics/<slug>`), so
changing it after you have shared links breaks them. `title` and `description`
are safe to change freely — they never appear in a URL.

**About `pages`:** it is currently invented and will not match the real files.

---

## Setting a PDF for a topic

Two steps.

**1. Put the file in `apps/web/public/topics/`**

```
apps/web/public/topics/matt101-limits.pdf
```

**2. Point the entry at it**

```ts
pdf: "/topics/matt101-limits.pdf",
```

The row's button switches from `coming soon` to `buy R50` (or `download`, if
the user already paid) automatically. Nothing else needs editing.

Use a path starting with `/topics/` — that is the folder the route expects,
and it keeps the naming convention obvious.

### Making a topic buyable vs. free

Topics are gated on their **parent module's purchase**, never on their own.
Paying for MATT101 unlocks all six of its topics; there is no way to buy a
single topic. If you ever want per-topic pricing, the check in
`app/api/topics/[slug]/route.ts` is the seam — it currently tests
`owned.has(moduleCode)` and nothing finer-grained exists.

---

## Adding a module

**1. Add it to `packages/db/src/module-catalog.ts`**

```ts
{
  code: "STAS103",                     // must be unique; also the URL
  name: "Statistics III",
  description: "What you're describing in one line.",
  priceCents: 5000,                    // 5000 = R50
  hasTrialPdf: false,                  // true only if a sample exists
  status: "coming-soon",               // or "available"
},
```

**2. Seed it**

```
pnpm db:seed
```

The module now appears on `/modules` and has a page at `/modules/STAS103`.

**3. Optional: give it topics.** Add a `STAS103: [...]` block to
`module-topics.ts` using the same shape as the others. A module with no topics
renders no topic list at all, which is fine.

**Also update the landing page.** `apps/web/src/app/page.tsx` carries its own
hardcoded copy of the module list as a plain array (`MODULES`, around line 66),
because the landing page is meant to render with no database at all. Edit it
too or the two lists drift. The duplication is deliberate and documented in
`lib/modules.ts`.

---

## Removing a module

There is no delete path in the app. Do it in this order:

1. **Delete its topic block** from `module-topics.ts`.
2. **Delete its entry** from `module-catalog.ts`, and the matching entry in the
   `MODULES` array in `app/page.tsx`.
3. **Delete the DB row:**
   ```sql
   delete from purchases where module_id = 'mod_STAS103';
   delete from modules where code = 'STAS103';
   ```
   The `purchases` rows must go first — they reference `modules.id`, and
   although the foreign key cascades, deleting the explicit rows avoids
   surprising anyone reading the schema later.
4. Run `node scripts/check-topics.mjs` from `apps/web` if it had topics.

---

## Changing a user's paid status

Access is a single database fact: **a row in `purchases` with
`status = 'paid'`.** Nothing else in the app decides whether someone owns a
module.

`getOwnedCodes()` in `lib/modules.ts` reads exactly this, and it counts `paid`
only. A `pending` or `refunded` row unlocks nothing.

### Grant a module (make a test user a paid user)

```sql
insert into purchases (id, user_id, module_id, amount_cents, status, provider)
select 'pur_test_001', u.id, m.id, m.price_cents, 'paid', 'manual'
from "user" u, modules m
where u.email = 'you@example.com' and m.code = 'MATT101'
on conflict (user_id, module_id) do update set status = 'paid';
```

That `on conflict` clause matters: there is a unique index on
`(user_id, module_id)`, so a re-grant updates the existing row rather than
failing.

### Revoke it

```sql
delete from purchases where module_id = 'mod_MATT101' and user_id = (
  select id from "user" where email = 'you@example.com'
);
```

### Check what someone owns

```sql
select m.code, p.status, p.created_at
from purchases p join modules m on m.id = p.module_id
join "user" u on u.id = p.user_id
where u.email = 'you@example.com';
```

### What this changes in the UI

| Situation                          | Topic row shows       |
| ---------------------------------- | --------------------- |
| Topic has no PDF (`pdf: null`)    | `coming soon`         |
| PDF exists, user signed out        | `buy R50`             |
| PDF exists, signed in, not paid    | `buy R50` (disabled)  |
| PDF exists, paid                   | `download`            |

The module page also shows an `in your account` badge when the user owns it,
and the catalogue shows `owned · open` instead of the buy control.

---

## Switching a module between available and coming-soon

In `module-catalog.ts`, set `status` to `"available"` or `"coming-soon"`, then
run `pnpm db:seed`. Flip `hasTrialPdf` to `true` at the same time if you have
written the sample — the catalogue shows a `sample` marker based on it.

---

## Gotchas

- **Topic slugs must be unique across every module, not just within one.**
  `app/api/topics/[slug]/route.ts` resolves a slug by scanning the entire
  registry, so two modules claiming `integration` would make the download URL
  ambiguous and whichever came second would win. Every slug is prefixed with
  its module code for this reason. `node scripts/check-topics.mjs` (from
  `apps/web`) asserts it and exits non-zero if you break it.
- **Topic PDFs in `/public` are fetchable by anyone** who guesses the
  filename. `/api/topics/<slug>` is the gated way in, but it is not the only
  way. This changes once real notes exist and they move to private storage.
- **A paid user can download every topic on a module they bought** with six
  scripted GETs. That matches what they paid for, but it means per-topic
  pricing would need watermarking or signed per-request URLs first.
- **`module-content.ts` is separate.** It holds the long-form lesson text that
  used to live on the module page. Only MATT101 has an entry; the dashboard
  pages still read it for section counts.