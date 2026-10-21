/**
 * THE NOTES, AND HOW THEY ARE SEARCHED
 * ---------------------------------------------------------------------------
 * The retrieval half of the study partner.
 *
 * WHAT CHANGED
 * ---------------------------------------------------------------------------
 * This used to be the whole tutor: it scored every lesson, topic and
 * practice question against the question's terms, and composed an answer
 * out of the AUTHORED material — the lesson body, its points, its worked
 * example, the topic's description. Deterministic, offline, and honest.
 *
 * It is now the tool the model calls.
 *
 * The web app's tutor has a `search_notes` tool: the model asks for
 * passages, the server runs a vector search over the reader's own notes,
 * and the passages that come back are the only material the model is
 * allowed to use. The same shape works here, with two differences that
 * make it better:
 *
 *   · the search runs ON THE DEVICE, over the notes the app already has,
 *     so the key never leaves the phone and the notes never leave it
 *     either;
 *   · the search is the same term-overlap scoring this file already used,
 *     so there is no embedding model to pay for and no index to keep in
 *     step with the content.
 *
 * The model still writes the answer; the notes still decide what the answer
 * is allowed to say. That is the same bargain the web app strikes, and it
 * is the bargain that makes the tutor worth having.
 */
import { MODULE_CONTENT } from "@/content/module-content";
import { MODULE_TOPICS } from "@/content/module-topics";
import { PRACTICE_QUESTIONS } from "@/content/practice-questions";
import { CATALOG } from "@/content/module-catalog";

/* ------------------------------------------------------------------ *
 *  the index
 * ------------------------------------------------------------------ */

export type Passage = {
  readonly id: string;
  readonly kind: "lesson" | "topic" | "question";
  readonly moduleCode: string;
  readonly moduleName: string;
  readonly title: string;
  /** The lesson number, for lessons. */
  readonly lessonN?: number;
  /** The topic slug, for topics and questions. */
  readonly topicSlug?: string;
  readonly body: string;
  readonly points: ReadonlyArray<string>;
  readonly example?: { caption: string; lines: ReadonlyArray<string> };
  readonly difficulty?: number;
  readonly tags: ReadonlyArray<string>;
};

function buildIndex(): ReadonlyArray<Passage> {
  const out: Passage[] = [];

  for (const module of CATALOG) {
    const content = MODULE_CONTENT[module.code];
    if (content !== undefined) {
      for (const lesson of content.lessons) {
        out.push({
          id: `${module.code}-${lesson.n}`,
          kind: "lesson",
          moduleCode: module.code,
          moduleName: module.name,
          title: lesson.title,
          lessonN: lesson.n,
          body: lesson.body,
          points: lesson.points ?? [],
          example: lesson.example,
          tags: [module.code, module.name, lesson.title],
        });
      }
    }

    const topics = MODULE_TOPICS[module.code] ?? [];
    for (const topic of topics) {
      out.push({
        id: topic.slug,
        kind: "topic",
        moduleCode: module.code,
        moduleName: module.name,
        title: topic.title,
        topicSlug: topic.slug,
        body: topic.description,
        points: [],
        tags: [module.code, module.name, topic.title, topic.slug],
      });
    }
  }

  for (const question of PRACTICE_QUESTIONS) {
    if (question.format !== "multiple-choice") continue;
    const module = CATALOG.find((m) => m.code === question.moduleCode);
    out.push({
      id: question.id,
      kind: "question",
      moduleCode: question.moduleCode,
      moduleName: module?.name ?? question.moduleCode,
      title: question.prompt,
      topicSlug: question.topicSlug,
      body: question.prompt,
      points: [],
      difficulty: question.difficulty,
      tags: [question.moduleCode, ...question.tags],
    });
  }

  return out;
}

const INDEX = buildIndex();

/* ------------------------------------------------------------------ *
 *  scoring
 * ------------------------------------------------------------------ */

/**
 * Words that carry no signal in a study question.
 *
 * A short, honest list. The corpus is small — a few dozen passages — so an
 * aggressive stop list does more harm than good: "limit" and "what" both
 * matter in different questions.
 */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "can",
  "do",
  "does",
  "for",
  "from",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "me",
  "my",
  "not",
  "of",
  "on",
  "or",
  "so",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "to",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "will",
  "with",
  "would",
  "you",
  "your",
]);

