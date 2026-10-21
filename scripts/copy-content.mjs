/**
 * CONTENT COPY
 * ---------------------------------------------------------------------------
 * The web app's editorial content — the topic breakdown, the lesson plan and
 * the practice-question catalogue — is data, not code, and it has to be
 * IDENTICAL in the mobile app. Re-typing it would guarantee drift.
 *
 * So it is copied out of the web app by this script instead:
 *
 *   node scripts/copy-content.mjs
 *
 * The copied files are committed, so the mobile app builds without the web
 * app present.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

const WEB = "C:/Users/yusuf/orca/projects/nexus/apps/web/src";
const OUT_DIR = join(process.cwd(), "src/content");
const GL_DIR = join(process.cwd(), "src/components/dom");

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(GL_DIR, { recursive: true });

function copy(from, to) {
  const body = readFileSync(join(WEB, from), "utf8");
  const target = join(process.cwd(), to);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body, "utf8");
  console.log(`copied ${from} -> ${to}`);
}
copy("content/module-topics.ts", "src/content/module-topics.ts");
copy("content/module-content.ts", "src/content/module-content.ts");
copy("components/landing/pixel-blast-core.ts", "src/components/dom/pixel-blast-core.ts");

/**
 * The practice catalogue.
 *
 * The web file is a zod-validated array. The mobile app validates with its
 * own hand-written validator (no zod dependency in a React Native bundle),
 * so only the RAW_QUESTIONS block is lifted out and the schema import and
 * the trailing `satisfies`/`parse` are rewritten.
 */
const practice = readFileSync(join(WEB, "content/practice-questions.ts"), "utf8");
const start = practice.indexOf("const RAW_QUESTIONS = [");
const end = practice.indexOf("] as const satisfies ReadonlyArray<PracticeQuestion>;");
if (start === -1 || end === -1) {
  throw new Error("could not locate RAW_QUESTIONS in the web practice-questions.ts");
}
const raw = practice.slice(start, end + 1).replace(
  "const RAW_QUESTIONS = [",
  "const RAW_QUESTIONS: RawQuestion[] = [",
);

const header = `/**
 * PRACTICE QUESTIONS — the catalogue
 * ---------------------------------------------------------------------------
 * PORTED FROM THE WEB APP — apps/web/src/content/practice-questions.ts
 *
 * The question bodies are lifted verbatim by scripts/copy-content.mjs. The
 * web app validates them with zod; the mobile app validates them with the
 * hand-written validator in practice-schema.ts, which enforces the same
 * invariants. Nothing about a question's text, its options, its
 * explanations or its difficulty has changed.
 *
 * WHY A FILE AND NOT AN ADMIN UI: the questions are editorial. Someone
 * writes them, and the review that matters is "is this maths correct",
 * which a human does by reading — not through a form.
 *
 * IDs ARE STABLE FOREVER. A reader's history is a list of these strings.
 */

import {
  parsePracticeQuestion,
  type PracticeQuestion,
  type RawQuestion,
} from "@/content/practice-schema";

`;

const footer = `
/**
 * THE CATALOGUE, validated at module load.
 *
 * Deliberately not a plain export: a malformed question throws HERE,
 * which means it fails the build, rather than throwing at grade time and
 * costing a reader marks.
 */
export const PRACTICE_QUESTIONS: ReadonlyArray<PracticeQuestion> = RAW_QUESTIONS.map(
  (raw, index) => {
    try {
      return parsePracticeQuestion(raw);
    } catch (err) {
      throw new Error(
        \`practice question at index \${index} is invalid: \${(err as Error).message}\`,
      );
    }
  },
);
`;

writeFileSync(join(OUT_DIR, "practice-questions.ts"), header + raw + footer, "utf8");
console.log("copied content/practice-questions.ts -> src/content/practice-questions.ts");
