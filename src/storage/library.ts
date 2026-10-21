/**
 * THE LIBRARY
 * ---------------------------------------------------------------------------
 * The web app's `lib/modules.ts` reads the catalogue out of Postgres and
 * falls back to a bundled array when the database is unreachable. This is
 * that module, with the fallback inverted: on the phone the bundled array IS
 * the source of truth and the local database is a cache of it, refreshed on
 * launch.
 *
 * The same shapes come out of it, so the screens that render a module, its
 * topics or its lessons are the same screens either way.
 */
import { CATALOG, subjectOf, type CatalogModule } from "@/content/module-catalog";
import { MODULE_CONTENT, type Lesson, type ModuleContent } from "@/content/module-content";
import { topicsFor, type ModuleTopic } from "@/content/module-topics";
import { PRACTICE_QUESTIONS } from "@/content/practice-questions";
import type { PracticeQuestion } from "@/content/practice-schema";
import { CONTENT_VERSION, getDatabase, getMeta, setMeta } from "@/storage/database";

export type { CatalogModule, ModuleTopic, Lesson, ModuleContent };

export type ModuleView = {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly priceCents: number;
  readonly hasTrialPdf: boolean;
  readonly status: "available" | "coming-soon";
};

export type PurchaseView = {
  readonly id: string;
  readonly amountCents: number;
  readonly status: "pending" | "paid" | "refunded";
  readonly provider: string;
  readonly createdAt: string;
  readonly code: string;
  readonly name: string;
};

function fromCatalog(): ReadonlyArray<ModuleView> {
  return CATALOG.map((m) => ({
    id: `mod_${m.code}`,
    code: m.code,
    name: m.name,
    description: m.description,
    priceCents: m.priceCents,
    hasTrialPdf: m.hasTrialPdf,
    status: m.status,
  }));
}

/**
 * Seed the local database from the bundled content.
 *
 * Idempotent, and re-runs whenever CONTENT_VERSION moves, so a note added to
 * the app in a later release shows up without the reader doing anything.
 */
export async function seedLibrary(): Promise<void> {
  const db = await getDatabase();
  const seeded = await getMeta("content_version");
  if (seeded === String(CONTENT_VERSION)) return;

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const m of CATALOG) {
      await txn.runAsync(
        `INSERT INTO modules (code, name, description, price_cents, has_trial, status, position)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           price_cents = excluded.price_cents,
           has_trial = excluded.has_trial,
           status = excluded.status`,
        [m.code, m.name, m.description, m.priceCents, m.hasTrialPdf ? 1 : 0, m.status, 0],
      );
    }

    for (const m of CATALOG) {
      const topics = topicsFor(m.code);
      for (let i = 0; i < topics.length; i++) {
        const t = topics[i]!;
        await txn.runAsync(
          `INSERT INTO topics (slug, module_code, title, description, pdf, pages, position)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(slug) DO UPDATE SET
             module_code = excluded.module_code,
             title = excluded.title,
             description = excluded.description,
             pdf = excluded.pdf,
             pages = excluded.pages,
             position = excluded.position`,
          [t.slug, m.code, t.title, t.description, t.pdf, t.pages, i],
        );
      }
    }

    for (const m of CATALOG) {
      const content = MODULE_CONTENT[m.code];
      if (content === undefined) continue;
      for (const lesson of content.lessons) {
        await txn.runAsync(
          `INSERT INTO lessons (id, module_code, n, title, body, points, example)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             module_code = excluded.module_code,
             n = excluded.n,
             title = excluded.title,
             body = excluded.body,
             points = excluded.points,
             example = excluded.example`,
          [
            `${m.code}-${lesson.n}`,
            m.code,
            lesson.n,
            lesson.title,
            lesson.body,
            JSON.stringify(lesson.points ?? []),
            lesson.example === undefined ? null : JSON.stringify(lesson.example),
          ],
        );
      }
    }

    for (const q of PRACTICE_QUESTIONS) {
      await txn.runAsync(
        `INSERT INTO questions (id, format, module_code, topic_slug, difficulty, tags, prompt, spec)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           format = excluded.format,
           module_code = excluded.module_code,
           topic_slug = excluded.topic_slug,
           difficulty = excluded.difficulty,
           tags = excluded.tags,
           prompt = excluded.prompt,
           spec = excluded.spec`,
        [
          q.id,
          q.format,
          q.moduleCode,
          q.topicSlug,
          q.difficulty,
          JSON.stringify(q.tags),
          q.prompt,
          JSON.stringify(q.spec),
        ],
      );
    }
  });

  await setMeta("content_version", String(CONTENT_VERSION));
}

