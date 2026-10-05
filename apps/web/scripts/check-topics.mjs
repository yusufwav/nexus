// One-off sanity check on content/module-topics.ts.
// Verifies the two invariants the download route depends on:
//   1. slugs are unique ACROSS all modules (the route scans the whole
//      object, so a collision makes a download URL ambiguous)
//   2. slugs are namespaced by module code, so that stays true when
//      someone adds the next entry
// Run: node scripts/check-topics.mjs
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../src/content/module-topics.ts", import.meta.url), "utf8");

// Only the data body — the header comment contains an example entry
// that would otherwise be counted as a real topic.
const body = src.slice(src.indexOf("export const MODULE_TOPICS"));

const modules = [...body.matchAll(/^ {2}([A-Z]{4}\d{3}): \[/gm)].map((m) => m[1]);
const topics = [...body.matchAll(/slug: "([^"]+)"/g)].map((m) => m[1]);

console.log(`modules: ${modules.length}`);
console.log(`topics:  ${topics.length}`);

// Group each module's own slugs by splitting the body on module headers.
const blocks = body.split(/^ {2}([A-Z]{4}\d{3}): \[/m);
const unnamespaced = [];
for (let i = 1; i < blocks.length; i += 2) {
  const code = blocks[i];
  const chunk = blocks[i + 1];
  for (const m of chunk.matchAll(/slug: "([^"]+)"/g)) {
    if (!m[1].startsWith(code.toLowerCase() + "-")) {
      unnamespaced.push(`${code} -> ${m[1]}`);
    }
  }
}

const seen = new Map();
const dupes = [];
for (const s of topics) {
  if (seen.has(s)) dupes.push(s);
  seen.set(s, true);
}

console.log(`\nduplicate slugs:      ${dupes.length ? [...new Set(dupes)].join(", ") : "none"}`);
console.log(`slugs not namespaced:  ${unnamespaced.length ? unnamespaced.join(", ") : "none"}`);
console.log(`pdf fields non-null:   ${[...body.matchAll(/pdf: (?!null)/g)].length}`);

const bad = dupes.length > 0 || unnamespaced.length > 0;
console.log(bad ? "\nFAIL" : "\nOK");
process.exit(bad ? 1 : 0);