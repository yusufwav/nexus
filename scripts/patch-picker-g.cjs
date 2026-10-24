const fs = require("node:fs");

/* ------------------------------------------------------------------ *
 * the npm script
 * ------------------------------------------------------------------ */
{
  const f = "package.json";
  const pkg = JSON.parse(fs.readFileSync(f, "utf8"));
  pkg.scripts["preview-picker"] = "node scripts/preview-picker.mjs";
  fs.writeFileSync(f, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
  console.log("ok package.json");
}

/* ------------------------------------------------------------------ *
 * the decision
 * ------------------------------------------------------------------ */
{
  const file = "C:/Users/yusuf/orca/mobile projects/Nexus/orchestrator/decisions.md";
  let b = fs.readFileSync(file, "utf8");

  const entry = `
## 2026-10-21 — A picker can group its options, so a list of lists is a list of lists
**Agent:** frontend
**Decision:** \`Select\` takes an optional list of GROUPS as well as a flat list of options. A group's heading opens to show what is under it, and the heading is what the reader sees when the group is closed. The tutor's model picker uses it: a group is a provider, and a provider's models collapse into the provider's name until it is opened.
**Because:** The models a reader can choose come from several providers, and a flat list of them loses where each one came from — two providers list the same model id, so the tick lands on two rows and a choice cannot be qualified. The rejected alternatives were a flat list with the provider in each row's detail line (which is the same list, only noisier) and a separate picker per provider (which is two dropdowns where the reader has to know which one to open).
**Costs:** The groups are a second mode for one component, so \`Select\` carries two ways of listing things. The tutor also has to keep each provider's models in a cache and fetch them when a heading is opened, because asking every provider at once is a request per provider for a list the reader may never look at.
**Touches:** \`src/components/ui.tsx\` (\`Select\`, \`SelectGroup\`), \`src/app/(tabs)/tutor.tsx\`, \`src/lib/model-picker.ts\` (new), \`src/components/icons.tsx\` (\`chevronDown\`), \`scripts/preview-picker.mjs\` (new).
`;

  if (!b.includes("A picker can group its options")) {
    const eol = b.includes("\r\n") ? "\r\n" : "\n";
    b = b.replace(/\s*$/, "\n") + entry.replace(/\n/g, eol);
    fs.writeFileSync(file, b, "utf8");
    console.log("ok decisions.md");
  } else {
    console.log("the decision is already there");
  }
}