/** Every module, in catalogue order. */
export async function listModules(): Promise<ReadonlyArray<ModuleView>> {
  return fromCatalog();
}

/** One module by its course code, or null if there is no such module. */
export async function getModuleByCode(code: string): Promise<ModuleView | null> {
  return fromCatalog().find((m) => m.code === code.toUpperCase()) ?? null;
}

/**
 * Which modules the reader has bought, as a set of course codes.
 *
 * Only `paid` counts — a pending or refunded row must never unlock the notes.
 */
export async function getOwnedCodes(): Promise<ReadonlySet<string>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ module_code: string }>(
    "SELECT module_code FROM purchases WHERE status = 'paid'",
  );
  return new Set(rows.map((r) => r.module_code));
}

/** A reader's purchases, oldest first. */
export async function listPurchases(): Promise<ReadonlyArray<PurchaseView>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    amount_cents: number;
    status: string;
    provider: string;
    created_at: string;
    module_code: string;
    module_name: string;
  }>(
    `SELECT p.id, p.amount_cents, p.status, p.provider, p.created_at,
            m.code AS module_code, m.name AS module_name
       FROM purchases p
       LEFT JOIN modules m ON m.code = p.module_code
      ORDER BY p.created_at ASC`,
  );
  return rows.map((r) => ({
    id: r.id,
    amountCents: r.amount_cents,
    status: r.status as PurchaseView["status"],
    provider: r.provider,
    createdAt: r.created_at,
    code: r.module_code,
    name: r.module_name,
  }));
}

/** The topics of a module. */
export async function getTopics(code: string): Promise<ReadonlyArray<ModuleTopic>> {
  return topicsFor(code.toUpperCase());
}

/** The lesson plan for a module, or null when the module is not written yet. */
export async function getModuleContent(code: string): Promise<ModuleContent | null> {
  return MODULE_CONTENT[code.toUpperCase()] ?? null;
}

/** Every lesson of a module. */
export async function getLessons(code: string): Promise<ReadonlyArray<Lesson>> {
  return MODULE_CONTENT[code.toUpperCase()]?.lessons ?? [];
}

/** One lesson by its number within a module. */
export async function getLesson(code: string, n: number): Promise<Lesson | null> {
  const lessons = await getLessons(code);
  return lessons.find((l) => l.n === n) ?? null;
}

/** The questions of a module. */
export async function getQuestions(code: string): Promise<ReadonlyArray<PracticeQuestion>> {
  return PRACTICE_QUESTIONS.filter((q) => q.moduleCode === code.toUpperCase());
}

/** Every question in the catalogue. */
export async function getAllQuestions(): Promise<ReadonlyArray<PracticeQuestion>> {
  return PRACTICE_QUESTIONS;
}

/** How many questions a module has. */
export async function countQuestions(code: string): Promise<number> {
  return (await getQuestions(code)).length;
}

/** The subject a module belongs to. */
export { subjectOf };

/**
 * Buy a module.
 *
 * There is no checkout offline — the web app's payment provider needs a
 * network and a server. The action is deliberately labelled as what it is
 * ("unlock") and writes a `paid` purchase row into the local database, which
 * is exactly the row the web app's `getOwnedCodes()` reads. Everything
 * downstream — the dashboard, the module page, the topic gate — is unchanged.
 */
export async function unlockModule(code: string): Promise<void> {
  const db = await getDatabase();
  const mod = fromCatalog().find((m) => m.code === code.toUpperCase());
  if (mod === undefined) return;
  await db.runAsync(
    `INSERT INTO purchases (id, module_code, amount_cents, status, provider, created_at)
     VALUES (?, ?, ?, 'paid', 'local', ?)
     ON CONFLICT(id) DO UPDATE SET status = 'paid'`,
    [
      `pur_${mod.code}`,
      mod.code,
      mod.priceCents,
      new Date().toISOString(),
    ],
  );
}

/** Refund (un-buy) a module. */
export async function releaseModule(code: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM purchases WHERE module_code = ?", [code.toUpperCase()]);
}