export function tokenize(text: string): ReadonlyArray<string> {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\-]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** How many passages mention a term. Used to weight rare terms higher. */
const DOCUMENT_FREQUENCY = (() => {
  const counts = new Map<string, number>();
  for (const passage of INDEX) {
    const seen = new Set(tokenize(`${passage.title} ${passage.body} ${passage.points.join(" ")}`));
    for (const term of seen) {
      counts.set(term, (counts.get(term) ?? 0) + 1);
    }
  }
  return counts;
})();

function rarity(term: string): number {
  const n = DOCUMENT_FREQUENCY.get(term) ?? 0;
  return 1 + Math.log(1 + INDEX.length / (1 + n));
}

function scorePassage(passage: Passage, terms: ReadonlyArray<string>): number {
  const haystack = `${passage.title} ${passage.body} ${passage.points.join(" ")} ${passage.tags.join(" ")}`;
  const lowered = haystack.toLowerCase();
  const bag = new Set(tokenize(haystack));

  let score = 0;
  let hits = 0;
  for (const term of terms) {
    if (bag.has(term)) {
      score += rarity(term);
      hits += 1;
    } else if (lowered.includes(term)) {
      // A partial match is worth something, but less.
      score += rarity(term) * 0.4;
    }
  }
  if (hits === 0) return 0;
  // Reward passages that match MANY of the terms, not just one rare one.
  return score * (1 + hits / terms.length);
}

/* ------------------------------------------------------------------ *
 *  the search
 * ------------------------------------------------------------------ */

/**
 * A passage, as the model is shown it.
 *
 * The web app's tool returns a subject, a heading and the content of each
 * passage, and the model quotes from them. The shape here is the same, with
 * the module code and the lesson number folded into the heading so the
 * model can cite the notes the way a person would: "MATT101, Lesson 3".
 */
export type SearchedPassage = {
  readonly subject: string;
  readonly heading: string;
  readonly content: string;
  /** The module it came from, so the app can show which notes were read. */
  readonly moduleCode: string;
  /** Where in the module, so the reader can open it. */
  readonly lessonN?: number;
  readonly topicSlug?: string;
};

function headingFor(passage: Passage): string {
  if (passage.kind === "lesson") {
    return `${passage.moduleCode} · Lesson ${passage.lessonN} — ${passage.title}`;
  }
  if (passage.kind === "topic") {
    return `${passage.moduleCode} · ${passage.title}`;
  }
  return `${passage.moduleCode} · ${passage.title}`;
}

function contentFor(passage: Passage): string {
  const parts: string[] = [passage.body];
  for (const point of passage.points) {
    parts.push(`· ${point}`);
  }
  if (passage.example !== undefined) {
    parts.push("");
    parts.push(passage.example.caption);
    for (const line of passage.example.lines) {
      parts.push(line);
    }
  }
  return parts.join("\n");
}

/**
 * THE SEARCH.
 *
 * The passages that answer a question, best first.
 *
 * `limit` is the number of passages the model is shown. The web app's
 * vector search returns six; the same number is used here, and for the same
 * reason: enough to answer from, few enough that a model will read them
 * rather than skim.
 */
export function searchPassages(
  query: string,
  limit = 6,
): ReadonlyArray<SearchedPassage> {
  const terms = tokenize(query);
  if (terms.length === 0) return [];

  return INDEX.map((passage) => ({ passage, score: scorePassage(passage, terms) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => ({
      subject: row.passage.moduleName,
      heading: headingFor(row.passage),
      content: contentFor(row.passage),
      moduleCode: row.passage.moduleCode,
      lessonN: row.passage.lessonN,
      topicSlug: row.passage.topicSlug,
    }));
}

/**
 * The prompts the empty tutor screen offers.
 *
 * The web app's starters were written for a model that could answer anything.
 * These are written for one that answers from the notes, so each one names a
 * topic that IS in the notes.
 *
 * Three of them, not six. A phone screen has room for three before the
 * list stops being a set of suggestions and starts being a menu, and the
 * ones that stayed are the ones a reader with a limits problem actually
 * reaches for: what a limit is, how a limit differs from the value at a
 * point, and how bisection decides which half to keep. The chain rule and
 * the p-integral rule are in the notes too, but a reader who wants those
 * will type them.
 */
export const STARTERS: ReadonlyArray<string> = [
  "Explain limits the way I would need them for a first-year calculus exam.",
  "What is the difference between a limit and the value at a point?",
  "How does the bisection method decide which half to keep?",
];

/** A short title for a thread, taken from its first question. */
export function titleFor(question: string): string {
  const trimmed = question.trim().replace(/\s+/g, " ");
  if (trimmed.length <= 60) return trimmed;
  return `${trimmed.slice(0, 57)}…`;
}
